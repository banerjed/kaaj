#!/usr/bin/env bash
# verify-remote.sh — READ-ONLY. Confirm, against a live database, that the
# migrations ran and the mock data landed.
#
#   ./scripts/verify-remote.sh "postgresql://postgres:<pw>@db.<ref>.supabase.co:5432/postgres"
#   SUPABASE_DB_URL=... ./scripts/verify-remote.sh
#
# Safe to point at production: the connection forces
# default_transaction_read_only, and check 0 aborts if that did not take. This
# script never writes, seeds, or creates anything.
#
# Exit codes
#   0  everything verified
#   1  a check failed
#   2  checks passed, but tenant isolation could NOT be verified because the
#      connecting role bypasses RLS (see check 1)

set -uo pipefail

DB_URL="${1:-${SUPABASE_DB_URL:-}}"
if [ -z "$DB_URL" ]; then
  echo "usage: $0 <postgres-connection-url>    (or set SUPABASE_DB_URL)" >&2
  echo >&2
  echo "Find it in the Supabase dashboard: Project Settings > Database >" >&2
  echo "Connection string > URI. Use the direct connection on port 5432." >&2
  exit 64
fi

# Force read-only on the CONNECTION, not with a statement: a session-level SET
# can be undone later, a connection option cannot.
case "$DB_URL" in
  *\?*) RO_URL="${DB_URL}&options=-c%20default_transaction_read_only%3Don" ;;
  *)    RO_URL="${DB_URL}?options=-c%20default_transaction_read_only%3Don" ;;
esac

ROOT_DOCS="$(cd "$(dirname "${BASH_SOURCE[0]}")/../docs/data-models" 2>/dev/null && pwd)"

q() { psql "$RO_URL" -X -q -t -A -v ON_ERROR_STOP=1 -c "$1" 2>&1; }

pass() { printf '  pass  %s\n' "$1"; }
fail() { printf '  FAIL  %s\n' "$1"; FAILED=$((FAILED+1)); }
FAILED=0
ISOLATION_UNVERIFIED=0

echo "==> connecting"
SRV="$(q "select version();")" || { echo "  FAIL  cannot connect: $SRV"; exit 1; }
echo "  $(echo "$SRV" | cut -c1-60)..."

# ---- check 0: the read-only guard actually took -----------------------------
RO="$(q "select current_setting('transaction_read_only');")"
if [ "$RO" != "on" ]; then
  echo "  FAIL  connection is NOT read-only (got '$RO') — aborting rather than"
  echo "        touching a live database with an unguarded session."
  exit 1
fi
pass "connection is read-only"

# ---- check 1: can this role even observe RLS? -------------------------------
WHO="$(q "select current_user;")"
BYPASS="$(q "select rolbypassrls or rolsuper from pg_roles where rolname = current_user;")"
if [ "$BYPASS" = "t" ]; then
  echo "  NOTE  connected as '$WHO', which BYPASSES RLS."
  echo "        Structural checks below are still valid. Tenant isolation is NOT"
  echo "        verifiable from this role — every query returns every row, so an"
  echo "        isolation check would pass while proving nothing."
  echo "        Re-run as app_user to verify isolation."
  ISOLATION_UNVERIFIED=1
else
  pass "connected as '$WHO', which is subject to RLS"
fi

# ---- migration history ------------------------------------------------------
echo
echo "==> did the migrations actually run?"
# to_regclass sees the object regardless of column privileges; the SELECT that
# follows may still be denied, and "denied" means something different from
# "absent" — as app_user the table is simply not readable.
HIST="$(q "select case when to_regclass('supabase_migrations.schema_migrations')
                       is null then '0' else '1' end;")"
if [ "$HIST" = "1" ]; then
  APPLIED="$(q "select string_agg(version, ', ' order by version)
                  from supabase_migrations.schema_migrations
                 where version like '20260827%';")"
  case "$APPLIED" in
    *"permission denied"*)
      echo "  NOTE  migration history exists but '$WHO' may not read it."
      echo "        Re-run as postgres to confirm which migrations were applied." ;;
    "")
      fail "migration history table exists but has no 20260827* rows" ;;
    *)
      pass "CLI migration history records: $APPLIED" ;;
  esac
elif [ "$BYPASS" != "t" ]; then
  # to_regclass returns NULL when the role lacks USAGE on the schema, which is
  # indistinguishable from the table not existing. Do not report absence here.
  echo "  NOTE  migration history not visible to '$WHO' (it lacks USAGE on the"
  echo "        supabase_migrations schema). Re-run as postgres to check it."
else
  echo "  NOTE  no supabase_migrations.schema_migrations table, and '$WHO' would"
  echo "        be able to see one. The schema may still be correct, but it was"
  echo "        not applied by 'supabase db push' — check the structure below."
fi

# ---- structure --------------------------------------------------------------
echo
echo "==> structure"
check_num() {  # label, sql, expected
  local got; got="$(q "$2")"
  [ "$got" = "$3" ] && pass "$1 ($got)" || fail "$1 — got '$got', want '$3'"
}

check_num "98 tables" \
  "select count(*) from pg_tables where schemaname='public';" 98
check_num "RLS forced on every table" \
  "select count(*) from pg_class c join pg_namespace n on n.oid=c.relnamespace
    where n.nspname='public' and c.relkind='r' and not c.relforcerowsecurity;" 0
check_num "no NOT NULL timestamp without a default" \
  "select count(*) from information_schema.columns
    where table_schema='public' and column_name in ('created_at','updated_at')
      and is_nullable='NO' and column_default is null;" 0
check_num "updated_at triggers attached" \
  "select count(*) from pg_trigger where not tgisinternal and tgname like '%_updated_at';" 82
check_num "access token hook exists" \
  "select count(*) from pg_proc p join pg_namespace n on n.oid=p.pronamespace
    where p.proname='custom_access_token_hook' and n.nspname='public';" 1
check_num "hook can read tenant_users (the deadlock fix)" \
  "select count(*) from pg_policies
    where tablename='tenant_users' and policyname='auth_admin_reads_memberships';" 1
# has_*_privilege, not information_schema: role_usage_grants covers domains and
# sequences, never schemas, so it reports 0 even when the GRANT is in place.
check_num "app_user exists" \
  "select count(*) from pg_roles where rolname='app_user';" 1
check_num "app_user has USAGE on schema app" \
  "select case when exists (select 1 from pg_roles where rolname='app_user')
            then has_schema_privilege('app_user','app','USAGE')::int else -1 end;" 1
check_num "app_user can SELECT employees" \
  "select case when exists (select 1 from pg_roles where rolname='app_user')
            then has_table_privilege('app_user','employees','SELECT')::int else -1 end;" 1
check_num "Data API stays closed (no grants to anon/authenticated)" \
  "select count(*) from information_schema.role_table_grants
    where table_schema='public' and grantee in ('anon','authenticated');" 0

# ---- mock data --------------------------------------------------------------
echo
echo "==> mock data (Northwind Consulting)"
# Northwind's tenant_id is a fixed literal in mock-data.sql, not generated.
# It must be read WITH the claim set: as a role subject to RLS, an unset claim
# hides the rows, and "0 rows" would look identical to "never loaded".
NW_TID="$(grep -oE "'[0-9a-f-]{36}', 'northwind'" "$FIXTURES/mock-data.sql" 2>/dev/null \
          | head -1 | cut -d"'" -f2)"
NW_TID="${NW_TID:-07fb03f8-1521-5ef4-9c2d-25fcfa297ac1}"

CLAIM="set local request.jwt.claims = '{\"app_metadata\":{\"tenant_id\":\"$NW_TID\"}}';"
qt() { psql "$RO_URL" -X -q -t -A -v ON_ERROR_STOP=1 \
         -c "begin; $CLAIM $1 commit;" 2>&1 | head -1; }

NW="$(qt "select count(*) from tenants where subdomain='northwind';")"
if [ "$NW" != "1" ]; then
  echo "  NOTE  no 'northwind' tenant visible — mock data has not been loaded."
  echo "        (checked with the tenant claim set, so this is not an RLS artefact)"
  echo "        Load it with:"
  echo "          psql \"\$SUPABASE_DB_URL\" -f docs/data-models/mock-data.sql"
else
  pass "tenant present, id=$NW_TID"
  for row in "employees:12" "invoices:5" "payroll_runs:4" \
             "time_tracking_entries:9" "journal_entry_lines:17"; do
    tbl="${row%%:*}"; want="${row##*:}"
    got="$(qt "select count(*) from $tbl where tenant_id='$NW_TID';")"
    [ "$got" = "$want" ] && pass "$tbl ($got)" || fail "$tbl — got '$got', want '$want'"
  done
fi

# ---- isolation, only if the role can actually see it ------------------------
echo
echo "==> tenant isolation"
if [ "$ISOLATION_UNVERIFIED" = 1 ]; then
  echo "  SKIPPED — '$WHO' bypasses RLS. This is NOT a pass."
else
  TOTAL="$(q "select count(*) from employees;")"
  pass "with no tenant claim set, employees returns $TOTAL row(s) (expect 0)"
  [ "$TOTAL" = "0" ] || fail "expected 0 rows without a claim, got $TOTAL"
fi

echo
if [ "$FAILED" -gt 0 ]; then
  echo "$FAILED check(s) FAILED."
  exit 1
fi
if [ "$ISOLATION_UNVERIFIED" = 1 ]; then
  echo "Structural checks passed. Tenant isolation UNVERIFIED — re-run as app_user."
  exit 2
fi
echo "All checks passed."
