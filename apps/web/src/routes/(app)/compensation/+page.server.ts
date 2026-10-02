import { error } from "@sveltejs/kit"
import type { PageServerLoad } from "./$types"
import * as base from "$lib/server/compensation/compensation_base.repo"
import * as locationsRepo from "$lib/server/firm-profile/firm_locations.repo"
import { withTenant, actorFrom } from "$lib/server/db/tenant"
import { pageOf, pageParam } from "$lib/server/db/paged"
import { can, contextFrom } from "$lib/server/auth/can"

const PAGE_SIZE = 50

/** /compensation — row policy scopes the data, so no filter or gate here; you get your own row unless the policy grants more. */
export const load: PageServerLoad = async ({ locals, url }) => {
  if (!locals.tenantId) error(403, "No tenant")
  const ctx = contextFrom(locals)
  const page = pageParam(url)

  return withTenant(actorFrom(locals), async (tx) => {
    const { rows, total } = await base.currentPage(tx, pageOf(page, PAGE_SIZE))

    return {
      rows,
      total,
      page,
      pageSize: PAGE_SIZE,
      // Drives the wording, not the data: the data is already scoped.
      seesEveryone: can(ctx, "compensation.read.all"),
      mayRecordChange: can(ctx, "compensation.write"),
      myEmployeeId: ctx?.employeeId ?? null,
      // For per-market number formatting; see localeForCurrency.
      locations: await locationsRepo.list(tx),
    }
  })
}
