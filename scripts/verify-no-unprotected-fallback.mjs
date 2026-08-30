#!/usr/bin/env node
/**
 * No query may COALESCE a row-protected column onto an unprotected copy.
 *
 * `compensation_base` carries a row-visibility policy; `employees.base_amount`
 * is a denormalised cache of the same figure and carries none. A query written
 * as `COALESCE(cp.amount, e.base_amount)` therefore reads correctly to whoever
 * writes it and, for anyone the policy restricts, silently substitutes the
 * unprotected copy. Every employee could read every colleague's salary from
 * the directory page, with no error anywhere (L47).
 *
 * The pattern generalises beyond pay, which is why this is a rule rather than
 * one deleted line: RLS hides ROWS, and a fallback reintroduces the VALUE.
 *
 * Exemptions are committed literals with reasons, never a filter — the same
 * standing rule as every other harness here. A fallback between two columns
 * that are equally protected is fine and belongs on this list.
 */
import { readdirSync, readFileSync, statSync } from "node:fs"
import { join, relative } from "node:path"

const ROOT = new URL("..", import.meta.url).pathname
const DIRS = ["apps/web/src/routes", "apps/web/src/lib/server"]

/**
 * Columns that exist ONLY on an unprotected table while the authoritative
 * value lives behind a policy. Falling back to one of these is the bug.
 */
const UNPROTECTED_COPIES = [
  "e.base_amount",
  "e.currency",
  "e.pay_frequency",
  "employees.base_amount",
  "employees.currency",
  "employees.pay_frequency",
]

/** file:line -> why it is allowed. Empty, deliberately. */
const EXEMPT = new Map([])

function* tsFiles(dir) {
  for (const name of readdirSync(dir)) {
    const full = join(dir, name)
    if (statSync(full).isDirectory()) yield* tsFiles(full)
    else if (name.endsWith(".ts") && !name.endsWith(".test.ts")) yield full
  }
}

const found = []
for (const d of DIRS) {
  for (const file of tsFiles(join(ROOT, d))) {
    const src = readFileSync(file, "utf8")
    // COALESCE(..., <unprotected copy>) — any argument position after the
    // first, since the first is the protected source being defended.
    for (const m of src.matchAll(/COALESCE\s*\(([^)]*)\)/gi)) {
      const args = m[1].split(",").slice(1)
      for (const copy of UNPROTECTED_COPIES) {
        if (!args.some((a) => a.trim().startsWith(copy))) continue
        const line = src.slice(0, m.index).split("\n").length
        const at = `${relative(ROOT, file)}:${line}`
        if (EXEMPT.has(at)) continue
        found.push(`${at}  ->  ${copy}`)
      }
    }
  }
}

if (found.length) {
  console.error(
    `\n  ${found.length} query/queries fall back to an unprotected copy:\n`,
  )
  for (const f of found) console.error(`    ${f}`)
  console.error(
    "\n  RLS hides the ROW; a COALESCE reintroduces the VALUE. Read the" +
      "\n  protected column alone and let it be NULL — a blank figure is the" +
      "\n  correct answer for someone who may not see it." +
      "\n  See docs/15-row-level-visibility.md and L47.\n",
  )
  process.exit(1)
}
console.log("  no fallback onto an unprotected copy")
