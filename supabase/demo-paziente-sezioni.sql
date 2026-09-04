-- ═══════════════════════════════════════════════════════════════════
-- Dati dimostrativi delle sezioni nuove del paziente
--
-- Questionari, conversazioni e consensi per il primo paziente
-- registrato. Servono a due cose: vedere le sezioni piene invece che
-- vuote, e — soprattutto — dare al test di segregazione qualcosa da
-- provare a leggere.
--
-- Una tabella vuota passa qualunque controllo di permessi. Senza queste
-- righe, «la reception non vede i questionari» sarebbe vero nel modo in
-- cui è vero che non vede una tabella che non esiste.
--
-- Rieseguirlo azzera e ricrea questi dati. NON eseguirlo in produzione.
-- ═══════════════════════════════════════════════════════════════════

do $$
declare
  v_paziente uuid;
  v_profilo  uuid;
  v_pro_prof uuid;
  v_modello  uuid;
  v_filo     uuid;
  v_ass      uuid;
begin
  select p.id, p.profile_id into v_paziente, v_profilo
  from public.patients p order by p.created_at limit 1;

  if v_paziente is null then
    raise notice 'Nessun paziente registrato: sezioni dimostrative saltate.';
    return;
  end if;

  select pr.profile_id into v_pro_prof
  from public.professionals pr where pr.is_active order by pr.created_at limit 1;

  -- ── Questionari ───────────────────────────────────────────────
  delete from public.patient_assessments where patient_id = v_paziente;

  -- Uno assegnato e mai iniziato, con una scadenza vicina.
  select id into v_modello from public.assessment_templates where slug = 'sonno';
  if v_modello is not null then
    insert into public.patient_assessments
      (patient_id, template_id, status, questions, due_on)
    select v_paziente, v_modello, 'not_started', t.questions, current_date + 10
    from public.assessment_templates t where t.id = v_modello;
  end if;

  -- Uno a metà: è lo stato in cui si scopre se «riprendi dopo» funziona.
  select id into v_modello from public.assessment_templates where slug = 'stile-di-vita';
  if v_modello is not null then
    insert into public.patient_assessments
      (patient_id, template_id, status, questions, answers, progress_pct)
    select v_paziente, v_modello, 'in_progress', t.questions,
           '{"allenamenti": 3, "passi": "7000–10000"}'::jsonb, 33
    from public.assessment_templates t where t.id = v_modello
    returning id into v_ass;
  end if;

  -- Uno consegnato, per popolare l'archivio.
  select id into v_modello from public.assessment_templates where slug = 'benessere';
  if v_modello is not null then
    insert into public.patient_assessments
      (patient_id, template_id, status, questions, answers, progress_pct, completed_at)
    select v_paziente, v_modello, 'completed', t.questions,
           '{"energia": 4, "stress": 3, "concentrazione": 4, "relazioni": 5}'::jsonb,
           100, now() - interval '20 days'
    from public.assessment_templates t where t.id = v_modello;
  end if;

  -- ── Conversazioni ─────────────────────────────────────────────
  delete from public.message_threads where patient_id = v_paziente;

  -- Una clinica: la reception non deve poterla leggere.
  insert into public.message_threads
    (patient_id, subject, category, created_by, last_message_at)
  values
    (v_paziente, 'Referto di agosto', 'clinical', v_profilo, now() - interval '3 days')
  returning id into v_filo;

  insert into public.messages (thread_id, author_id, from_patient, body, created_at, read_by_patient_at)
  values
    (v_filo, v_profilo, true,
     'Ho caricato gli esami di agosto. Fatemi sapere se serve altro.',
     now() - interval '4 days', now() - interval '4 days'),
    (v_filo, coalesce(v_pro_prof, v_profilo), false,
     'Ricevuti, grazie. Li guardo e ne parliamo alla prossima visita.',
     now() - interval '3 days', null);

  -- Una amministrativa: questa sì.
  insert into public.message_threads
    (patient_id, subject, category, created_by, last_message_at, is_closed)
  values
    (v_paziente, 'Fattura di luglio', 'administrative', v_profilo, now() - interval '30 days', true)
  returning id into v_filo;

  insert into public.messages (thread_id, author_id, from_patient, body, created_at, read_by_patient_at)
  values
    (v_filo, v_profilo, true, 'Posso avere la fattura di luglio?',
     now() - interval '31 days', now() - interval '31 days'),
    (v_filo, coalesce(v_pro_prof, v_profilo), false,
     'Certo: la trova fra i suoi documenti. Buona giornata.',
     now() - interval '30 days', now() - interval '29 days');

  -- ── Una nota clinica ──────────────────────────────────────────
  -- Serve al controllo di segregazione: senza una riga, "la reception
  -- non vede le note cliniche" è vero come è vero che non vede una
  -- tabella che non esiste.
  delete from public.clinical_notes where patient_id = v_paziente;

  insert into public.clinical_notes
    (patient_id, author_id, kind, title, body, visible_to_patient, created_at)
  values
    (v_paziente, coalesce(v_pro_prof, v_profilo), 'note',
     'Controllo di agosto',
     'Buona aderenza al protocollo. Rivalutare la glicata al prossimo pannello.',
     false, now() - interval '20 days');

  -- ── Consensi ──────────────────────────────────────────────────
  delete from public.patient_consents where patient_id = v_paziente;

  insert into public.patient_consents (patient_id, kind, granted, decided_by, decided_at, source)
  values
    (v_paziente, 'privacy_policy', true,  v_profilo, now() - interval '200 days', 'reception'),
    (v_paziente, 'health_data',    true,  v_profilo, now() - interval '200 days', 'reception'),
    -- Concesso e poi revocato: la vista deve restituire l'ultimo, e lo
    -- storico deve restare. È il caso che rende utile l'append-only.
    (v_paziente, 'marketing',      true,  v_profilo, now() - interval '200 days', 'reception'),
    (v_paziente, 'marketing',      false, v_profilo, now() - interval '40 days',  'patient_app');

  raise notice 'Sezioni dimostrative del paziente create.';
end $$;
