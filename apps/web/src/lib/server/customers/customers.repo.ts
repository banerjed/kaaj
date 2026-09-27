import type { Tx } from "../db/tenant"

/**
 * customers — the shared company/account record (accounting, documents,
 * ticketing and CRM all reference it; there is deliberately no per-module
 * copy). Only the columns CRM's own pages need; accounting's own repo reads
 * this table separately for billing-specific columns.
 */

export const RELATIONSHIP_STATUSES = [
  "prospect",
  "active",
  "inactive",
  "churned",
] as const
export type RelationshipStatus = (typeof RELATIONSHIP_STATUSES)[number]

export const CUSTOMER_TYPES = [
  "individual",
  "small_business",
  "corporate",
  "enterprise",
  "government",
  "nonprofit",
] as const
export type CustomerType = (typeof CUSTOMER_TYPES)[number]

export type Customer = {
  id: string
  customer_name: string
  customer_type: CustomerType | null
  relationship_status: RelationshipStatus
  industry: string | null
  company_size: string | null
  website: string | null
  phone: string | null
  email: string | null
  notes: string | null
  currency: string
  account_manager_id: string | null
  /** Denormalised for display; see `list`. */
  account_manager_name: string | null
  acquisition_source: string | null
  acquisition_date: string | null
  contact_count: number
  created_at: string
}

export async function list(
  tx: Tx,
  {
    relationshipStatus,
    search = "",
    limit,
  }: {
    relationshipStatus?: RelationshipStatus
    /** Name search — backs the contacts page's company-filter autocomplete, which can't enumerate a `<select>` at thousands of companies. */
    search?: string
    limit?: number
  } = {},
): Promise<Customer[]> {
  return tx<Customer[]>`
    SELECT c.id, c.customer_name, c.customer_type, c.relationship_status,
           c.industry, c.company_size, c.website, c.phone, c.email, c.notes,
           c.currency, c.account_manager_id,
           m.first_name || ' ' || m.last_name AS account_manager_name,
           c.acquisition_source, c.acquisition_date, c.created_at,
           (SELECT count(*)::int FROM customer_contacts cc
             WHERE cc.customer_id = c.id AND cc.is_active) AS contact_count
      FROM customers c
      LEFT JOIN employees m ON m.id = c.account_manager_id
     WHERE (${relationshipStatus ?? null}::text IS NULL OR c.relationship_status = ${relationshipStatus ?? null})
       AND (${search} = '' OR c.customer_name ILIKE ${"%" + search + "%"})
     ORDER BY c.customer_name ASC
     ${limit === undefined ? tx`` : tx`LIMIT ${limit}`}
  `
}

export async function getById(tx: Tx, id: string): Promise<Customer | null> {
  const rows = await tx<Customer[]>`
    SELECT c.id, c.customer_name, c.customer_type, c.relationship_status,
           c.industry, c.company_size, c.website, c.phone, c.email, c.notes,
           c.currency, c.account_manager_id,
           m.first_name || ' ' || m.last_name AS account_manager_name,
           c.acquisition_source, c.acquisition_date, c.created_at,
           (SELECT count(*)::int FROM customer_contacts cc
             WHERE cc.customer_id = c.id AND cc.is_active) AS contact_count
      FROM customers c
      LEFT JOIN employees m ON m.id = c.account_manager_id
     WHERE c.id = ${id}
  `
  return rows[0] ?? null
}

export type CustomerInput = {
  customer_name: string
  customer_type: CustomerType | null
  relationship_status: RelationshipStatus
  industry: string | null
  company_size: string | null
  website: string | null
  phone: string | null
  email: string | null
  notes: string | null
  currency: string
  account_manager_id: string | null
  acquisition_source: string | null
}

export async function create(
  tx: Tx,
  tenantId: string,
  input: CustomerInput,
): Promise<{ id: string }> {
  const [row] = await tx<{ id: string }[]>`
    INSERT INTO customers (
      tenant_id, customer_name, customer_type, relationship_status,
      industry, company_size, website, phone, email, notes, currency,
      account_manager_id, acquisition_source, acquisition_date
    ) VALUES (
      ${tenantId}, ${input.customer_name}, ${input.customer_type},
      ${input.relationship_status}, ${input.industry}, ${input.company_size},
      ${input.website}, ${input.phone}, ${input.email}, ${input.notes},
      ${input.currency}, ${input.account_manager_id}, ${input.acquisition_source},
      now()
    )
    RETURNING id
  `
  return row
}

export async function update(
  tx: Tx,
  id: string,
  input: CustomerInput,
): Promise<void> {
  await tx`
    UPDATE customers SET
      customer_name       = ${input.customer_name},
      customer_type        = ${input.customer_type},
      relationship_status  = ${input.relationship_status},
      industry             = ${input.industry},
      company_size         = ${input.company_size},
      website              = ${input.website},
      phone                = ${input.phone},
      email                = ${input.email},
      notes                = ${input.notes},
      currency             = ${input.currency},
      account_manager_id   = ${input.account_manager_id},
      acquisition_source   = ${input.acquisition_source},
      updated_at           = now()
    WHERE id = ${id}
  `
}
