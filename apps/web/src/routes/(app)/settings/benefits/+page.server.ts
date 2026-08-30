import { error, fail } from "@sveltejs/kit"
import type { Actions, PageServerLoad } from "./$types"
import * as packages from "$lib/server/firm-profile/firm_benefits_packages.repo"
import * as items from "$lib/server/firm-profile/firm_benefit_items.repo"
import type { CostsByCurrency } from "$lib/server/firm-profile/firm_benefit_items.repo"
import * as locationsRepo from "$lib/server/firm-profile/firm_locations.repo"
import { withTenant } from "$lib/server/db/tenant"
import { contextFrom, requireCan } from "$lib/server/auth/can"
import { FormReader, formList } from "$lib/server/forms"

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

/**
 * Costs arrive as `cost.<CUR>.employee` / `.employer`. A currency with both
 * blank is omitted rather than stored as zeros — "not offered in that market"
 * and "free in that market" are different statements.
 */
/**
 * Benefit costs, as strings (CLAUDE.md § Money). A blank side reads as zero —
 * "the employer pays none of it" is a real answer here, unlike a blank salary
 * band — but anything unparseable is refused rather than silently becoming 0.
 */
function readCosts(data: FormData, f: FormReader): CostsByCurrency {
  const costs: CostsByCurrency = {}

  for (const cur of new Set(
    [...data.keys()]
      .filter((k) => k.startsWith("cost."))
      .map((k) => k.split(".")[1]),
  )) {
    const opts = { scale: 2, min: 0 }
    const employee = f.decimal(`cost.${cur}.employee`, opts)
    const employer = f.decimal(`cost.${cur}.employer`, opts)
    if (employee === null && employer === null) continue
    costs[cur] = { employee: employee ?? "0", employer: employer ?? "0" }
  }
  return costs
}

export const actions: Actions = {
  savePackage: async ({ request, locals }) => {
    if (!locals.tenantId) error(403, "No tenant")
    requireCan(contextFrom(locals), "firm.settings.write")
    const tenantId = locals.tenantId

    const data = await request.formData()
    const f = new FormReader(data)

    const id = f.uuid("id")
    const input = {
      name: f.text("name", { required: true, max: 255 }),
      name_i18n: f.i18n("name_i18n", formList(data, "supported_locales"), 255),
      description: f.text("description", { max: 5000 }),
    }

    if (!f.ok) {
      return fail(
        400,
        f.problem(
          f.errorFields.includes("name")
            ? "A package needs a name."
            : "Some fields need attention.",
        ),
      )
    }

    await withTenant(tenantId, async (tx) => {
      if (id) await packages.update(tx, id, input)
      else await packages.create(tx, tenantId, input)
    })
    return { saved: true }
  },

  archivePackage: async ({ request, locals }) => {
    if (!locals.tenantId) error(403, "No tenant")
    requireCan(contextFrom(locals), "firm.settings.write")
    const f = new FormReader(await request.formData())
    const id = f.uuid("id", { required: true })
    if (!f.ok) return fail(400, f.problem("Missing package."))
    await withTenant(locals.tenantId, (tx) => packages.archive(tx, id))
    return { archived: true }
  },

  saveItem: async ({ request, locals }) => {
    if (!locals.tenantId) error(403, "No tenant")
    requireCan(contextFrom(locals), "firm.settings.write")
    const tenantId = locals.tenantId

    const data = await request.formData()
    const f = new FormReader(data)

    const id = f.uuid("id")
    const input = {
      benefits_package_id: f.uuid("benefits_package_id", { required: true }),
      benefit_type:
        f.choice("benefit_type", BENEFIT_TYPES, { required: true }) ?? "",
      benefit_name: f.text("benefit_name", { required: true, max: 255 }),
      benefit_name_i18n: null,
      carrier_name: f.text("carrier_name", { max: 255 }),
      carrier_varies_by_location: f.bool("carrier_varies_by_location"),
      costs_by_currency: readCosts(data, f),
    }

    const negative = items.invalidCosts(input.costs_by_currency)
    for (const c of negative) f.reject(`cost.${c}.employee`)

    if (!f.ok) {
      return fail(
        400,
        f.problem(
          negative.length
            ? `Check the ${negative.join(", ")} cost — amounts cannot be negative.`
            : "Some fields need attention.",
        ),
      )
    }

    await withTenant(tenantId, async (tx) => {
      if (id) await items.update(tx, id, input)
      else await items.create(tx, tenantId, input)
    })
    return { saved: true }
  },

  archiveItem: async ({ request, locals }) => {
    if (!locals.tenantId) error(403, "No tenant")
    requireCan(contextFrom(locals), "firm.settings.write")
    const f = new FormReader(await request.formData())
    const id = f.uuid("id", { required: true })
    if (!f.ok) return fail(400, f.problem("Missing benefit."))
    await withTenant(locals.tenantId, (tx) => items.archive(tx, id))
    return { archived: true }
  },
}
