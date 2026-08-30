#!/usr/bin/env node
/**
 * Application-code rules that no SQL harness can see.
 *
 *   authz/actions-are-guarded — every form action authorizes before it writes
 *   deletion/no-delete-in-app — no repository issues a DELETE
 *
 * docs/14-access-control.md.
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
const SERVER = join(ROOT, "apps/web/src/lib/server")

/**
 * Records are retained, never destroyed — payroll history and statutory
 * retention both depend on the row still being there, and a deleted row cannot
 * be un-deleted by a support call. `app_user` no longer holds DELETE (see
 * 20260830120000_append_only.sql), so a stray DELETE now fails at runtime with
 * 42501; this catches it at review time instead, and names the one place where
 * destruction is the point.
 */
const DELETE_ALLOWED = new Map([
  [
    "apps/web/src/lib/server/pii/pii.repo.ts",
    "GDPR Art. 17 — destroying the key IS the erasure, and it reaches backups",
  ],
])

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
const deletions = []
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

// -- deletion/no-delete-in-app ------------------------------------------------
function* tsFiles(dir) {
  for (const name of readdirSync(dir)) {
    const full = join(dir, name)
    if (statSync(full).isDirectory()) yield* tsFiles(full)
    else if (name.endsWith(".ts") && !name.endsWith(".test.ts")) yield full
  }
}

for (const dir of [SERVER, APP]) {
  for (const file of tsFiles(dir)) {
    const rel = relative(ROOT, file)
    if (DELETE_ALLOWED.has(rel)) continue
    const src = readFileSync(file, "utf8")
    for (const m of src.matchAll(/DELETE\s+FROM\s+(\w+)/gi)) {
      deletions.push(`${rel} -> DELETE FROM ${m[1]}`)
    }
  }
}

if (deletions.length) {
  console.error(`\n  ${deletions.length} DELETE statement(s) in application code:\n`)
  for (const d of deletions) console.error(`    ${d}`)
  console.error(
    "\n  Records are retained, never destroyed. Archive the row instead" +
      "\n  (SET is_active = FALSE), or add the file to DELETE_ALLOWED in" +
      "\n  scripts/verify-authz.mjs with a reason." +
      "\n  See supabase/migrations/20260830120000_append_only.sql.\n",
  )
  process.exit(1)
}

// A stale allowance is as much a defect as a missing guard.
for (const [file, reason] of DELETE_ALLOWED) {
  const src = readFileSync(join(ROOT, file), "utf8")
  if (!/DELETE\s+FROM/i.test(src)) {
    console.error(
      `\n  ${file} is allowed to DELETE (${reason}) but no longer does.` +
        "\n  Remove it from DELETE_ALLOWED.\n",
    )
    process.exit(1)
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
console.log(
  `  ${checked} actions guarded; no DELETE outside ${DELETE_ALLOWED.size} allowed file(s)`,
)
