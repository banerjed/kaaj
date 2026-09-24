import { error } from "@sveltejs/kit"
import type { PageServerLoad } from "./$types"
import * as acc from "$lib/server/accounting/accounting.repo"
import { withTenant, actorFrom } from "$lib/server/db/tenant"
import { can, contextFrom } from "$lib/server/auth/can"
import { parsePeriodFilters } from "$lib/server/accounting/report_filters"

/**
 * /accounting/cash-flow — the indirect method: net income for the period,
 * adjusted for the period's change in every non-cash working-capital
 * account, reconciled against the real Cash-account balance change.
 */
export const load: PageServerLoad = async ({ locals, url }) => {
  if (!locals.tenantId) error(403, "No tenant")
  const ctx = contextFrom(locals)
  if (!can(ctx, "accounting.read")) {
    error(403, "Only finance can see the cash flow statement.")
  }

  const { from, to, compare } = parsePeriodFilters(url)
  const filters = { from, to }
  return withTenant(actorFrom(locals), async (tx) => ({
    rows: await acc.cashFlowStatement(tx, filters),
    totals: await acc.cashFlowTotals(tx, filters),
    filters,
    compare,
    comparison:
      compare !== "none" && from && to
        ? await acc.cashFlowComparison(tx, { from, to, compareTo: compare })
        : null,
  }))
}
