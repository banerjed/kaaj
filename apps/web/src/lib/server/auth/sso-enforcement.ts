import type { AMREntry } from "@supabase/supabase-js"

/**
 * "SSO required" is enforced here (hooks.server.ts), not by hiding the
 * login UI (ADR-010) — extracted as a pure predicate because hooks.server.ts
 * itself is awkward to unit-test directly.
 *
 * SAML: `amr` distinguishes an SSO sign-in from a password one
 * (`amr[0].method === "sso/saml"`). A custom OIDC provider signs in through
 * the same generic OAuth flow as any other provider, so `amr` alone cannot
 * tell one OAuth connection from another — this checks the session's actual
 * identity provider against the tenant's configured one instead.
 */
export function isSsoSatisfied(
  tenant: {
    ssoRequired: boolean
    ssoProviderType: "saml" | "oidc" | null
    ssoProviderRef: string | null
  },
  auth: {
    amr: AMREntry[] | null
    identityProvider: string | null
  },
): boolean {
  if (!tenant.ssoRequired) return true
  if (!tenant.ssoProviderType || !tenant.ssoProviderRef) return true // malformed config — nothing to enforce against

  if (tenant.ssoProviderType === "saml") {
    return auth.amr?.[0]?.method === "sso/saml"
  }
  return auth.identityProvider === tenant.ssoProviderRef
}
