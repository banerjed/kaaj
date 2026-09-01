import type { Tx } from "../db/tenant"

/**
 * Bills and banking — module-accounting.md, the payables and cash half.
 *
 * The same discipline as invoices: money is a string, every sum happens in
 * SQL, and the stored totals are recomputed on read so a document that stopped
 * matching its own lines is visible rather than believed.
 *
 * **No account number is selected anywhere in this file.** `bank_accounts`
 * holds `account_number_ct`, `iban_ct`, `routing_number_ct` and `swift_code_ct`
 * — all ciphertext, all sealed to the tenant, and unlike
 * `employee_bank_accounts` there is no plaintext last-four beside them. A
 * banking screen does not need one, so the value stays out of the returned
 * type entirely: a repository that fetched and dropped it would still have put
 * it in a result set, a log line and a heap dump (L39).
 */

export type BillRow = {
  id: string
  bill_number: string
  vendor_name: string | null
  bill_date: string
  due_date: string | null
  currency: string
  subtotal: string | null
  tax_total: string | null
  total: string | null
  amount_paid: string | null
  amount_due: string | null
  status: string | null
  requires_approval: boolean | null
  approved_by_name: string | null
  /** Summed from bill_lines, so a stored subtotal that drifted is visible. */
  line_subtotal: string | null
  line_count: number
  /** Past its due date, still owing, and actually approved for payment. */
  is_overdue: boolean
}

const BILL_SELECT = `
  SELECT b.id, b.bill_number,
         v.vendor_name,
         to_char(b.bill_date,'YYYY-MM-DD') AS bill_date,
         to_char(b.due_date,'YYYY-MM-DD')  AS due_date,
         b.currency,
         b.subtotal::text    AS subtotal,
         b.tax_total::text   AS tax_total,
         b.total::text       AS total,
         b.amount_paid::text AS amount_paid,
         b.amount_due::text  AS amount_due,
         b.status, b.requires_approval,
         e.first_name || ' ' || e.last_name AS approved_by_name,
         (SELECT sum(l.amount)::text FROM bill_lines l WHERE l.bill_id = b.id)
           AS line_subtotal,
         (SELECT count(*)::int FROM bill_lines l WHERE l.bill_id = b.id)
           AS line_count,
         -- A draft or voided bill is not owed, so it cannot be late — the same
         -- correction the invoice list needed.
         (b.due_date < CURRENT_DATE
            AND b.amount_due > 0
            AND b.status NOT IN ('draft', 'void', 'cancelled')) AS is_overdue
    FROM bills b
    LEFT JOIN vendors v   ON v.id = b.vendor_id
    LEFT JOIN employees e ON e.id::text = b.approved_by::text
`

export async function listBills(
  tx: Tx,
  filters: { status?: string; unapprovedOnly?: boolean } = {},
): Promise<BillRow[]> {
  const { status = "", unapprovedOnly = false } = filters
  return tx<BillRow[]>`
    ${tx.unsafe(BILL_SELECT)}
     WHERE (${status} = '' OR b.status = ${status})
       AND (${unapprovedOnly} = FALSE
            OR (b.requires_approval = TRUE AND b.approved_at IS NULL))
     ORDER BY b.bill_date DESC, b.bill_number DESC
  `
}

export async function billById(tx: Tx, id: string): Promise<BillRow | null> {
  const [row] = await tx<BillRow[]>`
    ${tx.unsafe(BILL_SELECT)} WHERE b.id = ${id}::uuid
  `
  return row ?? null
}

export type BillLine = {
  id: string
  line_number: number | null
  description: string | null
  quantity: string | null
  unit_price: string | null
  amount: string | null
  tax_amount: string | null
  account_name: string | null
}

export async function billLines(tx: Tx, billId: string): Promise<BillLine[]> {
  return tx<BillLine[]>`
    SELECT l.id, l.line_number, l.description,
           l.quantity::text   AS quantity,
           l.unit_price::text AS unit_price,
           l.amount::text     AS amount,
           l.tax_amount::text AS tax_amount,
           a.account_name
      FROM bill_lines l
      LEFT JOIN chart_of_accounts a ON a.id = l.expense_account_id
     WHERE l.bill_id = ${billId}::uuid
     ORDER BY l.line_number NULLS LAST
  `
}

/** What has been paid against one bill. */
export async function paymentsForBill(
  tx: Tx,
  billId: string,
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
     WHERE al.bill_id = ${billId}::uuid
     ORDER BY p.payment_date DESC
  ` as never
}

// -- Banking ----------------------------------------------------------------

export type BankAccountRow = {
  id: string
  account_name: string
  bank_name: string | null
  currency: string
  /** What the BANK says. */
  current_balance: string | null
  available_balance: string | null
  /** The running balance on the last imported transaction, or null if none. */
  feed_balance: string | null
  transaction_count: number
  unmatched_count: number
  last_synced_at: Date | null
  feed_enabled: boolean | null
}

/**
 * The firm's bank accounts.
 *
 * `current_balance` and `feed_balance` are DIFFERENT FACTS — one is what the
 * bank reports, the other is derived from the transactions imported so far.
 * They disagree whenever something has not been imported yet, which is
 * ordinary rather than an error, so both are returned and the page shows the
 * difference instead of picking one and hiding the other.
 */
export async function bankAccounts(tx: Tx): Promise<BankAccountRow[]> {
  return tx<BankAccountRow[]>`
    SELECT a.id, a.account_name, a.bank_name, a.currency,
           a.current_balance::text   AS current_balance,
           a.available_balance::text AS available_balance,
           (SELECT t.balance::text FROM bank_transactions t
             WHERE t.bank_account_id = a.id
             ORDER BY t.transaction_date DESC, t.created_at DESC
             LIMIT 1) AS feed_balance,
           (SELECT count(*)::int FROM bank_transactions t
             WHERE t.bank_account_id = a.id) AS transaction_count,
           (SELECT count(*)::int FROM bank_transactions t
             WHERE t.bank_account_id = a.id AND t.status = 'unmatched')
             AS unmatched_count,
           a.last_synced_at, a.feed_enabled
      FROM bank_accounts a
     WHERE a.is_active
     ORDER BY a.account_name
  `
}

export type BankTransactionRow = {
  id: string
  transaction_date: string
  description: string | null
  reference: string | null
  transaction_type: string | null
  amount: string | null
  balance: string | null
  status: string | null
  matched_to_type: string | null
  currency: string
  account_name: string
}

export async function bankTransactions(
  tx: Tx,
  filters: { accountId?: string; status?: string } = {},
): Promise<BankTransactionRow[]> {
  // NULL rather than '' for the uuid: SQL does not short-circuit, so the cast
  // is evaluated either way and raises on an empty string (L37).
  const accountId = filters.accountId || null
  const status = filters.status ?? ""
  return tx<BankTransactionRow[]>`
    SELECT t.id,
           to_char(t.transaction_date,'YYYY-MM-DD') AS transaction_date,
           t.description, t.reference, t.transaction_type,
           t.amount::text  AS amount,
           t.balance::text AS balance,
           t.status, t.matched_to_type,
           a.currency, a.account_name
      FROM bank_transactions t
      JOIN bank_accounts a ON a.id = t.bank_account_id
     WHERE (${accountId}::uuid IS NULL OR t.bank_account_id = ${accountId}::uuid)
       AND (${status} = '' OR t.status = ${status})
     ORDER BY t.transaction_date DESC, t.created_at DESC
  `
}
