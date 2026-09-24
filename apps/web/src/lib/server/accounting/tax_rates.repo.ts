import type { Tx } from "../db/tenant"

/**
 * Sales tax / VAT configuration (US-ACC-046). Nothing else in the accounting
 * module reads these rows yet — invoices and bills still take a manually
 * typed tax amount — so this is configuration data, not a posting path.
 */

export type TaxRate = {
  id: string
  code: string
  tax_name: string
  tax_type: string
  rate: string
  /** `rate` scaled to a percentage, rounded in SQL rather than multiplied in JS. */
  rate_percent: string
  country: string
  region: string | null
  jurisdiction: string | null
  is_reverse_charge: boolean
  is_active: boolean
  effective_from: string
  effective_to: string | null
}

export async function listTaxRates(tx: Tx): Promise<TaxRate[]> {
  return tx<TaxRate[]>`
    SELECT id, code, tax_name, tax_type::text AS tax_type, rate::text AS rate,
           (rate * 100)::text AS rate_percent,
           country, region, jurisdiction, is_reverse_charge, is_active,
           effective_from::text, effective_to::text
      FROM tax_rates
     ORDER BY is_active DESC, code
  `
}

export type NewTaxRate = {
  code: string
  tax_name: string
  tax_type: string
  rate: string
  country: string
  region: string | null
  jurisdiction: string | null
  is_reverse_charge: boolean
  effective_from: string
}

export async function createTaxRate(
  tx: Tx,
  tenantId: string,
  input: NewTaxRate,
  actorId: string,
): Promise<{ id: string }> {
  const [row] = await tx<{ id: string }[]>`
    INSERT INTO tax_rates (
      tenant_id, code, tax_name, tax_type, rate, country, region, jurisdiction,
      is_reverse_charge, effective_from, created_by, updated_by
    ) VALUES (
      ${tenantId}::uuid, ${input.code}, ${input.tax_name},
      ${input.tax_type}::tax_type, ${input.rate}::numeric, ${input.country},
      ${input.region}, ${input.jurisdiction}, ${input.is_reverse_charge},
      ${input.effective_from}::date, ${actorId}::uuid, ${actorId}::uuid
    )
    RETURNING id
  `
  return row
}

/** Deactivates or reactivates a rate. Rows are never edited otherwise — a mistyped rate is deactivated and replaced, not corrected in place. */
export async function setTaxRateActive(
  tx: Tx,
  id: string,
  isActive: boolean,
  actorId: string,
): Promise<{ id: string } | null> {
  const [row] = await tx<{ id: string }[]>`
    UPDATE tax_rates
       SET is_active = ${isActive}, updated_by = ${actorId}::uuid, updated_at = now()
     WHERE id = ${id}::uuid
    RETURNING id
  `
  return row ?? null
}
