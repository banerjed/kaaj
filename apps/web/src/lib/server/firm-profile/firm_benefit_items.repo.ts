import type { Tx } from "../db/tenant"

/**
 * firm_benefit_items — what is actually in a package.
 *
 * `costs_by_currency` is JSONB keyed by ISO currency, the same shape and the
 * same reasoning as `firm_job_levels.salary_ranges`: a benefit costs what it
 * costs in each market, and deriving one figure from another at an exchange
 * rate would re-price everybody's payslip whenever the rate moved.
 *
 *   { "USD": { "employee": 120, "employer": 480 },
 *     "INR": { "employee": 2500, "employer": 9000 } }
 */

export type BenefitCost = { employee: number; employer: number }
export type CostsByCurrency = Record<string, BenefitCost>

export type BenefitItem = {
  id: string
  benefits_package_id: string
  benefit_type: string
  benefit_name: string
  benefit_name_i18n: Record<string, string> | null
  carrier_name: string | null
  carrier_varies_by_location: boolean | null
  costs_by_currency: CostsByCurrency | null
}

export async function list(tx: Tx): Promise<BenefitItem[]> {
  return tx<BenefitItem[]>`
    SELECT id, benefits_package_id, benefit_type, benefit_name,
           benefit_name_i18n, carrier_name, carrier_varies_by_location,
           costs_by_currency
      FROM firm_benefit_items
     ORDER BY benefit_type ASC, benefit_name ASC
  `
}

export type BenefitItemInput = {
  benefits_package_id: string
  benefit_type: string
  benefit_name: string
  benefit_name_i18n: Record<string, string> | null
  carrier_name: string | null
  carrier_varies_by_location: boolean
  costs_by_currency: CostsByCurrency
}

export async function create(
  tx: Tx,
  tenantId: string,
  input: BenefitItemInput,
): Promise<void> {
  await tx`
    INSERT INTO firm_benefit_items (
      tenant_id, benefits_package_id, benefit_type, benefit_name,
      benefit_name_i18n, carrier_name, carrier_varies_by_location,
      costs_by_currency
    ) VALUES (
      ${tenantId}, ${input.benefits_package_id}, ${input.benefit_type},
      ${input.benefit_name}, ${tx.json(input.benefit_name_i18n)},
      ${input.carrier_name}, ${input.carrier_varies_by_location},
      ${tx.json(input.costs_by_currency)}
    )
  `
}

export async function update(
  tx: Tx,
  id: string,
  input: BenefitItemInput,
): Promise<void> {
  await tx`
    UPDATE firm_benefit_items SET
      benefit_type               = ${input.benefit_type},
      benefit_name               = ${input.benefit_name},
      benefit_name_i18n          = ${tx.json(input.benefit_name_i18n)},
      carrier_name               = ${input.carrier_name},
      carrier_varies_by_location = ${input.carrier_varies_by_location},
      costs_by_currency          = ${tx.json(input.costs_by_currency)},
      updated_at                 = now()
    WHERE id = ${id}
  `
}

export async function remove(tx: Tx, id: string): Promise<void> {
  await tx`DELETE FROM firm_benefit_items WHERE id = ${id}`
}

/**
 * Costs that make no sense. Negative money is not a benefit, and the column is
 * JSONB so no CHECK constraint can reach it.
 *
 * CLAUDE.md is explicit that custom fields must never feed payroll; these are
 * modelled columns rather than custom fields precisely so they can, which puts
 * the burden of validating them here.
 */
export function invalidCosts(costs: CostsByCurrency): string[] {
  return Object.entries(costs)
    .filter(
      ([, c]) =>
        !Number.isFinite(c.employee) ||
        !Number.isFinite(c.employer) ||
        c.employee < 0 ||
        c.employer < 0,
    )
    .map(([currency]) => currency)
}
