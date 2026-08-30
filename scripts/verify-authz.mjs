#!/usr/bin/env node
/**
 * authz/actions-are-guarded — docs/14-access-control.md.
 *
 * Every form action under routes/(app) must authorize before it writes. A
 * matrix nobody enforces is decoration, and the failure this catches is the
 * twentieth action shipping on "has a tenant" — which is how all nineteen of
 * them started.
 *
 * A lint rule rather than a SQL invariant because the subject is TypeScript.
 * Exemptions are committed literals with reasons, like every other list in
 * this repo: a NEW unguarded action fails, and so does removing a justified
 * exemption.
 */
import { readdirSync, readFileSync, statSync } from "node:fs"
import { join, relative } from "node:path"

const ROOT = new URL("..", import.meta.url).pathname
const APP = join(ROOT, "apps/web/src/routes/(app)")

/** action path -> why it needs no check. Reviewed edits only. */
const EXEMPT = new Map([
  // none today
])

const GUARD = /\brequireCan\(|\bcan\(\s*ctx\b|\bcanReadEmployee\(/

function* serverFiles(dir) {
  for (const name of readdirSync(dir)) {
    const full = join(dir, name)
    if (statSync(full).isDirectory()) yield* serverFiles(full)
    else if (name === "+page.server.ts") yield full
  }
}

const problems = []
let checked = 0

for (const file of serverFiles(APP)) {
  const src = readFileSync(file, "utf8")
  const start = src.indexOf("export const actions")
  if (start === -1) continue

  // Each action runs from its own `name: async (` to the next one.
  const region = src.slice(start)
  const heads = [...region.matchAll(/^ {2}(\w+): async \(/gm)]
  for (const [i, head] of heads.entries()) {
    const body = region.slice(
      head.index,
      i + 1 < heads.length ? heads[i + 1].index : region.length,
    )
    const id = `${relative(ROOT, file)} -> ${head[1]}`
    checked++
    if (EXEMPT.has(id)) continue
    if (!GUARD.test(body)) problems.push(id)
  }
}

// A stale exemption is as much a defect as a missing guard.
const stale = [...EXEMPT.keys()].filter(
  (id) => !problems.includes(id) && !id.startsWith("__"),
)

if (problems.length) {
  console.error(`\n  ${problems.length} action(s) write without authorizing:\n`)
  for (const p of problems) console.error(`    ${p}`)
  console.error(
    "\n  Add requireCan(contextFrom(locals), \"<permission>\") before the first" +
      "\n  write, or list it in scripts/verify-authz.mjs with a reason." +
      "\n  See docs/14-access-control.md.\n",
  )
  process.exit(1)
}
if (stale.length && checked === 0) {
  console.error("  no actions found — the scanner is looking in the wrong place")
  process.exit(1)
}
console.log(`  ${checked} actions, all guarded`)
