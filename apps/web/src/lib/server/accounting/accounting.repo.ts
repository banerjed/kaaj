import type { Tx } from "../db/tenant"

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
         i.amount_paid::text AS amount_paid,
         i.amount_due::text  AS amount_due,
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

/** Entries whose debits don't equal their credits — checked at request time, not just by the schema/harness. */
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

/** Every line for a set of entries, in one query — avoids N+1 as rows expand. */
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
      | "already_matched",
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
    )
    UPDATE invoices i
       SET subtotal    = lt.subtotal,
           tax_total   = lt.tax_total,
           total       = lt.subtotal + lt.tax_total,
           amount_paid = p.amount_paid,
           amount_due  = (lt.subtotal + lt.tax_total) - p.amount_paid,
           -- Round each part first, then sum, so base_total stays exact.
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

/**
 * The next `INV-YYYY-nnn`, from the numbers already in use — same
 * scan-and-increment shape as `nextEntryNumber`/`recordPayment`'s
 * `paymentNumber`, not a locked counter. A race between two concurrent
 * creates hits `idx_invoices_number` (UNIQUE) rather than sharing a number;
 * `createInvoice` turns that into `AccountingRefused("number_taken")`.
 */
async function nextInvoiceNumber(tx: Tx, year: number): Promise<string> {
  const [row] = await tx<{ n: number }[]>`
    SELECT coalesce(max(nullif(substring(invoice_number from '[0-9]+$'), '')::int),
                    0) + 1 AS n
      FROM invoices WHERE invoice_number LIKE 'INV-%'
  `
  return `INV-${year}-${String(row.n).padStart(3, "0")}`
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

  // Asserted against what was actually written, not what was intended.
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

  const [customer] = await tx<{ currency: string }[]>`
    SELECT currency FROM customers WHERE id = ${input.customerId}::uuid
  `
  if (!customer) throw new AccountingRefused("no_such_customer")

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
        amount, discount_percent, discount_amount, tax_amount, revenue_account_id
      ) VALUES (
        ${tenantId}::uuid, ${invoiceId}::uuid, ${lineNumber}, ${line.description},
        ${line.quantity}::numeric, ${line.unitPrice}::numeric,
        round(${line.quantity}::numeric * ${line.unitPrice}::numeric, 2),
        ${line.discountPercent}::numeric,
        round(${line.quantity}::numeric * ${line.unitPrice}::numeric
              * ${line.discountPercent}::numeric / 100, 2),
        ${line.taxAmount}::numeric,
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
 * Refused if it would overpay — checked here so the message is useful rather
 * than a bare CHECK-constraint failure.
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
