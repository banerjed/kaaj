import type { Tx } from "../db/tenant"

/** customer_contacts — the shared person record, always tied to a customer (company). */

export type CustomerContact = {
  id: string
  customer_id: string
  /** Denormalised for display; see `list`/`listForCustomer`. */
  customer_name: string
  first_name: string
  last_name: string
  email: string | null
  phone: string | null
  title: string | null
  department: string | null
  is_primary: boolean
  is_active: boolean
  created_at: string
}

const SELECT = `
  SELECT cc.id, cc.customer_id, c.customer_name, cc.first_name, cc.last_name,
         cc.email, cc.phone, cc.title, cc.department, cc.is_primary,
         cc.is_active, cc.created_at
    FROM customer_contacts cc
    JOIN customers c ON c.id = cc.customer_id
`

export type ListFilters = {
  search?: string
  customerId?: string
  department?: string
  limit?: number
  offset?: number
}

/**
 * The "shared contact database" view — every contact, across every company.
 * Count comes back on every row (`count(*) OVER()`), not a second query, so
 * the pagination total can't disagree with the page — same pattern as
 * `employees.repo.ts`'s `list()`.
 */
export async function list(
  tx: Tx,
  filters: ListFilters = {},
): Promise<{ rows: CustomerContact[]; total: number }> {
  const {
    search = "",
    customerId = "",
    department = "",
    limit = 20,
    offset = 0,
  } = filters
  // A cast evaluates even on the short-circuited side of an OR — an empty
  // string would 500 on ::uuid (L37) — so an absent filter is NULL, never ''.
  const customerIdOrNull = customerId || null

  const rows = await tx<(CustomerContact & { total: string })[]>`
    SELECT cc.id, cc.customer_id, c.customer_name, cc.first_name, cc.last_name,
           cc.email, cc.phone, cc.title, cc.department, cc.is_primary,
           cc.is_active, cc.created_at, count(*) OVER ()::text AS total
      FROM customer_contacts cc
      JOIN customers c ON c.id = cc.customer_id
     WHERE cc.is_active
       AND (${customerIdOrNull}::uuid IS NULL OR cc.customer_id = ${customerIdOrNull}::uuid)
       AND (${department} = '' OR cc.department = ${department})
       AND (${search} = '' OR (
              cc.first_name ILIKE ${"%" + search + "%"} OR
              cc.last_name  ILIKE ${"%" + search + "%"} OR
              cc.email      ILIKE ${"%" + search + "%"}))
     ORDER BY cc.created_at DESC
     LIMIT ${limit} OFFSET ${offset}
  `
  return {
    rows: rows.map(({ total: _total, ...row }) => row),
    total: rows.length > 0 ? Number(rows[0].total) : 0,
  }
}

/** Distinct departments in use, for the contacts filter bar — small enough to enumerate outright. */
export async function departments(tx: Tx): Promise<string[]> {
  const rows = await tx<{ department: string }[]>`
    SELECT DISTINCT department FROM customer_contacts
     WHERE is_active AND department IS NOT NULL
     ORDER BY department
  `
  return rows.map((r) => r.department)
}

export async function listForCustomer(
  tx: Tx,
  customerId: string,
): Promise<CustomerContact[]> {
  return tx<CustomerContact[]>`
    ${tx.unsafe(SELECT)}
     WHERE cc.customer_id = ${customerId} AND cc.is_active
     ORDER BY cc.is_primary DESC, cc.last_name ASC
  `
}

export async function getById(
  tx: Tx,
  id: string,
): Promise<CustomerContact | null> {
  const rows = await tx<CustomerContact[]>`
    ${tx.unsafe(SELECT)}
     WHERE cc.id = ${id}
  `
  return rows[0] ?? null
}

export type CustomerContactInput = {
  customer_id: string
  first_name: string
  last_name: string
  /** Optional since 20261001100000 — a walk-in client may have only a phone. */
  email: string | null
  phone: string | null
  title: string | null
  department: string | null
  is_primary: boolean
}

export async function create(
  tx: Tx,
  tenantId: string,
  input: CustomerContactInput,
): Promise<{ id: string }> {
  const [row] = await tx<{ id: string }[]>`
    INSERT INTO customer_contacts (
      tenant_id, customer_id, first_name, last_name, email, phone, title,
      department, is_primary
    ) VALUES (
      ${tenantId}, ${input.customer_id}, ${input.first_name}, ${input.last_name},
      ${input.email}, ${input.phone}, ${input.title}, ${input.department},
      ${input.is_primary}
    )
    RETURNING id
  `
  return row
}

export async function update(
  tx: Tx,
  id: string,
  input: CustomerContactInput,
): Promise<void> {
  await tx`
    UPDATE customer_contacts SET
      first_name  = ${input.first_name},
      last_name   = ${input.last_name},
      email       = ${input.email},
      phone       = ${input.phone},
      title       = ${input.title},
      department  = ${input.department},
      is_primary  = ${input.is_primary},
      updated_at  = now()
    WHERE id = ${id}
  `
}

/** Deactivate, and say whether a row actually matched — a no-op must not report success (L68). */
export async function archive(tx: Tx, id: string): Promise<boolean> {
  const rows = await tx<{ id: string }[]>`
    UPDATE customer_contacts
       SET is_active = FALSE, updated_at = now()
     WHERE id = ${id}
   RETURNING id`
  return rows.length > 0
}
