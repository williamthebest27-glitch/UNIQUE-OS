-- ═══════════════════════════════════════════════════════════════════
-- Dati dimostrativi di clinica: turni dei professionisti e lead CRM.
--
-- Da eseguire dopo `demo-paziente.sql`. Riguardano la clinica nel suo
-- insieme, non un singolo paziente: senza turni la capacità non è
-- misurabile, e senza lead il CRM resta vuoto.
--
-- Rieseguirlo azzera e ricrea questi dati. NON eseguirlo in produzione.
-- ═══════════════════════════════════════════════════════════════════

do $$
declare
  v_pro       uuid;
  v_paziente  uuid;
  v_servizio  uuid;
begin
  -- ── Turni ─────────────────────────────────────────────────────
  -- Al primo professionista registrato: senza orari, la saturazione non
  -- si puo calcolare e il Control Center lo dice invece di indovinarla.
  select id into v_pro from public.professionals where is_active order by created_at limit 1;

  if v_pro is null then
    raise notice 'Nessun professionista registrato: turni e capacita saltati.';
  else
    delete from public.professional_schedules where professional_id = v_pro;

    -- Lunedi-venerdi, 9-13 e 14-18.
    insert into public.professional_schedules (professional_id, weekday, starts_at, ends_at)
    select v_pro, g.d, time '09:00', time '13:00' from generate_series(1, 5) as g(d);

    insert into public.professional_schedules (professional_id, weekday, starts_at, ends_at)
    select v_pro, g.d, time '14:00', time '18:00' from generate_series(1, 4) as g(d);
  end if;

  -- ── Lead ──────────────────────────────────────────────────────
  select id into v_paziente from public.patients order by created_at limit 1;
  select id into v_servizio from public.services where slug = 'consulenza-longevity';

  delete from public.lead_activities
   where lead_id in (select id from public.leads where campaign like 'demo-%');
  delete from public.lead_identities
   where lead_id in (select id from public.leads where campaign like 'demo-%');
  delete from public.leads where campaign like 'demo-%';

  insert into public.leads
    (full_name, email, phone, status, source, campaign, service_interest_id,
     first_seen_at, last_activity_at, qualified_at, booked_at, converted_at, lost_at, lost_reason, patient_id)
  values
    ('Giulia Ferrari',   'giulia.ferrari@example.it',  '+39 340 1112223', 'member',
     'instagram', 'demo-meta-longevity', v_servizio,
     now() - interval '120 days', now() - interval '3 days',
     now() - interval '115 days', now() - interval '110 days', now() - interval '100 days',
     null, null, v_paziente),

    ('Marco Bellini',    'marco.bellini@example.it',   '+39 347 4445556', 'booked',
     'facebook', 'demo-meta-longevity', v_servizio,
     now() - interval '12 days', now() - interval '1 day',
     now() - interval '9 days', now() - interval '2 days', null, null, null, null),

    ('Elena Moretti',    'elena.moretti@example.it',   null, 'qualified',
     'web', 'demo-organico', v_servizio,
     now() - interval '9 days', now() - interval '4 days',
     now() - interval '6 days', null, null, null, null, null),

    ('Davide Rinaldi',   null, '+39 333 7778889', 'contacted',
     'whatsapp', 'demo-meta-longevity', null,
     now() - interval '6 days', now() - interval '5 days',
     null, null, null, null, null, null),

    ('Sara Conti',       'sara.conti@example.it',      null, 'new_lead',
     'instagram', 'demo-reel-settembre', null,
     now() - interval '2 days', now() - interval '2 days',
     null, null, null, null, null, null),

    ('Luca Barbieri',    'luca.barbieri@example.it',   null, 'lost',
     'web', 'demo-organico', null,
     now() - interval '45 days', now() - interval '30 days',
     now() - interval '40 days', null, null, now() - interval '30 days',
     'Prezzo fuori budget', null),

    ('Chiara Vitali',    null, '+39 349 2223334', 'new_lead',
     'referral', 'demo-passaparola', v_servizio,
     now() - interval '1 day', now() - interval '1 day',
     null, null, null, null, null, null);

  -- ── Identita omnicanale ───────────────────────────────────────
  -- Lo stesso lead riconosciuto su piu canali: e la domanda a cui deve
  -- saper rispondere il cervello quando qualcuno scrive su WhatsApp.
  insert into public.lead_identities (lead_id, channel, handle, verified)
  select l.id, 'whatsapp', l.phone, true
  from public.leads l
  where l.campaign like 'demo-%' and l.phone is not null
  on conflict (channel, handle) do nothing;

  insert into public.lead_identities (lead_id, channel, handle, verified)
  select l.id, 'email', l.email, true
  from public.leads l
  where l.campaign like 'demo-%' and l.email is not null
  on conflict (channel, handle) do nothing;

  -- ── Conversazioni ─────────────────────────────────────────────
  insert into public.lead_activities (lead_id, channel, direction, kind, body, by_ai, occurred_at)
  select l.id, l.source, 'inbound', 'message',
         'Quanto costa il Longevity Score?', false, l.first_seen_at
  from public.leads l
  where l.campaign like 'demo-%';

  insert into public.lead_activities (lead_id, channel, direction, kind, body, by_ai, occurred_at)
  select l.id, l.source, 'outbound', 'message',
         'Prima risposta con listino e disponibilita.', true,
         l.first_seen_at + interval '4 minutes'
  from public.leads l
  where l.campaign like 'demo-%';

  raise notice 'Turni e lead dimostrativi creati.';
end $$;
