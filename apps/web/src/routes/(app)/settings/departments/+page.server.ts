import { error, fail } from "@sveltejs/kit"
import type { Actions, PageServerLoad } from "./$types"
import * as departments from "$lib/server/firm-profile/firm_departments.repo"
import * as locations from "$lib/server/firm-profile/firm_locations.repo"
import { withTenant } from "$lib/server/db/tenant"
import { formString } from "$lib/server/forms"

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

const nullIfBlank = (value: string) => {
  const trimmed = value.trim()
  return trimmed === "" ? null : trimmed
}

/** Shared by create and update; the field rules are identical. */
async function readForm(
  tx: Parameters<typeof departments.wouldCycle>[0],
  data: FormData,
  supportedLocales: string[],
) {
  const errorFields: string[] = []

  const name = formString(data, "name").trim()
  if (name === "") errorFields.push("name")

  // Uppercased because the column is UNIQUE (tenant_id, department_code) and
  // "eng" and "ENG" would otherwise be two departments that read as one.
  const code = formString(data, "department_code").trim().toUpperCase()
  if (!/^[A-Z0-9-]{2,50}$/.test(code)) errorFields.push("department_code")

  const parent = nullIfBlank(formString(data, "parent_department_code"))
  if (parent && (await departments.wouldCycle(tx, code, parent))) {
    errorFields.push("parent_department_code")
  }

  const nameI18n: Record<string, string> = {}
  for (const locale of supportedLocales) {
    const value = formString(data, `name_i18n.${locale}`).trim()
    if (value !== "") nameI18n[locale] = value
  }

  return {
    errorFields,
    input: {
      name,
      name_i18n: Object.keys(nameI18n).length ? nameI18n : null,
      description: nullIfBlank(formString(data, "description")),
      department_code: code,
      parent_department_code: parent,
      location_code: nullIfBlank(formString(data, "location_code")),
      cost_center: nullIfBlank(formString(data, "cost_center")),
      budget_currency: nullIfBlank(formString(data, "budget_currency")),
    },
  }
}

export const actions: Actions = {
  save: async ({ request, locals }) => {
    if (!locals.tenantId) error(403, "No tenant")
    const tenantId = locals.tenantId

    const data = await request.formData()
    const id = formString(data, "id")
    const supportedLocales = data
      .getAll("supported_locales")
      .filter((v): v is string => typeof v === "string")

    return withTenant(tenantId, async (tx) => {
      const { errorFields, input } = await readForm(tx, data, supportedLocales)

      if (errorFields.length > 0) {
        return fail(400, {
          errorFields,
          editing: id || "new",
          message:
            errorFields.includes("parent_department_code") &&
            errorFields.length === 1
              ? "That parent would make the department its own ancestor."
              : "Some fields need attention.",
        })
      }

      if (id) await departments.update(tx, id, input)
      else await departments.create(tx, tenantId, input)

      return { saved: true }
    })
  },

  archive: async ({ request, locals }) => {
    if (!locals.tenantId) error(403, "No tenant")
    const data = await request.formData()
    const id = formString(data, "id")
    if (!id) return fail(400, { message: "Missing department." })

    await withTenant(locals.tenantId, (tx) => departments.archive(tx, id))
    return { archived: true }
  },
}
