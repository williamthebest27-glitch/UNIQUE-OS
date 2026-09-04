-- ═══════════════════════════════════════════════════════════════════
-- L'esperienza del paziente
--
-- La Patient App aveva già quasi tutto: punteggio, pilastri, percorso,
-- crediti, appuntamenti, documenti, misure, timeline. Mancavano tre cose
-- che il paziente chiede e che non si possono dedurre da nessuna tabella
-- esistente:
--
--   1. i questionari — ciò che il paziente sa di sé e nessun esame misura;
--   2. i messaggi — una conversazione, non una notifica a senso unico;
--   3. i consensi — cosa ha accettato, quando, e in quale versione.
--
-- Nient'altro. Punteggio, crediti, percorso e piano restano dove sono:
-- una seconda tabella che dice le stesse cose è il modo più rapido per
-- avere due verità.
-- ═══════════════════════════════════════════════════════════════════

-- ── Questionari ───────────────────────────────────────────────────
/*
 * Un questionario è un modello più le risposte di una persona.
 *
 * Le domande stanno in `jsonb` e non in una tabella per domanda: sono un
 * documento che cambia in blocco, e una revisione del questionario non
 * deve poter riscrivere le risposte già date. Chi ha risposto ieri porta
 * con sé le domande di ieri, nella copia `questions` del suo assessment.
 *
 * Ogni domanda può dichiarare un `metric_code` del catalogo dello Score:
 * è il ponte perché una risposta diventi una misura, quando un
 * professionista la valida. Il ponte non lo attraversa nessuno da solo.
 */
create table public.assessment_templates (
  id                uuid primary key default gen_random_uuid(),
  slug              text unique not null,
  title             text not null,
  description       text,
  -- A cosa serve: anamnesi, stile di vita, sonno, benessere mentale.
  category          text not null default 'general',
  questions         jsonb not null default '[]'::jsonb,
  estimated_minutes integer not null default 5,
  is_active         boolean not null default true,
  created_at        timestamptz not null default now(),
  check (jsonb_typeof(questions) = 'array')
);

create type assessment_status as enum ('not_started', 'in_progress', 'completed');

create table public.patient_assessments (
  id           uuid primary key default gen_random_uuid(),
  patient_id   uuid not null references public.patients (id) on delete cascade,
  template_id  uuid not null references public.assessment_templates (id) on delete restrict,
  status       assessment_status not null default 'not_started',
  -- Le domande come erano quando il questionario è stato assegnato.
  questions    jsonb not null default '[]'::jsonb,
  -- { "<id domanda>": <risposta> }. Una mappa, non un elenco: si scrive
  -- una risposta per volta senza rileggere le altre.
  answers      jsonb not null default '{}'::jsonb,
  progress_pct numeric(5, 2) not null default 0 check (progress_pct between 0 and 100),
  assigned_by  uuid references public.profiles (id) on delete set null,
  due_on       date,
  completed_at timestamptz,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  -- Lo stesso questionario si può ripetere nel tempo, ma non se ne
  -- possono avere due aperti insieme: sarebbe una domanda doppia.
  unique (patient_id, template_id, created_at)
);

create index patient_assessments_by_patient
  on public.patient_assessments (patient_id, status, created_at desc);

alter table public.assessment_templates enable row level security;
alter table public.patient_assessments  enable row level security;

-- I modelli sono pubblici a chi è autenticato: il paziente deve poter
-- leggere di cosa parla un questionario prima di iniziarlo.
create policy assessment_templates_read on public.assessment_templates
  for select using (true);

create policy assessment_templates_write on public.assessment_templates
  for all using (public.is_staff()) with check (public.is_staff());

/*
 * Le risposte sono dati sanitari. Le vede il paziente e il suo care team;
 * non la reception, non il marketing. L'elenco corto di `can_access_patient`
 * è il punto in cui questa promessa è scritta una volta per tutte.
 */
create policy patient_assessments_select on public.patient_assessments
  for select using (public.can_access_patient(patient_id));

-- Il paziente scrive le proprie risposte; non si assegna un questionario
-- da solo, e non ne cambia la scadenza.
create policy patient_assessments_patient_update on public.patient_assessments
  for update using (patient_id = public.my_patient_id())
  with check (patient_id = public.my_patient_id());

create policy patient_assessments_staff_write on public.patient_assessments
  for all using (public.is_staff() or public.can_access_patient(patient_id))
  with check (public.is_staff() or public.can_access_patient(patient_id));

/*
 * Chiudere un questionario.
 *
 * La percentuale e lo stato non li calcola il client: un modulo che
 * dichiara "100%" con metà risposte è un modulo, non un fatto. Qui si
 * contano le risposte effettivamente presenti sulle domande obbligatorie.
 */
create or replace function public.save_assessment(
  p_assessment uuid,
  p_answers    jsonb,
  p_complete   boolean default false
)
returns numeric
language plpgsql
security definer
set search_path = public
as $fn$
declare
  v_row       public.patient_assessments;
  v_richieste integer;
  v_risposte  integer;
  v_pct       numeric(5, 2);
  v_unite     jsonb;
begin
  select * into v_row from public.patient_assessments where id = p_assessment;
  if v_row is null then
    raise exception 'Questionario non trovato.';
  end if;
  if not public.can_access_patient(v_row.patient_id) then
    raise exception 'Questionario non accessibile.';
  end if;
  if v_row.status = 'completed' then
    raise exception 'Questo questionario è già stato consegnato.';
  end if;

  -- Le risposte nuove si aggiungono alle vecchie: si può rispondere in
  -- due sedute, e chiudere la pagina non cancella niente.
  v_unite := coalesce(v_row.answers, '{}'::jsonb) || coalesce(p_answers, '{}'::jsonb);

  select count(*) into v_richieste
  from jsonb_array_elements(v_row.questions) q
  where coalesce((q ->> 'required')::boolean, true);

  select count(*) into v_risposte
  from jsonb_array_elements(v_row.questions) q
  where coalesce((q ->> 'required')::boolean, true)
    and v_unite ? (q ->> 'id')
    and nullif(trim(both '"' from (v_unite -> (q ->> 'id'))::text), '') is not null;

  v_pct := case when v_richieste = 0 then 100 else round(v_risposte * 100.0 / v_richieste, 2) end;

  if p_complete and v_risposte < v_richieste then
    raise exception 'Mancano % risposte obbligatorie.', v_richieste - v_risposte;
  end if;

  update public.patient_assessments
     set answers      = v_unite,
         progress_pct = v_pct,
         status       = case
                          when p_complete then 'completed'::assessment_status
                          when v_risposte > 0 then 'in_progress'::assessment_status
                          else status
                        end,
         completed_at = case when p_complete then now() else completed_at end,
         updated_at   = now()
   where id = p_assessment;

  if p_complete then
    perform public.emit_event(
      'assessment.completed', 'assessment', p_assessment, v_row.patient_id, null,
      jsonb_build_object('template_id', v_row.template_id)
    );
  end if;

  return v_pct;
end;
$fn$;

-- ── Messaggi ──────────────────────────────────────────────────────
/*
 * Una conversazione, non una notifica.
 *
 * La categoria non è un'etichetta di comodo: decide chi legge. Un filo
 * *clinico* lo vedono il paziente e il suo care team; uno
 * *amministrativo* lo vede anche la reception, che è chi risponde di
 * appuntamenti e fatture. È la stessa segregazione del resto del
 * sistema, applicata alle parole invece che ai numeri.
 */
create type message_category as enum ('clinical', 'administrative');

create table public.message_threads (
  id              uuid primary key default gen_random_uuid(),
  patient_id      uuid not null references public.patients (id) on delete cascade,
  subject         text not null,
  category        message_category not null default 'clinical',
  is_closed       boolean not null default false,
  created_by      uuid references public.profiles (id) on delete set null,
  last_message_at timestamptz not null default now(),
  created_at      timestamptz not null default now()
);

create table public.messages (
  id                 uuid primary key default gen_random_uuid(),
  thread_id          uuid not null references public.message_threads (id) on delete cascade,
  author_id          uuid references public.profiles (id) on delete set null,
  -- Chi parla, indipendentemente da chi ha scritto: serve a disegnare la
  -- conversazione anche quando un profilo viene cancellato.
  from_patient       boolean not null,
  body               text not null check (length(trim(body)) > 0),
  document_id        uuid references public.documents (id) on delete set null,
  read_by_patient_at timestamptz,
  read_by_staff_at   timestamptz,
  created_at         timestamptz not null default now()
);

create index messages_by_thread on public.messages (thread_id, created_at);
create index threads_by_patient on public.message_threads (patient_id, last_message_at desc);

alter table public.message_threads enable row level security;
alter table public.messages        enable row level security;

/*
 * Chi vede un filo.
 *
 * Security definer perché la policy dei messaggi deve poter guardare la
 * riga del filo senza far scattare la RLS del filo dentro quella dei
 * messaggi: il risultato dipenderebbe dall'ordine di valutazione.
 */
create or replace function public.thread_visible(p_thread uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $fn$
  select exists (
    select 1 from public.message_threads t
    where t.id = p_thread
      and (
        public.can_access_patient(t.patient_id)
        or (public.is_reception() and t.category = 'administrative')
      )
  );
$fn$;

create policy threads_select on public.message_threads
  for select using (
    public.can_access_patient(patient_id)
    or (public.is_reception() and category = 'administrative')
  );

-- Il paziente apre un filo proprio; lo staff lo apre per lui.
create policy threads_insert on public.message_threads
  for insert with check (
    patient_id = public.my_patient_id()
    or public.is_staff()
    or public.can_access_patient(patient_id)
  );

create policy threads_update on public.message_threads
  for update using (public.is_staff() or public.can_access_patient(patient_id))
  with check (public.is_staff() or public.can_access_patient(patient_id));

create policy messages_select on public.messages
  for select using (public.thread_visible(thread_id));

/*
 * Si scrive solo nei fili che si vedono, e si firma sempre a proprio
 * nome: `author_id` deve essere chi sta scrivendo. Senza questo vincolo
 * un paziente potrebbe far dire qualcosa al proprio medico.
 */
create policy messages_insert on public.messages
  for insert with check (public.thread_visible(thread_id) and author_id = auth.uid());

-- L'unica modifica ammessa è segnare per letto. Il testo non si riscrive.
create policy messages_mark_read on public.messages
  for update using (public.thread_visible(thread_id))
  with check (public.thread_visible(thread_id));

/*
 * Mandare un messaggio.
 *
 * Una funzione e non un insert perché tre cose devono avvenire insieme:
 * la riga, l'aggiornamento del filo, e l'avviso a chi deve rispondere.
 * Il messaggio nasce già letto da chi lo scrive.
 */
create or replace function public.send_message(
  p_thread uuid,
  p_body   text,
  p_document uuid default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $fn$
declare
  v_thread public.message_threads;
  v_paziente boolean;
  v_id uuid;
  v_nome text;
begin
  select * into v_thread from public.message_threads where id = p_thread;
  if v_thread is null then
    raise exception 'Conversazione non trovata.';
  end if;
  if not public.thread_visible(p_thread) then
    raise exception 'Conversazione non accessibile.';
  end if;
  if v_thread.is_closed then
    raise exception 'Questa conversazione è chiusa.';
  end if;
  if length(trim(coalesce(p_body, ''))) = 0 then
    raise exception 'Il messaggio è vuoto.';
  end if;

  v_paziente := v_thread.patient_id = public.my_patient_id();

  insert into public.messages
    (thread_id, author_id, from_patient, body, document_id,
     read_by_patient_at, read_by_staff_at)
  values
    (p_thread, auth.uid(), v_paziente, trim(p_body), p_document,
     case when v_paziente then now() end,
     case when v_paziente then null else now() end)
  returning id into v_id;

  update public.message_threads set last_message_at = now() where id = p_thread;

  -- L'avviso va dall'altra parte del filo, mai a chi ha appena scritto.
  if v_paziente then
    select coalesce(pr.full_name, 'Un paziente') into v_nome
    from public.patients p join public.profiles pr on pr.id = p.profile_id
    where p.id = v_thread.patient_id;

    perform public.notify_staff(
      'Messaggio da ' || v_nome,
      left(trim(p_body), 140),
      '/control/pazienti/' || v_thread.patient_id::text,
      'important',
      'messaggi'
    );
  else
    insert into public.notifications (profile_id, title, body, link_url)
    select p.profile_id, 'Nuovo messaggio da Unique', left(trim(p_body), 140),
           '/messaggi/' || p_thread::text
    from public.patients p where p.id = v_thread.patient_id;
  end if;

  perform public.emit_event(
    'message.sent', 'message', v_id, v_thread.patient_id, null,
    jsonb_build_object('from_patient', v_paziente, 'category', v_thread.category)
  );

  return v_id;
end;
$fn$;

/** Aprire un filo e scrivere la prima riga, in una mossa. */
create or replace function public.open_thread(
  p_subject  text,
  p_body     text,
  p_category message_category default 'clinical',
  p_patient  uuid default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $fn$
declare
  v_patient uuid := coalesce(p_patient, public.my_patient_id());
  v_id uuid;
begin
  if v_patient is null then
    raise exception 'Paziente non indicato.';
  end if;
  if not public.can_access_patient(v_patient) then
    raise exception 'Paziente non accessibile.';
  end if;
  if length(trim(coalesce(p_subject, ''))) = 0 then
    raise exception 'Serve un oggetto: è quello che si legge nell elenco.';
  end if;

  insert into public.message_threads (patient_id, subject, category, created_by)
  values (v_patient, trim(p_subject), p_category, auth.uid())
  returning id into v_id;

  perform public.send_message(v_id, p_body);
  return v_id;
end;
$fn$;

-- ── Consensi ──────────────────────────────────────────────────────
/*
 * Un consenso non si modifica: se ne registra uno nuovo.
 *
 * "Ha accettato il marketing?" è una domanda senza risposta utile se non
 * si sa *quando* e *quale versione* dell'informativa. La tabella è
 * append-only come il registro dei crediti, e la vista dice cosa vale
 * oggi. Revocare è scrivere una riga, non cancellarne una.
 */
create type consent_kind as enum (
  'privacy_policy', 'health_data', 'marketing', 'research'
);

create table public.patient_consents (
  id             uuid primary key default gen_random_uuid(),
  patient_id     uuid not null references public.patients (id) on delete cascade,
  kind           consent_kind not null,
  granted        boolean not null,
  policy_version text not null default 'v1',
  decided_at     timestamptz not null default now(),
  decided_by     uuid references public.profiles (id) on delete set null,
  -- Da dove arriva: l'app del paziente, il banco, un modulo cartaceo.
  source         text not null default 'patient_app'
);

create index consents_by_patient on public.patient_consents (patient_id, kind, decided_at desc);

alter table public.patient_consents enable row level security;

create policy consents_select on public.patient_consents
  for select using (public.can_access_patient(patient_id));

create policy consents_insert on public.patient_consents
  for insert with check (
    (patient_id = public.my_patient_id() and decided_by = auth.uid())
    or public.is_staff()
  );

create view public.consent_current
with (security_invoker = true) as
select distinct on (patient_id, kind)
  patient_id, kind, granted, policy_version, decided_at, source
from public.patient_consents
order by patient_id, kind, decided_at desc;

comment on view public.consent_current is
  'Il consenso valido oggi per ciascun tipo. Lo storico resta in patient_consents.';

-- ── Preferenze di notifica ────────────────────────────────────────
-- Su quali canali il paziente vuole essere avvisato. Il contenuto è una
-- mappa aperta: aggiungere un canale non è una migrazione.
alter table public.profiles
  add column if not exists notification_prefs jsonb not null default
    '{"email": true, "appointment_reminders": true, "results": true, "messages": true}'::jsonb;

-- ── Documenti: segnare per letto ──────────────────────────────────
/*
 * `is_new_for_patient` è l'unica colonna che il paziente può cambiare, e
 * solo in una direzione. Una policy non può restringere le colonne, ma
 * una funzione sì.
 */
create or replace function public.mark_document_opened(p_document uuid)
returns void
language plpgsql
security definer
set search_path = public
as $fn$
begin
  update public.documents
     set is_new_for_patient = false
   where id = p_document
     and patient_id = public.my_patient_id();
end;
$fn$;

-- ── Semi: i primi questionari ─────────────────────────────────────
/*
 * Tre questionari che nessun esame del sangue sostituisce: come dorme,
 * come si muove, come sta. Le domande sono scritte dal brief clinico e
 * vanno riviste dal team medico — lo dice la descrizione, in chiaro.
 */
insert into public.assessment_templates (slug, title, description, category, estimated_minutes, questions)
values
  (
    'sonno', 'Qualità del sonno',
    'Sette domande sulle ultime due settimane. Da rivedere con il team clinico.',
    'sleep', 4,
    '[
      {"id":"ore","text":"Quante ore dormi in media per notte?","type":"number","unit":"ore","min":0,"max":14,"metric_code":"sleep_hours_avg"},
      {"id":"addormentamento","text":"Quanto impieghi ad addormentarti?","type":"single","options":["Meno di 15 minuti","15–30 minuti","30–60 minuti","Più di un ora"]},
      {"id":"risvegli","text":"Quante volte ti svegli durante la notte?","type":"single","options":["Mai","Una volta","Due o tre volte","Più di tre"]},
      {"id":"riposato","text":"Al risveglio ti senti riposato?","type":"scale","min":1,"max":5,"labels":["Mai","Sempre"]},
      {"id":"schermi","text":"Usi schermi nellultima ora prima di dormire?","type":"single","options":["Mai","Qualche volta","Spesso","Tutte le sere"]},
      {"id":"regolarita","text":"Vai a letto e ti alzi a orari regolari?","type":"scale","min":1,"max":5,"labels":["Mai","Sempre"]},
      {"id":"note","text":"Cè altro che vuoi dirci sul tuo sonno?","type":"text","required":false}
    ]'::jsonb
  ),
  (
    'stile-di-vita', 'Stile di vita',
    'Movimento, alimentazione, alcol e fumo. Da rivedere con il team clinico.',
    'lifestyle', 6,
    '[
      {"id":"allenamenti","text":"Quante volte a settimana ti alleni?","type":"number","unit":"volte","min":0,"max":14,"metric_code":"strength_sessions_week"},
      {"id":"passi","text":"Quanti passi fai in media al giorno?","type":"single","options":["Meno di 4000","4000–7000","7000–10000","Più di 10000"]},
      {"id":"verdura","text":"Quante porzioni di frutta e verdura al giorno?","type":"number","unit":"porzioni","min":0,"max":12},
      {"id":"alcol","text":"Quante unità alcoliche a settimana?","type":"number","unit":"unità","min":0,"max":50,"metric_code":"alcohol_units_week"},
      {"id":"fumo","text":"Fumi?","type":"single","options":["No, mai","Ho smesso","Sì, occasionalmente","Sì, tutti i giorni"],"metric_code":"smoking_status"},
      {"id":"sedentarieta","text":"Quante ore al giorno passi seduto?","type":"number","unit":"ore","min":0,"max":18}
    ]'::jsonb
  ),
  (
    'benessere', 'Benessere ed energia',
    'Come ti senti nelle ultime due settimane. Non è un test diagnostico.',
    'mental_wellbeing', 4,
    '[
      {"id":"energia","text":"Come descriveresti la tua energia durante il giorno?","type":"scale","min":1,"max":5,"labels":["Molto bassa","Molto alta"]},
      {"id":"stress","text":"Quanto ti senti sotto pressione?","type":"scale","min":1,"max":5,"labels":["Per niente","Moltissimo"],"metric_code":"perceived_stress"},
      {"id":"concentrazione","text":"Riesci a concentrarti su ciò che fai?","type":"scale","min":1,"max":5,"labels":["Mai","Sempre"]},
      {"id":"relazioni","text":"Quanto ti senti sostenuto dalle persone attorno a te?","type":"scale","min":1,"max":5,"labels":["Per niente","Moltissimo"]},
      {"id":"note","text":"Cè qualcosa che vorresti raccontarci?","type":"text","required":false}
    ]'::jsonb
  )
on conflict (slug) do nothing;
