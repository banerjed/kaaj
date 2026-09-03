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

/**
 * Employment history, not personal detail.
 *
 * Job title, manager, department, location and status are the facts someone
 * later asks about. Date of birth, phone and address are personal data, and
 * copying them into a table that can never be deleted from would defeat the
 * erasure the PII layer exists to make possible.
 */
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
        // Read before writing, so the entry says what the job title, manager
        // or department WAS. "Who moved me under this manager, and when" is the
        // question this exists to answer.
        const before = await employees.getById(tx, params.id)
        await employees.update(tx, params.id, parsed.input)

        await audit.record(tx, contextFrom(locals)!, {
          action: "update",
          entityType: "employees",
          entityId: params.id,
          module: "employee-profile",
          changes: audit.diff(before, parsed.input, EMPLOYMENT_FIELDS),
        })
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
