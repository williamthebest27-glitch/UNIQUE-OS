-- ═══════════════════════════════════════════════════════════════════
-- Correzione di sicurezza sulla vista dei saldi, e tappe dei percorsi.
--
-- Questa migrazione è idempotente rispetto allo schema core: se il core
-- è stato applicato dopo la correzione, qui non cambia nulla.
-- ═══════════════════════════════════════════════════════════════════

-- Le viste in Postgres girano di default con i permessi del proprietario,
-- non di chi interroga. Senza security_invoker, credit_balances
-- restituirebbe i saldi di tutti i pazienti a chiunque sappia leggerla,
-- scavalcando la Row Level Security di credit_entries.
create or replace view public.credit_balances
with (security_invoker = true) as
select
  patient_id,
  coalesce(sum(amount), 0)                            as balance,
  coalesce(sum(amount) filter (where amount > 0), 0)  as total_credited,
  coalesce(-sum(amount) filter (where amount < 0), 0) as total_used
from public.credit_entries
group by patient_id;

-- Una percentuale da sola non dice al paziente a che punto è. "9 tappe su
-- 14" sì: per questo le conserviamo, invece di dedurle dalla percentuale.
alter table public.program_enrollments
  add column if not exists steps_done  integer not null default 0,
  add column if not exists steps_total integer not null default 0;

alter table public.program_enrollments
  drop constraint if exists enrollment_steps_coherent;

alter table public.program_enrollments
  add constraint enrollment_steps_coherent
  check (steps_done >= 0 and steps_total >= 0 and steps_done <= steps_total);
