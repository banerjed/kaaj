import type { Tx } from "../db/tenant"

/** firm_benefits_packages — a named bundle of benefits people are enrolled in. */

export type BenefitsPackage = {
  id: string
  name: string
  name_i18n: Record<string, string> | null
  description: string | null
  eligibility_rules: Record<string, unknown> | null
  is_active: boolean
  item_count: number
}

export async function list(
  tx: Tx,
  { includeArchived = false }: { includeArchived?: boolean } = {},
): Promise<BenefitsPackage[]> {
  return tx<BenefitsPackage[]>`
    SELECT p.id, p.name, p.name_i18n, p.description, p.eligibility_rules,
           p.is_active,
           (SELECT count(*)::int FROM firm_benefit_items i
             WHERE i.benefits_package_id = p.id) AS item_count
      FROM firm_benefits_packages p
     WHERE (${includeArchived} OR p.is_active)
     ORDER BY p.name ASC
  `
}

export type PackageInput = {
  name: string
  name_i18n: Record<string, string> | null
  description: string | null
}

export async function create(
  tx: Tx,
  tenantId: string,
  input: PackageInput,
): Promise<void> {
  await tx`
    INSERT INTO firm_benefits_packages
      (tenant_id, name, name_i18n, description, is_active)
    VALUES (${tenantId}, ${input.name}, ${tx.json(input.name_i18n)},
            ${input.description}, TRUE)
  `
}

export async function update(
  tx: Tx,
  id: string,
  input: PackageInput,
): Promise<void> {
  await tx`
    UPDATE firm_benefits_packages SET
      name        = ${input.name},
      name_i18n   = ${tx.json(input.name_i18n)},
      description = ${input.description},
      updated_at  = now()
    WHERE id = ${id}
  `
}

/**
 * Deactivate, and say whether a row actually matched.
 *
 * `Promise<void>` here meant an id that matches nothing — a stale tab, a
 * crafted POST, or a row this actor's policies hide — was indistinguishable
 * from a successful archive, and the page answered "archived". A write that
 * reports success for something it did not do is the failure shape this
 * codebase keeps finding (L68).
 */
export async function archive(tx: Tx, id: string): Promise<boolean> {
  const rows = await tx<{ id: string }[]>`
    UPDATE firm_benefits_packages SET is_active = FALSE, updated_at = now()
     WHERE id = ${id}
   RETURNING id`
  return rows.length > 0
}
