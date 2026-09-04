-- ═══════════════════════════════════════════════════════════════════
-- Il Clinical Command Center
--
-- Due cose sole, e nessuna è una funzionalità nuova: sono due dati che
-- mancavano perché il lavoro clinico già esistente potesse essere
-- *raccontato*.
--
--   1. Lo stato di revisione di un referto. Finora `document_analyses`
--      diceva se il motore aveva letto il PDF — un fatto tecnico. Non
--      esisteva modo di sapere se un medico l'avesse guardato. "Da
--      revisionare" e "analizzato" sono due domande diverse, e la
--      seconda non risponde mai alla prima.
--
--   2. La traccia di chi ha letto. `audit_log` esisteva dal primo
--      giorno e non l'ha mai scritta nessuno: gli eventi di dominio
--      dicono cosa è *cambiato*, non chi ha *guardato*. Su dati
--      sanitari la seconda domanda è quella dell'art. 32 GDPR.
--
-- Tutto additivo. Nessuna colonna rimossa, nessuna policy allentata.
-- ═══════════════════════════════════════════════════════════════════

-- ── Lo stato di revisione di un referto ───────────────────────────
/*
 * Tre stati, e il salto fra il secondo e il terzo è quello che conta.
 *
 *   pending    è arrivato, nessuno l'ha ancora aperto.
 *   reviewed   un professionista l'ha letto. Chiunque nel care team.
 *   approved   ha valore clinico. Solo chi può decidere su un dato
 *              clinico, che è la stessa regola dei valori fuori soglia.
 *
 * Perché tre e non due: "letto" e "validato" sono lavori diversi e
 * spesso di persone diverse. Un nutrizionista legge un pannello
 * ematico e lo segna visto; a dire che quei valori entrano in cartella
 * con valore clinico è un medico. Collassarli in un flag solo
 * significherebbe che chiunque approva, oppure che nessuno segna.
 */
do $enum$
begin
  if not exists (select 1 from pg_type where typname = 'document_review_state') then
    create type document_review_state as enum ('pending', 'reviewed', 'approved');
  end if;
end
$enum$;

alter table public.documents
  add column if not exists review_state document_review_state not null default 'pending',
  add column if not exists reviewed_by  uuid references public.profiles (id) on delete set null,
  add column if not exists reviewed_at  timestamptz,
  add column if not exists review_note  text;

comment on column public.documents.review_state is
  'pending: nessuno l''ha aperto. reviewed: un professionista l''ha letto. approved: ha valore clinico, e a dirlo è chi può decidere su un dato clinico.';

-- L'indice serve alla coda: "cosa devo ancora guardare", ordinato per
-- arrivo. Parziale, perché i referti già approvati sono la maggioranza
-- e non li cerca nessuno.
create index if not exists documents_da_revisionare
  on public.documents (created_at desc)
  where review_state = 'pending';

create index if not exists documents_revisione_paziente
  on public.documents (patient_id, review_state, created_at desc);

/*
 * Cambiare stato a un referto.
 *
 * Una funzione e non un update perché tre regole devono valere
 * insieme, e una policy da sola non le esprime: chi può scrivere in
 * cartella può segnare "letto", ma approvare richiede il titolo
 * clinico; l'autore e l'istante si scrivono da soli, non li passa il
 * chiamante; e il passaggio lascia sia un evento sia una traccia.
 *
 * Security definer per poter scrivere in `audit_log`, su cui nessun
 * client ha policy di insert — è deliberato: una traccia che il
 * tracciato può scrivere non è una traccia.
 */
create or replace function public.review_document(
  p_document uuid,
  p_state    text,
  p_note     text default null
)
returns public.document_review_state
language plpgsql
security definer
set search_path = public
as $fn$
declare
  v_patient uuid;
  v_prima   public.document_review_state;
  v_dopo    public.document_review_state;
  v_titolo  text;
begin
  select patient_id, review_state, title
    into v_patient, v_prima, v_titolo
  from public.documents where id = p_document;

  if v_patient is null then
    raise exception 'Documento non trovato.';
  end if;

  if not public.can_write_clinical(v_patient) then
    raise exception 'Non hai titolo per revisionare i referti di questo paziente.';
  end if;

  if p_state not in ('pending', 'reviewed', 'approved') then
    raise exception 'Stato di revisione non valido: %', p_state;
  end if;

  v_dopo := p_state::public.document_review_state;

  -- La regola che giustifica l'intera funzione.
  if v_dopo = 'approved' and not public.can_approve_clinical_flag() then
    raise exception 'Approvare un referto richiede un medico.';
  end if;

  update public.documents
  set review_state = v_dopo,
      -- Riportare a "da revisionare" cancella la firma: dire che è
      -- stato letto da qualcuno e insieme che è da leggere sarebbe una
      -- contraddizione scritta in cartella.
      reviewed_by  = case when v_dopo = 'pending' then null else auth.uid() end,
      reviewed_at  = case when v_dopo = 'pending' then null else now() end,
      review_note  = nullif(trim(coalesce(p_note, '')), '')
  where id = p_document;

  perform public.emit_event(
    'document.reviewed', 'document', p_document, v_patient, null,
    jsonb_build_object('from', v_prima, 'to', v_dopo, 'title', v_titolo)
  );

  insert into public.audit_log (actor_id, action, entity, entity_id, patient_id, metadata)
  values (
    auth.uid(), 'document.review', 'document', p_document, v_patient,
    jsonb_build_object('from', v_prima, 'to', v_dopo, 'note', p_note)
  );

  return v_dopo;
end;
$fn$;

comment on function public.review_document is
  'L''unico modo di cambiare lo stato di revisione di un referto. Approvare richiede can_approve_clinical_flag(); l''autore e l''istante li scrive la funzione, non il chiamante.';

-- ── Chi ha guardato ───────────────────────────────────────────────
/*
 * La traccia di lettura.
 *
 * Gli eventi di dominio raccontano i cambiamenti: una visita
 * completata, un punteggio calcolato, un pagamento fallito. Nessuno di
 * essi dice che alle 15:40 qualcuno ha aperto la cartella di una
 * persona senza toccare niente — ed è esattamente ciò che un registro
 * dei trattamenti deve poter mostrare.
 *
 * Due proprietà deliberate:
 *
 *   Non fallisce mai. Una traccia che rompe la pagina insegna a
 *   toglierla. Se l'inserimento non riesce, la lettura prosegue.
 *
 *   Non la scrive il client. `audit_log` non ha policy di insert:
 *   l'unica strada è questa funzione, che è security definer.
 */
create or replace function public.log_clinical_access(
  p_action    text,
  p_entity    text,
  p_patient   uuid,
  p_entity_id uuid  default null,
  p_metadata  jsonb default '{}'::jsonb
)
returns void
language plpgsql
security definer
set search_path = public
as $fn$
begin
  -- Chi non ha titolo di accesso non produce una riga: la traccia
  -- registra le letture avvenute, non i tentativi. Quelli, se
  -- servissero, sarebbero un registro diverso.
  if p_patient is not null and not public.can_access_patient(p_patient) then
    return;
  end if;

  insert into public.audit_log (actor_id, action, entity, entity_id, patient_id, metadata)
  values (auth.uid(), p_action, p_entity, p_entity_id, p_patient, coalesce(p_metadata, '{}'::jsonb));
exception
  when others then
    -- Volutamente muto. Una pagina clinica non si rompe perché il
    -- registro degli accessi ha avuto un problema.
    return;
end;
$fn$;

comment on function public.log_clinical_access is
  'Registra una lettura di dati sanitari. Non solleva mai: una traccia che rompe la pagina viene tolta, e allora non traccia più niente.';

/*
 * Chi legge la traccia.
 *
 * Finora solo la direzione. Ma la trasparenza su chi ha guardato una
 * cartella serve prima di tutto a chi quella cartella la tiene: il
 * care team deve poter vedere gli accessi ai propri pazienti. Il
 * paziente no, non da qui: il suo diritto di accesso agli atti passa
 * da una richiesta formale, non da una schermata.
 */
drop policy if exists audit_select_care_team on public.audit_log;

create policy audit_select_care_team on public.audit_log
  for select using (
    public.is_internal()
    and patient_id is not null
    and public.can_access_patient(patient_id)
  );

create index if not exists audit_log_by_actor
  on public.audit_log (actor_id, created_at desc);

-- ── Mettere a tacere un segnale ───────────────────────────────────
/*
 * Il centro di attenzione va potuto zittire, o smette di funzionare.
 *
 * Un elenco di cose da fare che non si può ridurre diventa, nel giro di
 * due settimane, un elenco che nessuno apre: se la riga di martedì è
 * ancora lì venerdì identica, chi legge impara che quell'elenco non
 * rispecchia il lavoro fatto, e da quel momento lo scorre senza vederlo.
 *
 * Tre scelte che rendono onesto il gesto:
 *
 *   **Per persona.** «Non è lavoro mio» è un giudizio di chi lo dà. Se
 *   un nutrizionista mette da parte un referto, il medico deve
 *   continuare a vederlo — altrimenti tutti pensano che se ne sia
 *   occupato qualcun altro, che è il modo in cui le cose si perdono.
 *
 *   **A tempo.** `until` ha un valore predefinito perché «per sempre»
 *   non è una risposta a un fatto clinico: il referto non revisionato
 *   resta non revisionato. Si guadagna silenzio, non cancellazione.
 *
 *   **Con un motivo.** Chi legge la riga fra un mese deve poter capire
 *   perché era stata messa via, e chi la mette via deve fermarsi un
 *   istante a dirlo.
 *
 * `signal_id` è testo e non una chiave esterna: i segnali non sono righe
 * di una tabella, sono il risultato di regole applicate a righe di
 * tabelle diverse. L'identificatore lo compone il motore in
 * `lib/clinical/attenzione.ts`, ed è stabile per costruzione.
 */
create table public.signal_dismissals (
  id         uuid primary key default gen_random_uuid(),
  signal_id  text not null,
  profile_id uuid not null references public.profiles (id) on delete cascade,
  -- Serve alla Row Level Security e alla traccia: un segnale senza
  -- paziente (un task generico) lo lascia nullo.
  patient_id uuid references public.patients (id) on delete cascade,
  reason     text,
  -- Null significherebbe per sempre, e per sempre non lo vogliamo: il
  -- valore predefinito è una settimana.
  until      date not null default (current_date + 7),
  created_at timestamptz not null default now(),
  unique (signal_id, profile_id)
);

create index signal_dismissals_attive
  on public.signal_dismissals (profile_id, until desc);

comment on table public.signal_dismissals is
  'Un segnale messo a tacere da una persona, fino a una data. Non cancella il fatto: sopprime la riga. Il referto non revisionato resta non revisionato.';

alter table public.signal_dismissals enable row level security;

/*
 * Si vedono e si scrivono soltanto le proprie.
 *
 * Non è riservatezza: è che una soppressione altrui, se fosse
 * modificabile, riaprirebbe la porta al problema che la scelta «per
 * persona» chiude — qualcuno che silenzia il lavoro di qualcun altro.
 */
create policy dismissals_own on public.signal_dismissals
  for all using (profile_id = auth.uid())
  with check (
    profile_id = auth.uid()
    and public.is_internal()
    and (patient_id is null or public.can_access_patient(patient_id))
  );

-- ── I referti già in archivio ─────────────────────────────────────
/*
 * Cosa fare dello storico.
 *
 * Tentazione: segnare "approvati" tutti i referti che hanno prodotto
 * misure approvate. Sarebbe una firma inventata: direbbe che qualcuno
 * ha validato quel documento, e non è successo.
 *
 * Restano tutti `pending`, che è la verità. Fino a ieri il gesto non
 * esisteva, quindi nessuno l'ha fatto. La coda si svuota guardandoli,
 * non riscrivendo la storia.
 */
