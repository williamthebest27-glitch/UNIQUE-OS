-- ═══════════════════════════════════════════════════════════════════
-- Il filo fra il paziente e chi lo cura
--
-- `message_threads` e `messages` esistono dalla quindicesima migrazione
-- e funzionano. Questa non li rifà: chiude tre cose che, messe insieme,
-- rendevano quel filo meno di quello che dichiarava di essere.
--
--   **Le colonne.** La Row Level Security decide quali *righe* si
--   possono toccare, mai quali *colonne*. Le policy di scrittura di
--   `messages` erano scritte come se lo facesse — il commento diceva
--   «l'unica modifica ammessa è segnare per letto» — e in Supabase
--   `authenticated` nasce con `grant all` su tutto lo schema public.
--   Un paziente poteva riscrivere il corpo di un messaggio del proprio
--   medico. Le colonne si chiudono con i privilegi, e da qui in poi si
--   chiudono.
--
--   **La firma.** `messages_insert` verificava `author_id = auth.uid()`
--   ma non `from_patient`: bastava scrivere `false` per far comparire
--   nel proprio filo una riga attribuita alla clinica. Adesso nel filo
--   si scrive solo da `send_message`, che quel campo lo decide da sé.
--
--   **L'avviso.** Un messaggio del paziente svegliava `notify_staff`,
--   che scrive solo ad `admin` e `owner`, con un collegamento a
--   `/control/pazienti/…` che un professionista non ha nemmeno il
--   diritto di aprire. Il medico che segue quella persona non veniva
--   avvisato: la domanda arrivava e nessuno la vedeva finché non
--   ricaricava la pagina dei messaggi per conto suo.
--
-- E in fondo il tempo reale: `conversation_messages` era nella
-- pubblicazione, `messages` no. La messaggistica interna si aggiornava
-- da sé, quella con il paziente — la sola che un paziente vede — no.
-- ═══════════════════════════════════════════════════════════════════

-- ── 1. Le colonne che si possono scrivere ─────────────────────────
/*
 * Il modo giusto di dire «solo questa colonna» in Postgres.
 *
 * Una policy non può farlo: `using` e `with check` guardano la riga,
 * non l'insieme delle colonne toccate. Chi leggeva il file vedeva una
 * promessa che il database non stava mantenendo.
 *
 * `service_role` non compare mai qui sotto: i lavori di back-office
 * devono continuare a poter scrivere tutto.
 */

-- I messaggi: si nasce solo da `send_message`, si modifica solo il
-- momento in cui sono stati letti.
revoke insert, update, delete on public.messages from authenticated;
grant update (read_by_patient_at, read_by_staff_at)
  on public.messages to authenticated;

-- I fili: si aprono con `open_thread`, si chiudono con
-- `set_thread_closed`. In particolare `category` non si cambia più:
-- spostare un filo da clinico ad amministrativo lo mette sotto gli
-- occhi della reception, ed è una decisione di permessi travestita da
-- modifica di un'etichetta.
revoke insert, update, delete on public.message_threads from authenticated;

-- I questionari: le risposte le scrive `save_assessment`, che ricalcola
-- il completamento invece di crederci. Senza questa riga un paziente
-- poteva dichiararsi al 100% con metà risposte, o cancellare del tutto
-- un questionario che gli era stato assegnato.
revoke insert, update, delete on public.patient_assessments from authenticated;

-- Le azioni consigliate: il paziente ne sposta lo stato — fatto, la
-- salto — e nient'altro. Il titolo e la descrizione sono di chi le ha
-- prescritte.
revoke insert, update, delete on public.recommended_actions from authenticated;
grant update (status, completed_at)
  on public.recommended_actions to authenticated;

/*
 * `patient_assessments_staff_write` era `for all` con
 * `can_access_patient`, che al paziente stesso dice sempre sì: la
 * lettura era giusta, la scrittura no. Adesso scrive chi ha titolo
 * clinico, e il paziente passa dalla funzione.
 */
drop policy if exists patient_assessments_staff_write on public.patient_assessments;

create policy patient_assessments_clinical_write on public.patient_assessments
  for all
  using (public.is_staff() or public.can_write_clinical(patient_id))
  with check (public.is_staff() or public.can_write_clinical(patient_id));

/*
 * Le policy di scrittura sul filo non servono più a nessuno:
 * l'inserimento diretto è revocato e le funzioni sono security
 * definer. Toglierle evita che un domani qualcuno restituisca il
 * privilegio e si ritrovi la porta riaperta senza averlo deciso.
 */
drop policy if exists messages_insert on public.messages;
drop policy if exists threads_insert on public.message_threads;
drop policy if exists threads_update on public.message_threads;

-- ── 2. Chiudere e riaprire un filo ────────────────────────────────
/*
 * Era un update diretto dall'applicazione. Con i privilegi revocati
 * serve una funzione, ed è meglio così: chiudere un filo è un gesto
 * clinico — toglie al paziente la possibilità di scrivere — e non deve
 * poterlo fare il paziente su sé stesso, che è esattamente ciò che
 * `can_access_patient` gli avrebbe concesso.
 */
create or replace function public.set_thread_closed(
  p_thread uuid,
  p_closed boolean
)
returns void
language plpgsql
security definer
set search_path = public
as $fn$
declare
  v_patient uuid;
  v_category message_category;
begin
  select patient_id, category into v_patient, v_category
  from public.message_threads where id = p_thread;

  if v_patient is null then
    raise exception 'Conversazione non trovata.';
  end if;

  -- Non `can_access_patient`: quello include il paziente.
  if not (
    public.is_staff()
    or public.can_write_clinical(v_patient)
    or (public.is_reception() and v_category = 'administrative')
  ) then
    raise exception 'Non hai titolo per chiudere questa conversazione.';
  end if;

  update public.message_threads
  set is_closed = p_closed
  where id = p_thread;
end;
$fn$;

grant execute on function public.set_thread_closed(uuid, boolean) to authenticated;

-- ── 3. L'avviso arriva a chi deve rispondere ──────────────────────
/*
 * Stessa firma di prima — `p_document` c'era già, e adesso l'interfaccia
 * lo usa — e due differenze: chi viene svegliato, e un controllo
 * sull'allegato.
 *
 * Un filo **clinico** sveglia il care team del paziente, che è chi ha
 * la risposta, con un collegamento a `/pro/messaggi/<filo>`: la pagina
 * che quel ruolo può davvero aprire. Un filo **amministrativo** sveglia
 * la reception, che è chi risponde di appuntamenti e fatture.
 *
 * La direzione resta avvisata in entrambi i casi, ma con severità
 * `info`: è una supervisione, non una coda di lavoro, e un avviso a
 * comparsa per ogni messaggio di ogni paziente sarebbe una tendina che
 * sbatte tutto il giorno.
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
  v_mio uuid;
  v_paziente boolean;
  v_id uuid;
  v_nome text;
  v_anteprima text;
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

  /*
   * L'allegato deve appartenere allo stesso paziente del filo.
   *
   * Senza questo controllo si potrebbe allegare a una conversazione il
   * referto di un'altra persona: la RLS di `documents` impedisce di
   * *leggerlo* a chi non ha titolo, ma il filo lo vede anche la
   * reception quando è amministrativo, e un id che non c'entra è
   * comunque una riga sbagliata in una cartella clinica.
   */
  if p_document is not null then
    if not exists (
      select 1 from public.documents d
      where d.id = p_document and d.patient_id = v_thread.patient_id
    ) then
      raise exception 'Il documento allegato non appartiene a questo paziente.';
    end if;
  end if;

  /*
   * Da che parte del filo nasce questa riga.
   *
   * Era `v_thread.patient_id = public.my_patient_id()`, e per un
   * professionista `my_patient_id()` è NULL: il confronto non dava
   * `false`, dava **NULL**, e `from_patient` è `not null`. La clinica
   * non è mai riuscita a rispondere a un paziente — l'insert veniva
   * rifiutato dentro la funzione, e l'azione tornava un errore di
   * vincolo che nessuno collegava a un tre-valori.
   *
   * È il genere di guasto che non si vede rileggendo: la riga è corta,
   * dice quello che sembra dire, e sbaglia solo quando uno dei due
   * operandi è nullo. Il controllo esplicito lo chiude, e la prova nel
   * banco di verifica lo tiene chiuso.
   */
  v_mio := public.my_patient_id();
  v_paziente := v_mio is not null and v_thread.patient_id = v_mio;

  insert into public.messages
    (thread_id, author_id, from_patient, body, document_id,
     read_by_patient_at, read_by_staff_at)
  values
    (p_thread, auth.uid(), v_paziente, trim(p_body), p_document,
     case when v_paziente then now() end,
     case when v_paziente then null else now() end)
  returning id into v_id;

  update public.message_threads set last_message_at = now() where id = p_thread;

  v_anteprima := left(trim(p_body), 140);

  if v_paziente then
    select coalesce(pr.full_name, 'Un paziente') into v_nome
    from public.patients p join public.profiles pr on pr.id = p.profile_id
    where p.id = v_thread.patient_id;

    -- Chi ha la risposta: il care team, sulla pagina che può aprire.
    insert into public.notifications
      (profile_id, title, body, link_url, severity, category)
    select distinct pr.profile_id,
           'Messaggio da ' || v_nome,
           v_anteprima,
           '/pro/messaggi/' || p_thread::text,
           'important'::notification_severity,
           'messaggi'
    from public.care_team_members ctm
    join public.professionals pr on pr.id = ctm.professional_id
    where ctm.patient_id = v_thread.patient_id
      and ctm.ended_at is null
      and pr.profile_id is not null;

    -- La reception risponde dei fili amministrativi, e solo di quelli.
    if v_thread.category = 'administrative' then
      insert into public.notifications
        (profile_id, title, body, link_url, severity, category)
      select id, 'Messaggio da ' || v_nome, v_anteprima,
             '/pro/messaggi/' || p_thread::text,
             'important'::notification_severity, 'messaggi'
      from public.profiles where role::text = 'reception';
    end if;

    -- La direzione guarda, non lavora la coda.
    perform public.notify_staff(
      'Messaggio da ' || v_nome,
      v_anteprima,
      '/pro/messaggi/' || p_thread::text,
      'info'::notification_severity,
      'messaggi'
    );
  else
    insert into public.notifications
      (profile_id, title, body, link_url, severity, category)
    select p.profile_id, 'Nuovo messaggio da Unique', v_anteprima,
           '/messaggi/' || p_thread::text,
           'important'::notification_severity, 'messaggi'
    from public.patients p where p.id = v_thread.patient_id;
  end if;

  perform public.emit_event(
    'message.sent', 'message', v_id, v_thread.patient_id, null,
    jsonb_build_object(
      'from_patient', v_paziente,
      'category', v_thread.category,
      'con_allegato', p_document is not null
    )
  );

  return v_id;
end;
$fn$;

-- ── 4. Il tempo reale sul filo del paziente ───────────────────────
/*
 * `conversation_messages` era già pubblicato; `messages` no. È la
 * ragione per cui la messaggistica fra colleghi si aggiornava da sé e
 * quella con il paziente — la sola che il paziente vede — restava ferma
 * finché non si ricaricava a mano.
 *
 * La pubblicazione non aggira la Row Level Security: Supabase verifica
 * riga per riga che chi ascolta avrebbe potuto leggerla, e per
 * `messages` quel controllo passa da `thread_visible`.
 *
 * `replica identity full` serve perché il filtro del canale lavora su
 * `thread_id`, che non è la chiave primaria: senza, la riga vecchia non
 * viaggia e il filtro non ha su cosa applicarsi.
 */
alter table public.messages replica identity full;

do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    if not exists (
      select 1 from pg_publication_tables
      where pubname = 'supabase_realtime'
        and schemaname = 'public' and tablename = 'messages'
    ) then
      execute 'alter publication supabase_realtime add table public.messages';
    end if;

    if not exists (
      select 1 from pg_publication_tables
      where pubname = 'supabase_realtime'
        and schemaname = 'public' and tablename = 'message_threads'
    ) then
      execute 'alter publication supabase_realtime add table public.message_threads';
    end if;
  end if;
end;
$$;
