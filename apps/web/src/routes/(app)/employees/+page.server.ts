import { error } from "@sveltejs/kit"
import type { PageServerLoad } from "./$types"
import * as employees from "$lib/server/employee-profile/employees.repo"
import * as departments from "$lib/server/firm-profile/firm_departments.repo"
import * as locationsRepo from "$lib/server/firm-profile/firm_locations.repo"
import { withTenant } from "$lib/server/db/tenant"

const PAGE_SIZE = 25

/**
 * /employees — the directory.
 *
 * Filter and page state live in the URL (doc 03), so a filtered view is
 * shareable, survives a reload, and the back button behaves.
 */
export const load: PageServerLoad = async ({ locals, url }) => {
  if (!locals.tenantId) error(403, "No tenant")

  const search = url.searchParams.get("q") ?? ""
  const departmentCode = url.searchParams.get("dept") ?? ""
  const locationCode = url.searchParams.get("loc") ?? ""
  const status = url.searchParams.get("status") ?? ""
  const includeInactive = url.searchParams.get("inactive") === "1"
  const page = Math.max(1, Number(url.searchParams.get("page") ?? 1) || 1)

  const result = await withTenant(locals.tenantId, async (tx) => ({
    directory: await employees.list(tx, {
      search,
      departmentCode,
      locationCode,
      status,
      includeInactive,
      limit: PAGE_SIZE,
      offset: (page - 1) * PAGE_SIZE,
    }),
    // Filter options. Small, and needed to render the toolbar at all.
    departments: await departments.list(tx),
    locations: await locationsRepo.list(tx),
  }))

  return {
    employees: result.directory.rows,
    total: result.directory.total,
    departments: result.departments,
    locations: result.locations,
    filters: { search, departmentCode, locationCode, status, includeInactive },
    page,
    pageSize: PAGE_SIZE,
  }
}
