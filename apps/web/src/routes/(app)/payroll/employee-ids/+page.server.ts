import { error, fail } from "@sveltejs/kit"
import type { Actions, PageServerLoad } from "./$types"
import { withTenant, actorFrom } from "$lib/server/db/tenant"
import { contextFrom, requireCan } from "$lib/server/auth/can"
import * as audit from "$lib/server/audit/audit.repo"
import { FormReader } from "$lib/server/forms"
import { constraintFailure } from "$lib/server/db/constraints"
import * as exp from "$lib/server/payroll/payroll_export.repo"
import {
  EMPLOYEE_ID_HINT,
  PROVIDER_LABELS,
  validEmployeeId,
} from "$lib/payroll/export-formats"

import { pageParam } from "$lib/server/db/paged"
const PAGE_SIZE = 50

export const load: PageServerLoad = async ({ locals, url }) => {
  if (!locals.tenantId) error(403, "No tenant")
  requireCan(contextFrom(locals), "payroll.run")

  const params = new FormData()
  params.append("q", url.searchParams.get("q") ?? "")
  const search = new FormReader(params).text("q", { max: 100 }) ?? ""
  const missingOnly = url.searchParams.get("missing") === "1"
  const page = pageParam(url)

  return withTenant(actorFrom(locals), async (tx) => {
    const settings = await exp.settings(tx)
    if (!settings)
      return {
        settings,
        list: null,
        search,
        missingOnly,
        page,
        pageSize: PAGE_SIZE,
      }
    return {
      settings,
      list: await exp.employeeIdsPage(tx, settings.provider, {
        search,
        missingOnly,
        limit: PAGE_SIZE,
        offset: (page - 1) * PAGE_SIZE,
      }),
      search,
      missingOnly,
      page,
      pageSize: PAGE_SIZE,
    }
  })
}

export const actions: Actions = {
  save: async ({ request, locals }) => {
    if (!locals.tenantId) error(403, "No tenant")
    requireCan(contextFrom(locals), "payroll.run")
    const ctx = contextFrom(locals)!

    const f = new FormReader(await request.formData())
    const employeeId = f.uuid("employee_id", { required: true })
    const externalId = f.text("external_id", { max: 20 })
    if (!f.ok)
      return fail(400, {
        ...f.problem(
          f.errorFields.includes("external_id")
            ? "That payroll id is too long: no provider uses more than 20 characters."
            : undefined,
        ),
        // Every row is its own form: name the row the mark belongs on.
        employeeId,
      })

    try {
      return await withTenant(actorFrom(locals), async (tx) => {
        const settings = await exp.settings(tx)
        if (!settings)
          return fail(400, {
            message:
              "Choose a payroll provider in Payroll export settings first.",
          })
        if (
          externalId !== null &&
          !validEmployeeId(settings.provider, externalId)
        )
          return fail(400, {
            message: `That ${PROVIDER_LABELS[settings.provider]} id is not in the form the provider uses. ${EMPLOYEE_ID_HINT[settings.provider]}`,
            errorFields: ["external_id"],
            employeeId,
          })
        let result: Awaited<ReturnType<typeof exp.setEmployeeId>>
        try {
          result = await exp.setEmployeeId(
            tx,
            settings.provider,
            employeeId,
            externalId,
            ctx.userId,
          )
        } catch (e) {
          if (e instanceof exp.EmployeeIdRefused)
            return fail(400, {
              message: "That employee no longer exists. Reload the page.",
            })
          throw e
        }
        if (result.before === externalId) return { saved: true, employeeId }
        // Same transaction: a wrong id sends one person's hours to another.
        await audit.record(tx, ctx, {
          action: "update",
          entityType: "payroll_employee_ids",
          entityId: employeeId,
          module: "payroll",
          changes: {
            [`external_id:${settings.provider}`]: {
              from: result.before,
              to: externalId,
            },
          },
        })
        return { saved: true, employeeId }
      })
    } catch (e) {
      const refused = constraintFailure(e)
      if (refused) return fail(400, { ...refused.data, employeeId })
      throw e
    }
  },
}
