import { error } from "@sveltejs/kit"
import type { PageServerLoad } from "./$types"
import * as attendance from "$lib/server/hr/hr_attendance.repo"
import { withTenant, actorFrom } from "$lib/server/db/tenant"
import { FormReader } from "$lib/server/forms"

// No CHECK constraint on hr_attendance.status, so this list is the only guard.
const STATUSES = ["present", "late", "absent", "early_departure"] as const

const PAGE_SIZE = 20

/**
 * /attendance — module-hr.md § Attendance Tracking (US-HR-022, US-HR-024).
 * Read-only for now; clock in/out, corrections and overtime are future slices (11-module-roadmap.md).
 */
export const load: PageServerLoad = async ({ locals, url }) => {
  if (!locals.tenantId) error(403, "No tenant")

  // URL is the filter state (shareable, survives reload); read through FormReader so a crafted `?from=x` can't reach the ::date cast.
  const params = new FormData()
  for (const k of ["from", "to", "status", "employee"]) {
    params.append(k, url.searchParams.get(k) ?? "")
  }
  const f = new FormReader(params)
  const from = f.date("from")
  const to = f.date("to")
  const status = f.choice("status", STATUSES) ?? ""
  const employeeId = f.uuid("employee")
  const page = Math.max(1, Number(url.searchParams.get("page")) || 1)

  return withTenant(actorFrom(locals), async (tx) => {
    const queryFilters = {
      from: from ?? undefined,
      to: to ?? undefined,
      status,
      employeeId: employeeId ?? undefined,
    }
    const [days, total] = await Promise.all([
      attendance.list(tx, {
        ...queryFilters,
        limit: PAGE_SIZE,
        offset: (page - 1) * PAGE_SIZE,
      }),
      attendance.count(tx, queryFilters),
    ])
    return {
      days,
      total,
      page,
      pageSize: PAGE_SIZE,
      statuses: STATUSES,
      // A bad filter is dropped, not a 400; the page reflects what was actually applied.
      filters: {
        from: from ?? "",
        to: to ?? "",
        status,
        employee: employeeId ?? "",
      },
      rejected: f.errorFields,
    }
  })
}
