import { error } from "@sveltejs/kit"
import type { PageServerLoad } from "./$types"
import * as ticketing from "$lib/server/ticketing/ticketing.repo"
import { withTenant, actorFrom } from "$lib/server/db/tenant"
import { can, contextFrom } from "$lib/server/auth/can"

/** /portal/tickets — the signed-in contact's own customer's tickets. RLS (not this filter) is what actually scopes them. */
export const load: PageServerLoad = async ({ locals }) => {
  if (!locals.customerContactId) error(403, "No portal session")
  const ctx = contextFrom(locals)
  if (!can(ctx, "ticket.read.own")) error(403, "You cannot see tickets.")

  return withTenant(actorFrom(locals), async (tx) => ({
    tickets: await ticketing.listTickets(tx),
  }))
}
