// src/hooks.server.ts
import {
  PUBLIC_SUPABASE_ANON_KEY,
  PUBLIC_SUPABASE_URL,
} from "$env/static/public"
import { createServerClient } from "@supabase/ssr"
import type { AMREntry } from "@supabase/supabase-js"
import type { Handle, HandleServerError } from "@sveltejs/kit"
import { sequence } from "@sveltejs/kit/hooks"
import { safeError } from "$lib/errors"
import { log } from "$lib/server/log"

/** Total time through the rest of the handle chain — auth, `load()`, SSR — read by `scripts/measure-render-times.mjs` and by any browser's own DevTools network panel. */
const timing: Handle = async ({ event, resolve }) => {
  const start = performance.now()
  const response = await resolve(event)
  response.headers.set(
    "server-timing",
    `app;dur=${(performance.now() - start).toFixed(1)}`,
  )
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
  })
}

const authGuard: Handle = async ({ event, resolve }) => {
  const { session, user } = await event.locals.safeGetSession()
  event.locals.session = session
  event.locals.user = user
  event.locals.amr = null

  // Tenant context resolved once, here (ADR-003 rule 5). No claim = no tenant, fails closed.
  const claims = appMetadataFromToken(session?.access_token)
  event.locals.tenantId = claims.tenantId
  event.locals.tenantRole = claims.role
  event.locals.functionalRoles = claims.functionalRoles
  event.locals.employeeId = claims.employeeId
  event.locals.customerContactId = claims.customerContactId
  event.locals.customerId = claims.customerId

  return resolve(event)
}

/**
 * Reads `app_metadata` from the ACCESS TOKEN, not `user.app_metadata` (always
 * empty of these claims, L4). Decoding without verifying is safe only because
 * `safeGetSession` already validated this token via `getClaims()`.
 */
function appMetadataFromToken(accessToken?: string): {
  tenantId: string | null
  role: string | null
  functionalRoles: string[]
  employeeId: string | null
  customerContactId: string | null
  customerId: string | null
} {
  const none = {
    tenantId: null,
    role: null,
    functionalRoles: [] as string[],
    employeeId: null,
    customerContactId: null,
    customerId: null,
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
      }
    }
    const meta = claims.app_metadata
    const tenantId = meta?.tenant_id
    const role = meta?.role
    const employeeId = meta?.employee_id
    const customerContactId = meta?.customer_contact_id
    const customerId = meta?.customer_id
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
    log.error({
      id,
      msg: message,
      status,
      route: event.route?.id ?? event.url.pathname,
      method: event.request?.method,
      tenantId: event.locals?.tenantId ?? null,
      tenantRole: event.locals?.tenantRole ?? null,
      functionalRoles: event.locals?.functionalRoles ?? [],
      employeeId: event.locals?.employeeId ?? null,
      // Allowlisted. Never the raw error: `detail` is the row (see $lib/errors).
      error: safeError(error),
    })
  }

  return { id, message }
}
