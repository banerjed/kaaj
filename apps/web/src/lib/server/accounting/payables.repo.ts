import type { Tx } from "../db/tenant"
import { postJournal, AccountingRefused } from "./accounting.repo"

/**
 * Bills and banking — payables and cash. Same discipline as invoices: money is
 * a string, sums happen in SQL. No account number is ever selected here (L39);
 * the ciphertext columns on bank_accounts stay out of the returned type entirely.
 */

/**
 * What a bill's status may be. Plain `varchar` with no CHECK behind it, so
 * this list IS the constraint (L57) — `is_overdue` above and `billStatusTone`
 * both already treat `cancelled` as distinct from `void`, so it stays in the
 * list even though no write here produces it (it arrives from OCR intake).
 */
export const BILL_STATUSES = [
  "draft",
  "approved",
  "partial",
  "paid",
  "void",
  "cancelled",
] as const
export type BillStatus = (typeof BILL_STATUSES)[number]

/**
 * What a bank_transaction's status may be. Plain `varchar` with no CHECK
 * behind it, so this list IS the constraint (L57) — `ignored` is kept even
 * though no write here produces it, matching module-accounting.md's own
 * rule that a statement cannot be reconciled with unmatched transactions
 * "unless marked ignore".
 */
export const BANK_TRANSACTION_STATUSES = [
  "unmatched",
  "matched",
  "categorized",
  "reconciled",
  "ignored",
] as const
export type BankTransactionStatus = (typeof BANK_TRANSACTION_STATUSES)[number]

/** The accounts the payables cycle posts to, by code rather than by id. */
const ACCOUNTS = {
  cash: "1000",
  inputTax: "1200",
  payable: "2000",
} as const

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
         -- A draft or voided bill is not owed, so it cannot be late.
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
 * The firm's bank accounts. `current_balance` (bank-reported) and
 * `feed_balance` (derived from imported transactions) can legitimately
 * disagree, so both are returned rather than one hiding the other.
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

// ---------------------------------------------------------------------------
// Writes — bill approval and vendor payment, posted to the ledger
// ---------------------------------------------------------------------------
//
// Reuses postJournal from accounting.repo.ts rather than a second engine.
// Banking (matching a bank_transaction to a payment) has no write path yet.

/**
 * Recompute a bill's money columns from its lines and payments — recomputed,
 * never adjusted (L58). base_total sums the two rounded parts rather than
 * rounding the total independently, so it stays equal to base_subtotal +
 * base_tax_total (L25) — required here: ck_bills_amounts_reconcile enforces
 * total = subtotal + tax_total at the database level.
 */
export async function recomputeBillTotals(
  tx: Tx,
  billId: string,
): Promise<void> {
  await tx`
    WITH line_totals AS (
      SELECT coalesce(sum(l.amount), 0)     AS subtotal,
             coalesce(sum(l.tax_amount), 0) AS tax_total
        FROM bill_lines l WHERE l.bill_id = ${billId}::uuid
    ),
    paid AS (
      SELECT coalesce(sum(a.amount), 0)      AS amount_paid,
             coalesce(sum(a.base_amount), 0) AS base_amount_paid
        FROM payment_allocations a WHERE a.bill_id = ${billId}::uuid
    )
    UPDATE bills b
       SET subtotal    = lt.subtotal,
           tax_total   = lt.tax_total,
           total       = lt.subtotal + lt.tax_total,
           amount_paid = p.amount_paid,
           amount_due  = (lt.subtotal + lt.tax_total) - p.amount_paid,
           -- Round each part first, then sum, so base_total stays exact.
           base_subtotal    = round(lt.subtotal  * b.exchange_rate, 2),
           base_tax_total   = round(lt.tax_total * b.exchange_rate, 2),
           base_total       = round(lt.subtotal  * b.exchange_rate, 2)
                            + round(lt.tax_total * b.exchange_rate, 2),
           base_amount_paid = p.base_amount_paid,
           base_amount_due  = round(lt.subtotal  * b.exchange_rate, 2)
                            + round(lt.tax_total * b.exchange_rate, 2)
                            - p.base_amount_paid,
           updated_at = now()
      FROM line_totals lt, paid p
     WHERE b.id = ${billId}::uuid
  `
}

type BillState = {
  status: BillStatus
  currency: string
  exchange_rate: string
  vendor_id: string
  bill_number: string
  bill_date: string
  total: string
  subtotal: string
  tax_total: string
  amount_due: string
  approved_by: string | null
  line_count: number
}

async function billState(tx: Tx, id: string): Promise<BillState> {
  const [row] = await tx<BillState[]>`
    SELECT b.status, b.currency, b.exchange_rate::text AS exchange_rate,
           b.vendor_id::text AS vendor_id,
           b.bill_number,
           to_char(b.bill_date,'YYYY-MM-DD') AS bill_date,
           b.total::text      AS total,
           b.subtotal::text   AS subtotal,
           b.tax_total::text  AS tax_total,
           b.amount_due::text AS amount_due,
           b.approved_by::text AS approved_by,
           (SELECT count(*)::int FROM bill_lines l WHERE l.bill_id = b.id)
             AS line_count
      FROM bills b WHERE b.id = ${id}::uuid
  `
  if (!row) throw new AccountingRefused("no_such_bill")
  return row
}

/**
 * Approve a draft bill and recognise the liability — one journal line per
 * bill_line's own expense account, so a bill that spans several categories
 * (rent, travel) does not collapse them into one figure.
 *
 *   DR <expense account>     per line, by its own amount
 *   DR Input Tax Recoverable       tax_total   (omitted when zero)
 *     CR Accounts Payable                  total
 *
 * Refused with no lines.
 */
export async function approveBill(
  tx: Tx,
  tenantId: string,
  billId: string,
  actorId: string,
): Promise<{ from: BillStatus; entryNumber: string }> {
  const before = await billState(tx, billId)
  if (before.status !== "draft") {
    throw new AccountingRefused("wrong_status", `${before.status} is not draft`)
  }
  if (before.line_count === 0) throw new AccountingRefused("no_lines")

  // Recompute first so the journal posts figures the lines actually support.
  await recomputeBillTotals(tx, billId)
  const current = await billState(tx, billId)

  const lines = await tx<
    { account_code: string; amount: string; description: string | null }[]
  >`
    SELECT a.account_code, l.amount::text AS amount, l.description
      FROM bill_lines l
      JOIN chart_of_accounts a ON a.id = l.expense_account_id
     WHERE l.bill_id = ${billId}::uuid
     ORDER BY l.line_number NULLS LAST
  `

  const entryId = await postJournal(
    tx,
    tenantId,
    {
      date: current.bill_date,
      sourceType: "bill",
      sourceId: billId,
      description: `Bill ${current.bill_number} approved`,
      reference: current.bill_number,
      currency: current.currency,
      exchangeRate: current.exchange_rate,
      lines: [
        ...lines.map((l) => ({
          accountCode: l.account_code,
          debit: l.amount,
          credit: null,
          description: l.description ?? `Bill ${current.bill_number}`,
        })),
        {
          accountCode: ACCOUNTS.inputTax,
          debit: current.tax_total,
          credit: null,
          description: `Recoverable input tax on ${current.bill_number}`,
        },
        {
          accountCode: ACCOUNTS.payable,
          debit: null,
          credit: current.total,
          description: `Bill ${current.bill_number}`,
        },
      ],
    },
    actorId,
  )

  await tx`
    UPDATE bills
       SET status = 'approved', approved_by = ${actorId}::uuid, approved_at = now(),
           journal_entry_id = ${entryId}::uuid,
           updated_at = now(), updated_by = ${actorId}::uuid
     WHERE id = ${billId}::uuid
  `

  const [entry] = await tx<{ entry_number: string }[]>`
    SELECT entry_number FROM journal_entries WHERE id = ${entryId}::uuid
  `
  return { from: before.status, entryNumber: entry.entry_number }
}

/**
 * Pay a vendor against an approved bill.
 *
 *   DR Accounts Payable        amount
 *     CR Cash at Bank                 amount
 *
 * Refused if it would overpay, and refused if the payer is the same person
 * who approved the bill — the same segregation payroll enforces between
 * calculated_by and approved_by (payroll_runs.repo.ts), applied across two
 * tables instead of two columns on one row.
 */
export async function recordVendorPayment(
  tx: Tx,
  tenantId: string,
  input: {
    billId: string
    amount: string
    paymentDate: string
    method: string
    reference: string | null
    bankAccountId: string | null
  },
  actorId: string,
): Promise<{ paymentNumber: string; status: BillStatus }> {
  const before = await billState(tx, input.billId)
  if (
    before.status === "draft" ||
    before.status === "void" ||
    before.status === "cancelled"
  ) {
    throw new AccountingRefused(
      "wrong_status",
      `${before.status} cannot receive a payment`,
    )
  }
  if (before.approved_by !== null && before.approved_by === actorId) {
    throw new AccountingRefused(
      "self_approval",
      "the person who approved this bill cannot also record its payment",
    )
  }
  // Compared in SQL/NUMERIC, not JS float, since this decides a refusal.
  const [room] = await tx<{ too_much: boolean }[]>`
    SELECT ${input.amount}::numeric > ${before.amount_due}::numeric AS too_much
  `
  if (room.too_much) {
    throw new AccountingRefused("overpayment", before.amount_due)
  }

  const [numbering] = await tx<{ n: number }[]>`
    SELECT coalesce(max(nullif(substring(payment_number from '[0-9]+$'),
                                '')::int), 0) + 1 AS n
      FROM payments WHERE payment_number LIKE 'VPAY-%'
  `
  const year = input.paymentDate.slice(0, 4)
  const paymentNumber = `VPAY-${year}-${String(numbering.n).padStart(3, "0")}`

  const entryId = await postJournal(
    tx,
    tenantId,
    {
      date: input.paymentDate,
      sourceType: "payment",
      sourceId: input.billId,
      description: `Payment against ${before.bill_number}`,
      reference: paymentNumber,
      currency: before.currency,
      exchangeRate: before.exchange_rate,
      lines: [
        {
          accountCode: ACCOUNTS.payable,
          debit: input.amount,
          credit: null,
          description: `Against ${before.bill_number}`,
        },
        {
          accountCode: ACCOUNTS.cash,
          debit: null,
          credit: input.amount,
          description: paymentNumber,
        },
      ],
    },
    actorId,
  )

  const [payment] = await tx<{ id: string }[]>`
    INSERT INTO payments (
      tenant_id, payment_number, payment_date, reference, vendor_id,
      currency, amount, exchange_rate, base_amount, payment_method,
      bank_account_id, status, journal_entry_id, created_by
    ) VALUES (
      ${tenantId}::uuid, ${paymentNumber}, ${input.paymentDate}::date,
      ${input.reference}, ${before.vendor_id}::uuid,
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
      tenant_id, payment_id, bill_id, amount, base_amount
    ) VALUES (
      ${tenantId}::uuid, ${payment.id}::uuid, ${input.billId}::uuid,
      ${input.amount}::numeric,
      round(${input.amount}::numeric * ${before.exchange_rate}::numeric, 2)
    )
  `

  await recomputeBillTotals(tx, input.billId)

  const [settled] = await tx<{ due: string }[]>`
    SELECT amount_due::text AS due FROM bills WHERE id = ${input.billId}::uuid
  `
  // Decided in SQL against NUMERIC zero, not by parsing the string.
  const [state] = await tx<{ fully_paid: boolean }[]>`
    SELECT ${settled.due}::numeric = 0 AS fully_paid
  `
  const status: BillStatus = state.fully_paid ? "paid" : "partial"

  await tx`
    UPDATE bills
       SET status = ${status},
           updated_at = now(), updated_by = ${actorId}::uuid
     WHERE id = ${input.billId}::uuid
  `

  return { paymentNumber, status }
}

// ---------------------------------------------------------------------------
// Writes — matching a bank_transaction to a payment already on the books
// ---------------------------------------------------------------------------
//
// No postJournal here, deliberately: the cash movement was already posted by
// recordPayment/recordVendorPayment when the payment was recorded. Posting
// again would double-count cash. There is therefore no period_closed check
// either — that gate lives inside postJournal, and this write never calls it.

export type CandidatePayment = {
  id: string
  payment_number: string | null
  payment_date: string | null
  amount: string | null
  currency: string | null
  counterparty_name: string | null
}

/**
 * Payments that could plausibly be each of a set of unmatched bank
 * transactions: same currency, and the right DIRECTION — a credit (money
 * in) can only match a customer payment, a debit (money out) only a vendor
 * payment, since a payment's `amount` is always positive and direction
 * lives in which id is set. Also excludes any payment already matched to a
 * different transaction. This is the picker's filter; `matchBankTransaction`
 * re-checks all of it, since a filter is UX and a crafted POST can name any
 * payment id. One query for the whole set, to avoid N+1 as the unmatched
 * list grows (mirrors `ledgerLinesForEntries`).
 */
export async function candidatePaymentsForTransactions(
  tx: Tx,
  transactionIds: string[],
): Promise<Record<string, CandidatePayment[]>> {
  if (transactionIds.length === 0) return {}
  const rows = await tx<(CandidatePayment & { transaction_id: string })[]>`
    SELECT t.id AS transaction_id,
           p.id, p.payment_number,
           to_char(p.payment_date,'YYYY-MM-DD') AS payment_date,
           p.amount::text AS amount, p.currency,
           coalesce(c.customer_name, v.vendor_name) AS counterparty_name
      FROM bank_transactions t
      JOIN bank_accounts a ON a.id = t.bank_account_id
      JOIN payments p ON p.currency = a.currency
       AND ((t.amount > 0 AND p.customer_id IS NOT NULL)
            OR (t.amount < 0 AND p.vendor_id IS NOT NULL))
      LEFT JOIN customers c ON c.id = p.customer_id
      LEFT JOIN vendors v   ON v.id = p.vendor_id
     WHERE t.id = ANY(${transactionIds}::uuid[])
       AND NOT EXISTS (
             SELECT 1 FROM bank_transactions o
              WHERE o.matched_to_type = 'payment' AND o.matched_to_id = p.id
           )
     ORDER BY t.id, abs(p.amount - abs(t.amount)) ASC, p.payment_date DESC
  `
  const out: Record<string, CandidatePayment[]> = {}
  for (const r of rows) {
    const { transaction_id, ...candidate } = r
    ;(out[transaction_id] ??= []).push(candidate)
  }
  return out
}

/**
 * Tag a bank_transaction as matched to a payment already recorded. Refuses
 * anything but an unmatched transaction, a currency or direction that
 * cannot agree with the payment, or a payment already claimed by another
 * transaction.
 */
export async function matchBankTransaction(
  tx: Tx,
  transactionId: string,
  paymentId: string,
): Promise<{ from: BankTransactionStatus }> {
  const [txn] = await tx<
    { status: BankTransactionStatus; currency: string; amount: string }[]
  >`
    SELECT t.status, a.currency, t.amount::text AS amount
      FROM bank_transactions t
      JOIN bank_accounts a ON a.id = t.bank_account_id
     WHERE t.id = ${transactionId}::uuid
  `
  if (!txn) throw new AccountingRefused("no_such_bank_transaction")
  if (txn.status !== "unmatched") {
    throw new AccountingRefused(
      "wrong_status",
      `${txn.status} is not unmatched`,
    )
  }

  const [payment] = await tx<
    {
      currency: string
      customer_id: string | null
      vendor_id: string | null
    }[]
  >`
    SELECT currency, customer_id::text AS customer_id,
           vendor_id::text AS vendor_id
      FROM payments WHERE id = ${paymentId}::uuid
  `
  if (!payment) throw new AccountingRefused("no_such_payment")
  if (payment.currency !== txn.currency) {
    throw new AccountingRefused(
      "currency_mismatch",
      `${txn.currency} against ${payment.currency}`,
    )
  }

  const isCredit = Number(txn.amount) > 0
  const isCustomerPayment = payment.customer_id !== null
  if (isCredit !== isCustomerPayment) {
    throw new AccountingRefused(
      "direction_mismatch",
      isCredit
        ? "a credit can only match money received"
        : "a debit can only match money paid out",
    )
  }

  const [already] = await tx<{ id: string }[]>`
    SELECT id FROM bank_transactions
     WHERE matched_to_type = 'payment' AND matched_to_id = ${paymentId}::uuid
       AND id <> ${transactionId}::uuid
  `
  if (already) throw new AccountingRefused("already_matched")

  await tx`
    UPDATE bank_transactions
       SET status = 'matched', matched_to_type = 'payment',
           matched_to_id = ${paymentId}::uuid,
           match_confidence = 1.00, matching_rule_id = NULL,
           updated_at = now()
     WHERE id = ${transactionId}::uuid
  `

  return { from: txn.status }
}
