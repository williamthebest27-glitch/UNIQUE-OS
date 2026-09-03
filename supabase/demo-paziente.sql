-- ═══════════════════════════════════════════════════════════════════
-- Attiva un paziente e lo popola con dati di prova.
--
-- Serve a verificare che tutto funzioni end-to-end con il proprio login,
-- prima di inserire dati di pazienti veri.
--
-- COME SI USA
--   1. Authentication → Users → Add user: crea un utente con la tua email.
--   2. Sostituisci le email qui sotto.
--   3. Esegui questo script nella SQL Console del progetto.
--   4. Accedi dall’applicazione con quella email.
--
-- Rieseguirlo azzera e ricrea i dati di prova di quel paziente.
-- NON eseguirlo su dati di pazienti reali.
-- ═══════════════════════════════════════════════════════════════════

do $$
declare
  -- ── Da compilare ──────────────────────────────────────────────
  v_email      text := 'INSERISCI-LA-TUA-EMAIL@esempio.it';
  -- Facoltativa: email di un secondo utente che farà da medico.
  -- Lasciare stringa vuota per saltare.
  v_pro_email  text := '';
  -- ──────────────────────────────────────────────────────────────

  v_profile    uuid;
  v_patient    uuid;
  v_pro_profile uuid;
  v_pro        uuid;
  v_score      uuid;
  v_program    uuid;
  v_tier       uuid;
  v_membership uuid;
  v_appt       uuid;
  v_today      date := current_date;
begin
  select id into v_profile from public.profiles where lower(email) = lower(v_email);

  if v_profile is null then
    raise exception
      'Nessun profilo con email %. Crea prima l’utente in Authentication → Users.', v_email;
  end if;

  update public.profiles
     set role       = 'patient',
         full_name  = coalesce(nullif(full_name, ''), 'Paziente Dimostrativo'),
         first_name = coalesce(first_name, split_part(coalesce(nullif(full_name, ''), 'Paziente'), ' ', 1))
   where id = v_profile;

  -- ── Scheda paziente ───────────────────────────────────────────
  insert into public.patients (profile_id, patient_code, date_of_birth, sex_at_birth, height_cm, onboarded_at)
  values (v_profile, 'UQ-0001', date '1980-04-17', 'M', 178, now())
  on conflict (profile_id) do update set onboarded_at = excluded.onboarded_at
  returning id into v_patient;

  -- Ripartiamo puliti: lo script è pensato per essere rieseguibile.
  delete from public.longevity_scores    where patient_id = v_patient;
  delete from public.biomarkers          where patient_id = v_patient;
  delete from public.recommended_actions where patient_id = v_patient;
  delete from public.appointments        where patient_id = v_patient;
  delete from public.documents           where patient_id = v_patient;
  delete from public.credit_entries      where patient_id = v_patient;
  delete from public.program_enrollments where patient_id = v_patient;
  delete from public.memberships         where patient_id = v_patient;
  delete from public.notifications       where profile_id = v_profile;

  -- ── Medico di riferimento (facoltativo) ───────────────────────
  if v_pro_email <> '' then
    select id into v_pro_profile from public.profiles where lower(email) = lower(v_pro_email);

    if v_pro_profile is not null then
      update public.profiles
         set role = 'professional',
             full_name = coalesce(nullif(full_name, ''), 'Medico Dimostrativo')
       where id = v_pro_profile;

      insert into public.professionals (profile_id, title, specialty)
      values (v_pro_profile, 'Dott.ssa', 'Medicina della longevità')
      on conflict (profile_id) do update set specialty = excluded.specialty
      returning id into v_pro;

      insert into public.care_team_members (patient_id, professional_id, role_in_team)
      values (v_patient, v_pro, 'Referente clinico')
      on conflict (patient_id, professional_id) do nothing;

      update public.patients set primary_professional_id = v_pro where id = v_patient;
    end if;
  end if;

  -- ── Storico dello Score ───────────────────────────────────────
  insert into public.longevity_scores (patient_id, measured_on, score, previous_score, trend, computed_by)
  values
    (v_patient, v_today - 448, 64, null, null,     'uls-v1'),
    (v_patient, v_today - 350, 68, 64,   'up',     'uls-v1'),
    (v_patient, v_today - 273, 71, 68,   'up',     'uls-v1'),
    (v_patient, v_today - 195, 70, 71,   'down',   'uls-v1'),
    (v_patient, v_today - 111, 74, 70,   'up',     'uls-v1');

  insert into public.longevity_scores
    (patient_id, measured_on, score, previous_score, trend, biological_age, computed_by, summary)
  values
    (v_patient, v_today - 6, 78, 74, 'up', 39.4, 'uls-v1',
     'Metabolismo e infiammazione sono in fascia ottimale. Il margine di crescita più ampio resta sull’assetto ormonale.')
  returning id into v_score;

  insert into public.score_pillars (score_id, key, label, value, weight, delta)
  values
    (v_score, 'metabolic',        'Metabolismo',           82, 0.20,  5),
    (v_score, 'cardiovascular',   'Cardiovascolare',       76, 0.20,  3),
    (v_score, 'body_composition', 'Composizione corporea', 71, 0.15,  6),
    (v_score, 'inflammation',     'Infiammazione',         84, 0.15,  2),
    (v_score, 'hormonal',         'Assetto ormonale',      69, 0.15, -1),
    (v_score, 'cognitive_sleep',  'Cognitivo e sonno',     74, 0.15,  7);

  -- ── Biomarcatori: alimentano i "progressi ottenuti" ───────────
  insert into public.biomarkers (patient_id, code, label, value, unit, ref_low, ref_high, measured_on)
  values
    (v_patient, 'hba1c',        'Emoglobina glicata',        5.6, '%',    4.0, 5.6, v_today - 448),
    (v_patient, 'hba1c',        'Emoglobina glicata',        5.2, '%',    4.0, 5.6, v_today - 6),
    (v_patient, 'vo2max',       'VO2 max stimato',          40.5, 'ml/kg/min', 35, 60, v_today - 448),
    (v_patient, 'vo2max',       'VO2 max stimato',          44.1, 'ml/kg/min', 35, 60, v_today - 6),
    (v_patient, 'body_fat_pct', 'Massa grassa',             21.3, '%',    10, 20, v_today - 448),
    (v_patient, 'body_fat_pct', 'Massa grassa',             18.4, '%',    10, 20, v_today - 6),
    (v_patient, 'hs_crp',       'PCR ad alta sensibilità',  1.90, 'mg/L', 0, 1.0, v_today - 448),
    (v_patient, 'hs_crp',       'PCR ad alta sensibilità',  0.80, 'mg/L', 0, 1.0, v_today - 6);

  -- ── Percorso attivo ───────────────────────────────────────────
  select id into v_program from public.programs where slug = 'metabolic-reset-90';

  if v_program is not null then
    insert into public.program_enrollments
      (patient_id, program_id, status, started_on, ends_on, progress_pct, steps_done, steps_total)
    values (v_patient, v_program, 'active', v_today - 59, v_today + 31, 64, 9, 14);
  end if;

  -- ── Membership e crediti ──────────────────────────────────────
  select id into v_tier from public.membership_tiers where slug = 'signature';

  if v_tier is not null then
    insert into public.memberships (patient_id, tier_id, starts_on, ends_on, is_active)
    values (v_patient, v_tier, v_today - 155, v_today + 210, true)
    returning id into v_membership;

    insert into public.credit_entries (patient_id, entry_type, amount, description, membership_id)
    values (v_patient, 'purchase', 24, 'Crediti inclusi nella membership Signature', v_membership);
  end if;

  -- ── Prossima visita ───────────────────────────────────────────
  insert into public.appointments
    (patient_id, professional_id, service_name, status, starts_at, ends_at, location, credits_cost)
  values (
    v_patient, v_pro, 'Consulenza longevity di controllo', 'confirmed',
    ((v_today + 14)::timestamp + time '09:30') at time zone 'Europe/Rome',
    ((v_today + 14)::timestamp + time '10:30') at time zone 'Europe/Rome',
    'Unique Clinic — Studio 2', 1
  )
  returning id into v_appt;

  insert into public.credit_entries (patient_id, entry_type, amount, description, appointment_id)
  values
    (v_patient, 'consumption', -7, 'Visite e trattamenti del percorso in corso', null),
    (v_patient, 'consumption', -5, 'Pannello ematochimico completo',            null);

  -- ── Documenti ─────────────────────────────────────────────────
  -- storage_path punta al bucket privato patient-documents. Il file va
  -- caricato a parte: qui registriamo solo i metadati.
  insert into public.documents
    (patient_id, kind, title, storage_path, mime_type, size_bytes, issued_on, is_new_for_patient)
  values
    (v_patient, 'lab_report', 'Pannello metabolico completo',
     v_patient::text || '/pannello-metabolico.pdf', 'application/pdf', 412000, v_today - 6,  true),
    (v_patient, 'care_plan',  'Aggiornamento piano nutrizionale',
     v_patient::text || '/piano-nutrizionale.pdf',  'application/pdf', 188000, v_today - 4,  true),
    (v_patient, 'imaging',    'Ecocardiogramma con color doppler',
     v_patient::text || '/ecocardiogramma.pdf',     'application/pdf', 2140000, v_today - 22, false);

  -- ── Azioni consigliate ────────────────────────────────────────
  insert into public.recommended_actions
    (patient_id, title, description, pillar_key, source, status, due_on, priority)
  values
    (v_patient, 'Ripetere il pannello ormonale',
     'L’unico pilastro in leggero calo. Prelievo a digiuno, idealmente entro due settimane.',
     'hormonal', 'professional', 'suggested', v_today + 12, 1),
    (v_patient, 'Portare il cardio a 150 minuti a settimana',
     'Sei a 110 minuti di media. Bastano due sessioni in più in zona 2 per chiudere il divario.',
     'cardiovascular', 'protocol', 'in_progress', null, 2),
    (v_patient, 'Anticipare la cena di 60 minuti',
     'La finestra di digiuno notturno è il fattore che sposta di più il tuo punteggio metabolico.',
     'metabolic', 'brain', 'suggested', null, 2),
    (v_patient, 'Caricare il referto della densitometria',
     'Manca per completare la valutazione della composizione corporea.',
     'body_composition', 'professional', 'suggested', v_today + 17, 3);

  -- ── Notifiche ─────────────────────────────────────────────────
  insert into public.notifications (profile_id, title, body, link_url, created_at)
  values
    (v_profile, 'Il tuo nuovo Longevity Score è disponibile',
     '78/100, quattro punti in più rispetto al controllo precedente.',
     '/percorso', now() - interval '5 days'),
    (v_profile, 'Nuovo piano nutrizionale',
     'Il piano è stato aggiornato in vista del prossimo controllo.',
     '/documenti', now() - interval '4 days');

  raise notice 'Paziente % attivato (patient_id=%).', v_email, v_patient;
end $$;
