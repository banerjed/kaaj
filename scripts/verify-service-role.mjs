#!/usr/bin/env node
/**
 * The service-role client is reachable from a committed list of files, and
 * from nowhere else.
 *
 * `PRIVATE_SUPABASE_SERVICE_ROLE` bypasses RLS entirely — every policy in
 * `supabase/migrations/`, every tenant predicate, every row-visibility rule
 * added since. It was attached to `event.locals` on every request and declared
 * on `App.Locals`, which put it one destructure away from any handler in the
 * product and made `locals: { supabaseServiceRole }` look like ordinary
 * request state rather than the thing that turns tenant isolation off.
 *
 * It is now imported, and importing is a diff a reviewer sees. This step is
 * what keeps that true: a new importer fails until somebody adds it here with
 * a reason, and removing a justified one fails too. A committed literal, like
 * every other exemption register in this repo — a pattern-based rule would
 * silently absorb the next call site, which is exactly what it exists to stop.
 *
 * What it does NOT check: whether a permitted file uses the client correctly.
 * That is a review question. This proves only that the list of files able to
 * ask the question is the list somebody agreed to.
 */
import { readdirSync, readFileSync, statSync } from "node:fs"
import { join, relative } from "node:path"

const ROOT = new URL("..", import.meta.url).pathname
const SCAN = ["apps/web/src"]
const MODULE = "$lib/server/supabase_service_role"

/**
 * Files allowed to reach past RLS, each with the reason.
 *
 * Every one of these is SaaS-starter billing and account plumbing that acts on
 * `auth.users` and Stripe records — rows that have no `tenant_id` and so no
 * policy to satisfy. No route under `(app)` is on this list, and a product
 * feature that thinks it needs to be is a modelling question first.
 */
const PERMITTED = new Map([
  [
    "apps/web/src/routes/(marketing)/contact_us/+page.server.ts",
    "writes a contact request from an anonymous visitor; there is no session to scope it to",
  ],
  [
    "apps/web/src/routes/(admin)/account/api/+page.server.ts",
    "auth.admin.deleteUser — account deletion acts on auth.users, not a tenant row",
  ],
  [
    "apps/web/src/routes/(admin)/account/subscribe/[slug]/+page.server.ts",
    "billing: creates the Stripe customer id",
  ],
  [
    "apps/web/src/routes/(admin)/account/(menu)/billing/+page.server.ts",
    "billing: reads the subscription for the signed-in account",
  ],
  [
    "apps/web/src/routes/(admin)/account/(menu)/billing/manage/+page.server.ts",
    "billing: opens the Stripe portal for the signed-in account",
  ],
])

/**
 * Comments stripped before scanning.
 *
 * Without this the rule matched its own explanation: the note on `App.Locals`
 * describing why the client is NOT there contains the identifier, and the
 * check reported the file that documents the rule as the file breaking it.
 */
function code(src) {
  return src
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/(^|[^:])\/\/[^\n]*/g, "$1")
}

function* sourceFiles(dir) {
  for (const name of readdirSync(dir)) {
    const full = join(dir, name)
    if (statSync(full).isDirectory()) yield* sourceFiles(full)
    else if (/\.(ts|svelte|js)$/.test(name) && !name.endsWith(".test.ts")) {
      yield full
    }
  }
}

const importers = []
for (const d of SCAN) {
  for (const file of sourceFiles(join(ROOT, d))) {
    const src = code(readFileSync(file, "utf8"))
    const rel = relative(ROOT, file)
    // The module itself defines the client; it is not one of its importers.
    if (rel === "apps/web/src/lib/server/supabase_service_role.ts") continue
    // An import of the module, or any surviving route back onto `locals` —
    // putting it there again is the regression this exists to catch.
    if (src.includes(MODULE) || /locals\b[^\n]*supabaseServiceRole/.test(src)) {
      importers.push(rel)
    }
  }
}

const unlisted = importers.filter((f) => !PERMITTED.has(f))
const stale = [...PERMITTED.keys()].filter((f) => !importers.includes(f))

// A `.svelte` file importing it would ship a service-role key to the browser.
const clientSide = importers.filter((f) => f.endsWith(".svelte"))

if (unlisted.length || stale.length || clientSide.length) {
  if (clientSide.length) {
    console.error(
      `\n  ${clientSide.length} COMPONENT(S) reference the service-role client:\n`,
    )
    for (const f of clientSide) console.error(`    ${f}`)
    console.error(
      "\n  A .svelte file is compiled for the BROWSER. This would ship a key" +
        "\n  that bypasses every policy in the schema. There is no exemption.\n",
    )
  }
  if (unlisted.length) {
    console.error(`\n  ${unlisted.length} unlisted file(s) reach past RLS:\n`)
    for (const f of unlisted) console.error(`    ${f}`)
    console.error(
      "\n  The service role bypasses tenant isolation and every row-visibility" +
        "\n  policy. Add the file to PERMITTED in scripts/verify-service-role.mjs" +
        "\n  with the reason it cannot use `withTenant(actorFrom(locals))`, or" +
        "\n  use the tenant-scoped client.\n",
    )
  }
  if (stale.length) {
    console.error(`\n  ${stale.length} permitted file(s) no longer use it:\n`)
    for (const f of stale) console.error(`    ${f}`)
    console.error("\n  Remove them from PERMITTED — the list is the claim.\n")
  }
  process.exit(1)
}

console.log(
  `  service role reachable from ${importers.length} committed file(s), none under (app)`,
)
