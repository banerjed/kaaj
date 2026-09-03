#!/usr/bin/env node
/**
 * Every write is classified as audited or not (L48), and every classification
 * matches reality: audited actions call audit.record, not-audited ones don't,
 * and every action appears on one list or the other. audit_log is append-only,
 * so an unclassified or drifted action is permanent noise or a silent gap.
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

/**
 * Does every `audit.record` share the transaction of the write beside it?
 * (L40 — an entry written outside the transaction can diverge from what
 * actually happened.) Finds each `withTenant(..., async (P) => {` region by
 * brace-matching and requires `audit.record(A, ...)` inside it to use `A ===
 * P`. A lexical check: a `tx` passed into a helper it can't see into is
 * reported as "outside any withTenant" for review, not silently passed.
 */
function auditTransactionProblems(body, key) {
  const problems = []

  // Every `withTenant(..., <async> (PARAM) => {` and the span it encloses.
  const regions = []
  // Bounded look-ahead, not `[^)]*?` — the first arg is `actorFrom(locals)`,
  // which contains parens and would otherwise match nothing.
  const opener =
    /withTenant\s*\([\s\S]{0,200}?\(\s*([A-Za-z_$][\w$]*)\s*\)\s*=>\s*\{/g
  for (const m of body.matchAll(opener)) {
    let depth = 0
    let i = m.index + m[0].length - 1 // at the opening brace
    for (; i < body.length; i++) {
      if (body[i] === "{") depth++
      else if (body[i] === "}" && --depth === 0) break
    }
    regions.push({ param: m[1], start: m.index, end: i })
  }

  for (const call of body.matchAll(/audit\.record\s*\(\s*([A-Za-z_$][\w$]*)/g)) {
    const arg = call[1]
    // Innermost enclosing region wins, for a nested transaction.
    const enclosing = regions
      .filter((r) => call.index > r.start && call.index < r.end)
      .sort((a, b) => b.start - a.start)[0]

    if (!enclosing) {
      problems.push(
        `${key}: audit.record(${arg}, …) is outside any withTenant callback`,
      )
    } else if (arg !== enclosing.param) {
      problems.push(
        `${key}: audit.record(${arg}, …) does not use the transaction ` +
          `\`${enclosing.param}\` it is written inside`,
      )
    }
  }
  return problems
}

const missing = []
const unexpected = []
const unclassified = []
const notTransactional = []

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

    if (records) notTransactional.push(...auditTransactionProblems(body, key))

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
// NEVER_LOGGED matches field NAMES, so an encrypted column missing from it
// can be written to the audit log in the clear.
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
  notTransactional,
  "audit write(s) may not share the business transaction:",
  "  L40: an entry written outside the transaction that made the change\n" +
    "  records what the application BELIEVED happened, and the two diverge\n" +
    "  exactly when it matters. Pass the `tx` from the enclosing withTenant\n" +
    "  callback. If the call is inside a helper this check cannot see into,\n" +
    "  that is a review question, not an exemption.",
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
