import { error } from "@sveltejs/kit"
import type { PageServerLoad } from "./$types"
import { fxRevaluationPage } from "$lib/server/accounting/fx_revaluation.repo"
import { pageOf, pageParam } from "$lib/server/db/paged"
import * as locationsRepo from "$lib/server/firm-profile/firm_locations.repo"
import { withTenant, actorFrom } from "$lib/server/db/tenant"
import { can, contextFrom } from "$lib/server/auth/can"
import { parseAsOfOnlyFilters } from "$lib/server/accounting/report_filters"

const PAGE_SIZE = 50

/**
 * /accounting/fx-revaluation — unrealized FX gain/loss on open
 * foreign-currency AR/AP as of a chosen date (US-ACC-053). Report-only:
 * nothing here posts a journal entry. See `fx_revaluation.repo.ts` for why.
 */
export const load: PageServerLoad = async ({ locals, url }) => {
  if (!locals.tenantId) error(403, "No tenant")
  const ctx = contextFrom(locals)
  if (!can(ctx, "accounting.read")) {
    error(403, "Only finance can see the FX revaluation report.")
  }

  const { asOf } = parseAsOfOnlyFilters(url)
  const arPage = pageParam(url, "ar_page")
  const apPage = pageParam(url, "ap_page")

  return withTenant(actorFrom(locals), async (tx) => ({
    ...(await fxRevaluationPage(tx, asOf, {
      receivables: pageOf(arPage, PAGE_SIZE),
      payables: pageOf(apPage, PAGE_SIZE),
    })),
    arPage,
    apPage,
    pageSize: PAGE_SIZE,
    filters: { asOf: asOf ?? "" },
    // For per-market number formatting; see localeForCurrency.
    locations: await locationsRepo.list(tx),
  }))
}
