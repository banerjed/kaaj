import { error, fail } from "@sveltejs/kit"
import type { Actions, PageServerLoad } from "./$types"
import * as contacts from "$lib/server/customers/customer-contacts.repo"
import * as activities from "$lib/server/crm/activities.repo"
import * as customFields from "$lib/server/custom-fields/custom-fields.repo"
import { CustomFieldWriteRefused } from "$lib/server/custom-fields/custom-fields.repo"
import {
  customFieldProblem,
  readCustomFieldValues,
} from "$lib/server/custom-fields/read-values"
import { withTenant, actorFrom } from "$lib/server/db/tenant"
import { contextFrom, requireCan } from "$lib/server/auth/can"
import { FormReader } from "$lib/server/forms"
import { constraintFailure } from "$lib/server/db/constraints"

const SCOPE = { entityType: "customer_contact" } as const

export const load: PageServerLoad = async ({ params, locals }) => {
  if (!locals.tenantId) error(403, "No tenant")
  requireCan(contextFrom(locals), "crm.read")

  return withTenant(actorFrom(locals), async (tx) => {
    const contact = await contacts.getById(tx, params.id)
    if (!contact) error(404, "Contact not found")

    const fieldDefs = await customFields.definitionsFor(tx, SCOPE)
    const fieldValues = await customFields.valuesFor(tx, "customer_contact", [
      params.id,
    ])

    return {
      contact,
      activities: await activities.listForContact(tx, params.id),
      activityTypes: activities.ACTIVITY_TYPES,
      fieldDefs,
      fieldValues: fieldValues[params.id] ?? [],
    }
  })
}

export const actions: Actions = {
  save: async ({ request, params, locals }) => {
    if (!locals.tenantId) error(403, "No tenant")
    const ctx = contextFrom(locals)
    requireCan(ctx, "crm.write")
    const tenantId = locals.tenantId

    return withTenant(actorFrom(locals), async (tx) => {
      const current = await contacts.getById(tx, params.id)
      if (!current) error(404, "Contact not found")

      const data = await request.formData()
      const f = new FormReader(data)
      const input = {
        customer_id: current.customer_id,
        first_name: f.text("first_name", { required: true, max: 100 }),
        last_name: f.text("last_name", { required: true, max: 100 }),
        email: f.text("email", { required: true, max: 255 }),
        phone: f.text("phone", { max: 20 }),
        title: f.text("title", { max: 100 }),
        department: f.text("department", { max: 100 }),
        is_primary: f.bool("is_primary"),
      }
      const fieldDefs = await customFields.definitionsFor(tx, SCOPE)
      const fieldValues = readCustomFieldValues(f, data, fieldDefs)
      if (!f.ok) return fail(400, customFieldProblem(f, fieldDefs))

      try {
        await contacts.update(tx, params.id, input)
        await customFields.saveValues(
          tx,
          tenantId,
          SCOPE,
          params.id,
          fieldValues,
          ctx!.employeeId ?? ctx!.userId,
        )
        return { saved: true }
      } catch (e) {
        if (e instanceof CustomFieldWriteRefused) {
          return fail(400, {
            message: "Those fields could not be saved. Reload and try again.",
          })
        }
        const refused = constraintFailure(e)
        if (refused) return refused
        throw e
      }
    })
  },

  addActivity: async ({ request, params, locals }) => {
    if (!locals.tenantId) error(403, "No tenant")
    const ctx = contextFrom(locals)
    requireCan(ctx, "crm.write")
    const tenantId = locals.tenantId

    return withTenant(actorFrom(locals), async (tx) => {
      const current = await contacts.getById(tx, params.id)
      if (!current) error(404, "Contact not found")

      const f = new FormReader(await request.formData())
      const input = {
        customer_id: current.customer_id,
        customer_contact_id: params.id,
        deal_id: f.uuid("deal_id"),
        activity_type: f.choice("activity_type", activities.ACTIVITY_TYPES, {
          required: true,
        }),
        subject: f.text("subject", { max: 300 }),
        body: f.text("body", { max: 5000 }),
      }
      if (!f.ok) return fail(400, f.problem("Some fields need attention."))

      await activities.create(tx, tenantId, input, ctx!.employeeId ?? "")
      return { activityAdded: true }
    })
  },
}
