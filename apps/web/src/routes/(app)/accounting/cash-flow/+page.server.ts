import { error } from "@sveltejs/kit"
import type { PageServerLoad } from "./$types"
import * as acc from "$lib/server/accounting/accounting.repo"
import { withTenant, actorFrom } from "$lib/server/db/tenant"
import { can, contextFrom } from "$lib/server/auth/can"
import { FormReader } from "$lib/server/forms"
import {
  readCompare,
  checkCompareOk,
  guardCompareNeedsRange,
  guardPreviousYearOverlap,
} from "$lib/server/accounting/period-compare"

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

  const params = new FormData()
  params.append("from", url.searchParams.get("from") ?? "")
  params.append("to", url.searchParams.get("to") ?? "")
  params.append("compare", url.searchParams.get("compare") ?? "")
  const f = new FormReader(params)
  // Read above the gate — inside the object it'd be reported too late (L33).
  const from = f.date("from")
  const to = f.date("to")
  const compare = readCompare(f)
  checkCompareOk(f)
  // An inverted range isn't just "no results" here the way it is for the
  // P&L: begin_bal/end_bal/net_income stay independently well-defined but
  // mutually inconsistent, so `reconciles` goes false and the page accuses
  // the LEDGER of not balancing when the real problem is the date range.
  if (from && to && from > to) {
    error(400, "The 'from' date must be on or before the 'to' date.")
  }
  guardCompareNeedsRange(compare, from, to)
  guardPreviousYearOverlap(compare, from, to)

  const filters = { from: from ?? "", to: to ?? "" }
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
