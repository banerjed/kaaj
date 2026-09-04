import { redirect } from "@sveltejs/kit"
import type { LayoutServerLoad } from "./$types"
import { toSafeAuthSession } from "$lib/server/auth_session"

/**
 * The gate for every portal page — mirrors (app)/+layout.server.ts's shape,
 * narrower: a portal contact, never staff (an employee session redirected
 * here would see nothing useful and nothing they're scoped to).
 */
export const load: LayoutServerLoad = async ({ locals, url }) => {
  const { session, user } = locals

  if (!session || !user) {
    redirect(303, `/portal/login?redirect=${encodeURIComponent(url.pathname)}`)
  }

  if (!locals.tenantId || !locals.customerContactId) {
    redirect(303, "/portal/login")
  }

  return {
    session: toSafeAuthSession(session, user),
    user: {
      email: user.email,
      fullName: (user.user_metadata?.full_name as string | undefined) ?? null,
    },
    customerId: locals.customerId,
  }
}
