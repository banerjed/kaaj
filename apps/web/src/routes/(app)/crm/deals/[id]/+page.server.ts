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

export const load: PageServerLoad = async ({ params, locals }) => {
  if (!locals.tenantId) error(403, "No tenant")
  requireCan(contextFrom(locals), "crm.read")

  return withTenant(actorFrom(locals), async (tx) => {
    const deal = await deals.getById(tx, params.id)
    if (!deal) error(404, "Deal not found")

    return {
      deal,
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
    requireCan(contextFrom(locals), "crm.write")

    return withTenant(actorFrom(locals), async (tx) => {
      const current = await deals.getById(tx, params.id)
      if (!current) error(404, "Deal not found")

      const f = new FormReader(await request.formData())
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
      if (!f.ok) return fail(400, f.problem("Some fields need attention."))

      try {
        await deals.update(tx, params.id, input)
        return { saved: true }
      } catch (e) {
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
