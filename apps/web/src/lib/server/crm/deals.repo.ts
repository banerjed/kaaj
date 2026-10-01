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

/**
 * The board, paged PER COLUMN rather than per page.
 *
 * A Kanban column is its own list, so a single `LIMIT` over the whole board
 * would starve the later stages entirely. One window function ranks within
 * each stage — never a query per stage, which is the N+1 shape
 * `verify-no-loop-queries.mjs` exists to catch on a `SCALE_SENSITIVE` table.
 *
 * `expand` raises the limit for ONE column, so "show more" costs the same
 * single query.
 */
export async function listForBoard(
  tx: Tx,
  {
    perStage,
    expandStageId = null,
    expandLimit = perStage,
  }: { perStage: number; expandStageId?: string | null; expandLimit?: number },
): Promise<Deal[]> {
  // The CTE ranks over the base table alone — no joins, and no extra column
  // on the rows that reach the page, so `Deal` stays exactly what comes back.
  // A cast evaluates even on the short-circuited side of an AND, so an absent
  // stage is NULL and never '' (L37).
  return tx<Deal[]>`
    WITH ranked AS (
      SELECT id, stage_id,
             row_number() OVER (
               PARTITION BY stage_id ORDER BY created_at DESC
             ) AS rn
        FROM crm_deals
    )
    ${tx.unsafe(SELECT)}
     WHERE d.id IN (
             SELECT id FROM ranked
              WHERE rn <= CASE
                            WHEN ${expandStageId}::uuid IS NOT NULL
                             AND stage_id = ${expandStageId}::uuid
                            THEN ${expandLimit}::int
                            ELSE ${perStage}::int
                          END
           )
     ORDER BY s.sort_order ASC, d.created_at DESC
  `
}

/**
 * What each column actually holds, counted in the database.
 *
 * The board renders a page of each stage, so counting the LOADED cards would
 * report the page size as the pipeline — a wrong number that looks exactly
 * like a right one.
 *
 * Totals are per CURRENCY. A figure summing USD and GBP deals is not a
 * number anyone can act on, and money is never converted for display
 * (BR-FP-003). The sum happens in SQL: `NUMERIC` is exact there, and adding
 * two money strings in JavaScript is silent concatenation or a float64.
 */
export type StageSummary = {
  stage_id: string
  deal_count: number
  totals: { currency: string; amount: string }[]
}

export async function stageSummary(tx: Tx): Promise<StageSummary[]> {
  const counts = await tx<{ stage_id: string; deal_count: number }[]>`
    SELECT stage_id, count(*)::int AS deal_count
      FROM crm_deals
     GROUP BY stage_id
  `
  const totals = await tx<
    { stage_id: string; currency: string; amount: string }[]
  >`
    SELECT stage_id, currency, sum(value_amount)::text AS amount
      FROM crm_deals
     WHERE value_amount IS NOT NULL AND currency IS NOT NULL
     GROUP BY stage_id, currency
     ORDER BY currency
  `
  return counts.map((c) => ({
    stage_id: c.stage_id,
    deal_count: c.deal_count,
    totals: totals
      .filter((t) => t.stage_id === c.stage_id)
      .map(({ currency, amount }) => ({ currency, amount })),
  }))
}

export async function listForCustomer(
  tx: Tx,
  customerId: string,
  limit = 10,
): Promise<Deal[]> {
  return tx<Deal[]>`
    ${tx.unsafe(SELECT)}
     WHERE d.customer_id = ${customerId}
     ORDER BY d.created_at DESC
     LIMIT ${limit}
  `
}

export async function countForCustomer(
  tx: Tx,
  customerId: string,
): Promise<number> {
  const [row] = await tx<{ n: number }[]>`
    SELECT count(*)::int AS n FROM crm_deals WHERE customer_id = ${customerId}
  `
  return row?.n ?? 0
}

/**
 * A client's open pipeline, per currency. Summed in SQL because `NUMERIC` is
 * exact there, and split by currency because a figure adding USD to GBP is
 * not a number anyone can act on — money is never converted for display
 * (BR-FP-003).
 */
export async function totalsForCustomer(
  tx: Tx,
  customerId: string,
): Promise<{ currency: string; amount: string }[]> {
  return tx<{ currency: string; amount: string }[]>`
    SELECT currency, sum(value_amount)::text AS amount
      FROM crm_deals
     WHERE customer_id = ${customerId}
       AND value_amount IS NOT NULL AND currency IS NOT NULL
     GROUP BY currency
     ORDER BY currency
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
