-- ═══════════════════════════════════════════════════════════════════
-- Il Command Center
--
-- Una domanda sola: **cosa sta succedendo in clinica adesso.**
--
-- Unique sapeva già rispondere a «come va il mese» (`/control`) e a
-- «cosa devo fare io oggi» (`/pro`). Non sapeva rispondere a quella in
-- mezzo, che è la domanda di chi manda avanti la giornata: quante
-- persone ci sono, quante code si stanno allungando, cosa non ha
-- ancora preso in carico nessuno.
--
-- ---
--
-- **Perché una funzione e non dieci query.**
--
-- Le code sono otto, e otto `select count(*)` dal server sono otto
-- viaggi di rete per disegnare una schermata che si aggiorna in tempo
-- reale. Qui è un viaggio solo, e i conteggi li fa Postgres dove i
-- dati già stanno.
--
-- **E soprattutto: non è `security definer`.**
--
-- È la scelta che regge tutto il file. Una funzione definer avrebbe
-- contato per tutti allo stesso modo, e avrebbe mostrato alla
-- reception quanti valori clinici sono in attesa di approvazione —
-- cioè avrebbe scavalcato la Row Level Security nell'unico posto in
-- cui è comodo scavalcarla, un cruscotto.
--
-- Così invece ogni conteggio è **ciò che chi guarda avrebbe visto
-- aprendo la pagina corrispondente**. La direzione ottiene la clinica,
-- un medico ottiene i suoi pazienti, la reception ottiene zero sulle
-- righe cliniche. Non perché la pagina lo controlli: perché la RLS
-- filtra le righe prima che vengano contate.
-- ═══════════════════════════════════════════════════════════════════

/**
 * Lo stato operativo, in un oggetto solo.
 *
 * `stable` e non `immutable`: legge tabelle. Diritti dell'invocante,
 * che è il punto (vedi sopra).
 *
 * Le tre cifre in cima e le code sotto rispondono a due domande
 * diverse — «quanto grande è oggi» e «cosa è fermo» — e stanno nello
 * stesso oggetto perché si guardano insieme.
 */
create or replace function public.command_center()
returns jsonb
language sql
stable
set search_path = public
as $fn$
  select jsonb_build_object(
    -- ── La scala ────────────────────────────────────────────────
    'pazienti', (
      select count(*) from public.patients
    ),
    /*
     * Non «ricoveri»: Unique è una clinica ambulatoriale e non ha
     * degenze. Disegnare un contatore di posti letto su tabelle
     * inesistenti avrebbe prodotto la cosa peggiore in un sistema
     * clinico — un numero che nessuno può verificare guardando
     * altrove.
     */
    'oggi', (
      select count(*) from public.appointments
      where starts_at >= date_trunc('day', now() at time zone 'Europe/Rome') at time zone 'Europe/Rome'
        and starts_at <  (date_trunc('day', now() at time zone 'Europe/Rome') + interval '1 day') at time zone 'Europe/Rome'
        and status not in ('cancelled', 'no_show')
    ),
    -- Urgente e critico insieme: sono le due priorità che in
    -- `comunicazioni` accendono una notifica che interrompe.
    'urgenti', (
      select count(*) from public.clinical_consultations
      where status not in ('closed', 'answered')
        and priority in ('urgent', 'critical')
    ),

    -- ── Le code ─────────────────────────────────────────────────
    'code', jsonb_build_object(
      -- Nessuno l'ha ancora preso in carico. È la coda che pesa di
      -- più: un parere non assegnato non è in ritardo di qualcuno,
      -- è in ritardo di nessuno.
      'consulti', (
        select count(*) from public.clinical_consultations
        where status = 'open'
      ),
      -- Chiesto, mai eseguito. Il primo anello, e quello che fa male:
      -- un esame che non arriva non si vede da nessuna parte.
      'prelievi', (
        select count(*) from public.lab_orders
        where status = 'requested'
      ),
      -- Un numero uscito da uno strumento, non ancora un numero di
      -- cui qualcuno risponde.
      'validazioni', (
        select count(*) from public.lab_orders
        where status = 'resulted'
      ),
      -- Valori letti da un referto, in attesa di un professionista.
      'valori', (
        select count(*) from public.measurement_proposals
        where status = 'needs_review'
      ),
      /*
       * Dosi previste, scadute, mai registrate.
       *
       * Non «in attesa»: l'orario è passato. Una riga così dice che
       * nessuno ha scritto niente — che è diverso da «non data», ed è
       * l'unica delle code che riguarda una cosa già successa.
       *
       * Un'ora di tolleranza perché un giro delle otto si registra
       * alle otto e venti, e una coda che si accende puntuale a ogni
       * orario previsto smette di significare qualcosa.
       */
      'dosi', (
        select count(*) from public.medication_administrations
        where status = 'due' and scheduled_at < now() - interval '1 hour'
      ),
      -- Referti letti dall'OCR e mai portati in cartella da nessuno.
      'referti', (
        select count(*) from public.document_extractions e
        where not exists (
          select 1 from public.document_reviews r
          where r.extraction_id = e.id
        )
      )
    )
  );
$fn$;

comment on function public.command_center is
  'Lo stato operativo della clinica in un oggetto. Diritti dell''invocante: ogni conteggio è ciò che chi chiama avrebbe visto aprendo la pagina corrispondente.';

grant execute on function public.command_center() to authenticated;

/**
 * Le righe di una coda.
 *
 * Un cruscotto che sa dire «otto» e non sa dire *quali otto* costringe
 * a fidarsi del numero, e un numero di cui non si può guardare dentro
 * è una decorazione. Qui ogni conteggio si apre.
 *
 * Stessa scelta della funzione sopra: **diritti dell'invocante.** Le
 * righe passano dalle policy, e il join su `patients` è un `left join`
 * di proposito — se chi guarda vede la richiesta ma non il paziente,
 * la riga resta e il nome no. Un `inner join` l'avrebbe fatta sparire,
 * e un elenco di sette righe sotto un contatore che dice otto è il
 * modo più veloce per far smettere di credere a entrambi.
 *
 * `p_coda` è testo e non un enum: le code sono una decisione di
 * prodotto e cambiano più spesso di uno schema. Un valore ignoto torna
 * zero righe, che è ciò che deve fare.
 */
create or replace function public.command_center_queue(
  p_coda   text,
  p_quante int default 12
)
returns table (
  id        uuid,
  patient   uuid,
  paziente  text,
  titolo    text,
  dettaglio text,
  quando    timestamptz
)
language sql
stable
set search_path = public
as $fn$
  -- Richieste di parere che non ha preso in carico nessuno.
  select c.id, c.patient_id, pr.full_name,
         c.reason,
         coalesce(d.name, 'Reparto non indicato'),
         c.created_at
  from public.clinical_consultations c
  left join public.patients pa on pa.id = c.patient_id
  left join public.profiles pr on pr.id = pa.profile_id
  left join public.departments d on d.id = c.target_department_id
  where p_coda = 'consulti' and c.status = 'open'

  union all

  -- Dosi previste, scadute, mai registrate.
  select a.id, a.patient_id, pr.full_name,
         p.medication,
         concat_ws(' · ', p.dose, p.route::text),
         a.scheduled_at
  from public.medication_administrations a
  join public.prescriptions p on p.id = a.prescription_id
  left join public.patients pa on pa.id = a.patient_id
  left join public.profiles pr on pr.id = pa.profile_id
  where p_coda = 'dosi'
    and a.status = 'due'
    and a.scheduled_at < now() - interval '1 hour'

  union all

  -- Risultati in attesa di una firma, e prelievi mai eseguiti: due
  -- stati della stessa tabella, quindi un ramo solo con lo stato preso
  -- dalla coda chiesta.
  select o.id, o.patient_id, pr.full_name,
         coalesce(o.panel, 'Esame'),
         coalesce(o.clinical_question, ''),
         case p_coda when 'prelievi' then o.requested_at else o.resulted_at end
  from public.lab_orders o
  left join public.patients pa on pa.id = o.patient_id
  left join public.profiles pr on pr.id = pa.profile_id
  where p_coda in ('prelievi', 'validazioni')
    and o.status = (case p_coda when 'prelievi' then 'requested' else 'resulted' end)::lab_order_status

  union all

  -- Valori letti da un referto, in attesa di un professionista.
  select m.id, m.patient_id, pr.full_name,
         m.label,
         concat_ws(' ', m.value::text, m.unit),
         m.created_at
  from public.measurement_proposals m
  left join public.patients pa on pa.id = m.patient_id
  left join public.profiles pr on pr.id = pa.profile_id
  where p_coda = 'valori' and m.status = 'needs_review'

  union all

  -- Referti letti dall'OCR e mai portati in cartella.
  select e.id, e.patient_id, pr.full_name,
         coalesce(e.document_type, 'Documento'),
         coalesce(e.laboratory, ''),
         e.created_at
  from public.document_extractions e
  left join public.patients pa on pa.id = e.patient_id
  left join public.profiles pr on pr.id = pa.profile_id
  where p_coda = 'referti'
    and not exists (
      select 1 from public.document_reviews r where r.extraction_id = e.id
    )

  order by 6 asc
  limit greatest(1, least(coalesce(p_quante, 12), 50));
$fn$;

comment on function public.command_center_queue is
  'Le righe dietro un conteggio del Command Center. Diritti dell''invocante: chi non vedrebbe la riga altrove non la vede qui.';

grant execute on function public.command_center_queue(text, int) to authenticated;

/*
 * Il feed in tempo reale.
 *
 * `domain_events` è la tabella giusta da ascoltare per una schermata
 * che sta aperta su un monitor: ogni fatto della clinica ci passa, e
 * una sottoscrizione sola sostituisce le sei che servirebbero per
 * seguire le sei code. Le code si rileggono comunque a ogni evento —
 * `command_center()` è un viaggio.
 *
 * `clinical_consultations` ci sta accanto perché una richiesta di
 * parere cambia stato senza emettere un evento a ogni passaggio, e
 * «preso in carico» è esattamente ciò che questa schermata deve
 * smettere di mostrare nel momento in cui succede.
 *
 * La RLS vale anche qui: Realtime la valuta per ogni sottoscrittore, e
 * una riga che non si vede non arriva nemmeno come evento.
 */
do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    begin
      execute 'alter publication supabase_realtime add table public.domain_events';
    exception when duplicate_object then null;
    end;
    begin
      execute 'alter publication supabase_realtime add table public.clinical_consultations';
    exception when duplicate_object then null;
    end;
  end if;
end $$;
