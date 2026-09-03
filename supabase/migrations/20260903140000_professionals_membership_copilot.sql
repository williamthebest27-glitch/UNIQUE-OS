-- ═══════════════════════════════════════════════════════════════════
-- Account professionista, membership completa, copilot clinico
-- ═══════════════════════════════════════════════════════════════════

-- ── Discipline professionali ──────────────────────────────────────
create type professional_discipline as enum (
  'physician', 'nutritionist', 'osteopath', 'psychologist',
  'trainer', 'nurse', 'other'
);

alter table public.professionals
  add column if not exists discipline professional_discipline not null default 'other';

comment on column public.professionals.discipline is
  'Determina su quali pilastri il professionista può scrivere misure e chi può approvare valori clinicamente rilevanti.';

/*
 * Chi può approvare un valore fuori soglia clinica.
 *
 * Un nutrizionista fa parte del care team e vede tutto il paziente, ma
 * una glicata a 6,8 la valida un medico. La regola sta nel database e non
 * solo nell'applicazione, perché è la differenza fra una convenzione e
 * una garanzia.
 */
create or replace function public.can_approve_clinical_flag()
returns boolean
language sql
stable
security definer
set search_path = public
as $fn$
  select
    public.is_staff()
    or exists (
      select 1 from public.professionals pr
      where pr.profile_id = auth.uid()
        and pr.discipline = 'physician'
        and pr.is_active
    );
$fn$;

-- La policy unica su measurement_proposals si divide: leggere e creare
-- resta di tutto il care team, approvare un valore fuori soglia no.
drop policy if exists proposals_clinical_only on public.measurement_proposals;

create policy proposals_select on public.measurement_proposals
  for select using (public.can_write_clinical(patient_id));

create policy proposals_insert on public.measurement_proposals
  for insert with check (public.can_write_clinical(patient_id));

create policy proposals_update on public.measurement_proposals
  for update using (
    public.can_write_clinical(patient_id)
    and (
      not ('clinical_threshold' = any (review_reasons))
      or public.can_approve_clinical_flag()
    )
  )
  with check (public.can_write_clinical(patient_id));

create policy proposals_delete on public.measurement_proposals
  for delete using (public.is_staff());

-- ── Note e valutazioni ────────────────────────────────────────────
create type note_kind as enum ('note', 'assessment', 'visit_summary');

create table public.clinical_notes (
  id             uuid primary key default gen_random_uuid(),
  patient_id     uuid not null references public.patients (id) on delete cascade,
  author_id      uuid references public.profiles (id) on delete set null,
  kind           note_kind not null default 'note',
  title          text,
  body           text not null,
  -- Alcune note sono per il care team, altre sono scritte per il paziente.
  -- Il default è la riservatezza: si condivide per scelta, non per svista.
  visible_to_patient boolean not null default false,
  appointment_id uuid references public.appointments (id) on delete set null,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);

create index notes_by_patient on public.clinical_notes (patient_id, created_at desc);

create trigger notes_touch before update on public.clinical_notes
  for each row execute function public.touch_updated_at();

alter table public.clinical_notes enable row level security;

create policy notes_select on public.clinical_notes
  for select using (
    public.can_write_clinical(patient_id)
    or (visible_to_patient and patient_id = public.my_patient_id())
  );

create policy notes_insert on public.clinical_notes
  for insert with check (public.can_write_clinical(patient_id) and author_id = auth.uid());

-- Una nota clinica si corregge solo da chi l'ha scritta. Nessuno riscrive
-- le osservazioni di un collega.
create policy notes_update_own on public.clinical_notes
  for update using (author_id = auth.uid()) with check (author_id = auth.uid());

-- ── Proposte di percorso ──────────────────────────────────────────
create type proposal_decision as enum ('proposed', 'accepted', 'rejected');

create table public.care_plan_proposals (
  id           uuid primary key default gen_random_uuid(),
  patient_id   uuid not null references public.patients (id) on delete cascade,
  proposed_by  uuid references public.profiles (id) on delete set null,
  title        text not null,
  description  text,
  program_id   uuid references public.programs (id) on delete set null,
  status       proposal_decision not null default 'proposed',
  decided_by   uuid references public.profiles (id) on delete set null,
  decided_at   timestamptz,
  decision_note text,
  created_at   timestamptz not null default now()
);

create index care_plan_proposals_open
  on public.care_plan_proposals (patient_id, created_at desc)
  where status = 'proposed';

alter table public.care_plan_proposals enable row level security;

create policy care_plan_proposals_select on public.care_plan_proposals
  for select using (public.can_write_clinical(patient_id));

create policy care_plan_proposals_insert on public.care_plan_proposals
  for insert with check (public.can_write_clinical(patient_id));

-- Proporre uno step lo può fare chiunque nel care team; decidere se entra
-- nel percorso è responsabilità medica o di direzione.
create policy care_plan_proposals_decide on public.care_plan_proposals
  for update using (public.can_approve_clinical_flag())
  with check (public.can_approve_clinical_flag());

-- ── Task del professionista ───────────────────────────────────────
create type task_status as enum ('open', 'done', 'cancelled');

create table public.professional_tasks (
  id              uuid primary key default gen_random_uuid(),
  professional_id uuid not null references public.professionals (id) on delete cascade,
  patient_id      uuid references public.patients (id) on delete cascade,
  title           text not null,
  detail          text,
  due_on          date,
  status          task_status not null default 'open',
  created_by      uuid references public.profiles (id) on delete set null,
  created_at      timestamptz not null default now(),
  completed_at    timestamptz
);

create index tasks_open
  on public.professional_tasks (professional_id, due_on)
  where status = 'open';

alter table public.professional_tasks enable row level security;

-- Un task è di chi lo deve fare. Lo staff vede tutto per poterli assegnare.
create policy tasks_select on public.professional_tasks
  for select using (
    public.is_staff()
    or professional_id = public.my_professional_id()
  );

create policy tasks_write on public.professional_tasks
  for all using (
    public.is_staff()
    or professional_id = public.my_professional_id()
  )
  with check (
    public.is_staff()
    or professional_id = public.my_professional_id()
  );

-- ── Membership completa ───────────────────────────────────────────
create type membership_status as enum (
  'pending', 'active', 'past_due', 'cancelled', 'expired'
);

alter table public.memberships
  add column if not exists status membership_status not null default 'active',
  add column if not exists auto_renew boolean not null default true,
  add column if not exists renews_on date,
  add column if not exists activated_at timestamptz,
  add column if not exists cancelled_at timestamptz,
  -- Del metodo di pagamento conserviamo solo ciò che serve a riconoscerlo.
  -- Numeri di carta, scadenze e CVV non entrano in questo database: stanno
  -- dal gestore dei pagamenti, che è attrezzato per custodirli.
  add column if not exists payment_brand text,
  add column if not exists payment_last4 text,
  add column if not exists external_ref text;

alter table public.memberships
  drop constraint if exists memberships_last4_shape;

alter table public.memberships
  add constraint memberships_last4_shape
  check (payment_last4 is null or payment_last4 ~ '^[0-9]{4}$');

-- Servizi acquistati fuori dalla membership.
create table public.service_purchases (
  id              uuid primary key default gen_random_uuid(),
  patient_id      uuid not null references public.patients (id) on delete cascade,
  name            text not null,
  description     text,
  price_cents     integer not null default 0,
  currency        text not null default 'EUR',
  credits_granted numeric(10, 2) not null default 0,
  purchased_on    date not null default current_date,
  external_ref    text,
  created_at      timestamptz not null default now()
);

create index purchases_by_patient
  on public.service_purchases (patient_id, purchased_on desc);

alter table public.service_purchases enable row level security;

create policy purchases_select on public.service_purchases
  for select using (public.can_access_patient(patient_id));

create policy purchases_staff_write on public.service_purchases
  for all using (public.is_staff()) with check (public.is_staff());

-- ── Crediti: assegnati, utilizzati, prenotati, residui ────────────
/*
 * I crediti prenotati non sono un movimento del registro: sono l'impegno
 * preso con le visite già fissate e non ancora svolte. Derivarli dagli
 * appuntamenti, invece di scriverli, evita il problema classico delle
 * prenotazioni — una visita spostata o annullata libererebbe un credito
 * che qualcuno deve ricordarsi di restituire.
 */
create or replace view public.credit_balances
with (security_invoker = true) as
with ledger as (
  select
    patient_id,
    coalesce(sum(amount) filter (where amount > 0), 0)  as credited,
    coalesce(-sum(amount) filter (where amount < 0), 0) as used
  from public.credit_entries
  group by patient_id
),
reserved as (
  select
    patient_id,
    coalesce(sum(credits_cost), 0) as reserved
  from public.appointments
  where status in ('scheduled', 'confirmed')
    and starts_at >= now()
  group by patient_id
)
select
  p.id                                              as patient_id,
  coalesce(l.credited, 0)                           as total_credited,
  coalesce(l.used, 0)                               as total_used,
  coalesce(r.reserved, 0)                           as total_reserved,
  coalesce(l.credited, 0) - coalesce(l.used, 0)     as balance,
  coalesce(l.credited, 0) - coalesce(l.used, 0)
    - coalesce(r.reserved, 0)                       as available
from public.patients p
left join ledger   l on l.patient_id = p.id
left join reserved r on r.patient_id = p.id;

comment on view public.credit_balances is
  'Crediti assegnati, utilizzati, prenotati sulle visite future e realmente disponibili.';

-- ── Copilot clinico ───────────────────────────────────────────────
-- Ogni domanda e ogni risposta restano agli atti, con le fonti da cui la
-- risposta è stata tratta. Un assistente che non lascia traccia non è
-- verificabile, e in clinica ciò che non è verificabile non è utilizzabile.
create table public.copilot_messages (
  id         uuid primary key default gen_random_uuid(),
  patient_id uuid not null references public.patients (id) on delete cascade,
  profile_id uuid not null references public.profiles (id) on delete cascade,
  question   text not null,
  answer     text,
  sources    jsonb not null default '[]'::jsonb,
  model      text,
  error      text,
  created_at timestamptz not null default now()
);

create index copilot_by_patient
  on public.copilot_messages (patient_id, profile_id, created_at desc);

alter table public.copilot_messages enable row level security;

-- La conversazione è di chi l'ha avuta: un collega non legge le domande
-- che un altro ha fatto sul paziente.
create policy copilot_own on public.copilot_messages
  for all using (
    profile_id = auth.uid() and public.can_write_clinical(patient_id)
  )
  with check (
    profile_id = auth.uid() and public.can_write_clinical(patient_id)
  );
