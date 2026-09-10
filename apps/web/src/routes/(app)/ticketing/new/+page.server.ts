import { error, fail, redirect } from "@sveltejs/kit"
import type { Actions, PageServerLoad } from "./$types"
import * as ticketing from "$lib/server/ticketing/ticketing.repo"
import { TicketingRefused } from "$lib/server/ticketing/ticketing.repo"
import { withTenant, actorFrom } from "$lib/server/db/tenant"
import { contextFrom, requireCan } from "$lib/server/auth/can"
import { FormReader } from "$lib/server/forms"

/** /ticketing/new — the staff-side counterpart to the portal's own ticket-submission page. Every business area, not just portal-visible ones. */
export const load: PageServerLoad = async ({ locals }) => {
  if (!locals.tenantId) error(403, "No tenant")
  requireCan(contextFrom(locals), "ticketing.write.own")

  return withTenant(actorFrom(locals), async (tx) => {
    const businessAreas = await ticketing.businessAreas(tx)
    const categoriesByArea: Record<
      string,
      Awaited<ReturnType<typeof ticketing.categoriesFor>>
    > = {}
    for (const ba of businessAreas) {
      categoriesByArea[ba.id] = await ticketing.categoriesFor(tx, ba.id)
    }
    return { businessAreas, categoriesByArea }
  })
}

export const actions: Actions = {
  default: async ({ request, locals }) => {
    if (!locals.tenantId) error(403, "No tenant")
    const ctx = contextFrom(locals)
    requireCan(ctx, "ticketing.write.own")

    const f = new FormReader(await request.formData())
    const businessAreaId = f.uuid("business_area_id", { required: true })
    const title = f.text("title", { required: true, max: 255 })
    const description = f.html("description", { required: true, max: 20000 })
    const categoryId = f.uuid("category_id", { required: true })
    const subcategoryId = f.uuid("subcategory_id")
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
            categoryId: categoryId!,
            subcategoryId: subcategoryId,
            dueDate: dueDate!,
          },
          { employeeId: ctx!.employeeId ?? ctx!.userId },
        ),
      )
      redirect(303, `/ticketing/${id}`)
    } catch (e) {
      if (e instanceof TicketingRefused) {
        return fail(400, { message: "That business area isn't available." })
      }
      throw e
    }
  },
}
