-- ═══════════════════════════════════════════════════════════════════
-- I consensi, registrabili da chi visita
--
-- `patient_consents` esisteva già, append-only e con la versione
-- dell'informativa su ogni riga: revocare scrive una riga, non ne
-- cancella una. Mancava una cosa sola, e pesava: **il personale clinico
-- non poteva registrarne uno.** La policy ammetteva il paziente stesso
-- e la direzione, e nessuno dei due è chi raccoglie una firma durante
-- la prima visita.
--
-- Il risultato pratico era che un consenso firmato su carta restava
-- fuori dal sistema, e il sistema diceva «non concesso» su una persona
-- che aveva firmato. Un registro dei consensi che non corrisponde ai
-- fogli in archivio è peggio di nessun registro, perché viene creduto.
--
-- ---
--
-- **La reception resta fuori, ed è una decisione.**
--
-- Sarebbe stato comodo darle l'accesso: è chi sta al banco quando la
-- persona arriva. Ma `patient_consents` dice anche a cosa una persona
-- ha aderito — la ricerca, per esempio — e il progetto ha una promessa
-- scritta nel documento di sicurezza e verificata a ogni esecuzione di
-- `npm run db:verifica -- seed`: *la reception non vede dati sanitari,
-- e i consensi sono in quell'elenco.*
--
-- Rompere quella promessa per una comodità sarebbe stato il modo in cui
-- una garanzia smette di valere: non con una decisione, con
-- un'eccezione. Chi raccoglie la firma la registra dalla cartella, ed è
-- anche il momento in cui è naturale farlo.
-- ═══════════════════════════════════════════════════════════════════

/*
 * L'inserimento, esteso al care team.
 *
 * `can_write_clinical` e non `can_access_patient`: il paziente stesso è
 * già coperto dal primo ramo, e un professionista che può *leggere* una
 * cartella senza poterci scrivere non deve poter registrare un consenso
 * a nome di qualcun altro.
 *
 * `decided_by = auth.uid()` vale per tutti, paziente compreso: chi
 * registra un consenso lascia il proprio nome sulla riga. Senza, un
 * modulo cartaceo entrerebbe nel sistema senza che si sappia chi l'ha
 * trascritto — che è la sola domanda che si fa quando un consenso viene
 * contestato.
 */
drop policy if exists consents_insert on public.patient_consents;

create policy consents_insert on public.patient_consents
  for insert with check (
    decided_by = auth.uid()
    and (
      patient_id = public.my_patient_id()
      or public.can_write_clinical(patient_id)
    )
  );

/**
 * Registrare un consenso.
 *
 * Una funzione e non un insert perché due cose devono avvenire insieme:
 * la riga del consenso e la riga nel registro. Un consenso concesso o
 * revocato riguarda i diritti di una persona, ed è esattamente ciò che
 * un garante chiede di poter ricostruire — con accanto **chi** l'ha
 * registrato, non solo che è successo.
 *
 * `security definer` con il controllo ripetuto dentro: la policy di
 * insert basterebbe a proteggere la riga del consenso, ma la funzione
 * deve scrivere anche in `audit_log`, che nessun client può toccare.
 *
 * L'origine non si accetta sulla parola. Se a registrare è il paziente
 * la riga dice `patient_app`, qualunque cosa arrivi dal modulo: una
 * persona che dichiara di aver firmato su carta starebbe dichiarando
 * qualcosa su un foglio che non esiste.
 */
create or replace function public.record_consent(
  p_patient uuid,
  p_kind    consent_kind,
  p_granted boolean,
  p_version text default 'v1',
  p_source  text default 'clinical'
)
returns uuid
language plpgsql
security definer
set search_path = public
as $fn$
declare
  v_id uuid;
  v_proprio boolean;
begin
  /*
   * `coalesce` non è una cintura di sicurezza: è il controllo.
   *
   * `my_patient_id()` torna null per chi non è un paziente — cioè per
   * tutto il personale — e `p_patient = null` non è falso, è **null**.
   * In PL/pgSQL `if not null then` non entra: la guardia qui sotto
   * veniva saltata, e siccome la funzione è `security definer` la Row
   * Level Security non c'era a raccogliere l'errore. Chiunque poteva
   * registrare un consenso di chiunque.
   *
   * Il costo del bug era di un `coalesce`; a trovarlo è stato un test
   * che chiedeva a un professionista estraneo di provarci.
   */
  v_proprio := coalesce(p_patient = public.my_patient_id(), false);

  if not (v_proprio or coalesce(public.can_write_clinical(p_patient), false)) then
    raise exception 'Non hai titolo per registrare un consenso di questa persona.';
  end if;

  insert into public.patient_consents
    (patient_id, kind, granted, policy_version, decided_by, source)
  values
    (p_patient, p_kind, p_granted,
     coalesce(nullif(trim(p_version), ''), 'v1'),
     auth.uid(),
     case when v_proprio then 'patient_app' else coalesce(nullif(trim(p_source), ''), 'clinical') end)
  returning id into v_id;

  insert into public.audit_log (actor_id, action, entity, entity_id, patient_id, metadata)
  values (
    auth.uid(),
    case when p_granted then 'consent.granted' else 'consent.revoked' end,
    'patient_consent', v_id, p_patient,
    jsonb_build_object('tipo', p_kind::text, 'versione', p_version)
  );

  perform public.emit_event(
    case when p_granted then 'consent.granted' else 'consent.revoked' end,
    'patient_consent', v_id, p_patient, null,
    jsonb_build_object('tipo', p_kind::text)
  );

  return v_id;
end;
$fn$;

comment on function public.record_consent is
  'Registra un consenso e la sua traccia insieme. Chi lo registra lascia il proprio nome sulla riga: è la sola domanda che si fa quando un consenso viene contestato.';
