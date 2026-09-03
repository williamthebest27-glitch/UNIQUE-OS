-- ═══════════════════════════════════════════════════════════════════
-- UNIQUE OS — Schema core
-- Un solo database condiviso dai quattro livelli:
--   Patient App · Professional App · Control Center · Unique Brain
-- ═══════════════════════════════════════════════════════════════════

create extension if not exists pgcrypto;

-- ── Enum ──────────────────────────────────────────────────────────
create type app_role           as enum ('patient', 'professional', 'admin', 'owner');
create type appointment_status as enum ('scheduled', 'confirmed', 'completed', 'cancelled', 'no_show');
create type document_kind      as enum ('lab_report', 'imaging', 'prescription', 'consent', 'care_plan', 'invoice', 'other');
create type credit_entry_type  as enum ('purchase', 'grant', 'consumption', 'refund', 'expiry', 'adjustment');
create type program_status     as enum ('draft', 'active', 'paused', 'completed', 'cancelled');
create type action_status      as enum ('suggested', 'accepted', 'in_progress', 'done', 'dismissed');
create type action_source      as enum ('professional', 'protocol', 'brain');
create type score_trend        as enum ('up', 'stable', 'down');

-- ── Identità ──────────────────────────────────────────────────────
-- Una riga per ogni utente autenticato, qualunque sia il livello da cui
-- accede. Il ruolo determina interfaccia e permessi.
create table public.profiles (
  id         uuid primary key references auth.users (id) on delete cascade,
  role       app_role    not null default 'patient',
  full_name  text        not null default '',
  first_name text,
  last_name  text,
  email      text,
  phone      text,
  avatar_url text,
  locale     text        not null default 'it-IT',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.profiles is
  'Profilo applicativo, 1:1 con auth.users. Il ruolo governa laccesso ai quattro livelli.';

-- Dati anagrafici e clinici di base del paziente.
create table public.patients (
  id                      uuid primary key default gen_random_uuid(),
  profile_id              uuid unique not null references public.profiles (id) on delete cascade,
  patient_code            text unique,            -- codice interno Unique
  date_of_birth           date,
  sex_at_birth            text,
  fiscal_code             text,
  height_cm               numeric(5, 2),
  primary_professional_id uuid,                   -- FK aggiunta dopo professionals
  onboarded_at            timestamptz,
  notes                   text,
  created_at              timestamptz not null default now(),
  updated_at              timestamptz not null default now()
);

create table public.professionals (
  id         uuid primary key default gen_random_uuid(),
  profile_id uuid unique not null references public.profiles (id) on delete cascade,
  specialty  text,
  title      text,                                -- Dott., Dott.ssa, Prof.
  license_no text,
  bio        text,
  is_active  boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.patients
  add constraint patients_primary_professional_fk
  foreign key (primary_professional_id)
  references public.professionals (id) on delete set null;

-- Chi può vedere quale paziente. È la tabella che regge tutta la RLS del
-- livello professionale: nessun medico vede pazienti non assegnati.
create table public.care_team_members (
  patient_id      uuid not null references public.patients (id) on delete cascade,
  professional_id uuid not null references public.professionals (id) on delete cascade,
  role_in_team    text,
  assigned_at     timestamptz not null default now(),
  ended_at        timestamptz,
  primary key (patient_id, professional_id)
);

create index care_team_by_professional
  on public.care_team_members (professional_id)
  where ended_at is null;

-- ── Unique Longevity Score ────────────────────────────────────────
-- Ogni rilevazione è una riga: lo storico è il prodotto, non un effetto
-- collaterale. Il valore in home è semplicemente la riga più recente.
create table public.longevity_scores (
  id             uuid primary key default gen_random_uuid(),
  patient_id     uuid not null references public.patients (id) on delete cascade,
  measured_on    date not null,
  score          numeric(5, 2) not null check (score >= 0 and score <= 100),
  previous_score numeric(5, 2),
  trend          score_trend,
  biological_age numeric(5, 2),
  computed_by    text,                            -- versione algoritmo, es. 'uls-v1'
  summary        text,
  created_at     timestamptz not null default now(),
  unique (patient_id, measured_on)
);

create index longevity_scores_by_patient
  on public.longevity_scores (patient_id, measured_on desc);

-- I pilastri che compongono lo Score, normalizzati per poterne analizzare
-- l andamento singolarmente nel tempo.
create table public.score_pillars (
  id       uuid primary key default gen_random_uuid(),
  score_id uuid not null references public.longevity_scores (id) on delete cascade,
  key      text not null,                         -- metabolic, cardiovascular, ...
  label    text not null,
  value    numeric(5, 2) not null check (value >= 0 and value <= 100),
  weight   numeric(4, 3) not null default 0,
  delta    numeric(5, 2),
  unique (score_id, key)
);

-- Biomarcatori grezzi: la materia prima da cui lo Score viene calcolato.
create table public.biomarkers (
  id          uuid primary key default gen_random_uuid(),
  patient_id  uuid not null references public.patients (id) on delete cascade,
  document_id uuid,                               -- referto di provenienza
  code        text not null,                      -- LOINC quando disponibile
  label       text not null,
  value       numeric,
  value_text  text,
  unit        text,
  ref_low     numeric,
  ref_high    numeric,
  measured_on date not null,
  created_at  timestamptz not null default now()
);

create index biomarkers_by_patient
  on public.biomarkers (patient_id, code, measured_on desc);

-- ── Percorsi e azioni ─────────────────────────────────────────────
create table public.programs (
  id            uuid primary key default gen_random_uuid(),
  slug          text unique not null,
  name          text not null,
  description   text,
  duration_days integer,
  is_active     boolean not null default true,
  created_at    timestamptz not null default now()
);

create table public.program_enrollments (
  id           uuid primary key default gen_random_uuid(),
  patient_id   uuid not null references public.patients (id) on delete cascade,
  program_id   uuid not null references public.programs (id) on delete restrict,
  status       program_status not null default 'active',
  started_on   date not null default current_date,
  ends_on      date,
  progress_pct numeric(5, 2) not null default 0 check (progress_pct between 0 and 100),
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

create index enrollments_by_patient
  on public.program_enrollments (patient_id, status);

-- Le "azioni consigliate" che compaiono nella home del paziente.
create table public.recommended_actions (
  id           uuid primary key default gen_random_uuid(),
  patient_id   uuid not null references public.patients (id) on delete cascade,
  title        text not null,
  description  text,
  pillar_key   text,
  source       action_source not null default 'professional',
  created_by   uuid references public.profiles (id) on delete set null,
  status       action_status not null default 'suggested',
  due_on       date,
  priority     smallint not null default 2 check (priority between 1 and 3),
  completed_at timestamptz,
  created_at   timestamptz not null default now()
);

create index actions_by_patient
  on public.recommended_actions (patient_id, status, priority);

-- ── Appuntamenti ──────────────────────────────────────────────────
create table public.appointments (
  id              uuid primary key default gen_random_uuid(),
  patient_id      uuid not null references public.patients (id) on delete cascade,
  professional_id uuid references public.professionals (id) on delete set null,
  service_name    text not null,
  status          appointment_status not null default 'scheduled',
  starts_at       timestamptz not null,
  ends_at         timestamptz not null,
  location        text,
  notes           text,
  credits_cost    numeric(10, 2) not null default 0,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  check (ends_at > starts_at)
);

create index appointments_by_patient
  on public.appointments (patient_id, starts_at desc);

create index appointments_upcoming
  on public.appointments (starts_at)
  where status in ('scheduled', 'confirmed');

-- ── Documenti ed esami ────────────────────────────────────────────
-- Il file vive nello Storage Supabase; qui restano metadati e puntatore,
-- così i permessi si governano in un posto solo.
create table public.documents (
  id                 uuid primary key default gen_random_uuid(),
  patient_id         uuid not null references public.patients (id) on delete cascade,
  kind               document_kind not null default 'other',
  title              text not null,
  storage_path       text not null,
  mime_type          text,
  size_bytes         bigint,
  issued_on          date,
  uploaded_by        uuid references public.profiles (id) on delete set null,
  is_new_for_patient boolean not null default true,
  created_at         timestamptz not null default now()
);

create index documents_by_patient
  on public.documents (patient_id, created_at desc);

alter table public.biomarkers
  add constraint biomarkers_document_fk
  foreign key (document_id) references public.documents (id) on delete set null;

-- ── Membership e crediti ──────────────────────────────────────────
create table public.membership_tiers (
  id               uuid primary key default gen_random_uuid(),
  slug             text unique not null,
  name             text not null,
  description      text,
  price_cents      integer not null default 0,
  currency         text not null default 'EUR',
  credits_included numeric(10, 2) not null default 0,
  billing_period   text not null default 'year',
  is_active        boolean not null default true
);

create table public.memberships (
  id         uuid primary key default gen_random_uuid(),
  patient_id uuid not null references public.patients (id) on delete cascade,
  tier_id    uuid not null references public.membership_tiers (id) on delete restrict,
  starts_on  date not null default current_date,
  ends_on    date,
  is_active  boolean not null default true,
  created_at timestamptz not null default now()
);

create index memberships_by_patient
  on public.memberships (patient_id, is_active);

-- Registro crediti append-only: nessuna riga viene mai aggiornata, il saldo
-- è la somma dei movimenti. Ogni credito resta tracciabile e verificabile.
create table public.credit_entries (
  id             uuid primary key default gen_random_uuid(),
  patient_id     uuid not null references public.patients (id) on delete cascade,
  entry_type     credit_entry_type not null,
  amount         numeric(10, 2) not null,         -- positivo accredita, negativo addebita
  description    text,
  appointment_id uuid references public.appointments (id) on delete set null,
  membership_id  uuid references public.memberships (id) on delete set null,
  created_by     uuid references public.profiles (id) on delete set null,
  created_at     timestamptz not null default now()
);

create index credit_entries_by_patient
  on public.credit_entries (patient_id, created_at desc);

create view public.credit_balances as
select
  patient_id,
  coalesce(sum(amount), 0)                            as balance,
  coalesce(sum(amount) filter (where amount > 0), 0)  as total_credited,
  coalesce(-sum(amount) filter (where amount < 0), 0) as total_used
from public.credit_entries
group by patient_id;

-- ── Comunicazioni ─────────────────────────────────────────────────
create table public.notifications (
  id         uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.profiles (id) on delete cascade,
  title      text not null,
  body       text,
  link_url   text,
  read_at    timestamptz,
  created_at timestamptz not null default now()
);

create index notifications_unread
  on public.notifications (profile_id, created_at desc)
  where read_at is null;

-- ── Accountability ────────────────────────────────────────────────
-- Ogni accesso a dati sanitari va tracciato (GDPR art. 30 e 32).
create table public.audit_log (
  id         bigserial primary key,
  actor_id   uuid references public.profiles (id) on delete set null,
  action     text not null,
  entity     text not null,
  entity_id  uuid,
  patient_id uuid references public.patients (id) on delete set null,
  metadata   jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index audit_log_by_patient
  on public.audit_log (patient_id, created_at desc);

-- ── Trigger ───────────────────────────────────────────────────────
create or replace function public.touch_updated_at()
returns trigger
language plpgsql
as $fn$
begin
  new.updated_at = now();
  return new;
end;
$fn$;

create trigger profiles_touch     before update on public.profiles            for each row execute function public.touch_updated_at();
create trigger patients_touch     before update on public.patients            for each row execute function public.touch_updated_at();
create trigger professionals_touch before update on public.professionals      for each row execute function public.touch_updated_at();
create trigger enrollments_touch  before update on public.program_enrollments for each row execute function public.touch_updated_at();
create trigger appointments_touch before update on public.appointments        for each row execute function public.touch_updated_at();

-- Alla registrazione di un nuovo utente creiamo il profilo applicativo.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $fn$
begin
  insert into public.profiles (id, email, full_name)
  values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data ->> 'full_name', '')
  )
  on conflict (id) do nothing;
  return new;
end;
$fn$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();
