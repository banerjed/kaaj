import { error } from "@sveltejs/kit"
import type { PageServerLoad } from "./$types"
import * as acc from "$lib/server/accounting/accounting.repo"
import { withTenant, actorFrom } from "$lib/server/db/tenant"
import { can, contextFrom } from "$lib/server/auth/can"
import { FormReader } from "$lib/server/forms"

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

  const params = new FormData()
  params.append("as_of", url.searchParams.get("as_of") ?? "")
  const f = new FormReader(params)
  // Read above the gate — inside the object it'd be reported too late (L33).
  const asOf = f.date("as_of")
  if (!f.ok) error(400, "That date is not a real date.")

  return withTenant(actorFrom(locals), async (tx) => ({
    rows: await acc.trialBalance(tx, { asOf: asOf ?? "" }),
    totals: await acc.trialBalanceTotals(tx, { asOf: asOf ?? "" }),
    tieOut: await acc.controlAccountTieOut(tx),
    filters: { asOf: asOf ?? "" },
  }))
}
