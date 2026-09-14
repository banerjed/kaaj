#!/usr/bin/env node
/**
 * `PRIVATE_SUPABASE_SERVICE_ROLE` bypasses RLS entirely and is reachable only
 * from a committed list of files, each with a reason — a new importer fails
 * until added here. Does not check whether a permitted file uses the client
 * correctly, only that the list of who may ask is agreed on.
 */
import { execFileSync } from "node:child_process"
import { readdirSync, readFileSync, statSync } from "node:fs"
import { join, relative } from "node:path"

const ROOT = new URL("..", import.meta.url).pathname
const SCAN = ["apps/web/src"]
const MODULE = "$lib/server/supabase_service_role"
/**
 * The actual credential, not just the wrapper module — mailer.ts imported
 * this directly and built a second client, invisible to a check that only
 * looked for MODULE. Catches that shape wherever it recurs.
 */
const RAW_SECRET = /\bPRIVATE_SUPABASE_SERVICE_ROLE\b/

/**
 * Files allowed to reach past RLS. All billing/account plumbing acting on
 * auth.users or Stripe (no tenant_id, so no policy to satisfy) — no (app)
 * route belongs on this list.
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
  [
    "apps/web/src/lib/mailer.ts",
    "auth.admin.getUserById to check email verification before sending — acts on auth.users, not a tenant row",
  ],
])

/** Comments stripped first, or a comment mentioning the identifier would trip the rule. */
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
    // An import of the module, a raw import of the secret it wraps, or any
    // surviving route back onto `locals` — all three are the regression.
    if (
      src.includes(MODULE) ||
      RAW_SECRET.test(src) ||
      /locals\b[^\n]*supabaseServiceRole/.test(src)
    ) {
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

// Importing the module proves nothing about whether a write actually
// succeeds: BYPASSRLS and table-level GRANTs are separate layers, and
// `supabaseServiceRole.from(t).insert(...)` swallows a permission failure
// into `{ error }` rather than throwing, so a caller that doesn't check
// `error` reports success with nothing written (L84). This queries the
// grant, not the RLS-bypass flag — the thing that was actually missing.
const url = process.env.DATABASE_URL
if (!url) {
  console.error("  DATABASE_URL is not set")
  process.exit(1)
}
const grantSql = `
  SELECT c.relname
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
   WHERE n.nspname = 'public' AND c.relkind = 'r'
     AND NOT (
       has_table_privilege('service_role', c.oid, 'SELECT') AND
       has_table_privilege('service_role', c.oid, 'INSERT') AND
       has_table_privilege('service_role', c.oid, 'UPDATE')
     )
   ORDER BY c.relname`
const ungranted = execFileSync("psql", [url, "-X", "-tA", "-c", grantSql], {
  encoding: "utf8",
})
  .trim()
  .split("\n")
  .filter(Boolean)

if (ungranted.length) {
  console.error(
    `\n  ${ungranted.length} table(s) service_role can bypass RLS on but cannot actually write:\n`,
  )
  for (const t of ungranted) console.error(`    ${t}`)
  console.error(
    "\n  BYPASSRLS lets service_role skip every policy; it grants nothing on" +
      "\n  its own. Every table needs SELECT/INSERT/UPDATE granted explicitly —" +
      "\n  see the GRANT + ALTER DEFAULT PRIVILEGES pair in" +
      "\n  20260914090000_service_role_table_grants.sql.\n",
  )
  process.exit(1)
}

console.log(
  `  service role reachable from ${importers.length} committed file(s), none under (app); can write every public table`,
)
