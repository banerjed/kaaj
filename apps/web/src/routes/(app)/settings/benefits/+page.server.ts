import { error, fail } from "@sveltejs/kit"
import type { Actions, PageServerLoad } from "./$types"
import * as packages from "$lib/server/firm-profile/firm_benefits_packages.repo"
import * as items from "$lib/server/firm-profile/firm_benefit_items.repo"
import type { CostsByCurrency } from "$lib/server/firm-profile/firm_benefit_items.repo"
import * as locationsRepo from "$lib/server/firm-profile/firm_locations.repo"
import * as audit from "$lib/server/audit/audit.repo"
import { withTenant, actorFrom } from "$lib/server/db/tenant"
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

  return withTenant(actorFrom(locals), async (tx) => ({
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

/** Who is entitled, and what it costs them. */
const PACKAGE_FIELDS = ["name", "eligibility_rules", "is_active"]
/** The employer/employee split reaches payroll as a deduction. */
const ITEM_FIELDS = [
  "benefit_type",
  "benefit_name",
  "carrier_name",
  "costs_by_currency",
  "is_active",
]

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

    await withTenant(actorFrom(locals), async (tx) => {
      // Read what it was BEFORE writing, so the entry says what changed.
      const before = id
        ? ((await packages.list(tx)).find((r) => r.id === id) ?? null)
        : null

      if (id) await packages.update(tx, id, input)
      else await packages.create(tx, tenantId, input)

      // SAME TRANSACTION. Eligibility rules decide who is entitled to what.
      await audit.record(tx, contextFrom(locals)!, {
        action: id ? "update" : "create",
        entityType: "firm_benefits_packages",
        entityId: id ?? null,
        module: "firm-profile",
        changes: audit.diff(before, input, PACKAGE_FIELDS),
      })
    })
    return { saved: true }
  },

  archivePackage: async ({ request, locals }) => {
    if (!locals.tenantId) error(403, "No tenant")
    requireCan(contextFrom(locals), "firm.settings.write")
    const f = new FormReader(await request.formData())
    const id = f.uuid("id", { required: true })
    if (!f.ok) return fail(400, f.problem("Missing package."))
    await withTenant(actorFrom(locals), async (tx) => {
      await packages.archive(tx, id)
      await audit.record(tx, contextFrom(locals)!, {
        action: "archive",
        entityType: "firm_benefits_packages",
        entityId: id,
        module: "firm-profile",
        changes: { is_active: { from: "true", to: "false" } },
      })
    })
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

    await withTenant(actorFrom(locals), async (tx) => {
      // Read what it was BEFORE writing, so the entry says what changed.
      const before = id
        ? ((await items.list(tx)).find((r) => r.id === id) ?? null)
        : null

      if (id) await items.update(tx, id, input)
      else await items.create(tx, tenantId, input)

      // SAME TRANSACTION. costs_by_currency is the employer/employee split, which reaches payroll as a deduction.
      await audit.record(tx, contextFrom(locals)!, {
        action: id ? "update" : "create",
        entityType: "firm_benefit_items",
        entityId: id ?? null,
        module: "firm-profile",
        changes: audit.diff(before, input, ITEM_FIELDS),
      })
    })
    return { saved: true }
  },

  archiveItem: async ({ request, locals }) => {
    if (!locals.tenantId) error(403, "No tenant")
    requireCan(contextFrom(locals), "firm.settings.write")
    const f = new FormReader(await request.formData())
    const id = f.uuid("id", { required: true })
    if (!f.ok) return fail(400, f.problem("Missing benefit."))
    await withTenant(actorFrom(locals), async (tx) => {
      await items.archive(tx, id)
      await audit.record(tx, contextFrom(locals)!, {
        action: "archive",
        entityType: "firm_benefit_items",
        entityId: id,
        module: "firm-profile",
        changes: { is_active: { from: "true", to: "false" } },
      })
    })
    return { archived: true }
  },
}
