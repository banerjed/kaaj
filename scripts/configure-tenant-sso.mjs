#!/usr/bin/env node
/**
 * Register a tenant's enterprise identity provider with Supabase Auth and
 * record it in the control plane (ADR-010).
 *
 *   node scripts/configure-tenant-sso.mjs --tenant-id <uuid> --type saml \
 *     --metadata-url 'https://acme.okta.com/app/xxx/sso/saml/metadata' \
 *     --domains acme.com
 *
 *   node scripts/configure-tenant-sso.mjs --tenant-id <uuid> --type oidc \
 *     --identifier acme --name "Acme Corp" \
 *     --issuer 'https://auth.acme.com' \
 *     --client-id xxx --client-secret xxx
 *
 * Calls GoTrue's own admin endpoints directly (POST .../auth/v1/admin/sso/providers
 * for SAML, POST .../auth/v1/admin/custom-providers for OIDC) — the SAME
 * endpoints whether the target is the local dev stack or production, unlike
 * the separate cloud-only Management API (api.supabase.com), which needs a
 * different, higher-privilege org-level token this app has no other use for.
 * Uses the service-role key, so this is operator tooling: IdP registration
 * is deliberately not a self-service tenant-admin page (ADR-010).
 *
 * Add --required to disable password sign-in enforcement for this tenant
 * (checked in hooks.server.ts, not by hiding the login UI). Omit it to add
 * SSO as an option alongside the existing password/OAuth login.
 *
 * Environment:
 *   DATABASE_URL                 shared database, as the OWNER (the control plane)
 *   PUBLIC_SUPABASE_URL          the Supabase project's URL
 *   PRIVATE_SUPABASE_SERVICE_ROLE the project's service-role key
 *
 * Against a database that already exists (or a throwaway one for testing),
 * pass --db-url instead of DATABASE_URL.
 */
import { parseArgs } from "node:util"
import { psql } from "./provision-tenant.mjs"

export class SsoConfigError extends Error {}
const fail = (message) => {
  throw new SsoConfigError(message)
}

async function safeText(res) {
  try {
    return (await res.text()).slice(0, 300)
  } catch {
    return ""
  }
}

// --- GoTrue admin API (fetch is injectable for tests) -----------------------

/** SAML: GoTrue's own SSO provider admin endpoint — same path locally and in production. */
export async function registerSamlProvider({
  fetch = globalThis.fetch,
  supabaseUrl,
  serviceRoleKey,
  metadataUrl,
  metadataXml,
  domains,
}) {
  if (!metadataUrl && !metadataXml) {
    fail("SAML needs either --metadata-url or --metadata-xml")
  }
  const res = await fetch(`${supabaseUrl}/auth/v1/admin/sso/providers`, {
    method: "POST",
    headers: {
      apikey: serviceRoleKey,
      authorization: `Bearer ${serviceRoleKey}`,
      "content-type": "application/json",
    },
    body: JSON.stringify({
      type: "saml",
      ...(metadataUrl ? { metadata_url: metadataUrl } : {}),
      ...(metadataXml ? { metadata_xml: metadataXml } : {}),
      domains,
    }),
  })
  if (!res.ok) {
    fail(
      `Supabase refused to register the SAML provider (HTTP ${res.status}): ${await safeText(res)}`,
    )
  }
  const body = await res.json()
  if (!body?.id) fail("Supabase's response had no provider id")
  return body.id
}

/** OIDC: GoTrue's custom-provider admin endpoint (Supabase's April-2026 Custom OIDC/OAuth Providers feature). */
export async function registerOidcProvider({
  fetch = globalThis.fetch,
  supabaseUrl,
  serviceRoleKey,
  identifier,
  name,
  issuer,
  clientId,
  clientSecret,
}) {
  const res = await fetch(`${supabaseUrl}/auth/v1/admin/custom-providers`, {
    method: "POST",
    headers: {
      apikey: serviceRoleKey,
      authorization: `Bearer ${serviceRoleKey}`,
      "content-type": "application/json",
    },
    body: JSON.stringify({
      provider_type: "oidc",
      identifier,
      name,
      issuer,
      client_id: clientId,
      client_secret: clientSecret,
      scopes: ["openid", "profile", "email"],
    }),
  })
  if (!res.ok) {
    fail(
      `Supabase refused to register the OIDC provider (HTTP ${res.status}): ${await safeText(res)}`,
    )
  }
  const body = await res.json()
  if (!body?.identifier) fail("Supabase's response had no provider identifier")
  return body.identifier
}

// --- main --------------------------------------------------------------------

export async function configure(opts, deps = {}) {
  const log = deps.log ?? ((m) => console.log(m))
  const { tenantId, type, required, dbUrl } = opts

  if (!tenantId) fail("--tenant-id is required")
  if (type !== "saml" && type !== "oidc") fail("--type must be saml or oidc")
  if (!dbUrl) fail("DATABASE_URL (the shared database, as owner) is not set")
  if (!opts.supabaseUrl) fail("PUBLIC_SUPABASE_URL is not set")
  if (!opts.serviceRoleKey) fail("PRIVATE_SUPABASE_SERVICE_ROLE is not set")

  const domains = opts.domains ?? []
  if (type === "saml") {
    if (domains.length === 0) fail("SAML needs at least one --domains value")
    if (!opts.metadataUrl && !opts.metadataXml) {
      fail("SAML needs either --metadata-url or --metadata-xml")
    }
  } else {
    if (!opts.identifier) fail("OIDC needs --identifier")
    if (!opts.name) fail("OIDC needs --name")
    if (!opts.issuer) fail("OIDC needs --issuer")
    if (!opts.clientId) fail("OIDC needs --client-id")
    if (!opts.clientSecret) fail("OIDC needs --client-secret")
  }

  const taken = psql(dbUrl, `SELECT count(*) FROM tenant_registry WHERE tenant_id = :'tenant_id'`, {
    tenant_id: tenantId,
  })
  if (taken !== "1") fail(`no tenant_registry row for tenant ${tenantId}`)

  log(`==> registering the ${type.toUpperCase()} provider with Supabase`)
  const providerRef =
    type === "saml"
      ? await (deps.registerSamlProvider ?? registerSamlProvider)({
          supabaseUrl: opts.supabaseUrl,
          serviceRoleKey: opts.serviceRoleKey,
          metadataUrl: opts.metadataUrl,
          metadataXml: opts.metadataXml,
          domains,
        })
      : await (deps.registerOidcProvider ?? registerOidcProvider)({
          supabaseUrl: opts.supabaseUrl,
          serviceRoleKey: opts.serviceRoleKey,
          identifier: `custom:${opts.identifier}`,
          name: opts.name,
          issuer: opts.issuer,
          clientId: opts.clientId,
          clientSecret: opts.clientSecret,
        })

  log("==> recording it in the control plane")
  psql(
    dbUrl,
    `UPDATE tenant_registry
        SET sso_provider_type = :'type',
            sso_provider_ref = :'ref',
            sso_required = :'required'::boolean,
            sso_permitted_domains = :'domains'::text[]
      WHERE tenant_id = :'tenant_id'`,
    {
      type,
      ref: providerRef,
      required: required ? "true" : "false",
      domains: `{${domains.join(",")}}`,
      tenant_id: tenantId,
    },
  )

  log("")
  log(`==> done: tenant ${tenantId} now has ${type.toUpperCase()} SSO (${providerRef})`)
  log(
    required
      ? "    Required: password sign-in is now refused for this tenant (hooks.server.ts)."
      : "    Optional: shown alongside password sign-in on the login page.",
  )
  return { providerRef }
}

function main() {
  const { values: v } = parseArgs({
    options: {
      "tenant-id": { type: "string" },
      type: { type: "string" },
      required: { type: "boolean", default: false },
      "db-url": { type: "string" },
      // SAML
      "metadata-url": { type: "string" },
      "metadata-xml": { type: "string" },
      domains: { type: "string" },
      // OIDC
      identifier: { type: "string" },
      name: { type: "string" },
      issuer: { type: "string" },
      "client-id": { type: "string" },
      "client-secret": { type: "string" },
    },
  })
  const env = process.env
  return configure({
    tenantId: v["tenant-id"],
    type: v.type,
    required: v.required,
    dbUrl: v["db-url"] ?? env.DATABASE_URL,
    supabaseUrl: env.PUBLIC_SUPABASE_URL,
    serviceRoleKey: env.PRIVATE_SUPABASE_SERVICE_ROLE,
    metadataUrl: v["metadata-url"],
    metadataXml: v["metadata-xml"],
    domains: v.domains ? v.domains.split(",").map((d) => d.trim()) : [],
    identifier: v.identifier,
    name: v.name,
    issuer: v.issuer,
    clientId: v["client-id"],
    clientSecret: v["client-secret"],
  })
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((e) => {
    console.error(`\n  ${e instanceof SsoConfigError ? e.message : e.stack}\n`)
    process.exit(1)
  })
}
