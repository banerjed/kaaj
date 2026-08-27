#!/usr/bin/env bash
# verify-migrations.sh — apply every migration to a throwaway Postgres and prove
# the tenancy guarantees actually hold.
#
# Reading the DDL is not enough: the four defects this harness checks for were
# all invisible on the page and fatal on first contact. Run it after any change
# to the schema or to a migration.
#
#   ./scripts/verify-migrations.sh                # uses a temp cluster
#   PGPORT=55432 ./scripts/verify-migrations.sh   # reuse a running one
#
# Requires postgresql@17 binaries on PATH (brew install postgresql@17).

set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
MIGRATIONS="$ROOT/app/supabase/migrations"
PORT="${PGPORT:-55432}"
DB=kaaj_verify
OWN_CLUSTER=0
PGDATA_DIR="$(mktemp -d "${TMPDIR:-/tmp}/kaajpg.XXXX")"
SOCKDIR="$(mktemp -d /tmp/kpg.XXXX)"   # short path: the socket name has a 103-byte limit

cleanup() {
  if [ "$OWN_CLUSTER" = 1 ]; then
    pg_ctl -D "$PGDATA_DIR" stop -m immediate >/dev/null 2>&1 || true
  fi
  rm -rf "$PGDATA_DIR" "$SOCKDIR"
}
trap cleanup EXIT

if ! pg_isready -h 127.0.0.1 -p "$PORT" >/dev/null 2>&1; then
  echo "==> starting a throwaway cluster on :$PORT"
  initdb -D "$PGDATA_DIR" -U postgres --auth=trust >/dev/null
  pg_ctl -D "$PGDATA_DIR" \
    -o "-p $PORT -k $SOCKDIR -c listen_addresses=127.0.0.1" \
    -l "$PGDATA_DIR/pg.log" start >/dev/null
  OWN_CLUSTER=1
  for _ in $(seq 1 20); do
    pg_isready -h 127.0.0.1 -p "$PORT" >/dev/null 2>&1 && break
    sleep 0.5
  done
fi

psql() { command psql -h 127.0.0.1 -p "$PORT" -U postgres "$@"; }

echo "==> recreating $DB"
psql -q -c "DROP DATABASE IF EXISTS $DB;" -c "CREATE DATABASE $DB;"

# Roles Supabase provides that vanilla Postgres does not.
psql -q -d "$DB" -c "
  CREATE ROLE supabase_auth_admin NOLOGIN;
  CREATE ROLE authenticated NOLOGIN;
  CREATE ROLE anon NOLOGIN;"

echo "==> applying migrations"
for f in "$MIGRATIONS"/20260827*.sql; do
  printf '    %s ... ' "$(basename "$f")"
  psql -q -d "$DB" -v ON_ERROR_STOP=1 -f "$f" >/dev/null
  echo ok
done

echo "==> assertions"
psql -d "$DB" -v ON_ERROR_STOP=1 -q <<'SQL'
\set QUIET on
\pset tuples_only on
\pset format unaligned

CREATE OR REPLACE FUNCTION pg_temp.check(label text, got anyelement, want anyelement)
RETURNS void LANGUAGE plpgsql AS $$
BEGIN
    IF got IS DISTINCT FROM want THEN
        RAISE EXCEPTION 'FAIL  % — got %, want %', label, got, want;
    END IF;
    RAISE NOTICE 'pass  %', label;
END;
$$;

-- ---- structural ----------------------------------------------------------
SELECT pg_temp.check('98 tables',
  (SELECT count(*)::int FROM pg_tables WHERE schemaname='public'), 98);

SELECT pg_temp.check('RLS forced on every table',
  (SELECT count(*)::int FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
    WHERE n.nspname='public' AND c.relkind='r' AND NOT c.relforcerowsecurity), 0);

SELECT pg_temp.check('no NOT NULL timestamp without a default',
  (SELECT count(*)::int FROM information_schema.columns
    WHERE table_schema='public' AND column_name IN ('created_at','updated_at')
      AND is_nullable='NO' AND column_default IS NULL), 0);

SELECT pg_temp.check('updated_at trigger on every table that has the column',
  (SELECT count(*)::int FROM information_schema.columns c
     JOIN information_schema.tables t
       ON t.table_schema=c.table_schema AND t.table_name=c.table_name
    WHERE c.table_schema='public' AND c.column_name='updated_at'
      AND t.table_type='BASE TABLE'
      AND NOT EXISTS (SELECT 1 FROM pg_trigger g
                       WHERE g.tgrelid = (quote_ident(c.table_name))::regclass
                         AND g.tgname = 'trg_'||c.table_name||'_updated_at')), 0);

SELECT pg_temp.check('access token hook exists',
  (SELECT count(*)::int FROM pg_proc WHERE proname='custom_access_token_hook'), 1);

SELECT pg_temp.check('Data API stays closed (no grants to anon/authenticated)',
  (SELECT count(*)::int FROM information_schema.role_table_grants
    WHERE table_schema='public' AND grantee IN ('anon','authenticated')), 0);

-- ---- seed ----------------------------------------------------------------
INSERT INTO tenants (id, subdomain, company_name) VALUES
  ('11111111-1111-1111-1111-111111111111','northwind','Northwind'),
  ('33333333-3333-3333-3333-333333333333','other','Other Corp');
INSERT INTO tenant_users (tenant_id, user_id, role, is_active, is_default_tenant)
VALUES ('11111111-1111-1111-1111-111111111111',
        '22222222-2222-2222-2222-222222222222','admin',true,true);
INSERT INTO employees (tenant_id, first_name, last_name, email, start_date, created_by) VALUES
  ('11111111-1111-1111-1111-111111111111','Ada','Lovelace','ada@nw.test','2024-01-15','22222222-2222-2222-2222-222222222222'),
  ('11111111-1111-1111-1111-111111111111','Alan','Turing','alan@nw.test','2024-02-01','22222222-2222-2222-2222-222222222222'),
  ('33333333-3333-3333-3333-333333333333','Grace','Hopper','g@other.test','2024-03-01','22222222-2222-2222-2222-222222222222');

-- ---- the auth hook -------------------------------------------------------
-- Each check runs in its own transaction with SET LOCAL, which is exactly the
-- shape ADR-003 mandates per request. SET LOCAL outside a transaction is a
-- no-op that leaves the session as superuser — and a superuser bypasses RLS, so
-- the checks below would pass while proving nothing.

BEGIN;
  SET LOCAL ROLE supabase_auth_admin;
  SELECT pg_temp.check('hook stamps tenant_id into the token',
    (SELECT public.custom_access_token_hook(
       '{"user_id":"22222222-2222-2222-2222-222222222222","claims":{"app_metadata":{}}}'::jsonb)
       -> 'claims' -> 'app_metadata' ->> 'tenant_id'),
    '11111111-1111-1111-1111-111111111111');
COMMIT;

-- ---- isolation, as a NON-OWNER role --------------------------------------
-- Guard first: if this role can bypass RLS, nothing below is evidence.
SELECT pg_temp.check('app_user cannot bypass RLS',
  (SELECT rolbypassrls OR rolsuper FROM pg_roles WHERE rolname='app_user'), false);

BEGIN;
  SET LOCAL ROLE app_user;
  SET LOCAL request.jwt.claims = '{"app_metadata":{"tenant_id":"11111111-1111-1111-1111-111111111111"}}';
  SELECT pg_temp.check('sees only its own tenant (2 of 3 rows)',
    (SELECT count(*)::int FROM employees), 2);
COMMIT;

BEGIN;
  SET LOCAL ROLE app_user;
  SET LOCAL request.jwt.claims = '';
  SELECT pg_temp.check('empty claim -> 0 rows, no error',
    (SELECT count(*)::int FROM employees), 0);
COMMIT;

BEGIN;
  SET LOCAL ROLE app_user;
  SET LOCAL request.jwt.claims = 'not-json';
  SELECT pg_temp.check('malformed claim -> 0 rows, no error',
    (SELECT count(*)::int FROM employees), 0);
COMMIT;

BEGIN;
  SET LOCAL ROLE app_user;
  SET LOCAL request.jwt.claims = '{"app_metadata":{"tenant_id":"not-a-uuid"}}';
  SELECT pg_temp.check('non-uuid claim -> 0 rows, no error',
    (SELECT count(*)::int FROM employees), 0);
COMMIT;

BEGIN;
  SET LOCAL ROLE app_user;
  SET LOCAL request.jwt.claims = '{"app_metadata":{"tenant_id":"11111111-1111-1111-1111-111111111111"}}';
  UPDATE employees SET first_name='Ada A.' WHERE first_name='Ada';
  SELECT pg_temp.check('updated_at advances on UPDATE',
    (SELECT updated_at > created_at FROM employees WHERE first_name='Ada A.'), true);
COMMIT;
SQL

echo "==> cross-tenant write must be rejected"
# Capture the status explicitly: a failing INSERT here is the PASSING result,
# so the usual `if cmd` reads backwards and is easy to get wrong.
set +e
psql -d "$DB" -q -v ON_ERROR_STOP=1 -c "
    BEGIN;
      SET LOCAL ROLE app_user;
      SET LOCAL request.jwt.claims = '{\"app_metadata\":{\"tenant_id\":\"11111111-1111-1111-1111-111111111111\"}}';
      INSERT INTO employees (tenant_id, first_name, last_name, email, start_date, created_by)
      VALUES ('33333333-3333-3333-3333-333333333333','Mallory','Evil','m@evil.test','2024-01-01',
              '22222222-2222-2222-2222-222222222222');
    COMMIT;" >/dev/null 2>&1
rc=$?
set -e

if [ "$rc" -eq 0 ]; then
  echo "    FAIL  cross-tenant insert SUCCEEDED - tenant isolation is broken"
  exit 1
fi
echo "    pass  cross-tenant insert rejected by WITH CHECK (psql rc=$rc)"

echo
echo "All checks passed."
