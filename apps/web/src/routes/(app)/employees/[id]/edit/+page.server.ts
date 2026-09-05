import { error, fail, redirect } from "@sveltejs/kit"
import type { Actions, PageServerLoad } from "./$types"
import * as employees from "$lib/server/employee-profile/employees.repo"
import * as departments from "$lib/server/firm-profile/firm_departments.repo"
import * as locationsRepo from "$lib/server/firm-profile/firm_locations.repo"
import * as titles from "$lib/server/firm-profile/firm_job_titles.repo"
import * as audit from "$lib/server/audit/audit.repo"
import { withTenant, actorFrom } from "$lib/server/db/tenant"
import { contextFrom, requireCan } from "$lib/server/auth/can"
import {
  employeeEnums,
  parseEmployeeForm,
} from "$lib/server/employee-profile/employee-form"
import { constraintFailure } from "$lib/server/db/constraints"

export const load: PageServerLoad = async ({ locals, params }) => {
  if (!locals.tenantId) error(403, "No tenant")

  const result = await withTenant(actorFrom(locals), async (tx) => {
    const employee = await employees.getById(tx, params.id)
    if (!employee) return null
    return {
      employee,
      departments: await departments.list(tx),
      locations: await locationsRepo.list(tx),
      jobTitles: await titles.list(tx),
      // Excluding self from the manager list removes the trivial cycle from
      // the UI; wouldReportToSelf catches the indirect ones.
      managers: await employees.managerOptions(tx, params.id),
      enums: employeeEnums,
    }
  })

  if (!result) error(404, "Employee not found")
  return result
}

/** Employment facts only — no PII, which would defeat erasure in an undeletable table. */
const EMPLOYMENT_FIELDS = [
  "job_title",
  "job_level",
  "department_code",
  "location_code",
  "manager_id",
  "employment_status",
  "employment_type",
  "start_date",
  "end_date",
  "fte",
]

export const actions: Actions = {
  default: async ({ request, locals, params }) => {
    if (!locals.tenantId) error(403, "No tenant")
    requireCan(contextFrom(locals), "employee.write")

    const data = await request.formData()
    const parsed = parseEmployeeForm(data)
    if (!parsed.ok) {
      return fail(400, {
        errorFields: parsed.errorFields,
        message: parsed.message,
      })
    }

    let cycle
    try {
      cycle = await withTenant(actorFrom(locals), async (tx) => {
        if (
          await employees.wouldReportToSelf(
            tx,
            params.id,
            parsed.input.manager_id,
          )
        ) {
          return true
        }
        // Read before writing so the audit entry captures the prior value.
        const before = await employees.getById(tx, params.id)
        await employees.update(tx, params.id, parsed.input)

        await audit.record(tx, contextFrom(locals)!, {
          action: "update",
          entityType: "employees",
          entityId: params.id,
          module: "employee-profile",
          changes: audit.diff(before, parsed.input, EMPLOYMENT_FIELDS),
        })

        // Directory status and access are two different things — marking
        // someone terminated/retired must revoke the login, not just their
        // place in the org chart (DEFECT-01, TESTPLAN.md §0). Deliberately
        // one-directional: un-terminating someone does not restore the old
        // membership, since what role they should come back as is a product
        // decision this fix doesn't make.
        const wasGoing =
          before?.employment_status === "terminated" ||
          before?.employment_status === "retired"
        const isGoing =
          parsed.input.employment_status === "terminated" ||
          parsed.input.employment_status === "retired"
        if (isGoing && !wasGoing) {
          const [membership] = await tx<{ id: string }[]>`
            UPDATE tenant_users SET is_active = FALSE
             WHERE tenant_id = ${locals.tenantId}
               AND employee_id = ${params.id}
               AND is_active
            RETURNING id
          `
          if (membership) {
            await audit.record(tx, contextFrom(locals)!, {
              action: "role_revoke",
              entityType: "tenant_users",
              entityId: membership.id,
              module: "employee-profile",
              changes: { is_active: { from: "true", to: "false" } },
            })
          }
        }
        return false
      })
    } catch (e) {
      const refused = constraintFailure(e)
      if (refused) return refused
      throw e
    }

    if (cycle) {
      return fail(400, {
        errorFields: ["manager_id"],
        message: "That manager reports to this person, directly or indirectly.",
      })
    }

    redirect(303, `/employees/${params.id}`)
  },
}
