import type { Tx } from "../db/tenant"

/**
 * Invoices and the general ledger — module-accounting.md.
 *
 * **Every figure is a string and every sum happens in SQL.** These are
 * NUMERIC(15,2); adding them in JavaScript is the float64 round trip, and once
 * they are correctly typed as strings it becomes silent concatenation with no
 * type error. Nothing here is abbreviated on the way out either: approxMoney
 * belongs on a dashboard, never on an invoice line or a ledger row, because
 * those are reconciled against a bank statement.
 *
 * The reconciliation identities are enforced by the schema (four CHECK
 * constraints) and asserted by the harness (ACC-balance-per-entry,
 * ACC-invoice-lines, ACC-invoice-amounts and others). This repository computes
 * them AGAIN on read, and returns the computed value beside the stored one, so
 * a document whose stored total stopped matching its lines is visible on the
 * page rather than believed — the same treatment as payroll run headers and
 * project task counts.
 */

export type InvoiceRow = {
  id: string
  invoice_number: string
  customer_name: string | null
  invoice_date: string
  due_date: string | null
  currency: string
  subtotal: string | null
  tax_total: string | null
  total: string | null
  amount_paid: string | null
  amount_due: string | null
  status: string | null
  /** Summed from invoice_lines, so a stored subtotal that drifted is visible. */
  line_subtotal: string | null
  line_count: number
  /**
   * Past its due date, still owing, and ISSUED.
   *
   * A draft has not been sent to anyone and a void invoice is not owed, so
   * neither can be late — the page flagged a draft as overdue until this said
   * so. Decided against the DATABASE's date, not the viewer's.
   */
  is_overdue: boolean
}

const INVOICE_SELECT = `
  SELECT i.id, i.invoice_number,
         c.customer_name,
         to_char(i.invoice_date,'YYYY-MM-DD') AS invoice_date,
         to_char(i.due_date,'YYYY-MM-DD')     AS due_date,
         i.currency,
         i.subtotal::text    AS subtotal,
         i.tax_total::text   AS tax_total,
         i.total::text       AS total,
         i.amount_paid::text AS amount_paid,
         i.amount_due::text  AS amount_due,
         i.status,
         (SELECT sum(l.amount)::text FROM invoice_lines l WHERE l.invoice_id = i.id)
           AS line_subtotal,
         (SELECT count(*)::int FROM invoice_lines l WHERE l.invoice_id = i.id)
           AS line_count,
         (i.due_date < CURRENT_DATE
            AND i.amount_due > 0
            AND i.status NOT IN ('draft', 'void')) AS is_overdue
    FROM invoices i
    LEFT JOIN customers c ON c.id = i.customer_id
`

export async function listInvoices(
  tx: Tx,
  filters: { status?: string; overdueOnly?: boolean } = {},
): Promise<InvoiceRow[]> {
  const { status = "", overdueOnly = false } = filters
  return tx<InvoiceRow[]>`
    ${tx.unsafe(INVOICE_SELECT)}
     WHERE (${status} = '' OR i.status = ${status})
       AND (${overdueOnly} = FALSE
            OR (i.due_date < CURRENT_DATE
                AND i.amount_due > 0
                AND i.status NOT IN ('draft', 'void')))
     ORDER BY i.invoice_date DESC, i.invoice_number DESC
  `
}

export async function invoiceById(
  tx: Tx,
  id: string,
): Promise<InvoiceRow | null> {
  const [row] = await tx<InvoiceRow[]>`
    ${tx.unsafe(INVOICE_SELECT)} WHERE i.id = ${id}::uuid
  `
  return row ?? null
}

export type InvoiceLine = {
  id: string
  line_number: number | null
  description: string | null
  quantity: string | null
  unit_price: string | null
  amount: string | null
  tax_amount: string | null
  account_name: string | null
}

export async function invoiceLines(
  tx: Tx,
  invoiceId: string,
): Promise<InvoiceLine[]> {
  return tx<InvoiceLine[]>`
    SELECT l.id, l.line_number, l.description,
           l.quantity::text   AS quantity,
           l.unit_price::text AS unit_price,
           l.amount::text     AS amount,
           l.tax_amount::text AS tax_amount,
           a.account_name
      FROM invoice_lines l
      LEFT JOIN chart_of_accounts a ON a.id = l.revenue_account_id
     WHERE l.invoice_id = ${invoiceId}::uuid
     ORDER BY l.line_number NULLS LAST
  `
}

/** What has been received against one invoice, newest first. */
export async function paymentsFor(
  tx: Tx,
  invoiceId: string,
): Promise<
  {
    id: string
    payment_number: string | null
    payment_date: string | null
    amount: string | null
    currency: string | null
    method: string | null
  }[]
> {
  return tx`
    SELECT p.id, p.payment_number,
           to_char(p.payment_date,'YYYY-MM-DD') AS payment_date,
           al.amount::text AS amount,
           p.currency,
           p.payment_method AS method
      FROM payment_allocations al
      JOIN payments p ON p.id = al.payment_id
     WHERE al.invoice_id = ${invoiceId}::uuid
     ORDER BY p.payment_date DESC
  ` as never
}

export type LedgerEntry = {
  id: string
  entry_number: string
  entry_date: string
  description: string | null
  reference: string | null
  status: string | null
  source_type: string | null
  is_adjusting: boolean | null
  debits: string | null
  credits: string | null
  /** TRUE when this entry's debits equal its credits, computed on read. */
  balances: boolean
  line_count: number
}

const LEDGER_SELECT = `
  SELECT je.id, je.entry_number,
         to_char(je.entry_date,'YYYY-MM-DD') AS entry_date,
         je.description, je.reference, je.status, je.source_type,
         je.is_adjusting,
         COALESCE(t.debits, 0)::text  AS debits,
         COALESCE(t.credits, 0)::text AS credits,
         COALESCE(t.debits, 0) = COALESCE(t.credits, 0) AS balances,
         COALESCE(t.n, 0) AS line_count
    FROM journal_entries je
    LEFT JOIN LATERAL (
      SELECT sum(l.debit_amount)  AS debits,
             sum(l.credit_amount) AS credits,
             count(*)::int        AS n
        FROM journal_entry_lines l
       WHERE l.entry_id = je.id
    ) t ON TRUE
`

export async function ledger(
  tx: Tx,
  filters: { from?: string; to?: string; status?: string } = {},
): Promise<LedgerEntry[]> {
  // NULL rather than '' for a cast parameter: SQL does not short-circuit, so
  // an empty string still reaches ::date and postgres.js raises
  // `RangeError: Invalid time value` in the driver before the query is sent
  // (L37).
  const from = filters.from || null
  const to = filters.to || null
  const status = filters.status ?? ""
  return tx<LedgerEntry[]>`
    ${tx.unsafe(LEDGER_SELECT)}
     WHERE (${from}::date IS NULL OR je.entry_date >= ${from}::date)
       AND (${to}::date   IS NULL OR je.entry_date <= ${to}::date)
       AND (${status} = '' OR je.status = ${status})
     ORDER BY je.entry_date DESC, je.entry_number DESC
  `
}

/**
 * Entries whose debits do not equal their credits.
 *
 * The schema forbids a line that is neither a debit nor a credit, and the
 * harness asserts every entry balances — but neither runs at request time
 * against a database someone may have written to another way. An unbalanced
 * entry means the books do not add up, which is the one thing a ledger exists
 * to make impossible to miss.
 */
export async function unbalanced(
  tx: Tx,
): Promise<{ entry_number: string; debits: string; credits: string }[]> {
  return tx`
    SELECT je.entry_number,
           COALESCE(sum(l.debit_amount), 0)::text  AS debits,
           COALESCE(sum(l.credit_amount), 0)::text AS credits
      FROM journal_entries je
      LEFT JOIN journal_entry_lines l ON l.entry_id = je.id
     GROUP BY je.id, je.entry_number
    HAVING COALESCE(sum(l.debit_amount), 0) <> COALESCE(sum(l.credit_amount), 0)
     ORDER BY je.entry_number
  ` as never
}

export type LedgerLine = {
  id: string
  line_number: number | null
  account_code: string | null
  account_name: string | null
  description: string | null
  debit_amount: string | null
  credit_amount: string | null
  currency: string | null
}

export async function ledgerLines(
  tx: Tx,
  entryId: string,
): Promise<LedgerLine[]> {
  return tx<LedgerLine[]>`
    SELECT l.id, l.line_number,
           a.account_code, a.account_name,
           l.description,
           l.debit_amount::text  AS debit_amount,
           l.credit_amount::text AS credit_amount,
           l.currency
      FROM journal_entry_lines l
      LEFT JOIN chart_of_accounts a ON a.id = l.account_id
     WHERE l.entry_id = ${entryId}::uuid
     ORDER BY l.line_number NULLS LAST
  `
}

/**
 * Every line for a set of entries, in ONE query.
 *
 * The ledger page expands entries in place, so fetching lines per row would be
 * the N+1 doc 03 forbids — eight entries becoming nine round trips, and a
 * hundred becoming a hundred and one.
 */
export async function ledgerLinesForEntries(
  tx: Tx,
  entryIds: string[],
): Promise<Record<string, LedgerLine[]>> {
  if (entryIds.length === 0) return {}
  const rows = await tx<(LedgerLine & { entry_id: string })[]>`
    SELECT l.entry_id::text AS entry_id,
           l.id, l.line_number,
           a.account_code, a.account_name,
           l.description,
           l.debit_amount::text  AS debit_amount,
           l.credit_amount::text AS credit_amount,
           l.currency
      FROM journal_entry_lines l
      LEFT JOIN chart_of_accounts a ON a.id = l.account_id
     WHERE l.entry_id = ANY(${entryIds}::uuid[])
     ORDER BY l.entry_id, l.line_number NULLS LAST
  `
  const out: Record<string, LedgerLine[]> = {}
  for (const r of rows) {
    const { entry_id, ...line } = r
    ;(out[entry_id] ??= []).push(line)
  }
  return out
}
