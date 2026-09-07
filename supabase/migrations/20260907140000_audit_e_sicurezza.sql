-- ═══════════════════════════════════════════════════════════════════
-- Il registro che non si può riscrivere
--
-- Unique aveva già tre cose che quasi nessuno ha: la Row Level Security
-- su ogni tabella clinica, un registro degli **accessi** (`audit_log`,
-- scritto da `log_clinical_access`) e un registro degli **eventi**
-- (`domain_events`, append-only). Mancavano tre cose, e ognuna è il
-- genere di mancanza che si scopre il giorno peggiore.
--
--   **Le scritture non erano nel registro.** «Chi ha aperto la cartella»
--   sì; «chi ha cambiato la terapia» no — quello stava in
--   `domain_events`, che è un'altra tabella, con un'altra policy, e che
--   la direzione legge tutta mentre un medico non la legge affatto. Due
--   registri per una domanda sola: *chi ha fatto cosa a questa persona.*
--
--   **Il registro era immutabile per convenzione, non per costruzione.**
--   Nessuna policy di update o delete significa che nessun *client* può
--   riscriverlo. Non significa che nessuno possa: chi ha la chiave di
--   servizio scavalca la Row Level Security, e una riga cancellata da lì
--   non lascia traccia di essere mancata.
--
--   **Non c'era modo di accorgersi di una manomissione.** È la
--   differenza fra un registro e un registro credibile: non basta che
--   sia difficile cambiarlo, deve essere possibile *dimostrare* che non
--   è stato cambiato.
--
-- ---
--
-- La catena di hash.
--
-- Ogni riga porta l'impronta della riga precedente dentro la propria.
-- Cambiare una riga qualsiasi rompe tutte quelle dopo, e la rottura si
-- vede: `verify_audit_chain()` la trova e dice da dove comincia. Non
-- impedisce la manomissione — niente in un database la impedisce a chi
-- ha le chiavi — la rende **evidente**, che è l'unica proprietà
-- ottenibile e l'unica che serve davvero in un contenzioso.
--
-- Il trigger prende un lock: due inserimenti simultanei leggerebbero la
-- stessa «ultima riga» e produrrebbero due anelli con lo stesso
-- predecessore, cioè una catena che si biforca. Serializzare le
-- scritture di un registro è un costo che si può pagare; una catena che
-- si biforca non è una catena.
-- ═══════════════════════════════════════════════════════════════════

/* ── Chi ha firmato il referto ─────────────────────────────────── */
/*
 * `laboratory` diceva già *dove* è stato fatto un esame; mancava *chi*
 * l'ha firmato. Serve a sapere a chi chiedere: un valore strano su un
 * referto firmato è una telefonata, su uno anonimo è un'indagine.
 *
 * È un nome letto da un riconoscimento ottico, e vale quanto tale — non
 * identifica nessuno e non attribuisce responsabilità. Sta accanto a
 * `patient_name_on_document`, che porta lo stesso avvertimento per la
 * stessa ragione.
 */
alter table public.document_extractions
  add column if not exists reporting_physician text;

comment on column public.document_extractions.reporting_physician is
  'Il medico firmatario letto sul documento. Serve a sapere a chi chiedere, mai a identificare: è una lettura ottica, non un''attribuzione.';

/* ── L'impronta ────────────────────────────────────────────────── */

alter table public.audit_log
  add column if not exists prev_hash  text,
  add column if not exists entry_hash text;

/**
 * Sigilla una riga.
 *
 * L'impronta comprende il contenuto della riga **e** l'impronta della
 * precedente. È ciò che rende la catena una catena: cambiare una riga
 * in mezzo non basta, bisognerebbe ricalcolare tutte quelle dopo, e per
 * farlo bisognerebbe poter scrivere — cosa che il trigger qui sotto
 * impedisce anche al proprietario della tabella.
 *
 * `pg_advisory_xact_lock` serializza gli inserimenti nel registro. È il
 * prezzo della catena, e in una clinica è impercettibile: si scrive una
 * riga per accesso, non mille al secondo.
 */
create or replace function public.audit_sigilla()
returns trigger
language plpgsql
as $fn$
declare
  v_prev text;
begin
  -- Un numero fisso qualsiasi: identifica *questa* coda di lock.
  perform pg_advisory_xact_lock(hashtext('public.audit_log'));

  select entry_hash into v_prev
  from public.audit_log
  order by id desc
  limit 1;

  new.prev_hash := v_prev;
  new.entry_hash := encode(
    digest(
      coalesce(v_prev, 'genesi')
        || '|' || coalesce(new.actor_id::text, '')
        || '|' || new.action
        || '|' || new.entity
        || '|' || coalesce(new.entity_id::text, '')
        || '|' || coalesce(new.patient_id::text, '')
        || '|' || coalesce(new.metadata::text, '{}')
        || '|' || coalesce(new.created_at, now())::text,
      'sha256'
    ),
    'hex'
  );

  return new;
end;
$fn$;

create trigger audit_log_sigillo
  before insert on public.audit_log
  for each row execute function public.audit_sigilla();

/**
 * Il registro non si modifica e non si cancella.
 *
 * Un trigger e non una policy, ed è tutta la differenza: le policy
 * valgono per i client, i trigger valgono per **chiunque** — compresa
 * la chiave di servizio, compreso il proprietario della tabella. Resta
 * scavalcabile da un superuser che disabiliti il trigger, ed è un limite
 * onesto: a quel punto però la catena di hash si spezza, e la rottura
 * resta visibile.
 */
create or replace function public.audit_immutabile()
returns trigger
language plpgsql
as $fn$
begin
  raise exception
    'Il registro degli accessi non si modifica e non si cancella. Ciò che è successo si compensa con una riga nuova, non riscrivendo la vecchia.';
end;
$fn$;

create trigger audit_log_immutabile
  before update or delete on public.audit_log
  for each row execute function public.audit_immutabile();

/**
 * Verificare la catena.
 *
 * Ricalcola ogni impronta e la confronta con quella scritta. Torna solo
 * le righe che **non** tornano: un risultato vuoto è la prova che il
 * registro non è stato toccato, ed è la sola forma in cui quella prova
 * si può dare.
 *
 * `security definer` perché deve poter leggere tutte le righe, comprese
 * quelle di pazienti che chi verifica non segue: verificare l'integrità
 * non è leggere il contenuto, e infatti non restituisce nessun dato
 * clinico — solo degli identificatori e due impronte.
 */
create or replace function public.verify_audit_chain(
  p_da    bigint default null,
  p_quante integer default 10000
)
returns table (
  id       bigint,
  quando   timestamptz,
  atteso   text,
  trovato  text
)
language plpgsql
security definer
set search_path = public
as $fn$
declare
  r record;
  v_prev text := null;
  v_calcolato text;
  v_prima boolean := true;
begin
  if not public.is_staff() then
    raise exception 'La verifica del registro è riservata alla direzione.';
  end if;

  for r in
    select a.id, a.actor_id, a.action, a.entity, a.entity_id, a.patient_id,
           a.metadata, a.created_at, a.prev_hash, a.entry_hash
    from public.audit_log a
    where p_da is null or a.id >= p_da
    order by a.id
    limit greatest(1, least(coalesce(p_quante, 10000), 200000))
  loop
    -- Le righe scritte prima di questa migrazione non hanno impronta:
    -- non sono una manomissione, sono un prima. La catena comincia
    -- dalla prima riga sigillata.
    if r.entry_hash is null then
      v_prev := null;
      continue;
    end if;

    -- Al primo anello sigillato si accetta il predecessore che porta
    -- scritto: la finestra può cominciare a metà catena.
    if v_prima then
      v_prev := r.prev_hash;
      v_prima := false;
    end if;

    v_calcolato := encode(
      digest(
        coalesce(v_prev, 'genesi')
          || '|' || coalesce(r.actor_id::text, '')
          || '|' || r.action
          || '|' || r.entity
          || '|' || coalesce(r.entity_id::text, '')
          || '|' || coalesce(r.patient_id::text, '')
          || '|' || coalesce(r.metadata::text, '{}')
          || '|' || r.created_at::text,
        'sha256'
      ),
      'hex'
    );

    if v_calcolato is distinct from r.entry_hash then
      id := r.id;
      quando := r.created_at;
      atteso := v_calcolato;
      trovato := r.entry_hash;
      return next;
    end if;

    v_prev := r.entry_hash;
  end loop;
end;
$fn$;

comment on function public.verify_audit_chain is
  'Ricalcola la catena di impronte e restituisce solo le righe che non tornano. Un risultato vuoto è la prova che il registro non è stato toccato.';

-- ═══════════════════════════════════════════════════════════════════
-- Le scritture entrano nel registro
-- ═══════════════════════════════════════════════════════════════════
/*
 * «Il dottor Rossi ha modificato la terapia alle 11:03.»
 *
 * Finora quella frase non si poteva comporre: le scritture producevano
 * un evento di dominio — utile a far scattare notifiche e automazioni —
 * ma `domain_events` è leggibile solo dalla direzione e non risponde
 * alla domanda «chi ha toccato *questa persona*». Adesso ogni scrittura
 * clinica lascia anche una riga nel registro, accanto agli accessi, con
 * lo stesso formato e le stesse policy di lettura.
 *
 * **Non ingoia gli errori**, al contrario di `log_clinical_access`. La
 * differenza è deliberata: una lettura che non si riesce a registrare
 * non deve rompere la pagina di un medico, ma una **scrittura** clinica
 * che non si riesce a registrare non deve avvenire. Un dato in cartella
 * senza traccia di chi ce l'ha messo è peggio di un dato mancante.
 */
create or replace function public.audit_scrittura()
returns trigger
language plpgsql
security definer
set search_path = public
as $fn$
declare
  v_patient uuid;
  v_azione text;
  v_dettagli jsonb := '{}'::jsonb;
begin
  v_patient := case tg_op when 'DELETE' then old.patient_id else new.patient_id end;

  v_azione := tg_table_name || '.' || lower(tg_op);

  -- Il contesto che rende leggibile la riga fra un anno. Mai il
  -- contenuto clinico per intero: il registro dice *cosa è stato
  -- toccato*, non ripete il dato — che vive nella sua tabella e ha le
  -- sue policy.
  if tg_table_name = 'prescriptions' then
    v_dettagli := jsonb_build_object(
      'farmaco', coalesce(new.medication, old.medication),
      'stato',   coalesce(new.status, old.status)::text
    );
  elsif tg_table_name = 'medication_administrations' then
    v_dettagli := jsonb_build_object('stato', coalesce(new.status, old.status)::text);
  elsif tg_table_name = 'lab_orders' then
    v_dettagli := jsonb_build_object(
      'pannello', coalesce(new.panel, old.panel),
      'stato',    coalesce(new.status, old.status)::text
    );
  elsif tg_table_name = 'clinical_notes' then
    v_dettagli := jsonb_build_object('tipo', coalesce(new.kind, old.kind)::text);
  elsif tg_table_name = 'measurements' then
    v_dettagli := jsonb_build_object('parametro', coalesce(new.metric_code, old.metric_code));
  elsif tg_table_name = 'documents' then
    v_dettagli := jsonb_build_object('titolo', coalesce(new.title, old.title));
  end if;

  insert into public.audit_log (actor_id, action, entity, entity_id, patient_id, metadata)
  values (
    auth.uid(),
    v_azione,
    tg_table_name,
    case tg_op when 'DELETE' then old.id else new.id end,
    v_patient,
    v_dettagli
  );

  return case tg_op when 'DELETE' then old else new end;
end;
$fn$;

/*
 * Le sei tabelle su cui una modifica va spiegata.
 *
 * L'elenco è corto di proposito. Tracciare ogni scrittura di ogni
 * tabella produrrebbe un registro in cui la riga che conta sta fra
 * diecimila che non contano — e un registro che non si può leggere non
 * è un registro, è un archivio. Qui ci sono le sei che rispondono alla
 * domanda «cosa è stato fatto a questa persona»: terapia, dosi, esami,
 * note, misure, documenti.
 */
create trigger prescriptions_audit
  after insert or update or delete on public.prescriptions
  for each row execute function public.audit_scrittura();

create trigger administrations_audit
  after insert or update or delete on public.medication_administrations
  for each row execute function public.audit_scrittura();

create trigger lab_orders_audit
  after insert or update or delete on public.lab_orders
  for each row execute function public.audit_scrittura();

create trigger clinical_notes_audit
  after insert or update or delete on public.clinical_notes
  for each row execute function public.audit_scrittura();

create trigger measurements_audit
  after insert or update or delete on public.measurements
  for each row execute function public.audit_scrittura();

create trigger documents_audit
  after insert or update or delete on public.documents
  for each row execute function public.audit_scrittura();

-- ═══════════════════════════════════════════════════════════════════
-- I diritti della persona
-- ═══════════════════════════════════════════════════════════════════

/**
 * Portabilità: tutto ciò che sappiamo di una persona, in un file.
 *
 * Art. 20 del GDPR. Restituisce un JSON con anagrafica, punteggi,
 * misure, referti (metadati, non i file), terapie, esami, questionari,
 * consensi, appuntamenti e conversazioni con la clinica.
 *
 * `security definer` con il controllo dentro: chi esporta dev'essere il
 * paziente stesso o avere titolo su di lui. E l'esportazione **lascia
 * una riga nel registro** — è un accesso massivo ai propri dati o a
 * quelli di un altro, ed è esattamente il genere di cosa che un garante
 * chiede di poter vedere.
 *
 * Le comunicazioni interne non ci sono: sono conversazioni fra
 * professionisti *sul* paziente, non dati *del* paziente, e la loro
 * riservatezza è la ragione per cui esistono in tabelle separate.
 */
create or replace function public.export_patient_data(p_patient uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $fn$
declare
  v jsonb;
begin
  if not public.can_access_patient(p_patient) then
    raise exception 'Paziente non accessibile.';
  end if;

  select jsonb_build_object(
    'generato_il', now(),
    'paziente', (
      select jsonb_build_object(
        'nome', pr.full_name, 'email', pr.email, 'telefono', pr.phone,
        'codice', pa.patient_code, 'nascita', pa.date_of_birth,
        'sesso', pa.sex_at_birth, 'altezza_cm', pa.height_cm
      )
      from public.patients pa
      join public.profiles pr on pr.id = pa.profile_id
      where pa.id = p_patient
    ),
    'punteggi', coalesce((
      select jsonb_agg(jsonb_build_object(
        'data', s.measured_on, 'punteggio', s.score, 'sintesi', s.summary
      ) order by s.measured_on desc)
      from public.longevity_scores s where s.patient_id = p_patient
    ), '[]'::jsonb),
    'misure', coalesce((
      select jsonb_agg(jsonb_build_object(
        'parametro', m.label, 'valore', m.value, 'unita', m.unit,
        'data', m.measured_on, 'riferimento', jsonb_build_object('basso', m.ref_low, 'alto', m.ref_high)
      ) order by m.measured_on desc)
      from public.measurements m where m.patient_id = p_patient
    ), '[]'::jsonb),
    'documenti', coalesce((
      select jsonb_agg(jsonb_build_object(
        'titolo', d.title, 'tipo', d.kind, 'emesso_il', d.issued_on, 'caricato_il', d.created_at
      ) order by d.created_at desc)
      from public.documents d where d.patient_id = p_patient
    ), '[]'::jsonb),
    'terapie', coalesce((
      select jsonb_agg(jsonb_build_object(
        'farmaco', p.medication, 'dose', p.dose, 'frequenza', p.frequency,
        'via', p.route, 'dal', p.starts_on, 'al', p.ends_on, 'stato', p.status
      ) order by p.starts_on desc)
      from public.prescriptions p where p.patient_id = p_patient
    ), '[]'::jsonb),
    'esami_richiesti', coalesce((
      select jsonb_agg(jsonb_build_object(
        'pannello', l.panel, 'chiesto_il', l.requested_at, 'stato', l.status
      ) order by l.requested_at desc)
      from public.lab_orders l where l.patient_id = p_patient
    ), '[]'::jsonb),
    'appuntamenti', coalesce((
      select jsonb_agg(jsonb_build_object(
        'servizio', a.service_name, 'quando', a.starts_at, 'stato', a.status
      ) order by a.starts_at desc)
      from public.appointments a where a.patient_id = p_patient
    ), '[]'::jsonb),
    'consensi', coalesce((
      select jsonb_agg(jsonb_build_object(
        'tipo', c.kind, 'concesso', c.granted, 'versione', c.policy_version,
        'deciso_il', c.decided_at, 'origine', c.source
      ) order by c.decided_at desc)
      from public.patient_consents c where c.patient_id = p_patient
    ), '[]'::jsonb),
    'conversazioni', coalesce((
      select jsonb_agg(jsonb_build_object(
        'oggetto', t.subject, 'categoria', t.category, 'aperta_il', t.created_at,
        'messaggi', (
          select coalesce(jsonb_agg(jsonb_build_object(
            'dal_paziente', ms.from_patient, 'testo', ms.body, 'quando', ms.created_at
          ) order by ms.created_at), '[]'::jsonb)
          from public.messages ms where ms.thread_id = t.id
        )
      ) order by t.created_at desc)
      from public.message_threads t where t.patient_id = p_patient
    ), '[]'::jsonb)
  ) into v;

  insert into public.audit_log (actor_id, action, entity, entity_id, patient_id, metadata)
  values (auth.uid(), 'patient.export', 'patient', p_patient, p_patient,
          jsonb_build_object('motivo', 'portabilita'));

  return v;
end;
$fn$;

comment on function public.export_patient_data is
  'Art. 20 GDPR: tutto ciò che sappiamo di una persona, in un JSON. Lascia una riga nel registro, perché un accesso massivo è esattamente ciò che va tracciato.';

/**
 * Cancellazione: anonimizza, non elimina.
 *
 * Art. 17 del GDPR, e il suo comma 3 lettera h: il diritto alla
 * cancellazione **non si applica** quando il trattamento è necessario
 * per finalità di medicina preventiva, diagnosi e cura. Una cartella
 * clinica ha obblighi di conservazione che non sono negoziabili con
 * chi la riguarda, e cancellarla su richiesta non sarebbe conformità —
 * sarebbe distruzione di documentazione sanitaria.
 *
 * Quello che si può e si deve fare è togliere ciò che **identifica**:
 * nome, email, telefono, codice fiscale, recapiti. Ciò che resta è una
 * storia clinica senza una persona attaccata, che è precisamente il
 * punto d'arrivo che la norma chiede.
 *
 * L'account viene disattivato da Supabase, non da qui: cancellare la
 * riga in `auth.users` farebbe cadere a cascata tutta la cartella, che
 * è l'opposto di ciò che serve.
 */
create or replace function public.erase_patient(
  p_patient uuid,
  p_reason  text
)
returns void
language plpgsql
security definer
set search_path = public
as $fn$
declare
  v_profile uuid;
begin
  if not public.is_staff() then
    raise exception 'La cancellazione dei dati identificativi è riservata alla direzione.';
  end if;
  if length(trim(coalesce(p_reason, ''))) < 3 then
    raise exception 'Serve il motivo: una cancellazione senza una richiesta scritta dietro non si giustifica.';
  end if;

  select profile_id into v_profile from public.patients where id = p_patient;
  if v_profile is null then
    raise exception 'Paziente non trovato.';
  end if;

  update public.profiles
     set full_name  = 'Persona cancellata',
         first_name = null,
         last_name  = null,
         email      = null,
         phone      = null,
         avatar_url = null
   where id = v_profile;

  update public.patients
     set fiscal_code = null,
         notes       = null,
         patient_code = 'CANC-' || left(p_patient::text, 8)
   where id = p_patient;

  -- Le conversazioni con la clinica sono corrispondenza, non cartella:
  -- non hanno obbligo di conservazione clinica e vanno via.
  delete from public.messages
   where thread_id in (select id from public.message_threads where patient_id = p_patient);
  delete from public.message_threads where patient_id = p_patient;

  insert into public.audit_log (actor_id, action, entity, entity_id, patient_id, metadata)
  values (auth.uid(), 'patient.erased', 'patient', p_patient, p_patient,
          jsonb_build_object('motivo', trim(p_reason)));

  perform public.emit_event(
    'patient.erased', 'patient', p_patient, p_patient, null,
    jsonb_build_object('motivo', trim(p_reason))
  );
end;
$fn$;

comment on function public.erase_patient is
  'Art. 17 GDPR con il comma 3(h): toglie ciò che identifica, conserva la storia clinica. Cancellare una cartella non è conformità, è distruzione di documentazione sanitaria.';

-- ═══════════════════════════════════════════════════════════════════
-- Leggere il registro
-- ═══════════════════════════════════════════════════════════════════
/**
 * Il registro in una frase per riga.
 *
 * «William ha visualizzato Marta Bellini alle 10:42.» Comporre quella
 * frase richiede tre join, e farla comporre all'applicazione avrebbe
 * voluto dire una query per riga oppure quattro letture e un
 * assemblaggio a mano. Qui esce già fatta.
 *
 * `stable` e non `security definer`: la `select` dentro passa dalle
 * policy di `audit_log`, quindi la direzione vede tutto, un
 * professionista vede le righe dei propri pazienti, e nessuno vede
 * quelle di pazienti che non segue.
 */
create or replace function public.audit_leggibile(
  p_patient uuid default null,
  p_da      timestamptz default (now() - interval '30 days'),
  p_quante  integer default 200
)
returns table (
  id        bigint,
  quando    timestamptz,
  attore    text,
  ruolo     app_role,
  azione    text,
  entita    text,
  paziente  text,
  patient_id uuid,
  dettagli  jsonb,
  sigillata boolean
)
language sql
stable
set search_path = public
as $fn$
  select
    a.id,
    a.created_at,
    coalesce(pr.full_name, 'Profilo rimosso'),
    pr.role,
    a.action,
    a.entity,
    coalesce(pp.full_name, '—'),
    a.patient_id,
    a.metadata,
    a.entry_hash is not null
  from public.audit_log a
  left join public.profiles pr on pr.id = a.actor_id
  left join public.patients pa on pa.id = a.patient_id
  left join public.profiles pp on pp.id = pa.profile_id
  where (p_patient is null or a.patient_id = p_patient)
    and a.created_at >= coalesce(p_da, now() - interval '30 days')
  order by a.created_at desc
  limit greatest(1, least(coalesce(p_quante, 200), 2000));
$fn$;
