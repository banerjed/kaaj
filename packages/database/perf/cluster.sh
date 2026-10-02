#!/usr/bin/env bash
# cluster.sh — the performance tenant's own Postgres cluster
# (docs/32-perf-tenant.md).
#
#   packages/database/perf/cluster.sh up        start it; create on first use; apply new migrations
#   packages/database/perf/cluster.sh start     start it, nothing more
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

# The planner's inputs, pinned, so the same data plans the same way on every
# machine — `pnpm db:perf regress` compares data pages read against a
# committed budget, and a different plan reads a different number. A
# statistics target of 10000 samples 3M rows, more than any table holds, so
# ANALYZE reads every row and its statistics are not a random sample.
# Custom plans always: a prepared statement otherwise switches to a generic
# plan after five runs on one pooled connection, and which connection serves
# which page varies run to run. ALTER SYSTEM rather than a start flag: it
# reaches a cluster already running.
settings() {
  psql "$SERVER_URL" -X -q -v ON_ERROR_STOP=1 \
    -c "ALTER SYSTEM SET default_statistics_target = 10000" \
    -c "ALTER SYSTEM SET jit = off" \
    -c "ALTER SYSTEM SET plan_cache_mode = force_custom_plan" \
    -c "ALTER SYSTEM SET work_mem = '4MB'" \
    -c "ALTER SYSTEM SET random_page_cost = 4" \
    -c "ALTER SYSTEM SET effective_cache_size = '4GB'" \
    -c "SELECT pg_reload_conf()" >/dev/null
}

start() {
  running && { settings; return 0; }
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
  for _ in $(seq 1 40); do running && { settings; return 0; }; sleep 0.25; done
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

# Which migrations this database has had, so `up` can apply the ones added
# since — the perf tenant is long-lived, and a cluster left behind the repo
# would measure a schema nobody ships.
track() {
  psql "$OWNER_URL" -X -q -v ON_ERROR_STOP=1 -c "
    CREATE SCHEMA IF NOT EXISTS _cluster;
    CREATE TABLE IF NOT EXISTS _cluster.applied (name text PRIMARY KEY, at timestamptz NOT NULL DEFAULT now());"
}

applied() { psql "$OWNER_URL" -X -tA -c "SELECT name FROM _cluster.applied" 2>/dev/null; }

migrate() {
  psql "$OWNER_URL" -X -q -v ON_ERROR_STOP=1 \
    -f "$ROOT/scripts/vanilla-postgres-stubs.sql" >/dev/null
  track
  pending
  # The local demo credential ./setup uses; app_user is created without one.
  psql "$OWNER_URL" -X -q -c "ALTER ROLE app_user WITH PASSWORD 'app_user'"
  psql "$OWNER_URL" -X -q -c "CREATE EXTENSION IF NOT EXISTS pg_stat_statements"
}

# Apply, in order, every migration file the database has not had.
pending() {
  local done n=0 name out
  done="$(applied)"
  for f in "$ROOT"/supabase/migrations/*.sql; do
    name="$(basename "$f" .sql)"
    grep -qx "$name" <<<"$done" && continue
    if ! out="$(psql "$OWNER_URL" -X -q -v ON_ERROR_STOP=1 -f "$f" 2>&1 >/dev/null)"; then
      echo "  migration failed: $name" >&2
      echo "$out" | head -5 >&2
      exit 1
    fi
    psql "$OWNER_URL" -X -q -c "INSERT INTO _cluster.applied (name) VALUES ('$name')"
    n=$((n + 1))
  done
  [ "$n" -gt 0 ] && echo "  applied $n new migration(s), through $(latest)"
  return 0
}

latest() { basename "$(ls "$ROOT"/supabase/migrations/*.sql | tail -1)" .sql; }

case "${1:-up}" in
  start)
    start
    ;;
  up)
    start
    if migrated; then
      if ! psql "$OWNER_URL" -X -tAc "SELECT to_regclass('_cluster.applied')" | grep -q applied; then
        # Built before migrations were tracked: everything in the repo then
        # had been applied by hand. Record it once; from here `up` tracks.
        track
        for f in "$ROOT"/supabase/migrations/*.sql; do
          psql "$OWNER_URL" -X -q -c "INSERT INTO _cluster.applied (name) VALUES ('$(basename "$f" .sql)') ON CONFLICT DO NOTHING"
        done
        echo "  recorded the existing migrations as applied"
      fi
      pending
      echo "  perf cluster up on :$PORT, migrated to $(latest)"
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
    echo "usage: cluster.sh up|start|rebuild|status|stop" >&2
    exit 2
    ;;
esac
