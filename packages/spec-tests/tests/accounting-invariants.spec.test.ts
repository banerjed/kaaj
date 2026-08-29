import { describe, expect, it } from "vitest"
import {
  calculateRealizedFxGainLoss,
  canMutateAccountingPeriod,
  dedupeBankFeedTransactions,
  summarizeTaxLines,
  validateFxSettlement,
  validateInvoiceLedgerReconciliation,
  validateJournalEntry,
} from "../src/accounting.js"
import {
  balancedInvoice,
  balancedInvoiceJournal,
  foreignCurrencySettlement,
  replayedBankFeed,
  unbalancedPayrollJournal,
  vatTaxLines,
} from "../fixtures/accounting.js"

describe("INV-ACC-001 journal entries balance", () => {
  it("accepts a posted invoice journal whose debits and credits balance", () => {
    expect(validateJournalEntry(balancedInvoiceJournal)).toEqual([])
  })

  it("rejects a posted payroll journal whose credits do not equal debits", () => {
    expect(validateJournalEntry(unbalancedPayrollJournal)).toContain(
      "posted journal entry debits and credits must balance",
    )
  })

  it("rejects negative debit or credit amounts", () => {
    expect(
      validateJournalEntry({
        ...balancedInvoiceJournal,
        lines: [{ account: "Cash", debit: -100, currency: "USD" }],
      }),
    ).toEqual(
      expect.arrayContaining([
        "posted journal entry debits and credits must balance",
        "journal lines must not use negative debit or credit amounts",
      ]),
    )
  })
})

describe("INV-ACC-002 closed periods cannot be mutated", () => {
  it("allows ordinary writes in an open accounting period", () => {
    expect(
      canMutateAccountingPeriod({
        periodStatus: "open",
        method: "ordinary-write",
        actorPermissions: [],
        auditEvents: [],
      }),
    ).toBe(true)
  })

  it("blocks ordinary writes in a closed accounting period", () => {
    expect(
      canMutateAccountingPeriod({
        periodStatus: "closed",
        method: "ordinary-write",
        actorPermissions: ["accounting:write"],
        auditEvents: [],
      }),
    ).toBe(false)
  })

  it("requires permission, reason, and audit before reopening a closed period", () => {
    expect(
      canMutateAccountingPeriod({
        periodStatus: "closed",
        method: "reopen-period",
        actorPermissions: ["accounting:reopen_period"],
        reason: "Controller approved bank feed correction",
        auditEvents: [
          "accounting.closed_period.override_requested",
          "accounting.period.reopened",
        ],
      }),
    ).toBe(true)
  })
})

describe("INV-ACC-003 source documents reconcile to ledger", () => {
  it("reconciles invoice subtotal, discount, tax, total, AR, revenue, and tax payable", () => {
    expect(
      validateInvoiceLedgerReconciliation(
        balancedInvoice,
        balancedInvoiceJournal,
      ),
    ).toEqual([])
  })

  it("detects invoice tax that does not tie to the tax payable ledger line", () => {
    expect(
      validateInvoiceLedgerReconciliation(
        { ...balancedInvoice, tax: 1200, total: 12700 },
        balancedInvoiceJournal,
      ),
    ).toEqual(
      expect.arrayContaining([
        "accounts receivable debit must equal invoice total",
        "tax payable credit must equal invoice tax",
      ]),
    )
  })
})

describe("INV-ACC-004 multi-currency is explicit", () => {
  it("calculates realized FX gain or loss from invoice and settlement rates", () => {
    expect(calculateRealizedFxGainLoss(foreignCurrencySettlement)).toBe(-200)
    expect(validateFxSettlement(foreignCurrencySettlement)).toEqual([])
  })

  it("rejects missing foreign-currency distinction and invalid exchange rates", () => {
    expect(
      validateFxSettlement({
        ...foreignCurrencySettlement,
        invoiceCurrency: "USD",
        invoiceRate: 0,
      }),
    ).toEqual(
      expect.arrayContaining([
        "fx settlement must use a foreign invoice currency",
        "fx settlement must store positive exchange rates",
      ]),
    )
  })
})

describe("INV-ACC-005 bank reconciliation is idempotent", () => {
  it("dedupes provider replay without dropping distinct transactions", () => {
    const deduped = dedupeBankFeedTransactions(replayedBankFeed)

    expect(deduped).toHaveLength(2)
    expect(
      deduped.map((transaction) => transaction.providerTransactionId),
    ).toEqual(["bank-txn-001", "bank-txn-002"])
  })
})

describe("INV-ACC-006 tax reports reconcile to source tax lines", () => {
  it("summarizes VAT liability as output tax minus input tax by jurisdiction and period", () => {
    expect(summarizeTaxLines(vatTaxLines)).toEqual({
      "GB-VAT:2026-Q1": 1550,
    })
  })
})
