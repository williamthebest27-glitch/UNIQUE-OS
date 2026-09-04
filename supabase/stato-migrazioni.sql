-- ═══════════════════════════════════════════════════════════════════
-- Fin dove è arrivato questo database?
--
-- Le migrazioni non lasciano una tabella di storico — è una scelta di
-- Supabase, che tiene il registro solo quando si usa la CLI. Su un
-- progetto in cui si è incollato a mano, l'unico modo di saperlo è
-- guardare cosa esiste.
--
-- Ogni migrazione ha un oggetto che crea per prima e che nessun'altra
-- crea: se c'è, quella migrazione è passata.
--
-- Sola lettura: non tocca niente. Eseguibile quante volte si vuole.
--
--   Supabase → SQL Editor → New query → incolla → Run
--
-- Se questa query fallisce dicendo che una tabella non esiste, la
-- risposta è già quella: il database è vuoto, e il pacchetto va
-- applicato per intero.
-- ═══════════════════════════════════════════════════════════════════

with stato as (
  select * from (values
    ( 1, '20260903100000_core_schema.sql',                    to_regtype('public.app_role')            is not null),
    ( 2, '20260903100100_rls_policies.sql',                   to_regproc('public.can_access_patient')  is not null),
    ( 3, '20260903110000_view_security_and_enrollment_steps.sql',
         exists (select 1 from information_schema.columns
                  where table_schema = 'public' and table_name = 'program_enrollments'
                    and column_name = 'steps_total')),
    ( 4, '20260903110100_seed_catalog.sql',
         exists (select 1 from public.membership_tiers)),
    ( 5, '20260903120000_measurements_and_clinical_ai.sql',   to_regclass('public.measurements')       is not null),
    ( 6, '20260903130000_timeline_uploads_briefings.sql',     to_regclass('public.patient_briefings')  is not null),
    ( 7, '20260903140000_professionals_membership_copilot.sql', to_regclass('public.clinical_notes')   is not null),
    ( 8, '20260903150000_credit_engine_payments_booking.sql', to_regclass('public.payments')           is not null),
    ( 9, '20260903160000_crm_economics_capacity.sql',         to_regclass('public.leads')              is not null),
    (10, '20260904100000_organizations_locations_roles.sql',  to_regclass('public.organizations')      is not null),
    (11, '20260904100100_domain_events.sql',                  to_regclass('public.domain_events')      is not null),
    (12, '20260904110000_knowledge_base.sql',                 to_regclass('public.knowledge_entries')  is not null),
    (13, '20260904120000_marketing.sql',                      to_regclass('public.campaigns')          is not null),
    (14, '20260904130000_brain_approvals_tasks.sql',          to_regclass('public.brain_proposals')    is not null)
  ) as t(numero, file, applicata)
)
select
  numero,
  file,
  case when applicata then 'sì' else 'MANCA' end as applicata,
  -- Il numero da passare a `npm run db:pacchetto -- --da N`: la prima
  -- che manca. Se una migrazione in mezzo risultasse mancante e le
  -- successive presenti, il pacchetto non basta e conviene guardarci.
  (select min(numero) from stato where not applicata) as prima_che_manca
from stato
order by numero;
