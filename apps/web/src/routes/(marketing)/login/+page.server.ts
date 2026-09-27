import { redirect } from "@sveltejs/kit"
import type { Provider } from "@supabase/supabase-js"
import type { PageServerLoad } from "./$types"
import {
  extractSubdomain,
  resolveTenantBySubdomain,
} from "$lib/server/db/subdomain"
import { log } from "$lib/server/log"

type SsoRouting = {
  required: boolean
  providerType: "saml" | "oidc"
  redirectUrl: string
}

/**
 * Resolves the tenant from the request's subdomain BEFORE offering sign-in
 * options (ADR-010) — an SSO-only tenant never sees the password form. Every
 * failure in `resolveSso` (no subdomain, no matching tenant, no SSO
 * configured, or the provider call itself failing) falls through to today's
 * page unchanged: this path runs before anyone is authenticated and must
 * never be capable of breaking login for the vast majority of tenants that
 * never configured SSO. `redirect()` throws by design, so it happens here,
 * OUTSIDE `resolveSso`'s try/catch — never accidentally swallowed as a
 * "failed" lookup.
 */
export const load: PageServerLoad = async ({ url, locals }) => {
  const subdomain = extractSubdomain(url.hostname)
  if (!subdomain) return { sso: null }

  const sso = await resolveSso(subdomain, locals.supabase, url)
  if (!sso) return { sso: null }
  if (sso.required) redirect(303, sso.redirectUrl)
  return { sso }
}

async function resolveSso(
  subdomain: string,
  supabase: App.Locals["supabase"],
  url: URL,
): Promise<SsoRouting | null> {
  try {
    const tenant = await resolveTenantBySubdomain(subdomain)
    if (!tenant?.ssoProviderRef || !tenant.ssoProviderType) return null

    const redirectUrl =
      tenant.ssoProviderType === "saml"
        ? await startSamlSignIn(supabase, tenant.ssoProviderRef)
        : await startOidcSignIn(supabase, tenant.ssoProviderRef, url)
    if (!redirectUrl) return null

    return {
      required: tenant.ssoRequired,
      providerType: tenant.ssoProviderType,
      redirectUrl,
    }
  } catch (e) {
    log.warn({
      msg: "SSO routing lookup failed; falling back to normal login",
      subdomain,
      error: e instanceof Error ? e.message : String(e),
    })
    return null
  }
}

async function startSamlSignIn(
  supabase: App.Locals["supabase"],
  providerId: string,
): Promise<string | null> {
  const { data, error } = await supabase.auth.signInWithSSO({ providerId })
  if (error || !data?.url) return null
  return data.url
}

async function startOidcSignIn(
  supabase: App.Locals["supabase"],
  provider: string,
  url: URL,
): Promise<string | null> {
  const { data, error } = await supabase.auth.signInWithOAuth({
    // The SDK's `Provider` union only lists its built-in OAuth providers;
    // a custom OIDC connection is addressed by the `custom:<identifier>`
    // string we registered it under, per Supabase's own custom-provider
    // docs — the REST call accepts it even though the type doesn't.
    provider: provider as Provider,
    options: {
      redirectTo: `${url.origin}/auth/callback`,
      skipBrowserRedirect: true,
    },
  })
  if (error || !data?.url) return null
  return data.url
}
