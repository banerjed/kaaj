import { error, fail, type RequestEvent } from "@sveltejs/kit"
import { constraintFailure } from "../db/constraints"
import { actorFrom, withTenant } from "../db/tenant"
import { FormReader } from "../forms"
import { DEFAULT_CATEGORY } from "$lib/custom-fields"
import {
  CUSTOM_FIELD_DATA_TYPES,
  LABEL_COLORS,
  archiveDefinition,
  createDefinition,
  moveDefinition,
  renameCategory,
  type CustomFieldOption,
  type FieldScope,
} from "./custom-fields.repo"

/**
 * One option per line: `Label` or `Label|tone`. An unspecified tone
 * round-robins through LABEL_COLORS in the order options are entered.
 */
export function parseOptions(raw: string): CustomFieldOption[] {
  return raw
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line, i) => {
      const [labelPart, tonePart] = line.split("|").map((s) => s.trim())
      const tone = LABEL_COLORS.includes(tonePart as never)
        ? (tonePart as CustomFieldOption["tone"])
        : LABEL_COLORS[i % LABEL_COLORS.length]
      return {
        value: labelPart.toLowerCase().replace(/[^a-z0-9]+/g, "_"),
        label: labelPart,
        tone,
      }
    })
}

/**
 * The field-definition handlers every settings page calls. `scopeFor` says
 * which fields the page manages — a fixed entity type, one chosen by a form
 * field, or a ticket business area from the URL — and returns null for a
 * scope the page does not offer.
 *
 * These do NOT authorize. Each page declares its own actions, runs its own
 * `requireCan`, then calls the handler: `./check` finds actions and their
 * guards by reading each page's `actions` object, so actions spread in from
 * here would be invisible to it (L110).
 */
export function customFieldSettingsHandlers(
  scopeFor: (event: RequestEvent, f: FormReader) => FieldScope | null,
) {
  async function begin(event: RequestEvent) {
    if (!event.locals.tenantId) error(403, "No tenant")
    const data = await event.request.formData()
    const f = new FormReader(data)
    return { data, f, tenantId: event.locals.tenantId }
  }

  return {
    addField: async (event: RequestEvent) => {
      const { data, f, tenantId } = await begin(event)
      const scope = scopeFor(event, f)
      const label = f.text("label", { required: true, max: 200 })
      const category = f.text("category", { max: 100 })
      const helpText = f.text("help_text", { max: 500 })
      const dataType = f.choice("data_type", CUSTOM_FIELD_DATA_TYPES, {
        required: true,
      })
      const isRequired = f.bool("is_required")
      if (!f.ok || !scope) return fail(400, f.problem())

      const needsOptions = dataType === "select" || dataType === "multiselect"
      const options = needsOptions
        ? parseOptions(String(data.get("options") ?? ""))
        : null
      if (needsOptions && options!.length === 0) {
        return fail(400, {
          errorFields: ["options"],
          message: "A select or multi-select field needs at least one option.",
        })
      }

      try {
        await withTenant(actorFrom(event.locals), (tx) =>
          createDefinition(tx, tenantId, scope, {
            category: category ?? DEFAULT_CATEGORY,
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

    archiveField: async (event: RequestEvent) => {
      const { f } = await begin(event)
      const scope = scopeFor(event, f)
      const id = f.uuid("id", { required: true })
      if (!f.ok || !scope) return fail(400, f.problem())
      const archived = await withTenant(actorFrom(event.locals), (tx) =>
        archiveDefinition(tx, scope, id!),
      )
      if (!archived) {
        return fail(404, { message: "That field no longer exists." })
      }
      return { fieldArchived: true }
    },

    renameCategory: async (event: RequestEvent) => {
      const { f } = await begin(event)
      const scope = scopeFor(event, f)
      const from = f.text("from", { required: true, max: 100 })
      const to = f.text("to", { required: true, max: 100 })
      if (!f.ok || !scope) return fail(400, f.problem())
      const moved = await withTenant(actorFrom(event.locals), (tx) =>
        renameCategory(tx, scope, from!, to!),
      )
      if (moved === 0) {
        return fail(404, {
          errorFields: ["from"],
          message: "That category no longer exists.",
        })
      }
      return { categoryRenamed: true }
    },

    moveField: async (event: RequestEvent) => {
      const { f } = await begin(event)
      const scope = scopeFor(event, f)
      const id = f.uuid("id", { required: true })
      const direction = f.choice("direction", ["up", "down"] as const, {
        required: true,
      })
      if (!f.ok || !scope) return fail(400, f.problem())
      await withTenant(actorFrom(event.locals), (tx) =>
        moveDefinition(tx, scope, id!, direction!),
      )
      return { fieldMoved: true }
    },
  }
}
