import { error, fail } from "@sveltejs/kit"
import type { Actions, PageServerLoad } from "./$types"
import * as departments from "$lib/server/firm-profile/firm_departments.repo"
import * as locations from "$lib/server/firm-profile/firm_locations.repo"
import { withTenant, actorFrom } from "$lib/server/db/tenant"
import { contextFrom, requireCan } from "$lib/server/auth/can"
import { FormReader, formList } from "$lib/server/forms"
import { constraintFailure } from "$lib/server/db/constraints"

/**
 * /settings/departments — module-firm-profile.md § Departments Page.
 *
 * One transaction, two queries: the departments and the locations they can be
 * assigned to. Both are needed to render the page at all, so splitting them
 * across loads would be a waterfall (doc 03).
 */
export const load: PageServerLoad = async ({ locals }) => {
  if (!locals.tenantId) error(403, "No tenant")

  return withTenant(actorFrom(locals), async (tx) => ({
    departments: await departments.list(tx),
    locations: await locations.list(tx),
  }))
}

const CODE = /^[A-Z0-9-]{2,50}$/

/** Shared by create and update; the field rules are identical. */
async function readForm(
  tx: Parameters<typeof departments.wouldCycle>[0],
  f: FormReader,
  supportedLocales: string[],
) {
  const name = f.text("name", { required: true, max: 255 })

  // Uppercased because the column is UNIQUE (tenant_id, department_code) and
  // "eng" and "ENG" would otherwise be two departments that read as one.
  const code = f.text("department_code", {
    required: true,
    max: 50,
    upper: true,
    pattern: CODE,
  })

  const parent = f.text("parent_department_code", { max: 50, upper: true })
  if (parent && (await departments.wouldCycle(tx, code, parent))) {
    f.reject("parent_department_code")
  }

  return {
    name,
    name_i18n: f.i18n("name_i18n", supportedLocales, 255),
    description: f.text("description", { max: 5000 }),
    department_code: code,
    parent_department_code: parent,
    location_code: f.text("location_code", { max: 100 }),
    cost_center: f.text("cost_center", { max: 50 }),
    budget_currency: f.currency("budget_currency"),
  }
}

export const actions: Actions = {
  save: async ({ request, locals }) => {
    if (!locals.tenantId) error(403, "No tenant")
    requireCan(contextFrom(locals), "firm.settings.write")
    const tenantId = locals.tenantId

    const data = await request.formData()
    const f = new FormReader(data)
    const id = f.uuid("id")
    const supportedLocales = formList(data, "supported_locales")

    try {
      return await withTenant(actorFrom(locals), async (tx) => {
        const input = await readForm(tx, f, supportedLocales)

        if (!f.ok) {
          return fail(400, {
            ...f.problem(
              f.errorFields.includes("parent_department_code") &&
                f.errorFields.length === 1
                ? "That parent would make the department its own ancestor."
                : "Some fields need attention.",
            ),
            editing: id || "new",
          })
        }

        if (id) await departments.update(tx, id, input)
        else await departments.create(tx, tenantId, input)

        return { saved: true }
      })
    } catch (e) {
      // A duplicate department code, or a parent that was archived while the
      // form sat open. Both were an "Internal Error" page before.
      const refused = constraintFailure(e)
      if (refused) return refused
      throw e
    }
  },

  archive: async ({ request, locals }) => {
    if (!locals.tenantId) error(403, "No tenant")
    requireCan(contextFrom(locals), "firm.settings.write")
    const f = new FormReader(await request.formData())
    const id = f.uuid("id", { required: true })
    if (!f.ok) return fail(400, f.problem("Missing department."))

    const archived = await withTenant(actorFrom(locals), (tx) =>
      departments.archive(tx, id),
    )
    if (!archived) {
      return fail(400, {
        message: "That department no longer exists. Reload the page.",
      })
    }
    return { archived: true }
  },
}
