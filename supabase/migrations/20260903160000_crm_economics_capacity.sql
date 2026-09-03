-- ═══════════════════════════════════════════════════════════════════
-- CRM, unit economics, capacità
-- ═══════════════════════════════════════════════════════════════════

-- ── CRM ───────────────────────────────────────────────────────────
create type lead_status as enum (
  'new_lead', 'contacted', 'qualified', 'booking_proposed',
  'booked', 'patient', 'member', 'inactive', 'lost'
);

create type lead_channel as enum (
  'web', 'whatsapp', 'instagram', 'facebook', 'email',
  'phone', 'referral', 'walk_in', 'other'
);

create table public.leads (
  id            uuid primary key default gen_random_uuid(),
  full_name     text,
  email         text,
  phone         text,
  status        lead_status not null default 'new_lead',
  source        lead_channel not null default 'other',
  campaign      text,
  service_interest_id uuid references public.services (id) on delete set null,
  -- Chi lo segue in Unique.
  owner_id      uuid references public.profiles (id) on delete set null,
  -- Valorizzato quando il lead diventa paziente: da qui in poi il valore
  -- economico generato si legge dai suoi pagamenti, non si duplica qui.
  patient_id    uuid references public.patients (id) on delete set null,
  first_seen_at timestamptz not null default now(),
  last_activity_at timestamptz,
  qualified_at  timestamptz,
  booked_at     timestamptz,
  converted_at  timestamptz,
  lost_at       timestamptz,
  lost_reason   text,
  notes         text,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

create index leads_by_status on public.leads (status, last_activity_at desc);
create index leads_by_campaign on public.leads (campaign) where campaign is not null;
create index leads_by_patient on public.leads (patient_id) where patient_id is not null;

create trigger leads_touch before update on public.leads
  for each row execute function public.touch_updated_at();

/*
 * Omnicanale: la stessa persona su canali diversi.
 *
 * "Questa persona che scrive su WhatsApp è lo stesso lead arrivato ieri
 * da Meta e diventato paziente oggi" è una domanda di identità, non di
 * canale. Qui vivono gli identificativi — numero, email, id Instagram —
 * e il vincolo di unicità impedisce che lo stesso recapito finisca su
 * due lead diversi.
 */
create table public.lead_identities (
  id         uuid primary key default gen_random_uuid(),
  lead_id    uuid not null references public.leads (id) on delete cascade,
  channel    lead_channel not null,
  handle     text not null,
  verified   boolean not null default false,
  created_at timestamptz not null default now(),
  unique (channel, handle)
);

create index identities_by_lead on public.lead_identities (lead_id);

create type activity_direction as enum ('inbound', 'outbound', 'internal');

create table public.lead_activities (
  id          uuid primary key default gen_random_uuid(),
  lead_id     uuid not null references public.leads (id) on delete cascade,
  channel     lead_channel not null default 'other',
  direction   activity_direction not null default 'internal',
  kind        text not null default 'message',
  body        text,
  -- Null quando ha agito il sistema. `by_ai` distingue una risposta
  -- automatica da una scritta da una persona: serve a sapere, dopo, chi
  -- ha detto cosa.
  actor_id    uuid references public.profiles (id) on delete set null,
  by_ai       boolean not null default false,
  occurred_at timestamptz not null default now()
);

create index activities_by_lead on public.lead_activities (lead_id, occurred_at desc);

-- Ogni attività aggiorna l'ultimo contatto: serve a sapere chi è fermo.
create or replace function public.touch_lead_activity()
returns trigger
language plpgsql
security definer
set search_path = public
as $fn$
begin
  update public.leads
     set last_activity_at = greatest(coalesce(last_activity_at, new.occurred_at), new.occurred_at)
   where id = new.lead_id;
  return new;
end;
$fn$;

create trigger lead_activities_touch
  after insert on public.lead_activities
  for each row execute function public.touch_lead_activity();

alter table public.leads           enable row level security;
alter table public.lead_identities enable row level security;
alter table public.lead_activities enable row level security;

-- Il CRM è di chi vende e di chi dirige. Un professionista vede solo i
-- lead che gli sono stati assegnati.
create policy leads_read on public.leads
  for select using (public.is_staff() or owner_id = auth.uid());

create policy leads_write on public.leads
  for all using (public.is_staff() or owner_id = auth.uid())
  with check (public.is_staff() or owner_id = auth.uid());

create policy identities_all on public.lead_identities
  for all using (
    exists (
      select 1 from public.leads l
      where l.id = lead_id and (public.is_staff() or l.owner_id = auth.uid())
    )
  )
  with check (
    exists (
      select 1 from public.leads l
      where l.id = lead_id and (public.is_staff() or l.owner_id = auth.uid())
    )
  );

create policy activities_all on public.lead_activities
  for all using (
    exists (
      select 1 from public.leads l
      where l.id = lead_id and (public.is_staff() or l.owner_id = auth.uid())
    )
  )
  with check (
    exists (
      select 1 from public.leads l
      where l.id = lead_id and (public.is_staff() or l.owner_id = auth.uid())
    )
  );

-- ── Unit economics ────────────────────────────────────────────────
alter table public.services
  add column if not exists price_cents         integer not null default 0 check (price_cents >= 0),
  add column if not exists material_cost_cents integer not null default 0 check (material_cost_cents >= 0);

comment on column public.services.material_cost_cents is
  'Costo dei materiali. Prezzo meno materiali e la base compensabile su cui si calcola la quota del professionista.';

/*
 * Regole di compenso.
 *
 * Configurabili per professionista, per servizio, per entrambi o per
 * nessuno dei due — e con scaglioni sul numero di visite del mese.
 * Vince la regola più specifica; a parità, quella con lo scaglione più
 * alto fra quelli raggiunti.
 */
create table public.compensation_rules (
  id                 uuid primary key default gen_random_uuid(),
  professional_id    uuid references public.professionals (id) on delete cascade,
  service_id         uuid references public.services (id) on delete cascade,
  professional_share numeric(5, 4) not null check (professional_share >= 0 and professional_share <= 1),
  -- Scaglione: la regola vale dalla n-esima visita del mese in poi.
  min_monthly_visits integer not null default 0 check (min_monthly_visits >= 0),
  valid_from         date not null default current_date,
  valid_to           date,
  note               text,
  created_at         timestamptz not null default now()
);

create index compensation_lookup
  on public.compensation_rules (professional_id, service_id, min_monthly_visits desc);

alter table public.compensation_rules enable row level security;

-- Un professionista può leggere le proprie condizioni. Non modificarle.
create policy compensation_read on public.compensation_rules
  for select using (
    public.is_staff() or professional_id = public.my_professional_id()
  );

create policy compensation_staff_write on public.compensation_rules
  for all using (public.is_staff()) with check (public.is_staff());

-- Quota predefinita, valida finché non se ne configura una più specifica.
insert into public.compensation_rules (professional_share, note)
values (0.70, 'Quota predefinita, in assenza di accordi specifici');

-- Prezzi e materiali di partenza. Da confermare con l'amministrazione.
update public.services set price_cents = 25000, material_cost_cents = 2500 where slug = 'iv-therapy';
update public.services set price_cents = 20000, material_cost_cents = 0     where slug = 'consulenza-longevity';
update public.services set price_cents = 12000, material_cost_cents = 0     where slug = 'visita-nutrizionale';
update public.services set price_cents = 9000,  material_cost_cents = 0     where slug = 'osteopatia';
update public.services set price_cents = 10000, material_cost_cents = 0     where slug = 'psicologia';
update public.services set price_cents = 8000,  material_cost_cents = 1500  where slug = 'body-scan';
update public.services set price_cents = 30000, material_cost_cents = 3000  where slug = 'test-da-sforzo';

-- ── Capacità ──────────────────────────────────────────────────────
create table public.rooms (
  id        uuid primary key default gen_random_uuid(),
  name      text not null,
  notes     text,
  is_active boolean not null default true
);

create table public.opening_hours (
  id        uuid primary key default gen_random_uuid(),
  -- 0 = domenica, 6 = sabato, come in Postgres.
  weekday   smallint not null check (weekday between 0 and 6),
  opens_at  time not null,
  closes_at time not null,
  room_id   uuid references public.rooms (id) on delete cascade,
  check (closes_at > opens_at)
);

create table public.professional_schedules (
  id              uuid primary key default gen_random_uuid(),
  professional_id uuid not null references public.professionals (id) on delete cascade,
  weekday         smallint not null check (weekday between 0 and 6),
  starts_at       time not null,
  ends_at         time not null,
  valid_from      date not null default current_date,
  valid_to        date,
  check (ends_at > starts_at)
);

create index schedules_by_professional
  on public.professional_schedules (professional_id, weekday);

alter table public.rooms                  enable row level security;
alter table public.opening_hours          enable row level security;
alter table public.professional_schedules enable row level security;

-- Ambulatori e orari non sono dati sensibili: chi lavora in clinica li vede.
create policy rooms_read on public.rooms for select using (true);
create policy rooms_staff_write on public.rooms
  for all using (public.is_staff()) with check (public.is_staff());

create policy hours_read on public.opening_hours for select using (true);
create policy hours_staff_write on public.opening_hours
  for all using (public.is_staff()) with check (public.is_staff());

create policy schedules_read on public.professional_schedules for select using (true);
create policy schedules_staff_write on public.professional_schedules
  for all using (public.is_staff()) with check (public.is_staff());

-- Struttura di partenza: due ambulatori, lunedì-venerdì 8–19, sabato 9–13.
insert into public.rooms (name) values ('Ambulatorio 1'), ('Ambulatorio 2');

insert into public.opening_hours (weekday, opens_at, closes_at)
select g.d, time '08:00', time '19:00' from generate_series(1, 5) as g(d);

insert into public.opening_hours (weekday, opens_at, closes_at)
values (6, time '09:00', time '13:00');
