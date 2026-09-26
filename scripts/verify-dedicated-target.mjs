#!/usr/bin/env node
/**
 * A dedicated tenant's database is only as isolated as it is real. This
 * verifies every `tenant_registry` row with tier='dedicated' — never just
 * asserted, always connected to — against the shared database's ADR-009
 * control plane (`DATABASE_URL`).
 *
 * A tenant_registry row with no matching, reachable, correctly-migrated
 * database is exactly the "second database silently drifted" failure a
 * demo of this feature would otherwise have no way to catch: every other
 * step in ./check resolves one DATABASE_URL and never looks at a second one.
 *
 * No dedicated tenant provisioned yet (a fresh clone, or CI) is not a
 * failure — packages/database/scripts/provision-dedicated-db.sh is an
 * explicit, opt-in demo step, not baseline fixture data.
 */
import { execFileSync } from "node:child_process"
import { readdirSync, readFileSync } from "node:fs"
import {
  isSealedRef,
  openConnectionUrl,
  parseKeyRing,
} from "../apps/web/src/lib/server/db/sealed-secret.js"

const ROOT = new URL("..", import.meta.url).pathname
const SHARED_URL =
  process.env.DATABASE_URL ??
  "postgresql://postgres:postgres@127.0.0.1:54322/postgres"

// SvelteKit loads apps/web/.env.local automatically; a plain node script run
// from ./check does not. Without this, a connection_secret_ref that resolves
// fine inside the app fails here in any shell that hasn't hand-exported it —
// a false "database unreachable" for a purely environmental reason, which
// breaks ./check's own contract of resolving what it needs with no shell setup.
function loadEnvLocal() {
  let text
  try {
    text = readFileSync(`${ROOT}apps/web/.env.local`, "utf8")
  } catch {
    return
  }
  for (const line of text.split("\n")) {
    const trimmed = line.trim()
    if (trimmed === "" || trimmed.startsWith("#")) continue
    const match = trimmed.match(/^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/)
    if (!match) continue
    const [, key, rawValue] = match
    if (process.env[key] !== undefined) continue
    const value = rawValue.replace(/^"(.*)"$/, "$1")
    process.env[key] = value
  }
}
loadEnvLocal()

function psql(url, sql) {
  return execFileSync("psql", [url, "-X", "-tA", "-c", sql], {
    encoding: "utf8",
  }).trim()
}

const rows = psql(
  SHARED_URL,
  "SELECT tenant_id, subdomain, connection_secret_ref, schema_version " +
    "FROM tenant_registry WHERE tier = 'dedicated'",
)
if (rows === "") {
  console.log("  no dedicated tenants provisioned — nothing to verify")
  process.exit(0)
}

// The current migration set this repo actually ships — 2024* are
// CMSaasStarter legacy migrations the dedicated provisioning script
// deliberately does not apply (see its own header comment).
const currentMigrations = readdirSync(`${ROOT}supabase/migrations`)
  .filter((f) => f.startsWith("2026") && f.endsWith(".sql"))
  .sort()
const latestVersion = currentMigrations.at(-1).split("_")[0]

const problems = []

for (const line of rows.split("\n")) {
  const [tenantId, subdomain, secretRef, schemaVersion] = line.split("|")

  let url
  if (isSealedRef(secretRef)) {
    try {
      const ring = parseKeyRing(process.env.PRIVATE_PII_KEK)
      url = openConnectionUrl(secretRef, tenantId, (v) => ring.get(v))
    } catch (e) {
      problems.push(
        `${subdomain}: its sealed connection secret cannot be opened ` +
          `(${e.reason ?? e.message}) — check PRIVATE_PII_KEK holds the key it was sealed with`,
      )
      continue
    }
  } else {
    url = process.env[secretRef]
    if (!url) {
      problems.push(
        `${subdomain}: tenant_registry names secret "${secretRef}", but it is ` +
          "not set in the environment — check apps/web/.env.local",
      )
      continue
    }
  }

  let reachable
  try {
    reachable = psql(url, "SELECT 1")
  } catch (e) {
    problems.push(`${subdomain}: its database is unreachable (${e.message})`)
    continue
  }
  if (reachable !== "1") {
    problems.push(`${subdomain}: unexpected response from its database`)
    continue
  }

  // As the app itself would see it: app_user, with the tenant claim RLS
  // requires — a bare SELECT as app_user with no claim fails closed to zero
  // rows regardless of whether the data is there (correct behavior, but not
  // what this check is verifying).
  const claims = JSON.stringify({ app_metadata: { tenant_id: tenantId } })
  const tenantRowOutput = psql(
    url,
    `BEGIN; SELECT set_config('request.jwt.claims', '${claims}', true); ` +
      `SELECT count(*) FROM tenants WHERE id = '${tenantId}'; COMMIT;`,
  )
  // BEGIN/COMMIT print command tags even in -tA mode, and set_config echoes
  // the claim back — the row count is the one line that's just digits.
  const tenantRow = tenantRowOutput
    .split("\n")
    .map((l) => l.trim())
    .find((l) => /^\d+$/.test(l))
  if (tenantRow !== "1") {
    problems.push(
      `${subdomain}: its database has no row for its own tenant_id — ` +
        "reprovision with provision-dedicated-db.sh",
    )
  }

  if (schemaVersion !== latestVersion) {
    problems.push(
      `${subdomain}: schema_version is ${schemaVersion}, but the repo is on ` +
        `${latestVersion} — this target has drifted behind the current ` +
        "migrations. Apply the pending ones, or update tenant_registry once " +
        "reprovisioned.",
    )
  }
}

if (problems.length > 0) {
  console.error(`\n  ${problems.length} dedicated target(s) failed:\n`)
  for (const p of problems) console.error(`    ${p}`)
  console.error("")
  process.exit(1)
}

console.log(`  ${rows.split("\n").length} dedicated target(s) verified`)
