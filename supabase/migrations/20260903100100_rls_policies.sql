-- ═══════════════════════════════════════════════════════════════════
-- UNIQUE OS — Row Level Security
--
-- Regola d’oro: il database, non l’applicazione, decide chi vede cosa.
-- Anche se una query dell’app fosse sbagliata, Postgres non restituisce
-- righe che l’utente non ha diritto di vedere.
--
--   paziente      → esclusivamente i propri dati
--   professionista → solo i pazienti a lui assegnati (care_team_members)
--   admin / owner  → tutto, con tracciamento in audit_log
-- ═══════════════════════════════════════════════════════════════════

-- ── Funzioni di supporto ──────────────────────────────────────────
-- SECURITY DEFINER: leggono le tabelle ignorando la RLS, altrimenti le
-- policy che le richiamano andrebbero in ricorsione infinita.

create or replace function public.app_current_role()
returns app_role
language sql
stable
security definer
set search_path = public
as $fn$
  select role from public.profiles where id = auth.uid();
$fn$;

create or replace function public.is_staff()
returns boolean
language sql
stable
security definer
set search_path = public
as $fn$
  select coalesce(
    (select role in ('admin', 'owner') from public.profiles where id = auth.uid()),
    false
  );
$fn$;

-- Il patient_id dell’utente collegato, se è un paziente.
create or replace function public.my_patient_id()
returns uuid
language sql
stable
security definer
set search_path = public
as $fn$
  select id from public.patients where profile_id = auth.uid();
$fn$;

-- Il professional_id dell’utente collegato, se è un professionista.
create or replace function public.my_professional_id()
returns uuid
language sql
stable
security definer
set search_path = public
as $fn$
  select id from public.professionals where profile_id = auth.uid();
$fn$;

-- Unico punto in cui si decide se l’utente può vedere un paziente.
-- Ogni policy clinica passa da qui: se la regola cambia, cambia in un
-- posto solo.
create or replace function public.can_access_patient(target uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $fn$
  select
    target is not null
    and (
      -- il paziente stesso
      exists (
        select 1 from public.patients p
        where p.id = target and p.profile_id = auth.uid()
      )
      -- un professionista nel suo care team, con assegnazione attiva
      or exists (
        select 1
        from public.care_team_members ctm
        join public.professionals pr on pr.id = ctm.professional_id
        where ctm.patient_id = target
          and pr.profile_id = auth.uid()
          and ctm.ended_at is null
      )
      -- amministrazione e management
      or public.is_staff()
    );
$fn$;

-- Vero se l’utente può scrivere dati clinici: staff o professionista del team.
create or replace function public.can_write_clinical(target uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $fn$
  select
    public.is_staff()
    or exists (
      select 1
      from public.care_team_members ctm
      join public.professionals pr on pr.id = ctm.professional_id
      where ctm.patient_id = target
        and pr.profile_id = auth.uid()
        and ctm.ended_at is null
    );
$fn$;

-- ── Attivazione RLS su tutte le tabelle ───────────────────────────
alter table public.profiles            enable row level security;
alter table public.patients            enable row level security;
alter table public.professionals       enable row level security;
alter table public.care_team_members   enable row level security;
alter table public.longevity_scores    enable row level security;
alter table public.score_pillars       enable row level security;
alter table public.biomarkers          enable row level security;
alter table public.programs            enable row level security;
alter table public.program_enrollments enable row level security;
alter table public.recommended_actions enable row level security;
alter table public.appointments        enable row level security;
alter table public.documents           enable row level security;
alter table public.membership_tiers    enable row level security;
alter table public.memberships         enable row level security;
alter table public.credit_entries      enable row level security;
alter table public.notifications       enable row level security;
alter table public.audit_log           enable row level security;

-- ── profiles ──────────────────────────────────────────────────────
create policy profiles_select_self on public.profiles
  for select using (id = auth.uid() or public.is_staff());

create policy profiles_update_self on public.profiles
  for update using (id = auth.uid()) with check (id = auth.uid());

create policy profiles_staff_all on public.profiles
  for all using (public.is_staff()) with check (public.is_staff());

-- ── patients ──────────────────────────────────────────────────────
create policy patients_select on public.patients
  for select using (public.can_access_patient(id));

create policy patients_staff_write on public.patients
  for all using (public.is_staff()) with check (public.is_staff());

-- ── professionals ─────────────────────────────────────────────────
-- I professionisti attivi sono visibili a tutti gli utenti autenticati:
-- il paziente deve poter vedere chi lo segue.
create policy professionals_select on public.professionals
  for select using (is_active or profile_id = auth.uid() or public.is_staff());

create policy professionals_update_self on public.professionals
  for update using (profile_id = auth.uid()) with check (profile_id = auth.uid());

create policy professionals_staff_write on public.professionals
  for all using (public.is_staff()) with check (public.is_staff());

-- ── care_team_members ─────────────────────────────────────────────
create policy care_team_select on public.care_team_members
  for select using (public.can_access_patient(patient_id));

create policy care_team_staff_write on public.care_team_members
  for all using (public.is_staff()) with check (public.is_staff());

-- ── Dati clinici: lettura per chi ha accesso, scrittura al team ────
create policy scores_select on public.longevity_scores
  for select using (public.can_access_patient(patient_id));

create policy scores_write on public.longevity_scores
  for all using (public.can_write_clinical(patient_id))
  with check (public.can_write_clinical(patient_id));

create policy pillars_select on public.score_pillars
  for select using (
    exists (
      select 1 from public.longevity_scores s
      where s.id = score_id and public.can_access_patient(s.patient_id)
    )
  );

create policy pillars_write on public.score_pillars
  for all using (
    exists (
      select 1 from public.longevity_scores s
      where s.id = score_id and public.can_write_clinical(s.patient_id)
    )
  )
  with check (
    exists (
      select 1 from public.longevity_scores s
      where s.id = score_id and public.can_write_clinical(s.patient_id)
    )
  );

create policy biomarkers_select on public.biomarkers
  for select using (public.can_access_patient(patient_id));

create policy biomarkers_write on public.biomarkers
  for all using (public.can_write_clinical(patient_id))
  with check (public.can_write_clinical(patient_id));

create policy enrollments_select on public.program_enrollments
  for select using (public.can_access_patient(patient_id));

create policy enrollments_write on public.program_enrollments
  for all using (public.can_write_clinical(patient_id))
  with check (public.can_write_clinical(patient_id));

create policy appointments_select on public.appointments
  for select using (public.can_access_patient(patient_id));

create policy appointments_write on public.appointments
  for all using (public.can_write_clinical(patient_id))
  with check (public.can_write_clinical(patient_id));

create policy documents_select on public.documents
  for select using (public.can_access_patient(patient_id));

create policy documents_write on public.documents
  for all using (public.can_write_clinical(patient_id))
  with check (public.can_write_clinical(patient_id));

-- ── recommended_actions ───────────────────────────────────────────
-- Il paziente legge le proprie azioni e può segnarne l’avanzamento,
-- ma non può crearne di nuove né modificarne il testo.
create policy actions_select on public.recommended_actions
  for select using (public.can_access_patient(patient_id));

create policy actions_patient_progress on public.recommended_actions
  for update using (patient_id = public.my_patient_id())
  with check (patient_id = public.my_patient_id());

create policy actions_clinical_write on public.recommended_actions
  for all using (public.can_write_clinical(patient_id))
  with check (public.can_write_clinical(patient_id));

-- ── Catalogo programmi e membership: lettura libera agli autenticati ──
create policy programs_select on public.programs
  for select using (is_active or public.is_staff());

create policy programs_staff_write on public.programs
  for all using (public.is_staff()) with check (public.is_staff());

create policy tiers_select on public.membership_tiers
  for select using (is_active or public.is_staff());

create policy tiers_staff_write on public.membership_tiers
  for all using (public.is_staff()) with check (public.is_staff());

-- ── memberships e crediti ─────────────────────────────────────────
create policy memberships_select on public.memberships
  for select using (public.can_access_patient(patient_id));

create policy memberships_staff_write on public.memberships
  for all using (public.is_staff()) with check (public.is_staff());

-- I crediti si leggono, non si scrivono dal client: ogni movimento passa
-- da un route handler server-side con la chiave service-role.
create policy credits_select on public.credit_entries
  for select using (public.can_access_patient(patient_id));

create policy credits_staff_write on public.credit_entries
  for all using (public.is_staff()) with check (public.is_staff());

-- ── notifications ─────────────────────────────────────────────────
create policy notifications_select on public.notifications
  for select using (profile_id = auth.uid() or public.is_staff());

create policy notifications_mark_read on public.notifications
  for update using (profile_id = auth.uid()) with check (profile_id = auth.uid());

create policy notifications_staff_write on public.notifications
  for all using (public.is_staff()) with check (public.is_staff());

-- ── audit_log ─────────────────────────────────────────────────────
-- Sola lettura per lo staff. La scrittura avviene esclusivamente
-- server-side: nessun client può inserire o alterare tracce.
create policy audit_select_staff on public.audit_log
  for select using (public.is_staff());

-- ── Storage: bucket dei referti ───────────────────────────────────
-- I file sono organizzati come  patient-documents/<patient_id>/<file>
-- così il primo segmento del path diventa la chiave dei permessi.
insert into storage.buckets (id, name, public)
values ('patient-documents', 'patient-documents', false)
on conflict (id) do nothing;

create policy patient_documents_read on storage.objects
  for select using (
    bucket_id = 'patient-documents'
    and public.can_access_patient(((storage.foldername(name))[1])::uuid)
  );

create policy patient_documents_write on storage.objects
  for insert with check (
    bucket_id = 'patient-documents'
    and public.can_write_clinical(((storage.foldername(name))[1])::uuid)
  );
