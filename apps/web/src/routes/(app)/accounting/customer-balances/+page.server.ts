import { error } from "@sveltejs/kit"
import type { PageServerLoad } from "./$types"
import * as acc from "$lib/server/accounting/accounting.repo"
import * as locationsRepo from "$lib/server/firm-profile/firm_locations.repo"
import { withTenant, actorFrom } from "$lib/server/db/tenant"
import { can, contextFrom } from "$lib/server/auth/can"
import { pageOf, pageParam } from "$lib/server/db/paged"

const PAGE_SIZE = 50

/** /accounting/customer-balances — who owes money and how much, for credit-risk review. */
export const load: PageServerLoad = async ({ locals, url }) => {
  if (!locals.tenantId) error(403, "No tenant")
  const ctx = contextFrom(locals)
  if (!can(ctx, "accounting.read")) {
    error(403, "Only finance can see customer balances.")
  }
  const page = pageParam(url)

  return withTenant(actorFrom(locals), async (tx) => ({
    ...(await acc.customerBalancesPage(tx, pageOf(page, PAGE_SIZE))),
    page,
    pageSize: PAGE_SIZE,
    // For per-market number formatting; see localeForCurrency.
    locations: await locationsRepo.list(tx),
  }))
}
