-- ═══════════════════════════════════════════════════════════════════
-- Il minimo di Supabase su cui poggiano le migrazioni.
--
-- Serve solo alla verifica locale (`npm run db:verifica`): ricostruisce
-- ruoli, schema `auth` e schema `storage` così che l'errore che esce, se
-- esce, sia del nostro SQL e non dell'ambiente. Non va mai eseguito su un
-- progetto Supabase vero, dove queste cose esistono già.
-- ═══════════════════════════════════════════════════════════════════

create role anon nologin noinherit;
create role authenticated nologin noinherit;
create role service_role nologin noinherit bypassrls;
create role authenticator noinherit login;
grant anon, authenticated, service_role to authenticator;

-- ── auth ──────────────────────────────────────────────────────────
create schema if not exists auth;

create table auth.users (
  id                 uuid primary key default gen_random_uuid(),
  email              text unique,
  raw_user_meta_data jsonb default '{}'::jsonb,
  created_at         timestamptz not null default now()
);

-- In Supabase leggono il JWT della richiesta. Qui basta che esistano e
-- restituiscano il tipo giusto: le policy vengono comunque create e
-- controllate dal parser.
create or replace function auth.uid() returns uuid
  language sql stable as $$
    select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid
  $$;

create or replace function auth.role() returns text
  language sql stable as $$
    select coalesce(nullif(current_setting('request.jwt.claim.role', true), ''), 'authenticated')
  $$;

create or replace function auth.email() returns text
  language sql stable as $$
    select nullif(current_setting('request.jwt.claim.email', true), '')
  $$;

create or replace function auth.jwt() returns jsonb
  language sql stable as $$
    select coalesce(nullif(current_setting('request.jwt.claims', true), '')::jsonb, '{}'::jsonb)
  $$;

-- ── storage ───────────────────────────────────────────────────────
create schema if not exists storage;

create table storage.buckets (
  id                 text primary key,
  name               text not null,
  public             boolean not null default false,
  file_size_limit    bigint,
  allowed_mime_types text[],
  created_at         timestamptz not null default now()
);

create table storage.objects (
  id         uuid primary key default gen_random_uuid(),
  bucket_id  text references storage.buckets (id),
  name       text,
  owner      uuid,
  metadata   jsonb,
  created_at timestamptz not null default now()
);

alter table storage.objects enable row level security;

create or replace function storage.foldername(name text) returns text[]
  language sql immutable as $$ select string_to_array(name, '/') $$;

-- Come in Supabase: ciò che nasce nello schema public è leggibile dai
-- ruoli dell'API, e a decidere chi vede cosa resta la Row Level Security.
alter default privileges in schema public
  grant all on tables to anon, authenticated, service_role;
