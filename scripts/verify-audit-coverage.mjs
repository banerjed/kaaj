#!/usr/bin/env node
/**
 * Every write is classified, and every audited one actually audits.
 *
 * CLAUDE.md required an audit entry for "a write someone may later be asked to
 * justify" and nothing enforced it: of 26 actions, 3 audited — not hiring
 * someone, not editing their employment record, not the payroll policy that
 * decides how overtime is computed. A rule that is prose is applied unevenly,
 * which is the same lesson the disclosure matrix taught (L48).
 *
 * Three checks, all bidirectional:
 *
 *  1. Every action in AUDITED_OPERATIONS calls `audit.record`.
 *  2. No action in NOT_AUDITED calls it — an entry drifting into auditing
 *     without moving lists means the register no longer describes the code.
 *  3. Every action that EXISTS appears on one list or the other. A new action
 *     fails the build until someone decides, rather than defaulting to silence.
 *
 * `audit_log` can never be deleted from, so over-auditing is permanent noise.
 * That is why the second and third checks matter as much as the first.
 */
import { execFileSync } from "node:child_process"
import { readdirSync, readFileSync, statSync } from "node:fs"
import { join, relative } from "node:path"

const ROOT = new URL("..", import.meta.url).pathname
const ROUTES = join(ROOT, "apps/web/src/routes/(app)")
const REGISTER = "apps/web/src/lib/server/audit/register.ts"

/** Parse the two committed lists out of the register. */
function parseRegister() {
  const src = readFileSync(join(ROOT, REGISTER), "utf8")
  const lists = {}
  for (const name of ["AUDITED_OPERATIONS", "NOT_AUDITED"]) {
    const start = src.indexOf(`export const ${name}`)
    if (start === -1) {
      console.error(`  ${name} is missing from the register`)
      process.exit(1)
    }
    const end = src.indexOf("\n]", start)
    const body = src.slice(start, end)
    lists[name] = [
      ...body.matchAll(/route:\s*"([^"]+)",\s*\n\s*action:\s*"([^"]+)"/g),
    ].map((m) => `${m[1]}::${m[2]}`)
  }
  return lists
}

function* routeFiles(dir) {
  for (const name of readdirSync(dir)) {
    const full = join(dir, name)
    if (statSync(full).isDirectory()) yield* routeFiles(full)
    else if (name === "+page.server.ts") yield full
  }
}

const { AUDITED_OPERATIONS, NOT_AUDITED } = parseRegister()
const audited = new Set(AUDITED_OPERATIONS)
const notAudited = new Set(NOT_AUDITED)

const missing = []
const unexpected = []
const unclassified = []

for (const file of routeFiles(ROUTES)) {
  const src = readFileSync(file, "utf8")
  if (!/export const actions/.test(src)) continue
  const route = relative(ROUTES, file).replace(/\/\+page\.server\.ts$/, "")

  // Split the actions block so each action's body is examined on its own —
  // one audited action in a file does not vouch for its neighbours.
  const block = src.slice(src.indexOf("export const actions"))
  const names = [...block.matchAll(/^ {2}([a-zA-Z_]+): async/gm)]
  for (let i = 0; i < names.length; i++) {
    const action = names[i][1]
    const from = names[i].index
    const to = i + 1 < names.length ? names[i + 1].index : block.length
    const body = block.slice(from, to)
    const records = /audit\.record\s*\(/.test(body)
    const key = `${route}::${action}`

    if (audited.has(key)) {
      if (!records) missing.push(key)
    } else if (notAudited.has(key)) {
      if (records) unexpected.push(key)
    } else {
      unclassified.push(key)
    }
  }
}

// -- Redaction keeps up with the schema -------------------------------------
//
// NEVER_LOGGED matches field NAMES, so a column it does not know about is a
// column a caller can write in the clear. Ten encrypted columns were missing
// from it — address_ct, email_ct, phone_primary_ct, tax_id_ct and others —
// which is exactly the drift a committed list suffers when nothing compares it
// to the schema.
const unredacted = []
if (process.env.DATABASE_URL) {
  const repo = readFileSync(
    join(ROOT, "apps/web/src/lib/server/audit/audit.repo.ts"),
    "utf8",
  )
  const encrypted = execFileSync(
    "psql",
    [
      process.env.DATABASE_URL, "-X", "-tA", "-c",
      "SELECT DISTINCT column_name FROM information_schema.columns " +
        "WHERE table_schema='public' " +
        "AND (column_name ~ '_ct$' OR column_name LIKE '%_encrypted')",
    ],
    { encoding: "utf8" },
  )
    .trim()
    .split("\n")
    .filter(Boolean)
  for (const col of encrypted) {
    if (!repo.includes(`"${col}"`)) unredacted.push(col)
  }
}

let failed = false
const report = (rows, heading, advice) => {
  if (!rows.length) return
  failed = true
  console.error(`\n  ${rows.length} ${heading}\n`)
  for (const r of rows) console.error(`    ${r}`)
  console.error(`\n${advice}\n`)
}

report(
  missing,
  "audited operation(s) do NOT call audit.record:",
  "  The register says these must be recorded. Add the entry in the SAME\n" +
    "  transaction as the write — written afterwards, the trail records what\n" +
    "  the application believed happened (L40).",
)
report(
  unexpected,
  "operation(s) audit but are listed as NOT audited:",
  "  Either the write became consequential and belongs in AUDITED_OPERATIONS,\n" +
    "  or the call is noise in a table that can never be pruned. Move it or\n" +
    "  remove it; do not leave the register describing something else.",
)
report(
  unclassified,
  "action(s) appear in neither list:",
  `  Decide, do not default. Add it to AUDITED_OPERATIONS or NOT_AUDITED in\n` +
    `  ${REGISTER}, with a reason. The question: would someone later ask who\n` +
    "  changed this and what it was before, and would the answer affect a\n" +
    "  person's money, employment, rights, or a regulator's question?",
)

report(
  unredacted,
  "encrypted column(s) are NOT in NEVER_LOGGED:",
  "  Redaction matches the field NAME, so a column absent from that set is one\n" +
    "  a caller can write in the clear — into a table that can never be deleted\n" +
    "  from. Add it to NEVER_LOGGED in audit.repo.ts.",
)

if (failed) process.exit(1)
console.log(
  `  every write is classified (${audited.size} audited, ${notAudited.size} not)`,
)
