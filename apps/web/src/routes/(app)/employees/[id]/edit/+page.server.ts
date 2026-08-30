import { error, fail, redirect } from "@sveltejs/kit"
import type { Actions, PageServerLoad } from "./$types"
import * as employees from "$lib/server/employee-profile/employees.repo"
import * as departments from "$lib/server/firm-profile/firm_departments.repo"
import * as locationsRepo from "$lib/server/firm-profile/firm_locations.repo"
import * as titles from "$lib/server/firm-profile/firm_job_titles.repo"
import { withTenant } from "$lib/server/db/tenant"
import { contextFrom, requireCan } from "$lib/server/auth/can"
import {
  employeeEnums,
  parseEmployeeForm,
} from "$lib/server/employee-profile/employee-form"

export const load: PageServerLoad = async ({ locals, params }) => {
  if (!locals.tenantId) error(403, "No tenant")

  const result = await withTenant(locals.tenantId, async (tx) => {
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

export const actions: Actions = {
  default: async ({ request, locals, params }) => {
    if (!locals.tenantId) error(403, "No tenant")
    requireCan(contextFrom(locals), "employee.write")
    const tenantId = locals.tenantId

    const data = await request.formData()
    const parsed = parseEmployeeForm(data)
    if (!parsed.ok) {
      return fail(400, {
        errorFields: parsed.errorFields,
        message: parsed.message,
      })
    }

    const cycle = await withTenant(tenantId, async (tx) => {
      if (
        await employees.wouldReportToSelf(
          tx,
          params.id,
          parsed.input.manager_id,
        )
      ) {
        return true
      }
      await employees.update(tx, params.id, parsed.input)
      return false
    })

    if (cycle) {
      return fail(400, {
        errorFields: ["manager_id"],
        message: "That manager reports to this person, directly or indirectly.",
      })
    }

    redirect(303, `/employees/${params.id}`)
  },
}
