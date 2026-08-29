import { error } from "@sveltejs/kit"
import type { PageServerLoad } from "./$types"
import * as employees from "$lib/server/employee-profile/employees.repo"
import * as locationsRepo from "$lib/server/firm-profile/firm_locations.repo"
import { withTenant } from "$lib/server/db/tenant"

/**
 * /employees/[id] — module-employee-profile.md.
 *
 * A 404 here means "no such employee IN THIS TENANT": RLS filters the row out
 * before this code sees it, so another firm's employee is indistinguishable
 * from one that does not exist. That is the intended behaviour — a 403 would
 * confirm the id is real.
 */
export const load: PageServerLoad = async ({ locals, params }) => {
  if (!locals.tenantId) error(403, "No tenant")

  const result = await withTenant(locals.tenantId, async (tx) => {
    const employee = await employees.getById(tx, params.id)
    if (!employee) return null
    return {
      employee,
      compensation: await employees.compensationHistory(tx, params.id),
      locations: await locationsRepo.list(tx),
    }
  })

  if (!result) error(404, "Employee not found")
  return result
}
