// src/hooks.server.ts
import {
  PUBLIC_SUPABASE_ANON_KEY,
  PUBLIC_SUPABASE_URL,
} from "$env/static/public"
import { createServerClient } from "@supabase/ssr"
import type { AMREntry } from "@supabase/supabase-js"
import { error, type Handle, type HandleServerError } from "@sveltejs/kit"
import { sequence } from "@sveltejs/kit/hooks"
import { safeError } from "$lib/errors"
import { log } from "$lib/server/log"
import { recordError } from "$lib/server/observability/error-store"
import { isSsoSatisfied } from "$lib/server/auth/sso-enforcement"

/**
 * Deliberately well above CLAUDE.md's 20ms server-render target (also
 * `scripts/measure-render-times.mjs`'s own default `THRESHOLD_MS`) — that
 * number already has a handful of pages routinely over it (a sweep found
 * three around 30ms), which would make a 20ms log line routine noise rather
 * than a signal. 50ms is the number CLAUDE.md also uses for the FULL
 * client-facing load (network, CSS, JS, hydration) — a pure server render
 * taking that long on its own should be rare and worth a look each time.
 */
const SLOW_REQUEST_MS = 50

/**
 * Total time through the rest of the handle chain — auth, `load()`, SSR — read
 * by `scripts/measure-render-times.mjs` and by any browser's own DevTools
 * network panel. Also mints the per-request correlation id: every `log.*`
 * call and `app_error_log` row for this request carries it, so multiple log
 * lines from one request can be joined without guessing from timestamps.
 */
const timing: Handle = async ({ event, resolve }) => {
  const start = performance.now()
  event.locals.requestId = crypto.randomUUID()
  const response = await resolve(event)
  const durationMs = performance.now() - start
  response.headers.set("server-timing", `app;dur=${durationMs.toFixed(1)}`)
  response.headers.set("x-request-id", event.locals.requestId)

  if (durationMs > SLOW_REQUEST_MS) {
    log.warn({
      msg: "slow request",
      requestId: event.locals.requestId,
      route: event.route?.id ?? event.url.pathname,
      method: event.request.method,
      durationMs: Math.round(durationMs),
      tenantId: event.locals?.tenantId ?? null,
    })
  }

  return response
}

export const supabase: Handle = async ({ event, resolve }) => {
  event.locals.supabase = createServerClient(
    PUBLIC_SUPABASE_URL,
    PUBLIC_SUPABASE_ANON_KEY,
    {
      cookies: {
        getAll: () => event.cookies.getAll(),
        /** SvelteKit requires an explicit `path`; "/" replicates prior default behavior. */
        setAll: (
          cookiesToSet: {
            name: string
            value: string
            options: Record<string, unknown>
          }[],
        ) => {
          cookiesToSet.forEach(({ name, value, options }) => {
            event.cookies.set(name, value, { ...options, path: "/" })
          })
        },
      },
    },
  )

  // https://github.com/supabase/auth-js/issues/888#issuecomment-2189298518
  if ("suppressGetSessionWarning" in event.locals.supabase.auth) {
    // @ts-expect-error - suppressGetSessionWarning is not part of the official API
    event.locals.supabase.auth.suppressGetSessionWarning = true
  } else {
    console.warn(
      "SupabaseAuthClient#suppressGetSessionWarning was removed. See https://github.com/supabase/auth-js/issues/888.",
    )
  }

  /**
   * `getSession()` alone reads whatever is in the cookie — client-controlled,
   * so a forged token would be trusted as-is. `getClaims()` verifies the
   * signature first: locally via WebCrypto against the cached JWKS since
   * this project signs asymmetrically (`/auth/v1/.well-known/jwks.json`),
   * network call otherwise. Same forgery guarantee `getUser()` gave; the gap
   * is an explicit sign-out-everywhere or account ban between issuance and
   * this token's own expiry. `jwt_expiry` (supabase/config.toml) already
   * bounds that same staleness for this app's tenant-membership claims —
   * `custom_access_token_hook` only re-checks `tenant_users.is_active` when
   * a token is minted, not on every request — so it's the load-bearing knob.
   */
  let authResult:
    | Promise<{
        session: import("@supabase/supabase-js").Session | null
        user: import("@supabase/supabase-js").User | null
      }>
    | undefined
  let amrResult: Promise<AMREntry[] | null> | undefined

  event.locals.safeGetSession = async ({ includeAmr = false } = {}) => {
    authResult ??= (async () => {
      const {
        data: { session },
      } = await event.locals.supabase.auth.getSession()
      if (!session) return { session: null, user: null }

      const { error: claimsError } = await event.locals.supabase.auth.getClaims(
        session.access_token,
      )
      if (claimsError) return { session: null, user: null }
      return { session, user: session.user }
    })()

    const { session, user } = await authResult
    if (!includeAmr || !session || !user) {
      return { session, user, amr: null }
    }

    amrResult ??= event.locals.supabase.auth.mfa
      .getAuthenticatorAssuranceLevel()
      .then(({ data, error: amrError }) =>
        amrError ? null : (data.currentAuthenticationMethods as AMREntry[]),
      )
    return { session, user, amr: await amrResult }
  }

  return resolve(event, {
    filterSerializedResponseHeaders(name) {
      return name === "content-range" || name === "x-supabase-api-version"
    },
    // SvelteKit preloads scripts and CSS by default, not fonts. The Latin
    // face is the one every first screen paints with: requested from the
    // HTML head, it arrives with the stylesheet instead of after it, and the
    // fallback is on screen for less time.
    preload: ({ type, path }) =>
      type === "js" ||
      type === "css" ||
      (type === "font" && path.includes("roboto-latin-wght-normal")),
  })
}

const authGuard: Handle = async ({ event, resolve }) => {
  const { session, user } = await event.locals.safeGetSession()
  event.locals.session = session
  event.locals.user = user

  // Tenant context resolved once, here (ADR-003 rule 5). No claim = no tenant, fails closed.
  const claims = appMetadataFromToken(session?.access_token)
  event.locals.amr = claims.amr
  event.locals.tenantId = claims.tenantId
  event.locals.tenantRole = claims.role
  event.locals.functionalRoles = claims.functionalRoles
  event.locals.employeeId = claims.employeeId
  event.locals.customerContactId = claims.customerContactId
  event.locals.customerId = claims.customerId
  event.locals.ssoRequired = claims.ssoRequired
  event.locals.ssoProviderType = claims.ssoProviderType
  event.locals.ssoProviderRef = claims.ssoProviderRef

  // "SSO required" is enforced here, not by hiding the login UI (ADR-010) —
  // gated behind ssoRequired, which is false for every tenant that has never
  // configured SSO, so this is a no-op for them. `amr` is decoded straight
  // from the token below, NOT via safeGetSession's includeAmr/MFA path —
  // that path calls getUser() over the network on every request (a real
  // per-request round trip), while `amr` is already a plain top-level JWT
  // claim `getClaims()` already verified.
  if (
    claims.tenantId &&
    !isSsoSatisfied(
      {
        ssoRequired: claims.ssoRequired,
        ssoProviderType: claims.ssoProviderType,
        ssoProviderRef: claims.ssoProviderRef,
      },
      { amr: claims.amr, identityProvider: claims.identityProvider },
    )
  ) {
    error(403, "This organization requires single sign-on.")
  }

  return resolve(event)
}

/**
 * Reads `app_metadata` (and the top-level `amr`/`provider` claims) from the
 * ACCESS TOKEN, not `user.app_metadata` (always empty of these claims, L4).
 * Decoding without verifying is safe only because `safeGetSession` already
 * validated this token via `getClaims()`.
 */
function appMetadataFromToken(accessToken?: string): {
  tenantId: string | null
  role: string | null
  functionalRoles: string[]
  employeeId: string | null
  customerContactId: string | null
  customerId: string | null
  ssoRequired: boolean
  ssoProviderType: "saml" | "oidc" | null
  ssoProviderRef: string | null
  identityProvider: string | null
  amr: AMREntry[] | null
} {
  const none = {
    tenantId: null,
    role: null,
    functionalRoles: [] as string[],
    employeeId: null,
    customerContactId: null,
    customerId: null,
    ssoRequired: false,
    ssoProviderType: null,
    ssoProviderRef: null,
    identityProvider: null,
    amr: null,
  }
  if (!accessToken) return none

  const payload = accessToken.split(".")[1]
  if (!payload) return none

  try {
    const json = Buffer.from(payload, "base64url").toString("utf8")
    const claims = JSON.parse(json) as {
      app_metadata?: {
        tenant_id?: unknown
        role?: unknown
        functional_roles?: unknown
        employee_id?: unknown
        customer_contact_id?: unknown
        customer_id?: unknown
        sso_required?: unknown
        sso_provider_type?: unknown
        sso_provider_ref?: unknown
        provider?: unknown
      }
      amr?: unknown
    }
    const meta = claims.app_metadata
    const tenantId = meta?.tenant_id
    const role = meta?.role
    const employeeId = meta?.employee_id
    const customerContactId = meta?.customer_contact_id
    const customerId = meta?.customer_id
    const ssoProviderType = meta?.sso_provider_type
    const ssoProviderRef = meta?.sso_provider_ref
    const provider = meta?.provider
    return {
      tenantId: typeof tenantId === "string" && tenantId ? tenantId : null,
      role: typeof role === "string" && role ? role : null,
      // Absent claim (older token) reads as no functional roles, never escalation.
      functionalRoles: Array.isArray(meta?.functional_roles)
        ? meta.functional_roles.filter(
            (r): r is string => typeof r === "string",
          )
        : [],
      employeeId:
        typeof employeeId === "string" && employeeId ? employeeId : null,
      customerContactId:
        typeof customerContactId === "string" && customerContactId
          ? customerContactId
          : null,
      customerId:
        typeof customerId === "string" && customerId ? customerId : null,
      // Absent claim (older token, minted before this tenant configured SSO)
      // reads as "not required" — never fail closed into locking everyone out.
      ssoRequired: meta?.sso_required === true,
      ssoProviderType:
        ssoProviderType === "saml" || ssoProviderType === "oidc"
          ? ssoProviderType
          : null,
      ssoProviderRef:
        typeof ssoProviderRef === "string" && ssoProviderRef
          ? ssoProviderRef
          : null,
      identityProvider:
        typeof provider === "string" && provider ? provider : null,
      // Accepts both AMREntry[] (object) and RFC-8176 string[] shapes.
      amr: Array.isArray(claims.amr)
        ? claims.amr.map((entry) =>
            typeof entry === "string"
              ? { method: entry, timestamp: 0 }
              : (entry as AMREntry),
          )
        : null,
    }
  } catch {
    return none // malformed token = missing tenant, not a crash
  }
}

export const handle: Handle = sequence(timing, supabase, authGuard)

/**
 * Every unexpected error gets an id, logged and returned to the page, since
 * SvelteKit replaces the real message with "Internal Error" in the browser.
 * Only unexpected errors reach here — `error()` calls are deliberate, not
 * bugs. `locals` is read defensively since this hook also runs when an
 * earlier handle throws.
 */
export const handleError: HandleServerError = ({
  error,
  event,
  status,
  message,
}) => {
  const id = crypto.randomUUID()

  // A 404 is someone following a stale link, not a fault. Logging it as an
  // error trains people to ignore the error stream.
  if (status !== 404) {
    const route = event.route?.id ?? event.url.pathname
    log.error({
      id,
      requestId: event.locals?.requestId,
      msg: message,
      status,
      route,
      method: event.request?.method,
      tenantId: event.locals?.tenantId ?? null,
      tenantRole: event.locals?.tenantRole ?? null,
      functionalRoles: event.locals?.functionalRoles ?? [],
      employeeId: event.locals?.employeeId ?? null,
      // Allowlisted. Never the raw error: `detail` is the row (see $lib/errors).
      error: safeError(error),
    })

    // Fire-and-forget: never let a logging write delay or fail the response.
    void recordError(event.locals, {
      errorId: id,
      requestId: event.locals?.requestId,
      scope: "server",
      route,
      status,
      error: safeError(error),
    })
  }

  return { id, message }
}
