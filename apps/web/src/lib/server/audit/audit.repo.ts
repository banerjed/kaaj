import type { Tx } from "../db/tenant"
import type { AuthContext } from "../auth/can"

/**
 * The audit trail.
 *
 * **Written in the same transaction as the change it describes.** That is the
 * whole design. A trail written afterwards, or from a job, or best-effort with
 * a swallowed error, records what the application *believed* happened — and the
 * two diverge exactly when it matters, because the interesting failures are the
 * ones where the write succeeded and something else did not. Here the change
 * and its record commit together or neither does.
 *
 * The table is append-only: `app_user` holds INSERT and SELECT and nothing else
 * (20260830200000). A correction is a new row describing the correction, the
 * way a ledger works and the way this repository's own migrations work.
 *
 * **What goes in `changes` is a decision, not a dump.** Serialising a whole row
 * would put encrypted PII, and anything later added to that table, into a log
 * that is deliberately impossible to delete from. Callers pass the fields that
 * changed, and `redact` names the ones that must never appear.
 */

/** Fields that must never reach the trail, whatever a caller passes. */
const NEVER_LOGGED = new Set([
  "ssn_tax_id",
  "ssn_tax_id_ct",
  "account_number_ct",
  "routing_number_ct",
  "iban_ct",
  "bic_swift_ct",
  "ifsc_code_ct",
  "sort_code_ct",
  "wrapped_dek",
  "password",
  "self_assessment",
  "manager_assessment",
])

export type AuditEntry = {
  /** What was done: approve, deny, create, update, archive, generate_plan. */
  action: string
  /** What it was done to: time_off_request, review, employee. */
  entityType: string
  entityId?: string | null
  module?: string
  /**
   * The specific facts worth keeping. Not a row dump — see the note above.
   * `{ from, to }` pairs read best when a value changed.
   */
  changes?: Record<string, unknown> | null
}

/**
 * Values that must not be logged are replaced rather than dropped, so the trail
 * still records THAT the field was touched. "Someone changed the bank details"
 * is the fact an auditor needs; the number is not.
 */
function redact(changes: Record<string, unknown> | null | undefined) {
  if (!changes) return null
  const out: Record<string, unknown> = {}
  for (const [key, value] of Object.entries(changes)) {
    out[key] = NEVER_LOGGED.has(key) ? "[redacted]" : value
  }
  return out
}

/**
 * Record one entry. Takes the transaction, so the caller cannot accidentally
 * write it outside the change it describes.
 */
export async function record(
  tx: Tx,
  ctx: AuthContext,
  entry: AuditEntry,
): Promise<void> {
  await tx`
    INSERT INTO audit_log (
      tenant_id, actor_user_id, actor_employee_id,
      action, entity_type, entity_id, module, changes
    ) VALUES (
      ${ctx.tenantId}, ${ctx.userId}, ${ctx.employeeId},
      ${entry.action}, ${entry.entityType}, ${entry.entityId ?? null},
      ${entry.module ?? null},
      ${tx.json(redact(entry.changes) as never)}
    )
  `
}

export type AuditRow = {
  id: string
  action: string
  entity_type: string
  entity_id: string | null
  module: string | null
  actor_name: string | null
  changes: Record<string, unknown> | null
  occurred_at: Date
}

/** The history of one thing, newest first. */
export async function forEntity(
  tx: Tx,
  entityType: string,
  entityId: string,
): Promise<AuditRow[]> {
  return tx<AuditRow[]>`
    SELECT a.id::text AS id, a.action, a.entity_type, a.entity_id, a.module,
           e.first_name || ' ' || e.last_name AS actor_name,
           a.changes, a.occurred_at
      FROM audit_log a
      LEFT JOIN employees e ON e.id = a.actor_employee_id
     WHERE a.entity_type = ${entityType} AND a.entity_id = ${entityId}
     ORDER BY a.occurred_at DESC, a.id DESC
  `
}

/** Recent activity across the tenant. */
export async function recent(
  tx: Tx,
  filters: { module?: string; limit?: number } = {},
): Promise<AuditRow[]> {
  const module = filters.module || null
  const limit = Math.min(filters.limit ?? 50, 200)
  return tx<AuditRow[]>`
    SELECT a.id::text AS id, a.action, a.entity_type, a.entity_id, a.module,
           e.first_name || ' ' || e.last_name AS actor_name,
           a.changes, a.occurred_at
      FROM audit_log a
      LEFT JOIN employees e ON e.id = a.actor_employee_id
     WHERE (${module}::text IS NULL OR a.module = ${module}::text)
     ORDER BY a.occurred_at DESC, a.id DESC
     LIMIT ${limit}
  `
}
