import type { Tx } from "../db/tenant"
import {
  postJournal,
  AccountingRefused,
  nextSequenceNumber,
  accountIdOrNull,
  settlementFxDelta,
  type PaymentForDocument,
  type JournalLine,
} from "./accounting.repo"

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
  /** Same netted account accounting.repo.ts posts realized AR settlement FX to. */
  fxGainLoss: "4200",
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

/**
 * Same columns as `BILL_SELECT`, minus `line_subtotal`/`line_count` — those
 * are a per-row correlated subquery over `bill_lines`, fine for `billById`'s
 * single row but a full scan of that table PER ROW on a paginated list as it
 * grows. `listBills` fetches this instead and merges in
 * `billLineTotalsFor`'s one batched aggregate query — same shape as
 * `accounting.repo.ts`'s `invoiceLineTotalsFor`.
 */
const BILL_LIST_SELECT = `
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
         (b.due_date < CURRENT_DATE
            AND b.amount_due > 0
            AND b.status NOT IN ('draft', 'void', 'cancelled')) AS is_overdue
    FROM bills b
    LEFT JOIN vendors v   ON v.id = b.vendor_id
    LEFT JOIN employees e ON e.id::text = b.approved_by::text
`

/** `line_subtotal`/`line_count` for a set of bills, in one query — see `BILL_LIST_SELECT`. */
async function billLineTotalsFor(
  tx: Tx,
  billIds: string[],
): Promise<Record<string, { line_subtotal: string; line_count: number }>> {
  if (billIds.length === 0) return {}
  const rows = await tx<
    { bill_id: string; line_subtotal: string; line_count: number }[]
  >`
    SELECT bill_id::text AS bill_id,
           sum(amount)::text AS line_subtotal,
           count(*)::int AS line_count
      FROM bill_lines
     WHERE bill_id = ANY(${billIds}::uuid[])
     GROUP BY bill_id
  `
  const out: Record<string, { line_subtotal: string; line_count: number }> = {}
  for (const { bill_id, ...totals } of rows) out[bill_id] = totals
  return out
}

export async function listBills(
  tx: Tx,
  filters: {
    status?: string
    unapprovedOnly?: boolean
    limit?: number
    offset?: number
  } = {},
): Promise<BillRow[]> {
  const {
    status = "",
    unapprovedOnly = false,
    limit = null,
    offset = 0,
  } = filters
  const rows = await tx<Omit<BillRow, "line_subtotal" | "line_count">[]>`
    ${tx.unsafe(BILL_LIST_SELECT)}
     WHERE (${status} = '' OR b.status = ${status})
       AND (${unapprovedOnly} = FALSE
            OR (b.requires_approval = TRUE AND b.approved_at IS NULL))
     ORDER BY b.bill_date DESC, b.bill_number DESC
     ${limit === null ? tx`` : tx`LIMIT ${limit} OFFSET ${offset}`}
  `
  const totals = await billLineTotalsFor(
    tx,
    rows.map((r) => r.id),
  )
  return rows.map((r) => ({
    ...r,
    line_subtotal: totals[r.id]?.line_subtotal ?? null,
    line_count: totals[r.id]?.line_count ?? 0,
  }))
}

/** The total matching a filter set — same predicates as `listBills`, for the list page's pagination controls. */
export async function countBills(
  tx: Tx,
  filters: { status?: string; unapprovedOnly?: boolean } = {},
): Promise<number> {
  const { status = "", unapprovedOnly = false } = filters
  const [{ n }] = await tx<{ n: number }[]>`
    SELECT count(*)::int AS n
      FROM bills b
     WHERE (${status} = '' OR b.status = ${status})
       AND (${unapprovedOnly} = FALSE
            OR (b.requires_approval = TRUE AND b.approved_at IS NULL))
  `
  return n
}

/** Fixed windows offered on the "due soon" filter — a `select`, not free text. */
export const AP_DUE_SOON_WINDOWS = ["7", "14", "30", "60"] as const

export type ApDueSoonRow = {
  bill_id: string
  bill_number: string
  vendor_name: string | null
  currency: string
  due_date: string
  /** `due_date - asOf`, so the page never re-derives it from two date strings. */
  days_until_due: number
  amount_due: string
}

/**
 * Bills coming due, not yet overdue — forward-looking, unlike `is_overdue`.
 * A blank `asOf` defaults to the database's own `CURRENT_DATE`, the same
 * choice `arAging()` makes and for the same reason: this needs a real
 * reference date to measure a window from, unlike a cumulative `asOf`
 * report where blank means no upper bound.
 */
export async function apDueSoon(
  tx: Tx,
  filters: { asOf?: string; withinDays: number },
): Promise<ApDueSoonRow[]> {
  const asOf = filters.asOf || null
  return tx<ApDueSoonRow[]>`
    SELECT b.id AS bill_id, b.bill_number, v.vendor_name, b.currency,
           to_char(b.due_date, 'YYYY-MM-DD') AS due_date,
           (b.due_date - COALESCE(${asOf}::date, CURRENT_DATE))::int
             AS days_until_due,
           b.amount_due::text AS amount_due
      FROM bills b
      LEFT JOIN vendors v ON v.id = b.vendor_id
     WHERE b.amount_due > 0
       AND b.status NOT IN ('draft', 'void', 'cancelled')
       AND b.due_date >= COALESCE(${asOf}::date, CURRENT_DATE)
       AND b.due_date <= COALESCE(${asOf}::date, CURRENT_DATE)
                          + (${filters.withinDays}::int * INTERVAL '1 day')
     ORDER BY b.due_date ASC, v.vendor_name ASC
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

/** Same cap and reasoning as `accounting.repo.ts`'s `DOCUMENT_CHILD_CAP`. */
const DOCUMENT_CHILD_CAP = 500

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
     LIMIT ${DOCUMENT_CHILD_CAP}
  `
}

/** The true count behind `billLines`'s capped list, so a truncated page can say so. */
export async function countBillLines(tx: Tx, billId: string): Promise<number> {
  const [{ n }] = await tx<{ n: number }[]>`
    SELECT count(*)::int AS n FROM bill_lines WHERE bill_id = ${billId}::uuid
  `
  return n
}

/** What has been paid against one bill. */
export async function paymentsForBill(
  tx: Tx,
  billId: string,
): Promise<PaymentForDocument[]> {
  return tx<PaymentForDocument[]>`
    SELECT p.id, p.payment_number,
           to_char(p.payment_date,'YYYY-MM-DD') AS payment_date,
           al.amount::text AS amount,
           p.currency,
           p.payment_method AS method
      FROM payment_allocations al
      JOIN payments p ON p.id = al.payment_id
     WHERE al.bill_id = ${billId}::uuid
     ORDER BY p.payment_date DESC
     LIMIT ${DOCUMENT_CHILD_CAP}
  `
}

/** The true count behind `paymentsForBill`'s capped list, so a truncated page can say so. */
export async function countPaymentsForBill(
  tx: Tx,
  billId: string,
): Promise<number> {
  const [{ n }] = await tx<{ n: number }[]>`
    SELECT count(*)::int AS n
      FROM payment_allocations al
      JOIN payments p ON p.id = al.payment_id
     WHERE al.bill_id = ${billId}::uuid
  `
  return n
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
 * `transaction_count`/`unmatched_count` for a set of bank accounts, in one
 * query — a real bound array (`= ANY($1)`) rather than a correlated
 * subquery per account, the same fix as `invoiceLineTotalsFor`.
 */
async function bankAccountCountsFor(
  tx: Tx,
  accountIds: string[],
): Promise<
  Record<string, { transaction_count: number; unmatched_count: number }>
> {
  if (accountIds.length === 0) return {}
  const rows = await tx<
    {
      bank_account_id: string
      transaction_count: number
      unmatched_count: number
    }[]
  >`
    SELECT bank_account_id::text AS bank_account_id,
           count(*)::int AS transaction_count,
           count(*) FILTER (WHERE status = 'unmatched')::int AS unmatched_count
      FROM bank_transactions
     WHERE bank_account_id = ANY(${accountIds}::uuid[])
     GROUP BY bank_account_id
  `
  const out: Record<
    string,
    { transaction_count: number; unmatched_count: number }
  > = {}
  for (const { bank_account_id, ...c } of rows) out[bank_account_id] = c
  return out
}

/**
 * The latest transaction's balance, per account. `bank_accounts` is bounded
 * by how many accounts the firm actually has (NOT_SCALE_SENSITIVE) — small
 * enough that one query per account is fine, and deliberately NOT batched
 * into a single `= ANY(...)` query: a window function's top-1-per-partition
 * still has to walk every row of whichever account has the most transactions
 * before it can move to the next partition, where a plain `ORDER BY ...
 * LIMIT 1` against one literal account id lets the planner seek straight to
 * it via `idx_bank_transactions_account_date` — proven by measurement to be
 * the faster shape here, not merely tidier-looking.
 */
async function feedBalancesFor(
  tx: Tx,
  accountIds: string[],
): Promise<Record<string, string | null>> {
  const out: Record<string, string | null> = {}
  for (const id of accountIds) {
    const [row] = await tx<{ balance: string | null }[]>`
      SELECT balance::text AS balance FROM bank_transactions
       WHERE bank_account_id = ${id}::uuid
       ORDER BY transaction_date DESC, created_at DESC
       LIMIT 1
    `
    out[id] = row?.balance ?? null
  }
  return out
}

/**
 * The firm's bank accounts. `current_balance` (bank-reported) and
 * `feed_balance` (derived from imported transactions) can legitimately
 * disagree, so both are returned rather than one hiding the other.
 */
export async function bankAccounts(tx: Tx): Promise<BankAccountRow[]> {
  const accounts = await tx<
    Omit<
      BankAccountRow,
      "feed_balance" | "transaction_count" | "unmatched_count"
    >[]
  >`
    SELECT a.id, a.account_name, a.bank_name, a.currency,
           a.current_balance::text   AS current_balance,
           a.available_balance::text AS available_balance,
           a.last_synced_at, a.feed_enabled
      FROM bank_accounts a
     WHERE a.is_active
     ORDER BY a.account_name
  `
  const ids = accounts.map((a) => a.id)
  const [counts, feedBalances] = await Promise.all([
    bankAccountCountsFor(tx, ids),
    feedBalancesFor(tx, ids),
  ])
  return accounts.map((a) => ({
    ...a,
    feed_balance: feedBalances[a.id] ?? null,
    transaction_count: counts[a.id]?.transaction_count ?? 0,
    unmatched_count: counts[a.id]?.unmatched_count ?? 0,
  }))
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
  filters: {
    accountId?: string
    status?: string
    limit?: number
    offset?: number
  } = {},
): Promise<BankTransactionRow[]> {
  // NULL rather than '' for the uuid: SQL does not short-circuit, so the cast
  // is evaluated either way and raises on an empty string (L37).
  const accountId = filters.accountId || null
  const status = filters.status ?? ""
  const limit = filters.limit ?? null
  const offset = filters.offset ?? 0
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
     ${limit === null ? tx`` : tx`LIMIT ${limit} OFFSET ${offset}`}
  `
}

/** The total matching a filter set — same predicates as `bankTransactions`, for the list page's pagination controls. */
export async function countBankTransactions(
  tx: Tx,
  filters: { accountId?: string; status?: string } = {},
): Promise<number> {
  const accountId = filters.accountId || null
  const status = filters.status ?? ""
  const [{ n }] = await tx<{ n: number }[]>`
    SELECT count(*)::int AS n
      FROM bank_transactions t
     WHERE (${accountId}::uuid IS NULL OR t.bank_account_id = ${accountId}::uuid)
       AND (${status} = '' OR t.status = ${status})
  `
  return n
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

  // Grouped by rate, one GL line per jurisdiction (US-ACC-048/049) — same
  // reasoning as issueInvoice's tax lines.
  const taxByRate = await tx<{ tax_rate_id: string | null; amount: string }[]>`
    SELECT tax_rate_id, sum(tax_amount)::text AS amount
      FROM bill_lines
     WHERE bill_id = ${billId}::uuid AND tax_amount <> 0
     GROUP BY tax_rate_id
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
        ...taxByRate.map((t) => ({
          accountCode: ACCOUNTS.inputTax,
          debit: t.amount,
          credit: null,
          description: `Recoverable input tax on ${current.bill_number}`,
          taxRateId: t.tax_rate_id,
        })),
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

  const paymentNumber = await nextSequenceNumber(
    tx,
    "payments",
    "payment_number",
    "VPAY",
    input.paymentDate.slice(0, 4),
    3,
  )

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
  // rate while the payable clears at the OLD (booking) rate. The gain/loss
  // itself has no native-currency equivalent — it is a pure base-currency
  // artifact of translation — so when there is one to recognize, the entry
  // is posted directly in USD instead.
  let lines: JournalLine[]
  let entryCurrency: string
  let entryExchangeRate: string
  let fxGainLoss = "0"
  if (recognizeFx) {
    lines = [
      {
        accountCode: ACCOUNTS.payable,
        debit: fx.bookingBase,
        credit: null,
        description: `Against ${before.bill_number}`,
      },
      {
        accountCode: ACCOUNTS.cash,
        debit: null,
        credit: fx.cashBase,
        description: paymentNumber,
      },
    ]
    // A payable's cash line is a CREDIT, the opposite side from a
    // receivable's — so the same `cashBaseGreater` relationship reads as the
    // opposite outcome: paying more USD than the payable was booked at is a
    // loss (debit); paying less is a gain (credit).
    if (fx.cashBaseGreater) {
      lines.push({
        accountCode: ACCOUNTS.fxGainLoss,
        debit: fx.deltaAbs,
        credit: null,
        description: `FX loss on settlement of ${before.bill_number}`,
      })
      fxGainLoss = `-${fx.deltaAbs}`
    } else {
      lines.push({
        accountCode: ACCOUNTS.fxGainLoss,
        debit: null,
        credit: fx.deltaAbs,
        description: `FX gain on settlement of ${before.bill_number}`,
      })
      fxGainLoss = fx.deltaAbs
    }
    entryCurrency = "USD"
    entryExchangeRate = "1"
  } else {
    lines = [
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
      sourceId: input.billId,
      description: `Payment against ${before.bill_number}`,
      reference: paymentNumber,
      currency: entryCurrency,
      exchangeRate: entryExchangeRate,
      lines,
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
      tenant_id, payment_id, bill_id, amount, base_amount, fx_gain_loss
    ) VALUES (
      ${tenantId}::uuid, ${payment.id}::uuid, ${input.billId}::uuid,
      ${input.amount}::numeric,
      round(${input.amount}::numeric * ${before.exchange_rate}::numeric, 2),
      ${fxGainLoss}::numeric
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
/**
 * A picker shows the best few matches, not every payment that could
 * plausibly match — `payments` is SCALE_SENSITIVE (one row per payment
 * recorded, indefinitely), so joining it to every unmatched transaction with
 * no cap was a real N×M blowup: a `LATERAL` per-transaction search bounded
 * by this cap, rather than a single join materialising every candidate for
 * every transaction before sorting.
 */
const CANDIDATE_PAYMENT_CAP = 10

export async function candidatePaymentsForTransactions(
  tx: Tx,
  transactionIds: string[],
): Promise<Record<string, CandidatePayment[]>> {
  if (transactionIds.length === 0) return {}
  const rows = await tx<(CandidatePayment & { transaction_id: string })[]>`
    SELECT t.id AS transaction_id, cand.*
      FROM bank_transactions t
      JOIN bank_accounts a ON a.id = t.bank_account_id
      CROSS JOIN LATERAL (
        SELECT p.id, p.payment_number,
               to_char(p.payment_date,'YYYY-MM-DD') AS payment_date,
               p.amount::text AS amount, p.currency,
               coalesce(c.customer_name, v.vendor_name) AS counterparty_name
          FROM payments p
          LEFT JOIN customers c ON c.id = p.customer_id
          LEFT JOIN vendors v   ON v.id = p.vendor_id
         WHERE p.currency = a.currency
           AND ((t.amount > 0 AND p.customer_id IS NOT NULL)
                OR (t.amount < 0 AND p.vendor_id IS NOT NULL))
           AND NOT EXISTS (
                 SELECT 1 FROM bank_transactions o
                  WHERE o.matched_to_type = 'payment' AND o.matched_to_id = p.id
               )
         ORDER BY abs(p.amount - abs(t.amount)) ASC, p.payment_date DESC
         LIMIT ${CANDIDATE_PAYMENT_CAP}
      ) cand
     WHERE t.id = ANY(${transactionIds}::uuid[])
     ORDER BY t.id
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

// ---------------------------------------------------------------------------
// Writes — entering a vendor bill as a draft
// ---------------------------------------------------------------------------

export type VendorOption = { id: string; vendor_name: string; currency: string }

export async function listVendorsForPicker(tx: Tx): Promise<VendorOption[]> {
  return tx<VendorOption[]>`
    SELECT id, vendor_name, currency
      FROM vendors
     WHERE is_active
     ORDER BY vendor_name
  `
}

export type ExpenseAccountOption = {
  id: string
  account_code: string
  account_name: string
}

/**
 * Every active account, not only `account_type = 'expense'` — a bill can
 * legitimately debit an asset (capex, a prepaid) or pay down a liability, so
 * the type name on the column is illustrative, not a restriction the picker
 * should enforce.
 */
export async function listExpenseAccountsForPicker(
  tx: Tx,
): Promise<ExpenseAccountOption[]> {
  return tx<ExpenseAccountOption[]>`
    SELECT id, account_code, account_name
      FROM chart_of_accounts
     WHERE is_active
     ORDER BY account_code
  `
}

export type NewBillLine = {
  description: string
  quantity: string
  unitPrice: string
  taxAmount: string
  /** Which configured rate this line's tax belongs to — a reference only, not a computation (US-ACC-048/049). */
  taxRateId?: string | null
  expenseAccountId: string
}

/**
 * A draft bill — no liability is recognised yet (L58: recomputeBillTotals,
 * not this insert, is what makes the money columns correct). `approveBill`
 * is the audited, money-moving step; drafting one is not (see
 * audit/register.ts).
 *
 * Unlike `createInvoice`'s generated `invoice_number`, `bill_number` is
 * whatever the vendor printed on the bill — free text, unique only per
 * (tenant, vendor) via idx_bills_vendor_number. A collision is therefore a
 * genuine duplicate, not a numbering race, so there is no retry loop here:
 * it is left to surface as a constraint failure at the route (constraints.ts).
 */
export async function createBill(
  tx: Tx,
  tenantId: string,
  input: {
    vendorId: string
    billNumber: string
    reference: string | null
    billDate: string
    dueDate: string
    exchangeRate: string
    paymentTerms: string | null
    notes: string | null
    lines: NewBillLine[]
  },
  actorId: string,
): Promise<{ id: string }> {
  if (input.lines.length === 0) throw new AccountingRefused("no_lines")

  const [vendor] = await tx<{ currency: string }[]>`
    SELECT currency FROM vendors WHERE id = ${input.vendorId}::uuid
  `
  if (!vendor) throw new AccountingRefused("no_such_vendor")

  const [tenant] = await tx<{ default_currency: string }[]>`
    SELECT default_currency FROM tenants WHERE id = ${tenantId}::uuid
  `
  const baseCurrency = tenant?.default_currency ?? "USD"

  const [row] = await tx<{ id: string }[]>`
    INSERT INTO bills (
      tenant_id, vendor_id, bill_number, reference, bill_date, due_date,
      currency, exchange_rate, base_currency,
      subtotal, tax_total, total, amount_paid, amount_due,
      base_subtotal, base_tax_total, base_total,
      base_amount_paid, base_amount_due,
      payment_terms, notes, status, created_by
    ) VALUES (
      ${tenantId}::uuid, ${input.vendorId}::uuid, ${input.billNumber},
      ${input.reference}, ${input.billDate}::date, ${input.dueDate}::date,
      ${vendor.currency}, ${input.exchangeRate}::numeric, ${baseCurrency},
      0, 0, 0, 0, 0,
      0, 0, 0, 0, 0,
      ${input.paymentTerms}, ${input.notes}, 'draft', ${actorId}::uuid
    )
    RETURNING id
  `
  const billId = row.id

  let lineNumber = 0
  for (const line of input.lines) {
    lineNumber += 1
    await tx`
      INSERT INTO bill_lines (
        tenant_id, bill_id, line_number, description, quantity, unit_price,
        amount, tax_amount, tax_rate_id, expense_account_id
      ) VALUES (
        ${tenantId}::uuid, ${billId}::uuid, ${lineNumber}, ${line.description},
        ${line.quantity}::numeric, ${line.unitPrice}::numeric,
        round(${line.quantity}::numeric * ${line.unitPrice}::numeric, 2),
        ${line.taxAmount}::numeric, ${line.taxRateId ?? null}::uuid,
        ${line.expenseAccountId}::uuid
      )
    `
  }

  await recomputeBillTotals(tx, billId)
  return { id: billId }
}
