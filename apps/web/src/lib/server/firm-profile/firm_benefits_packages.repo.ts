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

/** Deactivate: hr_benefits_enrollments reference the package historically. */
export async function archive(tx: Tx, id: string): Promise<void> {
  await tx`
    UPDATE firm_benefits_packages SET is_active = FALSE, updated_at = now()
     WHERE id = ${id}
  `
}
