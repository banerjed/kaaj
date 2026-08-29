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

export type LocationInput = {
  name: string
  name_i18n: Record<string, string> | null
  location_code: string
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
  is_headquarters: boolean
  capacity: number | null
}

export async function create(
  tx: Tx,
  tenantId: string,
  input: LocationInput,
): Promise<void> {
  await tx`
    INSERT INTO firm_locations (
      tenant_id, name, name_i18n, location_code, address_line1, address_line2,
      city, state, postal_code, country, timezone, locale, currency,
      phone, email, is_headquarters, capacity, is_active
    ) VALUES (
      ${tenantId}, ${input.name}, ${tx.json(input.name_i18n)},
      ${input.location_code}, ${input.address_line1}, ${input.address_line2},
      ${input.city}, ${input.state}, ${input.postal_code}, ${input.country},
      ${input.timezone}, ${input.locale}, ${input.currency},
      ${input.phone}, ${input.email}, ${input.is_headquarters},
      ${input.capacity}, TRUE
    )
  `
}

export async function update(
  tx: Tx,
  id: string,
  input: LocationInput,
): Promise<void> {
  await tx`
    UPDATE firm_locations SET
      name            = ${input.name},
      name_i18n       = ${tx.json(input.name_i18n)},
      location_code   = ${input.location_code},
      address_line1   = ${input.address_line1},
      address_line2   = ${input.address_line2},
      city            = ${input.city},
      state           = ${input.state},
      postal_code     = ${input.postal_code},
      country         = ${input.country},
      timezone        = ${input.timezone},
      locale          = ${input.locale},
      currency        = ${input.currency},
      phone           = ${input.phone},
      email           = ${input.email},
      is_headquarters = ${input.is_headquarters},
      capacity        = ${input.capacity},
      updated_at      = now()
    WHERE id = ${id}
  `
}

/**
 * Demote every other headquarters. MUST run BEFORE promoting one.
 *
 * The database enforces this already:
 *
 *   CREATE UNIQUE INDEX idx_firm_locations_hq ON firm_locations (tenant_id)
 *     WHERE is_headquarters
 *
 * so a second HQ raises `duplicate key value violates unique constraint`
 * immediately — promoting first and demoting after fails on the promotion.
 * Doing both in one transaction means there is never an instant with two,
 * which a check-then-write from the action could not guarantee anyway.
 */
export async function clearOtherHeadquarters(
  tx: Tx,
  keepId: string | null,
): Promise<void> {
  await tx`
    UPDATE firm_locations
       SET is_headquarters = FALSE, updated_at = now()
     WHERE is_headquarters
       AND (${keepId}::uuid IS NULL OR id <> ${keepId}::uuid)
  `
}

/** Deactivate: employees and holidays reference the office by location_code. */
export async function archive(tx: Tx, id: string): Promise<void> {
  await tx`
    UPDATE firm_locations SET is_active = FALSE, updated_at = now()
     WHERE id = ${id}
  `
}

/** How many active people and holidays would be affected by deactivating. */
export async function dependents(
  tx: Tx,
  locationCode: string,
): Promise<{ employees: number; holidays: number }> {
  const [row] = await tx<{ employees: number; holidays: number }[]>`
    SELECT (SELECT count(*)::int FROM employees
             WHERE location_code = ${locationCode} AND is_active) AS employees,
           (SELECT count(*)::int FROM firm_holidays
             WHERE location_code = ${locationCode}) AS holidays
  `
  return row
}
