import { error, fail } from "@sveltejs/kit"
import type { Actions, PageServerLoad } from "./$types"
import * as ticketing from "$lib/server/ticketing/ticketing.repo"
import {
  TicketingRefused,
  TICKET_STATUSES,
} from "$lib/server/ticketing/ticketing.repo"
import { withTenant, actorFrom } from "$lib/server/db/tenant"
import { can, contextFrom, requireCan } from "$lib/server/auth/can"
import { FormReader } from "$lib/server/forms"

export const load: PageServerLoad = async ({ locals, params }) => {
  if (!locals.tenantId) error(403, "No tenant")
  const ctx = contextFrom(locals)
  if (!can(ctx, "ticketing.read.own") && !can(ctx, "ticketing.read.all")) {
    error(403, "You cannot see tickets.")
  }
  return withTenant(actorFrom(locals), async (tx) => {
    const ticket = await ticketing.ticketById(tx, params.id)
    if (!ticket) error(404, "No such ticket")
    return {
      ticket,
      updates: await ticketing.ticketUpdates(tx, ticket.id),
      statuses: TICKET_STATUSES,
      mayWrite:
        can(ctx, "ticketing.write.own") || can(ctx, "ticketing.write.all"),
    }
  })
}

export const actions: Actions = {
  addUpdate: async ({ request, locals, params }) => {
    if (!locals.tenantId) error(403, "No tenant")
    const ctx = contextFrom(locals)
    requireCan(ctx, "ticketing.write.own")

    const f = new FormReader(await request.formData())
    const content = f.text("content", { required: true, max: 5000 })
    const visibility = f.choice("visibility", ["internal", "external"], {
      required: true,
    })
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
        { employeeId: ctx!.employeeId ?? ctx!.userId, visibility: visibility! },
      )
      return { posted: true }
    })
  },

  setStatus: async ({ request, locals, params }) => {
    if (!locals.tenantId) error(403, "No tenant")
    const ctx = contextFrom(locals)
    requireCan(ctx, "ticketing.write.own")

    const f = new FormReader(await request.formData())
    const status = f.choice("status", TICKET_STATUSES, { required: true })
    if (!f.ok) return fail(400, f.problem("Choose a status."))

    try {
      return await withTenant(actorFrom(locals), async (tx) => {
        const { from } = await ticketing.setStatus(
          tx,
          params.id,
          status!,
          ctx!.employeeId ?? ctx!.userId,
        )
        return { statusChanged: true, from, to: status }
      })
    } catch (e) {
      if (e instanceof TicketingRefused) {
        return fail(400, { message: "That ticket no longer exists." })
      }
      throw e
    }
  },
}
