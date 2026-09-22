import { error } from "@sveltejs/kit"
import type { PageServerLoad } from "./$types"
import * as acc from "$lib/server/accounting/accounting.repo"
import { withTenant, actorFrom } from "$lib/server/db/tenant"
import { can, contextFrom } from "$lib/server/auth/can"
import { parseAsOfCompareFilters } from "$lib/server/accounting/report_filters"

/**
 * /accounting/balance-sheet — assets, liabilities and equity as of a date,
 * cumulative like the trial balance's `asOf`, not periodic like the P&L.
 */
export const load: PageServerLoad = async ({ locals, url }) => {
  if (!locals.tenantId) error(403, "No tenant")
  const ctx = contextFrom(locals)
  if (!can(ctx, "accounting.read")) {
    error(403, "Only finance can see the balance sheet.")
  }

  const { asOf, compareAsOf } = parseAsOfCompareFilters(url)

  return withTenant(actorFrom(locals), async (tx) => ({
    rows: await acc.balanceSheet(tx, { asOf: asOf ?? "" }),
    totals: await acc.balanceSheetTotals(tx, { asOf: asOf ?? "" }),
    filters: { asOf: asOf ?? "", compareAsOf: compareAsOf ?? "" },
    comparison:
      asOf && compareAsOf
        ? await acc.balanceSheetComparison(tx, { asOf, compareAsOf })
        : null,
    comparisonTotals:
      asOf && compareAsOf
        ? await acc.balanceSheetComparisonTotals(tx, { asOf, compareAsOf })
        : null,
  }))
}
