import { error } from "@sveltejs/kit"
import type { PageServerLoad } from "./$types"
import * as acc from "$lib/server/accounting/accounting.repo"
import { withTenant, actorFrom } from "$lib/server/db/tenant"
import { can, contextFrom } from "$lib/server/auth/can"
import { parsePeriodFilters } from "$lib/server/accounting/report_filters"

/**
 * /accounting/profit-loss — revenue and expense activity for a period, with
 * net income. Unlike the trial balance's cumulative `asOf`, a P&L is
 * inherently periodic: both `from` and `to` are optional filters, and
 * leaving both blank reports all posted activity to date.
 */
export const load: PageServerLoad = async ({ locals, url }) => {
  if (!locals.tenantId) error(403, "No tenant")
  const ctx = contextFrom(locals)
  if (!can(ctx, "accounting.read")) {
    error(403, "Only finance can see the profit and loss statement.")
  }

  const { from, to, compare } = parsePeriodFilters(url)
  const filters = { from, to }
  return withTenant(actorFrom(locals), async (tx) => ({
    rows: await acc.profitAndLoss(tx, filters),
    totals: await acc.profitAndLossTotals(tx, filters),
    filters,
    compare,
    comparison:
      compare !== "none" && from && to
        ? await acc.profitAndLossComparison(tx, {
            from,
            to,
            compareTo: compare,
          })
        : null,
  }))
}
