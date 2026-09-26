-- What the Supabase platform provides and plain Postgres does not, so the
-- migrations apply to a throwaway database (scripts/provision-tenant.mjs
-- --vanilla). Copied from the bootstrap in
-- packages/database/scripts/ci-database.sh, minus its migration-ledger stub;
-- when one changes, change the other. Never run against a real Supabase project.

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='supabase_auth_admin')
    THEN CREATE ROLE supabase_auth_admin NOLOGIN; END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='authenticated')
    THEN CREATE ROLE authenticated NOLOGIN; END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='anon')
    THEN CREATE ROLE anon NOLOGIN; END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='service_role')
    THEN CREATE ROLE service_role NOLOGIN; END IF;
END $$;

-- pgcrypto lives in `extensions` on Supabase, and dev-users.sql calls
-- extensions.crypt()/gen_salt() by that qualified name.
CREATE SCHEMA IF NOT EXISTS extensions;
CREATE EXTENSION IF NOT EXISTS pgcrypto SCHEMA extensions;

CREATE SCHEMA IF NOT EXISTS auth;

-- The columns dev-users.sql writes, plus the ones GoTrue would supply.
CREATE TABLE IF NOT EXISTS auth.users (
  instance_id            uuid,
  id                     uuid PRIMARY KEY,
  aud                    varchar(255),
  role                   varchar(255),
  email                  varchar(255),
  encrypted_password     varchar(255),
  email_confirmed_at     timestamptz,
  raw_app_meta_data      jsonb,
  raw_user_meta_data     jsonb,
  created_at             timestamptz,
  updated_at             timestamptz,
  confirmation_token     varchar(255),
  recovery_token         varchar(255),
  email_change_token_new varchar(255),
  email_change           varchar(255)
);

CREATE TABLE IF NOT EXISTS auth.identities (
  provider_id      text NOT NULL,
  user_id          uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  identity_data    jsonb NOT NULL,
  provider         text NOT NULL,
  last_sign_in_at  timestamptz,
  created_at       timestamptz,
  updated_at       timestamptz,
  PRIMARY KEY (provider_id, provider)
);

-- auth.uid() and auth.jwt() are Supabase-provided, and the CMSaasStarter
-- migration uses auth.uid() in its policies — without these it cannot apply,
-- which is why CI once globbed only 2026*.sql and built a DIFFERENT database.
CREATE OR REPLACE FUNCTION auth.uid() RETURNS uuid
  LANGUAGE sql STABLE AS $fn$
    SELECT nullif(current_setting('request.jwt.claims', true)::jsonb ->> 'sub', '')::uuid
  $fn$;
CREATE OR REPLACE FUNCTION auth.jwt() RETURNS jsonb
  LANGUAGE sql STABLE AS $fn$
    SELECT coalesce(nullif(current_setting('request.jwt.claims', true), '')::jsonb, '{}'::jsonb)
  $fn$;

-- Minimal Storage stubs. We never read Storage from the database, but the
-- CMSaasStarter migration registers a bucket and policies on storage.objects,
-- and it has to apply for CI to build the same schema as `supabase db reset`.
CREATE SCHEMA IF NOT EXISTS storage;
CREATE TABLE IF NOT EXISTS storage.buckets (
  id text PRIMARY KEY, name text NOT NULL, public boolean DEFAULT false);
CREATE TABLE IF NOT EXISTS storage.objects (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  bucket_id text REFERENCES storage.buckets(id),
  name text, owner uuid);
ALTER TABLE storage.objects ENABLE ROW LEVEL SECURITY;

-- `storage.foldername(name)` — the real Supabase Storage extension function,
-- reproduced here rather than stubbed away, since 20260921030000 (tenant
-- logo) and 20260922090000 (documents) both key an RLS policy on
-- `(storage.foldername(name))[1]` to scope an object by its leading path
-- segment. Splits on '/' and returns every segment except the filename.
CREATE OR REPLACE FUNCTION storage.foldername(name text) RETURNS text[]
  LANGUAGE plpgsql AS $fn$
  DECLARE
    _parts text[];
  BEGIN
    SELECT string_to_array(name, '/') INTO _parts;
    RETURN _parts[1 : array_length(_parts, 1) - 1];
  END
  $fn$;
