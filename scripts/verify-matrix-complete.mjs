#!/usr/bin/env node
/**
 * Every column on a matrix-covered table must be in SENSITIVE_FIELDS or
 * NOT_SENSITIVE, with a reason — a new column fails until classified (L47).
 * Enumerates the schema rather than regexing column names, which would miss
 * a rename, a JSONB interior (L41), or innocuously-named PII.
 */
import { execFileSync } from "node:child_process"
import { readFileSync } from "node:fs"

const ROOT = new URL("..", import.meta.url).pathname
const MATRIX = "apps/web/src/lib/server/security/matrix.ts"

/**
 * Columns on covered tables that carry nothing about a person worth
 * restricting. Each needs a reason, and "it looked boring" is not one.
 */
const NOT_SENSITIVE = new Map([
  // Keys, tenancy and bookkeeping.
  ["id", "surrogate key"],
  ["tenant_id", "tenancy discriminator; isolation is a separate concern"],
  ["employee_id", "the subject's own id — the join key, on rows already policy-scoped"],
  ["created_at", "bookkeeping"],
  ["updated_at", "bookkeeping"],
  ["created_by", "bookkeeping"],
  ["version", "optimistic concurrency"],
  ["status", "lifecycle state, not a personal attribute"],
  ["effective_from", "when a record applies; the amount beside it is what is protected"],
  ["effective_to", "when a record stops applying"],
  ["currency", "the unit of an amount; discloses a market, not a figure"],

  // Directory data — the firm publishes these internally, by decision.
  ["first_name", "directory"],
  ["last_name", "directory"],
  ["middle_name", "directory"],
  ["preferred_name", "directory"],
  ["pronouns", "directory; the person chooses to publish it"],
  ["email", "directory"],
  ["employee_number", "directory identifier, not a national one"],
  ["job_title", "directory"],
  ["job_level", "directory; the published band for a level is separate"],
  ["department_code", "directory"],
  ["location_code", "directory"],
  ["timezone", "directory; needed to render a colleague's working hours"],
  ["manager_id", "the reporting line is published internally"],
  ["start_date", "directory; tenure is visible to colleagues"],
  ["employment_status", "directory"],
  ["employment_type", "directory"],
  ["is_active", "directory"],
  ["profile_picture", "directory"],
  ["introduction", "the person writes it for colleagues to read"],
  ["hobbies", "the person publishes it"],
  ["social_media_links", "the person publishes it"],
  ["affinity_groups", "the person publishes it"],
  ["celebration_preferences", "how the person wants birthdays marked"],

  // Employment terms whose figures live on policy-scoped tables.
  ["end_date", "leaving date; visible once someone has left"],
  ["fte", "working pattern, published so colleagues know availability"],
  ["overtime_eligible", "a classification, not a figure"],
  ["compensation_type", "salaried vs hourly — a classification, not a figure"],
  ["pay_frequency", "monthly vs fortnightly — a classification, not a figure"],
  ["standard_hours_per_day", "working pattern"],
  ["standard_days_per_week", "working pattern"],
  ["pto_balances", "the person's own leave, shown to colleagues as availability"],
  ["custom_fields", "customer-defined; must never feed payroll (see CLAUDE.md)"],
  ["prior_employers", "the person publishes it on their profile"],
  ["prior_education", "the person publishes it on their profile"],
  ["gender", "self-declared, published by the person"],
  ["marital_status", "self-declared, published by the person"],
  ["change_reason", "why a record changed; the figure is what is protected"],
  ["overtime_rules", "policy configuration, not an individual's pay"],
  ["annual_equivalent", "derived from a protected amount; see matrix note"],
])

const matrixSrc = readFileSync(ROOT + MATRIX, "utf8")

/** Per-column declarations: `table.column`. */
const declared = new Set(
  [...matrixSrc.matchAll(/id:\s*"([^"]+)"/g)].map((m) => m[1]),
)

/** Declared `open` — deliberately colleague-readable, so no `_pvt`/`_ct` suffix required. */
const openFields = new Set(
  [...matrixSrc.matchAll(/id:\s*"([^"]+)"[\s\S]{0,400}?defense:\s*"(\w+)"/g)]
    .filter((m) => m[2] === "open")
    .map((m) => m[1]),
)

/** Tables whose whole row is policy-scoped — one declaration classifies every column on it. */
const wholeRow = new Set(
  [...matrixSrc.matchAll(/^ {2}([a-z_]+):\s*\{\n\s*defense:\s*"rls"/gm)].map(
    (m) => m[1],
  ),
)

/** Tables carrying per-column entries — where the row is broadly visible. */
const perColumn = new Set([...declared].map((id) => id.split(".")[0]))
const tables = [...new Set([...wholeRow, ...perColumn])]

if (tables.length === 0) {
  console.error("  could not read the covered tables from the matrix")
  process.exit(1)
}
if (wholeRow.size === 0) {
  console.error("  read no policy-scoped tables from the matrix — parser drift")
  process.exit(1)
}

const url = process.env.DATABASE_URL
if (!url) {
  console.error("  DATABASE_URL is not set")
  process.exit(1)
}

const rows = execFileSync(
  "psql",
  [
    url, "-X", "-tA", "-F", "\t", "-c",
    `SELECT table_name, column_name FROM information_schema.columns
      WHERE table_schema='public' AND table_name IN (${tables.map((t) => `'${t}'`).join(",")})
      ORDER BY table_name, ordinal_position`,
  ],
  { encoding: "utf8" },
)
  .trim()
  .split("\n")
  .filter(Boolean)
  .map((l) => l.split("\t"))

/**
 * `_ct` (ciphertext) / `_pvt` (restricted plaintext) suffix must agree with
 * the matrix's classification, in both directions — a column with neither
 * suffix is directory data, by construction.
 */
const SUFFIXED = /_(pvt|ct)$/
const mismatched = []

for (const [table, column] of rows) {
  if (wholeRow.has(table)) continue // marked by the table, not the column
  const id = `${table}.${column}`
  const restricted = declared.has(id) && !openFields.has(id)
  const suffixed = SUFFIXED.test(column)
  if (restricted && !suffixed) {
    mismatched.push(
      `${id} is restricted in the matrix but its name does not say so — add _pvt (or _ct if encrypted)`,
    )
  }
  if (suffixed && !restricted) {
    mismatched.push(
      `${id} is named as restricted but the matrix does not restrict it — classify it, or drop the suffix`,
    )
  }
}

if (mismatched.length) {
  console.error(`\n  ${mismatched.length} name/classification mismatch(es):\n`)
  for (const m of mismatched) console.error(`    ${m}`)
  console.error(
    "\n  On a broadly-visible row the column name is the only warning a" +
      "\n  reviewer gets in a diff. `COALESCE(cp.amount, e.base_amount_pvt)`" +
      "\n  shows the problem; `e.base_amount` showed nothing (L47).\n",
  )
  process.exit(1)
}

const unclassified = []
for (const [table, column] of rows) {
  if (wholeRow.has(table)) continue // the row policy classifies every column
  if (declared.has(`${table}.${column}`)) continue
  if (NOT_SENSITIVE.has(column)) continue
  unclassified.push(`${table}.${column}`)
}

if (unclassified.length) {
  console.error(
    `\n  ${unclassified.length} column(s) on covered tables are unclassified:\n`,
  )
  for (const c of unclassified) console.error(`    ${c}`)
  console.error(
    "\n  Decide, do not default. Either add it to SENSITIVE_FIELDS in" +
      `\n  ${MATRIX} with the audience and the` +
      "\n  mechanism that holds it, or to NOT_SENSITIVE in this file with a" +
      "\n  reason. Every disclosure bug here so far was an UNCLASSIFIED" +
      "\n  column, not a mis-classified one.\n",
  )
  process.exit(1)
}
console.log(`  every sensitive column is classified (${rows.length} checked)`)
