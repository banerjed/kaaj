#!/usr/bin/env bash
# =============================================================================
# Kaaj — database structure snapshot
# =============================================================================
# Renders the live catalog as deterministic, sorted, one-fact-per-line text and
# either writes it (--generate) or diffs it against the committed copy (--check).
#
#   scripts/db-snapshot.sh --generate     # after an intended schema change
#   scripts/db-snapshot.sh --check        # CI; exits 1 with a diff on drift
#
# WHY THIS EXISTS
#   verify-rls.sql proves isolation still works. verify-stories.sql proves the
#   schema still answers the module specs. Neither notices STRUCTURE changing.
#   Adding a column, narrowing a numeric type, or dropping an index passes both.
#   This turns any such change into a reviewable diff.
#
# WHY NOT pg_dump -s
#   Ordering is not stable across versions, it emits SET/ownership preamble, and
#   one column change reflows an entire CREATE TABLE block — so the diff is
#   unreadable exactly when it matters. Everything below is generated from
#   pg_catalog with an explicit ORDER BY on every query.
#
# WHY FROM THE CATALOG, NOT FROM SQL TEXT
#   Introspection reports what the database IS. Parsing migration files reports
#   only what they SAY. The difference is the entire point.
#
# GENERATE ONLY FROM A MIGRATION-BUILT DATABASE
#   Run `supabase db reset` first. Generating from a hand-modified dev database
#   bakes your local experiments into the baseline — this bit me while building
#   the script: a manual ALTER left invoices.total as numeric(18,2) when the
#   migration says numeric(15,2), and the first snapshot recorded the wrong one.
#   --generate refuses to run if the database has uncommitted local drift it can
#   detect; beyond that, resetting first is on you.
#
# WORKFLOW
#   Change schema -> write migration -> supabase db reset -> --generate ->
#   commit the migration and the snapshot together.
#   The snapshot diff IS the schema review: a PR touching 04-policies.txt or
#   06-grants.txt gets a security look; one touching only 01-columns.txt does not.
# =============================================================================
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
OUT="$ROOT/docs/data-models/snapshot"
DB="${DATABASE_URL:-postgresql://postgres:postgres@127.0.0.1:54322/postgres}"

MODE="${1:---check}"

# Tables that are not part of the Kaaj schema. Listed, not filtered by pattern,
# so that removing them (see docs/07-app-provenance.md) is a deliberate edit.
EXCLUDE="'profiles','stripe_customers','contact_requests','schema_migrations'"

q() { psql "$DB" -X -q -t -A -F $'\t' --no-psqlrc -v ON_ERROR_STOP=1 -c "$1"; }

generate_into() {
  local dir="$1"
  mkdir -p "$dir"

  # -- 00 tables: existence and RLS posture -----------------------------------
  {
    echo "# table	rls_enabled	rls_forced"
    q "SELECT c.relname, c.relrowsecurity, c.relforcerowsecurity
         FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
        WHERE n.nspname='public' AND c.relkind='r' AND c.relname NOT IN ($EXCLUDE)
        ORDER BY c.relname;"
  } > "$dir/00-tables.txt"

  # -- 01 columns -------------------------------------------------------------
  # Ordered by attnum within a table: position IS a fact (it affects INSERT
  # without a column list, and reordering is a breaking change).
  {
    echo "# table	pos	column	type	not_null	default"
    q "SELECT c.relname, a.attnum, a.attname,
              format_type(a.atttypid, a.atttypmod), a.attnotnull,
              coalesce(pg_get_expr(d.adbin, d.adrelid), '')
         FROM pg_class c
         JOIN pg_namespace n ON n.oid = c.relnamespace
         JOIN pg_attribute a ON a.attrelid = c.oid
         LEFT JOIN pg_attrdef d ON d.adrelid = c.oid AND d.adnum = a.attnum
        WHERE n.nspname='public' AND c.relkind='r' AND a.attnum > 0
          AND NOT a.attisdropped AND c.relname NOT IN ($EXCLUDE)
        ORDER BY c.relname, a.attnum;"
  } > "$dir/01-columns.txt"

  # -- 02 indexes -------------------------------------------------------------
  {
    echo "# table	index	definition"
    q "SELECT c.relname, i.relname, pg_get_indexdef(x.indexrelid)
         FROM pg_index x
         JOIN pg_class c ON c.oid = x.indrelid
         JOIN pg_class i ON i.oid = x.indexrelid
         JOIN pg_namespace n ON n.oid = c.relnamespace
        WHERE n.nspname='public' AND c.relname NOT IN ($EXCLUDE)
        ORDER BY c.relname, i.relname;"
  } > "$dir/02-indexes.txt"

  # -- 03 constraints ---------------------------------------------------------
  # pg_get_constraintdef includes the FK delete rule, which matters: 15 tenant_id
  # FKs are bare REFERENCES with no ON DELETE CASCADE, so deleting a tenant would
  # fail. Whatever the resolution, this pins it.
  {
    echo "# table	constraint	type	definition"
    q "SELECT rel.relname, con.conname, con.contype, pg_get_constraintdef(con.oid)
         FROM pg_constraint con
         JOIN pg_class rel ON rel.oid = con.conrelid
         JOIN pg_namespace n ON n.oid = rel.relnamespace
        WHERE n.nspname='public' AND rel.relname NOT IN ($EXCLUDE)
        ORDER BY rel.relname, con.conname;"
  } > "$dir/03-constraints.txt"

  # -- 04 policies ------------------------------------------------------------
  # The highest-value file. Both USING and WITH CHECK are captured, so a policy
  # weakened to USING(true) — which every metadata check passes — shows up as a
  # one-line diff in review.
  {
    echo "# table	policy	command	roles	using	with_check"
    q "SELECT tablename, policyname, cmd, array_to_string(roles, ','),
              coalesce(qual, ''), coalesce(with_check, '')
         FROM pg_policies
        WHERE schemaname='public' AND tablename NOT IN ($EXCLUDE)
        ORDER BY tablename, policyname;"
  } > "$dir/04-policies.txt"

  # -- 05 enum types ----------------------------------------------------------
  # enumsortorder matters: it is the comparison order, so a reordering is a
  # behavioural change even when the label set is identical.
  {
    echo "# type	sort	label"
    q "SELECT t.typname, e.enumsortorder::int, e.enumlabel
         FROM pg_type t
         JOIN pg_namespace n ON n.oid = t.typnamespace
         JOIN pg_enum e ON e.enumtypid = t.oid
        WHERE n.nspname='public' AND t.typtype='e'
        ORDER BY t.typname, e.enumsortorder;"
  } > "$dir/05-enums.txt"

  # -- 06 grants --------------------------------------------------------------
  # Pins what OUR migrations grant. `ALTER DEFAULT PRIVILEGES` means new tables
  # auto-grant to app_user, so a change there shows up here.
  #
  # Restricted to roles our migrations create. anon / authenticated /
  # service_role are managed by the Supabase PLATFORM, whose bootstrap grants
  # REFERENCES,TRIGGER,TRUNCATE on every table — present on local Supabase,
  # absent on the plain postgres:17 used by CI. Including them made the snapshot
  # environment-dependent: 497 lines locally, 200 in CI, so it could not pass in
  # both. Replicating Supabase's defaults in CI was rejected as chasing their
  # internals.
  #
  # Nothing security-relevant is lost. The question this file was meant to
  # answer — "has a stray GRANT opened the Data API?" — is answered better and
  # environment-independently by verify-invariants.sql's `grants/data-api-closed`
  # check, which asserts anon/authenticated hold no SELECT/INSERT/UPDATE/DELETE.
  {
    echo "# table	grantee	privileges"
    q "SELECT table_name, grantee, string_agg(DISTINCT privilege_type, ',' ORDER BY privilege_type)
         FROM information_schema.role_table_grants
        WHERE table_schema='public' AND table_name NOT IN ($EXCLUDE)
          AND grantee IN ('app_user','postgres','supabase_auth_admin')
        GROUP BY table_name, grantee
        ORDER BY table_name, grantee;"
  } > "$dir/06-grants.txt"

  # -- 07 triggers ------------------------------------------------------------
  {
    echo "# table	trigger	definition"
    q "SELECT c.relname, t.tgname, pg_get_triggerdef(t.oid)
         FROM pg_trigger t
         JOIN pg_class c ON c.oid = t.tgrelid
         JOIN pg_namespace n ON n.oid = c.relnamespace
        WHERE n.nspname='public' AND NOT t.tgisinternal
          AND c.relname NOT IN ($EXCLUDE)
        ORDER BY c.relname, t.tgname;"
  } > "$dir/07-triggers.txt"

  # -- 08 functions -----------------------------------------------------------
  # Body as a HASH, not inline: app.current_tenant_id() and
  # custom_access_token_hook are security-critical and a change must be visible,
  # but a 60-line body inline makes every unrelated diff scroll past it.
  {
    echo "# schema	function	args	returns	volatility	security_definer	body_sha256"
    q "SELECT n.nspname, p.proname, pg_get_function_identity_arguments(p.oid),
              pg_get_function_result(p.oid), p.provolatile, p.prosecdef,
              encode(sha256(p.prosrc::bytea), 'hex')
         FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
        WHERE n.nspname IN ('public','app')
          -- Exclude functions owned by an extension. Supabase installs
          -- extensions into the 'extensions' schema; plain Postgres puts them in
          -- 'public', so pgcrypto's armor/crypt/digest would appear in one
          -- environment and not the other. Same reason grants are restricted
          -- above: pin what OUR migrations define, not what the platform ships.
          AND NOT EXISTS (SELECT 1 FROM pg_depend d
                           WHERE d.objid = p.oid AND d.deptype = 'e')
        ORDER BY n.nspname, p.proname, pg_get_function_identity_arguments(p.oid);"
  } > "$dir/08-functions.txt"

  # -- 09 views ---------------------------------------------------------------
  {
    echo "# view	definition_sha256"
    q "SELECT c.relname, encode(sha256(pg_get_viewdef(c.oid, true)::bytea), 'hex')
         FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
        WHERE n.nspname='public' AND c.relkind='v'
        ORDER BY c.relname;"
  } > "$dir/09-views.txt"
}

case "$MODE" in
  --generate)
    # Cheap sanity check: the migration ledger should be present and non-empty.
    # A database that has never had migrations applied is not a valid source.
    if ! psql "$DB" -X -t -A --no-psqlrc -c \
         "SELECT count(*) FROM supabase_migrations.schema_migrations" 2>/dev/null \
         | grep -qE '^[1-9]'; then
      echo "WARNING: no migration history found in this database." >&2
      echo "         Snapshots must be generated from a migration-built database." >&2
      echo "         Run 'supabase db reset' first, or set DATABASE_URL correctly." >&2
      echo "" >&2
    fi
    generate_into "$OUT"
    echo "snapshot written to docs/data-models/snapshot/"
    wc -l "$OUT"/*.txt | sed 's|.*/snapshot/|  |'
    ;;

  --check)
    if [ ! -d "$OUT" ]; then
      echo "no committed snapshot at $OUT — run: scripts/db-snapshot.sh --generate" >&2
      exit 1
    fi
    TMP="$(mktemp -d)"
    DIFF="$(mktemp)"
    trap 'rm -rf "$TMP" "$DIFF"' EXIT
    # The diff file must live OUTSIDE the compared directory, or `diff -r`
    # reports it as an extra file and every check fails.
    generate_into "$TMP/snapshot"
    if diff -u -r "$OUT" "$TMP/snapshot" > "$DIFF" 2>&1; then
      echo "schema matches the committed snapshot"
    else
      echo "SCHEMA DRIFT — the database differs from docs/data-models/snapshot/"
      echo ""
      sed -e "s|$OUT|committed|" -e "s|$TMP/snapshot|actual|" "$DIFF" | head -200
      echo ""
      echo "If this change is INTENDED: scripts/db-snapshot.sh --generate,"
      echo "then commit the snapshot alongside the migration that caused it."
      exit 1
    fi
    ;;

  *)
    echo "usage: $0 [--generate|--check]" >&2
    exit 2
    ;;
esac
