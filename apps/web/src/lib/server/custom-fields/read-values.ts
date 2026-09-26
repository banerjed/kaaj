import { FormReader } from "../forms"
import type { CustomFieldDefinition } from "./custom-fields.repo"

export type CustomFieldSubmission = {
  definitionId: string
  value: string | boolean | string[] | null
}

/**
 * Reads one value per definition from a submitted form, using the reader
 * type each `data_type` needs — `cf_<field_key>` for everything, `[]`-suffixed
 * for multiselect (a real HTML multi-checkbox group, read via `getAll`,
 * not FormReader — it has no multi-value reader).
 *
 * Called BEFORE `f.ok` is checked, same ordering rule as every other
 * FormReader field (CLAUDE.md L33) — the caller checks `f.ok` once, after
 * this returns, before touching the database.
 */
export function readCustomFieldValues(
  f: FormReader,
  data: FormData,
  definitions: CustomFieldDefinition[],
): CustomFieldSubmission[] {
  return definitions.map((def) => {
    const name = `cf_${def.field_key}`
    switch (def.data_type) {
      case "text":
      case "select":
        return { definitionId: def.id, value: f.text(name, { max: 2000 }) }
      case "number":
        return { definitionId: def.id, value: f.decimal(name, { scale: 4 }) }
      case "money":
        return { definitionId: def.id, value: f.decimal(name, { scale: 2 }) }
      case "date":
        return { definitionId: def.id, value: f.date(name) }
      case "boolean":
        return { definitionId: def.id, value: f.bool(name) }
      case "multiselect":
        return {
          definitionId: def.id,
          value: data
            .getAll(`${name}[]`)
            .filter((v): v is string => typeof v === "string"),
        }
    }
  })
}
