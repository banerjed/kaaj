import { error, fail } from "@sveltejs/kit"
import type { Actions, PageServerLoad } from "./$types"
import * as deals from "$lib/server/crm/deals.repo"
import * as pipelineStages from "$lib/server/crm/pipeline-stages.repo"
import * as contacts from "$lib/server/customers/customer-contacts.repo"
import * as activities from "$lib/server/crm/activities.repo"
import { managerOptions } from "$lib/server/employee-profile/employees.repo"
import { withTenant, actorFrom } from "$lib/server/db/tenant"
import { contextFrom, requireCan } from "$lib/server/auth/can"
import { FormReader } from "$lib/server/forms"
import { constraintFailure } from "$lib/server/db/constraints"
import * as customFields from "$lib/server/custom-fields/custom-fields.repo"
import { CustomFieldWriteRefused } from "$lib/server/custom-fields/custom-fields.repo"
import {
  customFieldProblem,
  readCustomFieldValues,
} from "$lib/server/custom-fields/read-values"

const SCOPE = { entityType: "deal" } as const

export const load: PageServerLoad = async ({ params, locals }) => {
  if (!locals.tenantId) error(403, "No tenant")
  requireCan(contextFrom(locals), "crm.read")

  return withTenant(actorFrom(locals), async (tx) => {
    const deal = await deals.getById(tx, params.id)
    if (!deal) error(404, "Deal not found")
    const fieldValues = await customFields.valuesFor(tx, "deal", [params.id])

    return {
      deal,
      fieldDefs: await customFields.definitionsFor(tx, SCOPE),
      fieldValues: fieldValues[params.id] ?? [],
      stages: await pipelineStages.list(tx),
      contacts: await contacts.listForCustomer(tx, deal.customer_id),
      owners: await managerOptions(tx),
      activities: await activities.listForDeal(tx, params.id),
      activityTypes: activities.ACTIVITY_TYPES,
    }
  })
}

export const actions: Actions = {
  save: async ({ request, params, locals }) => {
    if (!locals.tenantId) error(403, "No tenant")
    const ctx = contextFrom(locals)
    requireCan(ctx, "crm.write")

    return withTenant(actorFrom(locals), async (tx) => {
      const current = await deals.getById(tx, params.id)
      if (!current) error(404, "Deal not found")

      const data = await request.formData()
      const f = new FormReader(data)
      const input = {
        customer_id: current.customer_id,
        customer_contact_id: f.uuid("customer_contact_id"),
        stage_id: f.uuid("stage_id", { required: true }),
        name: f.text("name", { required: true, max: 300 }),
        value_amount: f.decimal("value_amount", { scale: 2 }),
        currency: f.currency("currency"),
        probability_percent: f.integer("probability_percent", {
          min: 0,
          max: 100,
        }),
        expected_close_date: f.date("expected_close_date"),
        owner_id: f.uuid("owner_id", { required: true }),
      }
      const fieldDefs = await customFields.definitionsFor(tx, SCOPE)
      const fieldValues = readCustomFieldValues(f, data, fieldDefs)
      if (!f.ok) return fail(400, customFieldProblem(f, fieldDefs))

      try {
        await deals.update(tx, params.id, input)
        await customFields.saveValues(
          tx,
          locals.tenantId!,
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
      const current = await deals.getById(tx, params.id)
      if (!current) error(404, "Deal not found")

      const f = new FormReader(await request.formData())
      const input = {
        customer_id: current.customer_id,
        customer_contact_id: f.uuid("customer_contact_id"),
        deal_id: params.id,
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
