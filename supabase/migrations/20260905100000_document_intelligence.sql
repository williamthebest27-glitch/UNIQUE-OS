-- ═══════════════════════════════════════════════════════════════════
-- UNIQUE DOCUMENT INTELLIGENCE ENGINE
--
-- Un documento caricato smette di essere un allegato e diventa una
-- catena tracciabile: file → testo → dati strutturati → intuizioni →
-- decisione di una persona. Ogni anello resta, e resta collegato al
-- precedente.
--
-- Tutto additivo. Nessuna colonna rimossa, nessuna policy allentata,
-- nessun comportamento esistente cambiato. `document_analyses` e
-- `measurement_proposals` continuano a funzionare esattamente come
-- prima: il nuovo motore ci scrive dentro insieme alle proprie tabelle,
-- perché la coda di revisione delle misure — quella che alimenta il
-- Longevity Score — è già costruita e funziona.
--
-- ── Le tre scelte che spiegano lo schema ──────────────────────────
--
--   **L'originale non si tocca mai.** Il file resta nello storage così
--   com'è arrivato. Il testo estratto, i dati strutturati, l'analisi e
--   la revisione sono strati che si aggiungono, mai sostituzioni. Se
--   fra due anni il motore leggerà meglio, si potrà rileggere lo stesso
--   file e confrontare le due letture.
--
--   **Un fatto e un'inferenza non stanno nella stessa tabella.**
--   `document_biomarkers` contiene ciò che sta scritto nel documento,
--   con la citazione. `document_insights` contiene ciò che il motore ne
--   deduce. Sono tabelle diverse perché sono cose diverse, e mescolarle
--   renderebbe impossibile, dopo, sapere quale delle due fosse sbagliata.
--
--   **Il paziente vede i propri documenti.** Sempre, da subito: è la
--   sua cartella. Vede i *valori estratti* quando un professionista ha
--   guardato il documento — perché un valore letto male da una
--   scansione storta non deve poter spaventare nessuno prima che
--   qualcuno lo abbia verificato. Il file, lo stato e la data si vedono
--   comunque, così nessuno resta a chiedersi se il caricamento sia
--   andato a buon fine.
-- ═══════════════════════════════════════════════════════════════════

-- ── Gli stati della lavorazione ───────────────────────────────────
/*
 * Gli stessi otto della visione, e nessuno di più.
 *
 * `REVIEW_REQUIRED` non è un fallimento ed è deliberatamente distinto
 * da `COMPLETED`: è il caso normale per un referto con valori fuori
 * soglia, ed è il momento in cui la responsabilità torna a una persona.
 * Collassarlo in `COMPLETED` significherebbe dire che il sistema ha
 * finito quando invece ha appena cominciato la parte che conta.
 */
do $enum$
begin
  if not exists (select 1 from pg_type where typname = 'document_processing_state') then
    create type document_processing_state as enum (
      'UPLOADED', 'PROCESSING', 'OCR', 'EXTRACTING',
      'ANALYZING', 'REVIEW_REQUIRED', 'COMPLETED', 'FAILED'
    );
  end if;
end
$enum$;

do $enum$
begin
  if not exists (select 1 from pg_type where typname = 'biomarker_state') then
    create type biomarker_state as enum (
      'OPTIMAL', 'NORMAL', 'BORDERLINE', 'LOW', 'HIGH', 'CRITICAL', 'UNKNOWN'
    );
  end if;
end
$enum$;

do $enum$
begin
  if not exists (select 1 from pg_type where typname = 'reference_source') then
    create type reference_source as enum ('documento', 'catalogo', 'assente');
  end if;
end
$enum$;

do $enum$
begin
  if not exists (select 1 from pg_type where typname = 'trend_direction') then
    create type trend_direction as enum (
      'IMPROVING', 'WORSENING', 'STABLE', 'FLUCTUATING', 'UNKNOWN'
    );
  end if;
end
$enum$;

do $enum$
begin
  if not exists (select 1 from pg_type where typname = 'insight_severity') then
    create type insight_severity as enum ('INFO', 'ATTENZIONE', 'RILEVANTE', 'CRITICO');
  end if;
end
$enum$;

-- ── Il documento: quel che mancava ────────────────────────────────
alter table public.documents
  add column if not exists file_hash        text,
  add column if not exists processing_state document_processing_state not null default 'UPLOADED',
  add column if not exists processing_error text,
  add column if not exists page_count       integer,
  add column if not exists source_format    text,
  add column if not exists processed_at     timestamptz;

comment on column public.documents.file_hash is
  'SHA-256 del contenuto. È l''identità del file: il nome cambia fra un caricamento e l''altro, i byte no.';

comment on column public.documents.processing_state is
  'Dove si trova il documento nella pipeline. REVIEW_REQUIRED non è un errore: è il punto in cui serve una persona.';

/*
 * L'indice dei duplicati.
 *
 * Non è `unique`, ed è una scelta. Un paziente che ricarica lo stesso
 * referto lo fa quasi sempre perché non è sicuro che il primo sia
 * arrivato: rifiutarlo con un errore del database gli confermerebbe il
 * dubbio invece di risolverlo. Il documento entra, il sistema segnala
 * il duplicato, l'analisi non si rifà, e decide una persona.
 */
create index if not exists documents_per_impronta
  on public.documents (patient_id, file_hash)
  where file_hash is not null;

create index if not exists documents_in_lavorazione
  on public.documents (processing_state, created_at desc)
  where processing_state not in ('COMPLETED', 'FAILED');

-- ── L'estrazione ──────────────────────────────────────────────────
/*
 * Una riga per ogni passaggio del motore su un documento.
 *
 * Il testo integrale si conserva, e non è ridondanza rispetto al file:
 * è la **prova di cosa il motore aveva davanti** quando ha proposto
 * quei valori. Senza, una proposta sbagliata non è ricostruibile — e
 * fra un anno, quando il lettore sarà cambiato, rileggere il PDF darà
 * un testo diverso da quello su cui la decisione fu presa.
 */
create table if not exists public.document_extractions (
  id              uuid primary key default gen_random_uuid(),
  document_id     uuid not null references public.documents (id) on delete cascade,
  patient_id      uuid not null references public.patients (id) on delete cascade,
  -- Il collegamento all'analisi del motore clinico già esistente: le
  -- due cose sono lo stesso passaggio visto da due angoli, e tenerle
  -- separate senza legarle produrrebbe due verità sullo stesso file.
  analysis_id     uuid references public.document_analyses (id) on delete set null,

  document_type   text not null default 'UNKNOWN',
  document_date   date,
  laboratory      text,
  source_format   text,
  page_count      integer,

  -- Come si è letto: nativamente, con riconoscimento ottico, o entrambi.
  read_via        text not null default 'nativo',
  ocr_engine      text,
  text_confidence numeric(4, 3) check (text_confidence is null or (text_confidence between 0 and 1)),

  extracted_text  text,
  -- Il JSON strutturato per intero. Le tabelle qui sotto ne estraggono
  -- le parti su cui si interroga; questo resta la fotografia completa.
  structured      jsonb not null default '{}'::jsonb,

  -- Il nome letto sul documento. Serve a *verificare*, mai a
  -- identificare: attribuire un referto a un paziente sulla base di un
  -- nome letto da un OCR è il modo più diretto di mettere i dati di una
  -- persona nella cartella di un'altra.
  patient_name_on_document text,

  overall_confidence numeric(4, 3) check (overall_confidence is null or (overall_confidence between 0 and 1)),
  requires_review    boolean not null default true,
  warnings           jsonb not null default '[]'::jsonb,

  created_by      uuid references public.profiles (id) on delete set null,
  created_at      timestamptz not null default now()
);

create index if not exists extractions_by_document
  on public.document_extractions (document_id, created_at desc);

create index if not exists extractions_by_patient
  on public.document_extractions (patient_id, created_at desc);

-- ── I biomarcatori ────────────────────────────────────────────────
/*
 * **Fatti.** Un valore che sta scritto nel documento, con la riga da
 * cui è stato letto.
 *
 * `value` può essere nullo con `raw_value` valorizzato, ed è un caso
 * previsto e importante: il motore ha visto un numero e non è riuscito
 * a leggerlo. «Glucosio 1?5» non diventa né 105 né 125 — resta nullo,
 * con `requires_review` acceso. Un valore inventato che entra in una
 * cartella clinica non si distingue più da uno vero, e nessuno lo va a
 * ricontrollare proprio perché sembra normale.
 *
 * `reference_source` dice con quale metro il valore è stato giudicato.
 * Quando il referto stampa i propri valori di riferimento sono quelli
 * che valgono — dipendono dal metodo e dallo strumento del laboratorio
 * — e il catalogo di Unique interviene solo dove il documento tace.
 */
create table if not exists public.document_biomarkers (
  id             uuid primary key default gen_random_uuid(),
  extraction_id  uuid not null references public.document_extractions (id) on delete cascade,
  document_id    uuid not null references public.documents (id) on delete cascade,
  patient_id     uuid not null references public.patients (id) on delete cascade,

  canonical_name text not null,
  display_name   text not null,
  -- Come compariva sul documento, verbatim: è ciò che permette di
  -- capire perché il motore ha riconosciuto quell'esame e non un altro.
  document_label text,
  category       text not null default 'altro',
  -- Il codice del catalogo dello Score, dove questo esame ne alimenta uno.
  metric_code    text,

  value          numeric,
  raw_value      text,
  unit           text,
  -- Se il valore è stato convertito, da dove veniva.
  original_unit  text,
  original_value numeric,

  ref_low        numeric,
  ref_high       numeric,
  ref_source     reference_source not null default 'assente',
  ref_text       text,

  state          biomarker_state not null default 'UNKNOWN',
  confidence     numeric(4, 3) not null check (confidence between 0 and 1),
  requires_review boolean not null default false,
  notes          text[] not null default '{}',

  -- La citazione: la riga del documento. Permette a un medico di
  -- verificare in due secondi invece di riaprire il file.
  citation       text,
  source_page    integer,
  measured_on    date,

  -- Correzione del professionista. Il valore originale del motore non
  -- viene sovrascritto: sta sempre in `value`, e la correzione a fianco.
  corrected_value numeric,
  corrected_by    uuid references public.profiles (id) on delete set null,
  corrected_at    timestamptz,

  created_at     timestamptz not null default now()
);

create index if not exists biomarkers_by_extraction
  on public.document_biomarkers (extraction_id);

create index if not exists biomarkers_storico
  on public.document_biomarkers (patient_id, canonical_name, measured_on desc);

create index if not exists biomarkers_da_verificare
  on public.document_biomarkers (patient_id, created_at desc)
  where requires_review;

-- ── Terapia e note leggibili ──────────────────────────────────────
/*
 * Farmaci, integratori e le parti di referto che non sono numeri.
 *
 * Una tabella sola con un discriminante, e non tre: sono tutte
 * annotazioni testuali estratte dal documento, hanno la stessa forma e
 * lo stesso ciclo di vita. Tre tabelle identiche con nomi diversi
 * costringerebbero a triplicare policy, indici e query di lettura.
 *
 * Il sistema **non prescrive**: qui si registra ciò che il documento
 * dice, e nient'altro.
 */
create table if not exists public.document_notes (
  id            uuid primary key default gen_random_uuid(),
  extraction_id uuid not null references public.document_extractions (id) on delete cascade,
  document_id   uuid not null references public.documents (id) on delete cascade,
  patient_id    uuid not null references public.patients (id) on delete cascade,

  kind          text not null check (kind in ('farmaco', 'integratore', 'nota')),
  -- Per una nota: il suo tipo — conclusione, rilievo, anamnesi.
  subtype       text,
  label         text not null,
  detail        text,
  dose          text,
  posology      text,
  citation      text,
  source_page   integer,
  confidence    numeric(4, 3) not null default 0.5 check (confidence between 0 and 1),
  created_at    timestamptz not null default now()
);

create index if not exists document_notes_by_extraction
  on public.document_notes (extraction_id, kind);

-- ── Le intuizioni del Brain ───────────────────────────────────────
/*
 * **Inferenze.** Non fatti, e la tabella separata lo rende impossibile
 * da confondere.
 *
 * `evidence` non è decorazione: senza le prove un supporto decisionale
 * non è verificabile, e un supporto che non si può verificare è
 * un'opinione con l'aria dell'autorevolezza. Un medico deve poter
 * risalire ai numeri in dieci secondi.
 */
create table if not exists public.document_insights (
  id            uuid primary key default gen_random_uuid(),
  extraction_id uuid not null references public.document_extractions (id) on delete cascade,
  document_id   uuid not null references public.documents (id) on delete cascade,
  patient_id    uuid not null references public.patients (id) on delete cascade,

  -- Dove va mostrata: fra i reperti positivi, i negativi, le aree da rivedere.
  bucket        text not null check (bucket in ('positivo', 'negativo', 'da_rivedere')),
  observation   text not null,
  severity      insight_severity not null default 'INFO',
  evidence      text[] not null default '{}',
  trend         trend_direction,
  confidence    numeric(4, 3) not null check (confidence between 0 and 1),
  -- I nomi canonici dei biomarcatori toccati.
  refs          text[] not null default '{}',

  created_at    timestamptz not null default now()
);

create index if not exists insights_by_extraction
  on public.document_insights (extraction_id, severity);

/*
 * Le raccomandazioni.
 *
 * `requires_clinical_approval` è `true` con un vincolo e non un valore
 * predefinito. È deliberato: nessuna raccomandazione prodotta da questo
 * motore è esecutiva, e la regola sta nel database perché un domani
 * qualcuno potrebbe scrivere in questa tabella da un percorso che non
 * passa dall'applicazione.
 */
create table if not exists public.document_recommendations (
  id            uuid primary key default gen_random_uuid(),
  extraction_id uuid not null references public.document_extractions (id) on delete cascade,
  document_id   uuid not null references public.documents (id) on delete cascade,
  patient_id    uuid not null references public.patients (id) on delete cascade,

  action        text not null,
  rationale     text,
  priority      insight_severity not null default 'INFO',
  refs          text[] not null default '{}',
  requires_clinical_approval boolean not null default true
    check (requires_clinical_approval),

  -- La decisione del professionista su questa singola raccomandazione.
  decision      text check (decision in ('accolta', 'respinta', 'rimandata')),
  decided_by    uuid references public.profiles (id) on delete set null,
  decided_at    timestamptz,
  decision_note text,

  created_at    timestamptz not null default now()
);

create index if not exists recommendations_by_extraction
  on public.document_recommendations (extraction_id, priority);

create index if not exists recommendations_aperte
  on public.document_recommendations (patient_id, created_at desc)
  where decision is null;

-- ── La revisione clinica dell'analisi ─────────────────────────────
/*
 * Distinta da `documents.review_state`, e non è una duplicazione.
 *
 * `documents.review_state` dice se una persona ha guardato **il
 * referto**. Questa tabella dice se una persona ha validato
 * **l'analisi automatica** — che è un giudizio su ciò che la macchina
 * ha capito, non sul documento.
 *
 * Le due domande si separano nel caso che conta: un medico può leggere
 * e approvare un referto e insieme rifiutare l'estrazione perché il
 * motore ha letto male tre valori. Un flag unico costringerebbe a
 * scegliere quale delle due verità registrare.
 */
create table if not exists public.document_reviews (
  id            uuid primary key default gen_random_uuid(),
  extraction_id uuid not null references public.document_extractions (id) on delete cascade,
  document_id   uuid not null references public.documents (id) on delete cascade,
  patient_id    uuid not null references public.patients (id) on delete cascade,

  decision      text not null check (decision in ('approvata', 'corretta', 'respinta')),
  note          text,
  reviewer_id   uuid not null references public.profiles (id) on delete restrict,
  created_at    timestamptz not null default now()
);

create index if not exists reviews_by_extraction
  on public.document_reviews (extraction_id, created_at desc);

-- ── Il registro del documento ─────────────────────────────────────
/*
 * Cosa è successo a questo documento, in ordine.
 *
 * `audit_log` esiste già e registra **chi ha guardato**. Questo
 * registra **cosa è cambiato** su un singolo documento, con il valore
 * prima e dopo: è la richiesta dell'art. 32 letta dall'altro lato, ed è
 * ciò che permette di rispondere alla domanda «perché in cartella c'è
 * 105 e sul referto c'è 1?5».
 *
 * Nessun client ha policy di insert: si scrive solo dalla funzione
 * security definer qui sotto. Un registro che il registrato può
 * riscrivere non è un registro.
 */
create table if not exists public.document_audit (
  id          bigint generated always as identity primary key,
  document_id uuid not null references public.documents (id) on delete cascade,
  patient_id  uuid references public.patients (id) on delete set null,
  actor_id    uuid references public.profiles (id) on delete set null,
  action      text not null,
  entity      text,
  entity_id   uuid,
  previous_value text,
  new_value      text,
  metadata    jsonb not null default '{}'::jsonb,
  created_at  timestamptz not null default now()
);

create index if not exists document_audit_by_document
  on public.document_audit (document_id, created_at desc);

comment on table public.document_audit is
  'La storia di un documento: caricato, letto, estratto, analizzato, corretto, approvato. Con il valore prima e dopo, dove un valore è cambiato.';

-- ═══════════════════════════════════════════════════════════════════
-- Funzioni
-- ═══════════════════════════════════════════════════════════════════

/*
 * Scrivere nel registro.
 *
 * Non fallisce mai, come `log_clinical_access`: una traccia che rompe
 * la lavorazione di un documento viene tolta dopo il secondo incidente,
 * e da quel momento non traccia più niente.
 */
create or replace function public.log_document_event(
  p_document uuid,
  p_action   text,
  p_entity   text default null,
  p_entity_id uuid default null,
  p_previous text default null,
  p_new      text default null,
  p_metadata jsonb default '{}'::jsonb
)
returns void
language plpgsql
security definer
set search_path = public
as $fn$
declare
  v_patient uuid;
begin
  select patient_id into v_patient from public.documents where id = p_document;

  insert into public.document_audit (
    document_id, patient_id, actor_id, action, entity, entity_id,
    previous_value, new_value, metadata
  )
  values (
    p_document, v_patient, auth.uid(), p_action, p_entity, p_entity_id,
    p_previous, p_new, coalesce(p_metadata, '{}'::jsonb)
  );
exception
  when others then
    return;
end;
$fn$;

comment on function public.log_document_event is
  'Registra un passaggio nella vita di un documento. Non solleva mai: una traccia che rompe la pipeline viene disattivata, e allora non traccia più niente.';

/*
 * Avanzare di stato.
 *
 * Una funzione e non un `update` perché lo stato e la sua traccia
 * devono cambiare insieme. Se fossero due istruzioni separate, prima o
 * poi un percorso di scrittura farebbe la prima e dimenticherebbe la
 * seconda — e la traccia mancante sarebbe proprio quella del giorno in
 * cui qualcosa è andato storto.
 */
create or replace function public.set_document_processing(
  p_document uuid,
  p_state    text,
  p_error    text default null
)
returns document_processing_state
language plpgsql
security definer
set search_path = public
as $fn$
declare
  v_patient uuid;
  v_prima   document_processing_state;
  v_dopo    document_processing_state;
begin
  select patient_id, processing_state into v_patient, v_prima
  from public.documents where id = p_document;

  if v_patient is null then
    raise exception 'Documento non trovato.';
  end if;

  -- Il paziente può far avanzare la lavorazione dei propri documenti:
  -- è lui che ha premuto «carica». Non può però scrivere i risultati,
  -- che restano dietro le policy delle tabelle di estrazione.
  if not public.can_access_patient(v_patient) then
    raise exception 'Accesso non consentito a questo documento.';
  end if;

  v_dopo := p_state::document_processing_state;

  update public.documents
  set processing_state = v_dopo,
      processing_error = case when v_dopo = 'FAILED' then p_error else null end,
      processed_at     = case
                           when v_dopo in ('COMPLETED', 'REVIEW_REQUIRED', 'FAILED') then now()
                           else processed_at
                         end
  where id = p_document;

  perform public.log_document_event(
    p_document, 'processing.state', 'document', p_document,
    v_prima::text, v_dopo::text,
    case when p_error is null then '{}'::jsonb else jsonb_build_object('error', p_error) end
  );

  return v_dopo;
end;
$fn$;

/*
 * Il documento è visibile al paziente nei suoi valori estratti?
 *
 * Il file sì, sempre: è la sua cartella clinica, e la Row Level
 * Security su `documents` e sullo storage lo consente già da prima di
 * questa migrazione.
 *
 * I *valori letti dalla macchina* no, non prima che qualcuno li abbia
 * guardati. Non è paternalismo: un referto scansionato storto produce
 * valori sbagliati con la faccia di valori veri, e una persona che
 * legge «Ferritina 8, sotto l'intervallo» a mezzanotte non ha modo di
 * sapere che il motore ha letto male una cifra. Il documento resta
 * consultabile, lo stato della lavorazione anche: manca solo il
 * giudizio, finché non c'è.
 */
create or replace function public.document_letto_da_una_persona(p_document uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $fn$
  select coalesce(
    (select review_state in ('reviewed', 'approved') from public.documents where id = p_document),
    false
  );
$fn$;

/*
 * Correggere un valore estratto.
 *
 * Il valore del motore **non viene sovrascritto**: resta in `value`, e
 * la correzione va in `corrected_value`. È la differenza fra una
 * cartella clinica e un foglio di calcolo — fra un anno si deve poter
 * sapere che cosa aveva letto la macchina e che cosa ha corretto la
 * persona, non solo il risultato finale.
 */
create or replace function public.correggi_biomarcatore(
  p_biomarker uuid,
  p_value     numeric,
  p_note      text default null
)
returns void
language plpgsql
security definer
set search_path = public
as $fn$
declare
  v_patient  uuid;
  v_document uuid;
  v_prima    numeric;
  v_nome     text;
begin
  select patient_id, document_id, coalesce(corrected_value, value), display_name
    into v_patient, v_document, v_prima, v_nome
  from public.document_biomarkers where id = p_biomarker;

  if v_patient is null then
    raise exception 'Valore non trovato.';
  end if;

  if not public.can_write_clinical(v_patient) then
    raise exception 'Correggere un valore estratto richiede un professionista del care team.';
  end if;

  update public.document_biomarkers
  set corrected_value = p_value,
      corrected_by    = auth.uid(),
      corrected_at    = now(),
      requires_review = false,
      notes           = case
                          when p_note is null or trim(p_note) = '' then notes
                          else notes || p_note
                        end
  where id = p_biomarker;

  perform public.log_document_event(
    v_document, 'biomarker.corrected', 'biomarker', p_biomarker,
    v_prima::text, p_value::text,
    jsonb_build_object('biomarker', v_nome, 'note', p_note)
  );
end;
$fn$;

/*
 * Chiudere la revisione di un'analisi.
 *
 * Approvare l'analisi porta il documento a `COMPLETED`; respingerla lo
 * riporta a `REVIEW_REQUIRED`, perché un'analisi respinta lascia il
 * documento nello stato in cui era: da guardare.
 */
create or replace function public.revisiona_estrazione(
  p_extraction uuid,
  p_decision   text,
  p_note       text default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $fn$
declare
  v_patient  uuid;
  v_document uuid;
  v_id       uuid;
begin
  select patient_id, document_id into v_patient, v_document
  from public.document_extractions where id = p_extraction;

  if v_patient is null then
    raise exception 'Estrazione non trovata.';
  end if;

  if not public.can_write_clinical(v_patient) then
    raise exception 'Revisionare un''analisi richiede un professionista del care team.';
  end if;

  if p_decision not in ('approvata', 'corretta', 'respinta') then
    raise exception 'Decisione non valida: %', p_decision;
  end if;

  insert into public.document_reviews (extraction_id, document_id, patient_id, decision, note, reviewer_id)
  values (p_extraction, v_document, v_patient, p_decision, nullif(trim(coalesce(p_note, '')), ''), auth.uid())
  returning id into v_id;

  update public.documents
  set processing_state = case
                           when p_decision = 'respinta' then 'REVIEW_REQUIRED'::document_processing_state
                           else 'COMPLETED'::document_processing_state
                         end
  where id = v_document;

  update public.document_extractions
  set requires_review = (p_decision = 'respinta')
  where id = p_extraction;

  perform public.log_document_event(
    v_document, 'analysis.reviewed', 'extraction', p_extraction,
    null, p_decision, jsonb_build_object('note', p_note)
  );

  return v_id;
end;
$fn$;

/*
 * Decidere su una raccomandazione.
 *
 * Il gesto che chiude il ciclo della visione: OSSERVAZIONE →
 * INTERPRETAZIONE → RACCOMANDAZIONE → **DECISIONE DEL PROFESSIONISTA**.
 * Senza questa riga, la raccomandazione resterebbe sospesa per sempre e
 * l'elenco delle cose da valutare diventerebbe un elenco che nessuno
 * apre.
 */
create or replace function public.decidi_raccomandazione(
  p_recommendation uuid,
  p_decision       text,
  p_note           text default null
)
returns void
language plpgsql
security definer
set search_path = public
as $fn$
declare
  v_patient  uuid;
  v_document uuid;
  v_azione   text;
begin
  select patient_id, document_id, action into v_patient, v_document, v_azione
  from public.document_recommendations where id = p_recommendation;

  if v_patient is null then
    raise exception 'Raccomandazione non trovata.';
  end if;

  if not public.can_write_clinical(v_patient) then
    raise exception 'Decidere su una raccomandazione richiede un professionista del care team.';
  end if;

  if p_decision not in ('accolta', 'respinta', 'rimandata') then
    raise exception 'Decisione non valida: %', p_decision;
  end if;

  update public.document_recommendations
  set decision      = p_decision,
      decided_by    = auth.uid(),
      decided_at    = now(),
      decision_note = nullif(trim(coalesce(p_note, '')), '')
  where id = p_recommendation;

  perform public.log_document_event(
    v_document, 'recommendation.decided', 'recommendation', p_recommendation,
    null, p_decision, jsonb_build_object('azione', v_azione, 'note', p_note)
  );
end;
$fn$;

-- ═══════════════════════════════════════════════════════════════════
-- Lo storico longitudinale
-- ═══════════════════════════════════════════════════════════════════
/*
 * Una vista, non una tabella.
 *
 * È la stessa scelta di `patient_timeline`, per la stessa ragione: i
 * valori esistono già nelle tabelle di dominio, e duplicarli in un
 * registro parallelo vorrebbe dire tenerli allineati per sempre. Prima
 * o poi un percorso di scrittura se ne dimentica, e allora esistono due
 * verità sullo stesso esame.
 *
 * Unisce due fonti che raccontano la stessa storia da due parti: le
 * misure validate — quelle che alimentano il Longevity Score — e i
 * biomarcatori estratti dai documenti, che sono di più perché un
 * referto contiene quaranta esami e lo Score ne usa dieci.
 *
 * `security_invoker` propaga la Row Level Security delle tabelle
 * sorgente: ognuno vede qui esattamente ciò che vedrebbe altrove.
 */
create or replace view public.patient_biomarker_history
with (security_invoker = true) as

  select
    b.patient_id,
    b.canonical_name,
    b.display_name,
    b.category,
    coalesce(b.corrected_value, b.value) as value,
    b.unit,
    b.ref_low,
    b.ref_high,
    b.ref_source::text                   as ref_source,
    b.state::text                        as state,
    coalesce(b.measured_on, e.document_date, b.created_at::date) as measured_on,
    b.confidence,
    b.document_id,
    'documento'::text                    as origin
  from public.document_biomarkers b
  join public.document_extractions e on e.id = b.extraction_id
  where coalesce(b.corrected_value, b.value) is not null

  union all

  -- Le misure validate del motore clinico. `canonical_name` si ricava
  -- dal codice metrica in maiuscolo: è la convenzione con cui il
  -- catalogo del modulo nomina le stesse grandezze, e tenerle sulla
  -- stessa scala è ciò che rende confrontabile uno storico che nasce
  -- da due strade diverse.
  select
    m.patient_id,
    upper(m.metric_code)                 as canonical_name,
    m.label                              as display_name,
    'misura'::text                       as category,
    m.value,
    m.unit,
    m.ref_low,
    m.ref_high,
    'assente'::text                      as ref_source,
    'UNKNOWN'::text                      as state,
    m.measured_on,
    m.confidence,
    m.document_id,
    'misura'::text                       as origin
  from public.measurements m
  where m.value is not null;

comment on view public.patient_biomarker_history is
  'Lo storico di ogni parametro di un paziente, dai documenti e dalle misure validate. È la base dell''analisi temporale del Brain.';

-- ═══════════════════════════════════════════════════════════════════
-- Row Level Security
-- ═══════════════════════════════════════════════════════════════════

alter table public.document_extractions      enable row level security;
alter table public.document_biomarkers       enable row level security;
alter table public.document_notes            enable row level security;
alter table public.document_insights         enable row level security;
alter table public.document_recommendations  enable row level security;
alter table public.document_reviews          enable row level security;
alter table public.document_audit            enable row level security;

/*
 * Il principio, per tutte le tabelle qui sotto.
 *
 *   **Scrive** chi può scrivere in cartella: il care team e la
 *   direzione. Mai il paziente — nemmeno sui propri documenti, perché
 *   scrivere qui significa affermare un dato clinico.
 *
 *   **Legge** il care team sempre; il paziente i propri documenti, e i
 *   valori estratti dal momento in cui un professionista li ha
 *   guardati.
 *
 * Le due policy sono separate — una `select` e una `all` — invece di
 * una sola con un `or`: così la condizione di lettura del paziente non
 * può, per una svista in un `with check`, diventare anche una
 * condizione di scrittura.
 */

-- ── Estrazioni ────────────────────────────────────────────────────
drop policy if exists extractions_clinical on public.document_extractions;
create policy extractions_clinical on public.document_extractions
  for all using (public.can_write_clinical(patient_id))
  with check (public.can_write_clinical(patient_id));

drop policy if exists extractions_patient_read on public.document_extractions;
create policy extractions_patient_read on public.document_extractions
  for select using (
    patient_id = public.my_patient_id()
    and public.document_letto_da_una_persona(document_id)
  );

-- ── Biomarcatori ──────────────────────────────────────────────────
drop policy if exists biomarkers_clinical on public.document_biomarkers;
create policy biomarkers_clinical on public.document_biomarkers
  for all using (public.can_write_clinical(patient_id))
  with check (public.can_write_clinical(patient_id));

drop policy if exists biomarkers_patient_read on public.document_biomarkers;
create policy biomarkers_patient_read on public.document_biomarkers
  for select using (
    patient_id = public.my_patient_id()
    and public.document_letto_da_una_persona(document_id)
  );

-- ── Note, farmaci, integratori ────────────────────────────────────
drop policy if exists notes_clinical on public.document_notes;
create policy notes_clinical on public.document_notes
  for all using (public.can_write_clinical(patient_id))
  with check (public.can_write_clinical(patient_id));

drop policy if exists notes_patient_read on public.document_notes;
create policy notes_patient_read on public.document_notes
  for select using (
    patient_id = public.my_patient_id()
    and public.document_letto_da_una_persona(document_id)
  );

-- ── Intuizioni ────────────────────────────────────────────────────
drop policy if exists insights_clinical on public.document_insights;
create policy insights_clinical on public.document_insights
  for all using (public.can_write_clinical(patient_id))
  with check (public.can_write_clinical(patient_id));

drop policy if exists insights_patient_read on public.document_insights;
create policy insights_patient_read on public.document_insights
  for select using (
    patient_id = public.my_patient_id()
    and public.document_letto_da_una_persona(document_id)
  );

-- ── Raccomandazioni ───────────────────────────────────────────────
/*
 * Il paziente le vede solo **dopo** che un professionista le ha
 * decise, e non appena il documento è stato letto.
 *
 * È l'unica policy più stretta delle altre, ed è la regola più
 * importante di questa migrazione. Una raccomandazione generata da una
 * macchina, letta da un paziente prima che un medico l'abbia
 * confermata, è indistinguibile da un consiglio clinico. Il §13 della
 * visione dice esattamente questo, e qui è scritto in una policy invece
 * che in un commento — perché un commento non ferma una query.
 */
drop policy if exists recommendations_clinical on public.document_recommendations;
create policy recommendations_clinical on public.document_recommendations
  for all using (public.can_write_clinical(patient_id))
  with check (public.can_write_clinical(patient_id));

drop policy if exists recommendations_patient_read on public.document_recommendations;
create policy recommendations_patient_read on public.document_recommendations
  for select using (
    patient_id = public.my_patient_id()
    and decision is not null
  );

-- ── Revisioni ─────────────────────────────────────────────────────
/*
 * Il paziente vede che qualcuno ha guardato, e chi.
 *
 * È la parte che rende il resto credibile: sapere che il proprio
 * referto è stato letto da una persona, con nome e data, è ciò che
 * distingue una cartella clinica da un archivio di file.
 */
drop policy if exists reviews_clinical on public.document_reviews;
create policy reviews_clinical on public.document_reviews
  for all using (public.can_write_clinical(patient_id))
  with check (public.can_write_clinical(patient_id));

drop policy if exists reviews_patient_read on public.document_reviews;
create policy reviews_patient_read on public.document_reviews
  for select using (patient_id = public.my_patient_id());

-- ── Registro ──────────────────────────────────────────────────────
/*
 * Si legge, non si scrive.
 *
 * Nessuna policy di insert, update o delete: l'unica strada è
 * `log_document_event`, che è security definer. Un registro che il
 * registrato può riscrivere non è un registro — e questa è la stessa
 * scelta già fatta per `audit_log`.
 */
drop policy if exists document_audit_read on public.document_audit;
create policy document_audit_read on public.document_audit
  for select using (
    public.is_internal()
    and patient_id is not null
    and public.can_access_patient(patient_id)
  );

-- ═══════════════════════════════════════════════════════════════════
-- I documenti già in archivio
-- ═══════════════════════════════════════════════════════════════════
/*
 * Cosa fare dello storico.
 *
 * Restano tutti `UPLOADED`, che è la verità: fino a ieri la pipeline
 * non esisteva, quindi non ci sono passati. Segnarli `COMPLETED`
 * direbbe che sono stati analizzati da un motore che non li ha mai
 * visti — ed è lo stesso ragionamento per cui la migrazione precedente
 * ha lasciato `pending` tutti i referti già in cartella.
 *
 * Chi vuole rileggerli lo fa dal pulsante «Analizza», che li fa entrare
 * nella pipeline uno alla volta.
 */
