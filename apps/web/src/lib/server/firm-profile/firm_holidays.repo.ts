import type { Tx } from "../db/tenant"

/**
 * firm_holidays — the observed calendar, per office. Holidays are per
 * LOCATION, not per tenant — payroll and leave accrual both read this.
 */

export type FirmHoliday = {
  id: string
  holiday_id: string | null
  location_code: string
  name: string
  name_i18n: Record<string, string> | null
  date: string
  is_paid: boolean
  is_mandatory: boolean
  is_recurring: boolean
  recurrence_rule: string | null
}

export async function list(tx: Tx, year?: number): Promise<FirmHoliday[]> {
  return tx<FirmHoliday[]>`
    SELECT id, holiday_id, location_code, name, name_i18n,
           to_char(date, 'YYYY-MM-DD') AS date,
           is_paid, is_mandatory, is_recurring, recurrence_rule
      FROM firm_holidays
     WHERE is_active
       AND (${year ?? null}::int IS NULL
            OR extract(year FROM date) = ${year ?? null}::int)
     ORDER BY date ASC, location_code ASC
  `
}

/** The distinct years present, so the filter offers only real options. */
export async function years(tx: Tx): Promise<number[]> {
  const rows = await tx<{ year: number }[]>`
    SELECT DISTINCT extract(year FROM date)::int AS year
      FROM firm_holidays WHERE is_active ORDER BY year
  `
  return rows.map((r) => r.year)
}

export type HolidayInput = {
  location_code: string
  name: string
  name_i18n: Record<string, string> | null
  date: string
  is_paid: boolean
  is_mandatory: boolean
  is_recurring: boolean
  holiday_id: string | null
}

export async function create(
  tx: Tx,
  tenantId: string,
  input: HolidayInput,
): Promise<void> {
  // location_id resolved from the code, since the form works in codes.
  await tx`
    INSERT INTO firm_holidays (
      tenant_id, location_id, location_code, name, name_i18n, date,
      is_paid, is_mandatory, is_recurring, holiday_id
    ) VALUES (
      ${tenantId},
      (SELECT id FROM firm_locations WHERE location_code = ${input.location_code}),
      ${input.location_code}, ${input.name}, ${tx.json(input.name_i18n)},
      ${input.date}::date, ${input.is_paid}, ${input.is_mandatory},
      ${input.is_recurring}, ${input.holiday_id}
    )
  `
}

export async function update(
  tx: Tx,
  id: string,
  input: HolidayInput,
): Promise<void> {
  await tx`
    UPDATE firm_holidays SET
      location_code = ${input.location_code},
      location_id   = (SELECT id FROM firm_locations
                        WHERE location_code = ${input.location_code}),
      name          = ${input.name},
      name_i18n     = ${tx.json(input.name_i18n)},
      date          = ${input.date}::date,
      is_paid       = ${input.is_paid},
      is_mandatory  = ${input.is_mandatory},
      is_recurring  = ${input.is_recurring},
      updated_at    = now()
    WHERE id = ${id}
  `
}

/** Deactivate, and say whether a row actually matched — a no-op must not report success (L68). */
export async function archive(tx: Tx, id: string): Promise<boolean> {
  const rows = await tx<
    { id: string }[]
  >`UPDATE firm_holidays SET is_active = FALSE, updated_at = now() WHERE id = ${id} RETURNING id`
  return rows.length > 0
}

/** Is this date already a holiday at this office? The UNIQUE constraint doesn't catch two different holiday_ids on the same day (BR-FP-013). */
export async function clashes(
  tx: Tx,
  locationCode: string,
  date: string,
  excludeId?: string,
): Promise<boolean> {
  const [row] = await tx<{ n: number }[]>`
    SELECT count(*)::int AS n FROM firm_holidays
     WHERE is_active
       -- Archived rows must not reserve the date forever.
       AND location_code = ${locationCode}
       AND date = ${date}::date
       AND (${excludeId ?? null}::uuid IS NULL OR id <> ${excludeId ?? null}::uuid)
  `
  return row.n > 0
}
