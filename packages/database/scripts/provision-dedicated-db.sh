#!/usr/bin/env bash
# provision-dedicated-db.sh — stand up a real, separate Postgres for one demo
# tenant (Fenwick Robotics) on ADR-009's dedicated tier, and register it in
# the shared database's control plane (tenant_registry).
#
# Persistent, unlike verify-migrations.sh's throwaway cluster: running this
# script again is a no-op once the cluster and tenant already exist, so it is
# safe to re-run after a `supabase db reset` wipes the shared database's
# tenant_registry row.
#
#   packages/database/scripts/provision-dedicated-db.sh
#
# Requires postgresql@17 binaries on PATH (brew install postgresql@17 —
# same requirement as verify-migrations.sh) and the main Supabase stack
# already running (`supabase start`), since tenant_registry and tenant_users
# live in the shared database.
#
# Applies migrations matching `2026*.sql` only — the two `2024*` files are
# CMSaasStarter's legacy `profiles` table and reference the real Supabase
# platform's `auth.users`/`auth.uid()`, which a raw initdb cluster does not
# have (same reason verify-migrations.sh skips them). Every migration that is
# actually part of the product's 98-table schema (ADR-009) matches `2026*`.

set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../.." && pwd)"
MIGRATIONS="$ROOT/supabase/migrations"
PORT=54329
PGDATA_DIR="$ROOT/packages/database/.dedicated-demo-pgdata"
SOCKDIR="$ROOT/packages/database/.dedicated-demo-sock"

TENANT_ID="da5b0beb-7418-496b-95ef-6b982defcb76"
SUBDOMAIN="fenwick"
SECRET_REF="FENWICK_DEDICATED_DATABASE_URL"
APP_USER_URL="postgresql://app_user:app_user@127.0.0.1:$PORT/postgres"
OWNER_URL="postgresql://postgres:postgres@127.0.0.1:$PORT/postgres"
SHARED_URL="${DATABASE_URL:-postgresql://postgres:postgres@127.0.0.1:54322/postgres}"

DEMO_USER_ID="394aba93-ba7d-44e9-9985-72c743989052"
DEMO_EMPLOYEE_ID="3640322e-b637-4f1f-ad52-ad491bc9132d"
DEMO_EMAIL="priya.desai@fenwick.example"
DEMO_NAME="Priya Desai"

command -v initdb >/dev/null 2>&1 || {
  echo "initdb not found. brew install postgresql@17 and put it on PATH." >&2
  exit 1
}

# --- 1. the dedicated cluster, persistent -----------------------------------
if ! pg_isready -h 127.0.0.1 -p "$PORT" >/dev/null 2>&1; then
  echo "==> starting Fenwick's dedicated cluster on :$PORT (persistent)"
  mkdir -p "$SOCKDIR"
  # initdb only on a genuinely fresh PGDATA_DIR — a stopped-but-already-
  # initialized cluster (reboot, laptop sleep) must not re-run it, or it
  # dies on "directory ... exists but is not empty".
  [ -d "$PGDATA_DIR/base" ] || initdb -D "$PGDATA_DIR" -U postgres --auth=trust >/dev/null
  pg_ctl -D "$PGDATA_DIR" \
    -o "-p $PORT -k $SOCKDIR -c listen_addresses=127.0.0.1" \
    -l "$PGDATA_DIR/pg.log" start >/dev/null
  for _ in $(seq 1 20); do
    pg_isready -h 127.0.0.1 -p "$PORT" >/dev/null 2>&1 && break
    sleep 0.5
  done
else
  echo "==> Fenwick's cluster is already running on :$PORT"
fi

psql_owner() { psql "$OWNER_URL" -X "$@"; }

# --- 2. migrate, once ---------------------------------------------------------
if psql_owner -tAc "SELECT to_regclass('public.tenants')" | grep -q tenants; then
  echo "==> already migrated — skipping"
else
  echo "==> roles the real Supabase platform provides that vanilla Postgres does not"
  psql_owner -q -c "
    CREATE ROLE supabase_auth_admin NOLOGIN;
    CREATE ROLE authenticated NOLOGIN;
    CREATE ROLE anon NOLOGIN;"

  echo "==> applying migrations"
  for f in "$MIGRATIONS"/2026*.sql; do
    printf '    %s ... ' "$(basename "$f")"
    psql_owner -q -v ON_ERROR_STOP=1 -f "$f" >/dev/null
    echo ok
  done

  echo "==> app_user password (local demo credential, matches ./setup)"
  psql_owner -q -c "ALTER ROLE app_user WITH PASSWORD 'app_user'"

  echo "==> seeding Fenwick's business data"
  psql_owner -q -v ON_ERROR_STOP=1 \
    -f "$ROOT/packages/database/fixtures/dedicated-demo-tenant.sql"
fi

LATEST_MIGRATION="$(basename "$(ls "$MIGRATIONS"/2026*.sql | tail -1)" .sql | cut -d_ -f1)"

# --- 3. register with the control plane, in the SHARED database ------------
echo "==> registering Fenwick in tenant_registry (shared database)"
psql "$SHARED_URL" -X -q -v ON_ERROR_STOP=1 -v tenant_id="'$TENANT_ID'" \
  -v subdomain="'$SUBDOMAIN'" -v secret_ref="'$SECRET_REF'" \
  -v schema_version="'$LATEST_MIGRATION'" -v company_name="'Fenwick Robotics'" \
  -v user_id="'$DEMO_USER_ID'" -v email="'$DEMO_EMAIL'" -v name="'$DEMO_NAME'" \
  <<'SQL'
BEGIN;

-- The tenant's own row lives centrally too — every tier needs one, since
-- tenant_registry.tenant_id REFERENCES tenants(id) (ADR-009's consequence
-- that "the routing registry is separate and central" from the tenant's
-- own business data, which is what actually moved to the dedicated database).
INSERT INTO tenants (id, subdomain, company_name, is_active)
VALUES (:tenant_id, :subdomain, :company_name, TRUE)
ON CONFLICT (id) DO NOTHING;

INSERT INTO tenant_registry (tenant_id, subdomain, tier, connection_secret_ref, schema_version, status)
VALUES (:tenant_id, :subdomain, 'dedicated', :secret_ref, :schema_version, 'active')
ON CONFLICT (tenant_id) DO UPDATE SET
    schema_version = EXCLUDED.schema_version,
    status = 'active',
    last_health_check_at = now();

INSERT INTO tenant_users (tenant_id, user_id, employee_id, role, is_active, is_default_tenant)
VALUES (:tenant_id, :user_id, :user_id, 'owner', TRUE, TRUE)
ON CONFLICT (tenant_id, user_id) DO NOTHING;

-- Mirrors dev-users.sql's shape, but explicit rather than derived from a
-- join against employees — Fenwick's employees table is in the OTHER
-- database, unreachable from here.
INSERT INTO auth.users (
    instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
    raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
    confirmation_token, recovery_token, email_change_token_new, email_change
) VALUES (
    '00000000-0000-0000-0000-000000000000', :user_id, 'authenticated', 'authenticated',
    :email, extensions.crypt('devpassword', extensions.gen_salt('bf')), now(),
    jsonb_build_object('provider', 'email', 'providers', jsonb_build_array('email')),
    jsonb_build_object('full_name', :name, 'kaaj_role', 'owner'),
    now(), now(), '', '', '', ''
) ON CONFLICT (id) DO NOTHING;

INSERT INTO auth.identities (
    provider_id, user_id, identity_data, provider, last_sign_in_at, created_at, updated_at
) VALUES (
    :user_id::text, :user_id,
    jsonb_build_object('sub', (:user_id)::text, 'email', :email, 'email_verified', true, 'phone_verified', false),
    'email', now(), now(), now()
) ON CONFLICT (provider_id, provider) DO NOTHING;

COMMIT;
SQL

echo ""
echo "==> done"
echo "    Fenwick Robotics (fenwick) — dedicated database on 127.0.0.1:$PORT"
echo "    Log in as $DEMO_EMAIL / devpassword"
echo ""
echo "    Add this to apps/web/.env.local if it is not already there:"
echo ""
echo "    $SECRET_REF=$APP_USER_URL"
echo ""
