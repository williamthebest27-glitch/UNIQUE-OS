-- ═══════════════════════════════════════════════════════════════════
-- Il gestionale
--
-- Fin qui Unique OS leggeva l'agenda di un gestionale esterno. Da qui
-- la tiene: anagrafica, appuntamenti con la stanza, incassi al banco,
-- membership attivate in sede. Non un secondo prodotto — le stesse
-- tabelle, con i permessi per chi lavora all'accoglienza.
--
-- Quasi tutto esisteva già. Quello che mancava era piccolo e preciso:
-- una stanza sull'appuntamento, il diritto della reception di creare
-- un paziente e registrare un incasso, e una funzione per attivare una
-- membership senza dover toccare tre tabelle a mano.
-- ═══════════════════════════════════════════════════════════════════

-- ── La stanza sull'appuntamento ───────────────────────────────────
-- Le stanze esistevano per il calcolo della capacità, ma nessun
-- appuntamento sapeva dove si svolgeva. Senza, due visite nella stessa
-- stanza alla stessa ora sono un problema che si scopre in corridoio.
alter table public.appointments
  add column if not exists room_id uuid references public.rooms (id) on delete set null;

create index if not exists appointments_by_room
  on public.appointments (room_id, starts_at)
  where room_id is not null;

-- Chi ha creato l'appuntamento, quando non è il paziente da solo.
alter table public.appointments
  add column if not exists created_by uuid references public.profiles (id) on delete set null;

-- ── La reception crea pazienti ────────────────────────────────────
/*
 * L'anagrafica nasce al banco. La riga di `patients` la scrive la
 * reception; il profilo sotto lo crea il server con la chiave
 * privilegiata, perché un paziente è anche un utente e gli utenti li
 * crea solo il sistema di autenticazione.
 */
create policy patients_reception_insert on public.patients
  for insert with check (public.is_reception() and public.location_in_scope(location_id));

-- La reception aggiorna anche i recapiti del profilo del paziente.
create policy profiles_reception_update on public.profiles
  for update using (public.is_reception() and public.profile_visible_to_reception(id))
  with check (public.is_reception() and public.profile_visible_to_reception(id));

-- ── Gli incassi al banco ──────────────────────────────────────────
/*
 * Un pagamento registrato in sede è un incasso: contanti, POS, bonifico.
 * La reception lo scrive e lo può correggere finché non è marcato
 * pagato; da lì in poi lo corregge l'amministrazione, perché un incasso
 * "pagato" che sparisce è un buco di cassa.
 */
create type payment_channel as enum ('cash', 'pos', 'bank_transfer', 'online', 'other');

alter table public.payments
  add column if not exists channel payment_channel,
  add column if not exists appointment_id uuid references public.appointments (id) on delete set null,
  add column if not exists recorded_by uuid references public.profiles (id) on delete set null,
  -- Numero progressivo della ricevuta, assegnato al momento dell'incasso.
  add column if not exists receipt_no text;

create unique index if not exists payments_receipt_no
  on public.payments (receipt_no) where receipt_no is not null;

create policy payments_reception_insert on public.payments
  for insert with check (public.is_reception());

create policy payments_reception_update on public.payments
  for update using (public.is_reception() and status <> 'paid')
  with check (public.is_reception());

/*
 * Il numero di ricevuta.
 *
 * Progressivo per anno, senza buchi e senza doppioni anche se due
 * persone incassano nello stesso secondo: il lock sulla sequenza
 * dell'anno lo garantisce. La forma è UNQ-2026-000123.
 */
create table public.receipt_counters (
  year    integer primary key,
  last_no integer not null default 0
);

alter table public.receipt_counters enable row level security;
create policy receipt_counters_staff on public.receipt_counters
  for all using (public.is_staff() or public.is_reception())
  with check (public.is_staff() or public.is_reception());

create or replace function public.next_receipt_no()
returns text
language plpgsql
security definer
set search_path = public
as $fn$
declare
  v_year integer := extract(year from now())::integer;
  v_no   integer;
begin
  insert into public.receipt_counters (year, last_no) values (v_year, 0)
  on conflict (year) do nothing;

  update public.receipt_counters
     set last_no = last_no + 1
   where year = v_year
   returning last_no into v_no;

  return 'UNQ-' || v_year || '-' || lpad(v_no::text, 6, '0');
end;
$fn$;

/*
 * Registrare un incasso.
 *
 * Una funzione e non un insert, per due ragioni: il numero di ricevuta
 * va preso dentro la stessa transazione, e la riga deve nascere già
 * "pagata" con la data — un incasso registrato al banco non è in
 * attesa di niente.
 */
create or replace function public.record_payment(
  p_patient     uuid,
  p_amount_cents integer,
  p_kind        payment_kind,
  p_channel     payment_channel,
  p_description text default null,
  p_appointment uuid default null,
  p_membership  uuid default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $fn$
declare
  v_id uuid;
begin
  if not (public.is_staff() or public.is_reception()) then
    raise exception 'Solo la reception o la direzione registrano un incasso.';
  end if;
  if p_amount_cents <= 0 then
    raise exception 'Un incasso è un importo positivo.';
  end if;

  insert into public.payments
    (patient_id, kind, status, amount_cents, description, appointment_id, membership_id,
     channel, paid_at, recorded_by, receipt_no, attempts)
  values
    (p_patient, p_kind, 'paid', p_amount_cents, p_description, p_appointment, p_membership,
     p_channel, now(), auth.uid(), public.next_receipt_no(), 1)
  returning id into v_id;

  return v_id;
end;
$fn$;

-- ── Attivare una membership in sede ───────────────────────────────
/*
 * Tre tabelle in una mossa: la membership, i crediti che assegna, e —
 * se pagata al banco — l'incasso. Farlo a mano significava farlo in tre
 * schermate, e dimenticare i crediti nella seconda.
 *
 * Una membership attiva per lo stesso paziente non si sovrappone: se ce
 * n'è una in corso, questa la sostituisce chiudendola il giorno prima.
 */
create or replace function public.activate_membership(
  p_patient   uuid,
  p_tier      uuid,
  p_starts_on date default current_date,
  p_paid_cents integer default null,
  p_channel   payment_channel default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $fn$
declare
  v_tier record;
  v_id   uuid;
  v_ends date;
begin
  if not (public.is_staff() or public.is_reception()) then
    raise exception 'Solo la reception o la direzione attivano una membership.';
  end if;

  select * into v_tier from public.membership_tiers where id = p_tier and is_active;
  if v_tier is null then
    raise exception 'Piano non trovato o non attivo.';
  end if;

  v_ends := case v_tier.billing_period
    when 'month' then p_starts_on + interval '1 month'
    else p_starts_on + interval '1 year'
  end;

  update public.memberships
     set status = 'cancelled', is_active = false, cancelled_at = now(),
         ends_on = least(coalesce(ends_on, p_starts_on - 1), p_starts_on - 1)
   where patient_id = p_patient and status = 'active';

  insert into public.memberships
    (patient_id, tier_id, starts_on, ends_on, renews_on, is_active, status, activated_at)
  values
    (p_patient, p_tier, p_starts_on, v_ends, v_ends, true, 'active', now())
  returning id into v_id;

  -- I crediti del piano, come movimento del registro: il saldo è la somma.
  insert into public.credit_entries
    (patient_id, entry_type, amount, description, membership_id, created_by)
  values
    (p_patient, 'grant', v_tier.credits_included, 'Crediti del piano ' || v_tier.name, v_id, auth.uid());

  if p_paid_cents is not null and p_paid_cents > 0 then
    perform public.record_payment(
      p_patient, p_paid_cents, 'membership', coalesce(p_channel, 'other'),
      'Membership ' || v_tier.name, null, v_id
    );
  end if;

  return v_id;
end;
$fn$;
