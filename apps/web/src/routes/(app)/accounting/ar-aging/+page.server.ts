import { error } from "@sveltejs/kit"
import type { PageServerLoad } from "./$types"
import * as acc from "$lib/server/accounting/accounting.repo"
import * as locationsRepo from "$lib/server/firm-profile/firm_locations.repo"
import { withTenant, actorFrom } from "$lib/server/db/tenant"
import { can, contextFrom } from "$lib/server/auth/can"
import { parseAsOfOnlyFilters } from "$lib/server/accounting/report_filters"

/** /accounting/ar-aging — open receivables bucketed by days past due. */
export const load: PageServerLoad = async ({ locals, url }) => {
  if (!locals.tenantId) error(403, "No tenant")
  const ctx = contextFrom(locals)
  if (!can(ctx, "accounting.read")) {
    error(403, "Only finance can see the AR aging report.")
  }

  const { asOf } = parseAsOfOnlyFilters(url)

  return withTenant(actorFrom(locals), async (tx) => ({
    rows: await acc.arAging(tx, { asOf }),
    filters: { asOf },
    // For per-market number formatting; see localeForCurrency.
    locations: await locationsRepo.list(tx),
  }))
}
