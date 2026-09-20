#!/usr/bin/env node
/**
 * No `tx`...`` /`tx.unsafe(...)` query issued inside a loop body or an
 * array-iteration callback.
 *
 * A query that is fine on the committed fixture (a dozen rows) becomes N
 * round trips once a table holds thousands — each one paying full network
 * and planning latency that a single batched query pays once. This already
 * happened in `ticketing/+page.server.ts`: building the category tree for a
 * filter bar looped over every business area and queried inside the loop, so
 * the page issued 1 + 2N queries for N areas. Fixed by
 * `ticketing.allCategoriesByArea`, which reads the whole tree in two queries
 * and groups it in memory.
 *
 * Deliberately a narrow, lexical check rather than an AST-based one, to match
 * the rest of `./check` — it flags a query textually inside a loop/callback
 * span for human review, not a proven-unbounded one. A loop over a short,
 * fixed literal (a handful of statuses) is not the failure mode this guards
 * against; add it to EXEMPT below with a reason rather than restructuring
 * code that was never going to scale badly.
 */
import { readdirSync, readFileSync, statSync } from "node:fs"
import { join, relative } from "node:path"

const ROOT = new URL("..", import.meta.url).pathname
const SCAN = ["apps/web/src"]

/**
 * Known instances reviewed and judged safe, each with a reason. Keyed on
 * `file:<trimmed source text of the LOOP/CALLBACK opener line>`, not a line
 * number — an unrelated edit earlier in the same file renumbers every line
 * below it, and a line-number key would then either false-negative-hide a
 * NEW violation that drifted onto the old number, or false-positive-orphan
 * an exemption that is still perfectly valid. The opener's own source text
 * moves with it. A committed literal either way, never a filter: a new
 * violation still fails, and removing a stale exemption is a reviewed edit.
 */
const EXEMPT = new Set([
  // Each inserts one line item per journal entry/invoice/bill in THIS
  // request — bounded by how many lines a person put on one document, not by
  // how large the table has grown. A multi-thousand-line document would be
  // slow regardless of batching (that many rows to type), so this is a real
  // inefficiency but not the scale failure mode this check targets.
  "apps/web/src/lib/server/accounting/accounting.repo.ts:for (const line of live) {", // journal_entry_lines
  "apps/web/src/lib/server/accounting/accounting.repo.ts:for (const line of input.lines) {", // invoice_lines
  "apps/web/src/lib/server/accounting/payables.repo.ts:for (const line of input.lines) {", // bill_lines

  // A number-generation race retries a FIXED 5 times, never more, regardless
  // of how large the invoices table is — the bound is a literal in the loop
  // head, not a row count.
  "apps/web/src/lib/server/accounting/accounting.repo.ts:for (let attempt = 0; attempt < 5 && invoiceId === undefined; attempt++) {",

  // Bounded by how many bank accounts the firm has on file
  // (NOT_SCALE_SENSITIVE), not by transaction volume — a batched `= ANY(...)`
  // form was measurably SLOWER here: a window function's top-1-per-partition
  // still has to walk every row of whichever account has the most
  // transactions before it can move to the next partition, where a literal
  // `ORDER BY ... LIMIT 1` per account lets the planner seek straight to it.
  "apps/web/src/lib/server/accounting/payables.repo.ts:for (const id of accountIds) {",

  // Bounded by how many deferred-revenue/prepaid schedules are due at once
  // (NOT_SCALE_SENSITIVE), same reasoning as generateDueInvoices' own
  // per-schedule postJournal call just above.
  "apps/web/src/lib/server/accounting/accounting.repo.ts:for (const sched of due) {",
])

function* tsFiles(dir) {
  for (const name of readdirSync(dir)) {
    const full = join(dir, name)
    if (statSync(full).isDirectory()) yield* tsFiles(full)
    // Not `.test.ts` — a test loops over a small, fixed fixture on purpose;
    // the failure mode this check targets is a table growing over time,
    // which a test suite's own row count never does.
    else if (name.endsWith(".ts") && !name.endsWith(".test.ts")) yield full
  }
}

function lineAt(src, index) {
  return src.slice(0, index).split("\n").length
}

/** The trimmed text of the line containing `index` — used as a exemption key that survives the file's OTHER lines being renumbered. */
function lineTextAt(src, index) {
  const start = src.lastIndexOf("\n", index) + 1
  const end = src.indexOf("\n", index)
  return src.slice(start, end === -1 ? src.length : end).trim()
}

/** From an opening brace/paren index, the index of its match — simple depth counting, ignoring braces/parens inside strings or comments is not attempted (matches the rest of ./check's lexical checks: false positives are reviewed, not silently absorbed). */
function matchingClose(src, openIndex, openChar, closeChar) {
  let depth = 0
  for (let i = openIndex; i < src.length; i++) {
    if (src[i] === openChar) depth++
    else if (src[i] === closeChar && --depth === 0) return i
  }
  return -1
}

/** Loop constructs and array-iteration callbacks that run their body/callback once per element — the shape that turns one query into N. */
const LOOP_OPENERS = [
  /\bfor\s*(?:await\s*)?\(/g,
  /\bwhile\s*\(/g,
  /\.(?:map|forEach|flatMap|filter|reduce)\s*\(/g,
]

/** Every loop/callback span in a file: [start, end, openLine]. Body span is brace-matched when the construct has a `{`; otherwise (a concise arrow, e.g. `.map(x => tx\`...\`)`), it falls back to the enclosing call's own paren-matched span. */
function loopSpans(src) {
  const spans = []
  for (const re of LOOP_OPENERS) {
    for (const m of src.matchAll(re)) {
      const parenOpen = m.index + m[0].length - 1
      const parenClose = matchingClose(src, parenOpen, "(", ")")
      if (parenClose === -1) continue
      // A `for`/`while` head's `{` follows its closing `)`; a callback's own
      // body brace (if any) is INSIDE the parens already captured above.
      const isForOrWhile = m[0].trimStart().startsWith("for") || m[0].trimStart().startsWith("while")
      if (isForOrWhile) {
        const rest = src.slice(parenClose + 1)
        const braceOffset = rest.search(/\S/)
        if (braceOffset !== -1 && rest[braceOffset] === "{") {
          const braceOpen = parenClose + 1 + braceOffset
          const braceClose = matchingClose(src, braceOpen, "{", "}")
          if (braceClose !== -1) spans.push([braceOpen, braceClose, m.index])
          continue
        }
        // Braceless `for (...) tx\`...\`` — a single statement is the body;
        // conservatively treat the rest of the line as the span.
        const eol = src.indexOf("\n", parenClose)
        spans.push([parenClose, eol === -1 ? src.length : eol, m.index])
      } else {
        // `.map(...)` etc — the callback's braces, if any, sit inside the
        // call's own parens; using the whole call span is simplest and
        // correctly conservative (a query anywhere in the call arguments IS
        // per-iteration, since it's the callback being invoked N times).
        spans.push([parenOpen, parenClose, m.index])
      }
    }
  }
  return spans
}

/** Every `tx\`...\`` / `tx<Row[]>\`...\`` / `tx.unsafe(...)` call's start index. `tx<...>` is the DOMINANT shape — "type every tx query that crosses into a page" is a stated convention here — so a plain `tx\`` regex silently misses most calls in this codebase, not a rare edge case. No backtick can appear inside the generic's `<...>` (it's a TS type, not a template literal), so greedily matching up to the next `>` before the mandatory backtick is safe even for a nested generic. */
function queryStarts(src) {
  const starts = []
  for (const m of src.matchAll(/\btx\s*(?:<[^`]*>)?\s*`/g)) starts.push(m.index)
  for (const m of src.matchAll(/\btx\.unsafe\s*\(/g)) starts.push(m.index)
  return starts
}

const offenders = []
const exemptUsed = new Set()
for (const dir of SCAN) {
  for (const file of tsFiles(join(ROOT, dir))) {
    const src = readFileSync(file, "utf8")
    const spans = loopSpans(src)
    if (spans.length === 0) continue
    const rel = relative(ROOT, file)
    for (const qStart of queryStarts(src)) {
      for (const [bodyStart, bodyEnd, openerIndex] of spans) {
        if (qStart > bodyStart && qStart < bodyEnd) {
          const openerLine = lineAt(src, openerIndex)
          const key = `${rel}:${lineTextAt(src, openerIndex)}`
          if (EXEMPT.has(key)) {
            exemptUsed.add(key)
            break
          }
          offenders.push({
            key: `${rel}:${openerLine}`,
            queryLine: lineAt(src, qStart),
          })
          break // one report per query, even if loops nest
        }
      }
    }
  }
}

for (const key of EXEMPT) {
  if (!exemptUsed.has(key)) {
    offenders.push({ key, queryLine: "orphaned exemption — no query found there any more" })
  }
}

if (offenders.length) {
  console.error(`\n  ${offenders.length} quer${offenders.length === 1 ? "y" : "ies"} issued inside a loop or iteration callback:\n`)
  for (const o of offenders) {
    console.error(`    ${o.key}  (query at line ${o.queryLine})`)
  }
  console.error(
    "\n  Each round trip here runs once per element — fine on a dozen fixture" +
      "\n  rows, not once the table holds thousands. Batch into one query" +
      "\n  (fetch everything, group in memory) or, if the loop bound is small" +
      "\n  and fixed regardless of data size, add it to EXEMPT in" +
      "\n  scripts/verify-no-loop-queries.mjs with a reason.\n",
  )
  process.exit(1)
}
console.log("  no query issued inside a loop or iteration callback")
