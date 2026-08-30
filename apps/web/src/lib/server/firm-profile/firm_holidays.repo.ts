import type { Tx } from "../db/tenant"

/**
 * firm_holidays — the observed calendar, per office.
 *
 * Holidays are per LOCATION, not per tenant: Republic Day is a holiday in
 * Bangalore and a working day in New York. Payroll and leave accrual both read
 * this, so a holiday on the wrong calendar is a paid day the firm did not
 * intend to give, or a working day it did not intend to take away.
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
  // location_id is NOT NULL, so it is resolved from the code rather than asked
  // for: the form works in location codes, which is what the rest of the
  // schema uses.
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

/**
 * Archived, never deleted. Rows are retained so history stays answerable, and
 * `app_user` no longer holds DELETE on this table — see
 * supabase/migrations/20260830120000_append_only.sql.
 */
export async function archive(tx: Tx, id: string): Promise<void> {
  await tx`UPDATE firm_holidays SET is_active = FALSE, updated_at = now() WHERE id = ${id}`
}

/**
 * Is this date already a holiday at this office?
 *
 * `UNIQUE (tenant_id, holiday_id)` does not prevent it — two rows with
 * different holiday_ids can sit on the same date and location, which pays the
 * day twice. BR-FP-013 asks for deduplication on import; this is the same rule
 * applied to manual entry.
 */
export async function clashes(
  tx: Tx,
  locationCode: string,
  date: string,
  excludeId?: string,
): Promise<boolean> {
  const [row] = await tx<{ n: number }[]>`
    SELECT count(*)::int AS n FROM firm_holidays
     WHERE is_active
       -- Archived rows are retained but must not reserve the date: without
       -- this an archived holiday blocks that day forever, and the only fix
       -- would be the DELETE this codebase no longer allows.
       AND location_code = ${locationCode}
       AND date = ${date}::date
       AND (${excludeId ?? null}::uuid IS NULL OR id <> ${excludeId ?? null}::uuid)
  `
  return row.n > 0
}
