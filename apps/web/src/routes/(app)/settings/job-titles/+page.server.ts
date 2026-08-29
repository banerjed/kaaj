import { error, fail } from "@sveltejs/kit"
import type { Actions, PageServerLoad } from "./$types"
import * as titles from "$lib/server/firm-profile/firm_job_titles.repo"
import * as levels from "$lib/server/firm-profile/firm_job_levels.repo"
import * as locationsRepo from "$lib/server/firm-profile/firm_locations.repo"
import type { SalaryRanges } from "$lib/server/firm-profile/firm_job_levels.repo"
import { withTenant } from "$lib/server/db/tenant"
import { formString } from "$lib/server/forms"
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

const nullIfBlank = (v: string) => (v.trim() === "" ? null : v.trim())

/**
 * Salary bands arrive as `range.<CUR>.min` / `.max` pairs. A currency with both
 * fields blank is omitted rather than stored as zeros — "no band for this
 * market" and "a band of nothing" are different statements.
 */
function readRanges(data: FormData): {
  ranges: SalaryRanges
  malformed: string[]
} {
  const ranges: SalaryRanges = {}
  const malformed: string[] = []

  for (const key of new Set(
    [...data.keys()]
      .filter((k) => k.startsWith("range."))
      .map((k) => k.split(".")[1]),
  )) {
    const rawMin = formString(data, `range.${key}.min`).trim()
    const rawMax = formString(data, `range.${key}.max`).trim()
    if (rawMin === "" && rawMax === "") continue

    const min = Number(rawMin)
    const max = Number(rawMax)
    if (!Number.isFinite(min) || !Number.isFinite(max)) {
      malformed.push(key)
      continue
    }
    ranges[key] = { min, max }
  }
  return { ranges, malformed }
}

export const actions: Actions = {
  saveTitle: async ({ request, locals }) => {
    if (!locals.tenantId) error(403, "No tenant")
    const tenantId = locals.tenantId
    const data = await request.formData()

    const id = formString(data, "id")
    const title = formString(data, "title").trim()
    const errorFields: string[] = []
    if (title === "") errorFields.push("title")

    const supported = data
      .getAll("supported_locales")
      .filter((v): v is string => typeof v === "string")
    const titleI18n: Record<string, string> = {}
    for (const l of supported) {
      const v = formString(data, `title_i18n.${l}`).trim()
      if (v !== "") titleI18n[l] = v
    }

    if (errorFields.length) {
      return fail(400, { errorFields, message: "Some fields need attention." })
    }

    const input = {
      title,
      title_i18n: Object.keys(titleI18n).length ? titleI18n : null,
      description: nullIfBlank(formString(data, "description")),
      is_exempt: formString(data, "is_exempt") === "on",
      eeoc_category: nullIfBlank(formString(data, "eeoc_category")),
    }

    await withTenant(tenantId, async (tx) => {
      if (id) await titles.update(tx, id, input)
      else await titles.create(tx, tenantId, input)
    })
    return { saved: true }
  },

  archiveTitle: async ({ request, locals }) => {
    if (!locals.tenantId) error(403, "No tenant")
    const id = formString(await request.formData(), "id")
    if (!id) return fail(400, { message: "Missing job title." })
    await withTenant(locals.tenantId, (tx) => titles.archive(tx, id))
    return { archived: true }
  },

  saveLevel: async ({ request, locals }) => {
    if (!locals.tenantId) error(403, "No tenant")
    const tenantId = locals.tenantId
    const data = await request.formData()

    const id = formString(data, "id")
    const jobTitleId = formString(data, "job_title_id")
    const levelName = formString(data, "level_name").trim()

    const errorFields: string[] = []
    if (levelName === "") errorFields.push("level_name")
    if (!jobTitleId) errorFields.push("job_title_id")

    const { ranges, malformed } = readRanges(data)
    const invalid = [...malformed, ...levels.invalidCurrencies(ranges)]
    for (const c of invalid) errorFields.push(`range.${c}`)

    if (errorFields.length) {
      return fail(400, {
        errorFields,
        message: invalid.length
          ? `Check the ${invalid.join(", ")} band — the maximum must be at least the minimum.`
          : "Some fields need attention.",
      })
    }

    const input = {
      job_title_id: jobTitleId,
      level_name: levelName,
      level_name_i18n: null,
      salary_ranges: ranges,
      sort_order: Number(formString(data, "sort_order")) || 0,
    }

    await withTenant(tenantId, async (tx) => {
      if (id) await levels.update(tx, id, input)
      else await levels.create(tx, tenantId, input)
    })
    return { saved: true }
  },

  removeLevel: async ({ request, locals }) => {
    if (!locals.tenantId) error(403, "No tenant")
    const id = formString(await request.formData(), "id")
    if (!id) return fail(400, { message: "Missing level." })
    await withTenant(locals.tenantId, (tx) => levels.remove(tx, id))
    return { removed: true }
  },
}
