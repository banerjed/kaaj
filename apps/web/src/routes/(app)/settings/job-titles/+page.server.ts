import { error, fail } from "@sveltejs/kit"
import type { Actions, PageServerLoad } from "./$types"
import * as titles from "$lib/server/firm-profile/firm_job_titles.repo"
import * as levels from "$lib/server/firm-profile/firm_job_levels.repo"
import * as locationsRepo from "$lib/server/firm-profile/firm_locations.repo"
import type { SalaryRanges } from "$lib/server/firm-profile/firm_job_levels.repo"
import { withTenant } from "$lib/server/db/tenant"
import { contextFrom, requireCan } from "$lib/server/auth/can"
import { FormReader, formList } from "$lib/server/forms"
import { allEnumerations } from "@kaaj/enums"

/** /settings/job-titles — module-firm-profile.md § Job Titles Page. */
export const load: PageServerLoad = async ({ locals }) => {
  if (!locals.tenantId) error(403, "No tenant")

  const { jobTitles, jobLevels, locations } = await withTenant(
    locals.tenantId,
    async (tx) => ({
      jobTitles: await titles.list(tx),
      jobLevels: await levels.listByTitle(tx),
      // For per-market number formatting; see localeForCurrency.
      locations: await locationsRepo.list(tx),
    }),
  )

  // EEOC categories come from the enum package, which is checked against the
  // Postgres type by ./check — a hand-typed list here would drift silently.
  const eeoc = allEnumerations().get("eeoc_category") ?? []

  return { jobTitles, jobLevels, locations, eeocCategories: eeoc }
}

/**
 * Salary bands arrive as `range.<CUR>.min` / `.max` pairs. A currency with both
 * fields blank is omitted rather than stored as zeros — "no band for this
 * market" and "a band of nothing" are different statements.
 */
/**
 * Salary bands, as strings. `Number("")` is 0, so the old reader turned a band
 * with a blank maximum into "max 0" rather than refusing it, and every value
 * went through a float64 on the way to a numeric column (CLAUDE.md § Money).
 */
function readRanges(data: FormData, f: FormReader): SalaryRanges {
  const ranges: SalaryRanges = {}

  for (const key of new Set(
    [...data.keys()]
      .filter((k) => k.startsWith("range."))
      .map((k) => k.split(".")[1]),
  )) {
    const opts = { scale: 2, min: 0 }
    const min = f.decimal(`range.${key}.min`, opts)
    const max = f.decimal(`range.${key}.max`, opts)
    if (min === null && max === null) continue
    // Half a band is not a band. Naming the missing side puts the cursor there.
    if (min === null) f.reject(`range.${key}.min`)
    else if (max === null) f.reject(`range.${key}.max`)
    else ranges[key] = { min, max }
  }
  return ranges
}

export const actions: Actions = {
  saveTitle: async ({ request, locals }) => {
    if (!locals.tenantId) error(403, "No tenant")
    requireCan(contextFrom(locals), "firm.settings.write")
    const tenantId = locals.tenantId

    const data = await request.formData()
    const f = new FormReader(data)

    const id = f.uuid("id")
    const input = {
      title: f.text("title", { required: true, max: 255 }),
      title_i18n: f.i18n(
        "title_i18n",
        formList(data, "supported_locales"),
        255,
      ),
      description: f.text("description", { max: 5000 }),
      is_exempt: f.bool("is_exempt"),
      eeoc_category: f.enumValue("eeoc_category", "eeoc_category"),
    }

    if (!f.ok) return fail(400, f.problem())

    await withTenant(tenantId, async (tx) => {
      if (id) await titles.update(tx, id, input)
      else await titles.create(tx, tenantId, input)
    })
    return { saved: true }
  },

  archiveTitle: async ({ request, locals }) => {
    if (!locals.tenantId) error(403, "No tenant")
    requireCan(contextFrom(locals), "firm.settings.write")
    const f = new FormReader(await request.formData())
    const id = f.uuid("id", { required: true })
    if (!f.ok) return fail(400, f.problem("Missing job title."))
    await withTenant(locals.tenantId, (tx) => titles.archive(tx, id))
    return { archived: true }
  },

  saveLevel: async ({ request, locals }) => {
    if (!locals.tenantId) error(403, "No tenant")
    requireCan(contextFrom(locals), "firm.settings.write")
    const tenantId = locals.tenantId

    const data = await request.formData()
    const f = new FormReader(data)

    const id = f.uuid("id")
    const input = {
      job_title_id: f.uuid("job_title_id", { required: true }),
      level_name: f.text("level_name", { required: true, max: 100 }),
      level_name_i18n: null,
      salary_ranges: readRanges(data, f),
      // int4, so a crafted 99999999999 is an out-of-range 500 without a cap.
      sort_order: f.integer("sort_order", { min: 0, max: 32767 }) ?? 0,
    }

    const inverted = levels.invalidCurrencies(input.salary_ranges)
    for (const c of inverted) f.reject(`range.${c}.max`)

    if (!f.ok) {
      return fail(
        400,
        f.problem(
          inverted.length
            ? `Check the ${inverted.join(", ")} band — the maximum must be at least the minimum.`
            : "Some fields need attention.",
        ),
      )
    }

    await withTenant(tenantId, async (tx) => {
      if (id) await levels.update(tx, id, input)
      else await levels.create(tx, tenantId, input)
    })
    return { saved: true }
  },

  removeLevel: async ({ request, locals }) => {
    if (!locals.tenantId) error(403, "No tenant")
    requireCan(contextFrom(locals), "firm.settings.write")
    const f = new FormReader(await request.formData())
    const id = f.uuid("id", { required: true })
    if (!f.ok) return fail(400, f.problem("Missing level."))
    await withTenant(locals.tenantId, (tx) => levels.remove(tx, id))
    return { removed: true }
  },
}
