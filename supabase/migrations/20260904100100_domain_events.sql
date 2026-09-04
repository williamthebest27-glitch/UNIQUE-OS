-- ═══════════════════════════════════════════════════════════════════
-- Eventi di dominio
--
-- Ogni fatto rilevante lascia una riga qui: `appointment.completed`,
-- `payment.failed`, `lead.converted`. Non è un log — è il sistema
-- nervoso. Chi deve reagire (notifiche, task, webhook, il Brain) legge
-- gli eventi invece di guardare dentro le tabelle di chi li ha prodotti.
--
-- Perché non un'automazione per caso: dieci automazioni scritte una alla
-- volta diventano dieci punti in cui ricordarsi di aggiungere l'undicesimo.
-- Un evento emesso una volta sola le rende tutte possibili, e nessuna
-- obbligatoria.
--
-- La tabella è append-only: nessuna policy di update o delete. Ciò che è
-- successo non si corregge, si compensa con un altro evento.
-- ═══════════════════════════════════════════════════════════════════

create table public.domain_events (
  id          bigserial primary key,
  event_name  text not null,
  entity      text not null,
  entity_id   uuid,
  patient_id  uuid references public.patients (id) on delete set null,
  location_id uuid references public.locations (id) on delete set null,
  actor_id    uuid references public.profiles (id) on delete set null,
  payload     jsonb not null default '{}'::jsonb,
  occurred_at timestamptz not null default now()
);

create index events_recent   on public.domain_events (occurred_at desc);
create index events_by_name  on public.domain_events (event_name, occurred_at desc);
create index events_by_patient on public.domain_events (patient_id, occurred_at desc)
  where patient_id is not null;

comment on table public.domain_events is
  'Append-only. Un evento descrive un fatto già avvenuto, al passato, e non presume chi lo userà.';

alter table public.domain_events enable row level security;

-- Lettura alla direzione. Gli eventi contengono nomi di pazienti e
-- importi: non sono un feed pubblico interno.
create policy events_read on public.domain_events
  for select using (public.is_staff());

-- Nessuna policy di insert: si scrive solo da `emit_event`, che è
-- security definer. Nessuna policy di update o delete: append-only.

/*
 * L'unico modo di emettere un evento.
 *
 * Security definer perché deve funzionare anche dentro i trigger che
 * girano per conto di un paziente: chi prenota una visita non ha il
 * diritto di scrivere nel registro eventi, ma la sua prenotazione deve
 * comunque comparirci.
 */
create or replace function public.emit_event(
  p_event     text,
  p_entity    text,
  p_entity_id uuid    default null,
  p_patient   uuid    default null,
  p_location  uuid    default null,
  p_payload   jsonb   default '{}'::jsonb
)
returns bigint
language plpgsql
security definer
set search_path = public
as $fn$
declare
  v_id bigint;
begin
  insert into public.domain_events
    (event_name, entity, entity_id, patient_id, location_id, actor_id, payload)
  values
    (p_event, p_entity, p_entity_id, p_patient, p_location, auth.uid(), coalesce(p_payload, '{}'::jsonb))
  returning id into v_id;

  return v_id;
end;
$fn$;

-- ── Emissione automatica ──────────────────────────────────────────
-- I fatti si registrano dove accadono, non dove qualcuno si ricorda di
-- chiamarli. Un appuntamento completato dal gestionale esterno genera lo
-- stesso evento di uno completato dall'interfaccia.

create or replace function public.events_patients()
returns trigger
language plpgsql
security definer
set search_path = public
as $fn$
begin
  perform public.emit_event(
    'patient.created', 'patient', new.id, new.id, new.location_id,
    jsonb_build_object('patient_code', new.patient_code)
  );
  return new;
end;
$fn$;

create trigger patients_events
  after insert on public.patients
  for each row execute function public.events_patients();

create or replace function public.events_appointments()
returns trigger
language plpgsql
security definer
set search_path = public
as $fn$
declare
  v_payload jsonb;
begin
  v_payload := jsonb_build_object(
    'service_name', new.service_name,
    'professional_id', new.professional_id,
    'starts_at', new.starts_at,
    'credits_cost', new.credits_cost
  );

  if tg_op = 'INSERT' then
    perform public.emit_event(
      'appointment.booked', 'appointment', new.id, new.patient_id, new.location_id, v_payload
    );
    return new;
  end if;

  if old.status is distinct from new.status then
    perform public.emit_event(
      case new.status
        when 'completed' then 'appointment.completed'
        when 'cancelled' then 'appointment.cancelled'
        when 'no_show'   then 'appointment.no_show'
        else 'appointment.updated'
      end,
      'appointment', new.id, new.patient_id, new.location_id,
      v_payload || jsonb_build_object('from', old.status, 'to', new.status)
    );
  elsif old.starts_at is distinct from new.starts_at then
    perform public.emit_event(
      'appointment.rescheduled', 'appointment', new.id, new.patient_id, new.location_id,
      v_payload || jsonb_build_object('from', old.starts_at)
    );
  end if;

  return new;
end;
$fn$;

create trigger appointments_events
  after insert or update on public.appointments
  for each row execute function public.events_appointments();

create or replace function public.events_documents()
returns trigger
language plpgsql
security definer
set search_path = public
as $fn$
begin
  perform public.emit_event(
    'document.uploaded', 'document', new.id, new.patient_id, null,
    jsonb_build_object('kind', new.kind, 'title', new.title)
  );
  return new;
end;
$fn$;

create trigger documents_events
  after insert on public.documents
  for each row execute function public.events_documents();

create or replace function public.events_scores()
returns trigger
language plpgsql
security definer
set search_path = public
as $fn$
begin
  perform public.emit_event(
    'score.updated', 'longevity_score', new.id, new.patient_id, null,
    jsonb_build_object(
      'score', new.score,
      'previous', new.previous_score,
      'measured_on', new.measured_on
    )
  );
  return new;
end;
$fn$;

create trigger scores_events
  after insert on public.longevity_scores
  for each row execute function public.events_scores();

create or replace function public.events_memberships()
returns trigger
language plpgsql
security definer
set search_path = public
as $fn$
begin
  if tg_op = 'INSERT' then
    perform public.emit_event(
      'membership.started', 'membership', new.id, new.patient_id, null,
      jsonb_build_object('tier_id', new.tier_id, 'status', new.status)
    );
    return new;
  end if;

  if old.status is distinct from new.status then
    perform public.emit_event(
      case new.status
        when 'cancelled' then 'membership.cancelled'
        when 'expired'   then 'membership.expired'
        when 'past_due'  then 'membership.past_due'
        when 'active'    then 'membership.activated'
        else 'membership.updated'
      end,
      'membership', new.id, new.patient_id, null,
      jsonb_build_object('from', old.status, 'to', new.status)
    );
  end if;

  return new;
end;
$fn$;

create trigger memberships_events
  after insert or update on public.memberships
  for each row execute function public.events_memberships();

create or replace function public.events_credits()
returns trigger
language plpgsql
security definer
set search_path = public
as $fn$
begin
  if new.entry_type = 'consumption' then
    perform public.emit_event(
      'credit.used', 'credit_entry', new.id, new.patient_id, null,
      jsonb_build_object('amount', new.amount, 'appointment_id', new.appointment_id)
    );
  end if;
  return new;
end;
$fn$;

create trigger credits_events
  after insert on public.credit_entries
  for each row execute function public.events_credits();

create or replace function public.events_payments()
returns trigger
language plpgsql
security definer
set search_path = public
as $fn$
begin
  if tg_op = 'UPDATE' and old.status is not distinct from new.status then
    return new;
  end if;

  if new.status in ('paid', 'failed', 'refunded') then
    perform public.emit_event(
      'payment.' || case new.status when 'paid' then 'succeeded' else new.status::text end,
      'payment', new.id, new.patient_id, null,
      jsonb_build_object(
        'amount_cents', new.amount_cents,
        'kind', new.kind,
        'attempts', new.attempts,
        'reason', new.failure_reason
      )
    );
  end if;

  return new;
end;
$fn$;

create trigger payments_events
  after insert or update on public.payments
  for each row execute function public.events_payments();

create or replace function public.events_leads()
returns trigger
language plpgsql
security definer
set search_path = public
as $fn$
begin
  if tg_op = 'INSERT' then
    perform public.emit_event(
      'lead.created', 'lead', new.id, null, new.location_id,
      jsonb_build_object('source', new.source, 'campaign', new.campaign)
    );
    return new;
  end if;

  if old.status is distinct from new.status then
    perform public.emit_event(
      case
        when new.status in ('patient', 'member') then 'lead.converted'
        when new.status = 'lost' then 'lead.lost'
        else 'lead.stage_changed'
      end,
      'lead', new.id, new.patient_id, new.location_id,
      jsonb_build_object('from', old.status, 'to', new.status, 'campaign', new.campaign)
    );
  end if;

  return new;
end;
$fn$;

create trigger leads_events
  after insert or update on public.leads
  for each row execute function public.events_leads();

-- ═══════════════════════════════════════════════════════════════════
-- Webhook: gli eventi che escono da Unique OS
--
-- L'architettura è a strato di orchestrazione, non a monolite: gli altri
-- strumenti — booking, pagamenti, WhatsApp, email, Meta — devono poter
-- sapere cosa succede qui senza interrogarci di continuo. Un endpoint si
-- iscrive agli eventi che gli servono e li riceve firmati.
-- ═══════════════════════════════════════════════════════════════════

create table public.webhook_endpoints (
  id          uuid primary key default gen_random_uuid(),
  name        text not null,
  url         text not null,
  -- Il segreto firma il corpo della richiesta (HMAC SHA-256): chi riceve
  -- deve poter distinguere una chiamata nostra da una qualsiasi.
  secret      text not null,
  -- 'appointment.completed', oppure 'appointment.*', oppure '*'.
  events      text[] not null default array['*'],
  is_active   boolean not null default true,
  created_at  timestamptz not null default now(),
  last_success_at timestamptz,
  failure_count   integer not null default 0
);

create type delivery_status as enum ('pending', 'delivered', 'failed', 'skipped');

create table public.webhook_deliveries (
  id           uuid primary key default gen_random_uuid(),
  endpoint_id  uuid not null references public.webhook_endpoints (id) on delete cascade,
  event_id     bigint not null references public.domain_events (id) on delete cascade,
  status       delivery_status not null default 'pending',
  attempts     integer not null default 0,
  last_error   text,
  next_retry_at timestamptz not null default now(),
  created_at   timestamptz not null default now(),
  delivered_at timestamptz,
  unique (endpoint_id, event_id)
);

create index deliveries_pending
  on public.webhook_deliveries (next_retry_at)
  where status = 'pending';

alter table public.webhook_endpoints  enable row level security;
alter table public.webhook_deliveries enable row level security;

-- Il segreto di un endpoint è una credenziale: la vede solo chi dirige.
create policy webhook_endpoints_staff on public.webhook_endpoints
  for all using (public.is_staff()) with check (public.is_staff());

create policy webhook_deliveries_staff on public.webhook_deliveries
  for all using (public.is_staff()) with check (public.is_staff());

/*
 * Un evento appena scritto diventa una consegna per ogni endpoint
 * interessato.
 *
 * La coda si popola in transazione con l'evento — o ci sono entrambi, o
 * non c'è nessuno dei due. L'invio vero avviene fuori, in Node: dentro un
 * trigger una chiamata HTTP terrebbe aperta la transazione che ha appena
 * completato una visita.
 */
create or replace function public.fanout_event()
returns trigger
language plpgsql
security definer
set search_path = public
as $fn$
begin
  insert into public.webhook_deliveries (endpoint_id, event_id)
  select e.id, new.id
  from public.webhook_endpoints e
  where e.is_active
    and (
      e.events @> array['*']
      or e.events @> array[new.event_name]
      or e.events @> array[split_part(new.event_name, '.', 1) || '.*']
    )
  on conflict do nothing;

  return new;
end;
$fn$;

create trigger events_fanout
  after insert on public.domain_events
  for each row execute function public.fanout_event();
