// src/hooks.server.ts
import {
  PUBLIC_SUPABASE_ANON_KEY,
  PUBLIC_SUPABASE_URL,
} from "$env/static/public"
import { createServerClient } from "@supabase/ssr"
import type { AMREntry } from "@supabase/supabase-js"
import type { Handle } from "@sveltejs/kit"
import { sequence } from "@sveltejs/kit/hooks"
import { supabaseServiceRole } from "$lib/server/supabase_service_role"

export const supabase: Handle = async ({ event, resolve }) => {
  event.locals.supabase = createServerClient(
    PUBLIC_SUPABASE_URL,
    PUBLIC_SUPABASE_ANON_KEY,
    {
      cookies: {
        getAll: () => event.cookies.getAll(),
        /**
         * SvelteKit's cookies API requires `path` to be explicitly set in
         * the cookie options. Setting `path` to `/` replicates previous/
         * standard behavior.
         */
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

  event.locals.supabaseServiceRole = supabaseServiceRole

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
   * Unlike `supabase.auth.getSession()`, which returns the session _without_
   * validating the JWT, this function also calls `getUser()` to validate the
   * JWT before returning the session.
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

      const {
        data: { user },
        error: userError,
      } = await event.locals.supabase.auth.getUser()
      if (userError) return { session: null, user: null }
      return { session, user }
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

// Not called for prerendered marketing pages so generally okay to call on ever server request
// Next-page CSR will mean relatively minimal calls to this hook
const authGuard: Handle = async ({ event, resolve }) => {
  const { session, user } = await event.locals.safeGetSession()
  event.locals.session = session
  event.locals.user = user
  event.locals.amr = null

  // ADR-003 rule 5: tenant context is resolved ONCE, here. No membership means
  // no claim means no tenant — which fails closed to zero rows, not an error.
  const claims = appMetadataFromToken(session?.access_token)
  event.locals.tenantId = claims.tenantId
  event.locals.tenantRole = claims.role

  return resolve(event)
}

/**
 * Read `app_metadata` out of the ACCESS TOKEN, not out of `user.app_metadata`
 * — which is the obvious place and is always empty of these claims (L4).
 *
 * Decoding without verifying is safe here only because `safeGetSession` has
 * already validated this exact token through `getUser()`.
 */
function appMetadataFromToken(accessToken?: string): {
  tenantId: string | null
  role: string | null
} {
  const none = { tenantId: null, role: null }
  if (!accessToken) return none

  const payload = accessToken.split(".")[1]
  if (!payload) return none

  try {
    const json = Buffer.from(payload, "base64url").toString("utf8")
    const claims = JSON.parse(json) as {
      app_metadata?: { tenant_id?: unknown; role?: unknown }
    }
    const tenantId = claims.app_metadata?.tenant_id
    const role = claims.app_metadata?.role
    return {
      tenantId: typeof tenantId === "string" && tenantId ? tenantId : null,
      role: typeof role === "string" && role ? role : null,
    }
  } catch {
    return none // malformed token = missing tenant, not a crash
  }
}

export const handle: Handle = sequence(supabase, authGuard)
