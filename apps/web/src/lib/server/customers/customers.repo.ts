import type { Tx } from "../db/tenant"
import * as contacts from "./customer-contacts.repo"

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

/**
 * A client who is a person, not a business (a salon's client, a tutor's
 * parent contact). `customer_contacts.customer_id` is NOT NULL, so a person
 * is still two rows — a `customers` account and its single contact — but
 * that is an implementation detail: both are written here, together, and the
 * UI offers one form. The same shape Salesforce calls a person account.
 *
 * The account's `customer_name` is DERIVED from the person's name rather
 * than captured twice, so the two cannot drift.
 *
 * "An individual has exactly one contact" is held by construction, not by
 * the schema: this is the only code that creates one, and an individual's
 * page offers no "add contact". Enforcing it in Postgres would mean
 * denormalising `customer_type` into `customer_contacts` to make a partial
 * unique index possible (the composite-key idiom
 * `20260928030000_ticketing_area_integrity.sql` uses), which is a lot of
 * machinery for one caller.
 */
export type IndividualInput = {
  first_name: string
  last_name: string
  /** Optional: a walk-in client may have only a phone. */
  email: string | null
  phone: string | null
  relationship_status: RelationshipStatus
  currency: string
  account_manager_id: string | null
  notes: string | null
}

/**
 * Whether this client is a person account rather than a business.
 *
 * The contact count is part of the test, not a nicety: the one-contact
 * invariant is held by construction (see `IndividualInput`), so a row typed
 * `individual` before this shape existed may have none or several. Such a row
 * gets the company treatment everywhere — a layout that hides contacts it has
 * no other way to show would strand them.
 *
 * Defined once because the page and the action MUST agree. When they did not,
 * the form rendered one shape and the action expected the other, and the row
 * could not be saved at all.
 */
export function isPersonAccount(
  customerType: CustomerType | null,
  contactCount: number,
): boolean {
  return customerType === "individual" && contactCount === 1
}

/** The account name shown everywhere a business's name would be. Handles a mononym. */
export function personName(firstName: string, lastName: string): string {
  return [firstName.trim(), lastName.trim()].filter(Boolean).join(" ")
}

export async function createIndividual(
  tx: Tx,
  tenantId: string,
  input: IndividualInput,
): Promise<{ id: string }> {
  const customer = await create(tx, tenantId, {
    customer_name: personName(input.first_name, input.last_name),
    customer_type: "individual",
    relationship_status: input.relationship_status,
    industry: null,
    company_size: null,
    website: null,
    phone: input.phone,
    email: input.email,
    notes: input.notes,
    currency: input.currency,
    account_manager_id: input.account_manager_id,
    acquisition_source: null,
  })
  await contacts.create(tx, tenantId, {
    customer_id: customer.id,
    first_name: input.first_name,
    last_name: input.last_name,
    email: input.email,
    phone: input.phone,
    title: null,
    department: null,
    is_primary: true,
  })
  return customer
}

/**
 * Keeps the derived account name in step when the person is renamed, and the
 * account's email in step with the contact row's copy of it.
 *
 * The contact is LOOKED UP rather than passed in: an individual has exactly
 * one, so a contact id on the request would be a value to authorize — RLS
 * scopes it to the tenant but not to this client — for no information the
 * database does not already hold.
 */
export async function updateIndividual(
  tx: Tx,
  customerId: string,
  input: IndividualInput,
): Promise<boolean> {
  const current = await getById(tx, customerId)
  if (!current) return false
  const [contact] = await contacts.listForCustomer(tx, customerId)
  if (!contact) return false
  await update(tx, customerId, {
    customer_name: personName(input.first_name, input.last_name),
    customer_type: "individual",
    relationship_status: input.relationship_status,
    industry: null,
    company_size: null,
    website: null,
    phone: input.phone,
    email: input.email,
    notes: input.notes,
    currency: input.currency,
    account_manager_id: input.account_manager_id,
    acquisition_source: current.acquisition_source,
  })
  await contacts.update(tx, contact.id, {
    customer_id: customerId,
    first_name: input.first_name,
    last_name: input.last_name,
    email: input.email,
    phone: input.phone,
    title: null,
    department: null,
    is_primary: true,
  })
  return true
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
