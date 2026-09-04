-- ═══════════════════════════════════════════════════════════════════
-- Marketing intelligence
--
-- La domanda a cui questo schema deve saper rispondere non è "quanto
-- abbiamo speso", che la sa già la piattaforma pubblicitaria. È **quale
-- campagna porta i pazienti migliori** — e per rispondere serve che la
-- spesa e il valore generato stiano nello stesso database.
--
-- La catena è:
--
--   campagna → creatività → lead → paziente → membership → pagamenti
--
-- Ogni anello esiste già tranne i primi due. Qui si aggiungono, e si
-- attacca il lead alla campagna che lo ha prodotto.
-- ═══════════════════════════════════════════════════════════════════

create type campaign_channel as enum (
  'meta', 'google', 'tiktok', 'linkedin', 'youtube',
  'email', 'organic', 'referral', 'offline', 'other'
);

create type campaign_status as enum ('draft', 'active', 'paused', 'ended');

create table public.campaigns (
  id            uuid primary key default gen_random_uuid(),
  -- L'identificativo sulla piattaforma: è la chiave con cui si
  -- riconciliano le spese importate, non il nome, che cambia.
  external_ref  text unique,
  name          text not null,
  channel       campaign_channel not null default 'meta',
  status        campaign_status not null default 'active',
  -- Cosa deve produrre: 'lead', 'score', 'membership', 'awareness'.
  objective     text,
  -- Il servizio promosso. È la colonna che permette di chiedere
  -- "quale campagna genera più membership" invece di "quale campagna
  -- genera più click".
  service_id    uuid references public.services (id) on delete set null,
  location_id   uuid references public.locations (id) on delete set null,
  started_on    date,
  ended_on      date,
  daily_budget_cents integer check (daily_budget_cents is null or daily_budget_cents >= 0),
  notes         text,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

create index campaigns_active on public.campaigns (status, started_on desc);

create trigger campaigns_touch before update on public.campaigns
  for each row execute function public.touch_updated_at();

/*
 * La spesa, giorno per giorno.
 *
 * Giornaliera e non totale perché "quanto abbiamo speso questo mese" e
 * "quanto costava un lead a luglio" sono la stessa domanda posta su due
 * finestre diverse, e un totale non si può ritagliare.
 */
create table public.campaign_daily_stats (
  id          uuid primary key default gen_random_uuid(),
  campaign_id uuid not null references public.campaigns (id) on delete cascade,
  day         date not null,
  spend_cents integer not null default 0 check (spend_cents >= 0),
  impressions integer not null default 0,
  clicks      integer not null default 0,
  -- I lead dichiarati dalla piattaforma. Non sono i nostri: servono a
  -- accorgersi quando i due numeri divergono, ed è quasi sempre un
  -- problema di tracciamento.
  platform_leads integer not null default 0,
  created_at  timestamptz not null default now(),
  unique (campaign_id, day)
);

create index campaign_stats_by_day on public.campaign_daily_stats (day desc);

-- ── Creatività ────────────────────────────────────────────────────
/*
 * La singola creatività, con l'angolo che prova.
 *
 * `hook` e `angle` non sono metadati decorativi: sono le due variabili
 * che spiegano perché una creatività converte e un'altra no, e sono ciò
 * che il Content Brain rilegge quando gli si chiede tre script nuovi
 * sulla base di quelli che hanno funzionato.
 */
create table public.creatives (
  id           uuid primary key default gen_random_uuid(),
  campaign_id  uuid references public.campaigns (id) on delete cascade,
  external_ref text,
  name         text not null,
  format       text,
  hook         text,
  angle        text,
  asset_url    text,
  is_active    boolean not null default true,
  created_at   timestamptz not null default now()
);

create table public.creative_daily_stats (
  id           uuid primary key default gen_random_uuid(),
  creative_id  uuid not null references public.creatives (id) on delete cascade,
  day          date not null,
  spend_cents  integer not null default 0 check (spend_cents >= 0),
  impressions  integer not null default 0,
  clicks       integer not null default 0,
  platform_leads integer not null default 0,
  -- Per i video: quanti arrivano in fondo. Dice più del numero di viste.
  thruplays    integer not null default 0,
  created_at   timestamptz not null default now(),
  unique (creative_id, day)
);

-- ── Contenuti organici ────────────────────────────────────────────
/*
 * Reel, caroselli, articoli, newsletter.
 *
 * Vivono qui e non fra le creatività perché non hanno una spesa: il loro
 * costo è il tempo di chi li fa, e il loro rendimento si misura in
 * attenzione e in persone che scrivono.
 */
create table public.content_pieces (
  id            uuid primary key default gen_random_uuid(),
  channel       campaign_channel not null default 'organic',
  format        text not null,
  title         text not null,
  hook          text,
  angle         text,
  topic         text,
  url           text,
  published_on  date,
  views         integer not null default 0,
  reach         integer not null default 0,
  likes         integer not null default 0,
  comments      integer not null default 0,
  saves         integer not null default 0,
  shares        integer not null default 0,
  -- Le persone che hanno scritto o prenotato dopo questo contenuto.
  leads_attributed integer not null default 0,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

create index content_by_performance
  on public.content_pieces (published_on desc);

create trigger content_pieces_touch before update on public.content_pieces
  for each row execute function public.touch_updated_at();

-- ── Il lead sa da dove viene ──────────────────────────────────────
alter table public.leads
  add column if not exists campaign_id uuid references public.campaigns (id) on delete set null,
  add column if not exists creative_id uuid references public.creatives (id) on delete set null;

create index if not exists leads_by_campaign_id on public.leads (campaign_id)
  where campaign_id is not null;

comment on column public.leads.campaign_id is
  'Attribuzione al primo contatto: la campagna che ha prodotto il lead. Chi lo ha convinto dopo non si sa, e fingere di saperlo sarebbe peggio.';

-- ── Contenuti generati ────────────────────────────────────────────
/*
 * Ciò che il Content Brain scrive.
 *
 * Si conserva insieme alla richiesta, al modello e alle voci di
 * knowledge base su cui è stato costruito. Serve a due cose: rileggere a
 * distanza di mesi perché un contenuto diceva una certa frase, e
 * accorgersi quando il brand book cambia e i contenuti vecchi non lo
 * rispettano più.
 */
create table public.generated_contents (
  id           uuid primary key default gen_random_uuid(),
  kind         text not null,
  brief        text not null,
  title        text,
  output       jsonb not null default '{}'::jsonb,
  -- Gli slug delle voci di knowledge base usate, con la loro versione.
  sources      jsonb not null default '[]'::jsonb,
  model        text,
  created_by   uuid references public.profiles (id) on delete set null,
  campaign_id  uuid references public.campaigns (id) on delete set null,
  approved_at  timestamptz,
  approved_by  uuid references public.profiles (id) on delete set null,
  published_content_id uuid references public.content_pieces (id) on delete set null,
  created_at   timestamptz not null default now()
);

create index generated_recent on public.generated_contents (created_at desc);

-- ── Chi legge, chi scrive ─────────────────────────────────────────
alter table public.campaigns             enable row level security;
alter table public.campaign_daily_stats  enable row level security;
alter table public.creatives             enable row level security;
alter table public.creative_daily_stats  enable row level security;
alter table public.content_pieces        enable row level security;
alter table public.generated_contents    enable row level security;

create policy campaigns_read on public.campaigns
  for select using (public.is_staff() or public.is_marketing());
create policy campaigns_write on public.campaigns
  for all using (public.is_staff() or public.is_marketing())
  with check (public.is_staff() or public.is_marketing());

create policy campaign_stats_read on public.campaign_daily_stats
  for select using (public.is_staff() or public.is_marketing());
create policy campaign_stats_write on public.campaign_daily_stats
  for all using (public.is_staff() or public.is_marketing())
  with check (public.is_staff() or public.is_marketing());

create policy creatives_read on public.creatives
  for select using (public.is_staff() or public.is_marketing());
create policy creatives_write on public.creatives
  for all using (public.is_staff() or public.is_marketing())
  with check (public.is_staff() or public.is_marketing());

create policy creative_stats_read on public.creative_daily_stats
  for select using (public.is_staff() or public.is_marketing());
create policy creative_stats_write on public.creative_daily_stats
  for all using (public.is_staff() or public.is_marketing())
  with check (public.is_staff() or public.is_marketing());

create policy content_read on public.content_pieces
  for select using (public.is_internal());
create policy content_write on public.content_pieces
  for all using (public.is_staff() or public.is_marketing())
  with check (public.is_staff() or public.is_marketing());

create policy generated_read on public.generated_contents
  for select using (public.is_staff() or public.is_marketing());
create policy generated_write on public.generated_contents
  for all using (public.is_staff() or public.is_marketing())
  with check (public.is_staff() or public.is_marketing());

-- ── Attribuzione ──────────────────────────────────────────────────
/*
 * Cosa ha prodotto ciascuna campagna.
 *
 * Security definer, e non una vista, per una ragione precisa: il
 * marketing non ha — e non deve avere — accesso ai pazienti e ai
 * pagamenti. Ma deve poter sapere quanto valore ha generato una
 * campagna. Qui escono solo numeri aggregati per campagna: nessun nome,
 * nessuna riga di paziente, nessun importo singolo.
 *
 * L'attribuzione è al **primo contatto**: la campagna che ha prodotto il
 * lead si prende il paziente. Chi lo ha convinto dopo non lo sappiamo, e
 * un modello multi-touch inventato sarebbe peggio di un modello semplice
 * dichiarato.
 */
create or replace function public.campaign_attribution(
  p_from date default null,
  p_to   date default null
)
returns table (
  campaign_id   uuid,
  leads         integer,
  qualified     integer,
  booked        integer,
  patients      integer,
  members       integer,
  revenue_cents bigint
)
language sql
stable
security definer
set search_path = public
as $fn$
  select
    l.campaign_id,
    count(*)::integer                                                          as leads,
    count(*) filter (where l.qualified_at is not null)::integer                as qualified,
    count(*) filter (where l.booked_at is not null)::integer                   as booked,
    count(*) filter (where l.patient_id is not null)::integer                  as patients,
    count(*) filter (where m.id is not null)::integer                          as members,
    coalesce(sum(p.incassato), 0)::bigint                                      as revenue_cents
  from public.leads l
  left join lateral (
    select mm.id
    from public.memberships mm
    where mm.patient_id = l.patient_id
    order by mm.starts_on asc
    limit 1
  ) m on true
  left join lateral (
    select sum(pp.amount_cents) as incassato
    from public.payments pp
    where pp.patient_id = l.patient_id and pp.status = 'paid'
  ) p on true
  where (public.is_staff() or public.is_marketing())
    and l.campaign_id is not null
    and (p_from is null or l.first_seen_at >= p_from::timestamptz)
    and (p_to   is null or l.first_seen_at <  (p_to + 1)::timestamptz)
  group by l.campaign_id;
$fn$;

comment on function public.campaign_attribution(date, date) is
  'Numeri aggregati per campagna. Security definer perché il marketing non vede pazienti e pagamenti, ma deve poter vedere quanto valore ha generato una campagna.';

/*
 * La qualità dei pazienti che una campagna porta.
 *
 * "Quale campagna porta i pazienti migliori" non si risponde con il
 * numero dei lead: si risponde con quanto restano e quanto valgono. Qui
 * escono le tre misure che lo dicono — punteggio medio di partenza,
 * visite svolte, valore medio — sempre aggregate.
 */
create or replace function public.campaign_patient_quality(
  p_from date default null,
  p_to   date default null
)
returns table (
  campaign_id     uuid,
  patients        integer,
  avg_visits      numeric,
  avg_revenue_cents numeric,
  members_ratio   numeric
)
language sql
stable
security definer
set search_path = public
as $fn$
  select
    l.campaign_id,
    count(distinct l.patient_id)::integer as patients,
    coalesce(avg(v.visite), 0)            as avg_visits,
    coalesce(avg(p.incassato), 0)         as avg_revenue_cents,
    case when count(distinct l.patient_id) = 0 then 0
         else count(distinct m.patient_id)::numeric / count(distinct l.patient_id)
    end                                   as members_ratio
  from public.leads l
  left join lateral (
    select count(*)::numeric as visite
    from public.appointments a
    where a.patient_id = l.patient_id and a.status = 'completed'
  ) v on true
  left join lateral (
    select coalesce(sum(pp.amount_cents), 0)::numeric as incassato
    from public.payments pp
    where pp.patient_id = l.patient_id and pp.status = 'paid'
  ) p on true
  left join public.memberships m
    on m.patient_id = l.patient_id and m.status in ('active', 'past_due')
  where (public.is_staff() or public.is_marketing())
    and l.campaign_id is not null
    and l.patient_id is not null
    and (p_from is null or l.first_seen_at >= p_from::timestamptz)
    and (p_to   is null or l.first_seen_at <  (p_to + 1)::timestamptz)
  group by l.campaign_id;
$fn$;
