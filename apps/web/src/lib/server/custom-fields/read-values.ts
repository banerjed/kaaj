import { checkFields, FormReader } from "../forms"
import type {
  CustomFieldDefinition,
  CustomFieldSubmission,
} from "./custom-fields.repo"

/**
 * Reads one value per definition from a submitted form, with the reader each
 * `data_type` needs. Fields are named `cf_<field_key>`; a multiselect is a
 * checkbox group named `cf_<field_key>[]`.
 *
 * Call it BEFORE checking `f.ok` (L33): a rejected field is only reported if
 * the gate runs after it. A required field left blank is rejected; a
 * required checkbox is not, because unticked is an answer ("No").
 */
export function readCustomFieldValues(
  f: FormReader,
  data: FormData,
  definitions: CustomFieldDefinition[],
): CustomFieldSubmission[] {
  return definitions.map((def) => {
    const name = `cf_${def.field_key}`
    const required = def.is_required
    switch (def.data_type) {
      case "text":
      case "select":
        return {
          definitionId: def.id,
          value: f.text(name, { max: 2000, required }),
        }
      case "number":
        return {
          definitionId: def.id,
          value: f.decimal(name, { scale: 4, integerDigits: 14, required }),
        }
      case "money":
        return {
          definitionId: def.id,
          value: f.decimal(name, { scale: 2, integerDigits: 13, required }),
        }
      case "date":
        return { definitionId: def.id, value: f.date(name, { required }) }
      case "boolean":
        return { definitionId: def.id, value: f.bool(name) }
      case "multiselect": {
        const chosen = data
          .getAll(`${name}[]`)
          .filter((v): v is string => typeof v === "string")
        if (required && chosen.length === 0) f.reject(name)
        return { definitionId: def.id, value: chosen }
      }
    }
  })
}

/**
 * `f.problem()`, with a refused custom field named by its label rather than
 * its `cf_` form name; other refused fields are named as usual.
 */
export function customFieldProblem(
  f: FormReader,
  definitions: CustomFieldDefinition[],
): { errorFields: string[]; message: string } {
  const labelOf = new Map(
    definitions.map((d) => [`cf_${d.field_key}`, d.label]),
  )
  return {
    errorFields: f.errorFields,
    message: checkFields(
      f.errorFields.map((name) => labelOf.get(name) ?? name),
    ),
  }
}
