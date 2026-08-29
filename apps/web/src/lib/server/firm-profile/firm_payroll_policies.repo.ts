import type { Tx } from "../db/tenant"

/**
 * firm_payroll_policies — overtime, rounding and the workweek, per office.
 *
 * `location_id` is nullable: a row with no location is the firm-wide default,
 * and a row with one overrides it for that office. Overtime law is national
 * (FLSA in the US, Working Time Regulations in the UK, the Factories Act in
 * India), so a single tenant-wide rule cannot be right for a firm in three
 * countries.
 */

/**
 * Strings, not numbers. These are rates and quantities — CLAUDE.md's
 * `numeric(18,4)` family — and a JSON number round-trips through a float64 on
 * the way back out of JSONB. Nothing here is arithmetic in JavaScript.
 */
export type OvertimeRules = {
  daily_threshold_hours?: string
  weekly_threshold_hours?: string
  multiplier?: string
  double_time_after_hours?: string
}

export type PayrollPolicy = {
  id: string
  location_id: string | null
  location_code: string | null
  location_name: string | null
  overtime_rules: OvertimeRules | null
  time_rounding: string | null
  workweek_start_day: number | null
  require_time_tracking: boolean | null
}

export async function list(tx: Tx): Promise<PayrollPolicy[]> {
  return tx<PayrollPolicy[]>`
    SELECT p.id, p.location_id, l.location_code, l.name AS location_name,
           p.overtime_rules, p.time_rounding, p.workweek_start_day,
           p.require_time_tracking
      FROM firm_payroll_policies p
      LEFT JOIN firm_locations l ON l.id = p.location_id
     ORDER BY (p.location_id IS NOT NULL), l.name ASC
  `
}

export type PolicyInput = {
  location_code: string | null
  overtime_rules: OvertimeRules
  time_rounding: string
  workweek_start_day: number
  require_time_tracking: boolean
}

export async function create(
  tx: Tx,
  tenantId: string,
  input: PolicyInput,
): Promise<void> {
  await tx`
    INSERT INTO firm_payroll_policies (
      tenant_id, location_id, overtime_rules, time_rounding,
      workweek_start_day, require_time_tracking
    ) VALUES (
      ${tenantId},
      -- Yields NULL for a null code, which is the firm-wide default row.
      (SELECT id FROM firm_locations WHERE location_code = ${input.location_code}),
      ${tx.json(input.overtime_rules)}, ${input.time_rounding},
      ${input.workweek_start_day}, ${input.require_time_tracking}
    )
  `
}

export async function update(
  tx: Tx,
  id: string,
  input: PolicyInput,
): Promise<void> {
  await tx`
    UPDATE firm_payroll_policies SET
      overtime_rules        = ${tx.json(input.overtime_rules)},
      time_rounding         = ${input.time_rounding},
      workweek_start_day    = ${input.workweek_start_day},
      require_time_tracking = ${input.require_time_tracking},
      updated_at            = now()
    WHERE id = ${id}
  `
}

export async function remove(tx: Tx, id: string): Promise<void> {
  await tx`DELETE FROM firm_payroll_policies WHERE id = ${id}`
}
