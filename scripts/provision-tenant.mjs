#!/usr/bin/env node
/**
 * Provision one premium tenant onto its own Supabase project (ADR-009,
 * docs/24-deployment-and-pooling.md §5).
 *
 *   node scripts/provision-tenant.mjs --subdomain acme --company "Acme Inc"
 *
 * What it does, in order — each step refuses rather than overwrites:
 *   1. checks the inputs, the shared database and that the subdomain is free
 *   2. creates a Supabase project in the tenant's region (Management API)
 *   3. applies the migrations to it
 *   4. sets a generated password on `app_user` and proves it can connect
 *   5. seals that connection string under PRIVATE_PII_KEK and registers the
 *      tenant in the shared database's tenant_registry, in one transaction
 *
 * Nothing needs adding to the app host: a sealed connection string is read
 * from tenant_registry (apps/web/src/lib/server/db/secrets.ts), and the
 * wildcard DNS record already covers `<subdomain>.<base domain>`.
 *
 * NOT done here: the tenant's first owner login. The owner's auth user and
 * employee row are created through the app's own flow.
 *
 * Environment:
 *   DATABASE_URL              shared database, as the OWNER (the control plane)
 *   PRIVATE_PII_KEK           the app's master key ring; seals the connection string
 *   SUPABASE_ACCESS_TOKEN     Management API token          (project mode)
 *   SUPABASE_ORG_SLUG         organization to create it in  (project mode)
 *   SUPABASE_POOLER_HOST      default aws-0-us-east-1.pooler.supabase.com
 *   SUPABASE_DIRECT_HOST      default db.<ref>.supabase.co
 *   APP_BASE_DOMAIN           only used to print the tenant's URL
 *
 * Against a database that already exists (or a throwaway one for testing),
 * pass --owner-url instead of creating a project. Add --vanilla when that
 * database is plain Postgres rather than a Supabase project.
 *
 * Never prints a connection string or password. The project's owner password
 * is not retained anywhere: reset it in the Supabase dashboard when you next
 * need to migrate that project.
 */
import { execFileSync } from "node:child_process"
import { randomBytes, randomUUID } from "node:crypto"
import { readdirSync, readFileSync } from "node:fs"
import { parseArgs } from "node:util"
import {
  newestKey,
  parseKeyRing,
  sealConnectionUrl,
} from "../apps/web/src/lib/server/db/sealed-secret.js"

const ROOT = new URL("..", import.meta.url).pathname
const API = "https://api.supabase.com/v1"
const RESERVED = new Set([
  "www",
  "api",
  "app",
  "admin",
  "portal",
  "mail",
  "static",
  "auth",
])
const PUBLISHED_DEV_KEY = "xZqNWwsCOqE17r/jdVQN2zca+L1Ztdop48xeCxAcxr0="
const LOCAL_HOST = /^(127\.0\.0\.1|localhost|::1)$/

export class ProvisionError extends Error {}
const fail = (message) => {
  throw new ProvisionError(message)
}

// --- pure helpers (unit-tested in provision-tenant.test.mjs) ---------------

export function validateSubdomain(subdomain) {
  if (!/^[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?$/.test(subdomain ?? "")) {
    fail(
      "--subdomain must be 1-63 characters of a-z, 0-9 and '-', not starting or ending with '-'",
    )
  }
  if (RESERVED.has(subdomain)) fail(`"${subdomain}" is reserved`)
}

export const generatePassword = () => randomBytes(24).toString("base64url")

/** The connection the application uses: app_user, through the pooler or direct. */
export function appUserUrl({ ref, password, mode, poolerHost, directHost }) {
  const pw = encodeURIComponent(password)
  return mode === "direct"
    ? `postgresql://app_user:${pw}@${directHost ?? `db.${ref}.supabase.co`}:5432/postgres`
    : `postgresql://app_user.${ref}:${pw}@${poolerHost}:6543/postgres`
}

export function ownerUrl({ ref, password, directHost }) {
  return `postgresql://postgres:${encodeURIComponent(password)}@${directHost ?? `db.${ref}.supabase.co`}:5432/postgres`
}

/** Same host/port/database, different login — for a database that already exists. */
export function withLogin(url, user, password) {
  const u = new URL(url)
  u.username = user
  u.password = password
  return u.toString()
}

/** Connection settings for psql via the environment, so no password appears in `ps`. */
export function psqlEnv(url) {
  const u = new URL(url)
  return {
    ...process.env,
    PGHOST: u.hostname,
    PGPORT: u.port || "5432",
    PGUSER: decodeURIComponent(u.username),
    PGPASSWORD: decodeURIComponent(u.password),
    PGDATABASE: u.pathname.slice(1) || "postgres",
    PGSSLMODE: LOCAL_HOST.test(u.hostname) ? "prefer" : "require",
  }
}

export function latestMigration() {
  return readdirSync(`${ROOT}supabase/migrations`)
    .filter((f) => f.startsWith("2026") && f.endsWith(".sql"))
    .sort()
    .at(-1)
    .split("_")[0]
}

// --- Supabase Management API (fetch is injectable for tests) ----------------

export async function createProject({
  fetch = globalThis.fetch,
  token,
  orgSlug,
  name,
  dbPass,
  region,
}) {
  const res = await fetch(`${API}/projects`, {
    method: "POST",
    headers: {
      authorization: `Bearer ${token}`,
      "content-type": "application/json",
    },
    body: JSON.stringify({
      name,
      organization_slug: orgSlug,
      db_pass: dbPass,
      region,
    }),
  })
  if (!res.ok)
    fail(
      `Supabase refused to create the project (HTTP ${res.status}): ${await safeText(res)}`,
    )
  const body = await res.json()
  if (!body?.id) fail("Supabase's response had no project id")
  return body.id
}

export async function waitUntilHealthy({
  fetch = globalThis.fetch,
  token,
  ref,
  sleep = (ms) => new Promise((r) => setTimeout(r, ms)),
  attempts = 60,
  intervalMs = 5000,
}) {
  let status = "unknown"
  for (let i = 0; i < attempts; i++) {
    const res = await fetch(`${API}/projects/${ref}`, {
      headers: { authorization: `Bearer ${token}` },
    })
    if (res.ok) {
      status = (await res.json()).status
      if (status === "ACTIVE_HEALTHY") return
    }
    await sleep(intervalMs)
  }
  fail(
    `Project ${ref} did not become healthy (last status: ${status}). It still exists — finish or delete it in the Supabase dashboard.`,
  )
}

async function safeText(res) {
  try {
    return (await res.text()).slice(0, 300)
  } catch {
    return ""
  }
}

// --- database steps ----------------------------------------------------------

export function psql(url, sql, vars = {}) {
  const args = ["-X", "-q", "-tA", "-v", "ON_ERROR_STOP=1"]
  for (const [k, v] of Object.entries(vars)) args.push("-v", `${k}=${v}`)
  try {
    return execFileSync("psql", args, {
      env: psqlEnv(url),
      input: sql,
      encoding: "utf8",
      stdio: ["pipe", "pipe", "pipe"],
    }).trim()
  } catch (e) {
    // psql's stderr can quote a statement; the connection string is never in it.
    fail(
      `psql failed: ${
        String(e.stderr ?? e.message)
          .trim()
          .split("\n")[0]
      }`,
    )
  }
}

export function migrate({ url, vanilla }) {
  if (vanilla) {
    psql(url, readFileSync(`${ROOT}scripts/vanilla-postgres-stubs.sql`, "utf8"))
    const dir = `${ROOT}supabase/migrations`
    for (const f of readdirSync(dir)
      .filter((n) => n.endsWith(".sql"))
      .sort()) {
      psql(url, readFileSync(`${dir}/${f}`, "utf8"))
    }
    return
  }
  try {
    execFileSync("supabase", ["db", "push", "--db-url", url, "--yes"], {
      cwd: ROOT,
      stdio: "inherit",
    })
  } catch {
    fail(
      "`supabase db push` failed — the project exists and is partly migrated; fix and re-run with --owner-url",
    )
  }
}

/** app_user gets a fresh generated password; returns nothing, throws if the login does not work. */
async function setAppUserPassword({
  owner,
  appUrl,
  password,
  retries = 10,
  sleep = (ms) => new Promise((r) => setTimeout(r, ms)),
}) {
  psql(owner, `ALTER ROLE app_user WITH PASSWORD :'pw'`, { pw: password })
  for (let i = 0; i < retries; i++) {
    try {
      if (psql(appUrl, "SELECT 1") === "1") return
    } catch (e) {
      if (i === retries - 1) throw e
    }
    await sleep(3000)
  }
}

const TENANT_INSERT = `INSERT INTO tenants (id, subdomain, company_name, region, plan_tier, is_active)
  VALUES (:'tenant_id', :'subdomain', :'company', :'region', :'plan', TRUE)`

/** The tenant reads its own tenants row as app_user, with the claim RLS needs — exactly as the app will. */
function verifyAsAppUser(appUrl, tenantId) {
  const claims = JSON.stringify({ app_metadata: { tenant_id: tenantId } })
  const out = psql(
    appUrl,
    `BEGIN; SELECT set_config('request.jwt.claims', :'claims', true); SELECT count(*) FROM tenants WHERE id = :'tenant_id'; COMMIT;`,
    { claims, tenant_id: tenantId },
  )
  if (!out.split("\n").some((l) => l.trim() === "1")) {
    fail(
      "app_user cannot read the tenant's own row in its new database — RLS or grants are wrong; nothing was registered",
    )
  }
}

// --- main --------------------------------------------------------------------

export async function provision(opts, deps = {}) {
  const log = deps.log ?? ((m) => console.log(m))
  const {
    subdomain,
    company,
    plan,
    region,
    tenantId,
    connection,
    vanilla,
    dryRun,
    ownerUrl: givenOwnerUrl,
    sharedUrl,
    kekRaw,
  } = opts

  validateSubdomain(subdomain)
  if (!company?.trim()) fail("--company is required")
  if (!sharedUrl)
    fail("DATABASE_URL (the shared database, as owner) is not set")
  const ring = parseKeyRing(kekRaw)
  const sealingKey = newestKey(ring)
  const sharedHost = new URL(sharedUrl).hostname
  if (
    !LOCAL_HOST.test(sharedHost) &&
    sealingKey.key.toString("base64") === PUBLISHED_DEV_KEY
  ) {
    fail(
      "PRIVATE_PII_KEK is the development key published in this repository; refusing to seal a real tenant's connection string with it",
    )
  }
  const projectMode = !givenOwnerUrl
  if (projectMode) {
    if (!opts.token)
      fail(
        "SUPABASE_ACCESS_TOKEN is not set (or pass --owner-url for an existing database)",
      )
    if (!opts.orgSlug) fail("SUPABASE_ORG_SLUG is not set")
  }

  log("==> checking the shared database")
  const taken = psql(
    sharedUrl,
    `SELECT count(*) FROM tenants WHERE subdomain = :'subdomain' OR id = :'tenant_id'`,
    { subdomain, tenant_id: tenantId },
  )
  if (taken !== "0")
    fail(
      `a tenant with subdomain "${subdomain}" or id ${tenantId} already exists`,
    )
  const schemaVersion = latestMigration()

  if (dryRun) {
    log(
      `==> dry run: nothing written. Would ${projectMode ? `create a Supabase project in ${region}` : "use the database at --owner-url"}, migrate to ${schemaVersion}, and register ${subdomain} (${tenantId}) as dedicated.`,
    )
    return { dryRun: true, tenantId }
  }

  let owner = givenOwnerUrl
  let appUrl
  let ref = null
  const appPassword = generatePassword()

  if (projectMode) {
    const dbPass = generatePassword()
    log(`==> creating a Supabase project in ${region}`)
    ref = await (deps.createProject ?? createProject)({
      token: opts.token,
      orgSlug: opts.orgSlug,
      name: `kaaj-${subdomain}`,
      dbPass,
      region,
    })
    log(`    project ${ref}; waiting for it to become healthy`)
    await (deps.waitUntilHealthy ?? waitUntilHealthy)({
      token: opts.token,
      ref,
    })
    owner = ownerUrl({ ref, password: dbPass, directHost: opts.directHost })
    appUrl = appUserUrl({
      ref,
      password: appPassword,
      mode: connection,
      poolerHost: opts.poolerHost,
      directHost: opts.directHost,
    })
  } else {
    appUrl = withLogin(givenOwnerUrl, "app_user", appPassword)
  }

  log("==> applying migrations")
  migrate({ url: owner, vanilla })
  if (psql(owner, "SELECT to_regclass('public.tenants') IS NOT NULL") !== "t") {
    fail("migrations ran but the tenants table is missing in the new database")
  }

  log("==> setting app_user's password and proving it can log in")
  await setAppUserPassword({
    owner,
    appUrl,
    password: appPassword,
    sleep: deps.sleep,
  })

  log("==> seeding the tenant's own row in its database")
  const vars = { tenant_id: tenantId, subdomain, company, region, plan }
  psql(owner, `${TENANT_INSERT};`, vars)
  verifyAsAppUser(appUrl, tenantId)

  log("==> registering in the shared database")
  const sealed = sealConnectionUrl(
    appUrl,
    tenantId,
    sealingKey.version,
    sealingKey.key,
  )
  psql(
    sharedUrl,
    `BEGIN;
     ${TENANT_INSERT};
     INSERT INTO tenant_registry (tenant_id, subdomain, tier, connection_secret_ref, region, schema_version, status, last_health_check_at)
     VALUES (:'tenant_id', :'subdomain', 'dedicated', :'sealed', :'region', :'schema_version', 'active', now());
     COMMIT;`,
    { ...vars, sealed, schema_version: schemaVersion },
  )

  const url = opts.baseDomain
    ? `https://${subdomain}.${opts.baseDomain}`
    : `<subdomain>.<your domain>`
  log("")
  log(
    `==> done: ${company} (${subdomain}) is on its own database${ref ? ` (Supabase project ${ref})` : ""}`,
  )
  log(`    tenant id ${tenantId}   ·   ${url}`)
  log("    Still to do: create the tenant's first owner login through the app.")
  log(
    "    The project's owner password was not stored; reset it in the Supabase dashboard before the next migration.",
  )
  return { tenantId, ref }
}

function main() {
  const { values: v } = parseArgs({
    options: {
      subdomain: { type: "string" },
      company: { type: "string" },
      plan: { type: "string", default: "professional" },
      region: { type: "string", default: "us-east-1" },
      "tenant-id": { type: "string" },
      connection: { type: "string", default: "pooler" },
      "owner-url": { type: "string" },
      vanilla: { type: "boolean", default: false },
      "dry-run": { type: "boolean", default: false },
    },
  })
  if (!["pooler", "direct"].includes(v.connection))
    fail("--connection must be pooler or direct")
  const env = process.env
  return provision({
    subdomain: v.subdomain,
    company: v.company,
    plan: v.plan,
    region: v.region,
    tenantId: v["tenant-id"] ?? randomUUID(),
    connection: v.connection,
    ownerUrl: v["owner-url"],
    vanilla: v.vanilla,
    dryRun: v["dry-run"],
    sharedUrl: env.DATABASE_URL,
    kekRaw: env.PRIVATE_PII_KEK,
    token: env.SUPABASE_ACCESS_TOKEN,
    orgSlug: env.SUPABASE_ORG_SLUG,
    poolerHost:
      env.SUPABASE_POOLER_HOST ?? "aws-0-us-east-1.pooler.supabase.com",
    directHost: env.SUPABASE_DIRECT_HOST,
    baseDomain: env.APP_BASE_DOMAIN,
  })
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((e) => {
    console.error(`\n  ${e instanceof ProvisionError ? e.message : e.stack}\n`)
    process.exit(1)
  })
}
