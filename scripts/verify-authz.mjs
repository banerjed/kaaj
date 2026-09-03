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
/**
 * The WHOLE route tree, not just `(app)`.
 *
 * It used to scan `(app)` alone, which meant an action added under `(admin)`
 * or `(marketing)` — or any `+server.ts` endpoint anywhere — was invisible to
 * the step whose name claims every action is guarded. `+server.ts` matches
 * nothing today (there are no HTTP verb handlers in the app), and the glob is
 * here so the first one cannot arrive unnoticed.
 */
const ROUTES = join(ROOT, "apps/web/src/routes")
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

/**
 * action path -> why it needs no check. Reviewed edits only.
 *
 * Everything here runs BEFORE a tenant exists, which is why `requireCan` has
 * nothing to ask about: `can()` takes an actor with a tenant and a role, and
 * these actors have neither yet. They are the SaaS-starter account and
 * marketing surfaces, not product routes — no `(app)` action is exempt, and
 * one asking to be is a design question first.
 */
const EXEMPT = new Map([
  [
    "apps/web/src/routes/(marketing)/contact_us/+page.server.ts -> submitContactUs",
    "an anonymous visitor; there is no session, let alone a tenant",
  ],
  [
    "apps/web/src/routes/(admin)/account/api/+page.server.ts -> updateEmail",
    "acts on the signed-in auth user's own account, before any tenant",
  ],
  [
    "apps/web/src/routes/(admin)/account/api/+page.server.ts -> updatePassword",
    "the account's own password",
  ],
  [
    "apps/web/src/routes/(admin)/account/api/+page.server.ts -> deleteAccount",
    "the account deletes itself; auth.users, not a tenant row",
  ],
  [
    "apps/web/src/routes/(admin)/account/api/+page.server.ts -> updateProfile",
    "the account's own profile",
  ],
  [
    "apps/web/src/routes/(admin)/account/api/+page.server.ts -> signout",
    "ends the session it is called with",
  ],
  [
    "apps/web/src/routes/(admin)/account/(menu)/+page.server.ts -> signout",
    "ends the session it is called with; takes no input",
  ],
  [
    "apps/web/src/routes/(admin)/account/api/+page.server.ts -> toggleEmailSubscription",
    "the account's own marketing preference — filtered on session.user.id, through the RLS-scoped client, with no id taken from the form",
  ],
])

const GUARD = /\brequireCan\(|\bcan\(\s*ctx\b|\bcanReadEmployee\(/
/**
 * Every write in this codebase reaches Postgres through `withTenant` — it is
 * the one place a transaction opens, and CLAUDE.md requires the actor on all
 * of them. So "before the first `withTenant(`" is "before the write" without
 * having to parse which repository calls actually mutate.
 */
const WRITE_ENTRY = /\bwithTenant\(/

/**
 * Comments stripped before either regex runs, so a guard mentioned only in a
 * comment cannot satisfy the presence check, and a stray `//` cannot shift
 * where a real one appears to sit.
 */
function code(src) {
  return src
    .replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, " "))
    .replace(/(^|[^:])\/\/[^\n]*/g, "$1")
}

function* serverFiles(dir) {
  for (const name of readdirSync(dir)) {
    const full = join(dir, name)
    if (statSync(full).isDirectory()) yield* serverFiles(full)
    else if (name === "+page.server.ts" || name === "+server.ts") yield full
  }
}

const problems = []
/**
 * authz/guard-before-write — the guard's own regex match must sit before the
 * first `withTenant(` in the action body. Coverage (does a guard appear
 * anywhere) was the cheap half; this is the ordering the name of the step
 * actually promises. It stays a lexical check, same as the rest of this file:
 * a guard reached only through a helper this script cannot see into is a
 * review question, not something a regex should claim to settle.
 */
const misordered = []
const deletions = []
let checked = 0

for (const file of serverFiles(ROUTES)) {
  const src = readFileSync(file, "utf8")
  const start = src.indexOf("export const actions")
  if (start === -1) continue

  // Each action runs from its own `name: async (` to the next one.
  const region = src.slice(start)
  const heads = [...region.matchAll(/^ {2}(\w+): async \(/gm)]
  for (const [i, head] of heads.entries()) {
    const rawBody = region.slice(
      head.index,
      i + 1 < heads.length ? heads[i + 1].index : region.length,
    )
    const body = code(rawBody)
    const id = `${relative(ROOT, file)} -> ${head[1]}`
    checked++
    if (EXEMPT.has(id)) continue

    const guardAt = body.search(GUARD)
    if (guardAt === -1) {
      problems.push(id)
      continue
    }
    const writeAt = body.search(WRITE_ENTRY)
    if (writeAt !== -1 && guardAt > writeAt) misordered.push(id)
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

for (const dir of [SERVER, ROUTES]) {
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
if (misordered.length) {
  console.error(
    `\n  ${misordered.length} action(s) authorize AFTER their first withTenant(...):\n`,
  )
  for (const m of misordered) console.error(`    ${m}`)
  console.error(
    "\n  A guard that runs after the transaction has already opened is not a" +
      "\n  guard — move requireCan(...) (or the matching check) above the first" +
      "\n  withTenant(...) call in this action.\n",
  )
  process.exit(1)
}
if (stale.length && checked === 0) {
  console.error("  no actions found — the scanner is looking in the wrong place")
  process.exit(1)
}
console.log(
  `  ${checked} actions guarded, in order; no DELETE outside ${DELETE_ALLOWED.size} allowed file(s)`,
)
