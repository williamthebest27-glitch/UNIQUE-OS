-- ═══════════════════════════════════════════════════════════════════
-- Unique Brain: conversazioni, memoria, approvazioni, task, notifiche
--
-- Qui il sistema smette di essere un insieme di schermate e diventa un
-- interlocutore. Quattro pezzi, e l'ordine non è casuale:
--
--   1. le conversazioni — perché "perché?" abbia un contesto a cui
--      riferirsi;
--   2. la memoria — le decisioni autorizzate restano, e non vanno
--      ripetute a ogni chat;
--   3. le proposte — niente di sensibile succede senza che una persona
--      abbia visto l'anteprima e detto di sì;
--   4. i task e le notifiche — perché una conclusione senza un incaricato
--      è solo un'osservazione.
-- ═══════════════════════════════════════════════════════════════════

-- ── Conversazioni ─────────────────────────────────────────────────
create table public.brain_conversations (
  id           uuid primary key default gen_random_uuid(),
  profile_id   uuid not null references public.profiles (id) on delete cascade,
  title        text,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  last_message_at timestamptz not null default now()
);

create index brain_conversations_recent
  on public.brain_conversations (profile_id, last_message_at desc);

create trigger brain_conversations_touch
  before update on public.brain_conversations
  for each row execute function public.touch_updated_at();

create table public.brain_messages (
  id              uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.brain_conversations (id) on delete cascade,
  role            text not null check (role in ('user', 'assistant')),
  content         text not null default '',
  /*
   * Gli strumenti usati e cosa hanno restituito.
   *
   * È la parte che rende verificabile una risposta: chi legge deve poter
   * vedere che il fatturato viene da una query e non da una stima. Senza
   * questo, una chat con l'azienda è una chat con un modello che parla
   * dell'azienda.
   */
  tool_calls      jsonb not null default '[]'::jsonb,
  model           text,
  created_at      timestamptz not null default now()
);

create index brain_messages_by_conversation
  on public.brain_messages (conversation_id, created_at);

-- ── Memoria ───────────────────────────────────────────────────────
/*
 * Cosa il Brain ricorda fra una conversazione e l'altra.
 *
 * Non è la trascrizione: sono le decisioni prese e le preferenze
 * dichiarate. "Le campagne sotto i 50 € di spesa non le commentiamo",
 * "il prezzo dello Score è passato a 149 il 15 marzo", "quando trovi
 * pazienti inattivi preparami la lista ma non scrivere a nessuno".
 *
 * Ha una data di validità come la knowledge base, e per la stessa
 * ragione: una preferenza di sei mesi fa può non valere più.
 */
create type memory_kind as enum ('decision', 'preference', 'fact');

create table public.brain_memory (
  id           uuid primary key default gen_random_uuid(),
  kind         memory_kind not null default 'fact',
  statement    text not null,
  context      text,
  source_conversation_id uuid references public.brain_conversations (id) on delete set null,
  created_by   uuid references public.profiles (id) on delete set null,
  valid_until  date,
  created_at   timestamptz not null default now()
);

create index brain_memory_recent on public.brain_memory (created_at desc);

-- ── Approvazioni ──────────────────────────────────────────────────
/*
 * Le quattro classi di azione.
 *
 *   read       — leggere. Non chiede niente a nessuno.
 *   suggest    — proporre. L'AI dice, l'utente decide.
 *   reversible — fare qualcosa che si può disfare. Basta una conferma.
 *   sensitive  — toccare prezzi, dati clinici, comunicazioni verso
 *                l'esterno, denaro. Richiede autorizzazione esplicita di
 *                chi ha il ruolo per darla.
 *
 * La classe non la sceglie il modello: sta nel catalogo delle azioni,
 * scritto in codice. Un modello che potesse dichiarare "questa è
 * reversibile" avrebbe il permesso di declassare la propria azione.
 */
create type action_class as enum ('read', 'suggest', 'reversible', 'sensitive');

create type proposal_state as enum (
  'pending', 'approved', 'rejected', 'executed', 'failed', 'expired'
);

create table public.brain_proposals (
  id              uuid primary key default gen_random_uuid(),
  conversation_id uuid references public.brain_conversations (id) on delete set null,
  action          text not null,
  action_class    action_class not null,
  title           text not null,
  summary         text not null,
  /*
   * Cosa verrebbe toccato, in italiano e per esteso: listino del sito,
   * knowledge base, CRM, dashboard. È la lista che il founder legge
   * prima di dire di sì, ed è il motivo per cui la domanda "vuoi
   * applicare l'aggiornamento?" non è una domanda a scatola chiusa.
   */
  impact          jsonb not null default '[]'::jsonb,
  payload         jsonb not null default '{}'::jsonb,
  /*
   * L'anteprima: cosa cambierebbe davvero, calcolata sui dati veri al
   * momento della proposta. Conteggi ed esempi, non promesse.
   */
  preview         jsonb not null default '{}'::jsonb,
  state           proposal_state not null default 'pending',
  requested_by    uuid references public.profiles (id) on delete set null,
  decided_by      uuid references public.profiles (id) on delete set null,
  decided_at      timestamptz,
  decision_note   text,
  executed_at     timestamptz,
  result          jsonb,
  error           text,
  /*
   * Una proposta scade.
   *
   * L'anteprima è stata calcolata su dati di sette giorni fa: approvarla
   * oggi significa eseguire su un mondo diverso da quello che è stato
   * mostrato. Meglio rifarla.
   */
  expires_at      timestamptz not null default now() + interval '7 days',
  created_at      timestamptz not null default now()
);

create index brain_proposals_pending
  on public.brain_proposals (state, created_at desc)
  where state = 'pending';

-- ── Task ──────────────────────────────────────────────────────────
/*
 * Un task solo per tutta Unique.
 *
 * `professional_tasks` nasceva clinico, ma un task può essere di
 * chiunque: richiamare un paziente è della reception, controllare un
 * pagamento dell'amministrazione, approvare uno Score di un medico.
 * Tenere due tabelle avrebbe significato due elenchi, due notifiche e la
 * domanda "dove sta il mio task".
 */
alter table public.professional_tasks rename to tasks;

alter table public.tasks
  alter column professional_id drop not null;

alter table public.tasks
  add column if not exists owner_id  uuid references public.profiles (id) on delete set null,
  -- 1 alta, 2 media, 3 bassa. Come le azioni consigliate al paziente.
  add column if not exists priority  smallint not null default 2 check (priority between 1 and 3),
  -- Da dove nasce: 'professional', 'brain', 'rule', 'patient', 'system'.
  add column if not exists origin    text not null default 'professional',
  add column if not exists category  text,
  add column if not exists proposal_id uuid references public.brain_proposals (id) on delete set null,
  -- L'evento che lo ha generato, quando ne esiste uno.
  add column if not exists event_id  bigint references public.domain_events (id) on delete set null;

create index if not exists tasks_by_owner
  on public.tasks (owner_id, status, due_on)
  where status = 'open';

comment on table public.tasks is
  'Un task ha sempre un incaricato, una priorità, una scadenza, uno stato e un''origine. Senza incaricato non è un task: è un desiderio.';

-- Le vecchie policy parlavano solo di professionisti.
drop policy if exists tasks_select on public.tasks;
drop policy if exists tasks_write  on public.tasks;

create policy tasks_select on public.tasks
  for select using (
    public.is_staff()
    or professional_id = public.my_professional_id()
    or owner_id = auth.uid()
    or (public.is_reception() and origin <> 'clinical')
  );

create policy tasks_write on public.tasks
  for all using (
    public.is_staff()
    or professional_id = public.my_professional_id()
    or owner_id = auth.uid()
    or public.is_reception()
  )
  with check (
    public.is_staff()
    or professional_id = public.my_professional_id()
    or owner_id = auth.uid()
    or public.is_reception()
  );

-- Un task che nasce e uno che si chiude sono fatti: chi ascolta gli
-- eventi deve poterli sentire come sente una visita completata.
create or replace function public.events_tasks()
returns trigger
language plpgsql
security definer
set search_path = public
as $fn$
begin
  if tg_op = 'INSERT' then
    perform public.emit_event(
      'task.created', 'task', new.id, new.patient_id, null,
      jsonb_build_object('title', new.title, 'origin', new.origin, 'priority', new.priority)
    );
  elsif old.status = 'open' and new.status = 'done' then
    perform public.emit_event(
      'task.completed', 'task', new.id, new.patient_id, null,
      jsonb_build_object('title', new.title)
    );
  end if;
  return new;
end;
$fn$;

create trigger tasks_events
  after insert or update on public.tasks
  for each row execute function public.events_tasks();

-- ── Notifiche con una gravità ─────────────────────────────────────
/*
 * "Non voglio ricevere centinaia di notifiche."
 *
 * Tre livelli, e la differenza non è di tono ma di destino: `critical`
 * interrompe, `important` si vede in giornata, `info` finisce nel digest
 * del mattino e non suona mai.
 */
create type notification_severity as enum ('critical', 'important', 'info');

alter table public.notifications
  add column if not exists severity notification_severity not null default 'info',
  add column if not exists category text,
  add column if not exists event_id bigint references public.domain_events (id) on delete set null,
  -- Vero quando è già stata riepilogata nel digest del mattino.
  add column if not exists digested_at timestamptz;

create index if not exists notifications_by_severity
  on public.notifications (profile_id, severity, created_at desc)
  where read_at is null;

/*
 * L'avviso allo staff, con la gravità.
 *
 * La versione a tre argomenti sparisce e questa la sostituisce: i
 * chiamanti esistenti — avvisi di pagamento e di membership — continuano
 * a funzionare e prendono il valore predefinito.
 */
drop function if exists public.notify_staff(text, text, text);

create or replace function public.notify_staff(
  p_title text,
  p_body  text,
  p_link  text default null,
  p_severity notification_severity default 'important',
  p_category text default null
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
  select id, p_title, p_body, p_link, p_severity, p_category
  from public.profiles
  where role::text in ('admin', 'owner');

  get diagnostics v_count = row_count;
  return v_count;
end;
$fn$;

-- I pagamenti falliti sono la ragione per cui esistono i livelli.
create or replace function public.payment_alert()
returns trigger
language plpgsql
security definer
set search_path = public
as $fn$
declare
  v_name text;
begin
  if tg_op = 'UPDATE' and old.status is not distinct from new.status then
    return new;
  end if;

  select pr.full_name into v_name
  from public.patients pa
  join public.profiles pr on pr.id = pa.profile_id
  where pa.id = new.patient_id;

  if new.status = 'failed' then
    perform public.notify_staff(
      'Pagamento fallito',
      coalesce(v_name, 'Paziente') || ' — ' ||
        to_char(new.amount_cents / 100.0, 'FM999G999D00') || ' ' || new.currency ||
        coalesce(': ' || new.failure_reason, ''),
      '/control',
      'critical',
      'incassi'
    );
  elsif new.status = 'paid' and tg_op = 'UPDATE' and old.status = 'failed' then
    perform public.notify_staff(
      'Pagamento recuperato',
      coalesce(v_name, 'Paziente') || ' — incasso andato a buon fine al tentativo ' ||
        new.attempts,
      '/control',
      'info',
      'incassi'
    );
  end if;

  return new;
end;
$fn$;

-- ── Chi legge, chi scrive ─────────────────────────────────────────
alter table public.brain_conversations enable row level security;
alter table public.brain_messages      enable row level security;
alter table public.brain_memory        enable row level security;
alter table public.brain_proposals     enable row level security;

-- Una conversazione con l'azienda è di chi l'ha avuta. Nemmeno un altro
-- amministratore la legge: il founder deve poter chiedere qualsiasi cosa.
create policy brain_conversations_own on public.brain_conversations
  for all using (profile_id = auth.uid()) with check (profile_id = auth.uid());

create policy brain_messages_own on public.brain_messages
  for all using (
    exists (
      select 1 from public.brain_conversations c
      where c.id = conversation_id and c.profile_id = auth.uid()
    )
  )
  with check (
    exists (
      select 1 from public.brain_conversations c
      where c.id = conversation_id and c.profile_id = auth.uid()
    )
  );

-- La memoria invece è dell'azienda: le decisioni prese valgono per tutti
-- quelli che hanno il diritto di vederle.
create policy brain_memory_staff on public.brain_memory
  for all using (public.is_staff()) with check (public.is_staff());

create policy brain_proposals_staff on public.brain_proposals
  for all using (public.is_staff()) with check (public.is_staff());

-- Chi ha chiesto qualcosa può vedere che fine ha fatto, anche se non è
-- lui a doverla autorizzare.
create policy brain_proposals_requester on public.brain_proposals
  for select using (requested_by = auth.uid());

/*
 * Decidere su una proposta.
 *
 * Nel database e non solo nell'applicazione, perché è il punto in cui
 * una macchina riceve il permesso di toccare l'azienda: la regola su chi
 * può darlo non deve dipendere da quale schermata è stata usata.
 *
 * L'esecuzione avviene fuori, in Node, dopo l'approvazione — e rilegge
 * lo stato invece di fidarsi di quello che aveva letto ieri.
 */
create or replace function public.decide_proposal(
  p_proposal uuid,
  p_approve  boolean,
  p_note     text default null
)
returns proposal_state
language plpgsql
security definer
set search_path = public
as $fn$
declare
  v_state proposal_state;
  v_class action_class;
  v_expires timestamptz;
begin
  select state, action_class, expires_at
    into v_state, v_class, v_expires
  from public.brain_proposals where id = p_proposal;

  if v_state is null then
    raise exception 'Proposta inesistente.';
  end if;

  if v_state <> 'pending' then
    raise exception 'Questa proposta è già stata decisa.';
  end if;

  if v_expires < now() then
    update public.brain_proposals set state = 'expired' where id = p_proposal;
    raise exception 'Proposta scaduta: l''anteprima non descrive più i dati di adesso.';
  end if;

  -- Un'azione sensibile la autorizza la direzione. Una reversibile la
  -- conferma chiunque lavori in Unique e l'abbia chiesta.
  if v_class = 'sensitive' and not public.is_staff() then
    raise exception 'Questa azione richiede l''autorizzazione della direzione.';
  end if;

  if not (public.is_staff() or public.is_internal()) then
    raise exception 'Non hai il permesso di decidere su questa proposta.';
  end if;

  update public.brain_proposals
  set state = case when p_approve then 'approved' else 'rejected' end,
      decided_by = auth.uid(),
      decided_at = now(),
      decision_note = p_note
  where id = p_proposal;

  perform public.emit_event(
    case when p_approve then 'brain.proposal_approved' else 'brain.proposal_rejected' end,
    'proposal', p_proposal, null, null,
    jsonb_build_object('note', p_note)
  );

  return case when p_approve then 'approved'::proposal_state else 'rejected'::proposal_state end;
end;
$fn$;
