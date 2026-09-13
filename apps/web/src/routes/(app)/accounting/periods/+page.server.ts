import { error, fail } from "@sveltejs/kit"
import type { Actions, PageServerLoad } from "./$types"
import * as acc from "$lib/server/accounting/accounting.repo"
import { AccountingRefused } from "$lib/server/accounting/accounting.repo"
import { withTenant, actorFrom } from "$lib/server/db/tenant"
import * as audit from "$lib/server/audit/audit.repo"
import { can, contextFrom, requireCan } from "$lib/server/auth/can"
import { FormReader } from "$lib/server/forms"
import { constraintFailure } from "$lib/server/db/constraints"

/** /accounting/periods — open/close/reopen accounting periods (US-ACC-035, INV-ACC-002). */
export const load: PageServerLoad = async ({ locals }) => {
  if (!locals.tenantId) error(403, "No tenant")
  const ctx = contextFrom(locals)
  if (!can(ctx, "accounting.read")) {
    error(403, "Only finance can see accounting periods.")
  }
  return withTenant(actorFrom(locals), async (tx) => ({
    periods: await acc.listAccountingPeriods(tx),
    mayWrite: can(ctx, "accounting.write"),
  }))
}

/** A domain refusal the page can show, rather than a constraint name in a 500. */
function refusal(e: AccountingRefused) {
  switch (e.reason) {
    case "no_such_period":
      return {
        message: "That period no longer exists. Reload the page.",
        errorFields: ["period"],
      }
    case "wrong_status":
      return {
        message: `${e.detail}.`,
        errorFields: ["period"],
      }
    default:
      return {
        message: "That could not be completed.",
        errorFields: ["period"],
      }
  }
}

export const actions: Actions = {
  close: async ({ request, locals }) => {
    if (!locals.tenantId) error(403, "No tenant")
    const ctx = contextFrom(locals)
    requireCan(ctx, "accounting.write")

    const f = new FormReader(await request.formData())
    const periodId = f.uuid("period_id", { required: true })
    if (!f.ok) return fail(400, f.problem())

    try {
      await withTenant(actorFrom(locals), async (tx) => {
        const { periodName } = await acc.closePeriod(
          tx,
          periodId!,
          ctx!.employeeId ?? ctx!.userId,
        )
        await audit.record(tx, ctx!, {
          action: "close_period",
          entityType: "accounting_periods",
          entityId: periodId!,
          module: "accounting",
          changes: {
            status: { from: "open", to: "closed" },
            period: { from: null, to: periodName },
          },
        })
      })
    } catch (e) {
      if (e instanceof AccountingRefused) return fail(400, refusal(e))
      const refused = constraintFailure(e)
      if (refused) return refused
      throw e
    }
    return { closed: true }
  },

  reopen: async ({ request, locals }) => {
    if (!locals.tenantId) error(403, "No tenant")
    const ctx = contextFrom(locals)
    requireCan(ctx, "accounting.write")

    const f = new FormReader(await request.formData())
    const periodId = f.uuid("period_id", { required: true })
    const reason = f.text("reason", { max: 500, required: true })
    if (!f.ok) return fail(400, f.problem())

    try {
      await withTenant(actorFrom(locals), async (tx) => {
        const { periodName } = await acc.reopenPeriod(tx, periodId!)
        await audit.record(tx, ctx!, {
          action: "reopen_period",
          entityType: "accounting_periods",
          entityId: periodId!,
          module: "accounting",
          changes: {
            status: { from: "closed", to: "open" },
            period: { from: null, to: periodName },
          },
          reason: reason!,
        })
      })
    } catch (e) {
      if (e instanceof AccountingRefused) return fail(400, refusal(e))
      const refused = constraintFailure(e)
      if (refused) return refused
      throw e
    }
    return { reopened: true }
  },
}
