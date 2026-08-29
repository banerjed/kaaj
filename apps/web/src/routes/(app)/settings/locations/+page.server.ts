import type { PageServerLoad } from "./$types"
import * as locations from "$lib/server/firm-profile/firm_locations.repo"
import { withTenant } from "$lib/server/db/tenant"
import { error } from "@sveltejs/kit"

/**
 * /settings/locations — module-firm-profile.md § Locations Page.
 *
 * One `load`, one transaction, one query (docs/03-perf_guide.md). The layout
 * has already established that `locals.tenantId` is set and redirected if not,
 * so the check here is a type narrowing rather than a second guard.
 */
export const load: PageServerLoad = async ({ locals }) => {
  if (!locals.tenantId) {
    error(403, "No tenant")
  }

  const rows = await withTenant(locals.tenantId, (tx) => locations.list(tx))

  return { locations: rows }
}
