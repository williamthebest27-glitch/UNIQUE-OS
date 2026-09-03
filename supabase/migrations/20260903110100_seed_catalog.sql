-- ═══════════════════════════════════════════════════════════════════
-- Cataloghi di partenza: percorsi e livelli di membership.
--
-- Sono dati di configurazione, non dati di pazienti: possono stare in una
-- migrazione. Nomi e prezzi vanno confermati da Unique — qui servono ad
-- avere un sistema utilizzabile dal primo giorno.
-- ═══════════════════════════════════════════════════════════════════

insert into public.programs (slug, name, description, duration_days)
values
  ('metabolic-reset-90',
   'Metabolic Reset — 90 giorni',
   'Protocollo integrato di nutrizione, allenamento e recupero, con due checkpoint ematochimici.',
   90),
  ('cardio-longevity-180',
   'Cardio Longevity — 6 mesi',
   'Percorso di ricondizionamento cardiovascolare con test da sforzo iniziale e finale.',
   180),
  ('hormonal-balance-120',
   'Equilibrio Ormonale — 4 mesi',
   'Valutazione e riequilibrio dell’assetto ormonale, con monitoraggio trimestrale.',
   120),
  ('sleep-recovery-60',
   'Sonno e Recupero — 60 giorni',
   'Analisi dell’architettura del sonno e protocollo di recupero personalizzato.',
   60)
on conflict (slug) do nothing;

insert into public.membership_tiers
  (slug, name, description, price_cents, credits_included, billing_period)
values
  ('essential',
   'Unique Essential',
   'Due valutazioni annuali e accesso alla piattaforma.',
   180000, 8, 'year'),
  ('signature',
   'Unique Signature',
   'Percorso completo con follow-up trimestrale e referente clinico dedicato.',
   420000, 24, 'year'),
  ('private',
   'Unique Private',
   'Assistenza continuativa, accesso prioritario e coordinamento specialistico.',
   960000, 60, 'year')
on conflict (slug) do nothing;
