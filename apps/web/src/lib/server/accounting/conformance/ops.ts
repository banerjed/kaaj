/**
 * The operation table (spec section 20.3): one fixture `op` → one engine
 * call. This is the ONLY conformance file that imports the engine (section
 * 21). It calls write operations and report reads; it never computes an
 * expectation.
 */
import { createHash } from "node:crypto"
import type { Tx } from "../../db/tenant"
import {
  createInvoice,
  issueInvoice,
  recordPayment,
  recordLockboxPayment,
  recordCreditMemo,
  recordWriteOff,
  voidInvoice,
  recordManualJournalEntry,
  closePeriod,
  reopenPeriod,
  recordAccrual,
  createAmortizationSchedule,
  postDueAmortizations,
  yearEndClose,
  trialBalance,
  trialBalanceTotals,
  trialBalanceComparison,
  balanceSheet,
  balanceSheetTotals,
  profitAndLoss,
  profitAndLossTotals,
  profitAndLossComparison,
  arAging,
  taxLiabilitySummary,
  customerBalances,
  cashFlowTotals,
  controlAccountTieOut,
  ledger,
  ledgerLines,
  AccountingRefused,
} from "../accounting.repo"
import * as payables from "../payables.repo"
import { importStatement } from "../statement-import.repo"
import { createTaxRate } from "../tax_rates.repo"
import {
  ACCOUNT_CODES,
  ITEMS,
  SEMANTIC_BY_CODE,
  must,
  type Handles,
} from "./handles"

export type Ref = {
  kind:
    | "invoice"
    | "bill"
    | "journal"
    | "payment"
    | "period"
    | "schedule"
    | "credit"
    | "bank_transaction"
    | "tax_rate"
  id: string
}

export type Ctx = {
  tx: Tx
  tenantId: string
  actorId: string
  h: Handles
  refs: Map<string, Ref>
}

export type OpOutcome = {
  /** What `as:` binds to. */
  ref?: Ref
  /** Values the fixture can compare in `expect.value`. */
  value?: Record<string, string>
}

type Args = Record<string, unknown>

function str(args: Args, key: string, fallback?: string): string {
  const v = args[key]
  if (v === undefined || v === null) {
    if (fallback !== undefined) return fallback
    throw new Error(`missing argument ${key}`)
  }
  return String(v)
}

function optStr(args: Args, key: string): string | null {
  const v = args[key]
  return v === undefined || v === null ? null : String(v)
}

function plusDays(date: string, days: number): string {
  const d = new Date(`${date}T00:00:00Z`)
  d.setUTCDate(d.getUTCDate() + days)
  return d.toISOString().slice(0, 10)
}

function ref(ctx: Ctx, handle: string, kind: Ref["kind"]): string {
  const r = ctx.refs.get(handle)
  if (!r) throw new Error(`unknown handle ${handle}`)
  if (r.kind !== kind)
    throw new Error(`${handle} is a ${r.kind}, not a ${kind}`)
  return r.id
}

/** Spec GL-006: an id that exists in no tenant, so the ENGINE does the refusing. */
const NO_SUCH_ACCOUNT_ID = "00000000-0000-4000-8000-00000000dead"
/** Spec TAX-016: a tax rate id that exists nowhere, so the engine's foreign key refuses. */
const NO_SUCH_TAX_ID = "00000000-0000-4000-8000-00000000beef"

function taxRate(ctx: Ctx, code: string): { id: string; rate: string } {
  if (code === "NO_SUCH_TAX") return { id: NO_SUCH_TAX_ID, rate: "0" }
  return must(ctx.h.taxRates, code, "tax rate")
}

function accountId(ctx: Ctx, semantic: string): string {
  if (semantic === "NO_SUCH_ACCOUNT") return NO_SUCH_ACCOUNT_ID
  if (semantic === "OTHER_TENANT_ACCOUNT")
    return must(ctx.h.accounts, semantic, "account")
  if (!(semantic in ACCOUNT_CODES))
    throw new Error(`unknown account ${semantic}`)
  return must(ctx.h.accounts, semantic, "account")
}

type LineArg = {
  item?: string
  description?: string
  quantity?: string
  unit_price?: string
  discount_percent?: string
  tax?: string
  tax_amount?: string
  account?: string
  amount?: string
}

function invoiceLines(ctx: Ctx, lines: LineArg[]) {
  return lines.map((l) => {
    const item = l.item ? ITEMS[l.item] : null
    if (l.item && !item) throw new Error(`unknown item ${l.item}`)
    const taxCode = l.tax ?? "TAX-0"
    const tax = taxRate(ctx, taxCode)
    if (taxCode !== "TAX-0" && l.tax_amount === undefined) {
      throw new Error(
        `a ${taxCode} line gives tax_amount explicitly (spec 8.3)`,
      )
    }
    const unitPrice = l.unit_price ?? item?.unitPrice
    if (unitPrice === undefined) throw new Error("unit_price")
    return {
      description: l.description ?? item?.description ?? "Line",
      quantity: l.quantity ?? "1",
      unitPrice,
      discountPercent: l.discount_percent ?? "0",
      taxAmount: l.tax_amount ?? "0",
      taxRateId: tax.id,
    }
  })
}

type JournalLineArg = {
  account: string
  debit?: string
  credit?: string
  description?: string
}

function journalLines(ctx: Ctx, lines: JournalLineArg[]) {
  return lines.map((l) => ({
    accountId: accountId(ctx, l.account),
    debit: l.debit ?? "0",
    credit: l.credit ?? "0",
    description: l.description ?? l.account,
  }))
}

async function manualJournal(
  ctx: Ctx,
  a: Args,
  lines: JournalLineArg[],
): Promise<OpOutcome> {
  const r = await recordManualJournalEntry(
    ctx.tx,
    ctx.tenantId,
    {
      date: str(a, "date"),
      description: str(a, "description", "Conformance journal"),
      reference: optStr(a, "reference"),
      currency: str(a, "currency", "USD"),
      exchangeRate: str(a, "rate", "1"),
      lines: journalLines(ctx, lines),
    },
    ctx.actorId,
  )
  return {
    ref: { kind: "journal", id: r.id },
    value: { entry_number: r.entryNumber },
  }
}

type Row = Record<string, unknown>

/** A report's rows as `<KEY>.<field>` entries of one flat map, plus `rows`. */
function flatten(
  out: Record<string, string>,
  rows: Row[],
  keyOf: (row: Row) => string,
): void {
  for (const row of rows) {
    const k = keyOf(row)
    for (const [field, v] of Object.entries(row)) {
      if (v === null || v === undefined || typeof v === "object") continue
      out[`${k}.${field}`] = String(v)
    }
  }
  out.rows = String(rows.length)
}

function totals(out: Record<string, string>, t: Row): void {
  for (const [k, v] of Object.entries(t)) {
    if (v !== null && v !== undefined && typeof v !== "object")
      out[k] = String(v)
  }
}

function semantic(code: unknown): string {
  return typeof code === "string" && code
    ? (SEMANTIC_BY_CODE[code] ?? `code:${code}`)
    : "none"
}

function customerNumber(ctx: Ctx, id: unknown): string {
  for (const [n, cid] of ctx.h.customers) if (cid === id) return n
  return String(id)
}

/** Report values carry a hash of the whole output so `repeat` can show two runs are identical. */
function withHash(out: Record<string, string>): Record<string, string> {
  const h = createHash("sha256")
  for (const k of Object.keys(out).sort()) h.update(`${k}=${out[k]}\n`)
  out.hash = h.digest("hex").slice(0, 16)
  return out
}

async function sumInSql(tx: Tx, terms: string[]): Promise<string> {
  const expr =
    terms.length === 0 ? "0" : terms.map((t) => `(${t})::numeric`).join("+")
  const [row] = await tx.unsafe<{ t: string }[]>(`SELECT (${expr})::text AS t`)
  return row.t
}

export const OPS: Record<string, (ctx: Ctx, a: Args) => Promise<OpOutcome>> = {
  // --- general ledger ------------------------------------------------------
  "journal.post": (ctx, a) =>
    manualJournal(ctx, a, a.lines as JournalLineArg[]),

  "journal.attempt_update": async (ctx, a) => {
    const id = ref(ctx, str(a, "journal"), "journal")
    const amount = str(a, "debit")
    // Row-level security makes a posted entry invisible to UPDATE, so the
    // statement succeeds and changes nothing: the fixture asserts rows = 0
    // and the balances afterwards, not an error.
    const lines = await ctx.tx`
      UPDATE journal_entry_lines SET debit_amount = ${amount}::numeric
       WHERE entry_id = ${id}::uuid AND debit_amount > 0`
    const heads = await ctx.tx`
      UPDATE journal_entries SET description = 'tampered' WHERE id = ${id}::uuid`
    return { value: { rows: String(lines.count + heads.count) } }
  },

  "journal.attempt_delete": async (ctx, a) => {
    const id = ref(ctx, str(a, "journal"), "journal")
    await ctx.tx`DELETE FROM journal_entry_lines WHERE entry_id = ${id}::uuid`
    await ctx.tx`DELETE FROM journal_entries WHERE id = ${id}::uuid`
    return {}
  },

  /** Spec AUD-014: entry numbers read back in order, with no gap. */
  "ledger.sequence": async (ctx) => {
    const rows = await ctx.tx<{ entry_number: string; n: string }[]>`
      SELECT entry_number, substring(entry_number FROM '(\\d+)$') AS n
        FROM journal_entries WHERE tenant_id = ${ctx.tenantId}::uuid
       ORDER BY entry_number`
    const nums = rows.map((r) => Number(r.n)).sort((x, y) => x - y)
    const gaps =
      nums.length === 0
        ? 0
        : nums[nums.length - 1] - nums[0] + 1 - new Set(nums).size
    return {
      value: {
        count: String(rows.length),
        gaps: String(gaps),
        first: rows[0]?.entry_number ?? "",
        last: rows[rows.length - 1]?.entry_number ?? "",
      },
    }
  },

  /** Spec NUM-014: a balance crosses into TypeScript as a string, never a number. */
  "ledger.balance_type": async (ctx, a) => {
    const code = ACCOUNT_CODES[str(a, "account")]
    const [row] = await ctx.tx<{ balance: unknown }[]>`
      SELECT coalesce(sum(l.base_debit_amount - l.base_credit_amount), 0) AS balance
        FROM journal_entry_lines l JOIN journal_entries je ON je.id = l.entry_id
        JOIN chart_of_accounts c ON c.id = l.account_id
       WHERE je.tenant_id = ${ctx.tenantId}::uuid AND c.account_code = ${code}`
    return { value: { type: typeof row.balance, value: String(row.balance) } }
  },

  // --- banking as journals (the engine has no transfer/fee/interest op) ----
  "bank.transfer": (ctx, a) =>
    manualJournal(
      ctx,
      { ...a, description: a.description ?? "Bank transfer" },
      [
        { account: str(a, "to"), debit: str(a, "amount") },
        { account: str(a, "from"), credit: str(a, "amount") },
      ],
    ),
  "bank.fee": (ctx, a) =>
    manualJournal(ctx, { ...a, description: a.description ?? "Bank fee" }, [
      { account: "BANK_FEES", debit: str(a, "amount") },
      { account: str(a, "bank", "OPERATING_BANK"), credit: str(a, "amount") },
    ]),
  "bank.interest": (ctx, a) =>
    manualJournal(ctx, { ...a, description: a.description ?? "Interest" }, [
      { account: str(a, "bank", "OPERATING_BANK"), debit: str(a, "amount") },
      { account: "INTEREST_INCOME", credit: str(a, "amount") },
    ]),
  "bank.opening_balance": (ctx, a) =>
    manualJournal(
      ctx,
      { ...a, description: a.description ?? "Opening balance" },
      [
        { account: str(a, "bank", "OPERATING_BANK"), debit: str(a, "amount") },
        { account: "RETAINED_EARNINGS", credit: str(a, "amount") },
      ],
    ),

  /** A statement with the given lines, through the engine's import; `as` binds the FIRST line's transaction. */
  "bank.import": async (ctx, a) => {
    const bankId = must(
      ctx.h.banks,
      str(a, "bank", "Operating Bank"),
      "bank account",
    )
    const [account] = await ctx.tx<
      {
        id: string
        account_name: string
        bank_name: string
        currency: string
        statement_import_profile: null
      }[]
    >`SELECT id, account_name, bank_name, currency, statement_import_profile FROM bank_accounts WHERE id = ${bankId}::uuid`
    const statement = str(a, "statement", "S1")
    const lines = a.lines as {
      date: string
      amount: string
      description?: string
      reference?: string
      id?: string
    }[]
    const transactions = lines.map((l, i) => ({
      line: i + 2,
      date: l.date,
      valueDate: null,
      description: l.description ?? `Line ${i + 1}`,
      reference: l.reference ?? null,
      amount: l.amount,
      balance: null,
      externalId: l.id ?? `${statement}-${i + 1}`,
      sequence: i,
    }))
    const body = transactions
      .map((t) => `${t.date},${t.amount},${t.description}`)
      .join("\n")
    const r = await importStatement(ctx.tx, {
      tenantId: ctx.tenantId,
      account,
      fileName: `${statement}.csv`,
      format: "csv",
      fileSha256: createHash("sha256").update(body).digest("hex"),
      mapping: null,
      linesInFile: transactions.length + 1,
      transactions,
      period: null,
      balanceCheck: "unavailable",
      actorId: ctx.actorId,
    })
    const [first] = await ctx.tx<{ id: string }[]>`
      SELECT id FROM bank_transactions
       WHERE tenant_id = ${ctx.tenantId}::uuid AND bank_account_id = ${bankId}::uuid
         AND bank_transaction_id = ${transactions[0].externalId}`
    const [count] = await ctx.tx<{ n: string }[]>`
      SELECT count(*)::text AS n FROM bank_transactions
       WHERE tenant_id = ${ctx.tenantId}::uuid AND bank_account_id = ${bankId}::uuid`
    return {
      ref: first ? { kind: "bank_transaction", id: first.id } : undefined,
      value: {
        imported: String(r.imported),
        duplicates: String(r.duplicates),
        transactions: count.n,
      },
    }
  },

  "bank.match": async (ctx, a) => {
    const t = ref(ctx, str(a, "transaction"), "bank_transaction")
    const p = ref(ctx, str(a, "payment"), "payment")
    const r = await payables.matchBankTransaction(ctx.tx, t, p)
    return { value: { from: r.from } }
  },

  // --- receivables ---------------------------------------------------------
  "invoice.create": async (ctx, a) => {
    const date = str(a, "date")
    const r = await createInvoice(
      ctx.tx,
      ctx.tenantId,
      {
        customerId: must(ctx.h.customers, str(a, "customer"), "customer"),
        invoiceDate: date,
        dueDate: str(a, "due_date", plusDays(date, 30)),
        exchangeRate: str(a, "rate", "1"),
        paymentTerms: null,
        notes: null,
        footerText: null,
        lines: invoiceLines(ctx, a.lines as LineArg[]),
      },
      ctx.actorId,
    )
    return {
      ref: { kind: "invoice", id: r.id },
      value: { invoice_number: r.invoiceNumber },
    }
  },

  "invoice.post": async (ctx, a) => {
    const id = ref(ctx, str(a, "invoice"), "invoice")
    const r = await issueInvoice(ctx.tx, ctx.tenantId, id, ctx.actorId)
    const [entry] = await ctx.tx<{ id: string }[]>`
      SELECT journal_entry_id AS id FROM invoices WHERE id = ${id}::uuid`
    return {
      ref: entry?.id ? { kind: "journal", id: entry.id } : undefined,
      value: { entry_number: r.entryNumber },
    }
  },

  /** Create and issue in one op, for `repeat` (spec AR-022, NUM-003). */
  "invoice.issue_new": async (ctx, a) => {
    const created = await OPS["invoice.create"](ctx, a)
    const id = created.ref!.id
    await issueInvoice(ctx.tx, ctx.tenantId, id, ctx.actorId)
    return created
  },

  "invoice.void": async (ctx, a) => {
    const id = ref(ctx, str(a, "invoice"), "invoice")
    await voidInvoice(
      ctx.tx,
      id,
      ctx.actorId,
      str(a, "reason", "Conformance void"),
    )
    return {}
  },

  "invoice.credit": async (ctx, a) => {
    const id = ref(ctx, str(a, "invoice"), "invoice")
    const r = await recordCreditMemo(
      ctx.tx,
      ctx.tenantId,
      {
        invoiceId: id,
        amount: str(a, "amount"),
        creditDate: str(a, "date"),
        reason: str(a, "reason", "Credit"),
      },
      ctx.actorId,
    )
    const [c] = await ctx.tx<{ id: string }[]>`
      SELECT id FROM invoice_credits WHERE tenant_id = ${ctx.tenantId}::uuid AND credit_number = ${r.creditNumber}`
    return {
      ref: { kind: "credit", id: c.id },
      value: { credit_number: r.creditNumber, status: r.status },
    }
  },

  "invoice.write_off": async (ctx, a) => {
    const id = ref(ctx, str(a, "invoice"), "invoice")
    const r = await recordWriteOff(
      ctx.tx,
      ctx.tenantId,
      {
        invoiceId: id,
        amount: str(a, "amount"),
        creditDate: str(a, "date"),
        reason: str(a, "reason", "Write-off"),
      },
      ctx.actorId,
    )
    const [c] = await ctx.tx<{ id: string }[]>`
      SELECT id FROM invoice_credits WHERE tenant_id = ${ctx.tenantId}::uuid AND credit_number = ${r.creditNumber}`
    return {
      ref: { kind: "credit", id: c.id },
      value: { credit_number: r.creditNumber, status: r.status },
    }
  },

  "payment.receive": async (ctx, a) => {
    const id = ref(ctx, str(a, "invoice"), "invoice")
    const r = await recordPayment(
      ctx.tx,
      ctx.tenantId,
      {
        invoiceId: id,
        amount: str(a, "amount"),
        paymentDate: str(a, "date"),
        method: str(a, "method", "wire_transfer"),
        reference: optStr(a, "reference"),
        bankAccountId: must(
          ctx.h.banks,
          str(a, "bank", "Operating Bank"),
          "bank account",
        ),
      },
      ctx.actorId,
    )
    const [p] = await ctx.tx<{ id: string }[]>`
      SELECT id FROM payments WHERE payment_number = ${r.paymentNumber} AND tenant_id = ${ctx.tenantId}::uuid`
    return {
      ref: { kind: "payment", id: p.id },
      value: { payment_number: r.paymentNumber, status: r.status },
    }
  },

  "payment.receive_batch": async (ctx, a) => {
    const allocations = (
      a.allocate as { invoice: string; amount: string }[]
    ).map((x) => ({
      invoiceId: ref(ctx, x.invoice, "invoice"),
      amount: x.amount,
    }))
    const r = await recordLockboxPayment(
      ctx.tx,
      ctx.tenantId,
      {
        customerId: must(ctx.h.customers, str(a, "customer"), "customer"),
        allocations,
        totalAmount: str(a, "amount"),
        paymentDate: str(a, "date"),
        method: str(a, "method", "wire_transfer"),
        reference: optStr(a, "reference"),
        bankAccountId: must(
          ctx.h.banks,
          str(a, "bank", "Operating Bank"),
          "bank account",
        ),
      },
      ctx.actorId,
    )
    const [p] = await ctx.tx<{ id: string }[]>`
      SELECT id FROM payments WHERE payment_number = ${r.paymentNumber} AND tenant_id = ${ctx.tenantId}::uuid`
    return {
      ref: { kind: "payment", id: p.id },
      value: { payment_number: r.paymentNumber },
    }
  },

  // --- payables ------------------------------------------------------------
  "bill.create": async (ctx, a) => {
    const date = str(a, "date")
    const lines = (a.lines as LineArg[]).map((l) => {
      const taxCode = l.tax ?? "TAX-0"
      const tax = taxRate(ctx, taxCode)
      if (taxCode !== "TAX-0" && l.tax_amount === undefined) {
        throw new Error(
          `a ${taxCode} line gives tax_amount explicitly (spec 8.3)`,
        )
      }
      const item = l.item ? ITEMS[l.item] : null
      const unitPrice = l.unit_price ?? l.amount ?? item?.cost ?? undefined
      if (unitPrice === undefined || unitPrice === null)
        throw new Error("amount")
      return {
        description: l.description ?? item?.description ?? l.account ?? "Line",
        quantity: l.quantity ?? "1",
        unitPrice,
        taxAmount: l.tax_amount ?? "0",
        taxRateId: tax.id,
        expenseAccountId: accountId(ctx, l.account ?? "INVENTORY"),
      }
    })
    const r = await payables.createBill(
      ctx.tx,
      ctx.tenantId,
      {
        vendorId: must(ctx.h.vendors, str(a, "vendor"), "vendor"),
        billNumber: str(
          a,
          "bill_number",
          `VB-${date}-${ctx.refs.size + 1}-${Math.random().toString(36).slice(2, 7)}`,
        ),
        reference: optStr(a, "reference"),
        billDate: date,
        dueDate: str(a, "due_date", plusDays(date, 30)),
        exchangeRate: str(a, "rate", "1"),
        paymentTerms: null,
        notes: null,
        lines,
      },
      ctx.actorId,
    )
    return { ref: { kind: "bill", id: r.id } }
  },

  /** Create and approve in one op, for `repeat` (spec AP-017). */
  "bill.create_and_approve": async (ctx, a) => {
    const created = await OPS["bill.create"](ctx, a)
    await payables.approveBill(
      ctx.tx,
      ctx.tenantId,
      created.ref!.id,
      ctx.actorId,
    )
    return created
  },

  "bill.approve": async (ctx, a) => {
    const id = ref(ctx, str(a, "bill"), "bill")
    const r = await payables.approveBill(ctx.tx, ctx.tenantId, id, ctx.actorId)
    return { value: { entry_number: r.entryNumber } }
  },

  "bill.pay": async (ctx, a) => {
    const id = ref(ctx, str(a, "bill"), "bill")
    const r = await payables.recordVendorPayment(
      ctx.tx,
      ctx.tenantId,
      {
        billId: id,
        amount: str(a, "amount"),
        paymentDate: str(a, "date"),
        method: str(a, "method", "wire_transfer"),
        reference: optStr(a, "reference"),
        bankAccountId: must(
          ctx.h.banks,
          str(a, "bank", "Operating Bank"),
          "bank account",
        ),
      },
      ctx.actorId,
    )
    const [p] = await ctx.tx<{ id: string }[]>`
      SELECT id FROM payments WHERE payment_number = ${r.paymentNumber} AND tenant_id = ${ctx.tenantId}::uuid`
    return {
      ref: p ? { kind: "payment", id: p.id } : undefined,
      value: { payment_number: r.paymentNumber, status: r.status },
    }
  },

  "bill.pay_batch": async (ctx, a) => {
    const ids = (a.bills as string[]).map((b) => ref(ctx, b, "bill"))
    const r = await payables.payBillsInBatch(
      ctx.tx,
      ctx.tenantId,
      {
        billIds: ids,
        paymentDate: str(a, "date"),
        method: str(a, "method", "wire_transfer"),
        reference: optStr(a, "reference"),
        bankAccountId: must(
          ctx.h.banks,
          str(a, "bank", "Operating Bank"),
          "bank account",
        ),
      },
      ctx.actorId,
    )
    const out: Record<string, string> = { payments: String(r.payments.length) }
    r.payments.forEach((p, i) => {
      out[`payment${i + 1}.total`] = p.total
      out[`payment${i + 1}.bills`] = String(p.billNumbers.length)
    })
    return { value: out }
  },

  // --- rates ---------------------------------------------------------------
  "tax.create_rate": async (ctx, a) => {
    const code = str(a, "code")
    const r = await createTaxRate(
      ctx.tx,
      ctx.tenantId,
      {
        code,
        tax_name: str(a, "name", code),
        tax_type: "sales_tax",
        rate: str(a, "rate"),
        country: "US",
        region: null,
        jurisdiction: "US-ACS",
        is_reverse_charge: false,
        effective_from: str(a, "effective_from", "2026-01-01"),
      },
      ctx.actorId,
    )
    ctx.h.taxRates.set(code, { id: r.id, rate: str(a, "rate") })
    return { ref: { kind: "tax_rate", id: r.id } }
  },

  /** exchange_rates is global reference data the service role writes; the runner writes it as the owner. */
  "fx.set_rate": async (ctx, a) => {
    const rate = str(a, "rate")
    await ctx.tx`RESET ROLE`
    try {
      await ctx.tx`
        INSERT INTO exchange_rates (from_currency, to_currency, rate_date, rate, inverse_rate, source, is_manual, created_by)
        VALUES (${str(a, "from")}, ${str(a, "to", "USD")}, ${str(a, "date")}::date, ${rate}::numeric,
                round(1 / ${rate}::numeric, 6), 'ACS-FIXTURE', true, ${ctx.actorId}::uuid)`
    } finally {
      await ctx.tx`SET LOCAL ROLE app_user`
    }
    return {}
  },

  // --- periods -------------------------------------------------------------
  "period.close": async (ctx, a) => {
    await closePeriod(
      ctx.tx,
      must(ctx.h.periods, str(a, "period"), "period"),
      ctx.actorId,
    )
    return {}
  },
  "period.reopen": async (ctx, a) => {
    await reopenPeriod(ctx.tx, must(ctx.h.periods, str(a, "period"), "period"))
    return {}
  },
  "year.close": async (ctx, a) => {
    const r = await yearEndClose(
      ctx.tx,
      ctx.tenantId,
      {
        asOf: str(a, "as_of"),
        expectedNetIncome: str(a, "expected_net_income"),
      },
      ctx.actorId,
    )
    const [entry] = await ctx.tx<{ id: string }[]>`
      SELECT id FROM journal_entries WHERE tenant_id = ${ctx.tenantId}::uuid AND entry_number = ${r.entryNumber}`
    return {
      ref: { kind: "journal", id: entry.id },
      value: { entry_number: r.entryNumber, net_income: r.netIncome },
    }
  },

  // --- accruals and amortization --------------------------------------------
  "accrual.create": async (ctx, a) => {
    const r = await recordAccrual(
      ctx.tx,
      ctx.tenantId,
      {
        periodId: must(ctx.h.periods, str(a, "period"), "period"),
        expenseAccountId: accountId(ctx, str(a, "account")),
        amount: str(a, "amount"),
        description: str(a, "description", "Accrual"),
        reference: optStr(a, "reference"),
      },
      ctx.actorId,
    )
    return {
      ref: { kind: "journal", id: r.accrualEntryId },
      value: {
        reversal_date: r.reversalDate,
        accrual_entry: r.accrualEntryNumber,
        reversal_entry: r.reversalEntryNumber,
      },
    }
  },

  "amortization.create": async (ctx, a) => {
    const r = await createAmortizationSchedule(
      ctx.tx,
      ctx.tenantId,
      {
        kind: str(a, "kind", "prepaid_expense") as
          "prepaid_expense" | "deferred_revenue",
        balanceSheetAccountId: accountId(ctx, str(a, "balance_sheet_account")),
        incomeStatementAccountId: accountId(
          ctx,
          str(a, "income_statement_account"),
        ),
        totalAmount: str(a, "amount"),
        periodsTotal: Number(a.periods),
        nextRunDate: str(a, "first_date"),
        description: str(a, "description", "Amortization"),
        reference: optStr(a, "reference"),
      },
      ctx.actorId,
    )
    return { ref: { kind: "schedule", id: r.id } }
  },

  "amortization.post_due": async (ctx, a) => {
    const times = Number(a.repeat ?? 1)
    let posted = 0
    let first: string | undefined
    for (let i = 0; i < times; i++) {
      const r = await postDueAmortizations(ctx.tx, ctx.tenantId, ctx.actorId)
      posted += r.length
      first ??= r[0]?.entryId
    }
    return {
      ref: first ? { kind: "journal", id: first } : undefined,
      value: { posted: String(posted) },
    }
  },

  // --- reports (section 12): values only, nothing is written ----------------
  "report.trial_balance": async (ctx, a) => {
    const f = { asOf: optStr(a, "as_of") ?? undefined }
    const out: Record<string, string> = {}
    totals(out, await trialBalanceTotals(ctx.tx, f))
    flatten(out, (await trialBalance(ctx.tx, f)) as unknown as Row[], (r) =>
      semantic(r.account_code),
    )
    return { value: withHash(out) }
  },
  "report.trial_balance_comparison": async (ctx, a) => {
    const out: Record<string, string> = {}
    const rows = await trialBalanceComparison(ctx.tx, {
      asOf: str(a, "as_of"),
      compareAsOf: str(a, "compare_as_of"),
    })
    flatten(out, rows as unknown as Row[], (r) => semantic(r.account_code))
    return { value: withHash(out) }
  },
  "report.balance_sheet": async (ctx, a) => {
    const f = { asOf: optStr(a, "as_of") ?? undefined }
    const out: Record<string, string> = {}
    totals(out, await balanceSheetTotals(ctx.tx, f))
    flatten(out, (await balanceSheet(ctx.tx, f)) as unknown as Row[], (r) =>
      semantic(r.account_code),
    )
    return { value: withHash(out) }
  },
  "report.income_statement": async (ctx, a) => {
    const f = {
      from: optStr(a, "from") ?? undefined,
      to: optStr(a, "to") ?? undefined,
    }
    const out: Record<string, string> = {}
    totals(out, await profitAndLossTotals(ctx.tx, f))
    flatten(out, (await profitAndLoss(ctx.tx, f)) as unknown as Row[], (r) =>
      semantic(r.account_code),
    )
    return { value: withHash(out) }
  },
  "report.income_statement_comparison": async (ctx, a) => {
    const out: Record<string, string> = {}
    const r = await profitAndLossComparison(ctx.tx, {
      from: str(a, "from"),
      to: str(a, "to"),
      compareTo: str(a, "compare_to", "previous_period") as
        "previous_period" | "previous_year",
    })
    const walk = (o: unknown, prefix: string) => {
      if (o && typeof o === "object" && !Array.isArray(o)) {
        for (const [k, v] of Object.entries(o as Row))
          walk(v, prefix ? `${prefix}.${k}` : k)
      } else if (o !== null && o !== undefined) out[prefix] = String(o)
    }
    walk(r, "")
    return { value: withHash(out) }
  },
  "report.ar_aging": async (ctx, a) => {
    const rows = await arAging(ctx.tx, {
      asOf: optStr(a, "as_of") ?? undefined,
    })
    const out: Record<string, string> = {}
    flatten(out, rows as unknown as Row[], (r) =>
      customerNumber(ctx, r.customer_id),
    )
    out.total = await sumInSql(
      ctx.tx,
      rows.map((r) => r.total),
    )
    return { value: withHash(out) }
  },
  "report.tax_liability": async (ctx, a) => {
    const rows = await taxLiabilitySummary(ctx.tx, {
      from: optStr(a, "from") ?? undefined,
      to: optStr(a, "to") ?? undefined,
    })
    const out: Record<string, string> = {}
    flatten(out, rows as unknown as Row[], (r) =>
      typeof r.code === "string" ? r.code : "none",
    )
    out.net_liability = await sumInSql(
      ctx.tx,
      rows.map((r) => r.net_liability),
    )
    return { value: withHash(out) }
  },
  "report.customer_statement": async (ctx) => {
    const rows = await customerBalances(ctx.tx)
    const out: Record<string, string> = {}
    flatten(out, rows as unknown as Row[], (r) =>
      customerNumber(ctx, r.customer_id),
    )
    return { value: withHash(out) }
  },
  "report.cash_flow": async (ctx, a) => {
    const out: Record<string, string> = {}
    totals(
      out,
      await cashFlowTotals(ctx.tx, {
        from: optStr(a, "from") ?? undefined,
        to: optStr(a, "to") ?? undefined,
      }),
    )
    return { value: withHash(out) }
  },
  "report.control_tie_out": async (ctx) => {
    const rows = await controlAccountTieOut(ctx.tx)
    const out: Record<string, string> = {}
    flatten(out, rows as unknown as Row[], (r) => semantic(r.account_code))
    out.all_tie_out = String(rows.every((r) => r.ties_out))
    return { value: withHash(out) }
  },
  /** Spec RPT-022: every ledger line on one account, summed through the drill-down read, not SQL. */
  "report.drill_down": async (ctx, a) => {
    const code = ACCOUNT_CODES[str(a, "account")]
    const entries = await ledger(ctx.tx, {
      from: optStr(a, "from") ?? undefined,
      to: optStr(a, "to") ?? undefined,
      limit: 1000,
    })
    const debits: string[] = []
    const credits: string[] = []
    for (const e of entries) {
      for (const l of await ledgerLines(ctx.tx, e.id)) {
        if (l.account_code !== code) continue
        debits.push(l.debit_amount ?? "0")
        credits.push(l.credit_amount ?? "0")
      }
    }
    return {
      value: {
        debits: await sumInSql(ctx.tx, debits),
        credits: await sumInSql(ctx.tx, credits),
        lines: String(debits.length),
      },
    }
  },
}

/** A thrown error, named the way a fixture's `refusal` names it. */
export function refusalCode(e: unknown): string {
  if (e instanceof AccountingRefused) return e.reason
  const pg = e as { code?: string }
  if (typeof pg?.code === "string" && /^[0-9A-Z]{5}$/.test(pg.code))
    return `pg:${pg.code}`
  const msg = (e as Error)?.message ?? String(e)
  return msg.startsWith("acs:") ? msg : `error:${msg}`
}
