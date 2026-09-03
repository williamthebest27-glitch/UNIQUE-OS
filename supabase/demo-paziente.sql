-- ═══════════════════════════════════════════════════════════════════
-- Attiva un paziente e lo popola con dati di prova.
--
-- Serve a verificare che tutto funzioni end-to-end con il proprio login,
-- prima di inserire dati di pazienti veri.
--
-- COME SI USA
--   1. Authentication → Users → Add user: crea un utente con la tua email.
--   2. Copia questo file in supabase/locale/ e sostituisci le email LÌ.
--      Il repository è pubblico e un commit è per sempre: quella cartella
--      è ignorata apposta — vedi il suo LEGGIMI.
--   3. Esegui la tua copia nella SQL Console del progetto.
--   4. Accedi dall'applicazione con quella email.
--
-- I punteggi seminati qui sono quelli che il motore calcola davvero da
-- queste misure (algoritmo uls-v2): da /pro/revisioni il pulsante
-- "Ricalcola punteggio" li riproduce identici. Se un giorno divergono,
-- è cambiata la formula.
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

  v_profile     uuid;
  v_patient     uuid;
  v_pro_profile uuid;
  v_pro         uuid;
  v_score_base  uuid;
  v_score_now   uuid;
  v_program     uuid;
  v_tier        uuid;
  v_membership  uuid;
  v_today       date := current_date;
  -- Due rilevazioni: l'ingresso nel percorso e il controllo più recente.
  v_base_on     date := current_date - 448;
  v_now_on      date := current_date - 6;
begin
  select id into v_profile from public.profiles where lower(email) = lower(v_email);

  if v_profile is null then
    raise exception
      'Nessun profilo con email %. Crea prima l''utente in Authentication → Users.', v_email;
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
  delete from public.measurement_proposals where patient_id = v_patient;
  delete from public.document_analyses    where patient_id = v_patient;
  delete from public.measurements         where patient_id = v_patient;
  delete from public.longevity_scores     where patient_id = v_patient;
  delete from public.recommended_actions  where patient_id = v_patient;
  delete from public.appointments         where patient_id = v_patient;
  delete from public.documents            where patient_id = v_patient;
  delete from public.credit_entries       where patient_id = v_patient;
  delete from public.program_enrollments  where patient_id = v_patient;
  delete from public.memberships          where patient_id = v_patient;
  delete from public.service_purchases    where patient_id = v_patient;
  delete from public.payments             where patient_id = v_patient;
  delete from public.payment_methods      where patient_id = v_patient;
  delete from public.notifications        where profile_id = v_profile;

  -- ── Medico di riferimento (facoltativo) ───────────────────────
  if v_pro_email <> '' then
    select id into v_pro_profile from public.profiles where lower(email) = lower(v_pro_email);

    if v_pro_profile is not null then
      update public.profiles
         set role = 'professional',
             full_name = coalesce(nullif(full_name, ''), 'Medico Dimostrativo')
       where id = v_pro_profile;

      insert into public.professionals (profile_id, title, specialty, discipline)
      values (v_pro_profile, 'Dott.ssa', 'Medicina della longevità', 'physician')
      on conflict (profile_id) do update
        set specialty = excluded.specialty, discipline = excluded.discipline
      returning id into v_pro;

      insert into public.care_team_members (patient_id, professional_id, role_in_team)
      values (v_patient, v_pro, 'Referente clinico')
      on conflict (patient_id, professional_id) do nothing;

      update public.patients set primary_professional_id = v_pro where id = v_patient;
    end if;
  end if;

  -- ── Misure ────────────────────────────────────────────────────
  -- La materia prima dello Score. Due colonne di valori: prima e dopo il
  -- percorso. I codici sono quelli del catalogo in src/lib/score/metrics.ts.
  insert into public.measurements
    (patient_id, metric_code, label, value, category, unit, measured_on, source)
  values
    -- Metabolic Health
    (v_patient, 'glucose_fasting', 'Glicemia a digiuno', 101,  null, 'mg/dL', v_base_on, 'lab'),
    (v_patient, 'glucose_fasting', 'Glicemia a digiuno',  92,  null, 'mg/dL', v_now_on,  'lab'),
    (v_patient, 'hba1c',           'Emoglobina glicata',  5.6, null, '%',     v_base_on, 'lab'),
    (v_patient, 'hba1c',           'Emoglobina glicata',  5.2, null, '%',     v_now_on,  'lab'),
    (v_patient, 'insulin_fasting', 'Insulina a digiuno',   11, null, 'µU/mL', v_base_on, 'lab'),
    (v_patient, 'insulin_fasting', 'Insulina a digiuno',  6.5, null, 'µU/mL', v_now_on,  'lab'),
    (v_patient, 'triglycerides',   'Trigliceridi',        160, null, 'mg/dL', v_base_on, 'lab'),
    (v_patient, 'triglycerides',   'Trigliceridi',        110, null, 'mg/dL', v_now_on,  'lab'),
    (v_patient, 'hdl',             'Colesterolo HDL',      48, null, 'mg/dL', v_base_on, 'lab'),
    (v_patient, 'hdl',             'Colesterolo HDL',      56, null, 'mg/dL', v_now_on,  'lab'),
    (v_patient, 'alt',             'ALT (GPT)',            34, null, 'U/L',   v_base_on, 'lab'),
    (v_patient, 'alt',             'ALT (GPT)',            24, null, 'U/L',   v_now_on,  'lab'),

    -- Cardiovascular
    (v_patient, 'sbp',        'Pressione sistolica',           127, null, 'mmHg',      v_base_on, 'vitals'),
    (v_patient, 'sbp',        'Pressione sistolica',           118, null, 'mmHg',      v_now_on,  'vitals'),
    (v_patient, 'dbp',        'Pressione diastolica',           84, null, 'mmHg',      v_base_on, 'vitals'),
    (v_patient, 'dbp',        'Pressione diastolica',           78, null, 'mmHg',      v_now_on,  'vitals'),
    (v_patient, 'resting_hr', 'Frequenza cardiaca a riposo',    68, null, 'bpm',       v_base_on, 'vitals'),
    (v_patient, 'resting_hr', 'Frequenza cardiaca a riposo',    58, null, 'bpm',       v_now_on,  'vitals'),
    (v_patient, 'vo2max',     'VO₂ max',                      40.5, null, 'ml/kg/min', v_base_on, 'stress_test'),
    (v_patient, 'vo2max',     'VO₂ max',                      44.1, null, 'ml/kg/min', v_now_on,  'stress_test'),
    (v_patient, 'apob',       'ApoB',                          105, null, 'mg/dL',     v_base_on, 'lab'),
    (v_patient, 'apob',       'ApoB',                           92, null, 'mg/dL',     v_now_on,  'lab'),
    (v_patient, 'ldl',        'Colesterolo LDL',               142, null, 'mg/dL',     v_base_on, 'lab'),
    (v_patient, 'ldl',        'Colesterolo LDL',               118, null, 'mg/dL',     v_now_on,  'lab'),
    (v_patient, 'ecg_status', 'ECG',                          null, 'normal', null,    v_base_on, 'ecg'),
    (v_patient, 'ecg_status', 'ECG',                          null, 'normal', null,    v_now_on,  'ecg'),

    -- Body Composition
    (v_patient, 'body_fat_pct',    'Massa grassa',              21.3, null, '%',       v_base_on, 'body_scan'),
    (v_patient, 'body_fat_pct',    'Massa grassa',              18.4, null, '%',       v_now_on,  'body_scan'),
    (v_patient, 'smi',             'Indice di massa muscolare',  7.8, null, 'kg/m²',   v_base_on, 'body_scan'),
    (v_patient, 'smi',             'Indice di massa muscolare',  8.2, null, 'kg/m²',   v_now_on,  'body_scan'),
    (v_patient, 'visceral_fat',    'Grasso viscerale',             9, null, 'livello', v_base_on, 'body_scan'),
    (v_patient, 'visceral_fat',    'Grasso viscerale',             6, null, 'livello', v_now_on,  'body_scan'),
    (v_patient, 'waist_hip_ratio', 'Rapporto vita-fianchi',     0.94, null, null,      v_base_on, 'body_scan'),
    (v_patient, 'waist_hip_ratio', 'Rapporto vita-fianchi',     0.89, null, null,      v_now_on,  'body_scan'),

    -- Movement
    (v_patient, 'activity_minutes_week',  'Attività fisica settimanale',   90, null, 'min/sett.',    v_base_on, 'activity'),
    (v_patient, 'activity_minutes_week',  'Attività fisica settimanale',  165, null, 'min/sett.',    v_now_on,  'activity'),
    (v_patient, 'steps_daily_avg',        'Passi giornalieri',           6200, null, 'passi',        v_base_on, 'wearable'),
    (v_patient, 'steps_daily_avg',        'Passi giornalieri',           8800, null, 'passi',        v_now_on,  'wearable'),
    (v_patient, 'strength_sessions_week', 'Sedute di forza',                1, null, 'sedute/sett.', v_base_on, 'activity'),
    (v_patient, 'strength_sessions_week', 'Sedute di forza',                2, null, 'sedute/sett.', v_now_on,  'activity'),

    -- Nutrition
    (v_patient, 'diet_quality_score',        'Qualità della dieta',    58, null, 'punti',       v_base_on, 'questionnaire'),
    (v_patient, 'diet_quality_score',        'Qualità della dieta',    74, null, 'punti',       v_now_on,  'questionnaire'),
    (v_patient, 'protein_g_per_kg',          'Proteine per kg',       0.9, null, 'g/kg',        v_base_on, 'questionnaire'),
    (v_patient, 'protein_g_per_kg',          'Proteine per kg',       1.3, null, 'g/kg',        v_now_on,  'questionnaire'),
    (v_patient, 'veg_servings_day',          'Porzioni di verdura',     2, null, 'porzioni/g',  v_base_on, 'questionnaire'),
    (v_patient, 'veg_servings_day',          'Porzioni di verdura',     4, null, 'porzioni/g',  v_now_on,  'questionnaire'),
    (v_patient, 'ultraprocessed_meals_week', 'Pasti ultraprocessati',   9, null, 'pasti/sett.', v_base_on, 'questionnaire'),
    (v_patient, 'ultraprocessed_meals_week', 'Pasti ultraprocessati',   4, null, 'pasti/sett.', v_now_on,  'questionnaire'),
    (v_patient, 'vitamin_d',                 'Vitamina D (25-OH)',     24, null, 'ng/mL',       v_base_on, 'lab'),
    (v_patient, 'vitamin_d',                 'Vitamina D (25-OH)',     38, null, 'ng/mL',       v_now_on,  'lab'),

    -- Mental Wellbeing
    (v_patient, 'who5_wellbeing',   'Benessere percepito (WHO-5)', 60, null, 'punti', v_base_on, 'questionnaire'),
    (v_patient, 'who5_wellbeing',   'Benessere percepito (WHO-5)', 76, null, 'punti', v_now_on,  'questionnaire'),
    (v_patient, 'perceived_stress', 'Stress percepito (PSS-10)',   19, null, 'punti', v_base_on, 'questionnaire'),
    (v_patient, 'perceived_stress', 'Stress percepito (PSS-10)',   13, null, 'punti', v_now_on,  'questionnaire'),

    -- Lifestyle
    (v_patient, 'sleep_hours_avg',    'Ore di sonno',         6.3, null,     'ore',         v_base_on, 'wearable'),
    (v_patient, 'sleep_hours_avg',    'Ore di sonno',         7.1, null,     'ore',         v_now_on,  'wearable'),
    (v_patient, 'sleep_efficiency',   'Efficienza del sonno',  82, null,     '%',           v_base_on, 'wearable'),
    (v_patient, 'sleep_efficiency',   'Efficienza del sonno',  89, null,     '%',           v_now_on,  'wearable'),
    (v_patient, 'smoking_status',     'Fumo',                null, 'former', null,          v_base_on, 'anamnesis'),
    (v_patient, 'smoking_status',     'Fumo',                null, 'former', null,          v_now_on,  'anamnesis'),
    (v_patient, 'alcohol_units_week', 'Alcol settimanale',      9, null,     'unità/sett.', v_base_on, 'anamnesis'),
    (v_patient, 'alcohol_units_week', 'Alcol settimanale',      5, null,     'unità/sett.', v_now_on,  'anamnesis');

  -- Restano fuori, di proposito: spirometria, forza di presa, valutazione
  -- cognitiva e ore sedentarie. Servono a mostrare la copertura parziale —
  -- il sistema dice quali dati mancano invece di far finta di averli.

  -- ── Punteggi ──────────────────────────────────────────────────
  insert into public.longevity_scores
    (patient_id, measured_on, score, previous_score, trend, coverage, computed_by)
  values (v_patient, v_base_on, 63.7, null, null, 0.90, 'uls-v2')
  returning id into v_score_base;

  insert into public.score_pillars (score_id, key, label, value, coverage) values
    (v_score_base, 'metabolic_health', 'Metabolic Health', 66.4, 1.00),
    (v_score_base, 'cardiovascular',   'Cardiovascular',   71.5, 0.92),
    (v_score_base, 'body_composition', 'Body Composition', 73.5, 1.00),
    (v_score_base, 'movement',         'Movement',         51.8, 0.80),
    (v_score_base, 'nutrition',        'Nutrition',        53.6, 1.00),
    (v_score_base, 'mental_wellbeing', 'Mental Wellbeing', 59.3, 0.65),
    (v_score_base, 'lifestyle',        'Lifestyle',        70.0, 0.90);

  -- Rilevazioni intermedie: ricostruiscono l'andamento senza il dettaglio
  -- dei pilastri, come accade importando uno storico preesistente.
  insert into public.longevity_scores
    (patient_id, measured_on, score, previous_score, trend, computed_by)
  values
    (v_patient, current_date - 350, 68, 63.7, 'up',   'uls-v2'),
    (v_patient, current_date - 273, 71, 68,   'up',   'uls-v2'),
    (v_patient, current_date - 195, 70, 71,   'down', 'uls-v2'),
    (v_patient, current_date - 111, 74, 70,   'up',   'uls-v2');

  insert into public.longevity_scores
    (patient_id, measured_on, score, previous_score, trend, biological_age, coverage, computed_by, summary)
  values (
    v_patient, v_now_on, 85.0, 74, 'up', 39.4, 0.90, 'uls-v2',
    'Metabolismo e movimento sono i pilastri cresciuti di più. Restano da raccogliere spirometria, forza di presa e valutazione cognitiva.'
  )
  returning id into v_score_now;

  insert into public.score_pillars (score_id, key, label, value, coverage, delta) values
    (v_score_now, 'metabolic_health', 'Metabolic Health', 89.4, 1.00, 23.0),
    (v_score_now, 'cardiovascular',   'Cardiovascular',   84.5, 0.92, 13.0),
    (v_score_now, 'body_composition', 'Body Composition', 85.8, 1.00, 12.3),
    (v_score_now, 'movement',         'Movement',         83.5, 0.80, 31.7),
    (v_score_now, 'nutrition',        'Nutrition',        82.5, 1.00, 28.9),
    (v_score_now, 'mental_wellbeing', 'Mental Wellbeing', 81.7, 0.65, 22.4),
    (v_score_now, 'lifestyle',        'Lifestyle',        86.3, 0.90, 16.3);

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
    insert into public.memberships
      (patient_id, tier_id, starts_on, ends_on, is_active, status, auto_renew,
       renews_on, activated_at, payment_brand, payment_last4)
    values (
      v_patient, v_tier, v_today - 155, v_today + 210, true, 'active', true,
      v_today + 211, now() - interval '155 days', 'Visa', '4242'
    )
    returning id into v_membership;

    insert into public.credit_entries (patient_id, entry_type, amount, description, membership_id)
    values (v_patient, 'purchase', 24, 'Crediti inclusi nella membership Signature', v_membership);
  end if;

  insert into public.credit_entries (patient_id, entry_type, amount, description)
  values
    (v_patient, 'consumption', -7, 'Visite e trattamenti del percorso in corso'),
    (v_patient, 'consumption', -5, 'Pannello ematochimico completo');

  -- ── Servizi extra ─────────────────────────────────────────────
  insert into public.service_purchases
    (patient_id, name, description, price_cents, credits_granted, purchased_on)
  values (
    v_patient, 'IV Therapy — ciclo di 3 sedute',
    'Acquistato fuori membership.', 45000, 3, v_today - 77
  );

  -- ── Prossima visita ───────────────────────────────────────────
  insert into public.appointments
    (patient_id, professional_id, service_name, status, starts_at, ends_at, location, credits_cost)
  values (
    v_patient, v_pro, 'Consulenza longevity di controllo', 'confirmed',
    ((v_today + 14)::timestamp + time '09:30') at time zone 'Europe/Rome',
    ((v_today + 14)::timestamp + time '10:30') at time zone 'Europe/Rome',
    'Unique Clinic — Studio 2', 1
  );

  -- ── Documenti ─────────────────────────────────────────────────
  -- storage_path punta al bucket privato patient-documents. Il file va
  -- caricato a parte: qui registriamo solo i metadati.
  insert into public.documents
    (patient_id, kind, title, storage_path, mime_type, size_bytes, issued_on, is_new_for_patient)
  values
    (v_patient, 'lab_report', 'Pannello metabolico completo',
     v_patient::text || '/pannello-metabolico.pdf', 'application/pdf', 412000, v_now_on, true),
    (v_patient, 'care_plan',  'Aggiornamento piano nutrizionale',
     v_patient::text || '/piano-nutrizionale.pdf',  'application/pdf', 188000, v_today - 4, true),
    (v_patient, 'imaging',    'Ecocardiogramma con color doppler',
     v_patient::text || '/ecocardiogramma.pdf',     'application/pdf', 2140000, v_today - 22, false);

  -- ── Azioni consigliate ────────────────────────────────────────
  insert into public.recommended_actions
    (patient_id, title, description, pillar_key, source, status, due_on, priority)
  values
    (v_patient, 'Completare la spirometria',
     'Manca per calcolare per intero il pilastro cardiovascolare.',
     'cardiovascular', 'professional', 'suggested', v_today + 12, 1),
    (v_patient, 'Portare il cardio a 150 minuti a settimana',
     'Sei a 110 minuti di media. Bastano due sessioni in più in zona 2 per chiudere il divario.',
     'movement', 'protocol', 'in_progress', null, 2),
    (v_patient, 'Anticipare la cena di 60 minuti',
     'La finestra di digiuno notturno è il fattore che sposta di più il tuo punteggio metabolico.',
     'metabolic_health', 'brain', 'suggested', null, 2),
    (v_patient, 'Prenotare la valutazione cognitiva',
     'È l''unico parametro mancante del pilastro Mental Wellbeing.',
     'mental_wellbeing', 'professional', 'suggested', v_today + 17, 3);

  -- ── Notifiche ─────────────────────────────────────────────────
  insert into public.notifications (profile_id, title, body, link_url, created_at)
  values
    (v_profile, 'Il tuo nuovo Longevity Score è disponibile',
     '85/100, undici punti in più rispetto al controllo precedente.',
     '/percorso', now() - interval '5 days'),
    (v_profile, 'Nuovo piano nutrizionale',
     'Il piano è stato aggiornato in vista del prossimo controllo.',
     '/documenti', now() - interval '4 days');

  -- ── Metodo di pagamento e incassi ─────────────────────────────
  -- Solo circuito, ultime quattro cifre e scadenza: il resto sta dal
  -- gestore dei pagamenti.
  insert into public.payment_methods
    (patient_id, brand, last4, exp_month, exp_year, is_default)
  values (v_patient, 'Visa', '4242', 11, 2028, true);

  insert into public.payments
    (patient_id, kind, status, amount_cents, description, paid_at, membership_id)
  values
    (v_patient, 'membership', 'paid', 420000, 'Unique Signature — annuale',
     now() - interval '155 days', v_membership),
    (v_patient, 'extra', 'paid', 45000, 'IV Therapy — ciclo di 3 sedute',
     now() - interval '77 days', null);

  -- ── Disponibilità in agenda ───────────────────────────────────
  if v_pro is not null then
    insert into public.availability_slots
      (professional_id, service_id, starts_at, ends_at)
    select
      v_pro,
      s.id,
      ((v_today + g.d)::timestamp + time '10:00') at time zone 'Europe/Rome',
      ((v_today + g.d)::timestamp + time '11:00') at time zone 'Europe/Rome'
    from generate_series(21, 35, 7) as g(d)
    cross join lateral (
      select id from public.services where slug = 'consulenza-longevity'
    ) s;
  end if;

  raise notice 'Paziente % attivato (patient_id=%).', v_email, v_patient;
end $$;
