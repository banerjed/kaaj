import { error, fail, redirect } from "@sveltejs/kit"
import type { Actions, PageServerLoad } from "./$types"
import * as employees from "$lib/server/employee-profile/employees.repo"
import * as departments from "$lib/server/firm-profile/firm_departments.repo"
import * as locationsRepo from "$lib/server/firm-profile/firm_locations.repo"
import * as titles from "$lib/server/firm-profile/firm_job_titles.repo"
import { withTenant, actorFrom } from "$lib/server/db/tenant"
import { contextFrom, requireCan } from "$lib/server/auth/can"
import {
  employeeEnums,
  parseEmployeeForm,
} from "$lib/server/employee-profile/employee-form"

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

    const created = await withTenant(actorFrom(locals), (tx) =>
      employees.create(tx, tenantId, parsed.input, actorId),
    )

    // Redirect to the record rather than re-rendering the form: the person now
    // exists, and leaving a populated create form on screen invites a second
    // submission that would fail on the unique employee_id.
    redirect(303, `/employees/${created.id}`)
  },
}
