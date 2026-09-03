import type { Tx } from "../db/tenant"
import { compareDecimal, isNegative } from "$lib/decimal"

/**
 * firm_job_levels — the bands within a job title.
 *
 * `salary_ranges` is JSONB keyed by ISO currency, each an independent,
 * authoritative band — never derived from another at an exchange rate (BR-FP-006):
 *
 *   { "USD": { "min": 95000, "max": 130000 },
 *     "INR": { "min": 1800000, "max": 2600000 } }
 */

/** Strings — JSONB money, per CLAUDE.md § Money. */
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

/** Deactivate, and say whether a row actually matched — a no-op must not report success (L68). */
export async function archive(tx: Tx, id: string): Promise<boolean> {
  const rows = await tx<
    { id: string }[]
  >`UPDATE firm_job_levels SET is_active = FALSE, updated_at = now() WHERE id = ${id} RETURNING id`
  return rows.length > 0
}

/**
 * A band with min above max is silently nonsensical — it accepts no salary at
 * all — and the column is JSONB, so no CHECK constraint can catch it.
 */
export function invalidCurrencies(ranges: SalaryRanges): string[] {
  return Object.entries(ranges)
    .filter(
      // Guard rather than throw — a side can be missing on an older row.
      ([, r]) =>
        typeof r?.min !== "string" ||
        typeof r?.max !== "string" ||
        isNegative(r.min) ||
        isNegative(r.max) ||
        compareDecimal(r.max, r.min) < 0,
    )
    .map(([currency]) => currency)
}
