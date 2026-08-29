import type { Tx } from "../db/tenant"

/**
 * firm_locations — the firm's offices.
 *
 * One repository per table, at the path docs/api-surface.md § Surface B
 * enumerates. First of nine for the firm profile; the pattern for the rest.
 *
 * No `tenant_id` parameter: a `Tx` can only come from `withTenant`, which has
 * already set the tenant, and RLS applies it. A second source of truth could
 * disagree with the first, and the loser would be the one enforcing isolation.
 */

export type FirmLocation = {
  id: string
  name: string
  name_i18n: Record<string, string> | null
  address_line1: string | null
  address_line2: string | null
  city: string | null
  state: string | null
  postal_code: string | null
  country: string
  timezone: string
  locale: string | null
  currency: string | null
  phone: string | null
  email: string | null
  working_hours: Record<string, unknown> | null
  is_headquarters: boolean
  is_active: boolean
  capacity: number | null
  location_code: string | null
}

/**
 * All locations for the current tenant, headquarters first.
 *
 * `includeArchived` exists because deactivating a location is not deletion:
 * employees and holidays reference it by `location_code`, so rows persist with
 * `is_active = false`.
 */
export async function list(
  tx: Tx,
  { includeArchived = false }: { includeArchived?: boolean } = {},
): Promise<FirmLocation[]> {
  return tx<FirmLocation[]>`
    SELECT id, name, name_i18n,
           address_line1, address_line2, city, state, postal_code, country,
           timezone, locale, currency, phone, email, working_hours,
           is_headquarters, is_active, capacity, location_code
      FROM firm_locations
     WHERE (${includeArchived} OR is_active)
     ORDER BY is_headquarters DESC, name ASC
  `
}

export async function getById(
  tx: Tx,
  id: string,
): Promise<FirmLocation | null> {
  const [row] = await tx<FirmLocation[]>`
    SELECT id, name, name_i18n,
           address_line1, address_line2, city, state, postal_code, country,
           timezone, locale, currency, phone, email, working_hours,
           is_headquarters, is_active, capacity, location_code
      FROM firm_locations
     WHERE id = ${id}
  `
  // Another tenant's row does not exist here rather than being forbidden — a
  // 403 would confirm the id is real.
  return row ?? null
}
