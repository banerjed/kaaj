import { error } from "@sveltejs/kit"
import type { PageServerLoad } from "./$types"
import * as acc from "$lib/server/accounting/accounting.repo"
import { withTenant, actorFrom } from "$lib/server/db/tenant"
import { can, contextFrom } from "$lib/server/auth/can"
import { parseAsOfCompareFilters } from "$lib/server/accounting/report_filters"

/**
 * /accounting/trial-balance — every account's activity in base currency,
 * and whether the AR/AP control accounts tie to their subledgers.
 */
export const load: PageServerLoad = async ({ locals, url }) => {
  if (!locals.tenantId) error(403, "No tenant")
  const ctx = contextFrom(locals)
  if (!can(ctx, "accounting.read")) {
    error(403, "Only finance can see the trial balance.")
  }

  const { asOf, compareAsOf } = parseAsOfCompareFilters(url)

  return withTenant(actorFrom(locals), async (tx) => ({
    rows: await acc.trialBalance(tx, { asOf: asOf ?? "" }),
    totals: await acc.trialBalanceTotals(tx, { asOf: asOf ?? "" }),
    tieOut: await acc.controlAccountTieOut(tx),
    filters: { asOf: asOf ?? "", compareAsOf: compareAsOf ?? "" },
    comparison:
      asOf && compareAsOf
        ? await acc.trialBalanceComparison(tx, { asOf, compareAsOf })
        : null,
    comparisonTotals:
      asOf && compareAsOf
        ? await acc.trialBalanceComparisonTotals(tx, { asOf, compareAsOf })
        : null,
  }))
}
