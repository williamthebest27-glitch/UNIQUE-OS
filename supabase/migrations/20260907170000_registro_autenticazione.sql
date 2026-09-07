-- ═══════════════════════════════════════════════════════════════════
-- Gli accessi al sistema, non solo agli accessi ai dati
--
-- `audit_log` sapeva dire chi ha guardato quale cartella. Non sapeva
-- dire **chi è entrato**, quando è uscito, e quante volte qualcuno ci
-- ha provato senza riuscirci.
--
-- È la domanda che si fa per prima quando si sospetta un accesso
-- abusivo, e finora la risposta stava solo nei registri di Supabase —
-- che sono di un altro sistema, hanno una conservazione loro, e non
-- fanno parte della catena di impronte che rende questo registro
-- opponibile.
--
-- ---
--
-- **Perché nessuna colonna nuova.**
--
-- La scelta ovvia sarebbe aggiungere `ip` e `user_agent` ad
-- `audit_log`. Sarebbe sbagliata, e in modo silenzioso: `audit_sigilla`
-- calcola l'impronta su un elenco preciso di campi, e una colonna fuori
-- da quell'elenco è **modificabile senza rompere la catena**. Avremmo
-- un indirizzo IP in una riga che si dichiara sigillata e non lo è per
-- quel campo.
--
-- Cambiare la formula dell'impronta era l'altra strada, e rompe la
-- verifica di tutte le righe già scritte.
--
-- Quindi: dentro `metadata`, che nell'impronta c'è già. Meno elegante
-- da interrogare, e sigillato — che è la sola proprietà per cui questa
-- tabella esiste.
-- ═══════════════════════════════════════════════════════════════════

/**
 * Registra un evento di autenticazione.
 *
 * `security definer` perché `audit_log` non ha policy di insert, e
 * perché **questa funzione deve poter scrivere senza una sessione**:
 * un tentativo fallito avviene per definizione prima che ci sia un
 * utente.
 *
 * Da qui discende l'unica preoccupazione seria del file: è una funzione
 * che scrive, raggiungibile senza autenticazione. Tre cose la
 * contengono, e vale la pena elencarle perché la prima da sola non
 * basterebbe.
 *
 *   1. **Il freno applicativo.** Chi la chiama è l'azione d'accesso, e
 *      quella passa da `src/lib/sicurezza/freno.ts` prima di arrivare
 *      qui. Un dosso, non un muro — vedi il commento in quel file.
 *   2. **L'azione è chiusa** a un elenco fisso di valori. Non si può
 *      scrivere una riga arbitraria nel registro passando una stringa
 *      qualsiasi.
 *   3. **Il testo è troncato** prima di essere scritto. Senza, una
 *      intestazione `user-agent` da un megabyte diventerebbe un
 *      megabyte per tentativo.
 *
 * Il tentativo fallito porta l'email, e questa è una decisione
 * deliberata su dati personali: senza, la riga direbbe «qualcuno ha
 * sbagliato password» e non servirebbe a niente. È il minimo necessario
 * per rispondere alla domanda per cui il registro esiste — *contro
 * quale account*.
 */
create or replace function public.record_auth_event(
  p_action     text,
  p_email      text default null,
  p_ip         text default null,
  p_user_agent text default null
)
returns void
language plpgsql
security definer
set search_path = public
as $fn$
declare
  v_actor uuid := auth.uid();
begin
  -- Un elenco chiuso. Ciò che non è previsto non entra: il registro
  -- non è un posto dove chiunque scrive la frase che preferisce.
  if p_action not in (
    'auth.login',
    'auth.login_failed',
    'auth.logout',
    'auth.password_changed',
    'auth.password_reset_requested',
    'auth.magic_link_requested',
    'auth.mfa_verified',
    'auth.mfa_failed',
    'auth.throttled'
  ) then
    return;
  end if;

  insert into public.audit_log (actor_id, action, entity, entity_id, patient_id, metadata)
  values (
    v_actor,
    p_action,
    'session',
    null,
    null,
    jsonb_strip_nulls(
      jsonb_build_object(
        -- L'email si normalizza qui e non nel client: due maiuscole di
        -- differenza renderebbero irriconoscibili due righe sullo
        -- stesso account.
        'email',   lower(nullif(trim(p_email), '')),
        'ip',      nullif(trim(p_ip), ''),
        'agente',  left(nullif(trim(p_user_agent), ''), 200),
        -- L'esito è ridondante rispetto all'azione ed è comodo: una
        -- query «tutto ciò che è fallito» non deve conoscere l'elenco
        -- dei verbi.
        'esito',   case when p_action like '%_failed' or p_action = 'auth.throttled'
                        then 'fallito' else 'riuscito' end
      )
    )
  );
exception
  when others then
    -- Muto come `log_clinical_access`, e per la stessa ragione: nessuno
    -- deve restare fuori dall'applicazione perché il registro ha avuto
    -- un problema. Un accesso non tracciato è un guasto; un accesso
    -- impedito da un guasto del tracciamento è un guasto peggiore.
    return;
end;
$fn$;

comment on function public.record_auth_event is
  'Registra entrata, uscita e tentativi falliti. Indirizzo e browser stanno in metadata, che è dentro l''impronta della catena: una colonna nuova non lo sarebbe stata.';

-- Raggiungibile anche senza sessione: un tentativo fallito avviene
-- prima che ci sia un utente.
grant execute on function public.record_auth_event(text, text, text, text) to anon, authenticated;

/*
 * L'indice per la domanda che si fa davvero.
 *
 * «Quanti tentativi falliti su questo account nell'ultima ora» è la
 * query di un'indagine, e senza indice diventa una scansione di tutto
 * il registro — che è la tabella destinata a essere la più grande del
 * sistema.
 *
 * Parziale, perché gli eventi di sessione sono una minoranza delle
 * righe e sono gli unici che si cercano per azione.
 */
create index if not exists audit_log_sessioni_idx
  on public.audit_log (action, created_at desc)
  where entity = 'session';

/**
 * I tentativi falliti su un account, di recente.
 *
 * Non è una curiosità: è ciò che si guarda prima di decidere se un
 * accesso riuscito era legittimo. Sta nel database e non in una query
 * dell'applicazione perché le policy di `audit_log` valgono anche qui —
 * `stable`, diritti dell'invocante — e chi non può leggere il registro
 * non ottiene un conteggio.
 */
create or replace function public.recent_failed_logins(
  p_email text,
  p_ore   int default 24
)
returns int
language sql
stable
set search_path = public
as $fn$
  select count(*)::int
  from public.audit_log
  where entity = 'session'
    and action = 'auth.login_failed'
    and created_at > now() - make_interval(hours => greatest(1, least(coalesce(p_ore, 24), 720)))
    and metadata ->> 'email' = lower(trim(p_email));
$fn$;

comment on function public.recent_failed_logins is
  'Quanti tentativi falliti su un account. Diritti dell''invocante: chi non legge il registro non ottiene il numero.';

grant execute on function public.recent_failed_logins(text, int) to authenticated;
