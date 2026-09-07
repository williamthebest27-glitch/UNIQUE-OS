-- ═══════════════════════════════════════════════════════════════════
-- Comunicazioni interne — il Clinical Communication Center
--
-- Unique aveva già una messaggistica: `message_threads` e `messages`,
-- che collegano il paziente alla clinica. Questa non la tocca e non la
-- sostituisce, perché risponde a un'altra domanda: **come parlano fra
-- loro le persone che curano.**
--
-- Riusare quelle tabelle sarebbe stato allettante e sbagliato. Un filo
-- di `message_threads` ha un paziente e due lati, e il paziente è uno
-- dei due: la sua RLS parte da `can_access_patient`, che al paziente
-- stesso dice sempre sì. Metterci dentro un consulto specialistico
-- avrebbe significato che la persona di cui si discute legge la
-- discussione. Non è un dettaglio di permessi — è la ragione per cui la
-- comunicazione fra medici è una tabella diversa.
--
-- Quattro idee reggono tutto il resto:
--
--   **Il reparto è una riga, non un enum.** Chi dirige aggiunge un
--   reparto senza una migrazione, e un professionista può stare in più
--   reparti. Un elenco scritto nel codice sarebbe invecchiato al primo
--   ambulatorio nuovo.
--
--   **Si partecipa da persona o da reparto.** Una conversazione fra due
--   reparti non elenca venti nomi: elenca due reparti, e chi ne fa parte
--   la vede. È l'unico modo perché «Cardiologia risponde a Medicina
--   Interna» resti vero anche quando cambia chi è di turno.
--
--   **Il consulto è un oggetto con uno stato, non un messaggio con un
--   punto interrogativo.** Aperto, preso in carico, in valutazione,
--   risposto, chiuso. Una domanda che nessuno ha preso in carico si deve
--   poter contare; una scritta in chat no.
--
--   **Chiedere un consulto è un motivo di cura.** Uno specialista a cui
--   si chiede un parere deve poter aprire la cartella, o il parere vale
--   quanto un'opinione al telefono. Per questo `can_access_patient`
--   viene esteso — non aggirato — e ogni apertura resta nel registro.
-- ═══════════════════════════════════════════════════════════════════

-- ── Vocabolario ───────────────────────────────────────────────────
/*
 * La priorità è una scala di cinque, e le cinque non sono decorative:
 * `urgent` e `critical` cambiano il canale — accendono una notifica che
 * interrompe — mentre `low` e `normal` non suonano mai. Una scala che
 * non cambia niente diventa un aggettivo, e allora tutti scrivono
 * "urgente".
 */
create type comms_priority as enum ('low', 'normal', 'high', 'urgent', 'critical');

create type conversation_kind as enum (
  'direct',        -- fra due persone
  'group',         -- fra più persone nominate
  'department',    -- una persona o un reparto scrive a un reparto
  'consultation'   -- nata da una richiesta di consulto, e legata al suo stato
);

/*
 * Di cosa si parla. Volutamente sei valori e non otto: «urgente» e
 * «critico» non sono tipi di comunicazione, sono priorità, e tenerli qui
 * avrebbe prodotto un messaggio di tipo «urgente» con priorità «bassa».
 */
create type comms_message_kind as enum (
  'info', 'request', 'consultation', 'exam', 'therapy', 'transfer'
);

create type consultation_status as enum (
  'open', 'taken', 'in_review', 'answered', 'closed'
);

-- ── Reparti ───────────────────────────────────────────────────────
create table public.departments (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  location_id     uuid references public.locations (id) on delete set null,
  slug            text unique not null,
  name            text not null,
  description     text,
  -- Il ponte con le regole di scrittura clinica già esistenti: quando un
  -- reparto corrisponde a una disciplina, chi lo legge sa cosa quel
  -- reparto può validare.
  discipline      professional_discipline,
  -- Un reparto non clinico — accoglienza, amministrazione — non riceve
  -- consulti e non compare fra le destinazioni di una richiesta.
  is_clinical     boolean not null default true,
  sort_order      smallint not null default 100,
  is_active       boolean not null default true,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

comment on table public.departments is
  'Le unità che comunicano fra loro. Una riga e non un enum: chi dirige ne aggiunge una senza una migrazione, e un elenco scritto nel codice sarebbe invecchiato al primo ambulatorio nuovo.';

create index departments_active on public.departments (organization_id, sort_order) where is_active;

create table public.department_members (
  department_id      uuid not null references public.departments (id) on delete cascade,
  -- `profile_id` e non `professional_id`: un reparto di accoglienza è
  -- fatto di persone che non sono professionisti sanitari, e devono
  -- comunque poterci scrivere.
  profile_id         uuid not null references public.profiles (id) on delete cascade,
  is_lead            boolean not null default false,
  role_in_department text,
  joined_at          timestamptz not null default now(),
  ended_at           timestamptz,
  primary key (department_id, profile_id)
);

create index department_members_by_profile
  on public.department_members (profile_id)
  where ended_at is null;

-- ── Conversazioni ─────────────────────────────────────────────────
create table public.conversations (
  id                   uuid primary key default gen_random_uuid(),
  kind                 conversation_kind not null default 'direct',
  title                text not null check (length(trim(title)) > 0),
  -- Il reparto "di casa": quello a cui la conversazione appartiene
  -- quando la si guarda dall'elenco dei reparti.
  department_id        uuid references public.departments (id) on delete set null,
  patient_id           uuid references public.patients (id) on delete set null,
  consultation_id      uuid,                    -- FK aggiunta dopo la tabella
  priority             comms_priority not null default 'normal',
  is_closed            boolean not null default false,
  created_by           uuid references public.profiles (id) on delete set null,
  -- Denormalizzati di proposito: l'elenco delle conversazioni li legge
  -- per ogni riga, e ricavarli da `conversation_messages` costerebbe una
  -- sotto-query per riga a ogni apertura della inbox.
  last_message_at      timestamptz not null default now(),
  last_message_preview text,
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now()
);

create index conversations_recent on public.conversations (last_message_at desc);
create index conversations_by_department on public.conversations (department_id, last_message_at desc);
create index conversations_by_patient on public.conversations (patient_id, last_message_at desc)
  where patient_id is not null;

/*
 * Chi c'è dentro.
 *
 * Una riga è **o** una persona **o** un reparto, mai entrambi e mai
 * nessuno dei due: il `check` lo impone invece di lasciarlo a una
 * convenzione. Partecipare da reparto significa che chiunque ne faccia
 * parte oggi vede la conversazione — anche chi è entrato in reparto dopo
 * che è stata aperta, che è esattamente ciò che serve a un turno.
 *
 * `via_department_id` racconta come una persona ci è arrivata: la riga
 * individuale nasce da sé quando qualcuno del reparto apre la
 * conversazione, e serve a tenere lo stato di lettura, che è di una
 * persona e non di un reparto.
 */
create table public.conversation_participants (
  id                uuid primary key default gen_random_uuid(),
  conversation_id   uuid not null references public.conversations (id) on delete cascade,
  profile_id        uuid references public.profiles (id) on delete cascade,
  department_id     uuid references public.departments (id) on delete cascade,
  via_department_id uuid references public.departments (id) on delete set null,
  role              text not null default 'member',
  last_read_at      timestamptz,
  is_muted          boolean not null default false,
  added_at          timestamptz not null default now(),
  left_at           timestamptz,
  check ((profile_id is not null) <> (department_id is not null))
);

create unique index conversation_participant_profile
  on public.conversation_participants (conversation_id, profile_id)
  where profile_id is not null;

create unique index conversation_participant_department
  on public.conversation_participants (conversation_id, department_id)
  where department_id is not null;

create index conversation_participants_by_profile
  on public.conversation_participants (profile_id, conversation_id)
  where profile_id is not null and left_at is null;

create table public.conversation_messages (
  id                   uuid primary key default gen_random_uuid(),
  conversation_id      uuid not null references public.conversations (id) on delete cascade,
  author_id            uuid references public.profiles (id) on delete set null,
  author_department_id uuid references public.departments (id) on delete set null,
  kind                 comms_message_kind not null default 'info',
  priority             comms_priority not null default 'normal',
  body                 text not null check (length(trim(body)) > 0),
  patient_id           uuid references public.patients (id) on delete set null,
  consultation_id      uuid,
  document_id          uuid references public.documents (id) on delete set null,
  created_at           timestamptz not null default now(),
  -- La ricerca è nel database e non in memoria: un elenco di
  -- conversazioni filtrato lato applicazione avrebbe letto tutto per
  -- scartare quasi tutto, e avrebbe letto solo le prime cento righe.
  search_vector        tsvector generated always as
                         (to_tsvector('italian', coalesce(body, ''))) stored
);

create index comms_messages_by_conversation
  on public.conversation_messages (conversation_id, created_at);
create index comms_messages_search on public.conversation_messages using gin (search_vector);
create index comms_messages_by_patient on public.conversation_messages (patient_id, created_at desc)
  where patient_id is not null;

/*
 * Chi ha letto cosa.
 *
 * `conversation_participants.last_read_at` basterebbe a disegnare il
 * pallino, e infatti è quello che il contatore usa: è una riga per
 * persona, non una per messaggio. Questa tabella esiste per l'altra
 * domanda, quella che in clinica si pone davvero — *questo* messaggio,
 * chi l'ha letto e quando. Una spunta ricavata da un `last_read_at`
 * dice «era collegato dopo»; una ricevuta dice «l'ha aperto».
 */
create table public.conversation_message_reads (
  message_id uuid not null references public.conversation_messages (id) on delete cascade,
  profile_id uuid not null references public.profiles (id) on delete cascade,
  read_at    timestamptz not null default now(),
  primary key (message_id, profile_id)
);

/*
 * Gli allegati.
 *
 * Due strade, ed è deliberato che siano due. `document_id` allega un
 * referto **già in cartella**: non copia niente, e i permessi restano
 * quelli del documento — se domani il paziente esce dal tuo care team,
 * l'allegato smette di aprirsi. `storage_path` è per ciò che nasce nella
 * conversazione e in cartella non c'è: una foto di una lastra, un PDF di
 * un collega esterno. Vive in un bucket privato, indirizzato per
 * conversazione.
 */
create table public.conversation_attachments (
  id              uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.conversations (id) on delete cascade,
  message_id      uuid references public.conversation_messages (id) on delete cascade,
  document_id     uuid references public.documents (id) on delete set null,
  storage_path    text,
  file_name       text not null,
  mime_type       text,
  size_bytes      bigint,
  uploaded_by     uuid references public.profiles (id) on delete set null,
  created_at      timestamptz not null default now(),
  check (document_id is not null or storage_path is not null)
);

create index comms_attachments_by_conversation
  on public.conversation_attachments (conversation_id, created_at desc);

-- ── Consulti specialistici ────────────────────────────────────────
/*
 * Un consulto è un oggetto con uno stato, non un messaggio con un punto
 * interrogativo.
 *
 * La differenza si vede il martedì mattina: «quante richieste di parere
 * non ha ancora preso in carico nessuno» ha una risposta se è una
 * colonna, e non ne ha nessuna se è una frase dentro una chat. Gli stati
 * sono cinque e il passaggio fra loro è una macchina, non un campo
 * libero — `advance_consultation` è l'unico modo di muoverlo.
 */
create table public.clinical_consultations (
  id                       uuid primary key default gen_random_uuid(),
  patient_id               uuid not null references public.patients (id) on delete cascade,
  conversation_id          uuid not null references public.conversations (id) on delete cascade,
  requested_by             uuid references public.profiles (id) on delete set null,
  requesting_department_id uuid references public.departments (id) on delete set null,
  target_department_id     uuid not null references public.departments (id) on delete restrict,
  assignee_id              uuid references public.profiles (id) on delete set null,
  reason                   text not null check (length(trim(reason)) > 0),
  description              text,
  priority                 comms_priority not null default 'normal',
  status                   consultation_status not null default 'open',
  due_at                   timestamptz,
  taken_at                 timestamptz,
  answered_at              timestamptz,
  closed_at                timestamptz,
  answer                   text,
  created_at               timestamptz not null default now(),
  updated_at               timestamptz not null default now()
);

create index consultations_open
  on public.clinical_consultations (target_department_id, status, created_at desc)
  where status <> 'closed';
create index consultations_by_patient
  on public.clinical_consultations (patient_id, created_at desc);
create index consultations_by_assignee
  on public.clinical_consultations (assignee_id, status)
  where assignee_id is not null;

-- I due riferimenti circolari, chiusi ora che entrambe le tabelle esistono.
alter table public.conversations
  add constraint conversations_consultation_fk
  foreign key (consultation_id) references public.clinical_consultations (id) on delete set null;

alter table public.conversation_messages
  add constraint comms_messages_consultation_fk
  foreign key (consultation_id) references public.clinical_consultations (id) on delete set null;

create trigger departments_touch   before update on public.departments            for each row execute function public.touch_updated_at();
create trigger conversations_touch before update on public.conversations          for each row execute function public.touch_updated_at();
create trigger consultations_touch before update on public.clinical_consultations for each row execute function public.touch_updated_at();

-- ═══════════════════════════════════════════════════════════════════
-- Chi vede cosa
-- ═══════════════════════════════════════════════════════════════════
/*
 * Tutte security definer, e per la solita ragione: una policy che
 * interroga la tabella su cui è definita entra in ricorsione, e una che
 * ne interroga un'altra dipende dall'ordine in cui Postgres valuta le
 * due. Qui le funzioni leggono ignorando la RLS, e la decisione la
 * prendono per intero loro.
 */

/** I reparti di cui l'utente collegato fa parte, oggi. */
create or replace function public.my_department_ids()
returns setof uuid
language sql
stable
security definer
set search_path = public
as $fn$
  select department_id
  from public.department_members
  where profile_id = auth.uid() and ended_at is null;
$fn$;

create or replace function public.is_department_member(p_department uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $fn$
  select p_department is not null and exists (
    select 1 from public.department_members
    where department_id = p_department
      and profile_id = auth.uid()
      and ended_at is null
  );
$fn$;

/**
 * Un consulto aperto è un motivo di cura.
 *
 * È la funzione che rende utile tutto il resto. Uno specialista a cui si
 * chiede un parere su una persona che non segue deve poter aprire la sua
 * cartella, o il parere che darà vale quanto un'opinione data al
 * telefono senza guardare gli esami.
 *
 * Il permesso è **legato all'oggetto**, non alla persona: dura quanto il
 * consulto e trenta giorni oltre la chiusura — il tempo di rileggere ciò
 * che si è scritto — e finisce da sé. Ogni apertura resta nel registro
 * degli accessi come tutte le altre.
 */
create or replace function public.has_consultation_access(target uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $fn$
  select target is not null and exists (
    select 1
    from public.clinical_consultations k
    where k.patient_id = target
      and (
        k.assignee_id  = auth.uid()
        or k.requested_by = auth.uid()
        or exists (
          select 1 from public.department_members dm
          where dm.department_id = k.target_department_id
            and dm.profile_id = auth.uid()
            and dm.ended_at is null
        )
      )
      and (k.status <> 'closed' or k.closed_at > now() - interval '30 days')
  );
$fn$;

/*
 * La stessa funzione di sempre, con un ramo in più.
 *
 * Non è una scorciatoia intorno alla Row Level Security: è la RLS che
 * impara un motivo di accesso che prima non aveva modo di esprimere.
 * Tutto ciò che passava di qui continua a passarci — care team, paziente
 * stesso, direzione con il perimetro di sede — e nulla cambia per chi un
 * consulto non ce l'ha.
 */
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
      exists (
        select 1 from public.patients p
        where p.id = target and p.profile_id = auth.uid()
      )
      or exists (
        select 1
        from public.care_team_members ctm
        join public.professionals pr on pr.id = ctm.professional_id
        where ctm.patient_id = target
          and pr.profile_id = auth.uid()
          and ctm.ended_at is null
      )
      or public.has_consultation_access(target)
      or (
        public.is_staff()
        and exists (
          select 1 from public.patients p
          where p.id = target and public.location_in_scope(p.location_id)
        )
      )
    );
$fn$;

/**
 * Chi vede una conversazione.
 *
 * Tre strade e nessuna quarta, ed è la quarta a essere interessante:
 * **non** basta essere un medico. Un professionista non partecipante e
 * non del reparto non vede la conversazione nemmeno se ha in cura il
 * paziente di cui si parla — leggere una cartella e leggere ciò che due
 * colleghi si sono detti sono due permessi diversi, e confonderli
 * significa che nessuno scriverà più niente di franco.
 *
 * La direzione fa eccezione solo sulle conversazioni **legate a un
 * paziente**: quel contenuto è parte della sua storia clinica, che la
 * direzione già legge. Una conversazione fra due colleghi senza
 * paziente resta di quei due.
 */
create or replace function public.conversation_visible(p_conversation uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $fn$
  select p_conversation is not null and exists (
    select 1
    from public.conversations c
    where c.id = p_conversation
      and (
        exists (
          select 1 from public.conversation_participants p
          where p.conversation_id = c.id
            and p.profile_id = auth.uid()
            and p.left_at is null
        )
        or exists (
          select 1
          from public.conversation_participants p
          join public.department_members dm on dm.department_id = p.department_id
          where p.conversation_id = c.id
            and p.left_at is null
            and dm.profile_id = auth.uid()
            and dm.ended_at is null
        )
        or (
          c.patient_id is not null
          and public.is_staff()
          and public.can_access_patient(c.patient_id)
        )
      )
  );
$fn$;

/**
 * Chi può scriverci.
 *
 * Vedere e scrivere non coincidono: la direzione vede le conversazioni
 * cliniche di un paziente e non ci scrive dentro, perché non è parte di
 * quello scambio. E una conversazione chiusa non accetta più righe da
 * nessuno — chiudere è l'unico gesto che vale anche contro chi l'ha
 * aperta.
 */
create or replace function public.conversation_writable(p_conversation uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $fn$
  select p_conversation is not null and exists (
    select 1
    from public.conversations c
    where c.id = p_conversation
      and not c.is_closed
      and (
        exists (
          select 1 from public.conversation_participants p
          where p.conversation_id = c.id
            and p.profile_id = auth.uid()
            and p.left_at is null
        )
        or exists (
          select 1
          from public.conversation_participants p
          join public.department_members dm on dm.department_id = p.department_id
          where p.conversation_id = c.id
            and p.left_at is null
            and dm.profile_id = auth.uid()
            and dm.ended_at is null
        )
      )
  );
$fn$;

/**
 * Il primo segmento di un percorso di storage, se è un uuid.
 *
 * Un `::uuid` nudo dentro una policy solleva un errore sul primo file il
 * cui percorso non è fatto come ce lo aspettiamo, e un errore in una
 * policy di lettura è un bucket che smette di rispondere. Qui l'errore
 * diventa `null`, e `null` non vede niente.
 */
create or replace function public.path_uuid(p_name text)
returns uuid
language plpgsql
immutable
as $fn$
begin
  return (string_to_array(p_name, '/'))[1]::uuid;
exception when others then
  return null;
end;
$fn$;

-- ═══════════════════════════════════════════════════════════════════
-- Row Level Security
-- ═══════════════════════════════════════════════════════════════════
alter table public.departments                enable row level security;
alter table public.department_members         enable row level security;
alter table public.conversations              enable row level security;
alter table public.conversation_participants  enable row level security;
alter table public.conversation_messages      enable row level security;
alter table public.conversation_message_reads enable row level security;
alter table public.conversation_attachments   enable row level security;
alter table public.clinical_consultations     enable row level security;

-- I reparti sono l'organigramma: chi lavora in Unique li vede tutti, e
-- non c'è niente di sensibile in un nome di reparto. Li scrive la
-- direzione.
create policy departments_read on public.departments
  for select using (public.is_internal());

create policy departments_write on public.departments
  for all using (public.is_staff()) with check (public.is_staff());

create policy department_members_read on public.department_members
  for select using (public.is_internal());

create policy department_members_write on public.department_members
  for all using (public.is_staff()) with check (public.is_staff());

create policy conversations_select on public.conversations
  for select using (public.conversation_visible(id));

/*
 * Aprire una conversazione dal client è possibile ma inutile: senza
 * partecipanti nessuno la vedrebbe, nemmeno chi l'ha creata, perché
 * `conversation_visible` guarda i partecipanti e non l'autore. La strada
 * vera è `open_conversation`, che fa le due cose insieme. La policy
 * resta perché una tabella senza insert non si può popolare nemmeno per
 * riparare qualcosa a mano.
 */
create policy conversations_insert on public.conversations
  for insert with check (public.is_internal() and created_by = auth.uid());

create policy conversations_update on public.conversations
  for update using (public.conversation_writable(id))
  with check (public.conversation_writable(id));

create policy participants_select on public.conversation_participants
  for select using (public.conversation_visible(conversation_id));

create policy participants_write on public.conversation_participants
  for all using (public.conversation_writable(conversation_id))
  with check (public.conversation_writable(conversation_id));

create policy comms_messages_select on public.conversation_messages
  for select using (public.conversation_visible(conversation_id));

/*
 * Si scrive solo dove si può scrivere, e si firma sempre a proprio nome.
 * Senza il secondo vincolo un partecipante potrebbe far dire qualcosa a
 * un collega dentro una conversazione clinica.
 */
create policy comms_messages_insert on public.conversation_messages
  for insert with check (
    public.conversation_writable(conversation_id) and author_id = auth.uid()
  );

-- Nessuna policy di update né di delete: il testo di un messaggio
-- clinico non si riscrive e non sparisce. Ciò che è stato detto si
-- corregge dicendo altro.

create policy message_reads_select on public.conversation_message_reads
  for select using (
    exists (
      select 1 from public.conversation_messages m
      where m.id = message_id and public.conversation_visible(m.conversation_id)
    )
  );

-- Una ricevuta di lettura si firma solo a proprio nome.
create policy message_reads_insert on public.conversation_message_reads
  for insert with check (
    profile_id = auth.uid()
    and exists (
      select 1 from public.conversation_messages m
      where m.id = message_id and public.conversation_visible(m.conversation_id)
    )
  );

create policy comms_attachments_select on public.conversation_attachments
  for select using (public.conversation_visible(conversation_id));

create policy comms_attachments_insert on public.conversation_attachments
  for insert with check (
    public.conversation_writable(conversation_id) and uploaded_by = auth.uid()
  );

/*
 * Un consulto si vede se si vede la sua conversazione.
 *
 * È una sola regola per due oggetti, ed è voluto: la scheda del consulto
 * e le righe che lo discutono sono la stessa cosa vista da due lati, e
 * due permessi diversi avrebbero prodotto la schermata peggiore
 * possibile — l'intestazione visibile e il contenuto no.
 */
create policy consultations_select on public.clinical_consultations
  for select using (public.conversation_visible(conversation_id));

create policy consultations_write on public.clinical_consultations
  for all using (public.conversation_writable(conversation_id))
  with check (public.conversation_writable(conversation_id));

-- Il registro: chi partecipa a una conversazione ne legge le tracce.
create policy audit_select_comunicazioni on public.audit_log
  for select using (
    entity = 'conversation'
    and entity_id is not null
    and public.conversation_visible(entity_id)
  );

-- ── Storage degli allegati ────────────────────────────────────────
-- Percorso  clinical-comms/<conversation_id>/<file>: il primo segmento
-- è la chiave dei permessi, come per i referti.
insert into storage.buckets (id, name, public)
values ('clinical-comms', 'clinical-comms', false)
on conflict (id) do nothing;

create policy clinical_comms_read on storage.objects
  for select using (
    bucket_id = 'clinical-comms'
    and public.conversation_visible(public.path_uuid(name))
  );

create policy clinical_comms_write on storage.objects
  for insert with check (
    bucket_id = 'clinical-comms'
    and public.conversation_writable(public.path_uuid(name))
  );

-- ═══════════════════════════════════════════════════════════════════
-- I gesti
-- ═══════════════════════════════════════════════════════════════════

/**
 * Avvisare delle persone.
 *
 * `notify_staff` c'era già e manda a chi dirige. Questa manda a un
 * elenco: i partecipanti di una conversazione, i membri di un reparto.
 * La gravità decide il destino della notifica, non il tono del testo —
 * `critical` interrompe, `info` non suona mai.
 */
create or replace function public.notify_profiles(
  p_profiles uuid[],
  p_title    text,
  p_body     text,
  p_link     text default null,
  p_severity notification_severity default 'important',
  p_category text default 'comunicazioni'
)
returns integer
language plpgsql
security definer
set search_path = public
as $fn$
declare
  v_count integer;
begin
  insert into public.notifications (profile_id, title, body, link_url, severity, category)
  select distinct p, p_title, p_body, p_link, p_severity, p_category
  from unnest(coalesce(p_profiles, '{}'::uuid[])) as p
  where p is not null;

  get diagnostics v_count = row_count;
  return v_count;
end;
$fn$;

/**
 * Una riga di registro per le comunicazioni.
 *
 * `log_clinical_access` c'era già e vuole un paziente: è fatta per
 * rispondere a «chi ha aperto questa cartella». Qui il paziente può non
 * esserci — due colleghi che si scrivono di un turno — e la domanda è
 * un'altra: «chi ha scritto, chi ha letto, chi ha preso in carico».
 *
 * Muta per costruzione, come l'altra. Un registro che rompe la pagina
 * che sta registrando viene tolto dopo il secondo incidente.
 */
create or replace function public.log_comms(
  p_action       text,
  p_conversation uuid,
  p_patient      uuid  default null,
  p_metadata     jsonb default '{}'::jsonb
)
returns void
language plpgsql
security definer
set search_path = public
as $fn$
begin
  insert into public.audit_log (actor_id, action, entity, entity_id, patient_id, metadata)
  values (
    auth.uid(), p_action, 'conversation', p_conversation, p_patient,
    coalesce(p_metadata, '{}'::jsonb)
  );
exception when others then
  return;
end;
$fn$;

/** Chi va avvisato di una riga nuova: partecipanti e membri dei reparti, tranne chi scrive e chi ha silenziato. */
create or replace function public.conversation_audience(p_conversation uuid)
returns uuid[]
language sql
stable
security definer
set search_path = public
as $fn$
  select coalesce(array_agg(distinct destinatario), '{}'::uuid[])
  from (
    select p.profile_id as destinatario
    from public.conversation_participants p
    where p.conversation_id = p_conversation
      and p.profile_id is not null
      and p.left_at is null
      and not p.is_muted

    union

    select dm.profile_id
    from public.conversation_participants p
    join public.department_members dm on dm.department_id = p.department_id
    where p.conversation_id = p_conversation
      and p.left_at is null
      and dm.ended_at is null
  ) as tutti
  where destinatario is not null
    and destinatario <> auth.uid()
    -- Chi ha silenziato non viene avvisato nemmeno se arriva dal reparto:
    -- il silenziamento è della persona, non del modo in cui partecipa.
    and not exists (
      select 1 from public.conversation_participants mp
      where mp.conversation_id = p_conversation
        and mp.profile_id = tutti.destinatario
        and (mp.is_muted or mp.left_at is not null)
    );
$fn$;

/** La gravità che una priorità merita nel centro notifiche. */
create or replace function public.comms_severity(p_priority comms_priority)
returns notification_severity
language sql
immutable
as $fn$
  select case p_priority
    when 'critical' then 'critical'::notification_severity
    when 'urgent'   then 'critical'::notification_severity
    when 'high'     then 'important'::notification_severity
    else 'info'::notification_severity
  end;
$fn$;

/**
 * Scrivere una riga.
 *
 * Una funzione e non un insert perché cinque cose devono avvenire
 * insieme o non avvenire: la riga, l'anteprima sul filo, la ricevuta di
 * chi scrive (che non deve trovarsi un non letto proprio), l'avviso a
 * chi deve rispondere e la traccia nel registro.
 *
 * La priorità del messaggio **alza** quella della conversazione e non la
 * abbassa mai: una conversazione che è diventata urgente resta urgente
 * anche se la riga dopo è una nota di servizio.
 */
create or replace function public.post_message(
  p_conversation uuid,
  p_body         text,
  p_kind         comms_message_kind default 'info',
  p_priority     comms_priority default 'normal',
  p_document     uuid default null,
  -- Chi ha una notizia migliore da dare la dà lui. `advance_consultation`
  -- è l'unico caso: «Risposta al consulto ricevuta» dice qualcosa che
  -- «Nuovo messaggio da Chiara Neri» non dice, e mandarle entrambe
  -- significa due righe nel centro notifiche per un fatto solo.
  p_notify       boolean default true
)
returns uuid
language plpgsql
security definer
set search_path = public
as $fn$
declare
  v_conv public.conversations;
  v_id uuid;
  v_reparto uuid;
  v_autore text;
  v_destinatari uuid[];
begin
  select * into v_conv from public.conversations where id = p_conversation;
  if v_conv is null then
    raise exception 'Conversazione non trovata.';
  end if;
  if not public.conversation_writable(p_conversation) then
    raise exception 'Non puoi scrivere in questa conversazione.';
  end if;
  if length(trim(coalesce(p_body, ''))) = 0 then
    raise exception 'Il messaggio è vuoto.';
  end if;

  -- Da quale reparto parla chi scrive: il primo di cui fa parte fra
  -- quelli che partecipano, altrimenti nessuno. Serve a leggere
  -- «Cardiologia ha risposto» invece di un nome che non dice il ruolo.
  select p.department_id into v_reparto
  from public.conversation_participants p
  join public.department_members dm on dm.department_id = p.department_id
  where p.conversation_id = p_conversation
    and dm.profile_id = auth.uid()
    and dm.ended_at is null
    and p.left_at is null
  limit 1;

  insert into public.conversation_messages
    (conversation_id, author_id, author_department_id, kind, priority, body,
     patient_id, consultation_id, document_id)
  values
    (p_conversation, auth.uid(), v_reparto, p_kind, p_priority, trim(p_body),
     v_conv.patient_id, v_conv.consultation_id, p_document)
  returning id into v_id;

  update public.conversations
     set last_message_at      = now(),
         last_message_preview = left(trim(p_body), 160),
         priority = greatest(priority, p_priority)
   where id = p_conversation;

  -- Chi scrive ha già letto. Senza questa riga il suo stesso messaggio
  -- gli accenderebbe il pallino.
  insert into public.conversation_message_reads (message_id, profile_id)
  values (v_id, auth.uid())
  on conflict do nothing;

  update public.conversation_participants
     set last_read_at = now()
   where conversation_id = p_conversation and profile_id = auth.uid();

  select coalesce(pr.full_name, 'Un collega') into v_autore
  from public.profiles pr where pr.id = auth.uid();

  if p_notify then
    v_destinatari := public.conversation_audience(p_conversation);

    perform public.notify_profiles(
      v_destinatari,
      case
        when p_priority in ('urgent', 'critical')
          then 'Comunicazione ' || (case p_priority when 'critical' then 'critica' else 'urgente' end)
               || ' — ' || v_conv.title
        else 'Nuovo messaggio da ' || v_autore
      end,
      left(trim(p_body), 140),
      '/pro/comunicazioni/' || p_conversation::text,
      public.comms_severity(p_priority),
      'comunicazioni'
    );
  end if;

  perform public.emit_event(
    'communication.message.sent', 'conversation', p_conversation, v_conv.patient_id, null,
    jsonb_build_object('kind', p_kind, 'priority', p_priority, 'message_id', v_id)
  );

  perform public.log_comms(
    'communication.message.sent', p_conversation, v_conv.patient_id,
    jsonb_build_object('kind', p_kind, 'priority', p_priority, 'message_id', v_id)
  );

  return v_id;
end;
$fn$;

/**
 * Aprire una conversazione e scrivere la prima riga, in una mossa.
 *
 * I partecipanti arrivano come due elenchi — persone e reparti — perché
 * sono due cose diverse e non una lista mista da smistare. Chi apre
 * entra sempre, anche se si è dimenticato di mettersi nell'elenco: una
 * conversazione che il suo autore non vede è il primo bug che
 * scriveremmo.
 */
create or replace function public.open_conversation(
  p_title        text,
  p_body         text,
  p_kind         conversation_kind default 'direct',
  p_priority     comms_priority default 'normal',
  p_department   uuid default null,
  p_patient      uuid default null,
  p_profiles     uuid[] default '{}'::uuid[],
  p_departments  uuid[] default '{}'::uuid[],
  p_message_kind comms_message_kind default 'info'
)
returns uuid
language plpgsql
security definer
set search_path = public
as $fn$
declare
  v_id uuid;
begin
  if not public.is_internal() then
    raise exception 'Le comunicazioni interne sono riservate al personale di Unique.';
  end if;
  if length(trim(coalesce(p_title, ''))) < 3 then
    raise exception 'Serve un oggetto: è quello che si legge nell''elenco.';
  end if;
  if p_patient is not null and not public.can_access_patient(p_patient) then
    raise exception 'Paziente non accessibile.';
  end if;

  insert into public.conversations
    (kind, title, department_id, patient_id, priority, created_by)
  values
    (p_kind, trim(p_title), p_department, p_patient, p_priority, auth.uid())
  returning id into v_id;

  insert into public.conversation_participants (conversation_id, profile_id, role)
  values (v_id, auth.uid(), 'owner');

  insert into public.conversation_participants (conversation_id, profile_id)
  select v_id, p
  from unnest(coalesce(p_profiles, '{}'::uuid[])) as p
  where p is not null and p <> auth.uid()
  on conflict do nothing;

  insert into public.conversation_participants (conversation_id, department_id)
  select v_id, d
  from unnest(coalesce(p_departments, '{}'::uuid[])) as d
  where d is not null
  on conflict do nothing;

  perform public.post_message(v_id, p_body, p_message_kind, p_priority);

  perform public.log_comms(
    'communication.opened', v_id, p_patient,
    jsonb_build_object('kind', p_kind, 'priority', p_priority)
  );

  return v_id;
end;
$fn$;

/**
 * Segnare letto.
 *
 * Aprire una conversazione la segna letta — al contrario dei fili con i
 * pazienti, dove il timestamp è uno per tutta la clinica e segnarlo
 * all'apertura toglierebbe il pallino a tutto il team. Qui la lettura è
 * di una persona, quindi vale solo per lei, e chiedere un gesto in più
 * per una cosa che è già successa sarebbe burocrazia.
 *
 * Se chi legge arriva dal reparto e non ha una riga sua, gliela creiamo:
 * lo stato di lettura è di una persona, e un reparto non ha occhi.
 */
create or replace function public.mark_conversation_read(p_conversation uuid)
returns integer
language plpgsql
security definer
set search_path = public
as $fn$
declare
  v_reparto uuid;
  v_prima timestamptz;
  v_nuove integer;
begin
  if not public.conversation_visible(p_conversation) then
    return 0;
  end if;

  if not exists (
    select 1 from public.conversation_participants
    where conversation_id = p_conversation and profile_id = auth.uid()
  ) then
    select p.department_id into v_reparto
    from public.conversation_participants p
    join public.department_members dm on dm.department_id = p.department_id
    where p.conversation_id = p_conversation
      and dm.profile_id = auth.uid()
      and dm.ended_at is null
    limit 1;

    insert into public.conversation_participants
      (conversation_id, profile_id, via_department_id, last_read_at)
    values (p_conversation, auth.uid(), v_reparto, now())
    on conflict do nothing;
  end if;

  select last_read_at into v_prima
  from public.conversation_participants
  where conversation_id = p_conversation and profile_id = auth.uid();

  -- Solo ciò che è arrivato dopo l'ultima lettura. Senza questo confine
  -- ogni apertura di un filo lungo riscriverebbe centinaia di ricevute
  -- per non cambiare niente.
  insert into public.conversation_message_reads (message_id, profile_id)
  select m.id, auth.uid()
  from public.conversation_messages m
  where m.conversation_id = p_conversation
    and m.author_id is distinct from auth.uid()
    and (v_prima is null or m.created_at > v_prima)
  on conflict do nothing;

  get diagnostics v_nuove = row_count;

  update public.conversation_participants
     set last_read_at = now()
   where conversation_id = p_conversation and profile_id = auth.uid();

  if v_nuove > 0 then
    perform public.log_comms(
      'communication.read', p_conversation, null,
      jsonb_build_object('messaggi', v_nuove)
    );
  end if;

  return v_nuove;
end;
$fn$;

/** Aggiungere qualcuno a una conversazione in corso. */
create or replace function public.add_conversation_participant(
  p_conversation uuid,
  p_profile      uuid default null,
  p_department   uuid default null
)
returns void
language plpgsql
security definer
set search_path = public
as $fn$
declare
  v_conv public.conversations;
begin
  if not public.conversation_writable(p_conversation) then
    raise exception 'Non puoi modificare questa conversazione.';
  end if;
  if (p_profile is null) = (p_department is null) then
    raise exception 'Indica una persona oppure un reparto.';
  end if;

  select * into v_conv from public.conversations where id = p_conversation;

  insert into public.conversation_participants (conversation_id, profile_id, department_id)
  values (p_conversation, p_profile, p_department)
  on conflict do nothing;

  perform public.notify_profiles(
    case when p_profile is not null then array[p_profile] else
      (select coalesce(array_agg(dm.profile_id), '{}'::uuid[])
       from public.department_members dm
       where dm.department_id = p_department and dm.ended_at is null)
    end,
    'Sei stato aggiunto a una comunicazione',
    v_conv.title,
    '/pro/comunicazioni/' || p_conversation::text,
    'important',
    'comunicazioni'
  );

  perform public.log_comms(
    'communication.participant.added', p_conversation, v_conv.patient_id,
    jsonb_build_object('profile_id', p_profile, 'department_id', p_department)
  );
end;
$fn$;

/** Chiudere o riaprire. Non cancella niente: toglie la possibilità di scrivere. */
create or replace function public.set_conversation_closed(
  p_conversation uuid,
  p_closed       boolean
)
returns void
language plpgsql
security definer
set search_path = public
as $fn$
declare
  v_conv public.conversations;
begin
  select * into v_conv from public.conversations where id = p_conversation;
  if v_conv is null then
    raise exception 'Conversazione non trovata.';
  end if;

  -- Riaprire una conversazione chiusa non passa da `conversation_writable`,
  -- che su una chiusa dice sempre no: qui basta essere dentro.
  if not public.conversation_visible(p_conversation) then
    raise exception 'Conversazione non accessibile.';
  end if;

  update public.conversations set is_closed = p_closed where id = p_conversation;

  perform public.log_comms(
    case when p_closed then 'communication.closed' else 'communication.reopened' end,
    p_conversation, v_conv.patient_id, '{}'::jsonb
  );
end;
$fn$;

-- ── Consulti ──────────────────────────────────────────────────────
/**
 * Chiedere un parere.
 *
 * Crea tre cose in una transazione: la conversazione che lo ospita, la
 * scheda che ne tiene lo stato, e la prima riga con il motivo. Sono
 * inseparabili — un consulto senza conversazione non si può discutere,
 * una conversazione senza scheda non si può contare.
 *
 * Il reparto destinatario partecipa **come reparto** e non come elenco
 * di persone: chi è di turno oggi lo vede, e chi entrerà in reparto il
 * mese prossimo pure.
 */
create or replace function public.request_consultation(
  p_patient     uuid,
  p_department  uuid,
  p_reason      text,
  p_description text default null,
  p_priority    comms_priority default 'normal',
  p_assignee    uuid default null,
  p_due_at      timestamptz default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $fn$
declare
  v_conv uuid;
  v_id uuid;
  v_reparto_mio uuid;
  v_paziente text;
  v_reparto text;
  v_corpo text;
begin
  if not public.is_internal() then
    raise exception 'Azione riservata al personale di Unique.';
  end if;
  if not public.can_access_patient(p_patient) then
    raise exception 'Paziente non accessibile.';
  end if;
  if length(trim(coalesce(p_reason, ''))) < 3 then
    raise exception 'Serve un motivo: è la prima cosa che legge chi lo prende in carico.';
  end if;
  if not exists (
    select 1 from public.departments
    where id = p_department and is_active and is_clinical
  ) then
    raise exception 'Reparto destinatario non valido.';
  end if;

  select pr.full_name into v_paziente
  from public.patients pa join public.profiles pr on pr.id = pa.profile_id
  where pa.id = p_patient;

  select name into v_reparto from public.departments where id = p_department;
  select department_id into v_reparto_mio from public.department_members
   where profile_id = auth.uid() and ended_at is null limit 1;

  insert into public.conversations
    (kind, title, department_id, patient_id, priority, created_by)
  values
    ('consultation',
     'Consulto ' || coalesce(v_reparto, '') || ' — ' || coalesce(v_paziente, 'paziente'),
     p_department, p_patient, p_priority, auth.uid())
  returning id into v_conv;

  insert into public.conversation_participants (conversation_id, profile_id, role)
  values (v_conv, auth.uid(), 'owner');

  insert into public.conversation_participants (conversation_id, department_id)
  values (v_conv, p_department);

  if p_assignee is not null and p_assignee <> auth.uid() then
    insert into public.conversation_participants (conversation_id, profile_id)
    values (v_conv, p_assignee)
    on conflict do nothing;
  end if;

  insert into public.clinical_consultations
    (patient_id, conversation_id, requested_by, requesting_department_id,
     target_department_id, assignee_id, reason, description, priority, due_at)
  values
    (p_patient, v_conv, auth.uid(), v_reparto_mio,
     p_department, p_assignee, trim(p_reason), nullif(trim(coalesce(p_description, '')), ''),
     p_priority, p_due_at)
  returning id into v_id;

  update public.conversations set consultation_id = v_id where id = v_conv;

  v_corpo := trim(p_reason)
    || case when coalesce(trim(p_description), '') <> ''
            then E'\n\n' || trim(p_description) else '' end;

  perform public.post_message(v_conv, v_corpo, 'consultation', p_priority);

  perform public.emit_event(
    'consultation.requested', 'consultation', v_id, p_patient, null,
    jsonb_build_object('department_id', p_department, 'priority', p_priority)
  );

  perform public.log_comms(
    'consultation.requested', v_conv, p_patient,
    jsonb_build_object('consultation_id', v_id, 'department_id', p_department)
  );

  return v_id;
end;
$fn$;

/**
 * Muovere un consulto.
 *
 * Una funzione sola e non quattro, perché quattro funzioni sono quattro
 * posti in cui dimenticare una transizione. Gli stati vanno avanti:
 * l'unico ritorno ammesso è da `answered` a `in_review`, quando chi ha
 * chiesto replica e la palla torna allo specialista.
 */
create or replace function public.advance_consultation(
  p_consultation uuid,
  p_status       consultation_status,
  p_answer       text default null
)
returns void
language plpgsql
security definer
set search_path = public
as $fn$
declare
  k public.clinical_consultations;
  v_nome text;
begin
  select * into k from public.clinical_consultations where id = p_consultation;
  if k is null then
    raise exception 'Consulto non trovato.';
  end if;
  if not public.conversation_writable(k.conversation_id) then
    raise exception 'Non puoi intervenire su questo consulto.';
  end if;
  if k.status = 'closed' and p_status <> 'closed' then
    raise exception 'Il consulto è chiuso.';
  end if;
  if p_status = 'answered' and length(trim(coalesce(p_answer, ''))) < 3 then
    raise exception 'Una risposta vuota non è una risposta.';
  end if;

  select coalesce(pr.full_name, 'Un collega') into v_nome
  from public.profiles pr where pr.id = auth.uid();

  update public.clinical_consultations
     set status      = p_status,
         assignee_id = case
                         when p_status in ('taken', 'in_review') then coalesce(assignee_id, auth.uid())
                         else assignee_id
                       end,
         taken_at    = case when p_status = 'taken'    and taken_at is null    then now() else taken_at end,
         answered_at = case when p_status = 'answered'                          then now() else answered_at end,
         closed_at   = case when p_status = 'closed'                            then now() else closed_at end,
         answer      = coalesce(nullif(trim(coalesce(p_answer, '')), ''), answer)
   where id = p_consultation;

  -- Prendere in carico entra nella conversazione: chi risponde deve
  -- restare raggiungibile anche dopo essere uscito dal reparto.
  if p_status in ('taken', 'in_review') then
    insert into public.conversation_participants (conversation_id, profile_id)
    values (k.conversation_id, auth.uid())
    on conflict do nothing;
  end if;

  -- Il messaggio non avvisa nessuno: l'avviso lo manda questa funzione,
  -- una volta sola, con le parole del consulto invece che con quelle di
  -- una riga di chat.
  if p_answer is not null and length(trim(p_answer)) > 0 then
    perform public.post_message(
      k.conversation_id, p_answer, 'consultation',
      case when p_status = 'answered' then 'normal' else k.priority end,
      null, false
    );
  end if;

  /*
   * Chi va avvisato: tutta la conversazione, più chi ha chiesto il
   * parere anche se ha silenziato il filo — la risposta a una domanda
   * che si è posti non è rumore, ed è l'unica eccezione al silenzio.
   * `conversation_audience` toglie già chi sta agendo, e il `filter`
   * evita che chi chiude il proprio consulto se lo annunci da solo.
   */
  perform public.notify_profiles(
    public.conversation_audience(k.conversation_id)
      || (case when k.requested_by is not null and k.requested_by <> auth.uid()
               then array[k.requested_by] else '{}'::uuid[] end),
    case p_status
      when 'taken'     then 'Consulto preso in carico da ' || v_nome
      when 'in_review' then 'Consulto in valutazione'
      when 'answered'  then 'Risposta al consulto ricevuta'
      when 'closed'    then 'Consulto chiuso'
      else 'Consulto aggiornato'
    end,
    k.reason,
    '/pro/comunicazioni/' || k.conversation_id::text,
    case when p_status = 'answered' then 'important'::notification_severity
         else 'info'::notification_severity end,
    'consulti'
  );

  perform public.emit_event(
    'consultation.' || p_status::text, 'consultation', p_consultation, k.patient_id, null,
    jsonb_build_object('assignee_id', auth.uid())
  );

  perform public.log_comms(
    'consultation.' || p_status::text, k.conversation_id, k.patient_id,
    jsonb_build_object('consultation_id', p_consultation)
  );
end;
$fn$;

-- ── Ricerca ───────────────────────────────────────────────────────
/**
 * Cercare in ciò che si ha diritto di leggere.
 *
 * Restituisce conversazioni e non messaggi: chi cerca «troponina» vuole
 * il filo in cui se n'è parlato, non quattordici righe fuori contesto.
 * La Row Level Security fa il resto — questa funzione è `stable` e non
 * `security definer` **di proposito**, così la `select` dentro passa
 * dalle policy di chi la chiama.
 */
create or replace function public.search_communications(
  p_query text,
  p_limit integer default 40
)
returns table (
  conversation_id uuid,
  rank            real,
  snippet         text
)
language sql
stable
set search_path = public
as $fn$
  select
    m.conversation_id,
    max(ts_rank(m.search_vector, websearch_to_tsquery('italian', p_query)))::real as rank,
    (array_agg(left(m.body, 180) order by m.created_at desc))[1] as snippet
  from public.conversation_messages m
  where length(trim(coalesce(p_query, ''))) > 1
    and m.search_vector @@ websearch_to_tsquery('italian', p_query)
  group by m.conversation_id
  order by rank desc
  limit greatest(1, least(coalesce(p_limit, 40), 200));
$fn$;

-- ── Non letti ─────────────────────────────────────────────────────
/**
 * Quanto c'è da leggere, conversazione per conversazione.
 *
 * Il conteggio nasce dalle **ricevute** e non dal confronto fra
 * `last_read_at` e la data dell'ultimo messaggio. La differenza si vede
 * quando due righe arrivano nello stesso secondo in cui qualcuno apre il
 * filo: il confronto per data ne perde una e nessuno se ne accorge mai,
 * perché il pallino resta spento e la riga sembra letta.
 *
 * Torna anche a zero: chi la chiama disegna un elenco, e un elenco con
 * dentro dei buchi è più difficile da usare di uno completo.
 */
create or replace function public.my_unread_conversations()
returns table (
  conversation_id uuid,
  unread          integer,
  last_read_at    timestamptz,
  is_muted        boolean,
  is_participant  boolean
)
language sql
stable
security definer
set search_path = public
as $fn$
  select
    c.id,
    (
      select count(*)::integer
      from public.conversation_messages m
      left join public.conversation_message_reads r
        on r.message_id = m.id and r.profile_id = auth.uid()
      where m.conversation_id = c.id
        and m.author_id is distinct from auth.uid()
        and r.message_id is null
    ),
    p.last_read_at,
    coalesce(p.is_muted, false),
    p.id is not null
  from public.conversations c
  left join public.conversation_participants p
    on p.conversation_id = c.id and p.profile_id = auth.uid() and p.left_at is null
  where public.conversation_visible(c.id);
$fn$;

/**
 * Il numero accanto alla voce di menu.
 *
 * Vive nel layout, quindi gira su **ogni** pagina dell'area clinica: è
 * una funzione sua e non un `filter` su `my_unread_conversations` perché
 * quella restituisce una riga per conversazione, e disegnare un pallino
 * non è una buona ragione per leggerle tutte.
 */
create or replace function public.count_unread_communications()
returns integer
language sql
stable
security definer
set search_path = public
as $fn$
  select count(*)::integer
  from public.conversation_messages m
  join public.conversations c on c.id = m.conversation_id
  left join public.conversation_message_reads r
    on r.message_id = m.id and r.profile_id = auth.uid()
  left join public.conversation_participants p
    on p.conversation_id = c.id and p.profile_id = auth.uid()
  where m.author_id is distinct from auth.uid()
    and r.message_id is null
    and coalesce(p.is_muted, false) = false
    and coalesce(p.left_at is null, true)
    and public.conversation_visible(c.id);
$fn$;

-- ── Realtime ──────────────────────────────────────────────────────
/*
 * Le tre tabelle da cui dipende una schermata che si aggiorna da sola.
 *
 * Realtime valuta la Row Level Security per ogni sottoscrittore: una
 * riga di una conversazione che non vedi non ti arriva nemmeno come
 * evento. È la ragione per cui non c'è nessun filtro applicativo qui —
 * sarebbe una seconda regola da tenere allineata alla prima.
 *
 * Il `do` esiste perché in verifica locale la pubblicazione non c'è, e
 * una migrazione che gira solo su Supabase non si può provare prima di
 * incollarla.
 */
do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    begin
      execute 'alter publication supabase_realtime add table public.conversation_messages';
    exception when duplicate_object then null;
    end;
    begin
      execute 'alter publication supabase_realtime add table public.conversations';
    exception when duplicate_object then null;
    end;
    begin
      execute 'alter publication supabase_realtime add table public.notifications';
    exception when duplicate_object then null;
    end;
  end if;
end $$;

-- ── I reparti di Unique ───────────────────────────────────────────
/*
 * Un punto di partenza, non un elenco chiuso.
 *
 * Sono le unità che esistono davvero in una longevity clinic, non i
 * reparti di un ospedale per acuti: qui non c'è un pronto soccorso, e
 * un reparto vuoto in elenco è peggio di un reparto mancante — insegna
 * che la lista non descrive la realtà. La direzione ne aggiunge da
 * `/control/reparti` senza toccare una migrazione.
 *
 * `on conflict do nothing` perché questa migrazione deve poter girare
 * due volte su un database in cui qualcuno ha già rinominato qualcosa.
 */
insert into public.departments (organization_id, location_id, slug, name, description, discipline, is_clinical, sort_order)
select
  o.id,
  (select id from public.locations where slug = 'varese'),
  d.slug, d.name, d.descrizione, d.disciplina::professional_discipline, d.clinico, d.ordine
from public.organizations o
cross join (values
  ('medicina',       'Medicina',              'Valutazione clinica, referti, terapie, decisioni sui casi complessi.', 'physician',     true,  10),
  ('diagnostica',    'Diagnostica',           'Esami di laboratorio e imaging: richieste, refertazione, priorità.',   null,            true,  20),
  ('nutrizione',     'Nutrizione',            'Piani alimentari, composizione corporea, metabolismo.',                'nutritionist',  true,  30),
  ('osteopatia',     'Osteopatia',            'Valutazione funzionale, trattamenti manuali, mobilità.',               'osteopath',     true,  40),
  ('psicologia',     'Psicologia',            'Benessere mentale, sonno, stress, aderenza al percorso.',              'psychologist',  true,  50),
  ('preparazione',   'Preparazione atletica', 'Programmazione dell''allenamento, forza, capacità aerobica.',          'trainer',       true,  60),
  ('infermieristica','Infermieristica',       'Prelievi, misurazioni, somministrazioni, preparazione della visita.',  'nurse',         true,  70),
  ('accoglienza',    'Accoglienza',           'Agenda, arrivi, recapiti. Non riceve consulti clinici.',               null,            false, 80),
  ('amministrazione','Amministrazione',       'Membership, crediti, fatture, pagamenti.',                             null,            false, 90),
  ('direzione',      'Direzione',             'Coordinamento clinico e organizzativo.',                               null,            false, 100)
) as d(slug, name, descrizione, disciplina, clinico, ordine)
where o.slug = 'unique'
on conflict (slug) do nothing;

/*
 * Chi c'è dentro, al primo giro.
 *
 * Ogni professionista entra nel reparto della propria disciplina. Non è
 * un'assegnazione definitiva — la direzione la corregge dall'interfaccia
 * — ma è meglio di dieci reparti vuoti: un sistema di comunicazione che
 * al primo accesso non ha nessun destinatario sembra rotto, e nessuno lo
 * riapre una seconda volta.
 */
insert into public.department_members (department_id, profile_id)
select d.id, pr.profile_id
from public.professionals pr
join public.departments d on d.discipline = pr.discipline
where pr.is_active
on conflict do nothing;

comment on table public.conversations is
  'Una conversazione interna. Il paziente non la vede mai: la sua messaggistica è message_threads, e sono due mondi separati di proposito.';
comment on table public.clinical_consultations is
  'Una richiesta di parere, con uno stato che si può contare. Aperto, preso in carico, in valutazione, risposto, chiuso.';
comment on function public.has_consultation_access is
  'Un consulto aperto è un motivo di cura: dà accesso alla cartella per la sua durata e trenta giorni oltre, e ogni apertura resta nel registro.';
