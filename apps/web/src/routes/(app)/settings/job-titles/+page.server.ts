import { error, fail } from "@sveltejs/kit"
import type { Actions, PageServerLoad } from "./$types"
import * as titles from "$lib/server/firm-profile/firm_job_titles.repo"
import * as levels from "$lib/server/firm-profile/firm_job_levels.repo"
import * as locationsRepo from "$lib/server/firm-profile/firm_locations.repo"
import type { SalaryRanges } from "$lib/server/firm-profile/firm_job_levels.repo"
import * as audit from "$lib/server/audit/audit.repo"
import { withTenant, actorFrom } from "$lib/server/db/tenant"
import { contextFrom, requireCan } from "$lib/server/auth/can"
import { FormReader, formList } from "$lib/server/forms"
import { constraintFailure } from "$lib/server/db/constraints"
import { allEnumerations } from "@kaaj/enums"

/** /settings/job-titles — module-firm-profile.md § Job Titles Page. */
export const load: PageServerLoad = async ({ locals }) => {
  if (!locals.tenantId) error(403, "No tenant")

  const { jobTitles, jobLevels, locations } = await withTenant(
    actorFrom(locals),
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

/** salary_ranges is the published band; the rest identifies the level. */
const LEVEL_FIELDS = ["level_name", "level_order", "salary_ranges", "is_active"]

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

    try {
      await withTenant(actorFrom(locals), async (tx) => {
        if (id) await titles.update(tx, id, input)
        else await titles.create(tx, tenantId, input)
      })
    } catch (e) {
      const refused = constraintFailure(e)
      if (refused) return refused
      throw e
    }
    return { saved: true }
  },

  archiveTitle: async ({ request, locals }) => {
    if (!locals.tenantId) error(403, "No tenant")
    requireCan(contextFrom(locals), "firm.settings.write")
    const f = new FormReader(await request.formData())
    const id = f.uuid("id", { required: true })
    if (!f.ok) return fail(400, f.problem("Missing job title."))
    const archived = await withTenant(actorFrom(locals), (tx) =>
      titles.archive(tx, id),
    )
    if (!archived) {
      return fail(400, {
        message: "That job title no longer exists. Reload the page.",
      })
    }
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

    try {
      await withTenant(actorFrom(locals), async (tx) => {
        // Read what it was BEFORE writing, so the entry says what changed.
        const before = id
          ? ((await levels.listByTitle(tx)).find((r) => r.id === id) ?? null)
          : null

        if (id) await levels.update(tx, id, input)
        else await levels.create(tx, tenantId, input)

        // SAME TRANSACTION. Levels carry salary_ranges — the PUBLISHED pay bands, which are a disclosure under the EU Pay Transparency Directive.
        await audit.record(tx, contextFrom(locals)!, {
          action: id ? "update" : "create",
          entityType: "firm_job_levels",
          entityId: id ?? null,
          module: "firm-profile",
          changes: audit.diff(before, input, LEVEL_FIELDS),
        })
      })
    } catch (e) {
      // The job title this level hangs off was archived while the form was
      // open — a stale tab, not an exotic case.
      const refused = constraintFailure(e)
      if (refused) return refused
      throw e
    }
    return { saved: true }
  },

  archiveLevel: async ({ request, locals }) => {
    if (!locals.tenantId) error(403, "No tenant")
    requireCan(contextFrom(locals), "firm.settings.write")
    const f = new FormReader(await request.formData())
    const id = f.uuid("id", { required: true })
    if (!f.ok) return fail(400, f.problem("Missing level."))
    const archived = await withTenant(actorFrom(locals), async (tx) => {
      // Nothing matched: no audit entry, and no claim that it was archived.
      if (!(await levels.archive(tx, id))) return false
      await audit.record(tx, contextFrom(locals)!, {
        action: "archive",
        entityType: "firm_job_levels",
        entityId: id,
        module: "firm-profile",
        changes: { is_active: { from: "true", to: "false" } },
      })
      return true
    })
    if (!archived) {
      return fail(400, {
        message: "That level no longer exists. Reload the page.",
      })
    }
    return { archived: true }
  },
}
