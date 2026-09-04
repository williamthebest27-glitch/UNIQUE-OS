-- ═══════════════════════════════════════════════════════════════════
-- Unique Knowledge Base
--
-- La memoria aziendale: procedure, listini, servizi, FAQ, protocolli,
-- brand book, linee guida marketing, script, policy.
--
-- Il punto difficile non è conservare le informazioni — è sapere quale
-- è vera **oggi**. Il prezzo dello Score è stato 129 e adesso è 149:
-- entrambe le frasi sono state vere, una sola lo è ora. Un sistema che
-- risponde 129 non ha un problema di conoscenza, ha un problema di
-- tempo.
--
-- Per questo l'informazione non è una riga che si aggiorna, ma una
-- catena di versioni con validità dichiarata. Si scrive sulla catena, si
-- legge dalla vista `knowledge_current`: chi legge non deve ricordarsi
-- di filtrare, e il Brain non legge da nessun'altra parte.
-- ═══════════════════════════════════════════════════════════════════

create type knowledge_kind as enum (
  'procedura',        -- come si fa una cosa in Unique
  'listino',          -- prezzi e condizioni commerciali
  'servizio',         -- che cos'è un servizio e a chi serve
  'faq',              -- le domande che arrivano davvero
  'professionista',   -- chi è, cosa fa, quando riceve
  'protocollo',       -- protocolli interni, clinici e non
  'brand',            -- mission, posizionamento, tono di voce, identità
  'marketing',        -- linee guida, offerte, target
  'script',           -- script commerciali, reel, chiamate
  'policy',           -- regole interne, privacy, sicurezza
  'contratto',        -- regole contrattuali rilevanti
  'documentazione'    -- tutto il resto che serve saper ritrovare
);

create type knowledge_status as enum ('draft', 'active', 'superseded', 'archived');

-- Chi può leggere: `internal` resta dentro, `public` può finire sul sito,
-- nel chatbot o in bocca a un'AI che parla con un paziente.
create type knowledge_audience as enum ('internal', 'public');

-- ── L'informazione ────────────────────────────────────────────────
create table public.knowledge_entries (
  id          uuid primary key default gen_random_uuid(),
  slug        text unique not null,
  kind        knowledge_kind not null,
  title       text not null,
  audience    knowledge_audience not null default 'internal',
  /*
   * Il proprietario.
   *
   * Non è chi l'ha scritta: è chi risponde se è sbagliata. Un'informazione
   * senza proprietario invecchia senza che nessuno se ne accorga.
   */
  owner_id    uuid references public.profiles (id) on delete set null,
  -- Null: vale per tutta l'organizzazione. Valorizzata: solo per quella sede.
  location_id uuid references public.locations (id) on delete cascade,
  tags        text[] not null default '{}',
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create index knowledge_by_kind on public.knowledge_entries (kind);
create index knowledge_by_tags on public.knowledge_entries using gin (tags);

create trigger knowledge_entries_touch
  before update on public.knowledge_entries
  for each row execute function public.touch_updated_at();

-- ── Le versioni ───────────────────────────────────────────────────
create table public.knowledge_versions (
  id          uuid primary key default gen_random_uuid(),
  entry_id    uuid not null references public.knowledge_entries (id) on delete cascade,
  version     integer not null check (version > 0),
  status      knowledge_status not null default 'draft',
  title       text not null,
  body        text not null,
  summary     text,
  /*
   * Il dato strutturato, quando l'informazione è un numero.
   *
   * "La visita medico-sportiva costa 65 €" è una frase; `{"prezzo_cents":
   * 6500}` è un valore su cui si possono fare i conti. Le informazioni
   * che valgono davvero hanno entrambi: il testo per chi legge, il dato
   * per chi calcola.
   */
  data        jsonb not null default '{}'::jsonb,
  valid_from  date not null default current_date,
  valid_to    date,
  author_id   uuid references public.profiles (id) on delete set null,
  approved_by uuid references public.profiles (id) on delete set null,
  approved_at timestamptz,
  change_note text,
  created_at  timestamptz not null default now(),
  unique (entry_id, version),
  constraint knowledge_valid_range check (valid_to is null or valid_to >= valid_from)
);

create index knowledge_versions_by_entry
  on public.knowledge_versions (entry_id, version desc);

create index knowledge_versions_active
  on public.knowledge_versions (entry_id, valid_from desc)
  where status = 'active';

-- Ricerca a testo pieno, in italiano. Il titolo pesa più del corpo:
-- chi cerca "listino" vuole il listino, non il paragrafo che lo nomina.
alter table public.knowledge_versions
  add column search_vector tsvector
  generated always as (
    setweight(to_tsvector('italian', coalesce(title, '')), 'A') ||
    setweight(to_tsvector('italian', coalesce(summary, '')), 'B') ||
    setweight(to_tsvector('italian', coalesce(body, '')), 'C')
  ) stored;

create index knowledge_search on public.knowledge_versions using gin (search_vector);

-- ── Ciò che è vero adesso ─────────────────────────────────────────
/*
 * Una riga per informazione: la versione attiva e valida oggi.
 *
 * `distinct on` prende la più recente fra quelle attive nel caso in cui
 * due si sovrappongano — non dovrebbe succedere, ma se succede è meglio
 * rispondere con la più nuova che con una a caso.
 */
create view public.knowledge_current
with (security_invoker = true) as
select distinct on (e.id)
  e.id            as entry_id,
  e.slug,
  e.kind,
  e.audience,
  e.owner_id,
  e.location_id,
  e.tags,
  v.id            as version_id,
  v.version,
  v.title,
  v.body,
  v.summary,
  v.data,
  v.valid_from,
  v.valid_to,
  v.approved_by,
  v.approved_at,
  v.change_note,
  v.created_at    as version_created_at,
  v.search_vector
from public.knowledge_entries e
join public.knowledge_versions v on v.entry_id = e.id
where v.status = 'active'
  and v.valid_from <= current_date
  and (v.valid_to is null or v.valid_to >= current_date)
order by e.id, v.valid_from desc, v.version desc;

comment on view public.knowledge_current is
  'L''unica porta da cui il Brain legge la knowledge base. Ciò che non è qui non è vero oggi.';

-- ── Pubblicare una versione ───────────────────────────────────────
/*
 * Il passaggio da bozza a verità.
 *
 * Chiude la versione precedente il giorno prima che entri in vigore
 * quella nuova, invece di lasciarle sovrapposte: così "quanto costava lo
 * Score a giugno" ha una risposta, ed è una sola.
 */
create or replace function public.publish_knowledge_version(p_version uuid)
returns uuid
language plpgsql
security definer
set search_path = public
as $fn$
declare
  v_entry uuid;
  v_from  date;
begin
  if not public.is_staff() then
    raise exception 'Solo la direzione può pubblicare una versione.';
  end if;

  select entry_id, valid_from into v_entry, v_from
  from public.knowledge_versions
  where id = p_version;

  if v_entry is null then
    raise exception 'Versione inesistente.';
  end if;

  update public.knowledge_versions
  set status   = 'superseded',
      valid_to = least(coalesce(valid_to, v_from - 1), v_from - 1)
  where entry_id = v_entry
    and id <> p_version
    and status = 'active';

  update public.knowledge_versions
  set status      = 'active',
      approved_by = auth.uid(),
      approved_at = now()
  where id = p_version;

  update public.knowledge_entries
  set updated_at = now()
  where id = v_entry;

  perform public.emit_event(
    'knowledge.published', 'knowledge', v_entry, null, null,
    jsonb_build_object('version_id', p_version)
  );

  return v_entry;
end;
$fn$;

-- ── Ricerca ───────────────────────────────────────────────────────
/*
 * Cerca solo fra ciò che è vero oggi.
 *
 * Volutamente non c'è modo di cercare nelle versioni superate: chi vuole
 * la storia di un'informazione la apre e la legge, non ci inciampa
 * mentre cerca il prezzo.
 */
create or replace function public.search_knowledge(p_query text, p_limit integer default 8)
returns table (
  entry_id uuid,
  slug     text,
  kind     knowledge_kind,
  title    text,
  summary  text,
  body     text,
  data     jsonb,
  version  integer,
  valid_from date,
  rank     real
)
language sql
stable
as $fn$
  select k.entry_id, k.slug, k.kind, k.title, k.summary, k.body, k.data,
         k.version, k.valid_from,
         ts_rank(k.search_vector, websearch_to_tsquery('italian', p_query)) as rank
  from public.knowledge_current k
  where p_query is null
     or btrim(p_query) = ''
     or k.search_vector @@ websearch_to_tsquery('italian', p_query)
  order by rank desc, k.valid_from desc
  limit greatest(1, least(coalesce(p_limit, 8), 25));
$fn$;

-- ── Chi legge, chi scrive ─────────────────────────────────────────
alter table public.knowledge_entries  enable row level security;
alter table public.knowledge_versions enable row level security;

-- Tutto lo staff legge la memoria aziendale: è il suo scopo. Ciò che è
-- `public` lo legge anche un paziente — sono le informazioni che
-- finiscono comunque sul sito.
create policy knowledge_entries_read on public.knowledge_entries
  for select using (public.is_internal() or audience = 'public');

create policy knowledge_entries_write on public.knowledge_entries
  for all using (public.is_staff()) with check (public.is_staff());

-- Il marketing può aprire una voce nuova sui temi che gli competono.
create policy knowledge_entries_marketing on public.knowledge_entries
  for insert with check (
    public.is_marketing() and kind in ('brand', 'marketing', 'script', 'faq')
  );

create policy knowledge_versions_read on public.knowledge_versions
  for select using (
    public.is_internal()
    or exists (
      select 1 from public.knowledge_entries e
      where e.id = entry_id and e.audience = 'public'
    )
  );

create policy knowledge_versions_write on public.knowledge_versions
  for all using (public.is_staff()) with check (public.is_staff());

/*
 * Il marketing scrive bozze, non verità.
 *
 * Può proporre una versione nuova di ciò che gli compete; a pubblicarla
 * è `publish_knowledge_version`, che chiede la direzione. È la stessa
 * separazione fra proposta e approvazione che vale per i dati clinici,
 * applicata alle informazioni commerciali.
 */
create policy knowledge_versions_marketing_draft on public.knowledge_versions
  for insert with check (
    public.is_marketing()
    and status = 'draft'
    and exists (
      select 1 from public.knowledge_entries e
      where e.id = entry_id and e.kind in ('brand', 'marketing', 'script', 'faq')
    )
  );

-- ═══════════════════════════════════════════════════════════════════
-- Il primo contenuto della memoria
--
-- Non è un esempio: è l'ossatura di ciò che Unique sa di sé. I valori
-- economici vanno confermati dall'amministrazione — ogni versione porta
-- la nota che dice da dove arriva.
-- ═══════════════════════════════════════════════════════════════════

insert into public.knowledge_entries (slug, kind, title, audience, tags) values
  ('brand-identita',        'brand',    'Identità Unique: mission, posizionamento, tono di voce', 'internal', array['brand', 'tono di voce']),
  ('brand-sistema-visivo',  'brand',    'Sistema visivo: colori, tipografia, stile grafico',      'internal', array['brand', 'design']),
  ('listino-servizi',       'listino',  'Listino servizi',                                        'public',   array['prezzi', 'listino']),
  ('listino-membership',    'listino',  'Membership e crediti',                                   'public',   array['prezzi', 'membership']),
  ('servizio-longevity-score', 'servizio', 'Unique Longevity Score',                              'public',   array['score', 'servizio']),
  ('faq-longevity-score',   'faq',      'Domande frequenti sul Longevity Score',                  'public',   array['faq', 'score']),
  ('procedura-accoglienza', 'procedura','Accoglienza del paziente in sede',                       'internal', array['operations']),
  ('procedura-disdetta',    'procedura','Disdette, riprogrammazioni e mancate presentazioni',     'internal', array['operations', 'crediti']),
  ('marketing-linee-guida', 'marketing','Linee guida di comunicazione',                           'internal', array['marketing'])
on conflict (slug) do nothing;

-- Una funzione di comodo per il seed: crea la versione e la attiva senza
-- passare da `publish_knowledge_version`, che richiede un utente.
create or replace function public.seed_knowledge(
  p_slug text,
  p_body text,
  p_summary text,
  p_data jsonb default '{}'::jsonb,
  p_version integer default 1,
  p_from date default current_date,
  p_note text default 'Prima stesura da brief del founder. Da confermare con amministrazione e direzione clinica.'
)
returns void
language plpgsql
as $fn$
declare
  v_entry uuid;
  v_title text;
begin
  select id, title into v_entry, v_title from public.knowledge_entries where slug = p_slug;
  if v_entry is null then return; end if;

  insert into public.knowledge_versions
    (entry_id, version, status, title, body, summary, data, valid_from, change_note)
  values
    (v_entry, p_version, 'active', v_title, p_body, p_summary, p_data, p_from, p_note)
  on conflict (entry_id, version) do nothing;
end;
$fn$;

select public.seed_knowledge(
  'brand-identita',
  E'**Mission.** Rendere misurabile la salute e allungare gli anni in cui una persona sta bene, non solo quelli in cui è viva.\n\n' ||
  E'**Posizionamento.** Non un poliambulatorio con qualche esame in più: una longevity clinic che unisce medicina, nutrizione, movimento, mente e dati in un percorso unico, misurato nel tempo dall''Unique Longevity Score.\n\n' ||
  E'**Target.** Adulti 30–60 anni, professionisti e imprenditori, che hanno i mezzi per occuparsi della propria salute e nessun tempo da perdere in percorsi frammentati. In seconda battuta sportivi e persone con una familiarità che li ha spaventati.\n\n' ||
  E'**Tono di voce.** Diretto, competente, mai allarmista. Si parla di dati, non di miracoli. Niente superlativi, niente promesse di guarigione, niente urgenza artificiale. Una frase in meno è quasi sempre meglio di una in più.\n\n' ||
  E'**Cosa non diciamo mai.** Diagnosi in un contenuto. Percentuali senza fonte. "Il segreto che i medici non ti dicono". Paragoni con altri centri. Prima/dopo di persone reali.',
  'Mission, posizionamento, target, tono di voce e limiti espressivi del brand Unique.',
  '{}'::jsonb
);

select public.seed_knowledge(
  'brand-sistema-visivo',
  E'**Colori.** Bianco osso come fondo, rosso Unique come unico accento, inchiostro quasi nero per il testo. Il rosso si usa una volta per schermata: se è ovunque non è un accento, è rumore.\n\n' ||
  E'**Tipografia.** Fraunces per i titoli e i numeri grandi, Inter per il testo e l''interfaccia. Cifre tabulari ovunque compaia un numero che cambia.\n\n' ||
  E'**Stile grafico.** Pochi elementi per schermata, molto respiro, nessuna ombra dura. Le immagini sono fotografiche e sobrie: persone vere, luce naturale, niente stock di camici e stetoscopi.\n\n' ||
  E'**Movimento.** Misurato. Le cose entrano una volta sola e non si ripetono. Chi ha chiesto meno animazioni al sistema operativo non deve vederle qui.\n\n' ||
  E'**La Signature.** Il Longevity Score ha una forma generativa unica per ogni paziente, derivata dai sette pilastri. È l''unico elemento spettacolare consentito, e proprio per questo resta uno solo.',
  'Colori, tipografia, stile grafico e movimento del sistema visivo Unique.',
  '{}'::jsonb
);

select public.seed_knowledge(
  'listino-servizi',
  E'Prezzi al pubblico, IVA inclusa. Il listino operativo vive nella tabella `services`: qui c''è la versione che si legge e si comunica.\n\n' ||
  E'- Unique Longevity Score: 149 €\n' ||
  E'- Consulenza longevity: 200 €\n' ||
  E'- Visita nutrizionale: 120 €\n' ||
  E'- Seduta di osteopatia: 90 €\n' ||
  E'- Colloquio psicologico: 100 €\n' ||
  E'- Body scan e composizione: 80 €\n' ||
  E'- Test da sforzo: 300 €\n' ||
  E'- IV Therapy: 250 €\n\n' ||
  E'Ogni variazione di prezzo apre una versione nuova di questa voce, con la data da cui vale. Il prezzo di ieri resta leggibile: serve a rispondere a un paziente che mostra un preventivo vecchio.',
  'Prezzi al pubblico dei servizi Unique, con la data da cui valgono.',
  jsonb_build_object(
    'valuta', 'EUR',
    'prezzi_cents', jsonb_build_object(
      'longevity-score', 14900,
      'consulenza-longevity', 20000,
      'visita-nutrizionale', 12000,
      'osteopatia', 9000,
      'psicologia', 10000,
      'body-scan', 8000,
      'test-da-sforzo', 30000,
      'iv-therapy', 25000
    )
  ),
  2,
  current_date,
  'Aggiornamento Longevity Score da 129 € a 149 €. Da confermare con amministrazione.'
);

-- La versione precedente esiste perché la domanda "quanto costava prima"
-- deve avere una risposta, e perché il sistema deve poter dimostrare che
-- non risponde più con quella.
insert into public.knowledge_versions
  (entry_id, version, status, title, body, summary, data, valid_from, valid_to, change_note)
select
  e.id, 1, 'superseded', e.title,
  E'Unique Longevity Score: 129 €. Listino in vigore fino al giorno precedente l''aggiornamento.',
  'Listino precedente.',
  jsonb_build_object('valuta', 'EUR', 'prezzi_cents', jsonb_build_object('longevity-score', 12900)),
  current_date - 180, current_date - 1,
  'Listino di apertura.'
from public.knowledge_entries e
where e.slug = 'listino-servizi'
on conflict (entry_id, version) do nothing;

select public.seed_knowledge(
  'listino-membership',
  E'La membership è un abbonamento annuale che assegna crediti spendibili sulle prestazioni.\n\n' ||
  E'- Essential — 12 crediti l''anno\n' ||
  E'- Performance — 24 crediti l''anno\n' ||
  E'- Signature — 48 crediti l''anno, con Longevity Score semestrale\n\n' ||
  E'Un credito vale una prestazione standard; le prestazioni lunghe o strumentali ne valgono due. I crediti non consumati non si trasferiscono all''anno successivo: la membership compra un percorso, non un magazzino.\n\n' ||
  E'Prezzi e numero di crediti per piano vivono in `membership_tiers` e vanno confermati dall''amministrazione.',
  'Piani di membership, crediti assegnati e regole di consumo.',
  '{}'::jsonb
);

select public.seed_knowledge(
  'servizio-longevity-score',
  E'L''Unique Longevity Score è la misura sintetica dello stato di salute di una persona: un numero da 0 a 100 composto da sette pilastri — metabolico, cardiovascolare, composizione corporea, infiammazione, ormonale, cognitivo-mentale, stile di vita.\n\n' ||
  E'**Come si ottiene.** Un pannello ematochimico, una valutazione clinica, una body scan e un questionario. I dati confluiscono nel motore di calcolo, che normalizza ogni parametro e pesa i pilastri.\n\n' ||
  E'**Cosa non è.** Non è una diagnosi e non sostituisce un parere medico. Un punteggio alto non esclude una malattia, uno basso non ne annuncia una.\n\n' ||
  E'**Copertura dei dati.** Il punteggio dichiara sempre su quanti dei parametri previsti è stato calcolato. Un pilastro senza dati sufficienti resta non calcolato: è un''informazione, non uno zero.\n\n' ||
  E'**Ogni quanto si rifà.** Ogni sei mesi nel percorso standard, ogni tre nei percorsi intensivi.',
  'Che cos''è il Longevity Score, come si ottiene, cosa non è.',
  '{}'::jsonb
);

select public.seed_knowledge(
  'faq-longevity-score',
  E'**Serve essere a digiuno?** Sì, per il prelievo: dodici ore.\n\n' ||
  E'**In quanto tempo ho il risultato?** Il punteggio si calcola quando arrivano gli esami, di norma entro cinque giorni lavorativi. Il medico lo commenta in visita.\n\n' ||
  E'**Posso portare esami fatti altrove?** Sì, se recenti. Vengono letti, validati da un professionista e inseriti nel punteggio.\n\n' ||
  E'**Il punteggio è una diagnosi?** No. È una misura di sintesi che serve a orientare il percorso e a vedere se sta funzionando.\n\n' ||
  E'**Perché il mio punteggio è sceso?** Perché è cambiato un parametro, o perché sono arrivati dati che prima mancavano. La scheda mostra sempre quale pilastro si è mosso.',
  'Le domande che arrivano davvero sul Longevity Score, con le risposte da dare.',
  '{}'::jsonb
);

select public.seed_knowledge(
  'procedura-accoglienza',
  E'1. Il paziente arriva: si verifica l''appuntamento in agenda e si conferma la presenza.\n' ||
  E'2. Prima visita: si raccolgono consensi privacy e trattamento dati, e si apre l''anagrafica.\n' ||
  E'3. Si controlla che i documenti richiesti siano stati caricati; se mancano, si sollecitano prima della visita, non dopo.\n' ||
  E'4. Si verifica il saldo crediti: se non basta, se ne parla al banco, mai in ambulatorio.\n' ||
  E'5. A visita conclusa si registra l''esito e si fissa il passo successivo del percorso.\n\n' ||
  E'Regola generale: nessuna informazione clinica passa dal banco. La reception non commenta referti né punteggi.',
  'Come si accoglie un paziente in sede, passo per passo.',
  '{}'::jsonb
);

select public.seed_knowledge(
  'procedura-disdetta',
  E'Il credito segue una regola sola, applicata dal database e non dalla buona volontà di chi registra.\n\n' ||
  E'- Disdetta con più di 24 ore di preavviso: il credito torna disponibile.\n' ||
  E'- Disdetta entro le 24 ore: il credito viene addebitato.\n' ||
  E'- Mancata presentazione: il credito viene addebitato.\n' ||
  E'- Riprogrammazione: il credito resta impegnato e si sposta con l''appuntamento.\n\n' ||
  E'Le eccezioni le autorizza la direzione e lasciano una riga nel registro con la motivazione. Un movimento senza motivazione non è un''eccezione, è un buco.',
  'Regole di disdetta, riprogrammazione e no-show, e cosa succede al credito.',
  jsonb_build_object('ore_preavviso', 24)
);

select public.seed_knowledge(
  'marketing-linee-guida',
  E'**Promessa.** Si comunica un metodo, non un risultato garantito. "Misuriamo dove sei e costruiamo il percorso" è dicibile; "ti facciamo ringiovanire di dieci anni" non lo è.\n\n' ||
  E'**Claim vietati.** Guarigione, prevenzione garantita, diagnosi, confronti con altri centri, testimonianze cliniche di pazienti riconoscibili.\n\n' ||
  E'**Struttura di un contenuto.** Un''idea per contenuto. Apertura che nomina il problema, tre punti al massimo, chiusura con un passo concreto e uno solo.\n\n' ||
  E'**Formati.** Reel 20–40 secondi, caroselli da 6 a 8 tavole, landing con una sola call to action ripetuta.\n\n' ||
  E'**Fonti.** Ogni affermazione scientifica in un contenuto deve poter risalire a uno studio citabile. Se non si trova la fonte, si cambia la frase.',
  'Come si comunica Unique: promessa, claim vietati, struttura e formati.',
  '{}'::jsonb
);

drop function public.seed_knowledge(text, text, text, jsonb, integer, date, text);
