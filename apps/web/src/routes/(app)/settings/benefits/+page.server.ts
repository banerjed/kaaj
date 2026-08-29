import { error, fail } from "@sveltejs/kit"
import type { Actions, PageServerLoad } from "./$types"
import * as packages from "$lib/server/firm-profile/firm_benefits_packages.repo"
import * as items from "$lib/server/firm-profile/firm_benefit_items.repo"
import type { CostsByCurrency } from "$lib/server/firm-profile/firm_benefit_items.repo"
import * as locationsRepo from "$lib/server/firm-profile/firm_locations.repo"
import { withTenant } from "$lib/server/db/tenant"
import { formString } from "$lib/server/forms"

/** The benefit kinds the product understands. */
const BENEFIT_TYPES = [
  "health",
  "dental",
  "vision",
  "life",
  "disability",
  "retirement",
  "wellness",
  "commuter",
  "other",
] as const

/** /settings/benefits — module-firm-profile.md § FR-FP-006. */
export const load: PageServerLoad = async ({ locals }) => {
  if (!locals.tenantId) error(403, "No tenant")

  return withTenant(locals.tenantId, async (tx) => ({
    packages: await packages.list(tx),
    items: await items.list(tx),
    locations: await locationsRepo.list(tx),
    benefitTypes: BENEFIT_TYPES,
  }))
}

const nullIfBlank = (v: string) => (v.trim() === "" ? null : v.trim())

/**
 * Costs arrive as `cost.<CUR>.employee` / `.employer`. A currency with both
 * blank is omitted rather than stored as zeros — "not offered in that market"
 * and "free in that market" are different statements.
 */
function readCosts(data: FormData): {
  costs: CostsByCurrency
  malformed: string[]
} {
  const costs: CostsByCurrency = {}
  const malformed: string[] = []

  for (const cur of new Set(
    [...data.keys()]
      .filter((k) => k.startsWith("cost."))
      .map((k) => k.split(".")[1]),
  )) {
    const rawEmployee = formString(data, `cost.${cur}.employee`).trim()
    const rawEmployer = formString(data, `cost.${cur}.employer`).trim()
    if (rawEmployee === "" && rawEmployer === "") continue

    const employee = Number(rawEmployee || 0)
    const employer = Number(rawEmployer || 0)
    if (!Number.isFinite(employee) || !Number.isFinite(employer)) {
      malformed.push(cur)
      continue
    }
    costs[cur] = { employee, employer }
  }
  return { costs, malformed }
}

export const actions: Actions = {
  savePackage: async ({ request, locals }) => {
    if (!locals.tenantId) error(403, "No tenant")
    const tenantId = locals.tenantId
    const data = await request.formData()

    const id = formString(data, "id")
    const name = formString(data, "name").trim()
    if (name === "") {
      return fail(400, {
        errorFields: ["name"],
        message: "A package needs a name.",
      })
    }

    const supported = data
      .getAll("supported_locales")
      .filter((v): v is string => typeof v === "string")
    const nameI18n: Record<string, string> = {}
    for (const l of supported) {
      const v = formString(data, `name_i18n.${l}`).trim()
      if (v !== "") nameI18n[l] = v
    }

    const input = {
      name,
      name_i18n: Object.keys(nameI18n).length ? nameI18n : null,
      description: nullIfBlank(formString(data, "description")),
    }

    await withTenant(tenantId, async (tx) => {
      if (id) await packages.update(tx, id, input)
      else await packages.create(tx, tenantId, input)
    })
    return { saved: true }
  },

  archivePackage: async ({ request, locals }) => {
    if (!locals.tenantId) error(403, "No tenant")
    const id = formString(await request.formData(), "id")
    if (!id) return fail(400, { message: "Missing package." })
    await withTenant(locals.tenantId, (tx) => packages.archive(tx, id))
    return { archived: true }
  },

  saveItem: async ({ request, locals }) => {
    if (!locals.tenantId) error(403, "No tenant")
    const tenantId = locals.tenantId
    const data = await request.formData()

    const id = formString(data, "id")
    const packageId = formString(data, "benefits_package_id")
    const benefitName = formString(data, "benefit_name").trim()
    const benefitType = formString(data, "benefit_type")

    const errorFields: string[] = []
    if (benefitName === "") errorFields.push("benefit_name")
    if (!packageId) errorFields.push("benefits_package_id")
    if (!BENEFIT_TYPES.includes(benefitType as (typeof BENEFIT_TYPES)[number]))
      errorFields.push("benefit_type")

    const { costs, malformed } = readCosts(data)
    const bad = [...malformed, ...items.invalidCosts(costs)]
    for (const c of bad) errorFields.push(`cost.${c}`)

    if (errorFields.length) {
      return fail(400, {
        errorFields,
        message: bad.length
          ? `Check the ${bad.join(", ")} cost — amounts cannot be negative.`
          : "Some fields need attention.",
      })
    }

    const input = {
      benefits_package_id: packageId,
      benefit_type: benefitType,
      benefit_name: benefitName,
      benefit_name_i18n: null,
      carrier_name: nullIfBlank(formString(data, "carrier_name")),
      carrier_varies_by_location:
        formString(data, "carrier_varies_by_location") === "on",
      costs_by_currency: costs,
    }

    await withTenant(tenantId, async (tx) => {
      if (id) await items.update(tx, id, input)
      else await items.create(tx, tenantId, input)
    })
    return { saved: true }
  },

  removeItem: async ({ request, locals }) => {
    if (!locals.tenantId) error(403, "No tenant")
    const id = formString(await request.formData(), "id")
    if (!id) return fail(400, { message: "Missing benefit." })
    await withTenant(locals.tenantId, (tx) => items.remove(tx, id))
    return { removed: true }
  },
}
