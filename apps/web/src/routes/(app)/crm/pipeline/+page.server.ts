import { error, fail } from "@sveltejs/kit"
import type { Actions, PageServerLoad } from "./$types"
import * as deals from "$lib/server/crm/deals.repo"
import * as pipelineStages from "$lib/server/crm/pipeline-stages.repo"
import * as customers from "$lib/server/customers/customers.repo"
import { managerOptions } from "$lib/server/employee-profile/employees.repo"
import { withTenant, actorFrom } from "$lib/server/db/tenant"
import { contextFrom, requireCan } from "$lib/server/auth/can"
import { FormReader, uuidParam } from "$lib/server/forms"
import { constraintFailure } from "$lib/server/db/constraints"

/**
 * Cards per column before "show more". `crm_deals` is SCALE_SENSITIVE — one
 * row per potential sale, forever — so the board reads a page of each stage,
 * never the whole table. A card is heavier than a table row, hence the low
 * end of the 20-50 band.
 */
const PER_STAGE = 20

export const load: PageServerLoad = async ({ locals, url }) => {
  if (!locals.tenantId) error(403, "No tenant")
  requireCan(contextFrom(locals), "crm.read")

  // One column at a time, the same shape the company page's activity feed
  // uses: the URL carries which stage is expanded and how far.
  const expandStageId = uuidParam(url.searchParams.get("stage"))
  const expandPages = Math.max(1, Number(url.searchParams.get("pages")) || 1)

  return withTenant(actorFrom(locals), async (tx) => ({
    deals: await deals.listForBoard(tx, {
      perStage: PER_STAGE,
      expandStageId,
      expandLimit: expandPages * PER_STAGE,
    }),
    stageSummary: await deals.stageSummary(tx),
    stages: await pipelineStages.list(tx),
    companies: await customers.list(tx),
    owners: await managerOptions(tx),
    expandStageId,
    expandPages,
    perStage: PER_STAGE,
  }))
}

export const actions: Actions = {
  /** The board's single write path — moving a card. */
  moveStage: async ({ request, locals }) => {
    if (!locals.tenantId) error(403, "No tenant")
    requireCan(contextFrom(locals), "crm.write")

    const f = new FormReader(await request.formData())
    const dealId = f.uuid("deal_id", { required: true })
    const stageId = f.uuid("stage_id", { required: true })
    if (!f.ok) return fail(400, f.problem("That move is not valid."))

    const moved = await withTenant(actorFrom(locals), (tx) =>
      deals.moveStage(tx, dealId, stageId),
    )
    if (!moved) {
      return fail(400, {
        message: "That deal no longer exists. Reload the page.",
      })
    }
    return { moved: true }
  },

  addDeal: async ({ request, locals }) => {
    if (!locals.tenantId) error(403, "No tenant")
    requireCan(contextFrom(locals), "crm.write")
    const tenantId = locals.tenantId

    const f = new FormReader(await request.formData())
    const input = {
      customer_id: f.uuid("customer_id", { required: true }),
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
      return await withTenant(actorFrom(locals), async (tx) => {
        await deals.create(tx, tenantId, input)
        return { dealAdded: true }
      })
    } catch (e) {
      const refused = constraintFailure(e)
      if (refused) return refused
      throw e
    }
  },
}
