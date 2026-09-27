import type { Tx } from "../db/tenant"

export type Deal = {
  id: string
  customer_id: string
  customer_name: string
  customer_contact_id: string | null
  contact_name: string | null
  stage_id: string
  stage_name: string
  stage_type: "open" | "won" | "lost"
  name: string
  value_amount: string | null
  currency: string | null
  probability_percent: number | null
  expected_close_date: string | null
  owner_id: string
  owner_name: string
  created_at: string
  updated_at: string
}

const SELECT = `
  SELECT d.id, d.customer_id, c.customer_name, d.customer_contact_id,
         cc.first_name || ' ' || cc.last_name AS contact_name,
         d.stage_id, s.name AS stage_name, s.stage_type,
         d.name, d.value_amount, d.currency, d.probability_percent,
         d.expected_close_date, d.owner_id,
         o.first_name || ' ' || o.last_name AS owner_name,
         d.created_at, d.updated_at
    FROM crm_deals d
    JOIN customers c ON c.id = d.customer_id
    JOIN crm_pipeline_stages s ON s.id = d.stage_id
    JOIN employees o ON o.id = d.owner_id
    LEFT JOIN customer_contacts cc ON cc.id = d.customer_contact_id
`

/** Every open and closed deal, board order (stage, then newest first). */
export async function list(tx: Tx): Promise<Deal[]> {
  return tx<Deal[]>`
    ${tx.unsafe(SELECT)}
    ORDER BY s.sort_order ASC, d.created_at DESC
  `
}

export async function listForCustomer(
  tx: Tx,
  customerId: string,
): Promise<Deal[]> {
  return tx<Deal[]>`
    ${tx.unsafe(SELECT)}
     WHERE d.customer_id = ${customerId}
     ORDER BY d.created_at DESC
  `
}

export async function getById(tx: Tx, id: string): Promise<Deal | null> {
  const rows = await tx<Deal[]>`
    ${tx.unsafe(SELECT)}
     WHERE d.id = ${id}
  `
  return rows[0] ?? null
}

export type DealInput = {
  customer_id: string
  customer_contact_id: string | null
  stage_id: string
  name: string
  value_amount: string | null
  currency: string | null
  probability_percent: number | null
  expected_close_date: string | null
  owner_id: string
}

export async function create(
  tx: Tx,
  tenantId: string,
  input: DealInput,
): Promise<{ id: string }> {
  const [row] = await tx<{ id: string }[]>`
    INSERT INTO crm_deals (
      tenant_id, customer_id, customer_contact_id, stage_id, name,
      value_amount, currency, probability_percent, expected_close_date, owner_id
    ) VALUES (
      ${tenantId}, ${input.customer_id}, ${input.customer_contact_id},
      ${input.stage_id}, ${input.name}, ${input.value_amount}, ${input.currency},
      ${input.probability_percent}, ${input.expected_close_date}, ${input.owner_id}
    )
    RETURNING id
  `
  return row
}

export async function update(
  tx: Tx,
  id: string,
  input: DealInput,
): Promise<void> {
  await tx`
    UPDATE crm_deals SET
      customer_contact_id  = ${input.customer_contact_id},
      stage_id             = ${input.stage_id},
      name                 = ${input.name},
      value_amount         = ${input.value_amount},
      currency             = ${input.currency},
      probability_percent  = ${input.probability_percent},
      expected_close_date  = ${input.expected_close_date},
      owner_id             = ${input.owner_id},
      updated_at           = now()
    WHERE id = ${id}
  `
}

/** The board's own single write path — moving a card. Returns false if the deal no longer exists (L68). */
export async function moveStage(
  tx: Tx,
  id: string,
  stageId: string,
): Promise<boolean> {
  const rows = await tx<{ id: string }[]>`
    UPDATE crm_deals
       SET stage_id = ${stageId}, updated_at = now()
     WHERE id = ${id}
   RETURNING id`
  return rows.length > 0
}
