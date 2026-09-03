#!/usr/bin/env node
/**
 * No query may read a row-protected value from an unprotected copy of it —
 * e.g. `COALESCE(cp.amount, e.base_amount_pvt)` silently falls back to the
 * unprotected cache for anyone the policy restricts (L47). Two rules: no
 * qualified read of a cache column at all, and no COALESCE onto one (matched
 * on balanced parens, since a naive regex misses a nested call). SQL comments
 * are stripped first so this rule doesn't trip on itself.
 */
import { readdirSync, readFileSync, statSync } from "node:fs"
import { join, relative } from "node:path"

const ROOT = new URL("..", import.meta.url).pathname
const DIRS = ["apps/web/src/routes", "apps/web/src/lib/server"]

/** The disclosure matrix names these columns to declare them protected; it issues no queries, so exclude it from the scan. */
const NOT_QUERY_CODE = ["apps/web/src/lib/server/security/matrix.ts"]

/**
 * Columns on the broadly-visible `employees` row that must never reach a
 * projection — RLS can't hide them, so this list is the only defense. Kept
 * in step with `defense: "projection"` in matrix.ts by disclosure.test.ts.
 */
const CACHE_COLUMNS = [
  "base_amount_pvt",
  "currency",
  "pay_frequency",
  "salary_structure_pvt",
  "variable_compensation_pvt",
  "compensation_band_pvt",
  "default_hourly_rate_pvt",
  "default_billable_rate_pvt",
  "tax_withholding_pvt",
  "benefits_elections_pvt",
]
/** Aliases that mean the `employees` table in these queries. */
const EMPLOYEE_ALIASES = ["e", "employees", "m"]

/** "file:line" -> why it is allowed. Empty, deliberately. */
const EXEMPT = new Map([])

function* tsFiles(dir) {
  for (const name of readdirSync(dir)) {
    const full = join(dir, name)
    if (statSync(full).isDirectory()) yield* tsFiles(full)
    else if (name.endsWith(".ts") && !name.endsWith(".test.ts")) yield full
  }
}

/**
 * Blank out every comment — SQL `--`, and JavaScript `//` and block comments —
 * preserving offsets and newlines so reported line numbers stay true.
 *
 * All three matter: the rule is explained at its own call sites and in the
 * JSDoc above `correct()`, and a guard that trips on prose about itself is a
 * guard people delete.
 */
const stripComments = (src) =>
  src.replace(/\/\*[\s\S]*?\*\/|\/\/[^\n]*|--[^\n]*/g, (m) =>
    m.replace(/[^\n]/g, " "),
  )

/** The argument list of each COALESCE, split on top-level commas. */
function* coalesceArgs(src) {
  const re = /COALESCE\s*\(/gi
  let m
  while ((m = re.exec(src))) {
    let depth = 1
    let i = m.index + m[0].length
    const start = i
    for (; i < src.length && depth > 0; i++) {
      if (src[i] === "(") depth++
      else if (src[i] === ")") depth--
    }
    if (depth !== 0) continue // unbalanced; not our problem to report
    const body = src.slice(start, i - 1)

    const args = []
    let d = 0
    let last = 0
    for (let j = 0; j < body.length; j++) {
      if (body[j] === "(") d++
      else if (body[j] === ")") d--
      else if (body[j] === "," && d === 0) {
        args.push(body.slice(last, j))
        last = j + 1
      }
    }
    args.push(body.slice(last))
    yield { index: m.index, args }
  }
}

const found = []
const lineOf = (src, index) => src.slice(0, index).split("\n").length

for (const d of DIRS) {
  for (const file of tsFiles(join(ROOT, d))) {
    const rel = relative(ROOT, file)
    if (NOT_QUERY_CODE.includes(rel)) continue
    const raw = readFileSync(file, "utf8")
    const src = stripComments(raw)

    const report = (index, why) => {
      const at = `${rel}:${lineOf(src, index)}`
      if (EXEMPT.has(at)) return
      found.push(`${at}  ->  ${why}`)
    }

    // Rule 1 — any qualified read of a cache column.
    for (const col of CACHE_COLUMNS) {
      for (const alias of EMPLOYEE_ALIASES) {
        const re = new RegExp(`\\b${alias}\\.${col}\\b`, "g")
        let m
        while ((m = re.exec(src))) report(m.index, `${alias}.${col} is read`)
      }
    }

    // Rule 2 — COALESCE onto an unprotected copy, at any nesting depth.
    for (const { index, args } of coalesceArgs(src)) {
      for (const arg of args.slice(1)) {
        for (const col of CACHE_COLUMNS) {
          for (const alias of EMPLOYEE_ALIASES) {
            if (!arg.includes(`${alias}.${col}`)) continue
            report(index, `COALESCE falls back to ${alias}.${col}`)
          }
        }
      }
    }
  }
}

// One site can trip both rules; report each place once.
const unique = [...new Set(found)]

if (unique.length) {
  console.error(`\n  ${unique.length} unprotected read(s) of a cached value:\n`)
  for (const f of unique) console.error(`    ${f}`)
  console.error(
    "\n  RLS hides the ROW; reading the cache puts the VALUE back. Read the" +
      "\n  protected column alone and let it be NULL — a blank figure is the" +
      "\n  correct answer for someone who may not see it." +
      "\n  See docs/15-row-level-visibility.md and L47.\n",
  )
  process.exit(1)
}
console.log("  no unprotected read of a cached value")
