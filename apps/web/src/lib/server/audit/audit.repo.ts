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

/**
 * One field that changed, as STRINGS.
 *
 * Strings, not the value's own type, for a reason this table makes permanent:
 * a JSON *number* inside JSONB is stored exactly by Postgres and handed back to
 * JavaScript as a float64, so a pay change of 148000 comes back as a float and
 * a larger one loses digits (L41). Everywhere else that is a bug to fix; here
 * it is a bug that cannot be fixed, because `audit_log` holds INSERT and SELECT
 * only and a correction is a new row rather than an edit.
 *
 * `null` means the field had no value — a field being SET for the first time is
 * `{ from: null, to: "..." }`, and being cleared is the reverse.
 */
export type FieldChange = {
  from: string | null
  to: string | null
}

/**
 * What was done. A closed set rather than free text, so the trail can be
 * filtered and counted; an action nobody listed is a decision nobody made.
 */
export const AUDIT_ACTIONS = [
  "create",
  "update",
  "archive",
  "restore",
  "approve",
  "deny",
  "submit",
  "acknowledge",
  "pay_change",
  "send",
  "record_payment",
  "close_period",
  "role_grant",
  "role_revoke",
  "erase",
  "export",
] as const
export type AuditAction = (typeof AUDIT_ACTIONS)[number]

export type AuditEntry = {
  /** What was done. */
  action: AuditAction
  /** Which table it was done to: `employees`, `compensation_base`. */
  entityType: string
  entityId?: string | null
  module?: string
  /**
   * The fields that changed, each with its OLD and NEW value.
   *
   * Typed as `FieldChange` rather than `unknown` on purpose: a flat
   * `{ amount: "148000" }` records what a value became and loses what it was,
   * which is the half an auditor actually asks about. The type now refuses it.
   *
   * Not a row dump — see the note at the top of this file.
   */
  changes?: Record<string, FieldChange> | null
  /**
   * WHY, in prose, when there is a why worth keeping: "corrected a typo",
   * "backdated per the offer letter".
   *
   * Deliberately separate from `changes`. Values never go in here — the
   * redaction set matches field NAMES, so a sentence containing an account
   * number would carry it straight past `NEVER_LOGGED` into a table that
   * cannot be deleted from.
   */
  reason?: string | null
}

/**
 * Values that must not be logged are replaced rather than dropped, so the trail
 * still records THAT the field was touched. "Someone changed the bank details"
 * is the fact an auditor needs; the number is not.
 */
function redact(changes: Record<string, FieldChange> | null | undefined) {
  if (!changes) return null
  const out: Record<string, FieldChange> = {}
  for (const [key, value] of Object.entries(changes)) {
    out[key] = NEVER_LOGGED.has(key)
      ? { from: "[redacted]", to: "[redacted]" }
      : value
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
      -- The reason rides inside the changes document under a reserved key
      -- rather than in a new column: audit_log is append-only and adding a
      -- column to it is a migration against a table nobody may rewrite. The
      -- key is namespaced with an underscore so it cannot collide with a
      -- field name. (No backticks in here: this is a JS template literal, and
      -- a backtick would end the string — L52, hit twice now.)
      ${tx.json({
        ...(redact(entry.changes) ?? {}),
        ...(entry.reason ? { _reason: entry.reason } : {}),
      } as never)}
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
  changes: Record<string, FieldChange> | null
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
