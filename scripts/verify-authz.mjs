#!/usr/bin/env node
/**
 * authz/actions-are-guarded — every form action authorizes before it writes.
 * deletion/no-delete-in-app — no repository issues a DELETE.
 * See docs/14-access-control.md. Exemptions are a committed list with reasons.
 */
import { readdirSync, readFileSync, statSync } from "node:fs"
import { join, relative } from "node:path"

const ROOT = new URL("..", import.meta.url).pathname
/** The whole route tree, not just (app) — an action under (admin)/(marketing) or a +server.ts should not be invisible to this. */
const ROUTES = join(ROOT, "apps/web/src/routes")
const SERVER = join(ROOT, "apps/web/src/lib/server")

/** Records are retained, never destroyed — app_user has no DELETE grant (20260830120000_append_only.sql). */
const DELETE_ALLOWED = new Map([
  [
    "apps/web/src/lib/server/pii/pii.repo.ts",
    "GDPR Art. 17 — destroying the key IS the erasure, and it reaches backups",
  ],
])

/** action path -> why it needs no check. Runs before a tenant exists (account/marketing surfaces, not product routes). Reviewed edits only. */
const EXEMPT = new Map([
  [
    "apps/web/src/routes/(marketing)/contact_us/+page.server.ts -> submitContactUs",
    "an anonymous visitor; there is no session, let alone a tenant",
  ],
  [
    "apps/web/src/routes/portal/login/+page.server.ts -> default",
    "signing in — there is no session yet, let alone a tenant or a permission",
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
/** Every write opens its transaction through withTenant, so "before the first withTenant(" means "before the write". */
const WRITE_ENTRY = /\bwithTenant\(/

/** Comments stripped first, so a guard mentioned only in a comment can't pass. */
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
/** authz/guard-before-write — the guard must sit before the first withTenant( in the body, a lexical check like the rest of this file. */
const misordered = []
const deletions = []
let checked = 0
/** Every action id actually found, exempt or not — lets a stale EXEMPT entry (renamed/removed action) be told apart from a live one. */
const foundIds = new Set()

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
    foundIds.add(id)
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

// A stale exemption is as much a defect as a missing guard: the action it
// names was renamed, moved, or deleted, and the exemption now protects nothing.
const stale = [...EXEMPT.keys()].filter((id) => !foundIds.has(id))

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
if (checked === 0) {
  console.error("  no actions found — the scanner is looking in the wrong place")
  process.exit(1)
}
if (stale.length) {
  console.error(`\n  ${stale.length} exemption(s) name an action that no longer exists:\n`)
  for (const s of stale) console.error(`    ${s}`)
  console.error(
    "\n  The action was renamed, moved, or removed. Remove it from EXEMPT in" +
      "\n  scripts/verify-authz.mjs — the list is a claim about live code.\n",
  )
  process.exit(1)
}
console.log(
  `  ${checked} actions guarded, in order; no DELETE outside ${DELETE_ALLOWED.size} allowed file(s)`,
)
