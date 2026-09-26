#!/usr/bin/env node
/**
 * check-error-rates.mjs — READ-ONLY. Queries app_error_log for a trailing
 * window's error count per THRESHOLDS entry below and exits non-zero on a
 * breach. Sibling to verify-remote.sh, same tier: production-safe, and
 * deliberately NOT part of `./check` — a local dev database has no
 * production error volume for this to check against.
 *
 *   packages/database/tests/check-error-rates.mjs "postgresql://postgres:<pw>@db.<ref>.supabase.co:5432/postgres"
 *   SUPABASE_DB_URL=... packages/database/tests/check-error-rates.mjs
 *
 * The actual paging call is one function, notifyOncall() — logged today,
 * wiring a real channel (Slack/PagerDuty) later is a one-function change,
 * not a redesign.
 */
import { execFileSync } from "node:child_process"

/**
 * A committed literal, same shape as SCALE_SENSITIVE elsewhere in this repo —
 * a rule written only in prose gets applied unevenly. Adjust the numbers as
 * real traffic gives you a baseline; the reason is what a reviewer checks.
 */
const THRESHOLDS = [
  {
    scope: "server",
    windowMinutes: 15,
    max: 20,
    reason: "a healthy tenant sees occasional errors, not a steady stream",
  },
  {
    scope: "client",
    windowMinutes: 15,
    max: 40,
    reason: "client errors are noisier (extensions, flaky connections); a higher bar",
  },
]

const DB_URL = process.argv[2] ?? process.env.SUPABASE_DB_URL ?? ""
if (!DB_URL) {
  console.error(
    "usage: check-error-rates.mjs <postgres-connection-url>    (or set SUPABASE_DB_URL)",
  )
  process.exit(64)
}

// Force read-only on the CONNECTION, not with a statement — matches verify-remote.sh.
const roUrl = DB_URL.includes("?")
  ? `${DB_URL}&options=-c%20default_transaction_read_only%3Don`
  : `${DB_URL}?options=-c%20default_transaction_read_only%3Don`

function query(sql) {
  return execFileSync("psql", [roUrl, "-X", "-tA", "-c", sql], {
    encoding: "utf8",
  }).trim()
}

function notifyOncall(breach) {
  console.error(`ALERT: ${JSON.stringify(breach)}`)
}

const readOnly = query("SELECT current_setting('transaction_read_only');")
if (readOnly !== "on") {
  console.error(`FAIL connection is NOT read-only (got '${readOnly}') — aborting.`)
  process.exit(1)
}

let breaches = 0
for (const t of THRESHOLDS) {
  const count = Number(
    query(
      `SELECT count(*) FROM app_error_log WHERE scope = '${t.scope}' AND created_at > now() - interval '${t.windowMinutes} minutes';`,
    ),
  )
  const breached = count > t.max
  console.log(
    `${breached ? "BREACH" : "ok    "}  ${t.scope}: ${count} in the last ${t.windowMinutes}m (max ${t.max})`,
  )
  if (breached) {
    breaches += 1
    notifyOncall({ ...t, count })
  }
}

process.exit(breaches > 0 ? 1 : 0)
