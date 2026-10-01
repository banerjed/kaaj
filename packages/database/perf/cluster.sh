#!/usr/bin/env bash
# cluster.sh — the performance tenant's own Postgres cluster
# (docs/32-perf-tenant.md).
#
#   packages/database/perf/cluster.sh up        start it; create and migrate on first use
#   packages/database/perf/cluster.sh rebuild   drop every row: re-create and re-migrate
#   packages/database/perf/cluster.sh status    running? migrated to which migration?
#   packages/database/perf/cluster.sh stop
#
# Its own cluster, not a database inside the Supabase one, for two reasons:
# `supabase db reset` (run by any session, any worktree) recreates that
# server and drops every database on it; and millions of generated rows must
# never sit under another session's ./check or unit tests. The tenant's
# business data lives here, ADR-009's dedicated tier, exactly as Fenwick's
# does (provision-dedicated-db.sh); sign-in stays in the shared database.
#
# The data directory is outside the repository by default, so the generated
# tenant outlives worktrees and checkouts. Requires postgresql@17 on PATH.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/../../.." && pwd)"
PORT="${KAAJ_PERF_PORT:-54349}"
PGDATA_DIR="${KAAJ_PERF_PGDATA:-$HOME/.kaaj/perf-pgdata}"
SOCKDIR="${KAAJ_PERF_SOCKDIR:-$HOME/.kaaj/perf-sock}"
DB="${KAAJ_PERF_DB:-kaaj_perf}"
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
  # Only on a fresh directory: a stopped, initialised cluster (reboot, sleep)
  # must not re-run initdb.
  [ -d "$PGDATA_DIR/base" ] || {
    mkdir -p "$(dirname "$PGDATA_DIR")"
    initdb -D "$PGDATA_DIR" -U postgres --auth=trust >/dev/null
  }
  pg_ctl -D "$PGDATA_DIR" \
    -o "-p $PORT -k $SOCKDIR -c listen_addresses=127.0.0.1 -c shared_preload_libraries=pg_stat_statements" \
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
  psql "$OWNER_URL" -X -q -c "CREATE EXTENSION IF NOT EXISTS pg_stat_statements"
}

latest() { basename "$(ls "$ROOT"/supabase/migrations/*.sql | tail -1)" .sql; }

case "${1:-up}" in
  up)
    start
    if migrated; then
      echo "  perf cluster up on :$PORT (already migrated)"
    else
      recreate
      migrate
      echo "  perf cluster up on :$PORT, migrated to $(latest)"
    fi
    ;;
  rebuild)
    start
    recreate
    migrate
    echo "  perf cluster rebuilt on :$PORT, migrated to $(latest)"
    ;;
  status)
    if running; then
      tenants="$(psql "$OWNER_URL" -X -tAc "SELECT count(*) FROM tenants" 2>/dev/null || echo "?")"
      echo "  perf cluster on :$PORT — running, database $DB, $tenants tenant(s); data in $PGDATA_DIR"
    else
      echo "  perf cluster on :$PORT — stopped; data in $PGDATA_DIR"
    fi
    ;;
  stop)
    running && pg_ctl -D "$PGDATA_DIR" stop >/dev/null
    echo "  perf cluster stopped"
    ;;
  *)
    echo "usage: cluster.sh up|rebuild|status|stop" >&2
    exit 2
    ;;
esac
