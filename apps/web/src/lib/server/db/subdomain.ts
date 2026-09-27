/**
 * Resolves the tenant a request is for from its hostname, before any
 * session exists (ADR-010) — the login page's only use of this. Deliberately
 * does not import `./tenant` (`withTenant`/`withControlPlane`), same
 * anti-circular-import reason `registry.ts` states for itself.
 */
import { getSharedPool } from "./client"

export type SsoRouting = {
  tenantId: string
  ssoProviderType: "saml" | "oidc" | null
  ssoProviderRef: string | null
  ssoRequired: boolean
}

/**
 * The first label of a tenant subdomain, or `null` for a bare root domain,
 * plain `localhost`, or an IP address — none of those name a tenant.
 * No hardcoded base domain: `config.ts` notes none has been chosen yet, and
 * `.localhost` always resolves to loopback (RFC 6761), so `acme.localhost`
 * needs no `/etc/hosts` entry for local testing.
 */
const IPV4 = /^\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}$/

export function extractSubdomain(hostname: string): string | null {
  const host = hostname.split(":")[0].toLowerCase()
  if (IPV4.test(host) || host === "[::1]" || host === "::1") return null
  const labels = host.split(".")
  if (labels.length < 2) return null
  if (labels.at(-1) === "localhost") {
    return labels.length > 2 ? null : labels[0]
  }
  return labels.length > 2 ? labels[0] : null
}

export async function resolveTenantBySubdomain(
  subdomain: string,
): Promise<SsoRouting | null> {
  const shared = getSharedPool()
  const [row] = await shared.begin<
    {
      tenant_id: string
      sso_provider_type: "saml" | "oidc" | null
      sso_provider_ref: string | null
      sso_required: boolean
    }[]
  >(async (tx) => {
    await tx`SET LOCAL ROLE app_user`
    return tx`SELECT * FROM app.resolve_tenant_by_subdomain(${subdomain})`
  })
  if (!row) return null
  return {
    tenantId: row.tenant_id,
    ssoProviderType: row.sso_provider_type,
    ssoProviderRef: row.sso_provider_ref,
    ssoRequired: row.sso_required,
  }
}
