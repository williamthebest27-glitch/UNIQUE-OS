-- ═══════════════════════════════════════════════════════════════════
-- Dà a un utente l'accesso all'area clinica o al Control Center.
--
-- I quattro livelli di Unique OS non sono quattro applicazioni: sono la
-- stessa applicazione che mostra cose diverse a seconda del ruolo scritto
-- qui. Un account nasce sempre come `patient`.
--
--   patient       /dashboard   la persona e il suo percorso
--   professional  /pro         agenda clinica, cartelle, revisioni
--   admin         /control     centro di controllo
--   owner         /control     come admin, per la proprietà
--
-- COME SI USA
--   1. Authentication → Users → Add user: crea l'utente con la sua email.
--   2. Compila le due variabili qui sotto.
--   3. Esegui nella SQL Editor.
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
  -- 'professional', 'admin' oppure 'owner'
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
                              case when v_ruolo = 'professional' then 'Professionista'
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
  else
    -- Amministrazione e direzione passano da is_staff(): vedono tutto
    -- senza bisogno di assegnazioni.
    raise notice 'Ruolo % assegnato a %. Accesso al Control Center.', v_ruolo, v_email;
  end if;
end $$;
