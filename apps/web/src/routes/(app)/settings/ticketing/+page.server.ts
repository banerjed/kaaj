import { error, fail } from "@sveltejs/kit"
import type { Actions, PageServerLoad } from "./$types"
import * as ticketing from "$lib/server/ticketing/ticketing.repo"
import { withTenant, actorFrom } from "$lib/server/db/tenant"
import { contextFrom, requireCan } from "$lib/server/auth/can"
import { FormReader } from "$lib/server/forms"
import { constraintFailure } from "$lib/server/db/constraints"

/** /settings/ticketing — business areas. Categories, subcategories and default membership live one level down, per area. */
export const load: PageServerLoad = async ({ locals }) => {
  if (!locals.tenantId) error(403, "No tenant")
  requireCan(contextFrom(locals), "firm.settings.read")

  return withTenant(actorFrom(locals), async (tx) => ({
    businessAreas: await ticketing.listBusinessAreasForSettings(tx),
  }))
}

const PREFIX = /^[A-Z0-9]{2,10}$/

export const actions: Actions = {
  save: async ({ request, locals }) => {
    if (!locals.tenantId) error(403, "No tenant")
    requireCan(contextFrom(locals), "firm.settings.write")
    const tenantId = locals.tenantId
    const ctx = contextFrom(locals)

    const f = new FormReader(await request.formData())
    const id = f.uuid("id")
    // Uppercased: prefix leads every ticket number ("IT-0001") and is UNIQUE per tenant.
    const prefix = f.text("prefix", {
      required: true,
      max: 10,
      upper: true,
      pattern: PREFIX,
    })
    const name = f.text("name", { required: true, max: 255 })
    const description = f.text("description", { max: 2000 })
    if (!f.ok) return fail(400, { ...f.problem(), editing: id || "new" })

    try {
      return await withTenant(actorFrom(locals), async (tx) => {
        if (id) {
          await ticketing.updateBusinessArea(tx, id, {
            prefix: prefix!,
            name: name!,
            description,
          })
        } else {
          await ticketing.createBusinessArea(
            tx,
            tenantId,
            ctx!.employeeId ?? ctx!.userId,
            {
              prefix: prefix!,
              name: name!,
              description,
            },
          )
        }
        return { saved: true }
      })
    } catch (e) {
      const refused = constraintFailure(e)
      if (refused) return refused
      throw e
    }
  },

  archive: async ({ request, locals }) => {
    if (!locals.tenantId) error(403, "No tenant")
    requireCan(contextFrom(locals), "firm.settings.write")
    const f = new FormReader(await request.formData())
    const id = f.uuid("id", { required: true })
    if (!f.ok) return fail(400, f.problem("Missing business area."))

    const archived = await withTenant(actorFrom(locals), (tx) =>
      ticketing.archiveBusinessArea(tx, id!),
    )
    if (!archived) {
      return fail(400, {
        message: "That business area no longer exists. Reload the page.",
      })
    }
    return { archived: true }
  },
}
