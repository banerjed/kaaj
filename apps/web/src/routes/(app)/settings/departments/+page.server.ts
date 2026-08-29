import { error, fail } from "@sveltejs/kit"
import type { Actions, PageServerLoad } from "./$types"
import * as departments from "$lib/server/firm-profile/firm_departments.repo"
import * as locations from "$lib/server/firm-profile/firm_locations.repo"
import { withTenant } from "$lib/server/db/tenant"
import { FormReader, formList } from "$lib/server/forms"

/**
 * /settings/departments — module-firm-profile.md § Departments Page.
 *
 * One transaction, two queries: the departments and the locations they can be
 * assigned to. Both are needed to render the page at all, so splitting them
 * across loads would be a waterfall (doc 03).
 */
export const load: PageServerLoad = async ({ locals }) => {
  if (!locals.tenantId) error(403, "No tenant")

  return withTenant(locals.tenantId, async (tx) => ({
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
    const tenantId = locals.tenantId

    const data = await request.formData()
    const f = new FormReader(data)
    const id = f.uuid("id")
    const supportedLocales = formList(data, "supported_locales")

    return withTenant(tenantId, async (tx) => {
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
  },

  archive: async ({ request, locals }) => {
    if (!locals.tenantId) error(403, "No tenant")
    const f = new FormReader(await request.formData())
    const id = f.uuid("id", { required: true })
    if (!f.ok) return fail(400, f.problem("Missing department."))

    await withTenant(locals.tenantId, (tx) => departments.archive(tx, id))
    return { archived: true }
  },
}
