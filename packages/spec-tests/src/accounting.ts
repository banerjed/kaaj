import {
  roundCents,
  sumBaseCredits,
  sumBaseDebits,
  sumCredits,
  sumDebits,
  withinTolerance,
  type LedgerAmount,
} from "./money.js"

export interface JournalLine extends LedgerAmount {
  account: string
  memo?: string
}

export interface JournalEntry {
  id: string
  sourceRequirement: string
  sourceDocumentId: string
  postingDate: string
  periodStatus: "open" | "closed"
  status: "draft" | "posted"
  lines: JournalLine[]
  auditEvents: string[]
}

export interface AccountingMutationAttempt {
  periodStatus: "open" | "closed"
  method: "ordinary-write" | "adjustment-period" | "reopen-period"
  actorPermissions: string[]
  reason?: string
  auditEvents: string[]
}

export interface InvoiceSourceDocument {
  id: string
  subtotal: number
  discount: number
  tax: number
  total: number
  currency: string
}

export interface FxSettlement {
  invoiceAmount: number
  invoiceCurrency: string
  baseCurrency: string
  invoiceRate: number
  paymentRate: number
  expectedRealizedGainLoss: number
}

export interface BankFeedTransaction {
  providerTransactionId: string
  accountId: string
  postedAt: string
  amount: number
}

export interface TaxLine {
  jurisdiction: string
  period: string
  sourceId: string
  outputTax?: number
  inputTax?: number
}

export function validateJournalEntry(entry: JournalEntry): string[] {
  const failures: string[] = []

  if (entry.status === "posted") {
    if (!withinTolerance(sumDebits(entry.lines), sumCredits(entry.lines))) {
      failures.push("posted journal entry debits and credits must balance")
    }

    if (
      !withinTolerance(sumBaseDebits(entry.lines), sumBaseCredits(entry.lines))
    ) {
      failures.push(
        "posted journal entry base debits and base credits must balance",
      )
    }
  }

  if (
    entry.lines.some((line) => (line.debit ?? 0) < 0 || (line.credit ?? 0) < 0)
  ) {
    failures.push("journal lines must not use negative debit or credit amounts")
  }

  if (!entry.auditEvents.includes("accounting.journal_entry.posted")) {
    failures.push("posted journal entry must include posting audit event")
  }

  return failures
}

export function canMutateAccountingPeriod(
  attempt: AccountingMutationAttempt,
): boolean {
  if (attempt.periodStatus === "open") {
    return true
  }

  if (
    attempt.method === "adjustment-period" &&
    attempt.actorPermissions.includes("accounting:adjust_closed_period") &&
    hasReasonAndAudit(attempt)
  ) {
    return true
  }

  return (
    attempt.method === "reopen-period" &&
    attempt.actorPermissions.includes("accounting:reopen_period") &&
    hasReasonAndAudit(attempt) &&
    attempt.auditEvents.includes("accounting.period.reopened")
  )
}

export function validateInvoiceLedgerReconciliation(
  invoice: InvoiceSourceDocument,
  entry: JournalEntry,
): string[] {
  const failures = validateJournalEntry(entry)
  const receivable = amountForAccount(
    entry.lines,
    "Accounts Receivable",
    "debit",
  )
  const revenue = amountForAccount(entry.lines, "Service Revenue", "credit")
  const tax = amountForAccount(entry.lines, "Sales Tax Payable", "credit")

  if (
    !withinTolerance(
      invoice.total,
      invoice.subtotal - invoice.discount + invoice.tax,
    )
  ) {
    failures.push("invoice total must equal subtotal minus discount plus tax")
  }

  if (!withinTolerance(receivable, invoice.total)) {
    failures.push("accounts receivable debit must equal invoice total")
  }

  if (!withinTolerance(revenue, invoice.subtotal - invoice.discount)) {
    failures.push("revenue credit must equal net taxable sales")
  }

  if (!withinTolerance(tax, invoice.tax)) {
    failures.push("tax payable credit must equal invoice tax")
  }

  return failures
}

export function calculateRealizedFxGainLoss(settlement: FxSettlement): number {
  return roundCents(
    settlement.invoiceAmount * settlement.paymentRate -
      settlement.invoiceAmount * settlement.invoiceRate,
  )
}

export function validateFxSettlement(settlement: FxSettlement): string[] {
  const failures: string[] = []

  if (settlement.invoiceCurrency === settlement.baseCurrency) {
    failures.push("fx settlement must use a foreign invoice currency")
  }

  if (settlement.invoiceRate <= 0 || settlement.paymentRate <= 0) {
    failures.push("fx settlement must store positive exchange rates")
  }

  if (
    !withinTolerance(
      calculateRealizedFxGainLoss(settlement),
      settlement.expectedRealizedGainLoss,
    )
  ) {
    failures.push("realized fx gain/loss must equal settlement rate movement")
  }

  return failures
}

export function dedupeBankFeedTransactions(
  transactions: BankFeedTransaction[],
): BankFeedTransaction[] {
  const seen = new Set<string>()

  return transactions.filter((transaction) => {
    const key = [
      transaction.providerTransactionId,
      transaction.accountId,
      transaction.postedAt,
      transaction.amount.toFixed(2),
    ].join("|")

    if (seen.has(key)) {
      return false
    }

    seen.add(key)
    return true
  })
}

export function summarizeTaxLines(lines: TaxLine[]): Record<string, number> {
  return lines.reduce<Record<string, number>>((summary, line) => {
    const key = `${line.jurisdiction}:${line.period}`
    summary[key] = roundCents(
      (summary[key] ?? 0) + (line.outputTax ?? 0) - (line.inputTax ?? 0),
    )
    return summary
  }, {})
}

function hasReasonAndAudit(attempt: AccountingMutationAttempt): boolean {
  return (
    attempt.reason !== undefined &&
    attempt.reason.trim().length > 0 &&
    attempt.auditEvents.includes("accounting.closed_period.override_requested")
  )
}

function amountForAccount(
  lines: JournalLine[],
  account: string,
  side: "debit" | "credit",
): number {
  return roundCents(
    lines
      .filter((line) => line.account === account)
      .reduce((total, line) => total + (line[side] ?? 0), 0),
  )
}
