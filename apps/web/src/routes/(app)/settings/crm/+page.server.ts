import { error } from "@sveltejs/kit"
import type { Actions, PageServerLoad } from "./$types"
import * as customFields from "$lib/server/custom-fields/custom-fields.repo"
import { customFieldSettingsHandlers } from "$lib/server/custom-fields/settings-actions"
import { withTenant, actorFrom } from "$lib/server/db/tenant"
import { contextFrom, requireCan } from "$lib/server/auth/can"

const SCOPE = { entityType: "customer_contact" } as const

/** /settings/crm — custom fields for customer contacts. */
export const load: PageServerLoad = async ({ locals }) => {
  if (!locals.tenantId) error(403, "No tenant")
  requireCan(contextFrom(locals), "firm.settings.read")

  return withTenant(actorFrom(locals), async (tx) => ({
    contactFields: await customFields.definitionsFor(tx, SCOPE),
  }))
}

const fields = customFieldSettingsHandlers(() => SCOPE)

export const actions: Actions = {
  addField: async (event) => {
    requireCan(contextFrom(event.locals), "firm.settings.write")
    return fields.addField(event)
  },
  archiveField: async (event) => {
    requireCan(contextFrom(event.locals), "firm.settings.write")
    return fields.archiveField(event)
  },
  renameCategory: async (event) => {
    requireCan(contextFrom(event.locals), "firm.settings.write")
    return fields.renameCategory(event)
  },
  moveField: async (event) => {
    requireCan(contextFrom(event.locals), "firm.settings.write")
    return fields.moveField(event)
  },
}
