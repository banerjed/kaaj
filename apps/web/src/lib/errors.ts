/**
 * What is allowed to leave the process when an error is reported.
 *
 * An ALLOWLIST, never a denylist — the same shape as every other exemption
 * list here. A denylist silently absorbs whatever field the driver adds in its
 * next release, which is exactly the case this exists to catch.
 *
 * The reason is measurable rather than theoretical. A `PostgresError` raised
 * for the TABLE OWNER carries the offending row:
 *
 *     message: duplicate key value violates unique constraint "firm_…_key"
 *     detail:  Key (tenant_id, department_code)=(07fb03f8-…, ENG) already exists.
 *
 * Measured here, and the nuance matters: Postgres WITHHOLDS that `detail` from
 * a role that does not own the table, so on the request path — which runs as
 * `app_user` under `SET LOCAL ROLE` (L3) — `detail` is already absent. It is
 * present for the owner, which is what `./check`, the migrations, the remote
 * verifier and anything holding `PRIVATE_SUPABASE_SERVICE_ROLE` connect as.
 *
 * So this list is defence in depth for the request path and the only defence
 * for everything else. `where`, `query` and the bound parameters are on the
 * same footing.
 *
 * **A caveat that has to stay visible:** `message` echoes the submitted value
 * regardless of role — `invalid input syntax for type uuid: "not-a-uuid"`,
 * measured, and the same shape for a `date` column puts a date of birth in the
 * log. `message` is kept because an error without one is not debuggable. It is
 * the reason these lines belong in infrastructure we control, and must not be
 * forwarded to a third party before the sub-processor question is answered.
 *
 * See L69 in docs/10-lessons-learned.md.
 */

/** Fields of a plain `Error`. `stack` is code paths, not data. */
const ERROR_FIELDS = ["name", "message", "stack"] as const

/**
 * Fields of a postgres.js `PostgresError` that describe the SCHEMA rather than
 * the row. `constraint_name` is the one that makes a failure diagnosable, and
 * it is also what `$lib/server/db/constraints` keys on.
 */
const PG_FIELDS = [
  "code",
  "constraint_name",
  "table_name",
  "schema_name",
  "routine",
  "severity",
] as const

export type SafeError = Record<string, string>

/**
 * An error reduced to the fields that may be logged.
 *
 * Takes `unknown` because a `throw` is not obliged to throw an `Error`, and a
 * reporter that assumes otherwise fails inside the error path — where it is
 * hardest to notice.
 */
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

  // A thrown object with none of the above still has to say something, or the
  // log line is an empty husk that looks like a working reporter.
  if (Object.keys(out).length === 0) {
    out.name = source.constructor?.name ?? "Object"
    out.message = "(no message; see the route and status)"
  }
  return out
}
