import { error, fail, redirect } from "@sveltejs/kit"
import type { Actions, PageServerLoad } from "./$types"
import * as ticketing from "$lib/server/ticketing/ticketing.repo"
import { TicketingRefused } from "$lib/server/ticketing/ticketing.repo"
import { withTenant, actorFrom } from "$lib/server/db/tenant"
import { can, contextFrom, requireCan } from "$lib/server/auth/can"
import { FormReader } from "$lib/server/forms"

export const load: PageServerLoad = async ({ locals }) => {
  if (!locals.customerContactId) error(403, "No portal session")
  const ctx = contextFrom(locals)
  if (!can(ctx, "ticket.submit")) error(403, "You cannot submit a ticket.")

  return withTenant(actorFrom(locals), async (tx) => ({
    businessAreas: await ticketing.businessAreas(tx, {
      portalVisibleOnly: true,
    }),
  }))
}

export const actions: Actions = {
  default: async ({ request, locals }) => {
    if (!locals.customerContactId) error(403, "No portal session")
    const ctx = contextFrom(locals)
    requireCan(ctx, "ticket.submit")

    const f = new FormReader(await request.formData())
    const businessAreaId = f.uuid("business_area_id", { required: true })
    const title = f.text("title", { required: true, max: 255 })
    const description = f.text("description", { required: true, max: 5000 })
    const category = f.text("category", { required: true, max: 100 })
    const dueDate = f.date("due_date", { required: true })
    if (!f.ok) return fail(400, f.problem("That ticket is not valid."))

    try {
      const { id } = await withTenant(actorFrom(locals), (tx) =>
        ticketing.createTicket(
          tx,
          locals.tenantId!,
          {
            businessAreaId: businessAreaId!,
            title: title!,
            description: description!,
            category: category!,
            dueDate: dueDate!,
          },
          {
            contactId: locals.customerContactId!,
            customerId: locals.customerId!,
          },
        ),
      )
      redirect(303, `/portal/tickets/${id}`)
    } catch (e) {
      if (e instanceof TicketingRefused) {
        return fail(400, { message: "That business area isn't available." })
      }
      throw e
    }
  },
}
