import { error, fail } from "@sveltejs/kit"
import type { Actions, PageServerLoad } from "./$types"
import * as deals from "$lib/server/crm/deals.repo"
import * as pipelineStages from "$lib/server/crm/pipeline-stages.repo"
import {
  pickerQuery,
  searchCustomers,
  searchEmployees,
} from "$lib/server/pickers"
import { withTenant, actorFrom } from "$lib/server/db/tenant"
import { contextFrom, requireCan } from "$lib/server/auth/can"
import { FormReader, uuidParam } from "$lib/server/forms"
import { constraintFailure } from "$lib/server/db/constraints"

/**
 * `crm_deals` is SCALE_SENSITIVE — one row per potential sale, forever — so
 * the board reads a page of each stage, never the whole table. The whole
 * board holds at most BOARD_CARDS cards, split evenly across however many
 * stages the tenant configured, and at most MAX_PER_STAGE per column: a card
 * is heavier than a table row.
 */
const BOARD_CARDS = 100
const MAX_PER_STAGE = 20

export const load: PageServerLoad = async ({ locals, url }) => {
  if (!locals.tenantId) error(403, "No tenant")
  requireCan(contextFrom(locals), "crm.read")

  // One column paged at a time: the URL carries which stage, and which page.
  const pageStageId = uuidParam(url.searchParams.get("stage"))
  const stagePage = Math.max(1, Number(url.searchParams.get("page")) || 1)

  return withTenant(actorFrom(locals), async (tx) => {
    const stages = await pipelineStages.list(tx)
    const perStage = Math.max(
      1,
      Math.min(
        MAX_PER_STAGE,
        Math.floor(BOARD_CARDS / Math.max(1, stages.length)),
      ),
    )
    return {
      deals: await deals.listForBoard(tx, { perStage, pageStageId, stagePage }),
      stageSummary: await deals.stageSummary(tx),
      stages,
      pageStageId,
      stagePage,
      perStage,
    }
  })
}

export const actions: Actions = {
  /** Backs the new-deal client picker. */
  searchCustomers: async ({ request, locals }) => {
    if (!locals.tenantId) error(403, "No tenant")
    requireCan(contextFrom(locals), "crm.read")
    const q = pickerQuery(new FormReader(await request.formData()))
    return withTenant(actorFrom(locals), async (tx) => ({
      results: await searchCustomers(tx, q),
    }))
  },

  /** Backs the new-deal owner picker. */
  searchPeople: async ({ request, locals }) => {
    if (!locals.tenantId) error(403, "No tenant")
    requireCan(contextFrom(locals), "crm.read")
    const q = pickerQuery(new FormReader(await request.formData()))
    return withTenant(actorFrom(locals), async (tx) => ({
      results: await searchEmployees(tx, q),
    }))
  },

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
