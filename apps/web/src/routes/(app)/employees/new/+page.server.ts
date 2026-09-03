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

/** /employees/new — module-employee-profile.md § Use Case 1: Onboarding. */
export const load: PageServerLoad = async ({ locals }) => {
  if (!locals.tenantId) error(403, "No tenant")

  return withTenant(actorFrom(locals), async (tx) => ({
    employee: null,
    departments: await departments.list(tx),
    locations: await locationsRepo.list(tx),
    jobTitles: await titles.list(tx),
    managers: await employees.managerOptions(tx),
    enums: employeeEnums,
  }))
}

/** Hire facts only — no PII, which would defeat erasure in an undeletable table. */
const HIRE_FIELDS = [
  "employee_id",
  "first_name",
  "last_name",
  "email",
  "job_title",
  "department_code",
  "location_code",
  "employment_status",
  "employment_type",
  "start_date",
  "manager_id",
]

export const actions: Actions = {
  default: async ({ request, locals }) => {
    if (!locals.tenantId) error(403, "No tenant")
    requireCan(contextFrom(locals), "employee.create")
    const tenantId = locals.tenantId
    const actorId = locals.user?.id
    if (!actorId) error(403, "No user")

    const data = await request.formData()
    const parsed = parseEmployeeForm(data)
    if (!parsed.ok) {
      return fail(400, {
        errorFields: parsed.errorFields,
        message: parsed.message,
      })
    }

    let created
    try {
      created = await withTenant(actorFrom(locals), async (tx) => {
        const row = await employees.create(tx, tenantId, parsed.input, actorId)

        // `from` is null throughout — the person did not exist a moment ago.
        await audit.record(tx, contextFrom(locals)!, {
          action: "create",
          entityType: "employees",
          entityId: row.id,
          module: "employee-profile",
          changes: audit.diff(null, parsed.input, HIRE_FIELDS),
        })
        return row
      })
    } catch (e) {
      const refused = constraintFailure(e)
      if (refused) return refused
      throw e
    }

    // Redirect rather than re-render — avoids a duplicate submission on the unique employee_id.
    redirect(303, `/employees/${created.id}`)
  },
}
