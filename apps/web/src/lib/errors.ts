/**
 * What is allowed to leave the process when an error is reported. An
 * ALLOWLIST, not a denylist, since `detail`/`where`/`query` on a
 * `PostgresError` can carry the offending row (visible to the table owner
 * even though `app_user` doesn't get it). `message` still echoes submitted
 * values, so these lines must stay in infrastructure we control. See L69.
 */

/** Fields of a plain `Error`. `stack` is code paths, not data. */
const ERROR_FIELDS = ["name", "message", "stack"] as const

/** Fields describing the SCHEMA, not the row. `constraint_name` is what `$lib/server/db/constraints` keys on. */
const PG_FIELDS = [
  "code",
  "constraint_name",
  "table_name",
  "schema_name",
  "routine",
  "severity",
] as const

export type SafeError = Record<string, string>

/** An error reduced to the fields that may be logged. Takes `unknown` since a `throw` need not be an `Error`. */
export function safeError(error: unknown): SafeError {
  if (typeof error !== "object" || error === null) {
    return { name: typeof error, message: String(error) }
  }

  const source = error as Record<string, unknown>
  const out: SafeError = {}
  for (const key of [...ERROR_FIELDS, ...PG_FIELDS]) {
    const value = source[key]
    if (typeof value === "string" && value !== "") out[key] = value
  }

  // Say something even if none of the fields above were present.
  if (Object.keys(out).length === 0) {
    out.name = source.constructor?.name ?? "Object"
    out.message = "(no message; see the route and status)"
  }
  return out
}
