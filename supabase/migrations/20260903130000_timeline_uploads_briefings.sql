-- ═══════════════════════════════════════════════════════════════════
-- Health Timeline, caricamento documenti dal paziente, briefing clinico
-- ═══════════════════════════════════════════════════════════════════

-- ── Health Timeline ───────────────────────────────────────────────
-- Una vista, non una tabella: gli eventi esistono già nelle tabelle di
-- dominio. Duplicarli in un registro parallelo vorrebbe dire tenerli
-- allineati per sempre, e prima o poi un percorso di scrittura se ne
-- dimentica. La vista non può andare fuori sincrono.
--
-- security_invoker propaga la Row Level Security delle tabelle sorgente:
-- ognuno vede nella timeline esattamente ciò che vedrebbe altrove.
create view public.patient_timeline
with (security_invoker = true) as

  select
    s.patient_id,
    (s.measured_on::timestamp at time zone 'Europe/Rome') as occurred_at,
    'score'::text                                         as kind,
    ('Unique Longevity Score — ' || round(s.score)::text)  as title,
    s.summary                                             as detail,
    s.id                                                  as ref_id
  from public.longevity_scores s

  union all

  select
    a.patient_id,
    a.starts_at,
    'appointment'::text,
    a.service_name,
    a.location,
    a.id
  from public.appointments a
  where a.status in ('scheduled', 'confirmed', 'completed')

  union all

  select
    d.patient_id,
    d.created_at,
    'document'::text,
    d.title,
    null::text,
    d.id
  from public.documents d

  union all

  select
    e.patient_id,
    (e.started_on::timestamp at time zone 'Europe/Rome'),
    'program_start'::text,
    ('Inizio percorso — ' || p.name),
    p.description,
    e.id
  from public.program_enrollments e
  join public.programs p on p.id = e.program_id

  union all

  select
    e.patient_id,
    (coalesce(e.ends_on, current_date)::timestamp at time zone 'Europe/Rome'),
    'program_end'::text,
    ('Percorso concluso — ' || p.name),
    null::text,
    e.id
  from public.program_enrollments e
  join public.programs p on p.id = e.program_id
  where e.status = 'completed';

comment on view public.patient_timeline is
  'Storia del paziente in ordine cronologico, ricostruita dalle tabelle di dominio.';

-- ── Caricamento documenti dal paziente ────────────────────────────
-- Il paziente può aggiungere i propri referti, ma non modificarli né
-- cancellarli dopo: una cartella clinica non si riscrive.
create policy documents_patient_upload on public.documents
  for insert with check (patient_id = public.my_patient_id());

create policy patient_documents_own_upload on storage.objects
  for insert with check (
    bucket_id = 'patient-documents'
    and ((storage.foldername(name))[1])::uuid = public.my_patient_id()
  );

-- ── Segnalazione al professionista ────────────────────────────────
-- Un paziente non può scrivere notifiche ad altri profili, e non deve
-- poterlo fare. Ma quando carica un referto il suo medico va avvisato:
-- questa funzione è l'unica eccezione, ristretta al proprio care team.
create or replace function public.notify_care_team(
  target  uuid,
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
  if not public.can_access_patient(target) then
    raise exception 'Accesso non consentito al paziente %', target;
  end if;

  insert into public.notifications (profile_id, title, body, link_url)
  select pr.profile_id, p_title, p_body, p_link
  from public.care_team_members ctm
  join public.professionals pr on pr.id = ctm.professional_id
  where ctm.patient_id = target
    and ctm.ended_at is null;

  get diagnostics v_count = row_count;
  return v_count;
end;
$fn$;

-- ── Briefing pre-visita ───────────────────────────────────────────
-- La sintesi che l'AI produce prima di una visita. Viene conservata, non
-- rigenerata a ogni sguardo: così è verificabile a posteriori, si sa su
-- quali dati è stata scritta, e non si paga due volte la stessa domanda.
create table public.patient_briefings (
  id             uuid primary key default gen_random_uuid(),
  patient_id     uuid not null references public.patients (id) on delete cascade,
  model          text,
  summary        text not null,
  highlights     text[] not null default '{}',
  open_questions text[] not null default '{}',
  -- Cosa è stato letto per scriverla: conteggi e finestra temporale.
  data_window    jsonb  not null default '{}'::jsonb,
  generated_by   uuid references public.profiles (id) on delete set null,
  created_at     timestamptz not null default now()
);

create index briefings_by_patient
  on public.patient_briefings (patient_id, created_at desc);

alter table public.patient_briefings enable row level security;

-- Il briefing è uno strumento di lavoro clinico, non un documento del
-- paziente: resta fra i professionisti che lo seguono.
create policy briefings_clinical_only on public.patient_briefings
  for all using (public.can_write_clinical(patient_id))
  with check (public.can_write_clinical(patient_id));
