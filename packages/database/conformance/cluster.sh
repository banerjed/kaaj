#!/usr/bin/env bash
# cluster.sh — the accounting conformance database's own Postgres cluster
# (docs/34-accounting-conformance-spec-V1.md, section 4.2).
#
#   packages/database/conformance/cluster.sh up        start it; create and migrate on first use
#   packages/database/conformance/cluster.sh rebuild   drop the database: re-create and re-migrate
#   packages/database/conformance/cluster.sh status    running? migrated to which migration?
#   packages/database/conformance/cluster.sh stop
#
# Its own cluster, not a database inside the Supabase one, for the same two
# reasons as the performance tenant's (perf/cluster.sh): `supabase db reset`,
# run by any session in any worktree, drops every database on that server;
# and conformance writes must never sit under another session's ./check or
# unit tests. Requires postgresql@17 on PATH.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/../../.." && pwd)"
PORT="${KAAJ_ACS_PORT:-54350}"
PGDATA_DIR="${KAAJ_ACS_PGDATA:-$HOME/.kaaj/acs-pgdata}"
SOCKDIR="${KAAJ_ACS_SOCKDIR:-$HOME/.kaaj/acs-sock}"
DB="${KAAJ_ACS_DB:-kaaj_acs}"
SERVER_URL="postgresql://postgres:postgres@127.0.0.1:$PORT/postgres"
OWNER_URL="postgresql://postgres:postgres@127.0.0.1:$PORT/$DB"

command -v initdb >/dev/null 2>&1 || {
  echo "  initdb not found. brew install postgresql@17 and put it on PATH." >&2
  exit 1
}

running() { pg_isready -h 127.0.0.1 -p "$PORT" >/dev/null 2>&1; }

start() {
  running && return 0
  mkdir -p "$SOCKDIR"
  [ -d "$PGDATA_DIR/base" ] || {
    mkdir -p "$(dirname "$PGDATA_DIR")"
    initdb -D "$PGDATA_DIR" -U postgres --auth=trust >/dev/null
  }
  pg_ctl -D "$PGDATA_DIR" \
    -o "-p $PORT -k $SOCKDIR -c listen_addresses=127.0.0.1" \
    -l "$PGDATA_DIR/pg.log" start >/dev/null
  for _ in $(seq 1 40); do running && return 0; sleep 0.25; done
  echo "  the cluster did not start; see $PGDATA_DIR/pg.log" >&2
  exit 1
}

migrated() {
  psql "$OWNER_URL" -X -tAc "SELECT to_regclass('public.tenants')" 2>/dev/null | grep -q tenants
}

recreate() {
  psql "$SERVER_URL" -X -q -v ON_ERROR_STOP=1 \
    -c "DROP DATABASE IF EXISTS \"$DB\" WITH (FORCE)" \
    -c "CREATE DATABASE \"$DB\"" 2>&1 | grep -v "does not exist, skipping" || true
}

migrate() {
  psql "$OWNER_URL" -X -q -v ON_ERROR_STOP=1 \
    -f "$ROOT/scripts/vanilla-postgres-stubs.sql" >/dev/null
  for f in "$ROOT"/supabase/migrations/*.sql; do
    if ! out="$(psql "$OWNER_URL" -X -q -v ON_ERROR_STOP=1 -f "$f" 2>&1 >/dev/null)"; then
      echo "  migration failed: $(basename "$f")" >&2
      echo "$out" | head -5 >&2
      exit 1
    fi
  done
  # The local demo credential ./setup uses; app_user is created without one.
  psql "$OWNER_URL" -X -q -c "ALTER ROLE app_user WITH PASSWORD 'app_user'"
}

latest() { basename "$(ls "$ROOT"/supabase/migrations/*.sql | tail -1)" .sql; }

case "${1:-up}" in
  up)
    start
    if migrated; then
      echo "  conformance cluster up on :$PORT (already migrated)"
    else
      recreate
      migrate
      echo "  conformance cluster up on :$PORT, migrated to $(latest)"
    fi
    ;;
  rebuild)
    start
    recreate
    migrate
    echo "  conformance cluster rebuilt on :$PORT, migrated to $(latest)"
    ;;
  status)
    if running; then
      tenants="$(psql "$OWNER_URL" -X -tAc "SELECT count(*) FROM tenants" 2>/dev/null || echo "?")"
      echo "  conformance cluster on :$PORT — running, database $DB, $tenants tenant(s); data in $PGDATA_DIR"
    else
      echo "  conformance cluster on :$PORT — stopped; data in $PGDATA_DIR"
    fi
    ;;
  stop)
    running && pg_ctl -D "$PGDATA_DIR" stop >/dev/null
    echo "  conformance cluster stopped"
    ;;
  *)
    echo "usage: cluster.sh up|rebuild|status|stop" >&2
    exit 2
    ;;
esac
