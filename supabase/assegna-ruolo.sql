-- ═══════════════════════════════════════════════════════════════════
-- Dà a un utente l'accesso all'area clinica o al Control Center.
--
-- I quattro livelli di Unique OS non sono quattro applicazioni: sono la
-- stessa applicazione che mostra cose diverse a seconda del ruolo scritto
-- qui. Un account nasce sempre come `patient`.
--
--   patient       /dashboard         la persona e il suo percorso
--   professional  /pro               agenda clinica, cartelle, revisioni
--   reception     /control/agenda    agenda, recapiti, incassi, CRM, task
--   marketing     /control/marketing campagne, contenuti, lead, knowledge base
--   admin         /control           centro di controllo, Brain, approvazioni
--   owner         /control           come admin, per la proprietà
--
-- Reception e marketing non vedono dati sanitari: le policy elencano una
-- per una le tabelle che possono leggere, così una tabella nuova nasce
-- invisibile a entrambi. Non è una scelta dell'interfaccia — è il
-- database a rifiutare le righe.
--
-- COME SI USA
--   1. Authentication → Users → Add user: crea l'utente con la sua email.
--   2. Copia questo file in supabase/locale/ e compila LÌ le variabili.
--      Il repository è pubblico e un commit è per sempre: un'email vera
--      scritta qui finirebbe online e resterebbe nella cronologia di Git
--      anche dopo averla tolta. La cartella supabase/locale/ è ignorata
--      apposta — vedi il suo LEGGIMI.
--   3. Esegui la tua copia nella SQL Editor.
--   4. Accedi con quella email: si atterra nell'area del proprio ruolo.
--
-- Si può rieseguire quante volte si vuole.
--
-- ATTENZIONE: non promuovere l'account con cui guardi la dashboard del
-- paziente. Perderesti quella vista, perché ogni account vive in un solo
-- livello. Per vedere entrambe le facce servono due indirizzi email.
-- ═══════════════════════════════════════════════════════════════════

do $$
declare
  -- ── Da compilare ──────────────────────────────────────────────
  v_email      text := 'INSERISCI-EMAIL@esempio.it';
  -- 'professional', 'reception', 'marketing', 'admin' oppure 'owner'
  v_ruolo      app_role := 'professional';

  -- Solo per 'professional'. Discipline ammesse: physician, nutritionist,
  -- osteopath, psychologist, trainer, nurse, other.
  v_titolo     text := 'Dott.';
  v_specialita text := 'Medicina della longevità';
  v_disciplina professional_discipline := 'physician';
  -- Mettere il professionista nel team di tutti i pazienti già esistenti.
  -- Serve con i dati di prova: senza, entra ma non vede nessuno.
  v_tutti      boolean := true;
  -- ──────────────────────────────────────────────────────────────

  v_profile uuid;
  v_pro     uuid;
  v_quanti  integer;
begin
  select id into v_profile
    from public.profiles
   where lower(email) = lower(v_email);

  if v_profile is null then
    raise exception
      'Nessun profilo con l''email %. Crea prima l''utente in Authentication → Users.', v_email;
  end if;

  update public.profiles
     set role = v_ruolo,
         full_name = coalesce(nullif(full_name, ''),
                              case v_ruolo
                                when 'professional' then 'Professionista'
                                when 'reception'    then 'Accoglienza'
                                when 'marketing'    then 'Marketing'
                                else 'Direzione' end)
   where id = v_profile;

  if v_ruolo = 'professional' then
    -- Il ruolo apre la porta; la scheda professionale è ciò che rende la
    -- persona utilizzabile dal resto del sistema — agenda, permessi per
    -- disciplina, compensi.
    insert into public.professionals (profile_id, title, specialty, discipline)
    values (v_profile, v_titolo, v_specialita, v_disciplina)
    on conflict (profile_id) do update
      set title = excluded.title,
          specialty = excluded.specialty,
          discipline = excluded.discipline,
          is_active = true
    returning id into v_pro;

    if v_tutti then
      -- La Row Level Security non guarda il ruolo, guarda il team: un
      -- professionista vede solo i pazienti che gli sono assegnati.
      insert into public.care_team_members (patient_id, professional_id, role_in_team)
      select p.id, v_pro, 'Referente clinico'
        from public.patients p
      on conflict (patient_id, professional_id) do nothing;

      get diagnostics v_quanti = row_count;
      raise notice 'Professionista creato. Pazienti aggiunti al suo team: %.', v_quanti;
    else
      raise notice 'Professionista creato. Nessun paziente assegnato: assegnali dal team.';
    end if;
  elsif v_ruolo::text in ('reception', 'marketing') then
    -- Nessuna scheda da creare: il ruolo è tutto ciò che serve, e le
    -- policy fanno il resto.
    raise notice 'Ruolo % assegnato a %. Entra nel Control Center, senza dati sanitari.',
      v_ruolo, v_email;
  else
    -- Amministrazione e direzione passano da is_staff(): vedono tutto
    -- senza bisogno di assegnazioni.
    raise notice 'Ruolo % assegnato a %. Accesso al Control Center.', v_ruolo, v_email;
  end if;
end $$;
