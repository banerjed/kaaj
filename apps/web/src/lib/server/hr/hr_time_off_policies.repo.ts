import type { Tx } from "../db/tenant"

/**
 * hr_time_off_policies — leave entitlement, per jurisdiction.
 *
 * Policies are scoped to offices by `location_codes`, because statutory leave
 * is national: the fixture carries US-PTO (1.67 days/month, 5 carried over),
 * UK-ANNUAL (2.33, 5) and IN-EARNED (1.75, 30). A single firm-wide policy
 * cannot be lawful in three countries at once.
 */

export type AccrualRules = {
  rate?: number
  unit?: string
  period?: string
  max_carryover?: number
}

export type TimeOffPolicy = {
  id: string
  policy_code: string
  policy_name: string
  time_off_type: string
  accrual_rules: AccrualRules | null
  location_codes: string[] | null
  employment_types: string[] | null
  is_active: boolean
}

export async function list(
  tx: Tx,
  { includeArchived = false }: { includeArchived?: boolean } = {},
): Promise<TimeOffPolicy[]> {
  return tx<TimeOffPolicy[]>`
    SELECT id, policy_code, policy_name, time_off_type, accrual_rules,
           location_codes, employment_types, is_active
      FROM hr_time_off_policies
     WHERE (${includeArchived} OR is_active)
     ORDER BY policy_name
  `
}

/** The policies an office is actually covered by. */
export async function forLocation(
  tx: Tx,
  locationCode: string,
): Promise<TimeOffPolicy[]> {
  return tx<TimeOffPolicy[]>`
    SELECT id, policy_code, policy_name, time_off_type, accrual_rules,
           location_codes, employment_types, is_active
      FROM hr_time_off_policies
     WHERE is_active
       AND (location_codes IS NULL
            OR location_codes @> to_jsonb(${locationCode}::text))
     ORDER BY policy_name
  `
}
