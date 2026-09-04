-- ═══════════════════════════════════════════════════════════════════
-- Dati dimostrativi di marketing: campagne, spesa, creativita, contenuti.
--
-- Da eseguire dopo `demo-clinica.sql`. Serve a vedere funzionare i conti
-- del marketing — CPL, CAC, ROAS, campagne fuori media, contenuti che
-- convertono — su numeri che si comportano come quelli veri: una
-- campagna che costa poco e porta poco, una che costa e porta bene, una
-- appena partita su cui non si puo ancora dire niente.
--
-- Rieseguirlo azzera e ricrea questi dati. NON eseguirlo in produzione.
-- ═══════════════════════════════════════════════════════════════════

do $$
declare
  v_score      uuid;
  v_consulenza uuid;
  v_meta       uuid;
  v_reel       uuid;
  v_google     uuid;
  v_giorno     date;
begin
  select id into v_score from public.services where slug = 'consulenza-longevity';
  select id into v_consulenza from public.services where slug = 'visita-nutrizionale';

  -- Ricreare da zero: le statistiche giornaliere sono cumulative e
  -- rieseguire senza cancellare raddoppierebbe la spesa.
  delete from public.campaigns where external_ref like 'demo-%';
  delete from public.content_pieces where url like 'https://demo.unique/%';

  insert into public.campaigns
    (external_ref, name, channel, status, objective, service_id, started_on, daily_budget_cents, notes)
  values
    ('demo-meta-longevity', 'Meta — Longevity Score', 'meta', 'active', 'lead',
     v_score, current_date - 90, 4000,
     'Sempre attiva. E la campagna con cui si confrontano le altre.'),
    ('demo-reel-settembre', 'Meta — Reel settembre', 'meta', 'active', 'lead',
     v_score, current_date - 20, 6000,
     'Costa piu della media: e l esempio su cui il Brain deve saper dire "31% sopra".'),
    ('demo-google-brand', 'Google — Ricerca brand', 'google', 'active', 'membership',
     v_consulenza, current_date - 60, 1500,
     'Pochi lead, ma di chi ci stava gia cercando.');

  select id into v_meta   from public.campaigns where external_ref = 'demo-meta-longevity';
  select id into v_reel   from public.campaigns where external_ref = 'demo-reel-settembre';
  select id into v_google from public.campaigns where external_ref = 'demo-google-brand';

  -- ── Spesa giornaliera ─────────────────────────────────────────
  -- Trenta giorni indietro, con numeri che stanno insieme: click
  -- coerenti con le impression, lead coerenti con i click.
  v_giorno := current_date - 30;
  while v_giorno <= current_date loop
    insert into public.campaign_daily_stats
      (campaign_id, day, spend_cents, impressions, clicks, platform_leads)
    values
      (v_meta, v_giorno, 3800 + (random() * 600)::int,
       2400 + (random() * 400)::int, 52 + (random() * 20)::int,
       case when random() < 0.55 then 1 else 0 end),
      (v_google, v_giorno, 1400 + (random() * 300)::int,
       380 + (random() * 90)::int, 22 + (random() * 8)::int,
       case when random() < 0.25 then 1 else 0 end)
    on conflict (campaign_id, day) do nothing;

    if v_giorno >= current_date - 20 then
      insert into public.campaign_daily_stats
        (campaign_id, day, spend_cents, impressions, clicks, platform_leads)
      values
        (v_reel, v_giorno, 5800 + (random() * 800)::int,
         5200 + (random() * 900)::int, 71 + (random() * 25)::int,
         case when random() < 0.3 then 1 else 0 end)
      on conflict (campaign_id, day) do nothing;
    end if;

    v_giorno := v_giorno + 1;
  end loop;

  -- ── Creativita ────────────────────────────────────────────────
  insert into public.creatives (campaign_id, external_ref, name, format, hook, angle, is_active)
  values
    (v_meta, 'demo-cr-1', 'Sette pilastri', 'carosello',
     'La tua eta anagrafica non dice come stai.', 'autorita', true),
    (v_meta, 'demo-cr-2', 'Cosa misuriamo', 'reel',
     'Trentadue parametri, un numero solo.', 'curiosita', true),
    (v_reel, 'demo-cr-3', 'Check-up di settembre', 'reel',
     'Hai fatto le analisi e poi le hai messe in un cassetto?', 'dolore', true);

  -- ── Contenuti organici ────────────────────────────────────────
  insert into public.content_pieces
    (channel, format, title, hook, angle, topic, url, published_on,
     views, reach, likes, comments, saves, shares, leads_attributed)
  values
    ('organic', 'reel', 'Cosa misura davvero il Longevity Score',
     'Il tuo medico ti ha mai misurato questo?', 'autorita', 'score',
     'https://demo.unique/reel-score', current_date - 25,
     18400, 17200, 640, 74, 310, 96, 14),

    ('organic', 'carosello', 'Cinque esami che nessuno ti prescrive',
     'Non sono esotici. Sono solo fuori protocollo.', 'autorita', 'esami',
     'https://demo.unique/carosello-esami', current_date - 18,
     9100, 8600, 410, 52, 288, 64, 11),

    ('organic', 'reel', 'Dietro le quinte in clinica',
     'Un giorno qualunque in Unique.', 'curiosita', 'brand',
     'https://demo.unique/reel-backstage', current_date - 12,
     22800, 21400, 1180, 96, 62, 24, 1),

    ('organic', 'carosello', 'Perche il tuo punteggio puo scendere',
     'Ed e una buona notizia.', 'dolore', 'score',
     'https://demo.unique/carosello-punteggio', current_date - 6,
     6400, 6100, 240, 38, 176, 41, 8);

  -- ── Attribuzione ──────────────────────────────────────────────
  -- I lead dimostrativi sanno da quale campagna vengono: senza questo
  -- passaggio la catena si spezza e CAC e ROAS restano non calcolabili.
  update public.leads set campaign_id = v_meta   where campaign = 'demo-meta-longevity';
  update public.leads set campaign_id = v_reel   where campaign = 'demo-reel-settembre';
  update public.leads set campaign_id = v_google where campaign = 'demo-google-brand';

  raise notice 'Campagne, spesa, creativita e contenuti dimostrativi creati.';
end $$;
