-- ═══════════════════════════════════════════════════════════════════
-- Il Brain sa leggere i documenti. Non sapeva cercarli.
--
-- `document_extractions.extracted_text` contiene il testo di ogni
-- referto che il motore ha aperto — nativo o passato dal riconoscimento
-- ottico — e non lo interrogava nessuno. Il copilot clinico rispondeva
-- benissimo sulle **misure**, cioè sui numeri già estratti in tabella, e
-- non aveva niente da dire su una domanda come «cosa scriveva il
-- radiologo ad agosto»: quel testo esisteva, era in cartella, ed era
-- fuori portata.
--
-- Questa migrazione lo rende cercabile. Tre decisioni la reggono.
--
--   **Frammenti, non documenti.** Un referto di dodici pagine che
--   "contiene la parola tiroide" non è una risposta: la risposta è il
--   paragrafo in cui la contiene. Si indicizzano pezzi da poche righe,
--   con la pagina da cui vengono, così che il Brain possa citare un
--   punto invece di un file.
--
--   **Ricerca lessicale, non vettoriale.** Nessun embedding, e non per
--   pigrizia: un embedding richiede un modello che veda il testo, e il
--   testo qui è un referto. La ricerca full-text italiana di Postgres
--   ha stemming, pesi e ranking, gira dentro il database, non manda
--   niente da nessuna parte e non costa una chiamata per documento.
--   Quando servirà il vettoriale — per domande poste con parole che nel
--   referto non compaiono — si aggiungerà una colonna accanto a questa,
--   non al posto suo.
--
--   **I permessi sono quelli del paziente, e nient'altro.** La tabella
--   porta `patient_id` e la policy passa da `can_access_patient`: un
--   frammento non è un oggetto nuovo con permessi nuovi, è un pezzo di
--   un referto e vale la regola del referto. La funzione di ricerca è
--   `security invoker` di proposito — con `security definer` avrebbe
--   letto tutto e sarebbe stata l'unica riga di questo file capace di
--   far uscire il referto di una persona dalla cartella di un'altra.
-- ═══════════════════════════════════════════════════════════════════

create table if not exists public.document_chunks (
  id            uuid primary key default gen_random_uuid(),
  document_id   uuid not null references public.documents (id) on delete cascade,
  extraction_id uuid not null references public.document_extractions (id) on delete cascade,
  patient_id    uuid not null references public.patients (id) on delete cascade,

  /* La posizione nel documento: serve a rimettere in fila i frammenti
     quando se ne citano due dello stesso referto. */
  ordinale      integer not null,
  /* La pagina, quando il lettore l'ha saputa dire. Un riferimento senza
     pagina resta utile; con la pagina si va a controllare. */
  pagina        integer,

  testo         text not null check (length(trim(testo)) > 0),

  /*
   * Il vettore di ricerca, calcolato dal database.
   *
   * `generated always as … stored` e non un trigger: così non esiste
   * nessuna strada per inserire un frammento con un indice sbagliato o
   * assente. Il dizionario italiano fa lo stemming — «tiroidea» trova
   * «tiroide» — ed è la ragione per cui questa colonna vale più di un
   * `like '%…%'`.
   */
  search_vector tsvector generated always as
                  (to_tsvector('italian', coalesce(testo, ''))) stored,

  created_at    timestamptz not null default now(),

  unique (extraction_id, ordinale)
);

create index if not exists document_chunks_search
  on public.document_chunks using gin (search_vector);

create index if not exists document_chunks_by_patient
  on public.document_chunks (patient_id, created_at desc);

create index if not exists document_chunks_by_document
  on public.document_chunks (document_id, ordinale);

alter table public.document_chunks enable row level security;

/*
 * Chi legge un frammento.
 *
 * Esattamente chi può leggere il referto da cui viene. Il paziente vede
 * i propri, il care team quelli dei propri assistiti, la direzione
 * tutto: è `can_access_patient`, la stessa funzione che decide su
 * `documents`, e non una regola nuova che un domani potrebbe divergere.
 */
create policy chunks_read on public.document_chunks
  for select using (public.can_access_patient(patient_id));

/*
 * Chi ne scrive.
 *
 * Solo chi ha titolo clinico, e in pratica solo la pipeline documentale:
 * i frammenti nascono dall'estrazione e non si scrivono a mano. Il
 * paziente non compare — `can_write_clinical` lo esclude — perché un
 * frammento è ciò su cui il Brain fonderà una risposta, e poterlo
 * scrivere significherebbe poter dettare quella risposta.
 */
create policy chunks_write on public.document_chunks
  for all
  using (public.is_staff() or public.can_write_clinical(patient_id))
  with check (public.is_staff() or public.can_write_clinical(patient_id));

-- ── La ricerca ────────────────────────────────────────────────────
/**
 * Cerca nei documenti che chi chiama ha diritto di leggere.
 *
 * `security invoker`, e va detto perché è la riga più importante del
 * file: la funzione gira con i permessi di chi la chiama, quindi la
 * policy qui sopra si applica dentro la query. Con `security definer`
 * avrebbe letto l'archivio intero e il filtro sarebbe stato il parametro
 * `p_patient` — cioè un valore che arriva dal client. La differenza fra
 * le due versioni è la differenza fra «non può» e «speriamo che
 * l'applicazione non sbagli».
 *
 * `p_patient` resta, ma come restringimento e non come permesso: serve a
 * chiedere «cerca nella cartella di questa persona» quando si è dentro
 * una cartella. Passandolo nullo si cerca in tutto ciò che si potrebbe
 * comunque leggere.
 *
 * `websearch_to_tsquery` accetta la sintassi che le persone già
 * conoscono — le virgolette per la frase esatta, il meno per escludere —
 * e soprattutto non solleva un'eccezione davanti a una stringa storta,
 * che è ciò che fa `to_tsquery` e che qui vorrebbe dire una pagina rotta
 * per una domanda scritta in fretta.
 */
create or replace function public.search_document_chunks(
  p_query   text,
  p_patient uuid default null,
  p_limit   integer default 8
)
returns table (
  chunk_id      uuid,
  document_id   uuid,
  extraction_id uuid,
  patient_id    uuid,
  ordinale      integer,
  pagina        integer,
  testo         text,
  titolo        text,
  documento_il  date,
  rilevanza     real
)
language sql
stable
security invoker
set search_path = public
as $fn$
  select
    c.id,
    c.document_id,
    c.extraction_id,
    c.patient_id,
    c.ordinale,
    c.pagina,
    c.testo,
    d.title,
    coalesce(e.document_date, d.issued_on, d.created_at::date),
    ts_rank(c.search_vector, websearch_to_tsquery('italian', p_query))::real
  from public.document_chunks c
  join public.documents d on d.id = c.document_id
  left join public.document_extractions e on e.id = c.extraction_id
  where
    length(trim(coalesce(p_query, ''))) > 0
    and c.search_vector @@ websearch_to_tsquery('italian', p_query)
    and (p_patient is null or c.patient_id = p_patient)
  order by
    ts_rank(c.search_vector, websearch_to_tsquery('italian', p_query)) desc,
    coalesce(e.document_date, d.issued_on, d.created_at::date) desc,
    c.ordinale
  limit greatest(1, least(coalesce(p_limit, 8), 40));
$fn$;

grant execute on function public.search_document_chunks(text, uuid, integer) to authenticated;
