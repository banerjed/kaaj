import { error, fail } from "@sveltejs/kit"
import type { Actions, PageServerLoad } from "./$types"
import * as ticketing from "$lib/server/ticketing/ticketing.repo"
import { withTenant, actorFrom } from "$lib/server/db/tenant"
import { can, contextFrom, requireCan } from "$lib/server/auth/can"
import { FormReader } from "$lib/server/forms"

export const load: PageServerLoad = async ({ locals, params }) => {
  if (!locals.customerContactId) error(403, "No portal session")
  const ctx = contextFrom(locals)
  if (!can(ctx, "ticket.read.own")) error(403, "You cannot see tickets.")

  return withTenant(actorFrom(locals), async (tx) => {
    // RLS scopes this to the signed-in contact's own customer — a ticket id
    // belonging to another customer resolves to no row, not someone else's.
    const ticket = await ticketing.ticketById(tx, params.id)
    if (!ticket) error(404, "No such ticket")
    return {
      ticket,
      // RLS also filters out internal-only updates for this actor.
      updates: await ticketing.ticketUpdates(tx, ticket.id),
    }
  })
}

export const actions: Actions = {
  reply: async ({ request, locals, params }) => {
    if (!locals.customerContactId) error(403, "No portal session")
    const ctx = contextFrom(locals)
    requireCan(ctx, "ticket.submit")

    const f = new FormReader(await request.formData())
    const content = f.text("content", { required: true, max: 5000 })
    if (!f.ok) return fail(400, f.problem("Write something before posting."))

    return withTenant(actorFrom(locals), async (tx) => {
      const ticket = await ticketing.ticketById(tx, params.id)
      if (!ticket) error(404, "No such ticket")
      await ticketing.addUpdate(
        tx,
        locals.tenantId!,
        params.id,
        ticket.ticket_number,
        content!,
        { contactId: locals.customerContactId! },
      )
      return { posted: true }
    })
  },
}
