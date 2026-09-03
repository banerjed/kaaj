import type { Tx } from "../db/tenant"

/**
 * payroll_pay_schedules — when people are paid. Lives under $lib/server/payroll
 * per docs/api-surface.md even though its page is under /settings.
 */

export type PaySchedule = {
  id: string
  name: string
  name_i18n: Record<string, string> | null
  frequency: string
  anchor_date: string | null
  timezone: string
  currency: string | null
  is_active: boolean
  is_default: boolean
  adjust_for_weekends: boolean | null
  adjust_for_holidays: boolean | null
}

export async function list(tx: Tx): Promise<PaySchedule[]> {
  return tx<PaySchedule[]>`
    SELECT id, name, name_i18n, frequency,
           to_char(anchor_date, 'YYYY-MM-DD') AS anchor_date,
           timezone, currency, is_active, is_default,
           adjust_for_weekends, adjust_for_holidays
      FROM payroll_pay_schedules
     ORDER BY is_default DESC, name ASC
  `
}

export type PayScheduleInput = {
  name: string
  name_i18n: Record<string, string> | null
  frequency: string
  anchor_date: string
  timezone: string
  currency: string
  adjust_for_weekends: boolean
  adjust_for_holidays: boolean
}

export async function create(
  tx: Tx,
  tenantId: string,
  input: PayScheduleInput,
): Promise<void> {
  await tx`
    INSERT INTO payroll_pay_schedules (
      tenant_id, name, name_i18n, frequency, anchor_date, timezone, currency,
      adjust_for_weekends, adjust_for_holidays, is_active
    ) VALUES (
      ${tenantId}, ${input.name}, ${tx.json(input.name_i18n)},
      ${input.frequency}, ${input.anchor_date}::date, ${input.timezone},
      ${input.currency}, ${input.adjust_for_weekends},
      ${input.adjust_for_holidays}, TRUE
    )
  `
}

export async function update(
  tx: Tx,
  id: string,
  input: PayScheduleInput,
): Promise<void> {
  await tx`
    UPDATE payroll_pay_schedules SET
      name                = ${input.name},
      name_i18n           = ${tx.json(input.name_i18n)},
      frequency           = ${input.frequency},
      anchor_date         = ${input.anchor_date}::date,
      timezone            = ${input.timezone},
      currency            = ${input.currency},
      adjust_for_weekends = ${input.adjust_for_weekends},
      adjust_for_holidays = ${input.adjust_for_holidays},
      updated_at          = now()
    WHERE id = ${id}
  `
}

/** Deactivate, and say whether a row actually matched — a no-op must not report success (L68). */
export async function archive(tx: Tx, id: string): Promise<boolean> {
  const rows = await tx<{ id: string }[]>`
    UPDATE payroll_pay_schedules SET is_active = FALSE, updated_at = now()
     WHERE id = ${id}
   RETURNING id`
  return rows.length > 0
}
