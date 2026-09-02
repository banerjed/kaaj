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

// ---------------------------------------------------------------------------
// Writes — the receivables cycle, posted to the ledger
// ---------------------------------------------------------------------------
//
// An invoice that does not reach the general ledger is a document, not
// accounting. Every write here that recognises revenue or receives cash posts
// a BALANCED journal entry in the same transaction as the document it
// describes — because `verify-stories.sql` asserts, over the live schema, that
// every entry balances in both the transaction currency and the base currency,
// and that an invoice's journal ties to its base total within 0.02.
//
// Three constraints do the catching, and each was watched refusing a bad write
// before being relied on:
//
//   ck_invoices_amounts_reconcile        total = subtotal + tax, due = total - paid,
//                                        and the same again in base currency
//   ck_journal_entry_lines_one_sided_positive
//                                        a line is a debit or a credit, never
//                                        both, never zero, never negative
//   ck_payment_allocations_one_document  an allocation names exactly one of
//                                        invoice_id / bill_id
//
// The middle one has a consequence worth stating: **a zero tax line cannot be
// written at all.** An invoice with no tax posts two lines, not three, and code
// that writes a 0.00 credit "for symmetry" fails at runtime.
//
// NOT built here: bills, banking and reconciliation still have no write path.

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
] as const
export type InvoiceStatus = (typeof INVOICE_STATUSES)[number]

/** The accounts the receivables cycle posts to, by code rather than by id. */
const ACCOUNTS = {
  cash: "1000",
  receivable: "1100",
  taxPayable: "2200",
  revenue: "4000",
} as const

export class AccountingRefused extends Error {
  constructor(
    readonly reason:
      | "no_such_invoice"
      | "no_such_account"
      | "wrong_status"
      | "no_lines"
      // Distinct from `no_lines` deliberately. Both used to be `no_lines`,
      // which meant `refusedBecause(..., "no_lines")` would have passed on a
      // broken posting — L60 reappearing in the code written after it.
      | "does_not_balance"
      | "period_closed"
      | "overpayment"
      | "number_taken",
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

/**
 * Recompute an invoice's ten money columns from its lines and its payments.
 *
 * Recomputed, never adjusted — the same rule as project task counts and
 * payroll run headers (L58). The lines and the allocations are the truth; the
 * header is a cache of them that `ck_invoices_amounts_reconcile` keeps
 * internally consistent but cannot keep TRUE.
 *
 * **The base-currency half is where the rounding lives.** `base_total` is the
 * sum of the two rounded parts, NOT `round(total * rate)`. Postgres rounds to
 * scale silently, so rounding the total independently can land a cent away
 * from `base_subtotal + base_tax_total` — and the CHECK requires them equal.
 * Round to the authoritative figures first, then derive (CLAUDE.md § Money,
 * L25).
 */
export async function recomputeInvoiceTotals(
  tx: Tx,
  invoiceId: string,
): Promise<void> {
  await tx`
    WITH line_totals AS (
      SELECT coalesce(sum(l.amount), 0)     AS subtotal,
             coalesce(sum(l.tax_amount), 0) AS tax_total
        FROM invoice_lines l WHERE l.invoice_id = ${invoiceId}::uuid
    ),
    paid AS (
      SELECT coalesce(sum(a.amount), 0)      AS amount_paid,
             coalesce(sum(a.base_amount), 0) AS base_amount_paid
        FROM payment_allocations a WHERE a.invoice_id = ${invoiceId}::uuid
    )
    UPDATE invoices i
       SET subtotal    = lt.subtotal,
           tax_total   = lt.tax_total,
           total       = lt.subtotal + lt.tax_total,
           amount_paid = p.amount_paid,
           amount_due  = (lt.subtotal + lt.tax_total) - p.amount_paid,
           -- Each part rounded to the column's scale FIRST, then summed, so
           -- base_total = base_subtotal + base_tax_total exactly.
           base_subtotal    = round(lt.subtotal  * i.exchange_rate, 2),
           base_tax_total   = round(lt.tax_total * i.exchange_rate, 2),
           base_total       = round(lt.subtotal  * i.exchange_rate, 2)
                            + round(lt.tax_total * i.exchange_rate, 2),
           base_amount_paid = p.base_amount_paid,
           base_amount_due  = round(lt.subtotal  * i.exchange_rate, 2)
                            + round(lt.tax_total * i.exchange_rate, 2)
                            - p.base_amount_paid,
           updated_at = now()
      FROM line_totals lt, paid p
     WHERE i.id = ${invoiceId}::uuid
  `
}

/** The next `JE-YYYY-nnnn`, from the numbers already in use. */
async function nextEntryNumber(tx: Tx, year: number): Promise<string> {
  const [row] = await tx<{ n: number }[]>`
    SELECT coalesce(max(nullif(substring(entry_number from '[0-9]+$'), '')::int),
                    0) + 1 AS n
      FROM journal_entries
  `
  return `JE-${year}-${String(row.n).padStart(4, "0")}`
}

/** One side of a journal entry, before it is written. */
type JournalLine = {
  accountCode: string
  debit: string | null
  credit: string | null
  description: string
}

/**
 * Write a balanced journal entry.
 *
 * The caller supplies the lines; this refuses to write anything that does not
 * balance, rather than letting the harness find it later over a table that
 * nobody prunes. A zero-amount line is dropped before insert, because
 * `ck_journal_entry_lines_one_sided_positive` refuses it — an invoice with no
 * tax posts two lines, not three.
 *
 * Every amount stays a STRING and every sum happens in SQL. `base_*` is
 * derived with the same round-then-sum discipline as the invoice header.
 */
async function postJournal(
  tx: Tx,
  tenantId: string,
  entry: {
    date: string
    sourceType: string
    sourceId: string
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

  // **A closed period does not accept new postings.**
  //
  // `accounting_periods` records the state, and the fixture has January 2026
  // `closed` and December 2025 `locked` — so this is not hypothetical: every
  // invoice in the fixture but one is dated inside a closed period.
  //
  // `packages/spec-tests` asserts this rule (INV-ACC-002) against its own
  // implementation, and nothing connected it to the deployed path. Two suites
  // green while contradicting each other is the exact shape CLAUDE.md warns
  // about, and it is why the check lives here rather than only in the spec.
  //
  // A date in NO period is allowed: periods are opened as a year is set up,
  // and refusing a posting because nobody has created next month yet would
  // stop work for a reason nobody could act on. Only an explicit non-open
  // period refuses.
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
        base_currency, base_debit_amount, base_credit_amount, description
      ) VALUES (
        ${tenantId}::uuid, ${head.id}::uuid,
        ${await accountId(tx, line.accountCode)}::uuid,
        ${lineNumber}, ${entry.currency},
        ${line.debit ?? "0"}::numeric, ${line.credit ?? "0"}::numeric,
        ${entry.exchangeRate}::numeric,
        'USD',
        round(${line.debit ?? "0"}::numeric  * ${entry.exchangeRate}::numeric, 2),
        round(${line.credit ?? "0"}::numeric * ${entry.exchangeRate}::numeric, 2),
        ${line.description}
      )
    `
  }

  // Balance is asserted HERE, against what was actually written, rather than
  // against what the caller intended. A rounding difference in the base
  // currency is invisible until a period close otherwise.
  const [check] = await tx<{ d: string; c: string; bd: string; bc: string }[]>`
    SELECT coalesce(sum(debit_amount),0)::text       AS d,
           coalesce(sum(credit_amount),0)::text      AS c,
           coalesce(sum(base_debit_amount),0)::text  AS bd,
           coalesce(sum(base_credit_amount),0)::text AS bc
      FROM journal_entry_lines WHERE entry_id = ${head.id}::uuid
  `
  if (check.d !== check.c || check.bd !== check.bc) {
    throw new AccountingRefused(
      "does_not_balance",
      `journal ${entryNumber}: debits ${check.d} against credits ${check.c}, ` +
        `base ${check.bd} against ${check.bc}`,
    )
  }

  return head.id
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

/**
 * Issue a draft invoice, and recognise the revenue.
 *
 *   DR Accounts Receivable   total
 *     CR Revenue                    subtotal
 *     CR Sales Tax Payable          tax        (omitted when it is zero)
 *
 * Refused with no lines: an invoice for nothing is a document that says a
 * customer owes zero, and it looks exactly like one whose lines failed to
 * load.
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

  // Recompute FIRST, so the journal posts the figures the lines support rather
  // than whatever the header happened to hold.
  await recomputeInvoiceTotals(tx, invoiceId)
  const current = await invoiceState(tx, invoiceId)

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
        {
          accountCode: ACCOUNTS.taxPayable,
          debit: null,
          credit: current.tax_total,
          description: `Tax on ${current.invoice_number}`,
        },
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
 * Receive money against an invoice.
 *
 *   DR Cash at Bank            amount
 *     CR Accounts Receivable          amount
 *
 * Refused if it would pay more than is owed. Nothing in the schema stops an
 * over-allocation — `ck_invoices_amounts_reconcile` is happy with a negative
 * `amount_due` right up until it is not, because the CHECK also requires every
 * figure to be `>= 0`, so the failure would arrive as a constraint violation
 * with no useful message rather than as "that is more than is outstanding".
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
  // Compared in SQL, in NUMERIC. `Number(amount) > Number(due)` is the float64
  // round trip on the one comparison that decides whether money is refused.
  const [room] = await tx<{ too_much: boolean }[]>`
    SELECT ${input.amount}::numeric > ${before.amount_due}::numeric AS too_much
  `
  if (room.too_much) {
    throw new AccountingRefused("overpayment", before.amount_due)
  }

  const [numbering] = await tx<{ n: number }[]>`
    SELECT coalesce(max(nullif(substring(payment_number from '[0-9]+$'),
                                '')::int), 0) + 1 AS n
      FROM payments WHERE payment_number LIKE 'PAY-%'
  `
  const year = input.paymentDate.slice(0, 4)
  const paymentNumber = `PAY-${year}-${String(numbering.n).padStart(3, "0")}`

  const [customer] = await tx<{ customer_id: string }[]>`
    SELECT customer_id FROM invoices WHERE id = ${input.invoiceId}::uuid
  `

  const entryId = await postJournal(
    tx,
    tenantId,
    {
      date: input.paymentDate,
      sourceType: "payment",
      sourceId: input.invoiceId,
      description: `Payment received against ${before.invoice_number}`,
      reference: paymentNumber,
      currency: before.currency,
      exchangeRate: before.exchange_rate,
      lines: [
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
      tenant_id, payment_id, invoice_id, amount, base_amount
    ) VALUES (
      ${tenantId}::uuid, ${payment.id}::uuid, ${input.invoiceId}::uuid,
      ${input.amount}::numeric,
      round(${input.amount}::numeric * ${before.exchange_rate}::numeric, 2)
    )
  `

  // The header is a cache of the allocations. Recomputed, never adjusted.
  await recomputeInvoiceTotals(tx, input.invoiceId)

  const [settled] = await tx<{ due: string }[]>`
    SELECT amount_due::text AS due FROM invoices WHERE id = ${input.invoiceId}::uuid
  `
  // Decided in SQL against NUMERIC zero, not by parsing the string.
  const [state] = await tx<{ fully_paid: boolean }[]>`
    SELECT ${settled.due}::numeric = 0 AS fully_paid
  `
  const status: InvoiceStatus = state.fully_paid ? "paid" : "partial"

  await tx`
    UPDATE invoices
       SET status = ${status},
           paid_at = ${state.fully_paid ? tx`now()` : null},
           updated_at = now(), updated_by = ${actorId}::uuid
     WHERE id = ${input.invoiceId}::uuid
  `

  return { paymentNumber, status }
}

/**
 * Void a draft invoice.
 *
 * Draft only, and deliberately. Once an invoice is issued its revenue is in
 * the ledger, and removing it is a credit note — a new document that reverses
 * the first — not an edit to the original. `journal_entries` is append-only in
 * spirit for the same reason `audit_log` is: a correction is another row.
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
