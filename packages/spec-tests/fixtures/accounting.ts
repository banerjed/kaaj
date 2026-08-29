import type {
  BankFeedTransaction,
  FxSettlement,
  InvoiceSourceDocument,
  JournalEntry,
  TaxLine,
} from "../src/accounting.js"

export const balancedInvoice = {
  id: "INV-EUR-001",
  subtotal: 12000,
  discount: 500,
  tax: 1150,
  total: 12650,
  currency: "USD",
} satisfies InvoiceSourceDocument

export const balancedInvoiceJournal = {
  id: "JE-INV-EUR-001",
  sourceRequirement: "INV-ACC-001,INV-ACC-003",
  sourceDocumentId: "INV-EUR-001",
  postingDate: "2026-03-31",
  periodStatus: "open",
  status: "posted",
  auditEvents: ["accounting.journal_entry.posted"],
  lines: [
    { account: "Accounts Receivable", debit: 12650, currency: "USD" },
    { account: "Service Revenue", credit: 11500, currency: "USD" },
    { account: "Sales Tax Payable", credit: 1150, currency: "USD" },
  ],
} satisfies JournalEntry

export const unbalancedPayrollJournal = {
  id: "JE-PAYROLL-BAD-001",
  sourceRequirement: "INV-ACC-001",
  sourceDocumentId: "PAYRUN-US-001",
  postingDate: "2026-03-31",
  periodStatus: "open",
  status: "posted",
  auditEvents: ["accounting.journal_entry.posted"],
  lines: [
    { account: "Payroll Expense", debit: 10000, currency: "USD" },
    { account: "Cash", credit: 7600, currency: "USD" },
    { account: "Payroll Tax Payable", credit: 2100, currency: "USD" },
  ],
} satisfies JournalEntry

export const foreignCurrencySettlement = {
  invoiceAmount: 10000,
  invoiceCurrency: "EUR",
  baseCurrency: "USD",
  invoiceRate: 1.1,
  paymentRate: 1.08,
  expectedRealizedGainLoss: -200,
} satisfies FxSettlement

export const replayedBankFeed = [
  {
    providerTransactionId: "bank-txn-001",
    accountId: "BANK-OPERATING",
    postedAt: "2026-03-20",
    amount: 12650,
  },
  {
    providerTransactionId: "bank-txn-001",
    accountId: "BANK-OPERATING",
    postedAt: "2026-03-20",
    amount: 12650,
  },
  {
    providerTransactionId: "bank-txn-002",
    accountId: "BANK-OPERATING",
    postedAt: "2026-03-21",
    amount: -5000,
  },
] satisfies BankFeedTransaction[]

export const vatTaxLines = [
  {
    jurisdiction: "GB-VAT",
    period: "2026-Q1",
    sourceId: "INV-001",
    outputTax: 2400,
  },
  {
    jurisdiction: "GB-VAT",
    period: "2026-Q1",
    sourceId: "BILL-001",
    inputTax: 650,
  },
  {
    jurisdiction: "GB-VAT",
    period: "2026-Q1",
    sourceId: "CREDIT-001",
    outputTax: -200,
  },
] satisfies TaxLine[]
