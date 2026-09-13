import { error } from "@sveltejs/kit"
import type { PageServerLoad } from "./$types"
import * as acc from "$lib/server/accounting/accounting.repo"
import { withTenant, actorFrom } from "$lib/server/db/tenant"
import { can, contextFrom } from "$lib/server/auth/can"
import { FormReader } from "$lib/server/forms"

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

  const params = new FormData()
  params.append("as_of", url.searchParams.get("as_of") ?? "")
  params.append("compare_as_of", url.searchParams.get("compare_as_of") ?? "")
  const f = new FormReader(params)
  // Read above the gate — inside the object it'd be reported too late (L33).
  const asOf = f.date("as_of")
  const compareAsOf = f.date("compare_as_of")
  if (!f.ok) error(400, "That date is not a real date.")
  // Unlike the P&L/cash-flow/equity "compare" dropdown, a balance sheet has
  // no computable "prior period" — it names a second point in time
  // directly, so BOTH dates must be given for a comparison to mean anything.
  if (compareAsOf && !asOf) {
    error(400, "Give an 'as of' date to compare against.")
  }
  // No `compareAsOf <= asOf` guard, unlike the cash flow statement's
  // `from`/`to`: these are two independent snapshots, not a range, so
  // "compare to a later date" is a real question (how much will change by
  // then) rather than an inverted one. `change` just flips sign.

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
