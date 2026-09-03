import type { Tx } from "../db/tenant"
import type { AuthContext } from "../auth/can"

/**
 * The audit trail. Written in the SAME transaction as the change it describes,
 * so the record can't diverge from what actually happened. Append-only —
 * `app_user` holds INSERT/SELECT only; a correction is a new row.
 *
 * `changes` is a decision, not a row dump — see `redact` for what's excluded.
 */

/**
 * Fields that must never reach the trail — every encrypted column plus the
 * unencrypted values that are equally private. `verify-audit-coverage.mjs`
 * fails if a `_ct`/`_encrypted` column exists and isn't listed here.
 *
 * Redaction matches the KEY, which is why `reason` carries prose and never
 * values — a sentence has no field name to match.
 */
const NEVER_LOGGED = new Set([
  // Cleartext names, kept for callers that predate encryption.
  "ssn_tax_id",
  "password",
  "wrapped_dek",

  // Encrypted columns — every one in the schema.
  "account_number_ct",
  "account_number_encrypted",
  "address_ct",
  "bank_account_number_ct",
  "bank_routing_number_ct",
  "bic_swift_ct",
  "certification_number_ct",
  "email_ct",
  "iban_ct",
  "ifsc_code_ct",
  "phone_primary_ct",
  "phone_secondary_ct",
  "routing_number_ct",
  "sort_code_ct",
  "ssn_tax_id_ct",
  "swift_code_ct",
  "tax_id_ct",

  // Withheld from its own subject until submitted (L39); not a diff either.
  "self_assessment",
  "manager_assessment",
])
/**
 * One field that changed, as STRINGS — a JSON number in JSONB round-trips
 * through JS as a float64 (L41), and this table can't be corrected after the
 * fact. `null` means no value; SET-first-time is `{from: null, to: "..."}`.
 */
export type FieldChange = {
  from: string | null
  to: string | null
}

/** What was done. A closed set, so the trail can be filtered and counted. */
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
  /** Fields that changed, with OLD and NEW value each. Not a row dump. */
  changes?: Record<string, FieldChange> | null
  /**
   * WHY, in prose ("corrected a typo"). Never put values here — redaction
   * matches field NAMES in `changes`, so prose bypasses it entirely.
   */
  reason?: string | null
}

/** Redacted values are replaced, not dropped, so the trail still shows that
 * the field was touched — without the value. */
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

/** Record one entry. Takes the transaction so it commits with the change it describes. */
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
      -- reason rides in changes under _reason (no new column; no backticks, this is a JS template literal — L52, hit before)
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

/**
 * The fields that actually MOVED, as `{from, to}` pairs — not every field on
 * the row. `before` null (a creation) yields `{from: null, to: ...}` for each.
 */
export function diff(
  before: Record<string, unknown> | null | undefined,
  after: Record<string, unknown>,
  fields: string[],
): Record<string, FieldChange> {
  const out: Record<string, FieldChange> = {}
  for (const field of fields) {
    const from = stringify(before?.[field])
    const to = stringify(after[field])
    if (from === to) continue
    out[field] = { from, to }
  }
  return out
}

function stringify(value: unknown): string | null {
  if (value === null || value === undefined) return null
  if (typeof value === "string") return value
  if (typeof value === "boolean" || typeof value === "number") {
    return String(value)
  }
  // JSONB column (e.g. name_i18n) — serialize so the change is visible.
  return JSON.stringify(value)
}
