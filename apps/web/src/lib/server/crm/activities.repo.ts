import type { Tx } from "../db/tenant"

export const ACTIVITY_TYPES = ["call", "email", "meeting", "note"] as const
export type ActivityType = (typeof ACTIVITY_TYPES)[number]

export type Activity = {
  id: string
  customer_id: string
  customer_contact_id: string | null
  deal_id: string | null
  activity_type: ActivityType
  subject: string | null
  body: string | null
  occurred_at: string
  created_by: string
  /** Denormalised for display; see the SELECT below. */
  created_by_name: string
  /**
   * The customer's own person on the other side of the conversation, where
   * one was named. NULL for a company-level note — distinct from
   * `created_by_name`, which is always the staff member who recorded it.
   */
  contact_name: string | null
}

const SELECT = `
  SELECT a.id, a.customer_id, a.customer_contact_id, a.deal_id, a.activity_type,
         a.subject, a.body, a.occurred_at, a.created_by,
         e.first_name || ' ' || e.last_name AS created_by_name,
         cc.first_name || ' ' || cc.last_name AS contact_name
    FROM crm_activities a
    JOIN employees e ON e.id = a.created_by
    LEFT JOIN customer_contacts cc ON cc.id = a.customer_contact_id
`

/** `crm_activities` is SCALE_SENSITIVE (grows continuously) — the company page shows the most recent `limit`, not the whole history. */
export async function listForCustomer(
  tx: Tx,
  customerId: string,
  limit = 10,
): Promise<Activity[]> {
  return tx<Activity[]>`
    ${tx.unsafe(SELECT)}
     WHERE a.customer_id = ${customerId}
     ORDER BY a.occurred_at DESC
     LIMIT ${limit}
  `
}

export async function countForCustomer(
  tx: Tx,
  customerId: string,
): Promise<number> {
  const [{ n }] = await tx<{ n: number }[]>`
    SELECT count(*)::int AS n FROM crm_activities WHERE customer_id = ${customerId}
  `
  return n
}

export async function listForContact(
  tx: Tx,
  contactId: string,
): Promise<Activity[]> {
  return tx<Activity[]>`
    ${tx.unsafe(SELECT)}
     WHERE a.customer_contact_id = ${contactId}
     ORDER BY a.occurred_at DESC
  `
}

export async function listForDeal(tx: Tx, dealId: string): Promise<Activity[]> {
  return tx<Activity[]>`
    ${tx.unsafe(SELECT)}
     WHERE a.deal_id = ${dealId}
     ORDER BY a.occurred_at DESC
  `
}

export type ActivityInput = {
  customer_id: string
  customer_contact_id: string | null
  deal_id: string | null
  activity_type: ActivityType
  subject: string | null
  body: string | null
}

/** `occurred_at` is never taken from the form — it defaults to `now()`, the same as when the activity was actually logged. */
export async function create(
  tx: Tx,
  tenantId: string,
  input: ActivityInput,
  createdBy: string,
): Promise<{ id: string }> {
  const [row] = await tx<{ id: string }[]>`
    INSERT INTO crm_activities (
      tenant_id, customer_id, customer_contact_id, deal_id, activity_type,
      subject, body, created_by
    ) VALUES (
      ${tenantId}, ${input.customer_id}, ${input.customer_contact_id},
      ${input.deal_id}, ${input.activity_type}, ${input.subject}, ${input.body},
      ${createdBy}
    )
    RETURNING id
  `
  return row
}
