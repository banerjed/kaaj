import { error } from "@sveltejs/kit"
import type { PageServerLoad } from "./$types"
import * as acc from "$lib/server/accounting/accounting.repo"
import { withTenant, actorFrom } from "$lib/server/db/tenant"
import { can, contextFrom } from "$lib/server/auth/can"
import { parseFromToFilters } from "$lib/server/accounting/report_filters"

/**
 * /accounting/tax-summary — sales tax / VAT liability by jurisdiction
 * (US-ACC-048/049), read from the real posted GL. Periodic like the P&L,
 * not a point-in-time snapshot: both `from` and `to` are optional, and
 * leaving both blank reports all posted activity to date.
 */
export const load: PageServerLoad = async ({ locals, url }) => {
  if (!locals.tenantId) error(403, "No tenant")
  const ctx = contextFrom(locals)
  if (!can(ctx, "accounting.read")) {
    error(403, "Only finance can see the tax liability summary.")
  }

  const filters = parseFromToFilters(url)
  return withTenant(actorFrom(locals), async (tx) => ({
    rows: await acc.taxLiabilitySummary(tx, filters),
    filters,
  }))
}
