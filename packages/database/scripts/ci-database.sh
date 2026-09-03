#!/usr/bin/env bash
# =============================================================================
# ci-database.sh — build the same database CI needs, from empty
# =============================================================================
# Stubs the Supabase-provided roles and schemas, applies every migration in
# order, sets the app_user password, and loads BOTH fixtures.
#
# ONE script, called by every workflow that needs a database, because two
# workflows each carrying their own copy is two databases that drift — and
# they already had. `database.yml` stubbed a two-column `auth.users` and loaded
# only `mock-data.sql`, while `supabase db reset` locally loads `mock-data.sql`
# AND `dev-users.sql` (supabase/config.toml `[db.seed] sql_paths`). CI was
# therefore building a database with no `profiles` and no `stripe_customers`,
# and `fixtures are complete` failed on every push for exactly that reason —
# the second form of the sql_paths trap CLAUDE.md names: not a wrong path, a
# missing one.
#
# Uses PGHOST/PGUSER/... from the environment, like the workflows do.
#
#   packages/database/scripts/ci-database.sh
# =============================================================================
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../.." && pwd)"
cd "$ROOT"

say() { echo "→ $*"; }

# -----------------------------------------------------------------------------
# 1. What Supabase provides and vanilla Postgres does not
# -----------------------------------------------------------------------------
# The migrations and the fixtures reference these, so they must exist first.
# `auth.users` is stubbed with the columns `dev-users.sql` actually writes —
# a two-column stub is why that fixture could not be loaded in CI at all.
say "bootstrapping Supabase roles, schemas and stubs"
psql -v ON_ERROR_STOP=1 -q <<'SQL'
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
SQL

# -----------------------------------------------------------------------------
# 2. Every migration, in order, from empty
# -----------------------------------------------------------------------------
# This step IS the migration test: one that is not replayable fails here.
say "applying migrations"
for f in supabase/migrations/*.sql; do
  echo "   $(basename "$f")"
  psql -v ON_ERROR_STOP=1 -q -f "$f"
done

# -----------------------------------------------------------------------------
# 3. The application role's password
# -----------------------------------------------------------------------------
# Set out of band, never in a migration (20260827000002 says so). `./setup`
# does this locally; CI has no ./setup, and the app's own test suite connects
# on APP_DATABASE_URL as this role.
say "setting the app_user password (local/CI demo credential)"
psql -v ON_ERROR_STOP=1 -q -c "ALTER ROLE app_user WITH PASSWORD 'app_user'"
# PG16+ splits membership into ADMIN/INHERIT/SET, and SET is what `SET ROLE`
# needs. verify-rls.sql grants this itself; doing it here too means the
# row-visibility suite does not depend on the order the suites happen to run.
psql -v ON_ERROR_STOP=1 -q -c "GRANT app_user TO CURRENT_USER WITH SET TRUE"

# -----------------------------------------------------------------------------
# 4. The fixtures — BOTH, in the order supabase/config.toml specifies
# -----------------------------------------------------------------------------
# ORDER MATTERS: dev-users.sql derives auth.users from the tenant_users rows
# mock-data.sql seeds, so auth.users.id equals tenant_users.user_id by
# construction. It also seeds `profiles` and `stripe_customers`, which is why
# omitting it made `fixtures are complete` fail.
say "loading fixtures"
psql -v ON_ERROR_STOP=1 -q -f packages/database/fixtures/mock-data.sql
psql -v ON_ERROR_STOP=1 -q -f packages/database/fixtures/dev-users.sql

say "database ready"
