/**
 * node --test scripts/provision-tenant.test.mjs
 *
 * The pure and refusal cases always run. The database cases need a throwaway
 * Postgres SUPERUSER connection (never a real project) in PROVISION_TEST_PG,
 * e.g. postgresql://postgres@127.0.0.1:54339 — they create and drop their own
 * databases and are skipped without it. Not part of ./check.
 */
import assert from "node:assert/strict"
import { randomBytes, randomUUID } from "node:crypto"
import { describe, it, before, after } from "node:test"
import {
  ProvisionError,
  appUserUrl,
  createProject,
  generatePassword,
  latestMigration,
  migrate,
  ownerUrl,
  provision,
  psql,
  psqlEnv,
  validateSubdomain,
  waitUntilHealthy,
  withLogin,
} from "./provision-tenant.mjs"
import {
  openConnectionUrl,
  parseKeyRing,
} from "../apps/web/src/lib/server/db/sealed-secret.js"

const KEK = `1:${randomBytes(32).toString("base64")}`
const DEV_KEK = "1:xZqNWwsCOqE17r/jdVQN2zca+L1Ztdop48xeCxAcxr0="

describe("inputs", () => {
  it("accepts ordinary subdomains", () => {
    for (const s of ["acme", "a", "acme-co", "a1-b2"]) validateSubdomain(s)
  })
  it("refuses what cannot be a DNS label or is reserved", () => {
    for (const s of [
      "",
      undefined,
      "-acme",
      "acme-",
      "Acme",
      "a.b",
      "a_b",
      "x".repeat(64),
      "www",
      "admin",
    ]) {
      assert.throws(() => validateSubdomain(s), ProvisionError, String(s))
    }
  })
  it("generates distinct, URL-safe passwords", () => {
    const a = generatePassword()
    assert.notEqual(a, generatePassword())
    assert.match(a, /^[A-Za-z0-9_-]{32}$/)
  })
})

describe("connection strings", () => {
  it("builds the pooler and direct app_user URLs", () => {
    const base = {
      ref: "abcd",
      password: "p@ss/word",
      poolerHost: "pool.example.com",
    }
    assert.equal(
      appUserUrl({ ...base, mode: "pooler" }),
      "postgresql://app_user.abcd:p%40ss%2Fword@pool.example.com:6543/postgres",
    )
    assert.equal(
      appUserUrl({ ...base, mode: "direct" }),
      "postgresql://app_user:p%40ss%2Fword@db.abcd.supabase.co:5432/postgres",
    )
  })
  it("builds the owner URL and swaps a login without touching host or database", () => {
    assert.equal(
      ownerUrl({ ref: "abcd", password: "x y" }),
      "postgresql://postgres:x%20y@db.abcd.supabase.co:5432/postgres",
    )
    assert.equal(
      withLogin("postgresql://postgres@h:5439/db1", "app_user", "pw"),
      "postgresql://app_user:pw@h:5439/db1",
    )
  })
  it("gives psql its password through the environment, never argv", () => {
    const env = psqlEnv("postgresql://u:p%40w@db.example.com:6543/postgres")
    assert.deepEqual(
      [
        env.PGHOST,
        env.PGPORT,
        env.PGUSER,
        env.PGPASSWORD,
        env.PGDATABASE,
        env.PGSSLMODE,
      ],
      ["db.example.com", "6543", "u", "p@w", "postgres", "require"],
    )
    assert.equal(psqlEnv("postgresql://u@127.0.0.1/x").PGSSLMODE, "prefer")
  })
})

describe("Supabase Management API", () => {
  const ok = (body) => ({
    ok: true,
    status: 200,
    json: async () => body,
    text: async () => "",
  })
  it("creates a project with the region and a bearer token", async () => {
    let seen
    const id = await createProject({
      token: "tok",
      orgSlug: "org",
      name: "kaaj-acme",
      dbPass: "pw",
      region: "us-east-1",
      fetch: async (url, init) => (
        (seen = { url, init }),
        ok({ id: "ref123" })
      ),
    })
    assert.equal(id, "ref123")
    assert.equal(seen.url, "https://api.supabase.com/v1/projects")
    assert.equal(seen.init.headers.authorization, "Bearer tok")
    assert.deepEqual(JSON.parse(seen.init.body), {
      name: "kaaj-acme",
      organization_slug: "org",
      db_pass: "pw",
      region: "us-east-1",
    })
  })
  it("reports a refusal without echoing the token or password", async () => {
    await assert.rejects(
      createProject({
        token: "tok-secret",
        orgSlug: "o",
        name: "n",
        dbPass: "pw-secret",
        region: "r",
        fetch: async () => ({
          ok: false,
          status: 402,
          text: async () => "payment required",
        }),
      }),
      (e) =>
        e instanceof ProvisionError &&
        /402/.test(e.message) &&
        !/secret/.test(e.message),
    )
  })
  it("polls until the project is healthy", async () => {
    const statuses = ["COMING_UP", "COMING_UP", "ACTIVE_HEALTHY"]
    let calls = 0
    await waitUntilHealthy({
      token: "t",
      ref: "r",
      sleep: async () => {},
      fetch: async () => ok({ status: statuses[calls++] }),
    })
    assert.equal(calls, 3)
  })
  it("gives up, naming the project that still exists", async () => {
    await assert.rejects(
      waitUntilHealthy({
        token: "t",
        ref: "ref9",
        attempts: 2,
        sleep: async () => {},
        fetch: async () => ok({ status: "COMING_UP" }),
      }),
      /ref9.*COMING_UP.*still exists/,
    )
  })
})

describe("refusals before anything is touched", () => {
  const base = {
    subdomain: "acme",
    company: "Acme",
    plan: "professional",
    region: "us-east-1",
    tenantId: randomUUID(),
    connection: "pooler",
    vanilla: false,
    dryRun: false,
    sharedUrl: "postgresql://postgres:x@db.prod.example.com:5432/postgres",
    kekRaw: KEK,
    token: "t",
    orgSlug: "o",
  }
  const log = () => {}
  it("needs a company, a shared database and a key ring", async () => {
    await assert.rejects(
      provision({ ...base, company: " " }, { log }),
      /--company/,
    )
    await assert.rejects(
      provision({ ...base, sharedUrl: undefined }, { log }),
      /DATABASE_URL/,
    )
    await assert.rejects(
      provision({ ...base, kekRaw: undefined }, { log }),
      /PRIVATE_PII_KEK/,
    )
  })
  it("refuses to seal a real tenant with the published development key", async () => {
    await assert.rejects(
      provision({ ...base, kekRaw: DEV_KEK }, { log }),
      /development key/,
    )
  })
  it("needs API credentials to create a project", async () => {
    await assert.rejects(
      provision({ ...base, token: undefined }, { log }),
      /SUPABASE_ACCESS_TOKEN/,
    )
    await assert.rejects(
      provision({ ...base, orgSlug: undefined }, { log }),
      /SUPABASE_ORG_SLUG/,
    )
  })
})

const PG = process.env.PROVISION_TEST_PG
describe("against a throwaway database", { skip: !PG }, () => {
  const suffix = randomBytes(4).toString("hex")
  const sharedDb = `pt_shared_${suffix}`
  const tenantDb = (n) => `pt_tenant_${suffix}_${n}`
  const at = (db) => `${PG}/${db}`
  const admin = at("postgres")
  const created = []
  const make = (db) => (psql(admin, `CREATE DATABASE ${db}`), created.push(db))
  const registry = () =>
    psql(at(sharedDb), "SELECT count(*) FROM tenant_registry")
  const opts = (n, extra = {}) => ({
    subdomain: `t${suffix}${n}`,
    company: `Tenant ${n}`,
    plan: "professional",
    region: "us-east-1",
    tenantId: randomUUID(),
    connection: "pooler",
    vanilla: true,
    dryRun: false,
    ownerUrl: at(tenantDb(n)),
    sharedUrl: at(sharedDb),
    kekRaw: KEK,
    ...extra,
  })

  before(() => {
    make(sharedDb)
    migrate({ url: at(sharedDb), vanilla: true })
    for (const n of [1, 2, 3, 4]) make(tenantDb(n))
  })
  after(() => {
    for (const db of created)
      psql(admin, `DROP DATABASE IF EXISTS ${db} WITH (FORCE)`)
  })

  it("--dry-run writes nothing", async () => {
    const lines = []
    const r = await provision(opts(1, { dryRun: true }), {
      log: (m) => lines.push(m),
    })
    assert.equal(r.dryRun, true)
    assert.equal(registry(), "0")
    assert.equal(
      psql(at(tenantDb(1)), "SELECT to_regclass('public.tenants') IS NULL"),
      "t",
    )
  })

  it("provisions a tenant: migrated, registered, sealed, readable as app_user", async () => {
    const o = opts(2)
    const lines = []
    await provision(o, { log: (m) => lines.push(m) })

    const row = psql(
      at(sharedDb),
      `SELECT tier || '|' || status || '|' || schema_version || '|' || region FROM tenant_registry WHERE tenant_id = '${o.tenantId}'`,
    )
    assert.equal(row, `dedicated|active|${latestMigration()}|us-east-1`)

    const ref = psql(
      at(sharedDb),
      `SELECT connection_secret_ref FROM tenant_registry WHERE tenant_id = '${o.tenantId}'`,
    )
    const ring = parseKeyRing(KEK)
    const dsn = openConnectionUrl(ref, o.tenantId, (v) => ring.get(v))
    assert.match(dsn, /^postgresql:\/\/app_user:/)
    assert.equal(new URL(dsn).pathname.slice(1), tenantDb(2))
    assert.equal(psql(dsn, "SELECT 1"), "1")
    assert.notEqual(new URL(dsn).username, "postgres")

    // a working login, but no owner powers
    assert.throws(
      () => psql(dsn, "CREATE TABLE should_not_exist (x int)"),
      /psql failed/,
    )
    // the tenant's own database holds its own tenant row
    assert.equal(
      psql(
        at(tenantDb(2)),
        `SELECT count(*) FROM tenants WHERE id = '${o.tenantId}'`,
      ),
      "1",
    )

    // no output line or stored value exposes the password or the plaintext DSN
    const password = decodeURIComponent(new URL(dsn).password)
    for (const text of [...lines, ref]) {
      assert.ok(!text.includes(password), "password leaked")
      assert.ok(!text.includes("postgresql://"), "connection string leaked")
    }
  })

  it("refuses a subdomain or tenant id that is already taken, changing nothing", async () => {
    const first = opts(3)
    await provision(first, { log: () => {} })
    const before = registry()
    await assert.rejects(
      provision(
        { ...opts(3), tenantId: randomUUID(), subdomain: first.subdomain },
        { log: () => {} },
      ),
      /a tenant with subdomain/,
    )
    await assert.rejects(
      provision(
        {
          ...opts(3),
          tenantId: first.tenantId,
          subdomain: `x${first.subdomain}`,
        },
        { log: () => {} },
      ),
      /a tenant with subdomain/,
    )
    assert.equal(registry(), before)
  })

  it("registers nothing when the tenant cannot be created in its own database", async () => {
    const before = registry()
    await assert.rejects(
      provision(opts(4, { plan: "not-a-plan" }), { log: () => {} }),
      /psql failed/,
    )
    assert.equal(registry(), before)
  })

  it("refuses to seal with the dev key when the shared database is not local", async () => {
    await assert.rejects(
      provision(
        {
          ...opts(4),
          kekRaw: DEV_KEK,
          sharedUrl: `postgresql://postgres@db.example.com/${sharedDb}`,
        },
        { log: () => {} },
      ),
      /development key/,
    )
  })
})
