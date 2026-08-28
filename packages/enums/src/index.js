/**
 * Enumerated values shared by the database, the API and every client.
 *
 * Framework-agnostic on purpose: this must load in a browser, on the server,
 * and under any future mobile runtime.
 *
 * `enumerations.json` is the source of truth. The database is checked against
 * it by verify-invariants.sql, via the SQL fixture that `pnpm build` emits into
 * dist/ — so a value added here and not to a migration fails CI, and vice versa.
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
