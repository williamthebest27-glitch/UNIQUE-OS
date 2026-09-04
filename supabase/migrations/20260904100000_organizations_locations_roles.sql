-- ═══════════════════════════════════════════════════════════════════
-- Organizzazione, sedi, ruoli
--
-- La domanda da cui parte questa migrazione non è "come apriamo la
-- seconda sede", ma "cosa dobbiamo scrivere oggi perché aprirla non
-- costringa a riscrivere lo schema". La risposta è una gerarchia sola:
--
--   Organization → Location → Professional → Patient
--
-- Finché la sede è una, ogni riga punta alla stessa. Il giorno in cui
-- sono quattro, le query non cambiano: cambia il filtro.
-- ═══════════════════════════════════════════════════════════════════

-- ── Organizzazione ────────────────────────────────────────────────
create table public.organizations (
  id          uuid primary key default gen_random_uuid(),
  slug        text unique not null,
  name        text not null,
  legal_name  text,
  vat_number  text,
  timezone    text not null default 'Europe/Rome',
  is_active   boolean not null default true,
  created_at  timestamptz not null default now()
);

comment on table public.organizations is
  'Unique come azienda. Oggi una riga sola: esiste perché il giorno in cui i dati di due società non devono mescolarsi, il confine deve essere già lì.';

-- ── Sedi ──────────────────────────────────────────────────────────
create table public.locations (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  slug            text unique not null,
  name            text not null,
  address         text,
  city            text,
  province        text,
  postal_code     text,
  phone           text,
  email           text,
  timezone        text not null default 'Europe/Rome',
  opened_on       date,
  is_active       boolean not null default true,
  created_at      timestamptz not null default now()
);

create index locations_by_org on public.locations (organization_id) where is_active;

comment on table public.locations is
  'Unique Varese, Unique Milano, Unique Roma. Ambulatori, agende, professionisti e pazienti appartengono a una sede; la direzione le vede tutte da una dashboard sola.';

insert into public.organizations (slug, name, legal_name)
values ('unique', 'Unique', 'Unique Longevity Clinic')
on conflict (slug) do nothing;

insert into public.locations (organization_id, slug, name, city, province, opened_on)
select id, 'varese', 'Unique Varese', 'Varese', 'VA', current_date
from public.organizations where slug = 'unique'
on conflict (slug) do nothing;

-- ── La sede sulle righe che ne hanno una ──────────────────────────
-- Nullable per scelta: le righe già in archivio non hanno una sede da
-- indovinare, e una sede sbagliata è peggio di una sede assente.

alter table public.patients           add column if not exists location_id uuid references public.locations (id) on delete set null;
alter table public.professionals      add column if not exists location_id uuid references public.locations (id) on delete set null;
alter table public.appointments       add column if not exists location_id uuid references public.locations (id) on delete set null;
alter table public.rooms              add column if not exists location_id uuid references public.locations (id) on delete set null;
alter table public.availability_slots add column if not exists location_id uuid references public.locations (id) on delete set null;
alter table public.leads              add column if not exists location_id uuid references public.locations (id) on delete set null;

create index if not exists patients_by_location     on public.patients (location_id);
create index if not exists appointments_by_location on public.appointments (location_id, starts_at desc);
create index if not exists leads_by_location        on public.leads (location_id);

comment on column public.appointments.location_id is
  'Dove si svolge la visita. Un professionista che lavora su due sedi ha una sola agenda e appuntamenti in due luoghi.';

-- Un professionista può ricevere in più sedi: la principale sta su
-- `professionals.location_id`, le altre qui.
create table public.professional_locations (
  professional_id uuid not null references public.professionals (id) on delete cascade,
  location_id     uuid not null references public.locations (id) on delete cascade,
  created_at      timestamptz not null default now(),
  primary key (professional_id, location_id)
);

-- Tutto ciò che esiste oggi è di Varese: è vero, ed è meglio di null.
update public.patients      set location_id = (select id from public.locations where slug = 'varese') where location_id is null;
update public.professionals set location_id = (select id from public.locations where slug = 'varese') where location_id is null;
update public.appointments  set location_id = (select id from public.locations where slug = 'varese') where location_id is null;
update public.rooms         set location_id = (select id from public.locations where slug = 'varese') where location_id is null;

-- ── Ruoli ─────────────────────────────────────────────────────────
/*
 * Reception e marketing.
 *
 * Un valore aggiunto a un enum non è utilizzabile nella stessa
 * transazione in cui viene aggiunto: Postgres rifiuta ogni letterale che
 * lo nomini. Per questo le funzioni qui sotto confrontano `role::text` e
 * non `role in ('reception')` — è l'unico modo di aggiungere i ruoli e
 * usarli nella stessa migrazione.
 */
alter type app_role add value if not exists 'reception';
alter type app_role add value if not exists 'marketing';

-- Chi dirige: numeri, dati clinici e configurazione.
create or replace function public.is_management()
returns boolean
language sql
stable
security definer
set search_path = public
as $fn$
  select coalesce(
    (select role::text in ('admin', 'owner') from public.profiles where id = auth.uid()),
    false
  );
$fn$;

/*
 * Reception e operations.
 *
 * Vede agenda, recapiti, incassi e CRM. **Non** vede referti, misure,
 * note cliniche, Score. Non è una questione di fiducia: ai dati sanitari
 * accede chi ha una ragione di cura, e la reception non ce l'ha.
 */
create or replace function public.is_reception()
returns boolean
language sql
stable
security definer
set search_path = public
as $fn$
  select coalesce(
    (select role::text = 'reception' from public.profiles where id = auth.uid()),
    false
  );
$fn$;

-- Marketing: campagne, lead, contenuti, numeri aggregati. Nessun paziente.
create or replace function public.is_marketing()
returns boolean
language sql
stable
security definer
set search_path = public
as $fn$
  select coalesce(
    (select role::text = 'marketing' from public.profiles where id = auth.uid()),
    false
  );
$fn$;

-- Chi lavora in Unique, a qualunque titolo. Non implica accesso clinico.
create or replace function public.is_internal()
returns boolean
language sql
stable
security definer
set search_path = public
as $fn$
  select coalesce(
    (select role::text in ('admin', 'owner', 'reception', 'marketing', 'professional')
     from public.profiles where id = auth.uid()),
    false
  );
$fn$;

-- ── Perimetro di sede ─────────────────────────────────────────────
/*
 * Un utente interno può essere limitato a una sede.
 *
 * `scope_location_id` null significa "tutta l'organizzazione": è il caso
 * del founder e, oggi, di tutti. Il giorno in cui chi dirige Milano non
 * deve leggere i pazienti di Roma si valorizza una colonna — non si
 * riscrive una policy.
 */
alter table public.profiles
  add column if not exists scope_location_id uuid references public.locations (id) on delete set null;

create or replace function public.my_scope_location()
returns uuid
language sql
stable
security definer
set search_path = public
as $fn$
  select scope_location_id from public.profiles where id = auth.uid();
$fn$;

create or replace function public.location_in_scope(p_location uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $fn$
  select public.my_scope_location() is null
      or p_location is null
      or p_location = public.my_scope_location();
$fn$;

-- ── Accesso ai pazienti, con la sede ──────────────────────────────
/*
 * La stessa funzione di prima, con una condizione in più sul ramo dello
 * staff. Finché nessuno ha un perimetro di sede il comportamento è
 * identico a ieri; appena qualcuno ce l'ha vale ovunque, perché ogni
 * policy clinica passa da qui.
 */
create or replace function public.can_access_patient(target uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $fn$
  select
    target is not null
    and (
      exists (
        select 1 from public.patients p
        where p.id = target and p.profile_id = auth.uid()
      )
      or exists (
        select 1
        from public.care_team_members ctm
        join public.professionals pr on pr.id = ctm.professional_id
        where ctm.patient_id = target
          and pr.profile_id = auth.uid()
          and ctm.ended_at is null
      )
      or (
        public.is_staff()
        and exists (
          select 1 from public.patients p
          where p.id = target and public.location_in_scope(p.location_id)
        )
      )
    );
$fn$;

-- ── Policy delle tabelle nuove ────────────────────────────────────
alter table public.organizations          enable row level security;
alter table public.locations              enable row level security;
alter table public.professional_locations enable row level security;

-- Organizzazione e sedi sono leggibili da chiunque sia autenticato: il
-- paziente deve sapere dove si presenta.
create policy organizations_read on public.organizations
  for select using (true);

create policy organizations_write on public.organizations
  for all using (public.is_staff()) with check (public.is_staff());

create policy locations_read on public.locations
  for select using (true);

create policy locations_write on public.locations
  for all using (public.is_staff()) with check (public.is_staff());

create policy professional_locations_read on public.professional_locations
  for select using (true);

create policy professional_locations_write on public.professional_locations
  for all using (public.is_staff()) with check (public.is_staff());

-- ── Cosa vede la reception ────────────────────────────────────────
/*
 * Righe operative, non cliniche. L'elenco è volutamente corto: una
 * tabella che non compare qui resta invisibile alla reception, ed è il
 * comportamento giusto anche per le tabelle che aggiungeremo domani.
 */
/*
 * I nomi che la reception deve poter leggere.
 *
 * Un'agenda senza nomi non è un'agenda. La funzione è security definer
 * perché una policy che interroga `patients` direttamente farebbe
 * scattare la RLS di `patients` dentro la policy di `profiles`, e il
 * risultato dipenderebbe dall'ordine in cui Postgres le valuta.
 */
create or replace function public.profile_visible_to_reception(p_profile uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $fn$
  select exists (
      select 1 from public.patients p
      where p.profile_id = p_profile and public.location_in_scope(p.location_id)
    )
    or exists (
      select 1 from public.professionals pr where pr.profile_id = p_profile
    );
$fn$;

create policy profiles_reception_read on public.profiles
  for select using (public.is_reception() and public.profile_visible_to_reception(id));

create policy patients_reception_read on public.patients
  for select using (public.is_reception() and public.location_in_scope(location_id));

create policy patients_reception_write on public.patients
  for update using (public.is_reception()) with check (public.is_reception());

create policy appointments_reception on public.appointments
  for all using (public.is_reception() and public.location_in_scope(location_id))
  with check (public.is_reception() and public.location_in_scope(location_id));

create policy slots_reception on public.availability_slots
  for all using (public.is_reception()) with check (public.is_reception());

create policy payments_reception_read on public.payments
  for select using (public.is_reception());

create policy memberships_reception_read on public.memberships
  for select using (public.is_reception());

create policy credits_reception_read on public.credit_entries
  for select using (public.is_reception());

create policy services_internal_read on public.services
  for select using (public.is_internal());

create policy leads_operations on public.leads
  for all using (public.is_reception() or public.is_marketing())
  with check (public.is_reception() or public.is_marketing());

create policy lead_identities_operations on public.lead_identities
  for all using (public.is_reception() or public.is_marketing())
  with check (public.is_reception() or public.is_marketing());

create policy lead_activities_operations on public.lead_activities
  for all using (public.is_reception() or public.is_marketing())
  with check (public.is_reception() or public.is_marketing());

create policy professionals_internal_read on public.professionals
  for select using (public.is_internal());

create policy rooms_internal_read on public.rooms
  for select using (public.is_internal());

comment on function public.is_reception() is
  'Reception e operations: agenda, recapiti, incassi, CRM. Nessun dato sanitario.';
comment on function public.is_marketing() is
  'Marketing: campagne, lead, contenuti e numeri aggregati. Nessun paziente.';
