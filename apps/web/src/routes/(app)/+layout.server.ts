import { redirect } from "@sveltejs/kit"
import type { LayoutServerLoad } from "./$types"
import { withTenant, actorFrom } from "$lib/server/db/tenant"
import { toSafeAuthSession } from "$lib/server/auth_session"
import { contextFrom } from "$lib/server/auth/can"
import { permissionsFor } from "@kaaj/authz"

/**
 * The gate for every page in the product. The two failures differ: no session
 * means not signed in; a session with no tenantId means a valid user with no
 * active membership, which would otherwise render every page blank (L21).
 */
export const load: LayoutServerLoad = async ({ locals, url }) => {
  const { session, user } = locals

  if (!session || !user) {
    redirect(303, `/login?redirect=${encodeURIComponent(url.pathname)}`)
  }

  if (!locals.tenantId) {
    redirect(303, "/account?no_tenant=1")
  }

  // Loaded once in the layout, not per page: it is on every screen.
  const tenant = await withTenant(actorFrom(locals), async (tx) => {
    const [row] = await tx`
      SELECT id,
             company_name,
             default_locale,
             default_currency,
             default_timezone,
             date_format,
             time_format,
             supported_locales,
             supported_currencies
        FROM tenants
       WHERE id = ${locals.tenantId}
    `
    return row
  })

  // Sent to the browser so the sidebar can drop links this person cannot
  // open. It is their OWN capability list, not a secret, and it authorizes
  // nothing: each load and action checks server-side regardless (L44).
  const ctx = contextFrom(locals)
  const permissions = ctx
    ? [...permissionsFor(ctx.role, ctx.functionalRoles)]
    : []

  return {
    session: toSafeAuthSession(session, user),
    tenant,
    permissions,
    user: {
      id: user.id,
      email: user.email,
      fullName: (user.user_metadata?.full_name as string | undefined) ?? null,
      // From locals, not user.app_metadata (L4).
      role: locals.tenantRole ?? "member",
    },
  }
}
