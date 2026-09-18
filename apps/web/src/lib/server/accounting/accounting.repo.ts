import type { Tx } from "../db/tenant"
import { compareDecimal } from "$lib/decimal"
import { rateAsOf } from "./exchange_rates.repo"
import { log } from "$lib/server/log"

/**
 * Invoices and the general ledger. Money stays a string and sums happen in SQL.
 * Reconciliation totals are recomputed on read, not trusted from storage, so a
 * drifted stored total is visible rather than believed.
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
  /** Credit memos — see `invoice_credits`. Never folded into `amount_paid`. */
  amount_credited: string | null
  amount_due: string | null
  status: string | null
  /** Summed from invoice_lines, so a stored subtotal that drifted is visible. */
  line_subtotal: string | null
  line_count: number
  /** Past due, still owing, and not draft/void — decided against the DB's date. */
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
         i.amount_paid::text     AS amount_paid,
         i.amount_credited::text AS amount_credited,
         i.amount_due::text      AS amount_due,
         i.status,
         -- Net of discount, same as recomputeInvoiceTotals's own subtotal —
         -- otherwise every discounted invoice trips the "≠ lines" drift
         -- flag below by design, not by an actual stale total.
         (SELECT sum(l.amount) - sum(l.discount_amount)
            FROM invoice_lines l WHERE l.invoice_id = i.id)::text
           AS line_subtotal,
         (SELECT count(*)::int FROM invoice_lines l WHERE l.invoice_id = i.id)
           AS line_count,
         (i.due_date < CURRENT_DATE
            AND i.amount_due > 0
            AND i.status NOT IN ('draft', 'void', 'credited', 'written_off')) AS is_overdue
    FROM invoices i
    LEFT JOIN customers c ON c.id = i.customer_id
`

/**
 * Same columns as `INVOICE_SELECT`, minus `line_subtotal`/`line_count` — those
 * are a per-row correlated subquery over `invoice_lines`, fine for
 * `invoiceById`'s single row but a full scan of that table PER ROW on a
 * paginated list as it grows. `listInvoices` fetches this instead and merges
 * in `invoiceLineTotalsFor`'s one batched aggregate query, the same
 * "one query for the page, not one per row" shape as `ledgerLinesForEntries`.
 */
const INVOICE_LIST_SELECT = `
  SELECT i.id, i.invoice_number,
         c.customer_name,
         to_char(i.invoice_date,'YYYY-MM-DD') AS invoice_date,
         to_char(i.due_date,'YYYY-MM-DD')     AS due_date,
         i.currency,
         i.subtotal::text    AS subtotal,
         i.tax_total::text   AS tax_total,
         i.total::text       AS total,
         i.amount_paid::text     AS amount_paid,
         i.amount_credited::text AS amount_credited,
         i.amount_due::text      AS amount_due,
         i.status,
         (i.due_date < CURRENT_DATE
            AND i.amount_due > 0
            AND i.status NOT IN ('draft', 'void', 'credited', 'written_off')) AS is_overdue
    FROM invoices i
    LEFT JOIN customers c ON c.id = i.customer_id
`

/** `line_subtotal`/`line_count` for a set of invoices, in one query — see `INVOICE_LIST_SELECT`. */
async function invoiceLineTotalsFor(
  tx: Tx,
  invoiceIds: string[],
): Promise<Record<string, { line_subtotal: string; line_count: number }>> {
  if (invoiceIds.length === 0) return {}
  const rows = await tx<
    { invoice_id: string; line_subtotal: string; line_count: number }[]
  >`
    SELECT invoice_id::text AS invoice_id,
           (sum(amount) - sum(discount_amount))::text AS line_subtotal,
           count(*)::int AS line_count
      FROM invoice_lines
     WHERE invoice_id = ANY(${invoiceIds}::uuid[])
     GROUP BY invoice_id
  `
  const out: Record<string, { line_subtotal: string; line_count: number }> = {}
  for (const { invoice_id, ...totals } of rows) out[invoice_id] = totals
  return out
}

export async function listInvoices(
  tx: Tx,
  filters: {
    status?: string
    overdueOnly?: boolean
    limit?: number
    offset?: number
  } = {},
): Promise<InvoiceRow[]> {
  const { status = "", overdueOnly = false, limit = null, offset = 0 } = filters
  const rows = await tx<Omit<InvoiceRow, "line_subtotal" | "line_count">[]>`
    ${tx.unsafe(INVOICE_LIST_SELECT)}
     WHERE (${status} = '' OR i.status = ${status})
       AND (${overdueOnly} = FALSE
            OR (i.due_date < CURRENT_DATE
                AND i.amount_due > 0
                AND i.status NOT IN ('draft', 'void', 'credited', 'written_off')))
     ORDER BY i.invoice_date DESC, i.invoice_number DESC
     ${limit === null ? tx`` : tx`LIMIT ${limit} OFFSET ${offset}`}
  `
  const totals = await invoiceLineTotalsFor(
    tx,
    rows.map((r) => r.id),
  )
  return rows.map((r) => ({
    ...r,
    line_subtotal: totals[r.id]?.line_subtotal ?? null,
    line_count: totals[r.id]?.line_count ?? 0,
  }))
}

/** The total matching a filter set — same predicates as `listInvoices`, for the list page's pagination controls. */
export async function countInvoices(
  tx: Tx,
  filters: { status?: string; overdueOnly?: boolean } = {},
): Promise<number> {
  const { status = "", overdueOnly = false } = filters
  const [{ n }] = await tx<{ n: number }[]>`
    SELECT count(*)::int AS n
      FROM invoices i
     WHERE (${status} = '' OR i.status = ${status})
       AND (${overdueOnly} = FALSE
            OR (i.due_date < CURRENT_DATE
                AND i.amount_due > 0
                AND i.status NOT IN ('draft', 'void', 'credited', 'written_off')))
  `
  return n
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

/**
 * A real invoice's line count is bounded by what a person can type on one
 * document, not by tenure — unlike the table's own SCALE_SENSITIVE
 * classification, which is about `invoice_lines` as a whole across every
 * invoice. A cap here is defense against a single row with far more lines
 * than that (a bad import, a bug elsewhere), not a real business limit — the
 * page reports the true count so a page that trips it looks truncated, not
 * wrong.
 */
const DOCUMENT_CHILD_CAP = 500

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
     LIMIT ${DOCUMENT_CHILD_CAP}
  `
}

/** The true count behind `invoiceLines`'s capped list, so a truncated page can say so. */
export async function countInvoiceLines(
  tx: Tx,
  invoiceId: string,
): Promise<number> {
  const [{ n }] = await tx<{ n: number }[]>`
    SELECT count(*)::int AS n FROM invoice_lines WHERE invoice_id = ${invoiceId}::uuid
  `
  return n
}

/**
 * One payment as it applies to a single invoice or bill — shared by
 * `paymentsFor()` here and `paymentsForBill()` in `payables.repo.ts`,
 * since a payment_allocations row joined to its payment is the same shape
 * whichever side of the ledger it settles.
 */
export type PaymentForDocument = {
  id: string
  payment_number: string | null
  payment_date: string | null
  amount: string | null
  currency: string | null
  method: string | null
}

/** What has been received against one invoice, newest first. */
export async function paymentsFor(
  tx: Tx,
  invoiceId: string,
): Promise<PaymentForDocument[]> {
  return tx<PaymentForDocument[]>`
    SELECT p.id, p.payment_number,
           to_char(p.payment_date,'YYYY-MM-DD') AS payment_date,
           al.amount::text AS amount,
           p.currency,
           p.payment_method AS method
      FROM payment_allocations al
      JOIN payments p ON p.id = al.payment_id
     WHERE al.invoice_id = ${invoiceId}::uuid
     ORDER BY p.payment_date DESC
     LIMIT ${DOCUMENT_CHILD_CAP}
  `
}

/** The true count behind `paymentsFor`'s capped list, so a truncated page can say so. */
export async function countPaymentsFor(
  tx: Tx,
  invoiceId: string,
): Promise<number> {
  const [{ n }] = await tx<{ n: number }[]>`
    SELECT count(*)::int AS n
      FROM payment_allocations al
      JOIN payments p ON p.id = al.payment_id
     WHERE al.invoice_id = ${invoiceId}::uuid
  `
  return n
}

/** Credit memos issued against one invoice, newest first. */
export async function creditsFor(
  tx: Tx,
  invoiceId: string,
): Promise<
  {
    id: string
    credit_number: string
    credit_type: string
    created_at: string
    amount: string
    currency: string
    reason: string
  }[]
> {
  return tx<
    {
      id: string
      credit_number: string
      credit_type: string
      created_at: string
      amount: string
      currency: string
      reason: string
    }[]
  >`
    SELECT id, credit_number, credit_type,
           to_char(created_at, 'YYYY-MM-DD') AS created_at,
           amount::text AS amount,
           currency, reason
      FROM invoice_credits
     WHERE invoice_id = ${invoiceId}::uuid
     ORDER BY created_at DESC
     LIMIT ${DOCUMENT_CHILD_CAP}
  `
}

/** The true count behind `creditsFor`'s capped list, so a truncated page can say so. */
export async function countCreditsFor(
  tx: Tx,
  invoiceId: string,
): Promise<number> {
  const [{ n }] = await tx<{ n: number }[]>`
    SELECT count(*)::int AS n FROM invoice_credits WHERE invoice_id = ${invoiceId}::uuid
  `
  return n
}

export type ArAgingRow = {
  customer_id: string
  customer_name: string
  /** An invoice's own currency, never converted — a customer with invoices
   *  in two currencies is two rows here, not one summed incorrectly. */
  currency: string
  current: string
  days_1_30: string
  days_31_60: string
  days_61_90: string
  days_90_plus: string
  total: string
}

/**
 * Open receivables bucketed by days past due, as of a date. Unlike
 * `balanceSheet()`'s `asOf` — where a blank date means no upper bound —
 * aging needs a real reference date to bucket against, so a blank date
 * defaults to the database's own `CURRENT_DATE` rather than passing NULL
 * through.
 */
export async function arAging(
  tx: Tx,
  filters: { asOf?: string } = {},
): Promise<ArAgingRow[]> {
  const asOf = filters.asOf || null
  return tx<ArAgingRow[]>`
    WITH open_invoices AS (
      SELECT i.customer_id, i.currency, i.amount_due,
             (COALESCE(${asOf}::date, CURRENT_DATE) - i.due_date) AS days_overdue
        FROM invoices i
       -- Narrower than INVOICE_SELECT's is_overdue, which also excludes
       -- 'credited'/'written_off': amount_due > 0 already excludes a
       -- settled invoice regardless of status, so this list only needs the
       -- two statuses (draft, void) that can carry a nonzero amount_due
       -- while genuinely not being owed yet/anymore. customerBalances()
       -- and openInvoicesForCustomer() repeat this same "open invoice"
       -- shape below.
       WHERE i.amount_due > 0
         AND i.status NOT IN ('draft', 'void')
    )
    SELECT c.id AS customer_id, c.customer_name, i.currency,
           COALESCE(sum(i.amount_due) FILTER (WHERE i.days_overdue <= 0), 0.00)::text
             AS current,
           COALESCE(sum(i.amount_due) FILTER (WHERE i.days_overdue BETWEEN 1 AND 30), 0.00)::text
             AS days_1_30,
           COALESCE(sum(i.amount_due) FILTER (WHERE i.days_overdue BETWEEN 31 AND 60), 0.00)::text
             AS days_31_60,
           COALESCE(sum(i.amount_due) FILTER (WHERE i.days_overdue BETWEEN 61 AND 90), 0.00)::text
             AS days_61_90,
           COALESCE(sum(i.amount_due) FILTER (WHERE i.days_overdue > 90), 0.00)::text
             AS days_90_plus,
           sum(i.amount_due)::text AS total
      FROM open_invoices i
      JOIN customers c ON c.id = i.customer_id
     GROUP BY c.id, c.customer_name, i.currency
     ORDER BY c.customer_name, i.currency
  `
}

export type CustomerBalanceRow = {
  customer_id: string
  customer_name: string
  currency: string
  /** The customer's own credit limit, in their own currency — never converted. */
  credit_limit: string | null
  invoice_count: number
  total_invoiced: string
  total_paid: string
  /** Credit memos — see `invoice_credits`. Broken out so `invoiced - paid -
   *  credited = due` reconciles visibly; folding it into `total_paid` would
   *  overload "paid" with a non-cash reduction. */
  total_credited: string
  total_due: string
}

/**
 * Current open balance per customer — a live figure for credit-risk review,
 * not a point-in-time report like `arAging()`. There is no `asOf`: unlike
 * bucketing by days past due, "how much does this customer owe right now"
 * has no reference date to bucket against, so it always reads the invoices'
 * live `amount_due`.
 */
export async function customerBalances(tx: Tx): Promise<CustomerBalanceRow[]> {
  return tx<CustomerBalanceRow[]>`
    SELECT c.id AS customer_id, c.customer_name, i.currency,
           c.credit_limit::text AS credit_limit,
           count(*)::int AS invoice_count,
           sum(i.total)::text           AS total_invoiced,
           sum(i.amount_paid)::text     AS total_paid,
           sum(i.amount_credited)::text AS total_credited,
           sum(i.amount_due)::text      AS total_due
      FROM invoices i
      JOIN customers c ON c.id = i.customer_id
     WHERE i.amount_due > 0
       AND i.status NOT IN ('draft', 'void')
     GROUP BY c.id, c.customer_name, i.currency, c.credit_limit
     ORDER BY c.customer_name, i.currency
  `
}

export type OpenInvoiceForAllocation = {
  id: string
  invoice_number: string
  currency: string
  due_date: string | null
  amount_due: string
}

/** A customer's open invoices, for allocating a lockbox payment across them. */
export async function openInvoicesForCustomer(
  tx: Tx,
  customerId: string,
): Promise<OpenInvoiceForAllocation[]> {
  return tx<OpenInvoiceForAllocation[]>`
    SELECT id, invoice_number, currency,
           to_char(due_date, 'YYYY-MM-DD') AS due_date,
           amount_due::text AS amount_due
      FROM invoices
     WHERE customer_id = ${customerId}::uuid
       AND amount_due > 0
       AND status NOT IN ('draft', 'void')
     ORDER BY due_date ASC
  `
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
  filters: {
    from?: string
    to?: string
    status?: string
    limit?: number
    offset?: number
  } = {},
): Promise<LedgerEntry[]> {
  // NULL rather than '' for a cast parameter: SQL does not short-circuit, so
  // an empty string still reaches ::date and postgres.js raises
  // `RangeError: Invalid time value` in the driver before the query is sent
  // (L37).
  const from = filters.from || null
  const to = filters.to || null
  const status = filters.status ?? ""
  const limit = filters.limit ?? null
  const offset = filters.offset ?? 0
  return tx<LedgerEntry[]>`
    ${tx.unsafe(LEDGER_SELECT)}
     WHERE (${from}::date IS NULL OR je.entry_date >= ${from}::date)
       AND (${to}::date   IS NULL OR je.entry_date <= ${to}::date)
       AND (${status} = '' OR je.status = ${status})
     ORDER BY je.entry_date DESC, je.entry_number DESC
     ${limit === null ? tx`` : tx`LIMIT ${limit} OFFSET ${offset}`}
  `
}

/** The total matching a filter set — same predicates as `ledger`, for the list page's pagination controls. */
export async function countLedger(
  tx: Tx,
  filters: { from?: string; to?: string; status?: string } = {},
): Promise<number> {
  const from = filters.from || null
  const to = filters.to || null
  const status = filters.status ?? ""
  const [{ n }] = await tx<{ n: number }[]>`
    SELECT count(*)::int AS n
      FROM journal_entries je
     WHERE (${from}::date IS NULL OR je.entry_date >= ${from}::date)
       AND (${to}::date   IS NULL OR je.entry_date <= ${to}::date)
       AND (${status} = '' OR je.status = ${status})
  `
  return n
}

/** Entries whose debits don't equal their credits — checked at request time, not just by the schema/harness. */
export async function unbalanced(
  tx: Tx,
): Promise<{ entry_number: string; debits: string; credits: string }[]> {
  return tx<{ entry_number: string; debits: string; credits: string }[]>`
    SELECT je.entry_number,
           COALESCE(sum(l.debit_amount), 0)::text  AS debits,
           COALESCE(sum(l.credit_amount), 0)::text AS credits
      FROM journal_entries je
      LEFT JOIN journal_entry_lines l ON l.entry_id = je.id
     GROUP BY je.id, je.entry_number
    HAVING COALESCE(sum(l.debit_amount), 0) <> COALESCE(sum(l.credit_amount), 0)
     ORDER BY je.entry_number
  `
}

export type TrialBalanceRow = {
  account_code: string
  account_name: string
  account_type: string
  debits: string
  credits: string
}

/**
 * Every account with activity, summed in the tenant's BASE currency
 * (`base_debit_amount`/`base_credit_amount`) — a raw sum of
 * `debit_amount`/`credit_amount` would silently mix USD, EUR and GBP
 * figures from entries posted in different original currencies. Only
 * `posted` entries count; nothing today produces another status, but a
 * future draft-JE feature must not appear on a trial balance.
 */
export async function trialBalance(
  tx: Tx,
  filters: { asOf?: string } = {},
): Promise<TrialBalanceRow[]> {
  const asOf = filters.asOf || null
  return tx<TrialBalanceRow[]>`
    SELECT a.account_code, a.account_name, a.account_type::text AS account_type,
           COALESCE(sum(CASE WHEN je.id IS NOT NULL THEN l.base_debit_amount  END), 0)::text AS debits,
           COALESCE(sum(CASE WHEN je.id IS NOT NULL THEN l.base_credit_amount END), 0)::text AS credits
      FROM chart_of_accounts a
      LEFT JOIN journal_entry_lines l ON l.account_id = a.id
      LEFT JOIN journal_entries je
             ON je.id = l.entry_id
            AND je.status = 'posted'
            AND (${asOf}::date IS NULL OR je.entry_date <= ${asOf}::date)
     WHERE a.is_active
     GROUP BY a.id, a.account_code, a.account_name, a.account_type
    HAVING sum(CASE WHEN je.id IS NOT NULL THEN l.base_debit_amount  END) IS NOT NULL
        OR sum(CASE WHEN je.id IS NOT NULL THEN l.base_credit_amount END) IS NOT NULL
     ORDER BY a.account_code
  `
}

/**
 * A second aggregation path over the same rows `trialBalance` groups by
 * account — computed independently rather than by summing that report's own
 * rows, so a mistake in one is unlikely to be mirrored in the other.
 */
export async function trialBalanceTotals(
  tx: Tx,
  filters: { asOf?: string } = {},
): Promise<{ debits: string; credits: string; balances: boolean }> {
  const asOf = filters.asOf || null
  const [row] = await tx<
    { debits: string; credits: string; balances: boolean }[]
  >`
    SELECT COALESCE(sum(l.base_debit_amount), 0)::text  AS debits,
           COALESCE(sum(l.base_credit_amount), 0)::text AS credits,
           COALESCE(sum(l.base_debit_amount), 0) = COALESCE(sum(l.base_credit_amount), 0)
             AS balances
      FROM journal_entry_lines l
      JOIN journal_entries je ON je.id = l.entry_id AND je.status = 'posted'
     WHERE (${asOf}::date IS NULL OR je.entry_date <= ${asOf}::date)
  `
  return row
}

export type TrialBalanceComparisonRow = {
  account_code: string
  account_name: string
  account_type: string
  debits: string
  credits: string
  compare_debits: string
  compare_credits: string
}

/**
 * The trial balance evaluated as of TWO independent dates, side by side —
 * not `profitAndLossComparison()`'s "current window vs. a computed prior
 * window": a trial balance is cumulative, so there is no period to shift
 * back by a year or by its own length, only a second point in time the
 * caller names directly (a real comparative-financial-statement shape).
 * Each date's own `sum(...) FILTER (WHERE ...)` is computed once and reused
 * by both this row-level report and `trialBalanceComparisonTotals()`'s
 * independent aggregation, the same "compute once, don't reduce the other
 * report's rows" discipline as every other totals function in this file.
 */
export async function trialBalanceComparison(
  tx: Tx,
  filters: { asOf: string; compareAsOf: string },
): Promise<TrialBalanceComparisonRow[]> {
  const { asOf, compareAsOf } = filters
  return tx<TrialBalanceComparisonRow[]>`
    SELECT a.account_code, a.account_name, a.account_type::text AS account_type,
           COALESCE(sum(l.base_debit_amount)
                     FILTER (WHERE je.entry_date <= ${asOf}::date), 0)::text
             AS debits,
           COALESCE(sum(l.base_credit_amount)
                     FILTER (WHERE je.entry_date <= ${asOf}::date), 0)::text
             AS credits,
           COALESCE(sum(l.base_debit_amount)
                     FILTER (WHERE je.entry_date <= ${compareAsOf}::date), 0)::text
             AS compare_debits,
           COALESCE(sum(l.base_credit_amount)
                     FILTER (WHERE je.entry_date <= ${compareAsOf}::date), 0)::text
             AS compare_credits
      FROM chart_of_accounts a
      LEFT JOIN journal_entry_lines l ON l.account_id = a.id
      LEFT JOIN journal_entries je ON je.id = l.entry_id AND je.status = 'posted'
     WHERE a.is_active
     GROUP BY a.id, a.account_code, a.account_name, a.account_type
    HAVING sum(l.base_debit_amount)  FILTER (WHERE je.entry_date <= ${asOf}::date) IS NOT NULL
        OR sum(l.base_credit_amount) FILTER (WHERE je.entry_date <= ${asOf}::date) IS NOT NULL
        OR sum(l.base_debit_amount)  FILTER (WHERE je.entry_date <= ${compareAsOf}::date) IS NOT NULL
        OR sum(l.base_credit_amount) FILTER (WHERE je.entry_date <= ${compareAsOf}::date) IS NOT NULL
     ORDER BY a.account_code
  `
}

export type TrialBalanceComparisonTotals = {
  debits: string
  credits: string
  balances: boolean
  compare_debits: string
  compare_credits: string
  compare_balances: boolean
}

/** Same independent-aggregation discipline as `trialBalanceTotals()`, over both dates. */
export async function trialBalanceComparisonTotals(
  tx: Tx,
  filters: { asOf: string; compareAsOf: string },
): Promise<TrialBalanceComparisonTotals> {
  const { asOf, compareAsOf } = filters
  const [row] = await tx<TrialBalanceComparisonTotals[]>`
    SELECT
      COALESCE(sum(l.base_debit_amount)  FILTER (WHERE je.entry_date <= ${asOf}::date), 0)::text AS debits,
      COALESCE(sum(l.base_credit_amount) FILTER (WHERE je.entry_date <= ${asOf}::date), 0)::text AS credits,
      COALESCE(sum(l.base_debit_amount)  FILTER (WHERE je.entry_date <= ${asOf}::date), 0)
        = COALESCE(sum(l.base_credit_amount) FILTER (WHERE je.entry_date <= ${asOf}::date), 0)
        AS balances,
      COALESCE(sum(l.base_debit_amount)  FILTER (WHERE je.entry_date <= ${compareAsOf}::date), 0)::text AS compare_debits,
      COALESCE(sum(l.base_credit_amount) FILTER (WHERE je.entry_date <= ${compareAsOf}::date), 0)::text AS compare_credits,
      COALESCE(sum(l.base_debit_amount)  FILTER (WHERE je.entry_date <= ${compareAsOf}::date), 0)
        = COALESCE(sum(l.base_credit_amount) FILTER (WHERE je.entry_date <= ${compareAsOf}::date), 0)
        AS compare_balances
      FROM journal_entry_lines l
      JOIN journal_entries je ON je.id = l.entry_id AND je.status = 'posted'
  `
  return row
}

export type ControlAccountTieOut = {
  account_code: string
  label: string
  gl_balance: string
  subledger_total: string
  difference: string
  ties_out: boolean
}

/**
 * The GL's own AR/AP control-account balances (`1100`/`2000`) against the
 * independently-maintained subledger totals — `sum(invoices.base_amount_due)`
 * / `sum(bills.base_amount_due)`. Per 19-accounting-test-plan.md §1.5/§6,
 * this is the single highest-leverage reconciliation check in the module: a
 * subledger total drifting from what was actually posted is exactly the
 * failure a control account exists to catch.
 *
 * Filtered on `journal_entry_id IS NOT NULL`, not on `status` — status is a
 * workflow label an operator can set by hand (or a fixture can hand-author)
 * independent of whether the row was ever actually run through
 * `issueInvoice`/`approveBill`, the only step that posts it and stamps this
 * column. `status NOT IN ('draft', 'void')` was tried first and initially
 * looked plausible, but it counts an `overdue`/`partial` invoice that was
 * never issued as if it had been — `journal_entry_id` is the fact of
 * whether a GL entry exists for this row, which is what a tie-out needs.
 */
export async function controlAccountTieOut(
  tx: Tx,
): Promise<ControlAccountTieOut[]> {
  return tx<ControlAccountTieOut[]>`
    WITH totals AS (
      SELECT '1100' AS account_code, 'Accounts Receivable' AS label,
             (SELECT COALESCE(sum(l.base_debit_amount) - sum(l.base_credit_amount), 0)
                FROM journal_entry_lines l
                JOIN journal_entries je ON je.id = l.entry_id AND je.status = 'posted'
                JOIN chart_of_accounts a ON a.id = l.account_id
               WHERE a.account_code = '1100') AS gl_balance,
             (SELECT COALESCE(sum(base_amount_due), 0) FROM invoices
               WHERE journal_entry_id IS NOT NULL) AS subledger_total
      UNION ALL
      SELECT '2000', 'Accounts Payable',
             (SELECT COALESCE(sum(l.base_credit_amount) - sum(l.base_debit_amount), 0)
                FROM journal_entry_lines l
                JOIN journal_entries je ON je.id = l.entry_id AND je.status = 'posted'
                JOIN chart_of_accounts a ON a.id = l.account_id
               WHERE a.account_code = '2000'),
             (SELECT COALESCE(sum(base_amount_due), 0) FROM bills
               WHERE journal_entry_id IS NOT NULL)
    )
    SELECT account_code, label,
           gl_balance::text                     AS gl_balance,
           subledger_total::text                AS subledger_total,
           (gl_balance - subledger_total)::text AS difference,
           gl_balance = subledger_total          AS ties_out
      FROM totals
     ORDER BY account_code
  `
}

export type ProfitAndLossRow = {
  account_code: string
  account_name: string
  account_type: "revenue" | "expense"
  amount: string
}

/**
 * Revenue and expense activity for a period — a P&L is periodic, unlike the
 * trial balance's cumulative-to-date `asOf`. `from`/`to` are both optional
 * (NULL rather than '', per L37) but a caller showing this as a *statement*
 * should always supply both; unbounded is the aggregate-across-all-time
 * shape, useful mainly for testing this against the trial balance's own
 * revenue/expense rows.
 *
 * `amount` is signed the way each type is naturally positive: revenue is
 * credit-heavy (credits − debits), expense is debit-heavy (debits − credits)
 * — so both read as a positive number for the ordinary case, and net income
 * is a plain `sum(revenue) − sum(expense)` rather than needing per-type
 * sign-flipping at every call site.
 */
export async function profitAndLoss(
  tx: Tx,
  filters: { from?: string; to?: string } = {},
): Promise<ProfitAndLossRow[]> {
  const from = filters.from || null
  const to = filters.to || null
  return tx<ProfitAndLossRow[]>`
    SELECT a.account_code, a.account_name, a.account_type::text AS account_type,
           (CASE WHEN a.account_type = 'revenue'
                 THEN sum(l.base_credit_amount) - sum(l.base_debit_amount)
                 ELSE sum(l.base_debit_amount) - sum(l.base_credit_amount)
            END)::text AS amount
      FROM journal_entry_lines l
      JOIN journal_entries je ON je.id = l.entry_id AND je.status = 'posted'
      JOIN chart_of_accounts a ON a.id = l.account_id
     WHERE a.account_type IN ('revenue', 'expense')
       AND (${from}::date IS NULL OR je.entry_date >= ${from}::date)
       AND (${to}::date   IS NULL OR je.entry_date <= ${to}::date)
     GROUP BY a.id, a.account_code, a.account_name, a.account_type
     ORDER BY a.account_type DESC, a.account_code
  `
}

export type ProfitAndLossTotals = {
  revenue: string
  expenses: string
  net_income: string
}

/**
 * Sums in SQL rather than from `profitAndLoss()`'s own rows — money strings
 * are added in JS as silent concatenation, never arithmetic, so the total
 * is an independent aggregation over the same lines, not a reduction of the
 * per-account report.
 */
export async function profitAndLossTotals(
  tx: Tx,
  filters: { from?: string; to?: string } = {},
): Promise<ProfitAndLossTotals> {
  const from = filters.from || null
  const to = filters.to || null
  const [row] = await tx<ProfitAndLossTotals[]>`
    SELECT
      COALESCE(sum(CASE WHEN a.account_type = 'revenue'
                         THEN l.base_credit_amount - l.base_debit_amount END), 0)::text AS revenue,
      COALESCE(sum(CASE WHEN a.account_type = 'expense'
                         THEN l.base_debit_amount - l.base_credit_amount END), 0)::text AS expenses,
      (COALESCE(sum(CASE WHEN a.account_type = 'revenue'
                          THEN l.base_credit_amount - l.base_debit_amount END), 0)
       - COALESCE(sum(CASE WHEN a.account_type = 'expense'
                            THEN l.base_debit_amount - l.base_credit_amount END), 0))::text AS net_income
      FROM journal_entry_lines l
      JOIN journal_entries je ON je.id = l.entry_id AND je.status = 'posted'
      JOIN chart_of_accounts a ON a.id = l.account_id
     WHERE a.account_type IN ('revenue', 'expense')
       AND (${from}::date IS NULL OR je.entry_date >= ${from}::date)
       AND (${to}::date   IS NULL OR je.entry_date <= ${to}::date)
  `
  return row
}

export type PeriodComparisonTotals = {
  current_revenue: string
  current_expenses: string
  current_net_income: string
  prior_from: string
  prior_to: string
  prior_revenue: string
  prior_expenses: string
  prior_net_income: string
  revenue_change: string
  expenses_change: string
  net_income_change: string
}

/**
 * The prior comparison window is computed in SQL, in the same query as the
 * totals it's compared against — `previous_period` is an equal-length window
 * immediately before `from`; `previous_year` shifts both dates back a year,
 * letting Postgres's date arithmetic handle month lengths and leap days
 * rather than reimplementing calendar math in JS.
 *
 * This `bounds` CTE is copy-pasted verbatim into `cashFlowComparison()` and
 * `equityComparison()` below rather than shared — for the same reason
 * `cashFlowStatement()`'s own doc comment gives for its duplicated
 * account-balances CTE: it takes three of *this query's own* bind
 * parameters (`from`, `to`, `compareTo`), and postgres.js only forwards a
 * single bind value out of a nested `tx.unsafe()` fragment into the outer
 * query. A shared multi-parameter fragment here would look tidy and
 * silently bind the wrong dates.
 */
export async function profitAndLossComparison(
  tx: Tx,
  filters: {
    from: string
    to: string
    compareTo: "previous_period" | "previous_year"
  },
): Promise<PeriodComparisonTotals> {
  const { from, to, compareTo } = filters
  const [row] = await tx<PeriodComparisonTotals[]>`
    WITH bounds AS (
      SELECT ${from}::date AS cur_from, ${to}::date AS cur_to,
             CASE WHEN ${compareTo} = 'previous_year'
                  THEN ${from}::date - INTERVAL '1 year'
                  ELSE ${from}::date - (${to}::date - ${from}::date + 1)
             END::date AS pri_from,
             CASE WHEN ${compareTo} = 'previous_year'
                  THEN ${to}::date - INTERVAL '1 year'
                  ELSE ${from}::date - 1
             END::date AS pri_to
    ),
    activity AS (
      SELECT
        COALESCE(sum(CASE WHEN a.account_type = 'revenue'
                           THEN l.base_credit_amount - l.base_debit_amount END)
                  FILTER (WHERE je.entry_date BETWEEN b.cur_from AND b.cur_to), 0) AS current_revenue,
        COALESCE(sum(CASE WHEN a.account_type = 'expense'
                           THEN l.base_debit_amount - l.base_credit_amount END)
                  FILTER (WHERE je.entry_date BETWEEN b.cur_from AND b.cur_to), 0) AS current_expenses,
        COALESCE(sum(CASE WHEN a.account_type = 'revenue'
                           THEN l.base_credit_amount - l.base_debit_amount END)
                  FILTER (WHERE je.entry_date BETWEEN b.pri_from AND b.pri_to), 0) AS prior_revenue,
        COALESCE(sum(CASE WHEN a.account_type = 'expense'
                           THEN l.base_debit_amount - l.base_credit_amount END)
                  FILTER (WHERE je.entry_date BETWEEN b.pri_from AND b.pri_to), 0) AS prior_expenses
        FROM bounds b
        LEFT JOIN journal_entry_lines l ON TRUE
        LEFT JOIN journal_entries je ON je.id = l.entry_id AND je.status = 'posted'
        LEFT JOIN chart_of_accounts a ON a.id = l.account_id AND a.account_type IN ('revenue', 'expense')
       WHERE je.entry_date BETWEEN b.pri_from AND b.cur_to
    )
    SELECT b.pri_from::text AS prior_from, b.pri_to::text AS prior_to,
           current_revenue::text, current_expenses::text,
           (current_revenue - current_expenses)::text AS current_net_income,
           prior_revenue::text, prior_expenses::text,
           (prior_revenue - prior_expenses)::text AS prior_net_income,
           (current_revenue - prior_revenue)::text AS revenue_change,
           (current_expenses - prior_expenses)::text AS expenses_change,
           ((current_revenue - current_expenses) - (prior_revenue - prior_expenses))::text AS net_income_change
      FROM bounds b, activity
  `
  return row
}

export type BalanceSheetRow = {
  account_code: string
  account_name: string
  account_type: "asset" | "liability" | "equity"
  amount: string
}

/**
 * Real, posted asset/liability/equity accounts as of a date — cumulative,
 * like the trial balance's `asOf`, not periodic like the P&L. `amount` is
 * signed for each type's normal balance (asset debit-heavy,
 * liability/equity credit-heavy) so every figure reads positive for the
 * ordinary case.
 *
 * Deliberately excludes the current period's net income — this codebase has
 * no closing-entry process that rolls revenue/expense into retained
 * earnings, so `equity` here is understated by exactly `net_income` from
 * `balanceSheetTotals()` until a close happens. `balanceSheetTotals()`
 * folds it back in as its own line so the two numbers the sheet must equal
 * — assets, and liabilities + equity — actually do.
 */
export async function balanceSheet(
  tx: Tx,
  filters: { asOf?: string } = {},
): Promise<BalanceSheetRow[]> {
  const asOf = filters.asOf || null
  return tx<BalanceSheetRow[]>`
    SELECT a.account_code, a.account_name, a.account_type::text AS account_type,
           (CASE WHEN a.account_type = 'asset'
                 THEN sum(l.base_debit_amount) - sum(l.base_credit_amount)
                 ELSE sum(l.base_credit_amount) - sum(l.base_debit_amount)
            END)::text AS amount
      FROM journal_entry_lines l
      JOIN journal_entries je ON je.id = l.entry_id AND je.status = 'posted'
      JOIN chart_of_accounts a ON a.id = l.account_id
     WHERE a.account_type IN ('asset', 'liability', 'equity')
       AND (${asOf}::date IS NULL OR je.entry_date <= ${asOf}::date)
     GROUP BY a.id, a.account_code, a.account_name, a.account_type
     ORDER BY CASE a.account_type WHEN 'asset' THEN 1 WHEN 'liability' THEN 2 ELSE 3 END,
              a.account_code
  `
}

export type BalanceSheetTotals = {
  assets: string
  liabilities: string
  equity: string
  net_income: string
  /** `equity + net_income` — what a page shows as "Total Equity" before a close has run. */
  total_equity: string
  /** `liabilities + total_equity` — the figure that actually has to equal `assets`. */
  total_liabilities_and_equity: string
  balances: boolean
}

/**
 * Independent SQL aggregation, not a reduction of `balanceSheet()`'s rows.
 * `net_income` is revenue minus expense to date — algebraically just
 * `sum(base_credit_amount - base_debit_amount)` over both types at once,
 * since a revenue row's credit-minus-debit is already the figure we want
 * and an expense row's credit-minus-debit is the negative of the
 * debit-minus-credit expense figure, which is exactly what subtracting
 * expenses from revenue needs. `balances` asserts the accounting identity
 * directly — assets = liabilities + equity + net_income — which is also
 * the thing the fixture's `journal_entries` CHECK/`unbalanced()` guarantee
 * holds for every individual entry, so it must hold in aggregate too.
 */
export async function balanceSheetTotals(
  tx: Tx,
  filters: { asOf?: string } = {},
): Promise<BalanceSheetTotals> {
  const asOf = filters.asOf || null
  const [row] = await tx<BalanceSheetTotals[]>`
    WITH t AS (
      SELECT
        COALESCE(sum(CASE WHEN a.account_type = 'asset'
                           THEN l.base_debit_amount - l.base_credit_amount END), 0) AS assets,
        COALESCE(sum(CASE WHEN a.account_type = 'liability'
                           THEN l.base_credit_amount - l.base_debit_amount END), 0) AS liabilities,
        COALESCE(sum(CASE WHEN a.account_type = 'equity'
                           THEN l.base_credit_amount - l.base_debit_amount END), 0) AS equity,
        COALESCE(sum(CASE WHEN a.account_type IN ('revenue', 'expense')
                           THEN l.base_credit_amount - l.base_debit_amount END), 0) AS net_income
        FROM journal_entry_lines l
        JOIN journal_entries je ON je.id = l.entry_id AND je.status = 'posted'
        JOIN chart_of_accounts a ON a.id = l.account_id
       WHERE a.account_type IN ('asset', 'liability', 'equity', 'revenue', 'expense')
         AND (${asOf}::date IS NULL OR je.entry_date <= ${asOf}::date)
    )
    SELECT assets::text, liabilities::text, equity::text, net_income::text,
           (equity + net_income)::text             AS total_equity,
           (liabilities + equity + net_income)::text AS total_liabilities_and_equity,
           assets = liabilities + equity + net_income AS balances
      FROM t
  `
  return row
}

export type BalanceSheetComparisonRow = {
  account_code: string
  account_name: string
  account_type: "asset" | "liability" | "equity"
  amount: string
  compare_amount: string
  /** `amount - compare_amount`, computed in SQL rather than by the page subtracting two money strings. */
  change: string
}

/**
 * The same accounts as `balanceSheet()`, evaluated at TWO independent `asOf`
 * dates rather than one — a real comparative-balance-sheet shape ("as of
 * Dec 31 2025" next to "as of Dec 31 2026"), not `profitAndLossComparison()`'s
 * "current window vs. a computed prior window": a balance sheet is
 * cumulative, so there is no period to shift back by a year or by its own
 * length, only a second point in time the caller names directly. Each
 * date's signed balance is computed once in the `bal` CTE and read three
 * times in the outer SELECT (`amount`, `compare_amount`, their difference)
 * rather than repeating the CASE expression itself three times.
 */
export async function balanceSheetComparison(
  tx: Tx,
  filters: { asOf: string; compareAsOf: string },
): Promise<BalanceSheetComparisonRow[]> {
  const { asOf, compareAsOf } = filters
  return tx<BalanceSheetComparisonRow[]>`
    WITH bal AS (
      SELECT a.id, a.account_code, a.account_name, a.account_type::text AS account_type,
             -- COALESCEd to 0: an account with rows dated after asOf (but
             -- before compareAsOf, or vice versa) has a real, zero balance
             -- at the earlier date, not "no data" — leaving this NULL would
             -- make "change" below NULL too, silently, for exactly the
             -- accounts a comparison is most useful for (ones that only
             -- started being posted to partway through the window).
             COALESCE((CASE WHEN a.account_type = 'asset'
                   THEN sum(l.base_debit_amount)  FILTER (WHERE je.entry_date <= ${asOf}::date)
                      - sum(l.base_credit_amount) FILTER (WHERE je.entry_date <= ${asOf}::date)
                   ELSE sum(l.base_credit_amount) FILTER (WHERE je.entry_date <= ${asOf}::date)
                      - sum(l.base_debit_amount)  FILTER (WHERE je.entry_date <= ${asOf}::date)
              END), 0) AS amount,
             COALESCE((CASE WHEN a.account_type = 'asset'
                   THEN sum(l.base_debit_amount)  FILTER (WHERE je.entry_date <= ${compareAsOf}::date)
                      - sum(l.base_credit_amount) FILTER (WHERE je.entry_date <= ${compareAsOf}::date)
                   ELSE sum(l.base_credit_amount) FILTER (WHERE je.entry_date <= ${compareAsOf}::date)
                      - sum(l.base_debit_amount)  FILTER (WHERE je.entry_date <= ${compareAsOf}::date)
              END), 0) AS compare_amount
        FROM journal_entry_lines l
        JOIN journal_entries je ON je.id = l.entry_id AND je.status = 'posted'
        JOIN chart_of_accounts a ON a.id = l.account_id
       WHERE a.account_type IN ('asset', 'liability', 'equity')
       GROUP BY a.id, a.account_code, a.account_name, a.account_type
    )
    SELECT account_code, account_name, account_type,
           amount::text AS amount,
           compare_amount::text AS compare_amount,
           (amount - compare_amount)::text AS change
      FROM bal
     ORDER BY CASE account_type WHEN 'asset' THEN 1 WHEN 'liability' THEN 2 ELSE 3 END,
              account_code
  `
}

export type BalanceSheetComparisonTotals = {
  assets: string
  liabilities: string
  equity: string
  net_income: string
  total_equity: string
  total_liabilities_and_equity: string
  balances: boolean
  compare_assets: string
  compare_liabilities: string
  compare_equity: string
  compare_net_income: string
  compare_total_equity: string
  compare_total_liabilities_and_equity: string
  compare_balances: boolean
}

/**
 * Same independent-aggregation discipline as `balanceSheetTotals()`, over
 * both dates — including its own `balances` identity check at EACH date,
 * since a balance sheet that ties out today says nothing about whether it
 * tied out on the comparison date.
 */
export async function balanceSheetComparisonTotals(
  tx: Tx,
  filters: { asOf: string; compareAsOf: string },
): Promise<BalanceSheetComparisonTotals> {
  const { asOf, compareAsOf } = filters
  const [row] = await tx<BalanceSheetComparisonTotals[]>`
    WITH t AS (
      SELECT
        COALESCE(sum(CASE WHEN a.account_type = 'asset'
                           THEN l.base_debit_amount - l.base_credit_amount END)
                   FILTER (WHERE je.entry_date <= ${asOf}::date), 0) AS assets,
        COALESCE(sum(CASE WHEN a.account_type = 'liability'
                           THEN l.base_credit_amount - l.base_debit_amount END)
                   FILTER (WHERE je.entry_date <= ${asOf}::date), 0) AS liabilities,
        COALESCE(sum(CASE WHEN a.account_type = 'equity'
                           THEN l.base_credit_amount - l.base_debit_amount END)
                   FILTER (WHERE je.entry_date <= ${asOf}::date), 0) AS equity,
        COALESCE(sum(CASE WHEN a.account_type IN ('revenue', 'expense')
                           THEN l.base_credit_amount - l.base_debit_amount END)
                   FILTER (WHERE je.entry_date <= ${asOf}::date), 0) AS net_income,
        COALESCE(sum(CASE WHEN a.account_type = 'asset'
                           THEN l.base_debit_amount - l.base_credit_amount END)
                   FILTER (WHERE je.entry_date <= ${compareAsOf}::date), 0) AS compare_assets,
        COALESCE(sum(CASE WHEN a.account_type = 'liability'
                           THEN l.base_credit_amount - l.base_debit_amount END)
                   FILTER (WHERE je.entry_date <= ${compareAsOf}::date), 0) AS compare_liabilities,
        COALESCE(sum(CASE WHEN a.account_type = 'equity'
                           THEN l.base_credit_amount - l.base_debit_amount END)
                   FILTER (WHERE je.entry_date <= ${compareAsOf}::date), 0) AS compare_equity,
        COALESCE(sum(CASE WHEN a.account_type IN ('revenue', 'expense')
                           THEN l.base_credit_amount - l.base_debit_amount END)
                   FILTER (WHERE je.entry_date <= ${compareAsOf}::date), 0) AS compare_net_income
        FROM journal_entry_lines l
        JOIN journal_entries je ON je.id = l.entry_id AND je.status = 'posted'
        JOIN chart_of_accounts a ON a.id = l.account_id
       WHERE a.account_type IN ('asset', 'liability', 'equity', 'revenue', 'expense')
    )
    SELECT assets::text, liabilities::text, equity::text, net_income::text,
           (equity + net_income)::text AS total_equity,
           (liabilities + equity + net_income)::text AS total_liabilities_and_equity,
           assets = liabilities + equity + net_income AS balances,
           compare_assets::text, compare_liabilities::text, compare_equity::text, compare_net_income::text,
           (compare_equity + compare_net_income)::text AS compare_total_equity,
           (compare_liabilities + compare_equity + compare_net_income)::text
             AS compare_total_liabilities_and_equity,
           compare_assets = compare_liabilities + compare_equity + compare_net_income AS compare_balances
      FROM t
  `
  return row
}

export type CashFlowAdjustmentRow = {
  account_code: string
  account_name: string
  account_type: "asset" | "liability" | "equity"
  /** Signed as a cash IMPACT — positive is a source of cash, negative a use — not as the account's own balance change. */
  amount: string
}

/**
 * The indirect-method reconciling items for a period: every non-cash
 * working-capital account's change, signed as its impact ON CASH rather
 * than its own balance movement — a decrease in an asset is a source of
 * cash (positive), an increase in a liability is a source of cash
 * (positive). `cashFlowTotals()` sums these same rows into
 * `operating_cash_flow`; `financing_cash_flow` there covers the `equity`
 * rows this function also returns (a direct posting to an equity account,
 * outside of net income — this fixture has none, but a future capital
 * contribution would show up here).
 *
 * The account-balances CTE below is duplicated in `cashFlowTotals()` rather
 * than shared as a `tx.unsafe()` fragment: postgres.js's fragment merging
 * only forwards a SINGLE arg from a nested `unsafe()` query into the outer
 * one (confirmed empirically — a two-parameter nested fragment silently
 * drops the second bind value), so a shared parameterized fragment across
 * two `from`/`to` values is not actually safe here, only tidy-looking.
 *
 * `begin_bal` treats a NULL `from` as "before any activity" (0), not "no
 * filter" — the opposite of `end_bal`'s NULL `to`, which means "through
 * today." Getting these backwards would make an unbounded period's
 * beginning balance equal its ending balance, silently zeroing every
 * working-capital adjustment.
 */
export async function cashFlowStatement(
  tx: Tx,
  filters: { from?: string; to?: string } = {},
): Promise<CashFlowAdjustmentRow[]> {
  const from = filters.from || null
  const to = filters.to || null
  return tx<CashFlowAdjustmentRow[]>`
    WITH acct AS (
      SELECT a.id, a.account_code, a.account_name, a.account_type::text AS account_type,
             COALESCE(a.is_bank_account, FALSE) AS is_bank_account,
             COALESCE(sum(CASE WHEN a.account_type = 'asset'
                                THEN l.base_debit_amount - l.base_credit_amount
                                ELSE l.base_credit_amount - l.base_debit_amount END)
                       FILTER (WHERE ${from}::date IS NOT NULL AND je.entry_date < ${from}::date), 0) AS begin_bal,
             COALESCE(sum(CASE WHEN a.account_type = 'asset'
                                THEN l.base_debit_amount - l.base_credit_amount
                                ELSE l.base_credit_amount - l.base_debit_amount END)
                       FILTER (WHERE ${to}::date IS NULL OR je.entry_date <= ${to}::date), 0) AS end_bal
        FROM chart_of_accounts a
        LEFT JOIN journal_entry_lines l ON l.account_id = a.id
        LEFT JOIN journal_entries je ON je.id = l.entry_id AND je.status = 'posted'
       WHERE a.account_type IN ('asset', 'liability', 'equity')
       GROUP BY a.id, a.account_code, a.account_name, a.account_type, a.is_bank_account
    )
    SELECT account_code, account_name, account_type,
           (CASE account_type
              WHEN 'asset'     THEN begin_bal - end_bal
              WHEN 'liability' THEN end_bal - begin_bal
              ELSE                  end_bal - begin_bal
            END)::text AS amount
      FROM acct
     WHERE NOT is_bank_account
       AND begin_bal <> end_bal
     ORDER BY CASE account_type WHEN 'asset' THEN 1 WHEN 'liability' THEN 2 ELSE 3 END,
              account_code
  `
}

export type CashFlowTotals = {
  beginning_cash: string
  net_income: string
  working_capital_change: string
  operating_cash_flow: string
  /**
   * Always "0" — this chart of accounts has no fixed-asset/investment
   * account category to draw from — but it's a real additive term in
   * `net_change_in_cash`/`computed_ending_cash` below, not just a label:
   * a future investing-category account would only need its own CASE arm
   * added to this term, not a rewire of the sum it participates in.
   */
  investing_cash_flow: string
  financing_cash_flow: string
  net_change_in_cash: string
  ending_cash: string
  /** `beginning_cash + net_change_in_cash` recomputed independently, checked against the real Cash-account balance. */
  computed_ending_cash: string
  reconciles: boolean
}

/**
 * The indirect method: operating cash flow is net income adjusted for the
 * period's change in every non-cash working-capital account, not a sum of
 * actual cash-account transactions (this schema has no per-line activity
 * classification to sort those into operating/investing/financing). Proven
 * self-consistent, the same way `balanceSheetTotals`'s identity is: this
 * is algebraically forced by the same double-entry identity, so
 * `reconciles` failing would mean the underlying ledger itself doesn't
 * balance — not a bug in this report.
 */
export async function cashFlowTotals(
  tx: Tx,
  filters: { from?: string; to?: string } = {},
): Promise<CashFlowTotals> {
  const from = filters.from || null
  const to = filters.to || null
  const [row] = await tx<CashFlowTotals[]>`
    WITH acct AS (
      SELECT a.account_type::text AS account_type,
             COALESCE(a.is_bank_account, FALSE) AS is_bank_account,
             COALESCE(sum(CASE WHEN a.account_type = 'asset'
                                THEN l.base_debit_amount - l.base_credit_amount
                                ELSE l.base_credit_amount - l.base_debit_amount END)
                       FILTER (WHERE ${from}::date IS NOT NULL AND je.entry_date < ${from}::date), 0) AS begin_bal,
             COALESCE(sum(CASE WHEN a.account_type = 'asset'
                                THEN l.base_debit_amount - l.base_credit_amount
                                ELSE l.base_credit_amount - l.base_debit_amount END)
                       FILTER (WHERE ${to}::date IS NULL OR je.entry_date <= ${to}::date), 0) AS end_bal
        FROM chart_of_accounts a
        LEFT JOIN journal_entry_lines l ON l.account_id = a.id
        LEFT JOIN journal_entries je ON je.id = l.entry_id AND je.status = 'posted'
       WHERE a.account_type IN ('asset', 'liability', 'equity')
       GROUP BY a.id, a.account_type, a.is_bank_account
    ),
    t AS (
      SELECT
        COALESCE(sum(begin_bal) FILTER (WHERE is_bank_account), 0) AS beginning_cash,
        COALESCE(sum(end_bal) FILTER (WHERE is_bank_account), 0)   AS ending_cash,
        COALESCE(sum(CASE account_type
                        WHEN 'asset'     THEN begin_bal - end_bal
                        WHEN 'liability' THEN end_bal - begin_bal
                      END) FILTER (WHERE NOT is_bank_account AND account_type IN ('asset', 'liability')), 0)
          AS working_capital_change,
        COALESCE(sum(end_bal - begin_bal) FILTER (WHERE account_type = 'equity'), 0) AS financing_cash_flow,
        (SELECT COALESCE(sum(CASE WHEN a2.account_type IN ('revenue', 'expense')
                                   THEN l2.base_credit_amount - l2.base_debit_amount END), 0)
           FROM journal_entry_lines l2
           JOIN journal_entries je2 ON je2.id = l2.entry_id AND je2.status = 'posted'
           JOIN chart_of_accounts a2 ON a2.id = l2.account_id
          WHERE a2.account_type IN ('revenue', 'expense')
            AND (${from}::date IS NULL OR je2.entry_date >= ${from}::date)
            AND (${to}::date   IS NULL OR je2.entry_date <= ${to}::date)) AS net_income
        FROM acct
    )
    SELECT beginning_cash::text, ending_cash::text,
           net_income::text, working_capital_change::text,
           (net_income + working_capital_change)::text AS operating_cash_flow,
           0::numeric::text AS investing_cash_flow,
           financing_cash_flow::text,
           (net_income + working_capital_change + 0::numeric + financing_cash_flow)::text AS net_change_in_cash,
           (beginning_cash + net_income + working_capital_change + 0::numeric + financing_cash_flow)::text AS computed_ending_cash,
           ending_cash = beginning_cash + net_income + working_capital_change + 0::numeric + financing_cash_flow AS reconciles
      FROM t
  `
  return row
}

export type CashFlowComparisonTotals = {
  prior_from: string
  prior_to: string
  current_operating_cash_flow: string
  current_investing_cash_flow: string
  current_financing_cash_flow: string
  current_net_change_in_cash: string
  prior_operating_cash_flow: string
  prior_investing_cash_flow: string
  prior_financing_cash_flow: string
  prior_net_change_in_cash: string
  operating_cash_flow_change: string
  financing_cash_flow_change: string
  net_change_in_cash_change: string
}

/**
 * Same shape as `profitAndLossComparison()` — the prior window's boundaries
 * computed in SQL, not JS — but doubling `cashFlowTotals()`'s own
 * begin/end-balance pattern across two windows instead of one, since a
 * comparison needs four balance points per account (current begin/end,
 * prior begin/end), not two.
 */
export async function cashFlowComparison(
  tx: Tx,
  filters: {
    from: string
    to: string
    compareTo: "previous_period" | "previous_year"
  },
): Promise<CashFlowComparisonTotals> {
  const { from, to, compareTo } = filters
  const [row] = await tx<CashFlowComparisonTotals[]>`
    WITH bounds AS (
      SELECT ${from}::date AS cur_from, ${to}::date AS cur_to,
             CASE WHEN ${compareTo} = 'previous_year'
                  THEN ${from}::date - INTERVAL '1 year'
                  ELSE ${from}::date - (${to}::date - ${from}::date + 1)
             END::date AS pri_from,
             CASE WHEN ${compareTo} = 'previous_year'
                  THEN ${to}::date - INTERVAL '1 year'
                  ELSE ${from}::date - 1
             END::date AS pri_to
    ),
    acct AS (
      SELECT a.account_type::text AS account_type,
             COALESCE(a.is_bank_account, FALSE) AS is_bank_account,
             COALESCE(sum(CASE WHEN a.account_type = 'asset'
                                THEN l.base_debit_amount - l.base_credit_amount
                                ELSE l.base_credit_amount - l.base_debit_amount END)
                       FILTER (WHERE je.entry_date < b.cur_from), 0) AS cur_begin,
             COALESCE(sum(CASE WHEN a.account_type = 'asset'
                                THEN l.base_debit_amount - l.base_credit_amount
                                ELSE l.base_credit_amount - l.base_debit_amount END)
                       FILTER (WHERE je.entry_date <= b.cur_to), 0) AS cur_end,
             COALESCE(sum(CASE WHEN a.account_type = 'asset'
                                THEN l.base_debit_amount - l.base_credit_amount
                                ELSE l.base_credit_amount - l.base_debit_amount END)
                       FILTER (WHERE je.entry_date < b.pri_from), 0) AS pri_begin,
             COALESCE(sum(CASE WHEN a.account_type = 'asset'
                                THEN l.base_debit_amount - l.base_credit_amount
                                ELSE l.base_credit_amount - l.base_debit_amount END)
                       FILTER (WHERE je.entry_date <= b.pri_to), 0) AS pri_end
        FROM bounds b, chart_of_accounts a
        LEFT JOIN journal_entry_lines l ON l.account_id = a.id
        LEFT JOIN journal_entries je ON je.id = l.entry_id AND je.status = 'posted'
       WHERE a.account_type IN ('asset', 'liability', 'equity')
       GROUP BY a.id, a.account_type, a.is_bank_account
    ),
    t AS (
      SELECT
        COALESCE(sum(CASE account_type
                        WHEN 'asset'     THEN cur_begin - cur_end
                        WHEN 'liability' THEN cur_end - cur_begin
                      END) FILTER (WHERE NOT is_bank_account AND account_type IN ('asset', 'liability')), 0)
          AS cur_working_capital_change,
        COALESCE(sum(cur_end - cur_begin) FILTER (WHERE account_type = 'equity'), 0) AS cur_financing,
        COALESCE(sum(CASE account_type
                        WHEN 'asset'     THEN pri_begin - pri_end
                        WHEN 'liability' THEN pri_end - pri_begin
                      END) FILTER (WHERE NOT is_bank_account AND account_type IN ('asset', 'liability')), 0)
          AS pri_working_capital_change,
        COALESCE(sum(pri_end - pri_begin) FILTER (WHERE account_type = 'equity'), 0) AS pri_financing,
        (SELECT COALESCE(sum(CASE WHEN a2.account_type IN ('revenue', 'expense')
                                   THEN l2.base_credit_amount - l2.base_debit_amount END), 0)
           FROM journal_entry_lines l2
           JOIN journal_entries je2 ON je2.id = l2.entry_id AND je2.status = 'posted'
           JOIN chart_of_accounts a2 ON a2.id = l2.account_id, bounds b
          WHERE a2.account_type IN ('revenue', 'expense')
            AND je2.entry_date BETWEEN b.cur_from AND b.cur_to) AS cur_net_income,
        (SELECT COALESCE(sum(CASE WHEN a2.account_type IN ('revenue', 'expense')
                                   THEN l2.base_credit_amount - l2.base_debit_amount END), 0)
           FROM journal_entry_lines l2
           JOIN journal_entries je2 ON je2.id = l2.entry_id AND je2.status = 'posted'
           JOIN chart_of_accounts a2 ON a2.id = l2.account_id, bounds b
          WHERE a2.account_type IN ('revenue', 'expense')
            AND je2.entry_date BETWEEN b.pri_from AND b.pri_to) AS pri_net_income
        FROM acct
    )
    SELECT b.pri_from::text AS prior_from, b.pri_to::text AS prior_to,
           (cur_net_income + cur_working_capital_change)::text AS current_operating_cash_flow,
           0::numeric::text AS current_investing_cash_flow,
           cur_financing::text AS current_financing_cash_flow,
           (cur_net_income + cur_working_capital_change + cur_financing)::text AS current_net_change_in_cash,
           (pri_net_income + pri_working_capital_change)::text AS prior_operating_cash_flow,
           0::numeric::text AS prior_investing_cash_flow,
           pri_financing::text AS prior_financing_cash_flow,
           (pri_net_income + pri_working_capital_change + pri_financing)::text AS prior_net_change_in_cash,
           ((cur_net_income + cur_working_capital_change) - (pri_net_income + pri_working_capital_change))::text
             AS operating_cash_flow_change,
           (cur_financing - pri_financing)::text AS financing_cash_flow_change,
           ((cur_net_income + cur_working_capital_change + cur_financing)
            - (pri_net_income + pri_working_capital_change + pri_financing))::text AS net_change_in_cash_change
      FROM bounds b, t
  `
  return row
}

export type EquityStatementRow = {
  account_code: string
  account_name: string
  beginning_balance: string
  /** The account's own posted activity in the period — a direct posting (a capital contribution, a dividend), never net income flowing through it. */
  direct_changes: string
  ending_balance: string
}

/**
 * Every active equity account's roll-forward for a period: beginning
 * balance, its own direct postings (never net income — this codebase has
 * no closing-entry process, so net income never actually reaches an equity
 * account), and the resulting ending balance. Unlike `cashFlowStatement`'s
 * adjustment rows, every active equity account is listed even at zero —
 * the equity section of a real statement is a small, fixed set of lines
 * (capital, retained earnings, treasury stock), not a large chart an
 * inactive row should be hidden from.
 */
export async function equityStatement(
  tx: Tx,
  filters: { from?: string; to?: string } = {},
): Promise<EquityStatementRow[]> {
  const from = filters.from || null
  const to = filters.to || null
  return tx<EquityStatementRow[]>`
    SELECT a.account_code, a.account_name,
           COALESCE(sum(l.base_credit_amount - l.base_debit_amount)
                     FILTER (WHERE ${from}::date IS NOT NULL AND je.entry_date < ${from}::date), 0)::text
             AS beginning_balance,
           (COALESCE(sum(l.base_credit_amount - l.base_debit_amount)
                      FILTER (WHERE ${to}::date IS NULL OR je.entry_date <= ${to}::date), 0)
            - COALESCE(sum(l.base_credit_amount - l.base_debit_amount)
                        FILTER (WHERE ${from}::date IS NOT NULL AND je.entry_date < ${from}::date), 0))::text
             AS direct_changes,
           COALESCE(sum(l.base_credit_amount - l.base_debit_amount)
                     FILTER (WHERE ${to}::date IS NULL OR je.entry_date <= ${to}::date), 0)::text
             AS ending_balance
      FROM chart_of_accounts a
      LEFT JOIN journal_entry_lines l ON l.account_id = a.id
      LEFT JOIN journal_entries je ON je.id = l.entry_id AND je.status = 'posted'
     WHERE a.account_type = 'equity' AND a.is_active
     GROUP BY a.id, a.account_code, a.account_name
     ORDER BY a.account_code
  `
}

export type EquityStatementTotals = {
  beginning_equity: string
  direct_changes: string
  net_income: string
  /** Sum of the equity accounts' own ending balances — never includes net income, since nothing closes it there. */
  ending_equity: string
  /** `ending_equity + net_income` — the figure that matches `balanceSheetTotals().total_equity` for the same `to` date. */
  ending_equity_including_current_earnings: string
}

/**
 * Independent SQL aggregation, not a reduction of `equityStatement()`'s
 * rows. `net_income` is shown as its own line rather than folded into any
 * account's `direct_changes` — it is real economic equity the company has
 * earned, but not yet formally closed into Retained Earnings, so crediting
 * an account with it here would misrepresent what that account's ledger
 * activity actually was.
 */
export async function equityStatementTotals(
  tx: Tx,
  filters: { from?: string; to?: string } = {},
): Promise<EquityStatementTotals> {
  const from = filters.from || null
  const to = filters.to || null
  const [row] = await tx<EquityStatementTotals[]>`
    WITH t AS (
      SELECT
        COALESCE(sum(l.base_credit_amount - l.base_debit_amount)
                  FILTER (WHERE ${from}::date IS NOT NULL AND je.entry_date < ${from}::date), 0) AS beginning_equity,
        COALESCE(sum(l.base_credit_amount - l.base_debit_amount)
                  FILTER (WHERE ${to}::date IS NULL OR je.entry_date <= ${to}::date), 0) AS ending_equity,
        (SELECT COALESCE(sum(CASE WHEN a2.account_type IN ('revenue', 'expense')
                                   THEN l2.base_credit_amount - l2.base_debit_amount END), 0)
           FROM journal_entry_lines l2
           JOIN journal_entries je2 ON je2.id = l2.entry_id AND je2.status = 'posted'
           JOIN chart_of_accounts a2 ON a2.id = l2.account_id
          WHERE a2.account_type IN ('revenue', 'expense')
            AND (${from}::date IS NULL OR je2.entry_date >= ${from}::date)
            AND (${to}::date   IS NULL OR je2.entry_date <= ${to}::date)) AS net_income
        FROM chart_of_accounts a
        LEFT JOIN journal_entry_lines l ON l.account_id = a.id
        LEFT JOIN journal_entries je ON je.id = l.entry_id AND je.status = 'posted'
       WHERE a.account_type = 'equity' AND a.is_active
    )
    SELECT beginning_equity::text,
           (ending_equity - beginning_equity)::text AS direct_changes,
           net_income::text,
           ending_equity::text,
           (ending_equity + net_income)::text AS ending_equity_including_current_earnings
      FROM t
  `
  return row
}

export type EquityComparisonTotals = {
  prior_from: string
  prior_to: string
  current_direct_changes: string
  current_net_income: string
  prior_direct_changes: string
  prior_net_income: string
  direct_changes_change: string
  net_income_change: string
}

/**
 * Same shape as `profitAndLossComparison()`/`cashFlowComparison()` — the
 * prior window's boundaries computed in SQL. Compares the period's own
 * activity (`direct_changes`, `net_income`), not the cumulative
 * `ending_equity` balances either window ends on — those never fall now
 * that the fixture carries a real opening balance, so a diff of them would
 * mostly reflect however much time sits between the two windows rather than
 * a change in the RATE of equity activity, which is what "trend" means here.
 */
export async function equityComparison(
  tx: Tx,
  filters: {
    from: string
    to: string
    compareTo: "previous_period" | "previous_year"
  },
): Promise<EquityComparisonTotals> {
  const { from, to, compareTo } = filters
  const [row] = await tx<EquityComparisonTotals[]>`
    WITH bounds AS (
      SELECT ${from}::date AS cur_from, ${to}::date AS cur_to,
             CASE WHEN ${compareTo} = 'previous_year'
                  THEN ${from}::date - INTERVAL '1 year'
                  ELSE ${from}::date - (${to}::date - ${from}::date + 1)
             END::date AS pri_from,
             CASE WHEN ${compareTo} = 'previous_year'
                  THEN ${to}::date - INTERVAL '1 year'
                  ELSE ${from}::date - 1
             END::date AS pri_to
    ),
    eq AS (
      SELECT
        COALESCE(sum(l.base_credit_amount - l.base_debit_amount)
                  FILTER (WHERE je.entry_date < b.cur_from), 0) AS cur_begin,
        COALESCE(sum(l.base_credit_amount - l.base_debit_amount)
                  FILTER (WHERE je.entry_date <= b.cur_to), 0) AS cur_end,
        COALESCE(sum(l.base_credit_amount - l.base_debit_amount)
                  FILTER (WHERE je.entry_date < b.pri_from), 0) AS pri_begin,
        COALESCE(sum(l.base_credit_amount - l.base_debit_amount)
                  FILTER (WHERE je.entry_date <= b.pri_to), 0) AS pri_end
        FROM bounds b, chart_of_accounts a
        LEFT JOIN journal_entry_lines l ON l.account_id = a.id
        LEFT JOIN journal_entries je ON je.id = l.entry_id AND je.status = 'posted'
       WHERE a.account_type = 'equity' AND a.is_active
    ),
    ni AS (
      SELECT
        (SELECT COALESCE(sum(CASE WHEN a2.account_type IN ('revenue', 'expense')
                                   THEN l2.base_credit_amount - l2.base_debit_amount END), 0)
           FROM journal_entry_lines l2
           JOIN journal_entries je2 ON je2.id = l2.entry_id AND je2.status = 'posted'
           JOIN chart_of_accounts a2 ON a2.id = l2.account_id, bounds b
          WHERE a2.account_type IN ('revenue', 'expense')
            AND je2.entry_date BETWEEN b.cur_from AND b.cur_to) AS cur_net_income,
        (SELECT COALESCE(sum(CASE WHEN a2.account_type IN ('revenue', 'expense')
                                   THEN l2.base_credit_amount - l2.base_debit_amount END), 0)
           FROM journal_entry_lines l2
           JOIN journal_entries je2 ON je2.id = l2.entry_id AND je2.status = 'posted'
           JOIN chart_of_accounts a2 ON a2.id = l2.account_id, bounds b
          WHERE a2.account_type IN ('revenue', 'expense')
            AND je2.entry_date BETWEEN b.pri_from AND b.pri_to) AS pri_net_income
    )
    SELECT b.pri_from::text AS prior_from, b.pri_to::text AS prior_to,
           (eq.cur_end - eq.cur_begin)::text AS current_direct_changes,
           ni.cur_net_income::text AS current_net_income,
           (eq.pri_end - eq.pri_begin)::text AS prior_direct_changes,
           ni.pri_net_income::text AS prior_net_income,
           ((eq.cur_end - eq.cur_begin) - (eq.pri_end - eq.pri_begin))::text AS direct_changes_change,
           (ni.cur_net_income - ni.pri_net_income)::text AS net_income_change
      FROM bounds b, eq, ni
  `
  return row
}

export type TaxLiabilityRow = {
  tax_rate_id: string | null
  code: string | null
  jurisdiction: string | null
  output_tax: string
  input_tax: string
  net_liability: string
}

/**
 * Sales tax / VAT liability by jurisdiction (US-ACC-048/049) — read from the
 * real posted GL, not the invoice/bill subledger: `issueInvoice`/
 * `approveBill` post one line per `tax_rate_id` to `taxPayable`/`inputTax`
 * (grouped, since one invoice can mix rates), and this sums those lines
 * straight from `journal_entry_lines`. `tax_rate_id IS NULL` is its own,
 * explicitly-labelled row — tax that was posted but never attributed to a
 * jurisdiction — rather than silently folded into a real one.
 */
export async function taxLiabilitySummary(
  tx: Tx,
  filters: { from?: string; to?: string } = {},
): Promise<TaxLiabilityRow[]> {
  const from = filters.from || null
  const to = filters.to || null
  return tx<TaxLiabilityRow[]>`
    SELECT l.tax_rate_id, r.code, r.jurisdiction,
           coalesce(sum(l.credit_amount) FILTER (WHERE a.account_code = '2200'), 0)::text
             AS output_tax,
           coalesce(sum(l.debit_amount) FILTER (WHERE a.account_code = '1200'), 0)::text
             AS input_tax,
           (coalesce(sum(l.credit_amount) FILTER (WHERE a.account_code = '2200'), 0)
             - coalesce(sum(l.debit_amount) FILTER (WHERE a.account_code = '1200'), 0))::text
             AS net_liability
      FROM journal_entry_lines l
      JOIN journal_entries je ON je.id = l.entry_id AND je.status = 'posted'
      JOIN chart_of_accounts a ON a.id = l.account_id
      LEFT JOIN tax_rates r ON r.id = l.tax_rate_id
     WHERE a.account_code IN ('2200', '1200')
       AND (${from}::date IS NULL OR je.entry_date >= ${from}::date)
       AND (${to}::date   IS NULL OR je.entry_date <= ${to}::date)
     GROUP BY l.tax_rate_id, r.code, r.jurisdiction
     ORDER BY r.code NULLS LAST
  `
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

/**
 * Same cap and reasoning as `DOCUMENT_CHILD_CAP` above — a real journal
 * entry's line count is bounded by what a person can post at once, not by
 * tenure. Applied PER ENTRY here (a `LATERAL` limit), not to the batch as a
 * whole, so one oversized entry on the page can't crowd out every other
 * entry's lines.
 */
const LEDGER_ENTRY_LINE_CAP = 500

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
     LIMIT ${LEDGER_ENTRY_LINE_CAP}
  `
}

/** Every line for a set of entries, in one query — avoids N+1 as rows expand, and caps each entry the same way `ledgerLines` does. */
export async function ledgerLinesForEntries(
  tx: Tx,
  entryIds: string[],
): Promise<Record<string, LedgerLine[]>> {
  if (entryIds.length === 0) return {}
  const rows = await tx<(LedgerLine & { entry_id: string })[]>`
    SELECT je.id::text AS entry_id, lines.*
      FROM journal_entries je
      CROSS JOIN LATERAL (
        SELECT l.id, l.line_number,
               a.account_code, a.account_name,
               l.description,
               l.debit_amount::text  AS debit_amount,
               l.credit_amount::text AS credit_amount,
               l.currency
          FROM journal_entry_lines l
          LEFT JOIN chart_of_accounts a ON a.id = l.account_id
         WHERE l.entry_id = je.id
         ORDER BY l.line_number NULLS LAST
         LIMIT ${LEDGER_ENTRY_LINE_CAP}
      ) lines
     WHERE je.id = ANY(${entryIds}::uuid[])
     ORDER BY je.id
  `
  const out: Record<string, LedgerLine[]> = {}
  for (const r of rows) {
    const { entry_id, ...line } = r
    ;(out[entry_id] ??= []).push(line)
  }
  return out
}

// ---------------------------------------------------------------------------
// Writes — the receivables cycle, posted to the ledger
// ---------------------------------------------------------------------------
//
// Every write that recognises revenue or receives cash posts a BALANCED
// journal entry in the same transaction as the document it describes.
// A zero-amount line is never written: ck_journal_entry_lines_one_sided_positive
// forbids it, so a tax-free invoice posts two lines, not three.
//
// Bills reuse this same postJournal (payables.repo.ts); banking and
// reconciliation still have no write path.

/**
 * What an invoice's status may be. Plain `varchar` with no CHECK behind it, so
 * this list IS the constraint — and it lives beside the reader so the filter,
 * the create form and the transitions cannot disagree (L57).
 */
export const INVOICE_STATUSES = [
  "draft",
  "sent",
  "partial",
  "paid",
  "overdue",
  "void",
  // Fully resolved via a credit memo, not cash — never "paid", which would
  // misreport that money was received.
  "credited",
  // Fully resolved by recognising the loss, not a customer-facing
  // adjustment — distinct from "credited" so a report can tell "the
  // customer disputed this" from "we don't expect to collect this".
  "written_off",
] as const
export type InvoiceStatus = (typeof INVOICE_STATUSES)[number]

/** The accounts the receivables cycle posts to, by code rather than by id. */
const ACCOUNTS = {
  cash: "1000",
  receivable: "1100",
  taxPayable: "2200",
  retainedEarnings: "3000",
  revenue: "4000",
  badDebtExpense: "5500",
  /**
   * Netted — one account for both directions (a debit line for a loss, a
   * credit line for a gain), a standard small-business practice. Not every
   * tenant's chart of accounts has this seeded; `accountIdOrNull` is used
   * for it specifically so a settlement degrades to today's 2-line entry
   * instead of throwing on a tenant with no such account.
   */
  fxGainLoss: "4200",
} as const

export class AccountingRefused extends Error {
  constructor(
    readonly reason:
      | "no_such_invoice"
      | "no_such_bill"
      | "no_such_account"
      | "no_such_customer"
      | "no_such_vendor"
      | "wrong_status"
      | "no_lines"
      // Kept distinct from no_lines so a broken posting can't pass as it (L60).
      | "does_not_balance"
      | "period_closed"
      | "overpayment"
      | "number_taken"
      // The approver may not also be the payer — same rule as payroll's
      // calculated_by/approved_by, applied across bills and payments instead
      // of within one row (payroll_runs.repo.ts).
      | "self_approval"
      | "no_such_bank_transaction"
      | "no_such_payment"
      | "currency_mismatch"
      // A credit can only match money IN (a customer payment) and a debit
      // only money OUT (a vendor payment) — the sign of bank_transactions.amount
      // against which id is set on the payment.
      | "direction_mismatch"
      // A payment already tied to a different bank_transaction — no unique
      // constraint enforces this (matched_to_id is polymorphic, not an FK),
      // so it is a repo-layer check, same shape as self_approval.
      | "already_matched"
      // A lockbox batch named an invoice that belongs to a different
      // customer than the one the payment is against.
      | "wrong_customer"
      // The same invoice named twice in one lockbox batch — a data-entry
      // mistake to refuse outright, not a "pay it twice" to silently honor.
      | "duplicate_invoice"
      // The sum of a lockbox batch's per-invoice allocations doesn't match
      // the total the payment says was received — a rule no single
      // FormReader field can express, so it is asserted here in SQL/NUMERIC
      // rather than trusted from the page's own arithmetic.
      | "allocation_mismatch"
      // A credit memo larger than what the invoice still owes — distinct
      // from `overpayment` since nothing was actually paid.
      | "over_credit"
      // Same shape as `over_credit`, kept distinct so the write-off form's
      // own field is the one marked, not the credit memo form's.
      | "over_writeoff"
      | "no_such_period"
      // US-ACC-050: a line carries tax for a customer exempt as of the
      // invoice's own date.
      | "customer_tax_exempt",
    readonly detail?: string,
  ) {
    super(reason)
    this.name = "AccountingRefused"
  }
}

async function accountId(tx: Tx, code: string): Promise<string> {
  const [row] = await tx<{ id: string }[]>`
    SELECT id FROM chart_of_accounts WHERE account_code = ${code}
  `
  if (!row) throw new AccountingRefused("no_such_account", code)
  return row.id
}

/** Like `accountId`, but `null` instead of throwing when the code is unseeded. */
export async function accountIdOrNull(
  tx: Tx,
  code: string,
): Promise<string | null> {
  const [row] = await tx<{ id: string }[]>`
    SELECT id FROM chart_of_accounts WHERE account_code = ${code}
  `
  return row?.id ?? null
}

/**
 * Recompute an invoice's money columns from its lines and payments — recomputed,
 * never adjusted (L58). base_total sums the two rounded parts rather than
 * rounding the total independently, so it stays equal to base_subtotal + base_tax_total (L25).
 *
 * `subtotal` nets each line's `discount_amount` here, once, so every
 * downstream figure (base_subtotal, total, amount_due) is discount-aware
 * without a separate adjustment — a line with no discount (the only kind
 * that existed before `createInvoice`) nets against zero and is unchanged.
 */
export async function recomputeInvoiceTotals(
  tx: Tx,
  invoiceId: string,
): Promise<void> {
  await tx`
    WITH line_totals AS (
      SELECT coalesce(sum(l.amount), 0)
               - coalesce(sum(l.discount_amount), 0) AS subtotal,
             coalesce(sum(l.tax_amount), 0)           AS tax_total
        FROM invoice_lines l WHERE l.invoice_id = ${invoiceId}::uuid
    ),
    paid AS (
      SELECT coalesce(sum(a.amount), 0)      AS amount_paid,
             coalesce(sum(a.base_amount), 0) AS base_amount_paid
        FROM payment_allocations a WHERE a.invoice_id = ${invoiceId}::uuid
    ),
    credited AS (
      SELECT coalesce(sum(c.amount), 0)      AS amount_credited,
             coalesce(sum(c.base_amount), 0) AS base_amount_credited
        FROM invoice_credits c WHERE c.invoice_id = ${invoiceId}::uuid
    )
    UPDATE invoices i
       SET subtotal        = lt.subtotal,
           tax_total       = lt.tax_total,
           total           = lt.subtotal + lt.tax_total,
           amount_paid     = p.amount_paid,
           amount_credited = cr.amount_credited,
           amount_due      = (lt.subtotal + lt.tax_total) - p.amount_paid - cr.amount_credited,
           -- Round each part first, then sum, so base_total stays exact.
           base_subtotal        = round(lt.subtotal  * i.exchange_rate, 2),
           base_tax_total       = round(lt.tax_total * i.exchange_rate, 2),
           base_total           = round(lt.subtotal  * i.exchange_rate, 2)
                                + round(lt.tax_total * i.exchange_rate, 2),
           base_amount_paid     = p.base_amount_paid,
           base_amount_credited = cr.base_amount_credited,
           base_amount_due      = round(lt.subtotal  * i.exchange_rate, 2)
                                + round(lt.tax_total * i.exchange_rate, 2)
                                - p.base_amount_paid
                                - cr.base_amount_credited,
           updated_at = now()
      FROM line_totals lt, paid p, credited cr
     WHERE i.id = ${invoiceId}::uuid
  `
}

/**
 * The next `<PREFIX>-<year>-nnn...`, from the numbers already in use — a
 * scan-and-increment, not a locked counter. One shape shared by every
 * document series in this module (journal entries, invoices, payments,
 * credit memos/write-offs, vendor payments): a race between two concurrent
 * writers computing the same "next" number hits the series' own UNIQUE
 * index rather than sharing one, and each caller turns that into its own
 * refusal (`createInvoice`'s retry loop, `AccountingRefused("number_taken")`).
 *
 * `table`/`column` are always internal constants, never request input, so
 * interpolating them as identifiers via `tx.unsafe()` — the same pattern
 * `INVOICE_SELECT`/`BILL_SELECT` already use for a query's `FROM`/`SELECT`
 * text — is safe. `prefix` is a normal bound parameter, not nested inside
 * that `unsafe()` text, so this isn't the nested-fragment shape documented
 * on `cashFlowStatement` as dropping all but the first bind value; the same
 * two-identifier, one-bound-param shape already runs in production as
 * `projects.repo.ts`'s `nextNumber()`.
 */
export async function nextSequenceNumber(
  tx: Tx,
  table: string,
  column: string,
  prefix: string,
  year: string | number,
  padWidth: number,
): Promise<string> {
  const [row] = await tx<{ n: number }[]>`
    SELECT coalesce(max(nullif(substring(${tx.unsafe(column)} from '[0-9]+$'), '')::int),
                    0) + 1 AS n
      FROM ${tx.unsafe(table)} WHERE ${tx.unsafe(column)} LIKE ${prefix + "-%"}
  `
  return `${prefix}-${year}-${String(row.n).padStart(padWidth, "0")}`
}

async function nextEntryNumber(tx: Tx, year: number): Promise<string> {
  return nextSequenceNumber(
    tx,
    "journal_entries",
    "entry_number",
    "JE",
    year,
    4,
  )
}

async function nextInvoiceNumber(tx: Tx, year: number): Promise<string> {
  return nextSequenceNumber(tx, "invoices", "invoice_number", "INV", year, 3)
}

/** postgres.js surfaces the SQLSTATE on the error; 23505 is unique_violation. */
function isUniqueViolation(e: unknown): boolean {
  return (
    typeof e === "object" && e !== null && "code" in e && e.code === "23505"
  )
}

/** One side of a journal entry, before it is written. */
export type JournalLine = {
  accountCode: string
  debit: string | null
  credit: string | null
  description: string
  /** Which jurisdiction this tax line belongs to — unset for every non-tax line. */
  taxRateId?: string | null
}

/**
 * Write a balanced journal entry; refuses anything that doesn't balance.
 * Zero-amount lines are dropped before insert (a tax-free invoice posts two
 * lines, not three). Amounts stay strings; base_* uses the same round-then-sum
 * discipline as the invoice header.
 */
export async function postJournal(
  tx: Tx,
  tenantId: string,
  entry: {
    date: string
    sourceType: string
    /** Null when an entry spans more than one source row — a lockbox payment across several invoices, for instance. */
    sourceId: string | null
    description: string
    reference: string | null
    currency: string
    exchangeRate: string
    lines: JournalLine[]
  },
  actorId: string,
): Promise<string> {
  const live = entry.lines.filter(
    (l) => Number(l.debit ?? 0) !== 0 || Number(l.credit ?? 0) !== 0,
  )

  // Zero real lines "balances" trivially (0 = 0) and would otherwise insert
  // a header row for nothing; one line "balances" only if it carries both a
  // debit AND a credit, which is not a real double-entry line. Both current
  // callers (issueInvoice/approveBill) already refuse a zero-line
  // invoice/bill first, so this is unreachable through them today — the
  // guard belongs here anyway so a future third caller can't skip it.
  if (live.length < 2) {
    throw new AccountingRefused(
      "no_lines",
      `only ${live.length} line(s) after removing zero-amount ones`,
    )
  }

  // A closed/locked accounting period refuses new postings (INV-ACC-002). A
  // date in no period at all is allowed — nothing to refuse against.
  const [period] = await tx<{ period_name: string; status: string }[]>`
    SELECT period_name, status
      FROM accounting_periods
     WHERE ${entry.date}::date BETWEEN start_date AND end_date
       AND coalesce(status, 'open') <> 'open'
     LIMIT 1
  `
  if (period) {
    throw new AccountingRefused(
      "period_closed",
      `${period.period_name} is ${period.status}`,
    )
  }

  const year = Number(entry.date.slice(0, 4))
  const entryNumber = await nextEntryNumber(tx, year)

  const [head] = await tx<{ id: string }[]>`
    INSERT INTO journal_entries (
      tenant_id, entry_number, entry_date, source_type, source_id,
      description, reference, status, accounting_period, fiscal_year,
      posted_at, posted_by, created_by
    ) VALUES (
      ${tenantId}::uuid, ${entryNumber}, ${entry.date}::date,
      ${entry.sourceType}, ${entry.sourceId}::uuid,
      ${entry.description}, ${entry.reference}, 'posted',
      ${entry.date.slice(0, 7)}, ${year},
      now(), ${actorId}::uuid, ${actorId}::uuid
    )
    RETURNING id
  `

  let lineNumber = 0
  for (const line of live) {
    lineNumber += 1
    await tx`
      INSERT INTO journal_entry_lines (
        tenant_id, entry_id, account_id, line_number, currency,
        debit_amount, credit_amount, exchange_rate,
        base_currency, base_debit_amount, base_credit_amount, description,
        tax_rate_id
      ) VALUES (
        ${tenantId}::uuid, ${head.id}::uuid,
        ${await accountId(tx, line.accountCode)}::uuid,
        ${lineNumber}, ${entry.currency},
        ${line.debit ?? "0"}::numeric, ${line.credit ?? "0"}::numeric,
        ${entry.exchangeRate}::numeric,
        'USD',
        round(${line.debit ?? "0"}::numeric  * ${entry.exchangeRate}::numeric, 2),
        round(${line.credit ?? "0"}::numeric * ${entry.exchangeRate}::numeric, 2),
        ${line.description}, ${line.taxRateId ?? null}::uuid
      )
    `
  }

  // Asserted against what was actually written, not what was intended.
  const [check] = await tx<{ d: string; c: string; bd: string; bc: string }[]>`
    SELECT coalesce(sum(debit_amount),0)::text       AS d,
           coalesce(sum(credit_amount),0)::text      AS c,
           coalesce(sum(base_debit_amount),0)::text  AS bd,
           coalesce(sum(base_credit_amount),0)::text AS bc
      FROM journal_entry_lines WHERE entry_id = ${head.id}::uuid
  `
  if (check.d !== check.c) {
    throw new AccountingRefused(
      "does_not_balance",
      `debits ${check.d} against credits ${check.c}`,
    )
  }
  // The native side can balance while the base side doesn't: base_* is
  // rounded PER LINE (L25), so a sum of rounded values is not the same as
  // rounding the sum — reachable whenever amounts and an exchange rate are
  // both free-form, as they are for a manual entry (unlike an invoice/bill's
  // computed lines, which round the same way on every line).
  if (check.bd !== check.bc) {
    throw new AccountingRefused(
      "does_not_balance",
      `debits ${check.d} equal credits ${check.c}, but after converting to base currency at this exchange rate, base debits ${check.bd} do not equal base credits ${check.bc}`,
    )
  }

  return head.id
}

/** One side of a manual journal entry, as the picker on the page names it. */
export type ManualJournalLine = {
  accountId: string
  debit: string
  credit: string
  description: string
}

/**
 * A manual journal entry (US-ACC-034) — an adjustment or correction with no
 * invoice/bill behind it, so `postJournal`'s `sourceType`/`sourceId` are
 * `"manual"`/`null`. The only thing this adds over `postJournal` itself is
 * resolving the picker's account ids to codes, in one query rather than one
 * per line, before the shared balancing/period/audit machinery takes over.
 */
export async function recordManualJournalEntry(
  tx: Tx,
  tenantId: string,
  input: {
    date: string
    description: string
    reference: string | null
    currency: string
    exchangeRate: string
    lines: ManualJournalLine[]
  },
  actorId: string,
): Promise<{ id: string; entryNumber: string; totalDebit: string }> {
  const ids = input.lines.map((l) => l.accountId)
  const accounts = await tx<{ id: string; account_code: string }[]>`
    SELECT id, account_code FROM chart_of_accounts WHERE id = ANY(${ids}::uuid[])
  `
  const codeById = new Map(accounts.map((a) => [a.id, a.account_code]))
  const lines: JournalLine[] = input.lines.map((l) => {
    const accountCode = codeById.get(l.accountId)
    if (!accountCode) {
      throw new AccountingRefused("no_such_account", l.accountId)
    }
    return {
      accountCode,
      debit: l.debit,
      credit: l.credit,
      description: l.description,
    }
  })

  const id = await postJournal(
    tx,
    tenantId,
    {
      date: input.date,
      sourceType: "manual",
      sourceId: null,
      description: input.description,
      reference: input.reference,
      currency: input.currency,
      exchangeRate: input.exchangeRate,
      lines,
    },
    actorId,
  )

  const [posted] = await tx<{ entry_number: string; total_debit: string }[]>`
    SELECT je.entry_number,
           coalesce(sum(l.debit_amount), 0)::text AS total_debit
      FROM journal_entries je
      JOIN journal_entry_lines l ON l.entry_id = je.id
     WHERE je.id = ${id}::uuid
     GROUP BY je.entry_number
  `
  return {
    id,
    entryNumber: posted.entry_number,
    totalDebit: posted.total_debit,
  }
}

type InvoiceState = {
  status: InvoiceStatus
  currency: string
  exchange_rate: string
  invoice_number: string
  invoice_date: string
  total: string
  subtotal: string
  tax_total: string
  amount_due: string
  line_count: number
  journal_entry_id: string | null
}

async function invoiceState(tx: Tx, id: string): Promise<InvoiceState> {
  const [row] = await tx<InvoiceState[]>`
    SELECT i.status, i.currency, i.exchange_rate::text AS exchange_rate,
           i.invoice_number,
           to_char(i.invoice_date,'YYYY-MM-DD') AS invoice_date,
           i.total::text      AS total,
           i.subtotal::text   AS subtotal,
           i.tax_total::text  AS tax_total,
           i.amount_due::text AS amount_due,
           i.journal_entry_id,
           (SELECT count(*)::int FROM invoice_lines l WHERE l.invoice_id = i.id)
             AS line_count
      FROM invoices i WHERE i.id = ${id}::uuid
  `
  if (!row) throw new AccountingRefused("no_such_invoice")
  return row
}

export type CustomerOption = {
  id: string
  customer_name: string
  currency: string
}

/** For the invoice-create picker — active customers only. */
export async function listCustomersForPicker(
  tx: Tx,
): Promise<CustomerOption[]> {
  return tx<CustomerOption[]>`
    SELECT id, customer_name, currency
      FROM customers
     WHERE is_active
     ORDER BY customer_name
  `
}

/** One line as submitted on the create form, before it is priced. */
export type NewInvoiceLine = {
  description: string
  quantity: string
  unitPrice: string
  discountPercent: string
  taxAmount: string
  /** Which configured rate this line's tax belongs to — a reference only, not a computation (US-ACC-048/049). */
  taxRateId?: string | null
}

/**
 * Create a draft invoice with its lines. Posts nothing — `issueInvoice` is
 * the money-moving step; this only makes the row exist. Refused with no
 * lines, the same reason `issueInvoice` uses for the same shape (L60: kept
 * distinct from a broken posting), and with no such customer if the picker
 * pointed at a row that is gone by the time this write lands.
 */
export async function createInvoice(
  tx: Tx,
  tenantId: string,
  input: {
    customerId: string
    invoiceDate: string
    dueDate: string
    exchangeRate: string
    paymentTerms: string | null
    notes: string | null
    lines: NewInvoiceLine[]
  },
  actorId: string,
): Promise<{ id: string; invoiceNumber: string }> {
  if (input.lines.length === 0) throw new AccountingRefused("no_lines")

  const [customer] = await tx<
    {
      currency: string
      is_tax_exempt: boolean
      tax_exempt_until: string | null
    }[]
  >`
    SELECT currency, is_tax_exempt, tax_exempt_until::text
      FROM customers WHERE id = ${input.customerId}::uuid
  `
  if (!customer) throw new AccountingRefused("no_such_customer")

  // US-ACC-050: exempt as of THIS invoice's date, not today — an exemption
  // that has since expired does not retroactively apply, and one that starts
  // later does not apply early. `tax_exempt_until` NULL means indefinite.
  const isExemptNow =
    customer.is_tax_exempt &&
    (customer.tax_exempt_until === null ||
      input.invoiceDate <= customer.tax_exempt_until)
  if (
    isExemptNow &&
    input.lines.some((l) => compareDecimal(l.taxAmount, "0") !== 0)
  ) {
    throw new AccountingRefused("customer_tax_exempt")
  }

  const [tenant] = await tx<{ default_currency: string }[]>`
    SELECT default_currency FROM tenants WHERE id = ${tenantId}::uuid
  `
  const baseCurrency = tenant?.default_currency ?? "USD"

  // Every line posts to the one revenue account issueInvoice knows about —
  // per-line revenue_account_id is a real column but issueInvoice always
  // posts the whole subtotal to ACCOUNTS.revenue, so a per-line choice here
  // would be a UI promise the posting step does not keep.
  const revenueAccountId = await accountId(tx, ACCOUNTS.revenue)
  const year = Number(input.invoiceDate.slice(0, 4))

  // A race between two concurrent creates can compute the same "next"
  // number (nextInvoiceNumber is a scan, not a lock) — retry a bounded
  // number of times before actually refusing, rather than looping forever
  // on a genuine, unrelated bug.
  let invoiceId: string | undefined
  let invoiceNumber = ""
  for (let attempt = 0; attempt < 5 && invoiceId === undefined; attempt++) {
    invoiceNumber = await nextInvoiceNumber(tx, year)
    try {
      const [row] = await tx<{ id: string }[]>`
        INSERT INTO invoices (
          tenant_id, customer_id, invoice_number, invoice_date, due_date,
          currency, exchange_rate, base_currency,
          subtotal, tax_total, total, amount_paid, amount_due,
          base_subtotal, base_tax_total, base_total,
          base_amount_paid, base_amount_due,
          payment_terms, notes, status, created_by
        ) VALUES (
          ${tenantId}::uuid, ${input.customerId}::uuid, ${invoiceNumber},
          ${input.invoiceDate}::date, ${input.dueDate}::date,
          ${customer.currency}, ${input.exchangeRate}::numeric, ${baseCurrency},
          0, 0, 0, 0, 0,
          0, 0, 0, 0, 0,
          ${input.paymentTerms}, ${input.notes}, 'draft', ${actorId}::uuid
        )
        RETURNING id
      `
      invoiceId = row.id
    } catch (e) {
      if (!isUniqueViolation(e)) throw e
      // another create took this number; loop and try the next
    }
  }
  if (invoiceId === undefined) throw new AccountingRefused("number_taken")

  let lineNumber = 0
  for (const line of input.lines) {
    lineNumber += 1
    await tx`
      INSERT INTO invoice_lines (
        tenant_id, invoice_id, line_number, description, quantity, unit_price,
        amount, discount_percent, discount_amount, tax_amount, tax_rate_id,
        revenue_account_id
      ) VALUES (
        ${tenantId}::uuid, ${invoiceId}::uuid, ${lineNumber}, ${line.description},
        ${line.quantity}::numeric, ${line.unitPrice}::numeric,
        round(${line.quantity}::numeric * ${line.unitPrice}::numeric, 2),
        ${line.discountPercent}::numeric,
        round(${line.quantity}::numeric * ${line.unitPrice}::numeric
              * ${line.discountPercent}::numeric / 100, 2),
        ${line.taxAmount}::numeric, ${line.taxRateId ?? null}::uuid,
        ${revenueAccountId}::uuid
      )
    `
  }

  await recomputeInvoiceTotals(tx, invoiceId)
  return { id: invoiceId, invoiceNumber }
}

/**
 * Issue a draft invoice and recognise the revenue.
 *
 *   DR Accounts Receivable   total
 *     CR Revenue                    subtotal
 *     CR Sales Tax Payable          tax        (omitted when zero)
 *
 * Refused with no lines.
 */
export async function issueInvoice(
  tx: Tx,
  tenantId: string,
  invoiceId: string,
  actorId: string,
): Promise<{ from: InvoiceStatus; entryNumber: string }> {
  const before = await invoiceState(tx, invoiceId)
  if (before.status !== "draft") {
    throw new AccountingRefused("wrong_status", `${before.status} is not draft`)
  }
  if (before.line_count === 0) throw new AccountingRefused("no_lines")

  // Recompute first so the journal posts figures the lines actually support.
  await recomputeInvoiceTotals(tx, invoiceId)
  const current = await invoiceState(tx, invoiceId)

  // US-ACC-050: re-checked here, not just in createInvoice — a draft can be
  // created before an exemption is set, or issued after one has expired, and
  // this is the step that actually posts tax to the ledger.
  const [customer] = await tx<
    { is_tax_exempt: boolean; tax_exempt_until: string | null }[]
  >`
    SELECT c.is_tax_exempt, c.tax_exempt_until::text
      FROM customers c JOIN invoices i ON i.customer_id = c.id
     WHERE i.id = ${invoiceId}::uuid
  `
  const isExemptNow =
    customer.is_tax_exempt &&
    (customer.tax_exempt_until === null ||
      current.invoice_date <= customer.tax_exempt_until)
  if (isExemptNow && compareDecimal(current.tax_total, "0") !== 0) {
    throw new AccountingRefused("customer_tax_exempt")
  }

  // Grouped by rate, one GL line per jurisdiction (US-ACC-048/049) — a lump
  // sum here would make every taxed invoice's liability unattributable, and
  // an invoice mixing rates would silently collapse them into one.
  const taxByRate = await tx<{ tax_rate_id: string | null; amount: string }[]>`
    SELECT tax_rate_id, sum(tax_amount)::text AS amount
      FROM invoice_lines
     WHERE invoice_id = ${invoiceId}::uuid AND tax_amount <> 0
     GROUP BY tax_rate_id
  `

  const entryId = await postJournal(
    tx,
    tenantId,
    {
      date: current.invoice_date,
      sourceType: "invoice",
      sourceId: invoiceId,
      description: `Invoice ${current.invoice_number} raised`,
      reference: current.invoice_number,
      currency: current.currency,
      exchangeRate: current.exchange_rate,
      lines: [
        {
          accountCode: ACCOUNTS.receivable,
          debit: current.total,
          credit: null,
          description: `Invoice ${current.invoice_number}`,
        },
        {
          accountCode: ACCOUNTS.revenue,
          debit: null,
          credit: current.subtotal,
          description: `Invoice ${current.invoice_number}`,
        },
        ...taxByRate.map((t) => ({
          accountCode: ACCOUNTS.taxPayable,
          debit: null,
          credit: t.amount,
          description: `Tax on ${current.invoice_number}`,
          taxRateId: t.tax_rate_id,
        })),
      ],
    },
    actorId,
  )

  await tx`
    UPDATE invoices
       SET status = 'sent', sent_at = now(),
           journal_entry_id = ${entryId}::uuid,
           updated_at = now(), updated_by = ${actorId}::uuid
     WHERE id = ${invoiceId}::uuid
  `

  const [entry] = await tx<{ entry_number: string }[]>`
    SELECT entry_number FROM journal_entries WHERE id = ${entryId}::uuid
  `
  return { from: before.status, entryNumber: entry.entry_number }
}

/**
 * Recompute an invoice after a payment lands against it, and settle its
 * status: `paid` only when the balance reaches exactly zero (decided in
 * SQL against NUMERIC zero, never by parsing the string), `partial`
 * otherwise. Shared by `recordPayment()`'s single invoice and
 * `recordLockboxPayment()`'s per-invoice loop over one batch — the two
 * call sites differ only in how many invoices they settle, not in what
 * settling one means.
 */
async function settleInvoiceAfterPayment(
  tx: Tx,
  invoiceId: string,
  actorId: string,
): Promise<InvoiceStatus> {
  await recomputeInvoiceTotals(tx, invoiceId)
  const [settled] = await tx<{ due: string }[]>`
    SELECT amount_due::text AS due FROM invoices WHERE id = ${invoiceId}::uuid
  `
  const [state] = await tx<{ fully_paid: boolean }[]>`
    SELECT ${settled.due}::numeric = 0 AS fully_paid
  `
  const status: InvoiceStatus = state.fully_paid ? "paid" : "partial"
  await tx`
    UPDATE invoices
       SET status = ${status},
           paid_at = ${state.fully_paid ? tx`now()` : null},
           updated_at = now(), updated_by = ${actorId}::uuid
     WHERE id = ${invoiceId}::uuid
  `
  return status
}

/**
 * The base-currency delta between cash moving at the settlement-date rate
 * and the same amount booked at the invoice/bill's own rate (US-ACC-054).
 * Direction-neutral on purpose: whether `cashBaseGreater` means a gain or a
 * loss depends on which side of the entry the cash line sits on — an AR
 * settlement's cash line is a debit, a payables one a credit, so the same
 * relationship reads as the opposite outcome. The caller decides that; this
 * only computes the numbers, in one query so both figures round the same
 * way the journal lines they feed will.
 */
export async function settlementFxDelta(
  tx: Tx,
  params: {
    currency: string
    amount: string
    bookingRate: string
    settlementDate: string
  },
): Promise<{
  cashBase: string
  bookingBase: string
  deltaAbs: string
  cashBaseGreater: boolean
  noMovement: boolean
}> {
  if (params.currency === "USD") {
    // No FX rate applies to USD itself — skip the lookup query on what is
    // the common case for a domestic tenant.
    return {
      cashBase: params.amount,
      bookingBase: params.amount,
      deltaAbs: "0",
      cashBaseGreater: false,
      noMovement: true,
    }
  }

  let settlementRate = await rateAsOf(
    tx,
    params.currency,
    params.settlementDate,
  )
  if (settlementRate === null) {
    log.info({
      msg: "no exchange rate on file for the settlement date; settling at the booking rate, no FX gain/loss recognized",
      currency: params.currency,
      settlementDate: params.settlementDate,
    })
    settlementRate = params.bookingRate
  }

  const [row] = await tx<
    {
      cash_base: string
      booking_base: string
      delta_abs: string
      cash_base_greater: boolean
      no_movement: boolean
    }[]
  >`
    SELECT round(${params.amount}::numeric * ${settlementRate}::numeric, 2)::text AS cash_base,
           round(${params.amount}::numeric * ${params.bookingRate}::numeric, 2)::text AS booking_base,
           abs(round(${params.amount}::numeric * ${settlementRate}::numeric, 2)
             - round(${params.amount}::numeric * ${params.bookingRate}::numeric, 2))::text AS delta_abs,
           round(${params.amount}::numeric * ${settlementRate}::numeric, 2)
             > round(${params.amount}::numeric * ${params.bookingRate}::numeric, 2) AS cash_base_greater,
           round(${params.amount}::numeric * ${settlementRate}::numeric, 2)
             = round(${params.amount}::numeric * ${params.bookingRate}::numeric, 2) AS no_movement
  `
  return {
    cashBase: row.cash_base,
    bookingBase: row.booking_base,
    deltaAbs: row.delta_abs,
    cashBaseGreater: row.cash_base_greater,
    noMovement: row.no_movement,
  }
}

/**
 * Receive money against an invoice.
 *
 *   DR Cash at Bank            amount
 *     CR Accounts Receivable          amount
 *
 * Refused if it would overpay — checked here so the message is useful rather
 * than a bare CHECK-constraint failure.
 *
 * When the settlement-date rate differs from the invoice's own booking rate
 * (US-ACC-054), a third line recognizes the realized FX gain/loss against
 * `ACCOUNTS.fxGainLoss` — credited for a gain (cash converts to more USD than
 * the receivable was booked at), debited for a loss. Skipped, falling back
 * to today's two-line entry at the booking rate, when there is no rate on
 * file for the settlement date or the tenant's chart of accounts has no such
 * account — a foreign settlement must never be refused for either reason.
 */
export async function recordPayment(
  tx: Tx,
  tenantId: string,
  input: {
    invoiceId: string
    amount: string
    paymentDate: string
    method: string
    reference: string | null
    bankAccountId: string | null
  },
  actorId: string,
): Promise<{ paymentNumber: string; status: InvoiceStatus }> {
  const before = await invoiceState(tx, input.invoiceId)
  if (before.status === "draft" || before.status === "void") {
    throw new AccountingRefused(
      "wrong_status",
      `${before.status} cannot receive a payment`,
    )
  }
  // Compared in SQL/NUMERIC, not JS float, since this decides a refusal.
  const [room] = await tx<{ too_much: boolean }[]>`
    SELECT ${input.amount}::numeric > ${before.amount_due}::numeric AS too_much
  `
  if (room.too_much) {
    throw new AccountingRefused("overpayment", before.amount_due)
  }

  const paymentNumber = await nextSequenceNumber(
    tx,
    "payments",
    "payment_number",
    "PAY",
    input.paymentDate.slice(0, 4),
    3,
  )

  const [customer] = await tx<{ customer_id: string }[]>`
    SELECT customer_id FROM invoices WHERE id = ${input.invoiceId}::uuid
  `

  const fx = await settlementFxDelta(tx, {
    currency: before.currency,
    amount: input.amount,
    bookingRate: before.exchange_rate,
    settlementDate: input.paymentDate,
  })
  const fxAccountId = fx.noMovement
    ? null
    : await accountIdOrNull(tx, ACCOUNTS.fxGainLoss)
  const recognizeFx = fxAccountId !== null && !fx.noMovement

  // `postJournal` carries one currency/rate for the whole entry, but a
  // settlement inherently needs two: cash converts at the NEW (settlement)
  // rate while the receivable clears at the OLD (booking) rate. The
  // gain/loss itself has no native-currency equivalent at all — it is a
  // pure base-currency artifact of translation — so when there is one to
  // recognize, the entry is posted directly in USD instead.
  let lines: JournalLine[]
  let entryCurrency: string
  let entryExchangeRate: string
  let fxGainLoss = "0"
  if (recognizeFx) {
    lines = [
      {
        accountCode: ACCOUNTS.cash,
        debit: fx.cashBase,
        credit: null,
        description: paymentNumber,
      },
      {
        accountCode: ACCOUNTS.receivable,
        debit: null,
        credit: fx.bookingBase,
        description: `Against ${before.invoice_number}`,
      },
    ]
    // Cash converting to more USD than the receivable was booked at is a
    // gain (credit); less is a loss (debit) — see `settlementFxDelta`.
    if (fx.cashBaseGreater) {
      lines.push({
        accountCode: ACCOUNTS.fxGainLoss,
        debit: null,
        credit: fx.deltaAbs,
        description: `FX gain on settlement of ${before.invoice_number}`,
      })
      fxGainLoss = fx.deltaAbs
    } else {
      lines.push({
        accountCode: ACCOUNTS.fxGainLoss,
        debit: fx.deltaAbs,
        credit: null,
        description: `FX loss on settlement of ${before.invoice_number}`,
      })
      fxGainLoss = `-${fx.deltaAbs}`
    }
    entryCurrency = "USD"
    entryExchangeRate = "1"
  } else {
    lines = [
      {
        accountCode: ACCOUNTS.cash,
        debit: input.amount,
        credit: null,
        description: paymentNumber,
      },
      {
        accountCode: ACCOUNTS.receivable,
        debit: null,
        credit: input.amount,
        description: `Against ${before.invoice_number}`,
      },
    ]
    entryCurrency = before.currency
    entryExchangeRate = before.exchange_rate
  }

  const entryId = await postJournal(
    tx,
    tenantId,
    {
      date: input.paymentDate,
      sourceType: "payment",
      sourceId: input.invoiceId,
      description: `Payment received against ${before.invoice_number}`,
      reference: paymentNumber,
      currency: entryCurrency,
      exchangeRate: entryExchangeRate,
      lines,
    },
    actorId,
  )

  const [payment] = await tx<{ id: string }[]>`
    INSERT INTO payments (
      tenant_id, payment_number, payment_date, reference, customer_id,
      currency, amount, exchange_rate, base_amount, payment_method,
      bank_account_id, status, journal_entry_id, created_by
    ) VALUES (
      ${tenantId}::uuid, ${paymentNumber}, ${input.paymentDate}::date,
      ${input.reference}, ${customer.customer_id}::uuid,
      ${before.currency}, ${input.amount}::numeric,
      ${before.exchange_rate}::numeric,
      round(${input.amount}::numeric * ${before.exchange_rate}::numeric, 2),
      ${input.method}::payment_method,
      ${input.bankAccountId}::uuid, 'completed', ${entryId}::uuid,
      ${actorId}::uuid
    )
    RETURNING id
  `

  await tx`
    INSERT INTO payment_allocations (
      tenant_id, payment_id, invoice_id, amount, base_amount, fx_gain_loss
    ) VALUES (
      ${tenantId}::uuid, ${payment.id}::uuid, ${input.invoiceId}::uuid,
      ${input.amount}::numeric,
      round(${input.amount}::numeric * ${before.exchange_rate}::numeric, 2),
      ${fxGainLoss}::numeric
    )
  `

  const status = await settleInvoiceAfterPayment(tx, input.invoiceId, actorId)

  return { paymentNumber, status }
}

export type LockboxAllocation = { invoiceId: string; amount: string }

/**
 * Receive one payment from a customer and allocate it across several of
 * their open invoices in one transaction — lockbox/remittance-style, unlike
 * `recordPayment()`'s one-invoice shape. One `payments` row, one
 * `payment_allocations` row per invoice, one journal entry:
 *
 *   DR Cash at Bank                    total received
 *     CR Accounts Receivable (inv A)          amount A
 *     CR Accounts Receivable (inv B)          amount B
 *     ...
 *
 * `totalAmount` is entered independently of the per-invoice allocations (the
 * known deposit/check total, from a bank statement) and must equal their
 * sum exactly — a rule no single `FormReader` field can express, asserted
 * here in SQL/NUMERIC rather than trusted from the page's own arithmetic.
 */
export async function recordLockboxPayment(
  tx: Tx,
  tenantId: string,
  input: {
    customerId: string
    allocations: LockboxAllocation[]
    totalAmount: string
    paymentDate: string
    method: string
    reference: string | null
    bankAccountId: string | null
  },
  actorId: string,
): Promise<{
  paymentNumber: string
  statuses: { invoiceNumber: string; status: InvoiceStatus }[]
}> {
  if (input.allocations.length === 0) {
    throw new AccountingRefused("no_lines", "no invoices selected")
  }
  const ids = input.allocations.map((a) => a.invoiceId)
  const amounts = input.allocations.map((a) => a.amount)
  if (new Set(ids).size !== ids.length) {
    throw new AccountingRefused("duplicate_invoice")
  }

  const rows = await tx<
    {
      id: string
      status: InvoiceStatus
      currency: string
      exchange_rate: string
      invoice_number: string
      customer_id: string
    }[]
  >`
    SELECT id::text AS id, status, currency, exchange_rate::text AS exchange_rate,
           invoice_number, customer_id::text AS customer_id
      FROM invoices WHERE id = ANY(${ids}::uuid[])
  `
  if (rows.length !== ids.length) throw new AccountingRefused("no_such_invoice")
  const states = new Map(rows.map((r) => [r.id, r]))

  for (const r of rows) {
    if (r.customer_id !== input.customerId) {
      throw new AccountingRefused("wrong_customer", r.invoice_number)
    }
    if (r.status === "draft" || r.status === "void") {
      throw new AccountingRefused(
        "wrong_status",
        `${r.invoice_number} is ${r.status}, which cannot receive a payment`,
      )
    }
  }
  const currencies = new Set(rows.map((r) => r.currency))
  if (currencies.size > 1) {
    throw new AccountingRefused("currency_mismatch", [...currencies].join(", "))
  }
  const { currency, exchange_rate: exchangeRate } = rows[0]

  // Both checked in SQL/NUMERIC, not JS float: an individual overpayment,
  // and the batch's own total against what the allocations actually sum to.
  const [overpaid] = await tx<{ invoice_number: string }[]>`
    SELECT i.invoice_number
      FROM unnest(${ids}::uuid[], ${amounts}::numeric[]) AS a(invoice_id, amount)
      JOIN invoices i ON i.id = a.invoice_id
     WHERE a.amount > i.amount_due
  `
  if (overpaid)
    throw new AccountingRefused("overpayment", overpaid.invoice_number)

  const [{ total }] = await tx<{ total: string }[]>`
    SELECT sum(x)::text AS total FROM unnest(${amounts}::numeric[]) AS x
  `
  const [{ mismatched }] = await tx<{ mismatched: boolean }[]>`
    SELECT ${input.totalAmount}::numeric <> ${total}::numeric AS mismatched
  `
  if (mismatched) {
    throw new AccountingRefused(
      "allocation_mismatch",
      `${input.totalAmount} received but allocations sum to ${total}`,
    )
  }

  const paymentNumber = await nextSequenceNumber(
    tx,
    "payments",
    "payment_number",
    "PAY",
    input.paymentDate.slice(0, 4),
    3,
  )

  const entryId = await postJournal(
    tx,
    tenantId,
    {
      date: input.paymentDate,
      sourceType: "payment",
      sourceId: null,
      description: `Lockbox payment ${paymentNumber} received`,
      reference: paymentNumber,
      currency,
      exchangeRate,
      lines: [
        {
          accountCode: ACCOUNTS.cash,
          debit: total,
          credit: null,
          description: paymentNumber,
        },
        ...input.allocations.map((a) => ({
          accountCode: ACCOUNTS.receivable,
          debit: null,
          credit: a.amount,
          description: `Against ${states.get(a.invoiceId)!.invoice_number}`,
        })),
      ],
    },
    actorId,
  )

  const [payment] = await tx<{ id: string }[]>`
    INSERT INTO payments (
      tenant_id, payment_number, payment_date, reference, customer_id,
      currency, amount, exchange_rate, base_amount, payment_method,
      bank_account_id, status, journal_entry_id, created_by
    ) VALUES (
      ${tenantId}::uuid, ${paymentNumber}, ${input.paymentDate}::date,
      ${input.reference}, ${input.customerId}::uuid,
      ${currency}, ${total}::numeric, ${exchangeRate}::numeric,
      round(${total}::numeric * ${exchangeRate}::numeric, 2),
      ${input.method}::payment_method,
      ${input.bankAccountId}::uuid, 'completed', ${entryId}::uuid,
      ${actorId}::uuid
    )
    RETURNING id
  `

  await tx`
    INSERT INTO payment_allocations (
      tenant_id, payment_id, invoice_id, amount, base_amount
    )
    SELECT ${tenantId}::uuid, ${payment.id}::uuid, a.invoice_id, a.amount,
           round(a.amount * ${exchangeRate}::numeric, 2)
      FROM unnest(${ids}::uuid[], ${amounts}::numeric[]) AS a(invoice_id, amount)
  `

  // One bounded loop over THIS batch's own invoices (a person can only
  // select so many in one lockbox payment), reusing the same
  // settleInvoiceAfterPayment() a single-invoice recordPayment() uses.
  const statuses: { invoiceNumber: string; status: InvoiceStatus }[] = []
  for (const id of ids) {
    const status = await settleInvoiceAfterPayment(tx, id, actorId)
    statuses.push({ invoiceNumber: states.get(id)!.invoice_number, status })
  }

  return { paymentNumber, statuses }
}

/**
 * What distinguishes a credit memo from a bad-debt write-off — everything
 * else (numbering, the reversing journal entry, recomputeInvoiceTotals,
 * over-amount and wrong-status guards) is identical, so both call the same
 * `recordInvoiceCredit()` rather than duplicating it (L57-shaped: one
 * mechanism, a vocabulary of what varies).
 */
type CreditKind = {
  creditType: "credit_memo" | "write_off"
  numberPrefix: "CM" | "WO"
  debitAccountCode: string
  settledStatus: Extract<InvoiceStatus, "credited" | "written_off">
  descriptionVerb: string
  wrongStatusVerb: string
  overAmountReason: Extract<
    InstanceType<typeof AccountingRefused>["reason"],
    "over_credit" | "over_writeoff"
  >
}

/**
 * A non-cash reduction against an issued invoice — reverses recognized
 * revenue (a credit memo) or recognises it as uncollectible (a bad-debt
 * write-off), unlike `recordPayment()`. Refuses more than the invoice's own
 * current balance: an amount larger than what's still owed doesn't
 * correspond to anything real.
 *
 *   DR <kind.debitAccountCode>       amount
 *     CR Accounts Receivable                amount
 *
 * Sets status to `kind.settledStatus` only when it brings the balance to
 * exactly zero — a partial credit or write-off leaves the existing status
 * (partial, sent, overdue) untouched, since something is still genuinely
 * owed.
 */
async function recordInvoiceCredit(
  tx: Tx,
  tenantId: string,
  input: {
    invoiceId: string
    amount: string
    creditDate: string
    reason: string
  },
  actorId: string,
  kind: CreditKind,
): Promise<{ creditNumber: string; status: InvoiceStatus }> {
  const before = await invoiceState(tx, input.invoiceId)
  if (before.status === "draft" || before.status === "void") {
    throw new AccountingRefused(
      "wrong_status",
      `${before.status} cannot ${kind.wrongStatusVerb}`,
    )
  }
  // Compared in SQL/NUMERIC, not JS float, since this decides a refusal.
  const [room] = await tx<{ too_much: boolean }[]>`
    SELECT ${input.amount}::numeric > ${before.amount_due}::numeric AS too_much
  `
  if (room.too_much) {
    throw new AccountingRefused(kind.overAmountReason, before.amount_due)
  }

  const creditNumber = await nextSequenceNumber(
    tx,
    "invoice_credits",
    "credit_number",
    kind.numberPrefix,
    input.creditDate.slice(0, 4),
    3,
  )

  const entryId = await postJournal(
    tx,
    tenantId,
    {
      date: input.creditDate,
      sourceType: kind.creditType,
      sourceId: input.invoiceId,
      description: `${kind.descriptionVerb} ${creditNumber} against ${before.invoice_number}`,
      reference: creditNumber,
      currency: before.currency,
      exchangeRate: before.exchange_rate,
      lines: [
        {
          accountCode: kind.debitAccountCode,
          debit: input.amount,
          credit: null,
          description: creditNumber,
        },
        {
          accountCode: ACCOUNTS.receivable,
          debit: null,
          credit: input.amount,
          description: `Against ${before.invoice_number}`,
        },
      ],
    },
    actorId,
  )

  await tx`
    INSERT INTO invoice_credits (
      tenant_id, invoice_id, credit_number, credit_type, currency, amount,
      exchange_rate, base_amount, reason, journal_entry_id, created_by
    ) VALUES (
      ${tenantId}::uuid, ${input.invoiceId}::uuid, ${creditNumber},
      ${kind.creditType}, ${before.currency}, ${input.amount}::numeric,
      ${before.exchange_rate}::numeric,
      round(${input.amount}::numeric * ${before.exchange_rate}::numeric, 2),
      ${input.reason}, ${entryId}::uuid, ${actorId}::uuid
    )
  `

  await recomputeInvoiceTotals(tx, input.invoiceId)

  const [settled] = await tx<{ due: string }[]>`
    SELECT amount_due::text AS due FROM invoices WHERE id = ${input.invoiceId}::uuid
  `
  // Decided in SQL against NUMERIC zero, not by parsing the string.
  const [state] = await tx<{ fully_settled: boolean }[]>`
    SELECT ${settled.due}::numeric = 0 AS fully_settled
  `
  const status: InvoiceStatus = state.fully_settled
    ? kind.settledStatus
    : before.status

  if (state.fully_settled) {
    await tx`
      UPDATE invoices
         SET status = ${kind.settledStatus},
             updated_at = now(), updated_by = ${actorId}::uuid
       WHERE id = ${input.invoiceId}::uuid
    `
  }

  return { creditNumber, status }
}

export async function recordCreditMemo(
  tx: Tx,
  tenantId: string,
  input: {
    invoiceId: string
    amount: string
    creditDate: string
    reason: string
  },
  actorId: string,
): Promise<{ creditNumber: string; status: InvoiceStatus }> {
  return recordInvoiceCredit(tx, tenantId, input, actorId, {
    creditType: "credit_memo",
    numberPrefix: "CM",
    debitAccountCode: ACCOUNTS.revenue,
    settledStatus: "credited",
    descriptionVerb: "Credit memo",
    wrongStatusVerb: "receive a credit",
    overAmountReason: "over_credit",
  })
}

/**
 * Recognises an invoice's balance (or part of it) as uncollectible — a
 * direct write-off, not routed through a credit memo (US-ACC-020, second
 * half). Debits Bad Debt Expense rather than reversing revenue: the sale
 * still happened, the business just doesn't expect to be paid for it.
 */
export async function recordWriteOff(
  tx: Tx,
  tenantId: string,
  input: {
    invoiceId: string
    amount: string
    creditDate: string
    reason: string
  },
  actorId: string,
): Promise<{ creditNumber: string; status: InvoiceStatus }> {
  return recordInvoiceCredit(tx, tenantId, input, actorId, {
    creditType: "write_off",
    numberPrefix: "WO",
    debitAccountCode: ACCOUNTS.badDebtExpense,
    settledStatus: "written_off",
    descriptionVerb: "Bad debt write-off",
    wrongStatusVerb: "be written off",
    overAmountReason: "over_writeoff",
  })
}

/**
 * Void a draft invoice. Draft only — once issued, reversing revenue is a
 * credit note (a new row), not an edit to the original.
 */
export async function voidInvoice(
  tx: Tx,
  invoiceId: string,
  actorId: string,
  reason: string,
): Promise<{ from: InvoiceStatus }> {
  const before = await invoiceState(tx, invoiceId)
  if (before.status !== "draft") {
    throw new AccountingRefused(
      "wrong_status",
      `${before.status} is issued — reverse it with a credit note, not a void`,
    )
  }
  await tx`
    UPDATE invoices
       SET status = 'void', notes = ${reason},
           updated_at = now(), updated_by = ${actorId}::uuid
     WHERE id = ${invoiceId}::uuid
  `
  return { from: before.status }
}

/**
 * Period management (US-ACC-035, `INV-ACC-002`). `accounting_periods.status`
 * is a plain `varchar` with no CHECK, same shape as every other free-text
 * vocabulary column (L57) — the vocabulary is `"open"`/`"closed"`/`"locked"`,
 * enforced only here. `postJournal` already refuses posting into anything
 * but `"open"` (§1.4); what was missing was a real action to CHANGE that
 * status — before this, the only way a period became `closed`/`locked` was a
 * hand-written fixture row.
 */
export type AccountingPeriod = {
  id: string
  period_name: string
  period_type: string
  start_date: string
  end_date: string
  fiscal_year: number
  status: string
  closed_by_name: string | null
  /** A real instant — postgres.js returns `timestamptz` as a `Date` (L36); don't cast it to text and lose that. */
  closed_at: Date | null
}

export async function listAccountingPeriods(
  tx: Tx,
): Promise<AccountingPeriod[]> {
  return tx<AccountingPeriod[]>`
    SELECT p.id, p.period_name, p.period_type::text AS period_type,
           p.start_date::text, p.end_date::text, p.fiscal_year,
           p.status, p.closed_at,
           e.first_name || ' ' || e.last_name AS closed_by_name
      FROM accounting_periods p
      LEFT JOIN employees e ON e.id::text = p.closed_by::text
     ORDER BY p.start_date DESC
  `
}

async function periodState(
  tx: Tx,
  periodId: string,
): Promise<{ period_name: string; status: string }> {
  const [row] = await tx<{ period_name: string; status: string }[]>`
    SELECT period_name, status FROM accounting_periods WHERE id = ${periodId}::uuid
  `
  if (!row) throw new AccountingRefused("no_such_period", periodId)
  return row
}

/** Closes an open period. No checklist/outstanding-item gate exists yet (§13) — this is the status change alone. */
export async function closePeriod(
  tx: Tx,
  periodId: string,
  actorId: string,
): Promise<{ periodName: string }> {
  const before = await periodState(tx, periodId)
  if (before.status !== "open") {
    throw new AccountingRefused(
      "wrong_status",
      `${before.period_name} is ${before.status}, not open`,
    )
  }
  // A no-op UPDATE must not report success (L68) — the SELECT above proves
  // the row is VISIBLE, not that this actor's write policy permits changing
  // it; `accounting_update`'s RESTRICTIVE `app.writes_accounting()` is a
  // separate check from the read policy this transaction already passed.
  const [updated] = await tx<{ id: string }[]>`
    UPDATE accounting_periods
       SET status = 'closed', closed_by = ${actorId}::uuid, closed_at = now(),
           updated_at = now()
     WHERE id = ${periodId}::uuid
    RETURNING id
  `
  if (!updated) throw new AccountingRefused("no_such_period", periodId)
  return { periodName: before.period_name }
}

/**
 * Reopens a CLOSED period only — not `locked`, the stronger state a period
 * reaches through a separate process this codebase doesn't build yet (a
 * lock is a deliberate act with its own record, same reasoning as period
 * close itself; reopening one would need at least the same ceremony this
 * function already requires, and inventing that ceremony without a real
 * lock workflow to observe would be guessing). `closed_by`/`closed_at` are
 * cleared rather than left stale — the audit entry this call writes is the
 * durable record that the period was ever closed, not these two columns.
 */
export async function reopenPeriod(
  tx: Tx,
  periodId: string,
): Promise<{ periodName: string }> {
  const before = await periodState(tx, periodId)
  if (before.status !== "closed") {
    throw new AccountingRefused(
      "wrong_status",
      `${before.period_name} is ${before.status}, not closed`,
    )
  }
  // Same reasoning as closePeriod's own RETURNING check (L68).
  const [updated] = await tx<{ id: string }[]>`
    UPDATE accounting_periods
       SET status = 'open', closed_by = NULL, closed_at = NULL,
           updated_at = now()
     WHERE id = ${periodId}::uuid
    RETURNING id
  `
  if (!updated) throw new AccountingRefused("no_such_period", periodId)
  return { periodName: before.period_name }
}

export type YearEndCloseLine = {
  account_code: string
  account_name: string
  account_type: "revenue" | "expense"
  /** Signed: a revenue account's normal credit balance, or an expense account's normal debit balance. */
  net: string
}

export type YearEndClosePreview = {
  lines: YearEndCloseLine[]
  netIncome: string
}

/**
 * What a year-end close as of `asOf` would zero, without posting anything —
 * the same computation `yearEndClose` posts, read-only. Backs the
 * confirmation page: closing the books is not a mistake anyone should
 * discover only after clicking through.
 */
export async function previewYearEndClose(
  tx: Tx,
  asOf: string,
): Promise<YearEndClosePreview> {
  const accounts = await tx<YearEndCloseLine[]>`
    SELECT a.account_code, a.account_name, a.account_type::text AS account_type,
           (CASE WHEN a.account_type = 'revenue'
                 THEN COALESCE(sum(l.base_credit_amount) FILTER (WHERE je.entry_date <= ${asOf}::date), 0)
                    - COALESCE(sum(l.base_debit_amount)  FILTER (WHERE je.entry_date <= ${asOf}::date), 0)
                 ELSE COALESCE(sum(l.base_debit_amount)  FILTER (WHERE je.entry_date <= ${asOf}::date), 0)
                    - COALESCE(sum(l.base_credit_amount) FILTER (WHERE je.entry_date <= ${asOf}::date), 0)
            END)::text AS net
      FROM chart_of_accounts a
      LEFT JOIN journal_entry_lines l ON l.account_id = a.id
      LEFT JOIN journal_entries je ON je.id = l.entry_id AND je.status = 'posted'
     WHERE a.account_type IN ('revenue', 'expense')
     GROUP BY a.id, a.account_code, a.account_name, a.account_type
     ORDER BY a.account_code
  `
  const lines = accounts.filter((a) => compareDecimal(a.net, "0") !== 0)

  const [{ net_income: netIncome }] = await tx<{ net_income: string }[]>`
    SELECT COALESCE(sum(l.base_credit_amount - l.base_debit_amount)
                      FILTER (WHERE je.entry_date <= ${asOf}::date), 0)::text
             AS net_income
      FROM journal_entry_lines l
      JOIN journal_entries je ON je.id = l.entry_id AND je.status = 'posted'
      JOIN chart_of_accounts a ON a.id = l.account_id
     WHERE a.account_type IN ('revenue', 'expense')
  `
  return { lines, netIncome }
}

/** A signed decimal string's magnitude, without parsing to float — stripping the sign character is text handling, not arithmetic. */
function magnitude(v: string): string {
  return v.startsWith("-") ? v.slice(1) : v
}

/**
 * Year-end close (§1.4, US-ACC-051): zeroes every revenue/expense account's
 * cumulative balance as of `asOf` into Retained Earnings, in one entry. Not
 * gated on any period being closed first — no close-checklist gate exists
 * yet (§13) — so this is just another `postJournal` caller, refused the
 * normal way if `asOf` falls in an already-closed period.
 *
 * Idempotent by construction, not by a flag: the closing entry's own lines
 * are posted activity too, so re-running with the same `asOf` finds every
 * revenue/expense account back at zero and posts nothing (`no_lines`).
 * Re-running after a LATER correcting entry finds only that entry's delta.
 *
 * `expectedNetIncome` is what the confirmation page previewed — the preview
 * and this post are two separate transactions, so anything posted in between
 * (an invoice, a bill, another manual entry) would otherwise close on figures
 * nobody actually confirmed. Checked in SQL/NUMERIC, same shape as a lockbox
 * batch's `allocation_mismatch`, never trusted from the page's own arithmetic.
 */
export async function yearEndClose(
  tx: Tx,
  tenantId: string,
  input: { asOf: string; expectedNetIncome: string },
  actorId: string,
): Promise<{ entryNumber: string; netIncome: string }> {
  const { lines: preview, netIncome } = await previewYearEndClose(
    tx,
    input.asOf,
  )

  const [{ mismatched }] = await tx<{ mismatched: boolean }[]>`
    SELECT ${input.expectedNetIncome}::numeric <> ${netIncome}::numeric AS mismatched
  `
  if (mismatched) {
    throw new AccountingRefused(
      "allocation_mismatch",
      `previewed net income of ${input.expectedNetIncome} no longer matches ${netIncome} — something else posted since you previewed this close`,
    )
  }

  const lines: JournalLine[] = preview.map((a) => {
    // `net` is already signed as the account's OWN normal balance (credit
    // for revenue, debit for expense) — zeroing it means the OPPOSITE side:
    // a positive revenue net is zeroed by a debit, a positive expense net
    // by a credit. A negative net (a contra balance) trades sides again.
    const zeroingIsDebit =
      (a.account_type === "revenue") === compareDecimal(a.net, "0") > 0
    const amount = magnitude(a.net)
    return {
      accountCode: a.account_code,
      debit: zeroingIsDebit ? amount : null,
      credit: zeroingIsDebit ? null : amount,
      description: `Year-end close ${input.asOf}`,
    }
  })

  if (compareDecimal(netIncome, "0") !== 0) {
    const positive = compareDecimal(netIncome, "0") > 0
    const amount = magnitude(netIncome)
    lines.push({
      accountCode: ACCOUNTS.retainedEarnings,
      // Net income increases equity (a credit); a net loss decreases it (a debit).
      debit: positive ? null : amount,
      credit: positive ? amount : null,
      description: `Year-end close ${input.asOf} — net income to retained earnings`,
    })
  }

  const entryId = await postJournal(
    tx,
    tenantId,
    {
      date: input.asOf,
      sourceType: "year_end_close",
      sourceId: null,
      description: `Year-end close as of ${input.asOf}`,
      reference: null,
      currency: "USD",
      exchangeRate: "1.000000",
      lines,
    },
    actorId,
  )
  const [entry] = await tx<{ entry_number: string }[]>`
    SELECT entry_number FROM journal_entries WHERE id = ${entryId}::uuid
  `
  return { entryNumber: entry.entry_number, netIncome }
}
