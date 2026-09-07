-- ═══════════════════════════════════════════════════════════════════
-- La timeline clinica, per intero
--
-- `patient_timeline` esisteva già e univa cinque cose: punteggi, visite,
-- documenti e i due estremi di un percorso. Bastava a raccontare
-- l'andamento di una persona, non a rispondere alla domanda che un
-- medico si fa aprendo una cartella che non conosce: **cosa è successo
-- a questa persona, in ordine, e cosa le è stato fatto.**
--
-- Mancavano gli esami, le terapie, le note e ciò che ci si è detti. E
-- mancava il modo di guardarne una fetta sola: una timeline senza filtri
-- si legge intera o non si legge, e a trecento righe non la legge più
-- nessuno.
--
-- Da qui due cambiamenti, e uno è più profondo dell'altro.
--
--   **Una colonna `category`.** Non è `kind` con un altro nome: `kind`
--   dice da quale tabella viene la riga — serve a disegnarla — mentre
--   `category` dice a quale domanda risponde, e sono raggruppamenti
--   diversi. Un referto di laboratorio e un valore approvato sono due
--   `kind` distinti e la stessa categoria «esami»; una prescrizione e un
--   passo del piano di cura vengono da due tabelle lontanissime e sono
--   entrambi «terapie».
--
--   **Gli esami si aggregano per giornata.** Un pannello lipidico sono
--   ventiquattro righe in `measurements`, e ventiquattro righe di
--   timeline per un prelievo solo seppelliscono tutto il resto. Qui
--   diventano una riga: «Esami — 24 parametri», con la data. Chi vuole i
--   valori ha la sezione «Clinico», che è fatta per quello.
--
-- La vista resta `security_invoker`: ognuno vede nella timeline
-- esattamente ciò che vedrebbe altrove, e nulla di più. È la ragione per
-- cui le comunicazioni interne possono starci dentro senza che il
-- paziente ne veda mai una — la Row Level Security di
-- `conversation_messages` non gli restituisce nulla, e la riga sparisce
-- da sé.
-- ═══════════════════════════════════════════════════════════════════

/*
 * Si elimina e si ricrea, non si sostituisce.
 *
 * `create or replace view` non sa aggiungere una colonna in mezzo né
 * rinominarne una: rifiuta la sostituzione con un errore che parla di
 * tipi. Con una vista che nessun'altra vista usa — e questa lo è — la
 * strada onesta è cancellarla.
 */
drop view if exists public.patient_timeline;

create view public.patient_timeline
with (security_invoker = true) as

  -- ── Punteggio ───────────────────────────────────────────────────
  select
    s.patient_id,
    (s.measured_on::timestamp at time zone 'Europe/Rome') as occurred_at,
    'score'::text                                         as kind,
    'punteggio'::text                                     as category,
    ('Unique Longevity Score — ' || round(s.score)::text)  as title,
    s.summary                                             as detail,
    s.id                                                  as ref_id
  from public.longevity_scores s

  union all

  -- ── Visite ──────────────────────────────────────────────────────
  select
    a.patient_id,
    a.starts_at,
    'appointment'::text,
    'visite'::text,
    a.service_name,
    a.location,
    a.id
  from public.appointments a
  where a.status in ('scheduled', 'confirmed', 'completed')

  union all

  /*
   * ── Referti ────────────────────────────────────────────────────
   *
   * Un referto non è «un documento»: è il risultato di un esame, ed è
   * ciò che un medico cerca quando scorre una storia clinica. Tenerlo
   * nella stessa categoria di un consenso firmato o di una fattura
   * significa che il filtro «documenti» restituisce trenta righe di cui
   * due interessano.
   */
  select
    d.patient_id,
    d.created_at,
    'report'::text,
    'referti'::text,
    d.title,
    case d.kind when 'imaging' then 'Imaging' else 'Laboratorio' end,
    d.id
  from public.documents d
  where d.kind in ('lab_report', 'imaging')

  union all

  -- ── Prescrizioni e piani di cura, che sono documenti ma dicono
  --    cosa fare, non cosa è stato trovato.
  select
    d.patient_id,
    d.created_at,
    'prescription'::text,
    'terapie'::text,
    d.title,
    case d.kind when 'prescription' then 'Prescrizione' else 'Piano di cura' end,
    d.id
  from public.documents d
  where d.kind in ('prescription', 'care_plan')

  union all

  -- ── Tutto il resto della carta: consensi, fatture, altro.
  select
    d.patient_id,
    d.created_at,
    'document'::text,
    'documenti'::text,
    d.title,
    null::text,
    d.id
  from public.documents d
  where d.kind in ('consent', 'invoice', 'other')

  union all

  /*
   * ── Esami ──────────────────────────────────────────────────────
   *
   * Una riga per giornata di prelievo, non una per analita. Il conteggio
   * sta nel titolo perché è l'unica cosa che serve sapere scorrendo — se
   * i parametri interessano, la sezione «Clinico» li mostra tutti con i
   * loro intervalli.
   *
   * Come `ref_id` la prima misura della giornata in ordine di id: un
   * aggregato non ha una chiave propria, e la lista in pagina ne
   * pretende una stabile. `min()` sarebbe stato più leggibile e non
   * esiste per gli uuid — Postgres non definisce un ordinamento
   * aggregabile su quel tipo.
   */
  select
    m.patient_id,
    (m.measured_on::timestamp at time zone 'Europe/Rome'),
    'measurement'::text,
    'esami'::text,
    ('Esami — ' || count(*)::text || case when count(*) = 1 then ' parametro' else ' parametri' end),
    -- I primi tre nomi, per riconoscere il pannello senza aprirlo.
    (
      array_to_string(
        (array_agg(m.label order by m.label))[1:3],
        ', '
      )
      || case when count(*) > 3 then '…' else '' end
    ),
    (array_agg(m.id order by m.id))[1]
  from public.measurements m
  group by m.patient_id, m.measured_on

  union all

  /*
   * ── Terapie e azioni del piano ─────────────────────────────────
   *
   * `recommended_actions` è il piano di cura per come lo vede il
   * paziente: cosa deve fare, entro quando, con quale priorità. In una
   * storia clinica è la riga «cosa le è stato prescritto di fare», e
   * senza di essa la timeline racconta solo ciò che è stato misurato.
   */
  select
    r.patient_id,
    r.created_at,
    'therapy'::text,
    'terapie'::text,
    r.title,
    r.description,
    r.id
  from public.recommended_actions r

  union all

  /*
   * ── Note cliniche ──────────────────────────────────────────────
   *
   * La policy di `clinical_notes` distingue già chi legge: il care team
   * le vede tutte, il paziente solo quelle marcate come sue. Qui non c'è
   * nessun `where` sulla visibilità, ed è deliberato — aggiungerlo
   * significherebbe scrivere la stessa regola in due posti, e il giorno
   * in cui cambia ne cambierebbe uno solo.
   */
  select
    n.patient_id,
    n.created_at,
    'note'::text,
    'note'::text,
    coalesce(n.title, case n.kind
      when 'visit_summary' then 'Sintesi della visita'
      when 'assessment'    then 'Valutazione'
      else 'Nota clinica'
    end),
    left(n.body, 200),
    n.id
  from public.clinical_notes n

  union all

  /*
   * ── Comunicazioni con il paziente ──────────────────────────────
   *
   * Una riga per conversazione e non per messaggio: quaranta battute su
   * un cambio di appuntamento non sono quaranta fatti clinici. La data è
   * quella dell'ultimo messaggio, perché è quando la conversazione
   * conta.
   */
  select
    t.patient_id,
    t.last_message_at,
    'thread'::text,
    'comunicazioni'::text,
    t.subject,
    case t.category when 'clinical' then 'Con il paziente · clinica'
                    else 'Con il paziente · amministrativa' end,
    t.id
  from public.message_threads t

  union all

  /*
   * ── Comunicazioni interne ──────────────────────────────────────
   *
   * Consulti e conversazioni fra reparti collegate a questa persona. Il
   * paziente non ne vedrà mai una: la Row Level Security di
   * `conversations` chiede di esserne partecipe, e lui non lo è. È la
   * ragione per cui `security_invoker` sulla vista non è un dettaglio di
   * configurazione ma la cosa che rende questa union sicura.
   */
  select
    c.patient_id,
    c.last_message_at,
    case when c.kind = 'consultation' then 'consultation' else 'internal' end,
    'comunicazioni'::text,
    c.title,
    case when c.kind = 'consultation' then 'Consulto specialistico'
         else 'Comunicazione interna' end,
    c.id
  from public.conversations c
  where c.patient_id is not null

  union all

  -- ── Percorso ────────────────────────────────────────────────────
  select
    e.patient_id,
    (e.started_on::timestamp at time zone 'Europe/Rome'),
    'program_start'::text,
    'percorso'::text,
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
    'percorso'::text,
    ('Percorso concluso — ' || p.name),
    null::text,
    e.id
  from public.program_enrollments e
  join public.programs p on p.id = e.program_id
  where e.status = 'completed';

comment on view public.patient_timeline is
  'Storia del paziente in ordine cronologico, ricostruita dalle tabelle di dominio. `kind` dice da dove viene la riga e serve a disegnarla; `category` dice a quale domanda risponde e serve a filtrarla.';
