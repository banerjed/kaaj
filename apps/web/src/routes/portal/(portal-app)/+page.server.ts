import type { PageServerLoad } from "./$types"
import { withTenant, actorFrom } from "$lib/server/db/tenant"

/**
 * The portal shell — proves identity + RLS work end to end. Nothing else
 * lives here yet; ticketing/documents/chat are their own pieces
 * (docs/17-customer-portal.md §7).
 */
export const load: PageServerLoad = async ({ locals }) => {
  return withTenant(actorFrom(locals), async (tx) => {
    const [customer] = await tx<{ customer_name: string }[]>`
      SELECT customer_name FROM customers WHERE id = ${locals.customerId}
    `
    return { customerName: customer?.customer_name ?? null }
  })
}
