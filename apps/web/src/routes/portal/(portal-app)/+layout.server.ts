import { redirect } from "@sveltejs/kit"
import type { LayoutServerLoad } from "./$types"
import { toSafeAuthSession } from "$lib/server/auth_session"
import { withTenant, actorFrom } from "$lib/server/db/tenant"

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

  // For per-market date/time formatting (CLAUDE.md § Time) — loaded once
  // here since every portal page under this layout needs it.
  const tenant = await withTenant(actorFrom(locals), async (tx) => {
    const [row] = await tx<
      {
        default_locale: string
        default_timezone: string
        time_format: string | null
      }[]
    >`
      SELECT default_locale, default_timezone, time_format
        FROM tenants WHERE id = ${locals.tenantId}
    `
    return row
  })

  return {
    session: toSafeAuthSession(session, user),
    user: {
      email: user.email,
      fullName: (user.user_metadata?.full_name as string | undefined) ?? null,
    },
    customerId: locals.customerId,
    tenant,
  }
}
