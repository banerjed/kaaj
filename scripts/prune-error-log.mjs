#!/usr/bin/env node
/**
 * Deletes app_error_log rows older than the retention window. An operator
 * tool, not app code — it lives here rather than under apps/web/src
 * specifically so it sits outside the "no DELETE in app code" `./check` gate,
 * and connects as the database OWNER (DATABASE_URL), the same class of
 * access scripts/provision-tenant.mjs uses, since app_user has no DELETE
 * grant on this table (20260830120000_append_only.sql revokes it repo-wide).
 *
 *   node scripts/prune-error-log.mjs                 # dry run: prints the count
 *   node scripts/prune-error-log.mjs --days 14        # a different window
 *   node scripts/prune-error-log.mjs --execute         # actually deletes
 *
 * Not scheduled by this change — point a host cron / Fly.io scheduled
 * machine at it (boring infrastructure, ADR-006: no new job-queue system).
 * A delete is not reversible, so dry-run is the default, not an opt-in.
 */
import { execFileSync } from "node:child_process"
import { readFileSync } from "node:fs"

const ROOT = new URL("..", import.meta.url).pathname
const DEFAULT_URL = "postgresql://postgres:postgres@127.0.0.1:54322/postgres"

function loadEnvLocal() {
  let text
  try {
    text = readFileSync(`${ROOT}apps/web/.env.local`, "utf8")
  } catch {
    return
  }
  for (const line of text.split("\n")) {
    const trimmed = line.trim()
    if (trimmed === "" || trimmed.startsWith("#")) continue
    const match = trimmed.match(/^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/)
    if (!match) continue
    const [, key, rawValue] = match
    if (process.env[key] !== undefined) continue
    process.env[key] = rawValue.replace(/^"(.*)"$/, "$1")
  }
}
loadEnvLocal()

const args = process.argv.slice(2)
const execute = args.includes("--execute")
const daysFlagIndex = args.indexOf("--days")
const days =
  daysFlagIndex !== -1 && args[daysFlagIndex + 1]
    ? Number(args[daysFlagIndex + 1])
    : 30

if (!Number.isFinite(days) || days <= 0) {
  console.error(`invalid --days value: ${args[daysFlagIndex + 1]}`)
  process.exit(64)
}

const DB_URL = process.env.DATABASE_URL ?? DEFAULT_URL

function query(sql) {
  return execFileSync("psql", [DB_URL, "-X", "-tA", "-c", sql], {
    encoding: "utf8",
  }).trim()
}

const count = Number(
  query(
    `SELECT count(*) FROM app_error_log WHERE created_at < now() - interval '${days} days';`,
  ),
)

if (!execute) {
  console.log(
    `dry run: ${count} row(s) older than ${days} day(s) would be deleted. Pass --execute to actually delete.`,
  )
  process.exit(0)
}

query(`DELETE FROM app_error_log WHERE created_at < now() - interval '${days} days';`)
console.log(`deleted ${count} row(s) older than ${days} day(s).`)
