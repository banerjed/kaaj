/**
 * node --test scripts/configure-tenant-sso.test.mjs
 *
 * Mirrors provision-tenant.test.mjs's shape: pure/refusal/mocked-fetch cases
 * always run. The one database case needs a throwaway Postgres SUPERUSER
 * connection in PROVISION_TEST_PG (e.g. postgresql://postgres@127.0.0.1:54339)
 * and is skipped without it. Not part of ./check.
 */
import assert from "node:assert/strict"
import { randomBytes, randomUUID } from "node:crypto"
import { describe, it, before, after } from "node:test"
import {
  SsoConfigError,
  configure,
  registerOidcProvider,
  registerSamlProvider,
} from "./configure-tenant-sso.mjs"
import { psql } from "./provision-tenant.mjs"

const ok = (body) => ({
  ok: true,
  status: 200,
  json: async () => body,
  text: async () => "",
})

describe("GoTrue admin requests", () => {
  it("registers a SAML provider by metadata URL, with the service-role headers", async () => {
    let seen
    const id = await registerSamlProvider({
      supabaseUrl: "https://xyz.supabase.co",
      serviceRoleKey: "sr-key",
      metadataUrl: "https://idp.example.com/metadata",
      domains: ["acme.com"],
      fetch: async (url, init) => ((seen = { url, init }), ok({ id: "prov-1" })),
    })
    assert.equal(id, "prov-1")
    assert.equal(seen.url, "https://xyz.supabase.co/auth/v1/admin/sso/providers")
    assert.equal(seen.init.headers.apikey, "sr-key")
    assert.equal(seen.init.headers.authorization, "Bearer sr-key")
    assert.deepEqual(JSON.parse(seen.init.body), {
      type: "saml",
      metadata_url: "https://idp.example.com/metadata",
      domains: ["acme.com"],
    })
  })

  it("refuses a SAML registration with neither metadata source", async () => {
    await assert.rejects(
      registerSamlProvider({
        supabaseUrl: "https://xyz.supabase.co",
        serviceRoleKey: "sr-key",
        domains: ["acme.com"],
      }),
      SsoConfigError,
    )
  })

  it("reports a SAML refusal without echoing the service-role key", async () => {
    await assert.rejects(
      registerSamlProvider({
        supabaseUrl: "https://xyz.supabase.co",
        serviceRoleKey: "sr-key-secret",
        metadataUrl: "https://idp.example.com/metadata",
        domains: ["acme.com"],
        fetch: async () => ({
          ok: false,
          status: 400,
          text: async () => "invalid metadata",
        }),
      }),
      (e) =>
        e instanceof SsoConfigError &&
        /400/.test(e.message) &&
        !/secret/.test(e.message),
    )
  })

  it("registers a custom OIDC provider with the identifier the caller chose", async () => {
    let seen
    const identifier = await registerOidcProvider({
      supabaseUrl: "https://xyz.supabase.co",
      serviceRoleKey: "sr-key",
      identifier: "custom:acme",
      name: "Acme Corp",
      issuer: "https://auth.acme.com",
      clientId: "cid",
      clientSecret: "csecret",
      fetch: async (url, init) => (
        (seen = { url, init }), ok({ identifier: "custom:acme" })
      ),
    })
    assert.equal(identifier, "custom:acme")
    assert.equal(
      seen.url,
      "https://xyz.supabase.co/auth/v1/admin/custom-providers",
    )
    assert.deepEqual(JSON.parse(seen.init.body), {
      provider_type: "oidc",
      identifier: "custom:acme",
      name: "Acme Corp",
      issuer: "https://auth.acme.com",
      client_id: "cid",
      client_secret: "csecret",
      scopes: ["openid", "profile", "email"],
    })
  })
})

describe("refusals before anything is touched", () => {
  const base = {
    tenantId: randomUUID(),
    type: "saml",
    dbUrl: "postgresql://postgres:x@db.prod.example.com:5432/postgres",
    supabaseUrl: "https://xyz.supabase.co",
    serviceRoleKey: "sr-key",
    domains: ["acme.com"],
    metadataUrl: "https://idp.example.com/metadata",
  }
  const log = () => {}

  it("needs a tenant id and a real type", async () => {
    await assert.rejects(
      configure({ ...base, tenantId: undefined }, { log }),
      /--tenant-id/,
    )
    await assert.rejects(
      configure({ ...base, type: "ldap" }, { log }),
      /--type/,
    )
  })

  it("needs the database and Supabase environment set", async () => {
    await assert.rejects(
      configure({ ...base, dbUrl: undefined }, { log }),
      /DATABASE_URL/,
    )
    await assert.rejects(
      configure({ ...base, supabaseUrl: undefined }, { log }),
      /PUBLIC_SUPABASE_URL/,
    )
    await assert.rejects(
      configure({ ...base, serviceRoleKey: undefined }, { log }),
      /PRIVATE_SUPABASE_SERVICE_ROLE/,
    )
  })

  it("SAML needs at least one domain and a metadata source", async () => {
    await assert.rejects(
      configure({ ...base, domains: [] }, { log }),
      /--domains/,
    )
    await assert.rejects(
      configure({ ...base, metadataUrl: undefined }, { log }),
      /metadata-url/,
    )
  })

  it("OIDC needs its own required fields", async () => {
    const oidcBase = {
      ...base,
      type: "oidc",
      domains: [],
      metadataUrl: undefined,
      identifier: "acme",
      name: "Acme Corp",
      issuer: "https://auth.acme.com",
      clientId: "cid",
      clientSecret: "csecret",
    }
    await assert.rejects(
      configure({ ...oidcBase, identifier: undefined }, { log }),
      /--identifier/,
    )
    await assert.rejects(
      configure({ ...oidcBase, clientSecret: undefined }, { log }),
      /--client-secret/,
    )
  })
})

const PG = process.env.PROVISION_TEST_PG
describe("against a throwaway database", { skip: !PG }, () => {
  const suffix = randomBytes(4).toString("hex")
  const dbName = `configure_sso_test_${suffix}`
  const tenantId = randomUUID()
  let dbUrl

  before(() => {
    psql(PG, `CREATE DATABASE ${dbName}`)
    const u = new URL(PG)
    u.pathname = `/${dbName}`
    dbUrl = u.toString()
    psql(
      dbUrl,
      `CREATE TABLE tenant_registry (
         tenant_id uuid PRIMARY KEY,
         sso_provider_type text,
         sso_provider_ref text,
         sso_required boolean NOT NULL DEFAULT false,
         sso_permitted_domains text[] NOT NULL DEFAULT '{}'
       );
       INSERT INTO tenant_registry (tenant_id) VALUES (:'tenant_id');`,
      { tenant_id: tenantId },
    )
  })

  after(() => {
    psql(PG, `DROP DATABASE IF EXISTS ${dbName}`)
  })

  it("registers the provider and records it against the tenant's row", async () => {
    const result = await configure(
      {
        tenantId,
        type: "saml",
        required: true,
        dbUrl,
        supabaseUrl: "https://xyz.supabase.co",
        serviceRoleKey: "sr-key",
        domains: ["acme.com"],
        metadataUrl: "https://idp.example.com/metadata",
      },
      {
        log: () => {},
        registerSamlProvider: async () => "prov-xyz",
      },
    )
    assert.equal(result.providerRef, "prov-xyz")

    const row = psql(
      dbUrl,
      `SELECT sso_provider_type, sso_provider_ref, sso_required, sso_permitted_domains::text
         FROM tenant_registry WHERE tenant_id = :'tenant_id'`,
      { tenant_id: tenantId },
    )
    assert.equal(row, "saml|prov-xyz|t|{acme.com}")
  })

  it("refuses a tenant with no tenant_registry row", async () => {
    await assert.rejects(
      configure(
        {
          tenantId: randomUUID(),
          type: "saml",
          dbUrl,
          supabaseUrl: "https://xyz.supabase.co",
          serviceRoleKey: "sr-key",
          domains: ["acme.com"],
          metadataUrl: "https://idp.example.com/metadata",
        },
        { log: () => {}, registerSamlProvider: async () => "prov-xyz" },
      ),
      /no tenant_registry row/,
    )
  })
})
