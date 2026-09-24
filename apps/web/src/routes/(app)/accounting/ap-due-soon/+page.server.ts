import { error } from "@sveltejs/kit"
import type { PageServerLoad } from "./$types"
import * as pay from "$lib/server/accounting/payables.repo"
import { AP_DUE_SOON_WINDOWS } from "$lib/server/accounting/payables.repo"
import * as locationsRepo from "$lib/server/firm-profile/firm_locations.repo"
import { withTenant, actorFrom } from "$lib/server/db/tenant"
import { can, contextFrom } from "$lib/server/auth/can"
import { parseApDueSoonFilters } from "$lib/server/accounting/report_filters"

/** /accounting/ap-due-soon — bills coming due, distinct from the overdue flag. */
export const load: PageServerLoad = async ({ locals, url }) => {
  if (!locals.tenantId) error(403, "No tenant")
  const ctx = contextFrom(locals)
  if (!can(ctx, "accounting.read")) {
    error(403, "Only finance can see upcoming bills.")
  }

  const { asOf, withinDays } = parseApDueSoonFilters(url)

  return withTenant(actorFrom(locals), async (tx) => ({
    rows: await pay.apDueSoon(tx, { asOf, withinDays }),
    windows: AP_DUE_SOON_WINDOWS,
    filters: { asOf, withinDays },
    // For per-market number formatting; see localeForCurrency.
    locations: await locationsRepo.list(tx),
  }))
}
