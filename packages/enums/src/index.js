/**
 * Enumerated values shared by the database, API and every client.
 * `enumerations.json` is the source of truth; `./check` keeps the DB's SQL
 * fixture (built into dist/) in step with it.
 */
import enumerations from "./enumerations.json" with { type: "json" }

export { enumerations }

/** camelCase key (employmentType) -> snake_case Postgres type name. */
export const toTypeName = (key) =>
  key.replace(/(?<!^)(?=[A-Z])/g, "_").toLowerCase()

/**
 * Flattens the nested enumerations document into
 * Map<snake_case_name, string[]>. Only nodes carrying a `values` array are
 * enumerations; everything else is grouping.
 */
export function allEnumerations(
  node = enumerations.enumerations,
  found = new Map(),
) {
  if (node === null || typeof node !== "object") return found
  for (const [key, value] of Object.entries(node)) {
    if (value && typeof value === "object" && Array.isArray(value.values)) {
      found.set(
        toTypeName(key),
        value.values.map((v) =>
          typeof v === "object" && v !== null ? v.value : v,
        ),
      )
    } else {
      allEnumerations(value, found)
    }
  }
  return found
}

/** Allowed values for one enumeration, by snake_case name. Empty if unknown. */
export const valuesOf = (typeName) => allEnumerations().get(typeName) ?? []

/** Whether `value` is permitted for the named enumeration. */
export const isValid = (typeName, value) => valuesOf(typeName).includes(value)
