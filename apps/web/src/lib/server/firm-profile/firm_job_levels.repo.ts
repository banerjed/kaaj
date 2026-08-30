import type { Tx } from "../db/tenant"
import { compareDecimal, isNegative } from "$lib/decimal"

/**
 * firm_job_levels — the bands within a job title.
 *
 * `salary_ranges` is JSONB keyed by ISO currency:
 *
 *   { "USD": { "min": 95000, "max": 130000 },
 *     "INR": { "min": 1800000, "max": 2600000 } }
 *
 * Each currency is an independent, authoritative band — NOT a conversion of the
 * others. BR-FP-006: a band is what the firm actually pays in that market, and
 * deriving one from another at an exchange rate would silently re-price people
 * every time the rate moved.
 */

/**
 * Strings. A band is money, and JSONB hands a JSON number back to JavaScript as
 * a float64 — see CLAUDE.md § Money. Postgres itself stores jsonb numbers as
 * `numeric` and would keep them exact; the loss is on the way out.
 */
export type SalaryRange = { min: string; max: string }
export type SalaryRanges = Record<string, SalaryRange>

export type FirmJobLevel = {
  id: string
  job_title_id: string
  level_name: string
  level_name_i18n: Record<string, string> | null
  salary_ranges: SalaryRanges
  sort_order: number
}

export async function listByTitle(tx: Tx): Promise<FirmJobLevel[]> {
  return tx<FirmJobLevel[]>`
    SELECT id, job_title_id, level_name, level_name_i18n,
           salary_ranges, sort_order
      FROM firm_job_levels
     WHERE is_active
     ORDER BY job_title_id, sort_order ASC, level_name ASC
  `
}

export type JobLevelInput = {
  job_title_id: string
  level_name: string
  level_name_i18n: Record<string, string> | null
  salary_ranges: SalaryRanges
  sort_order: number
}

export async function create(
  tx: Tx,
  tenantId: string,
  input: JobLevelInput,
): Promise<{ id: string }> {
  const [row] = await tx<{ id: string }[]>`
    INSERT INTO firm_job_levels
      (tenant_id, job_title_id, level_name, level_name_i18n,
       salary_ranges, sort_order)
    VALUES (
      ${tenantId}, ${input.job_title_id}, ${input.level_name},
      ${tx.json(input.level_name_i18n)}, ${tx.json(input.salary_ranges)},
      ${input.sort_order}
    )
    RETURNING id
  `
  return row
}

export async function update(
  tx: Tx,
  id: string,
  input: JobLevelInput,
): Promise<void> {
  await tx`
    UPDATE firm_job_levels SET
      level_name      = ${input.level_name},
      level_name_i18n = ${tx.json(input.level_name_i18n)},
      salary_ranges   = ${tx.json(input.salary_ranges)},
      sort_order      = ${input.sort_order},
      updated_at      = now()
    WHERE id = ${id}
  `
}

/**
 * Archived, never deleted. Rows are retained so history stays answerable, and
 * `app_user` no longer holds DELETE on this table — see
 * supabase/migrations/20260830120000_append_only.sql.
 */
export async function archive(tx: Tx, id: string): Promise<void> {
  await tx`UPDATE firm_job_levels SET is_active = FALSE, updated_at = now() WHERE id = ${id}`
}

/**
 * A band with min above max is silently nonsensical — it accepts no salary at
 * all — and the column is JSONB, so no CHECK constraint can catch it.
 */
export function invalidCurrencies(ranges: SalaryRanges): string[] {
  return Object.entries(ranges)
    .filter(
      // A side can be missing on a row written before the form refused one.
      // `compareDecimal` expects a string, so guard rather than throw.
      ([, r]) =>
        typeof r?.min !== "string" ||
        typeof r?.max !== "string" ||
        isNegative(r.min) ||
        isNegative(r.max) ||
        compareDecimal(r.max, r.min) < 0,
    )
    .map(([currency]) => currency)
}
