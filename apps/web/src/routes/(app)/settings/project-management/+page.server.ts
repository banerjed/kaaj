import { error, fail } from "@sveltejs/kit"
import type { Actions, PageServerLoad } from "./$types"
import * as customFields from "$lib/server/custom-fields/custom-fields.repo"
import {
  CUSTOM_FIELD_DATA_TYPES,
  CUSTOM_FIELD_ENTITY_TYPES,
  LABEL_COLORS,
  type CustomFieldOption,
} from "$lib/server/custom-fields/custom-fields.repo"
import { withTenant, actorFrom } from "$lib/server/db/tenant"
import { contextFrom, requireCan } from "$lib/server/auth/can"
import { FormReader } from "$lib/server/forms"
import { constraintFailure } from "$lib/server/db/constraints"

/** /settings/project-management — field definitions for projects and tasks (docs/26-project-management-custom-fields.md). Flat, not nested like settings/ticketing/[businessAreaId]: there is no sub-resource here the way a business area is one, just two entity types. */
export const load: PageServerLoad = async ({ locals }) => {
  if (!locals.tenantId) error(403, "No tenant")
  requireCan(contextFrom(locals), "firm.settings.read")

  return withTenant(actorFrom(locals), async (tx) => ({
    projectFields: await customFields.definitionsFor(tx, "project"),
    taskFields: await customFields.definitionsFor(tx, "task"),
  }))
}

/**
 * One option per line: `Label` or `Label|tone`. An unspecified tone
 * round-robins from LABEL_COLORS in the order options are entered — v1 has
 * no per-option colour picker UI; the schema already supports one (see
 * docs/26's "Settled" section) if that's asked for later.
 */
function parseOptions(raw: string): CustomFieldOption[] {
  return raw
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line, i) => {
      const [labelPart, tonePart] = line.split("|").map((s) => s.trim())
      const tone = LABEL_COLORS.includes(
        tonePart as (typeof LABEL_COLORS)[number],
      )
        ? (tonePart as (typeof LABEL_COLORS)[number])
        : LABEL_COLORS[i % LABEL_COLORS.length]
      return {
        value: labelPart.toLowerCase().replace(/[^a-z0-9]+/g, "_"),
        label: labelPart,
        tone,
      }
    })
}

export const actions: Actions = {
  addField: async ({ request, locals }) => {
    if (!locals.tenantId) error(403, "No tenant")
    requireCan(contextFrom(locals), "firm.settings.write")
    const tenantId = locals.tenantId

    const data = await request.formData()
    const f = new FormReader(data)
    const entityType = f.choice("entity_type", CUSTOM_FIELD_ENTITY_TYPES, {
      required: true,
    })
    const label = f.text("label", { required: true, max: 200 })
    const helpText = f.text("help_text", { max: 500 })
    const dataType = f.choice("data_type", CUSTOM_FIELD_DATA_TYPES, {
      required: true,
    })
    const isRequired = data.get("is_required") === "on"
    if (!f.ok) return fail(400, f.problem("Name the field and choose a type."))

    const needsOptions = dataType === "select" || dataType === "multiselect"
    const options = needsOptions
      ? parseOptions(String(data.get("options") ?? ""))
      : null
    if (needsOptions && (!options || options.length === 0)) {
      return fail(400, {
        errorFields: ["options"],
        message: "A select or multiselect field needs at least one option.",
      })
    }

    try {
      await withTenant(actorFrom(locals), (tx) =>
        customFields.createDefinition(tx, tenantId, {
          entityType: entityType!,
          label: label!,
          helpText,
          dataType: dataType!,
          options,
          isRequired,
        }),
      )
      return { fieldAdded: true }
    } catch (e) {
      const refused = constraintFailure(e)
      if (refused) return refused
      throw e
    }
  },

  archiveField: async ({ request, locals }) => {
    if (!locals.tenantId) error(403, "No tenant")
    requireCan(contextFrom(locals), "firm.settings.write")
    const f = new FormReader(await request.formData())
    const id = f.uuid("id", { required: true })
    if (!f.ok) return fail(400, f.problem("Missing field."))

    await withTenant(actorFrom(locals), (tx) =>
      customFields.archiveDefinition(tx, id!),
    )
    return { fieldArchived: true }
  },
}
