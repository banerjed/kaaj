#!/usr/bin/env node
/**
 * error-report.mjs — READ-ONLY. Ad-hoc views over app_error_log for a weekly
 * (or whenever-something-feels-off) look, instead of typing the query by
 * hand each time. Same tier as verify-remote.sh / check-error-rates.mjs:
 * production-safe, forces a read-only connection, not part of `./check`.
 *
 *   packages/database/tests/error-report.mjs routes  "postgresql://...db.<ref>.supabase.co:5432/postgres"
 *   SUPABASE_DB_URL=... packages/database/tests/error-report.mjs routes
 *
 * Subcommands:
 *   routes                  loudest route+status combinations
 *   tenants                 which tenants are hurting the most
 *   trend                   day-by-day count, by scope
 *   lookup <error_id>       the one row behind an id a customer quoted you
 *
 * Every subcommand except `lookup` takes --days N (default 7).
 */
import { execFileSync } from "node:child_process"

const [, , subcommand, ...rest] = process.argv

const USAGE = `usage:
  error-report.mjs routes  [--days N] [<connection-url>]
  error-report.mjs tenants [--days N] [<connection-url>]
  error-report.mjs trend   [--days N] [<connection-url>]
  error-report.mjs lookup  <error_id> [<connection-url>]

  (or set SUPABASE_DB_URL instead of passing a connection url)`

const SUBCOMMANDS = new Set(["routes", "tenants", "trend", "lookup"])
if (!SUBCOMMANDS.has(subcommand)) {
  console.error(USAGE)
  process.exit(64)
}

function parseArgs(args) {
  const daysFlagIndex = args.indexOf("--days")
  const days =
    daysFlagIndex !== -1 && args[daysFlagIndex + 1]
      ? Number(args[daysFlagIndex + 1])
      : 7
  const positional = args.filter(
    (a, i) => a !== "--days" && (daysFlagIndex === -1 || i !== daysFlagIndex + 1),
  )
  return { days, positional }
}

const { days, positional } = parseArgs(rest)
if (!Number.isFinite(days) || days <= 0) {
  console.error(`invalid --days value`)
  process.exit(64)
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

let lookupId
let dbUrlArg
if (subcommand === "lookup") {
  ;[lookupId, dbUrlArg] = positional
  if (!lookupId || !UUID.test(lookupId)) {
    console.error(`lookup needs a UUID error_id, got: ${lookupId ?? "(none)"}`)
    process.exit(64)
  }
} else {
  ;[dbUrlArg] = positional
}

const DB_URL = dbUrlArg ?? process.env.SUPABASE_DB_URL ?? ""
if (!DB_URL) {
  console.error(USAGE)
  process.exit(64)
}

// Force read-only on the CONNECTION, not with a statement — matches verify-remote.sh.
const roUrl = DB_URL.includes("?")
  ? `${DB_URL}&options=-c%20default_transaction_read_only%3Don`
  : `${DB_URL}?options=-c%20default_transaction_read_only%3Don`

function psql(sql) {
  return execFileSync(
    "psql",
    [roUrl, "-X", "-P", "pager=off", "-c", sql],
    { encoding: "utf8" },
  )
}

const readOnly = execFileSync(
  "psql",
  [roUrl, "-X", "-tA", "-c", "SELECT current_setting('transaction_read_only');"],
  { encoding: "utf8" },
).trim()
if (readOnly !== "on") {
  console.error(`FAIL connection is NOT read-only (got '${readOnly}') — aborting.`)
  process.exit(1)
}

const QUERIES = {
  routes: `
    SELECT route, status, count(*) AS errors
    FROM app_error_log
    WHERE created_at > now() - interval '${days} days'
    GROUP BY route, status
    ORDER BY errors DESC
    LIMIT 20;
  `,
  tenants: `
    SELECT t.subdomain, count(*) AS errors
    FROM app_error_log e JOIN tenants t ON t.id = e.tenant_id
    WHERE e.created_at > now() - interval '${days} days'
    GROUP BY t.subdomain
    ORDER BY errors DESC
    LIMIT 20;
  `,
  trend: `
    SELECT date_trunc('day', created_at)::date AS day, scope, count(*) AS errors
    FROM app_error_log
    WHERE created_at > now() - interval '${days} days'
    GROUP BY 1, 2
    ORDER BY 1, 2;
  `,
  lookup: `
    SELECT * FROM app_error_log WHERE error_id = '${lookupId}';
  `,
}

console.log(psql(QUERIES[subcommand]))
