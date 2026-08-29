import { error } from "@sveltejs/kit"
import type { PageServerLoad } from "./$types"
import * as attendance from "$lib/server/hr/hr_attendance.repo"
import { withTenant } from "$lib/server/db/tenant"
import { FormReader } from "$lib/server/forms"

// No CHECK constraint on hr_attendance.status, so this list is the only guard.
const STATUSES = ["present", "late", "absent", "early_departure"] as const

/**
 * /attendance — module-hr.md § Attendance Tracking (US-HR-022, US-HR-024).
 *
 * Read-only for this slice: the timesheet as recorded, in each office's own
 * timezone. Clock in/out and corrections (US-HR-021, US-HR-025) need a write
 * path and an audit trail, and overtime (US-HR-026) needs the payroll policy to
 * carry data — see the note in 11-module-roadmap.md.
 */
export const load: PageServerLoad = async ({ locals, url }) => {
  if (!locals.tenantId) error(403, "No tenant")

  // The URL is the filter state (doc 03), so a filtered view is shareable and
  // survives a reload. Read through the same reader the actions use: a crafted
  // `?from=x` would otherwise reach a ::date cast.
  const params = new FormData()
  for (const k of ["from", "to", "status", "employee"]) {
    params.append(k, url.searchParams.get(k) ?? "")
  }
  const f = new FormReader(params)
  const from = f.date("from")
  const to = f.date("to")
  const status = f.choice("status", STATUSES) ?? ""
  const employeeId = f.uuid("employee")

  // One query, because that is all the page reads (doc 03).
  return withTenant(locals.tenantId, async (tx) => {
    return {
      days: await attendance.list(tx, {
        from: from ?? undefined,
        to: to ?? undefined,
        status,
        employeeId: employeeId ?? undefined,
      }),
      statuses: STATUSES,
      // A bad filter is not worth a 400 on a read — it is dropped, and the page
      // reflects what was actually applied rather than what was asked for.
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
