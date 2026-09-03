-- ═══════════════════════════════════════════════════════════════════
-- Misure e motore clinico AI
--
-- Lo Score smette di essere un numero inserito a mano e diventa il
-- risultato di un calcolo su misure tracciate. L'AI propone, non decide:
-- ogni parametro estratto da un documento passa da validazione e, quando
-- è clinicamente rilevante, dall'approvazione di un professionista.
-- ═══════════════════════════════════════════════════════════════════

-- ── Misure ────────────────────────────────────────────────────────
create type measurement_source as enum (
  'anamnesis', 'lab', 'body_scan', 'vitals', 'ecg', 'spirometry',
  'stress_test', 'questionnaire', 'activity', 'wearable', 'professional'
);

-- Una riga per ogni parametro misurato, da qualunque fonte arrivi.
-- È la materia prima dello Score: il punteggio è una funzione di questa
-- tabella, mai un dato inserito direttamente.
create table public.measurements (
  id           uuid primary key default gen_random_uuid(),
  patient_id   uuid not null references public.patients (id) on delete cascade,
  -- Codice del catalogo in src/lib/score/metrics.ts.
  metric_code  text not null,
  label        text not null,
  value        numeric,
  -- Per le metriche categoriali: ECG, abitudine al fumo.
  category     text,
  unit         text,
  ref_low      numeric,
  ref_high     numeric,
  measured_on  date not null,
  source       measurement_source not null,
  -- Provenienza: da quale referto e da quale analisi AI arriva il dato.
  document_id  uuid references public.documents (id) on delete set null,
  analysis_id  uuid,
  entered_by   uuid references public.profiles (id) on delete set null,
  -- Confidenza dell'estrazione automatica; null se inserito da una persona.
  confidence   numeric(3, 2) check (confidence is null or (confidence >= 0 and confidence <= 1)),
  created_at   timestamptz not null default now(),
  check (value is not null or category is not null),
  -- Lo stesso parametro, nello stesso giorno, dalla stessa fonte, è la
  -- stessa misura: impedisce ai duplicati di falsare i confronti.
  unique (patient_id, metric_code, measured_on, source)
);

create index measurements_by_patient
  on public.measurements (patient_id, metric_code, measured_on desc);

-- `biomarkers` era un primo abbozzo della stessa cosa, limitato agli esami
-- ematici. Ora che le fonti sono undici, tenerne due sarebbe tenere due
-- verità diverse sugli stessi numeri.
drop table if exists public.biomarkers cascade;

-- ── Copertura dello Score ─────────────────────────────────────────
-- Quanta parte dei dati previsti è realmente disponibile. Un punteggio
-- calcolato su tre metriche su trenta non vale quanto uno completo, e il
-- paziente ha diritto di saperlo.
alter table public.longevity_scores
  add column if not exists coverage numeric(4, 3)
  check (coverage is null or (coverage >= 0 and coverage <= 1));

alter table public.score_pillars
  add column if not exists coverage numeric(4, 3)
  check (coverage is null or (coverage >= 0 and coverage <= 1));

-- Un pilastro può non essere calcolabile: meglio dirlo che inventare.
alter table public.score_pillars alter column value drop not null;

-- ── Motore clinico AI ─────────────────────────────────────────────
create type analysis_status as enum ('pending', 'completed', 'failed');

create type proposal_status as enum (
  'auto_applied',   -- validata, sotto soglia di rilevanza clinica
  'needs_review',   -- in attesa del professionista
  'approved',
  'rejected',
  'superseded'
);

-- Una riga per ogni passaggio dell'AI su un documento.
create table public.document_analyses (
  id            uuid primary key default gen_random_uuid(),
  document_id   uuid not null references public.documents (id) on delete cascade,
  patient_id    uuid not null references public.patients (id) on delete cascade,
  status        analysis_status not null default 'pending',
  model         text,
  detected_kind document_kind,
  detected_date date,
  -- Sintesi in linguaggio naturale, e approfondimenti suggeriti.
  summary       text,
  next_steps    text[] not null default '{}',
  -- Estrazione grezza, conservata per intero: senza, una proposta
  -- sbagliata non è ricostruibile a posteriori.
  raw           jsonb,
  error         text,
  requested_by  uuid references public.profiles (id) on delete set null,
  created_at    timestamptz not null default now(),
  completed_at  timestamptz
);

create index analyses_by_patient on public.document_analyses (patient_id, created_at desc);
create index analyses_by_document on public.document_analyses (document_id);

alter table public.measurements
  add constraint measurements_analysis_fk
  foreign key (analysis_id) references public.document_analyses (id) on delete set null;

-- Ogni parametro che l'AI propone di scrivere nel database.
create table public.measurement_proposals (
  id             uuid primary key default gen_random_uuid(),
  analysis_id    uuid not null references public.document_analyses (id) on delete cascade,
  patient_id     uuid not null references public.patients (id) on delete cascade,
  metric_code    text not null,
  label          text not null,
  value          numeric,
  category       text,
  unit           text,
  measured_on    date not null,
  confidence     numeric(3, 2) not null check (confidence >= 0 and confidence <= 1),
  -- La riga del referto da cui il valore è stato letto: permette al medico
  -- di verificare senza riaprire il PDF.
  source_excerpt text,
  previous_value numeric,
  delta          numeric,
  status         proposal_status not null default 'needs_review',
  -- Perché serve una revisione umana. Vuoto se applicata in automatico.
  review_reasons text[] not null default '{}',
  measurement_id uuid references public.measurements (id) on delete set null,
  reviewed_by    uuid references public.profiles (id) on delete set null,
  reviewed_at    timestamptz,
  review_note    text,
  created_at     timestamptz not null default now()
);

create index proposals_pending
  on public.measurement_proposals (patient_id, created_at desc)
  where status = 'needs_review';

create index proposals_by_analysis on public.measurement_proposals (analysis_id);

-- ── Row Level Security ────────────────────────────────────────────
alter table public.measurements           enable row level security;
alter table public.document_analyses      enable row level security;
alter table public.measurement_proposals  enable row level security;

-- Le misure confermate fanno parte della cartella del paziente.
create policy measurements_select on public.measurements
  for select using (public.can_access_patient(patient_id));

create policy measurements_write on public.measurements
  for all using (public.can_write_clinical(patient_id))
  with check (public.can_write_clinical(patient_id));

-- Analisi e proposte restano invisibili al paziente finché non sono
-- validate: un valore estratto male non deve poter spaventare nessuno
-- prima che un professionista lo abbia guardato.
create policy analyses_clinical_only on public.document_analyses
  for all using (public.can_write_clinical(patient_id))
  with check (public.can_write_clinical(patient_id));

create policy proposals_clinical_only on public.measurement_proposals
  for all using (public.can_write_clinical(patient_id))
  with check (public.can_write_clinical(patient_id));
