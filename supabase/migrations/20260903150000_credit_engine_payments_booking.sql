-- ═══════════════════════════════════════════════════════════════════
-- Credit engine, pagamenti, prenotazioni
-- ═══════════════════════════════════════════════════════════════════

-- ── Catalogo servizi ──────────────────────────────────────────────
create table public.services (
  id            uuid primary key default gen_random_uuid(),
  slug          text unique not null,
  name          text not null,
  description   text,
  credits_cost  numeric(10, 2) not null default 0 check (credits_cost >= 0),
  duration_min  integer not null default 60,
  discipline    professional_discipline,
  is_active     boolean not null default true,
  external_ref  text,
  created_at    timestamptz not null default now()
);

alter table public.services enable row level security;

-- Il listino è pubblico fra gli autenticati: il paziente deve sapere
-- quanto costa una visita prima di prenotarla.
create policy services_select on public.services
  for select using (is_active or public.is_staff());

create policy services_staff_write on public.services
  for all using (public.is_staff()) with check (public.is_staff());

insert into public.services (slug, name, credits_cost, duration_min, discipline) values
  ('consulenza-longevity',  'Consulenza longevity',        1, 60, 'physician'),
  ('visita-nutrizionale',   'Visita nutrizionale',         1, 45, 'nutritionist'),
  ('osteopatia',            'Seduta di osteopatia',        1, 50, 'osteopath'),
  ('psicologia',            'Colloquio psicologico',       1, 50, 'psychologist'),
  ('body-scan',             'Body scan e composizione',    1, 30, 'nurse'),
  ('test-da-sforzo',        'Test da sforzo',              2, 60, 'physician'),
  ('iv-therapy',            'IV Therapy',                  2, 45, 'nurse')
on conflict (slug) do nothing;

-- ── Appuntamenti: esito, disdetta, provenienza ────────────────────
create type attendance_status as enum ('pending', 'attended', 'no_show');

alter table public.appointments
  add column if not exists service_id     uuid references public.services (id) on delete set null,
  add column if not exists attendance     attendance_status not null default 'pending',
  add column if not exists cancelled_at   timestamptz,
  add column if not exists cancelled_by   uuid references public.profiles (id) on delete set null,
  add column if not exists cancel_reason  text,
  -- Unique OS non deve sostituire subito il gestionale: deve saperne
  -- leggere gli appuntamenti. `source` dice chi è la fonte di verità di
  -- quella riga, `external_ref` la ricollega al sistema d'origine.
  add column if not exists source         text not null default 'unique_os',
  add column if not exists external_ref   text;

create unique index if not exists appointments_external_ref
  on public.appointments (external_ref)
  where external_ref is not null;

-- ── Disponibilità ─────────────────────────────────────────────────
-- Gli slot possono arrivare dal gestionale esterno o essere creati qui.
create table public.availability_slots (
  id              uuid primary key default gen_random_uuid(),
  professional_id uuid not null references public.professionals (id) on delete cascade,
  service_id      uuid references public.services (id) on delete set null,
  starts_at       timestamptz not null,
  ends_at         timestamptz not null,
  is_booked       boolean not null default false,
  appointment_id  uuid references public.appointments (id) on delete set null,
  source          text not null default 'unique_os',
  external_ref    text,
  created_at      timestamptz not null default now(),
  check (ends_at > starts_at)
);

create index slots_open
  on public.availability_slots (starts_at)
  where is_booked = false;

create unique index slots_external_ref
  on public.availability_slots (external_ref)
  where external_ref is not null;

alter table public.availability_slots enable row level security;

-- Le disponibilità future sono visibili a chi è autenticato: servono al
-- paziente per prenotare.
create policy slots_select on public.availability_slots
  for select using (true);

create policy slots_staff_write on public.availability_slots
  for all using (public.is_staff()) with check (public.is_staff());

-- ── Credit engine ─────────────────────────────────────────────────
/*
 * Il credito ha tre stati: disponibile, prenotato, utilizzato.
 *
 *   prenotazione   disponibile → prenotato
 *   visita svolta  prenotato   → utilizzato
 *   disdetta       prenotato   → disponibile
 *
 * Ogni passaggio è una riga del registro, mai un aggiornamento: lo
 * storico delle modifiche è il registro stesso, non una tabella a parte
 * che qualcuno deve ricordarsi di scrivere.
 */

-- I due tipi nuovi non si possono aggiungere all'enum esistente e usare
-- nella stessa transazione. Si crea il tipo completo e si converte.
create type credit_entry_kind as enum (
  'purchase', 'grant', 'consumption', 'refund', 'expiry', 'adjustment',
  'reservation', 'reservation_release'
);

alter table public.credit_entries
  alter column entry_type type credit_entry_kind
  using entry_type::text::credit_entry_kind;

drop type credit_entry_type;

-- Una correzione manuale senza motivo scritto non è una correzione,
-- è un buco nel registro.
alter table public.credit_entries
  drop constraint if exists credit_adjustment_needs_reason;

alter table public.credit_entries
  add constraint credit_adjustment_needs_reason
  check (
    entry_type <> 'adjustment'
    or (description is not null and length(btrim(description)) >= 3)
  );

/*
 * Regola di disdetta.
 *
 * Entro la soglia il credito torna disponibile; oltre, e in caso di
 * mancata presentazione, viene addebitato. È la regola operativa della
 * clinica: cambiarla qui la cambia ovunque.
 */
create or replace function public.credit_cancellation_hours()
returns integer language sql immutable as $fn$ select 24 $fn$;

create or replace function public.credit_engine_sync()
returns trigger
language plpgsql
security definer
set search_path = public
as $fn$
declare
  v_cost numeric(10, 2) := coalesce(new.credits_cost, 0);
  v_late boolean;
begin
  if v_cost <= 0 then
    return new;
  end if;

  -- Nuovo appuntamento in agenda: il credito passa da disponibile a prenotato.
  if tg_op = 'INSERT' then
    if new.status in ('scheduled', 'confirmed') then
      insert into public.credit_entries
        (patient_id, entry_type, amount, description, appointment_id)
      values (new.patient_id, 'reservation', -v_cost,
              'Prenotazione: ' || new.service_name, new.id);
    end if;
    return new;
  end if;

  if old.status is not distinct from new.status then
    return new;
  end if;

  -- Visita svolta: il prenotato si libera e diventa utilizzato.
  if new.status = 'completed' and old.status in ('scheduled', 'confirmed') then
    insert into public.credit_entries
      (patient_id, entry_type, amount, description, appointment_id)
    values
      (new.patient_id, 'reservation_release', v_cost,
       'Visita svolta: ' || new.service_name, new.id),
      (new.patient_id, 'consumption', -v_cost,
       new.service_name, new.id);

  -- Mancata presentazione: il credito è dovuto lo stesso.
  elsif new.status = 'no_show' and old.status in ('scheduled', 'confirmed') then
    insert into public.credit_entries
      (patient_id, entry_type, amount, description, appointment_id)
    values
      (new.patient_id, 'reservation_release', v_cost,
       'Mancata presentazione: ' || new.service_name, new.id),
      (new.patient_id, 'consumption', -v_cost,
       new.service_name || ' (mancata presentazione)', new.id);

  -- Disdetta: dentro la soglia il credito torna, fuori viene addebitato.
  elsif new.status = 'cancelled' and old.status in ('scheduled', 'confirmed') then
    v_late := now() > (new.starts_at - make_interval(hours => public.credit_cancellation_hours()));

    if v_late then
      insert into public.credit_entries
        (patient_id, entry_type, amount, description, appointment_id)
      values
        (new.patient_id, 'reservation_release', v_cost,
         'Disdetta tardiva: ' || new.service_name, new.id),
        (new.patient_id, 'consumption', -v_cost,
         new.service_name || ' (disdetta oltre i termini)', new.id);
    else
      insert into public.credit_entries
        (patient_id, entry_type, amount, description, appointment_id)
      values (new.patient_id, 'reservation_release', v_cost,
              'Disdetta: ' || new.service_name, new.id);
    end if;

  -- Riprogrammazione di un appuntamento chiuso: si prenota di nuovo.
  elsif new.status in ('scheduled', 'confirmed')
        and old.status in ('cancelled', 'no_show', 'completed') then
    insert into public.credit_entries
      (patient_id, entry_type, amount, description, appointment_id)
    values (new.patient_id, 'reservation', -v_cost,
            'Riprogrammazione: ' || new.service_name, new.id);
  end if;

  return new;
end;
$fn$;

create trigger appointments_credit_engine
  after insert or update on public.appointments
  for each row execute function public.credit_engine_sync();

/*
 * Saldi, ricalcolati dal solo registro.
 *
 * Prima i prenotati venivano dedotti dagli appuntamenti futuri. Andava
 * bene per mostrarli, non per governarli: senza righe non c'era storico
 * dei passaggi, e una disdetta tardiva non poteva addebitare nulla.
 *
 * Come nella migrazione precedente: eliminata e ricreata, perché
 * `create or replace view` non sa rinominare né riordinare le colonne.
 */
drop view if exists public.credit_balances;

create view public.credit_balances
with (security_invoker = true) as
with ledger as (
  select
    patient_id,
    coalesce(sum(amount) filter (
      where entry_type in ('purchase', 'grant', 'refund', 'adjustment', 'expiry')
    ), 0) as granted,
    coalesce(-sum(amount) filter (where entry_type = 'consumption'), 0) as used,
    coalesce(-sum(amount) filter (
      where entry_type in ('reservation', 'reservation_release')
    ), 0) as reserved
  from public.credit_entries
  group by patient_id
)
select
  p.id                       as patient_id,
  coalesce(l.granted, 0)     as total_credited,
  coalesce(l.used, 0)        as total_used,
  coalesce(l.reserved, 0)    as total_reserved,
  coalesce(l.granted, 0) - coalesce(l.used, 0) as balance,
  coalesce(l.granted, 0) - coalesce(l.used, 0) - coalesce(l.reserved, 0) as available
from public.patients p
left join ledger l on l.patient_id = p.id;

comment on view public.credit_balances is
  'Crediti assegnati, utilizzati, prenotati e disponibili, ricalcolati dal registro.';

-- ── Pagamenti ─────────────────────────────────────────────────────
create type payment_status as enum (
  'pending', 'paid', 'failed', 'refunded', 'cancelled'
);

create type payment_kind as enum (
  'membership', 'membership_renewal', 'service', 'package', 'upgrade', 'extra'
);

/*
 * Metodi di pagamento.
 *
 * Qui non entrano numeri di carta, scadenze complete o CVV: solo ciò che
 * serve a riconoscere la carta e il riferimento al gestore dei pagamenti,
 * che è attrezzato e certificato per custodire il resto. Il mese e l'anno
 * di scadenza servono a un solo scopo: avvisare prima che scada.
 */
create table public.payment_methods (
  id           uuid primary key default gen_random_uuid(),
  patient_id   uuid not null references public.patients (id) on delete cascade,
  brand        text,
  last4        text check (last4 is null or last4 ~ '^[0-9]{4}$'),
  exp_month    smallint check (exp_month is null or exp_month between 1 and 12),
  exp_year     smallint check (exp_year is null or exp_year between 2020 and 2100),
  is_default   boolean not null default true,
  external_ref text,
  created_at   timestamptz not null default now()
);

create index payment_methods_by_patient
  on public.payment_methods (patient_id, is_default desc);

create table public.payments (
  id           uuid primary key default gen_random_uuid(),
  patient_id   uuid not null references public.patients (id) on delete cascade,
  kind         payment_kind not null,
  status       payment_status not null default 'pending',
  amount_cents integer not null,
  currency     text not null default 'EUR',
  description  text,
  membership_id uuid references public.memberships (id) on delete set null,
  method_id    uuid references public.payment_methods (id) on delete set null,
  due_on       date,
  paid_at      timestamptz,
  failed_at    timestamptz,
  failure_reason text,
  attempts     integer not null default 0,
  external_ref text,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

create index payments_by_patient on public.payments (patient_id, created_at desc);
create index payments_open on public.payments (status, due_on) where status in ('pending', 'failed');

create trigger payments_touch before update on public.payments
  for each row execute function public.touch_updated_at();

alter table public.payment_methods enable row level security;
alter table public.payments        enable row level security;

create policy payment_methods_select on public.payment_methods
  for select using (public.can_access_patient(patient_id));

-- Il paziente gestisce i propri metodi di pagamento: è ciò che la
-- visione chiede, e non richiede di vedere alcun dato sensibile.
create policy payment_methods_own on public.payment_methods
  for all using (patient_id = public.my_patient_id() or public.is_staff())
  with check (patient_id = public.my_patient_id() or public.is_staff());

create policy payments_select on public.payments
  for select using (public.can_access_patient(patient_id));

create policy payments_staff_write on public.payments
  for all using (public.is_staff()) with check (public.is_staff());

-- ── Avvisi all'amministrazione ────────────────────────────────────
-- Carta scaduta, pagamento fallito, membership in scadenza, pagamento
-- recuperato, disdetta: cose che qualcuno in Unique deve vedere.
create or replace function public.notify_staff(
  p_title text,
  p_body  text,
  p_link  text default null
)
returns integer
language plpgsql
security definer
set search_path = public
as $fn$
declare
  v_count integer;
begin
  insert into public.notifications (profile_id, title, body, link_url)
  select id, p_title, p_body, p_link
  from public.profiles
  where role in ('admin', 'owner');

  get diagnostics v_count = row_count;
  return v_count;
end;
$fn$;

-- Un pagamento che fallisce o che rientra non deve dipendere da qualcuno
-- che se ne accorge: l'avviso parte da solo.
create or replace function public.payment_alert()
returns trigger
language plpgsql
security definer
set search_path = public
as $fn$
declare
  v_name text;
begin
  if tg_op = 'UPDATE' and old.status is not distinct from new.status then
    return new;
  end if;

  select pr.full_name into v_name
  from public.patients pa
  join public.profiles pr on pr.id = pa.profile_id
  where pa.id = new.patient_id;

  if new.status = 'failed' then
    perform public.notify_staff(
      'Pagamento fallito',
      coalesce(v_name, 'Paziente') || ' — ' ||
        to_char(new.amount_cents / 100.0, 'FM999G999D00') || ' ' || new.currency ||
        coalesce(': ' || new.failure_reason, ''),
      '/pro'
    );
  elsif new.status = 'paid' and tg_op = 'UPDATE' and old.status = 'failed' then
    perform public.notify_staff(
      'Pagamento recuperato',
      coalesce(v_name, 'Paziente') || ' — incasso andato a buon fine al tentativo ' ||
        new.attempts,
      '/pro'
    );
  end if;

  return new;
end;
$fn$;

create trigger payments_alert
  after insert or update on public.payments
  for each row execute function public.payment_alert();

/*
 * Controllo periodico: carte in scadenza e membership che stanno per
 * finire. Da eseguire una volta al giorno (pg_cron o job esterno):
 *   select public.run_billing_checks();
 */
create or replace function public.run_billing_checks()
returns integer
language plpgsql
security definer
set search_path = public
as $fn$
declare
  v_alerts integer := 0;
  r record;
begin
  -- Carte scadute o in scadenza entro il mese.
  for r in
    select pm.id, pm.brand, pm.last4, pm.exp_month, pm.exp_year, pr.full_name
    from public.payment_methods pm
    join public.patients pa on pa.id = pm.patient_id
    join public.profiles pr on pr.id = pa.profile_id
    where pm.is_default
      and pm.exp_year is not null
      and make_date(pm.exp_year, pm.exp_month, 1) < (current_date + interval '31 days')
  loop
    perform public.notify_staff(
      'Carta in scadenza',
      coalesce(r.full_name, 'Paziente') || ' — ' || coalesce(r.brand, 'carta') ||
        ' ···· ' || coalesce(r.last4, '????') || ', scadenza ' ||
        lpad(r.exp_month::text, 2, '0') || '/' || r.exp_year,
      '/pro'
    );
    v_alerts := v_alerts + 1;
  end loop;

  -- Membership in scadenza entro trenta giorni.
  for r in
    select m.id, m.ends_on, pr.full_name
    from public.memberships m
    join public.patients pa on pa.id = m.patient_id
    join public.profiles pr on pr.id = pa.profile_id
    where m.is_active
      and m.status = 'active'
      and m.ends_on is not null
      and m.ends_on between current_date and (current_date + 30)
  loop
    perform public.notify_staff(
      'Membership in scadenza',
      coalesce(r.full_name, 'Paziente') || ' — scade il ' || to_char(r.ends_on, 'DD/MM/YYYY'),
      '/pro'
    );
    v_alerts := v_alerts + 1;
  end loop;

  return v_alerts;
end;
$fn$;

-- Disdetta di una membership: l'amministrazione va avvisata.
create or replace function public.membership_alert()
returns trigger
language plpgsql
security definer
set search_path = public
as $fn$
declare
  v_name text;
begin
  if old.status is not distinct from new.status then
    return new;
  end if;

  if new.status in ('cancelled', 'expired') then
    select pr.full_name into v_name
    from public.patients pa
    join public.profiles pr on pr.id = pa.profile_id
    where pa.id = new.patient_id;

    perform public.notify_staff(
      case new.status when 'cancelled' then 'Membership disdetta' else 'Membership scaduta' end,
      coalesce(v_name, 'Paziente'),
      '/pro'
    );
  end if;

  return new;
end;
$fn$;

create trigger memberships_alert
  after update on public.memberships
  for each row execute function public.membership_alert();

-- ── Prenotare e disdire ───────────────────────────────────────────
/*
 * Prenotazione e disdetta passano da due funzioni, non da una update
 * libera sulla tabella.
 *
 * Una policy che permettesse al paziente di aggiornare il proprio
 * appuntamento gli permetterebbe di cambiarne anche il servizio o il
 * costo in crediti. Qui l'autorizzazione si controlla in cima e si
 * toccano solo le colonne che devono cambiare.
 */
create or replace function public.book_slot(p_slot uuid)
returns uuid
language plpgsql
security definer
set search_path = public
as $fn$
declare
  v_patient    uuid;
  v_slot       record;
  v_service    record;
  v_available  numeric(10, 2);
  v_appt       uuid;
  v_pro_name   text;
begin
  v_patient := public.my_patient_id();
  if v_patient is null then
    raise exception 'Solo un paziente puo prenotare per se stesso.';
  end if;

  select * into v_slot from public.availability_slots where id = p_slot for update;
  if v_slot is null then
    raise exception 'Disponibilita non trovata.';
  end if;
  if v_slot.is_booked then
    raise exception 'Questa disponibilita e gia stata presa.';
  end if;
  if v_slot.starts_at <= now() then
    raise exception 'Non si prenota nel passato.';
  end if;

  select * into v_service from public.services where id = v_slot.service_id;
  if v_service is null then
    raise exception 'Servizio non associato alla disponibilita.';
  end if;

  -- I crediti prenotati non sono disponibili: il controllo va fatto su
  -- quelli realmente liberi, altrimenti si prenota due volte lo stesso.
  select available into v_available from public.credit_balances where patient_id = v_patient;

  if coalesce(v_available, 0) < v_service.credits_cost then
    raise exception 'Crediti disponibili insufficienti: servono %, ne hai %.',
      v_service.credits_cost, coalesce(v_available, 0);
  end if;

  -- L'inserimento fa scattare il credit engine: disponibile -> prenotato.
  insert into public.appointments
    (patient_id, professional_id, service_id, service_name, status,
     starts_at, ends_at, credits_cost, source)
  values
    (v_patient, v_slot.professional_id, v_service.id, v_service.name, 'scheduled',
     v_slot.starts_at, v_slot.ends_at, v_service.credits_cost, 'unique_os')
  returning id into v_appt;

  update public.availability_slots
     set is_booked = true, appointment_id = v_appt
   where id = p_slot;

  select pr.full_name into v_pro_name
  from public.professionals p
  join public.profiles pr on pr.id = p.profile_id
  where p.id = v_slot.professional_id;

  perform public.notify_care_team(
    v_patient,
    'Nuova prenotazione',
    v_service.name || ' il ' || to_char(v_slot.starts_at at time zone 'Europe/Rome', 'DD/MM/YYYY HH24:MI'),
    '/pro'
  );

  return v_appt;
end;
$fn$;

create or replace function public.cancel_appointment(p_appointment uuid, p_reason text default null)
returns void
language plpgsql
security definer
set search_path = public
as $fn$
declare
  v_appt record;
begin
  select * into v_appt from public.appointments where id = p_appointment for update;
  if v_appt is null then
    raise exception 'Appuntamento non trovato.';
  end if;

  -- Il paziente disdice il proprio, il care team quelli che segue.
  if not (
    v_appt.patient_id = public.my_patient_id()
    or public.can_write_clinical(v_appt.patient_id)
  ) then
    raise exception 'Non hai titolo per disdire questo appuntamento.';
  end if;

  if v_appt.status not in ('scheduled', 'confirmed') then
    return;
  end if;

  -- Solo queste colonne cambiano. Il credit engine, sul cambio di stato,
  -- decide se il credito torna disponibile o viene addebitato.
  update public.appointments
     set status        = 'cancelled',
         cancelled_at  = now(),
         cancelled_by  = auth.uid(),
         cancel_reason = nullif(btrim(coalesce(p_reason, '')), '')
   where id = p_appointment;

  update public.availability_slots
     set is_booked = false, appointment_id = null
   where appointment_id = p_appointment;
end;
$fn$;
