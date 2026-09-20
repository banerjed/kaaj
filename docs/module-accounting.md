# Module Specification: Accounting (Multi-Tenant & i18n)

**Version:** 2.28
**Last Updated:** September 14, 2026
**Status:** Draft 
**Parent Documents:**
- [Product Specification](./product-specification.md)
- [Technical Architecture](./architecture-technical.md)

---

## Table of Contents

1. [Module Overview](#module-overview)
2. [Multi-Tenant & i18n Considerations](#multi-tenant--i18n-considerations)
3. [User Stories](#user-stories)
4. [Functional Requirements](#functional-requirements)
5. [Data Model](#data-model)
6. [API Specifications](#api-specifications)
7. [User Interface Specifications](#user-interface-specifications)
8. [Business Logic & Rules](#business-logic--rules)
9. [Validation Rules](#validation-rules)
10. [Security Considerations](#security-considerations)
11. [Integration Points](#integration-points)
12. [Reporting Requirements](#reporting-requirements)
13. [Testing Requirements](#testing-requirements)
14. [Implementation Roadmap — Remaining Work](#implementation-roadmap--remaining-work)

---

## Module Overview

### Purpose
The Accounting module provides comprehensive financial management capabilities for small to medium-sized businesses. Based on leading cloud accounting software like Xero, it manages the complete financial lifecycle including invoicing, expense tracking, bill payment, bank reconciliation, and financial reporting with full multi-currency and internationalization support.

### Scope
This module handles:
- **Invoicing & Billing**: Professional branded invoices, automated reminders, online payments
- **Expense Management**: Receipt capture, categorization, employee reimbursements
- **Accounts Receivable (AR)**: Customer management, payment tracking, aging reports
- **Accounts Payable (AP)**: Vendor management, bill entry, payment scheduling
- **Bank Reconciliation**: Automated transaction matching, bank feeds integration
- **General Ledger**: Chart of accounts, journal entries, multi-currency transactions
- **Financial Reporting**: P&L, Balance Sheet, Cash Flow, customizable reports
- **Multi-Currency**: 160+ currencies with automatic exchange rate updates
- **Tax Management**: Sales tax, VAT, GST calculations and reporting

### Module Dependencies
- **Consumes**:
  - Firm Profile Module (locations, departments, currencies)
  - HR Module (employee data for expense reimbursements)
  - Tenant Context Service
  - i18n Service
  - Payment Gateway Integration (Stripe, PayPal, GoCardless)
- **Consumed by**:
  - Expense Management Module
  - Payroll Module
  - Business Intelligence/Reporting

### Key Benefits
1. **Real-Time Financial Visibility**: Up-to-date financial data accessible anywhere
2. **Automated Workflows**: Reduce manual data entry with automation
3. **Multi-Currency Support**: Handle international transactions seamlessly
4. **Compliance Ready**: Built-in tax calculations and audit trails
5. **Cash Flow Management**: Track invoices, bills, and project cash flow
6. **Collaborative**: Share access with accountants and advisors

---

## Multi-Tenant & i18n Considerations

### Multi-Tenant Architecture

**Tenant Scoping**:
- All financial data strictly isolated per tenant
- Complete separation of chart of accounts across tenants
- No cross-tenant financial data visible
- Tenant-specific currency and tax configurations

**Tenant Context**:
```typescript
interface AccountingTenantContext {
  tenantId: string;
  baseCurrency: string;           // Tenant's primary currency (USD, EUR, etc.)
  enabledCurrencies: string[];    // Additional currencies enabled
  fiscalYearStart: string;        // MM-DD format (e.g., "01-01", "04-01")
  taxSystem: string;              // "sales_tax", "vat", "gst", "none"
  accountingMethod: string;       // "accrual" or "cash"
  locale: string;                 // For number/date formatting
  timezone: string;               // For date calculations
}
```

### Internationalization Support

**Multi-Currency Operations**:
- Support 5 currencies (USD, EUR, CAD, GBP, INR)
- Automatic daily exchange rate updates
- Base currency for reporting
- Foreign currency bank accounts
- Multi-currency invoicing and bill payment
- Realized/unrealized gains and losses tracking

**Localized Financial Reporting**:
- Number formatting per locale (1,234.56 vs 1.234,56)
- Currency symbol placement
- Date format preferences
- Localized report templates

**Tax Localization**:
- US: Sales tax by state/locality
- EU: VAT with reverse charge
- Canada: GST/HST/PST
- UK: VAT with Making Tax Digital (MTD) support

**Multilingual Support**:
```json
{
  "invoice_title_i18n": {
    "en-US": "Invoice",
    "es-ES": "Factura",
    "fr-FR": "Facture",
    "de-DE": "Rechnung"
  },
  "account_name_i18n": {
    "en-US": "Accounts Receivable",
    "es-ES": "Cuentas por Cobrar",
    "fr-FR": "Comptes Clients"
  }
}
```

**Timezone Handling**:
- Invoice dates in tenant timezone
- Payment due dates timezone-aware
- Report date ranges respect fiscal calendar
- Automated reminders sent in recipient timezone

---

## User Stories

**Status tags below were added 2026-09-11** by reading the actual schema,
repository code, routes, and tests — not inferred from this document. Full
leaf-level test evidence (file:line citations) lives in
[19-accounting-test-plan.md](19-accounting-test-plan.md); this section gives
the same verdicts at user-story grain.

### Invoice Management

**US-ACC-001**: As a Business Owner, I want to create professional invoices with my company branding, so that I can bill customers quickly and maintain brand consistency.
*Status: **PARTIAL** (updated 2026-09-11, was MISSING). `/accounting/invoices/new` now creates a real draft invoice with line items — `createInvoice()` in `accounting.repo.ts`, tested in `receivables.writes.test.ts`. Still **MISSING**: company branding, and any PDF/template output (see US-ACC-008, still MISSING). "Quickly" is a fair description of the create form itself; the promised output document does not exist yet.*

**US-ACC-002**: As an Accountant, I want to send invoices with online payment links (Stripe, PayPal), so that customers can pay immediately and improve cash flow.
*Status: **MISSING**. `invoices.payment_url`/`payment_gateway`/`payment_gateway_id` are schema columns `issueInvoice` never writes to. Stripe integration in this codebase is wired only to Kaaj's own SaaS subscription billing (`(admin)/account/billing`), not customer invoicing.*

**US-ACC-003**: As a Sales Manager, I want to set up automated payment reminders for overdue invoices, so that I reduce manual follow-up work.
*Status: **PARTIAL** (2026-09-20). The story is two things — "set up" (a configured cadence) and "automated" (a schedule) — and this ships neither: `/accounting/invoices` (filtered to overdue) gets checkboxes and a "Send reminders" action, `invoicesForReminder()`/`recordRemindersSent()` in `accounting.repo.ts`. No scheduler exists in this codebase (same precedent as the Tier 7 exchange-rate refresh and the reconciliation rules' "apply now" action), so it is select-and-send on demand, not a configured reminder policy running on its own. What would make it DONE: a reminder cadence per customer/invoice-age and a schedule to run it. Best-effort per invoice rather than all-or-nothing like a batch payment — a missing customer email or an invoice already reminded today (`invoices.last_reminded_at`) is skipped and reported, not a reason to block the reminders that can go out; a genuinely unknown/ineligible invoice id still refuses the whole submission (`no_such_invoice`/`duplicate_invoice`), since that can only mean a stale or tampered selection. `last_reminded_at` is set only for invoices `sendTemplatedEmail()` confirms were actually dispatched — sent-then-recorded, so a rollback after some sends go out risks a duplicate reminder on the next run rather than a suppressed one, a deliberate tradeoff (an atomic version isn't possible once an external send is involved). `mailer.ts`'s `sendTemplatedEmail()` now returns a real `{sent, reason}` result instead of `void`, so a caller that needs to know whether an email actually went out can tell "Resend rejected it" from "no API key in this environment" — the latter is what this codebase's own dev/CI environment reports, since no `PRIVATE_RESEND_API_KEY` is configured there; verified live via that exact honest "not configured" report, and via the `already reminded today` skip. This is the first tenant-to-customer email in the accounting module (no PDF attachment — that's US-ACC-008, separately MISSING); it goes out from the platform's own shared address with the firm's name as the display name, since no per-tenant verified sending domain exists. Tested in `receivables.writes.test.ts` ("payment reminders (US-ACC-003)") against the real database, `mailer.test.ts` for the template/send-result behavior (real sends aren't exercised in tests or in this environment), plus a form-errors e2e case.*

**US-ACC-004**: As a Business Owner, I want to create recurring invoices for subscription customers, so that billing is automated.
*Status: **MISSING**. `invoices.is_recurring`/`recurring_schedule_id` exist as columns; there is no `recurring_schedules` table and no code anywhere generates a next invoice from a template. See [19-accounting-test-plan.md §11](19-accounting-test-plan.md).*

**US-ACC-005**: As a Freelancer, I want to invoice in multiple currencies, so that I can bill international clients in their local currency.
*Status: **DONE**. `issueInvoice`'s base-currency tie-out for a real GBP fixture invoice is tested in `receivables.writes.test.ts:156`, and a real multi-currency invoice's presence is asserted in `accounting.test.ts:102` ("carries more than one currency, so nothing may assume USD").*

**US-ACC-006**: As an Accountant, I want to track invoice status (draft, sent, viewed, paid, overdue), so that I know which invoices need attention.
*Status: **PARTIAL**. draft → sent (`issueInvoice` sets `status='sent', sent_at=now()`, `accounting.repo.ts:592`) → paid/partial (`recordPayment`, tested) and overdue (computed, tested `accounting.test.ts:132,144,161`) all work. `viewed_at` exists on the schema but nothing ever sets it — there is no customer-facing view to trigger a "viewed" state, so that status never actually occurs.*

**US-ACC-007**: As a Business Owner, I want to add tracking categories to invoices (by region, product, campaign), so that I can analyze revenue by segment.
*Status: **MISSING**. `invoice_lines.tracking_categories` (JSONB) is never read or written anywhere in `accounting.repo.ts`.*

**US-ACC-008**: As a Customer, I want to receive a professional PDF invoice by email, so that I have documentation for my records.
*Status: **MISSING**. `invoices.pdf_url` is an unused column; no PDF-generation or email-sending code exists for invoices anywhere in the codebase.*

### Expense Management

*Status for this entire section: **MISSING**. `expenses` has a fully-designed table — `receipt_url`, `receipt_ocr_data`, `mileage_distance`/`mileage_rate`, `reimbursement_status`, `approved_by`/`approved_at`, `journal_entry_id` — but zero application code references it anywhere (`grep -rln "FROM expenses" apps/web/src/lib/server/` returns nothing: no repo file, no route, no application-level write/read test). Row-level security on it IS tested — `expenses` is the last entry in `row-visibility.test.ts`'s parametrized `ACCOUNTING` table list (`:455-471`), so it gets the same four RLS assertions as every other accounting table (finance_admin sees rows and there ARE rows, a plain employee sees none, another function's admin sees none, an owner sees rows). So the table is schema-complete *and* RLS-tested, but has zero application layer — which is exactly why the gap doesn't show up in `./check`: RLS coverage looks green with nothing behind it to expose. This is a complete, feature-absent module at the app layer; every story below is MISSING for the same reason, not annotated individually.*

**US-ACC-009**: As an Employee, I want to snap a photo of receipts with my mobile phone, so that I can capture expenses on the go. **[MISSING]**

**US-ACC-010**: As an Accountant, I want expenses to be automatically categorized using OCR and AI, so that I reduce manual data entry. **[MISSING]**

**US-ACC-011**: As a Finance Manager, I want to track spending patterns by category and vendor, so that I can identify cost-saving opportunities. **[MISSING]**

**US-ACC-012**: As an Employee, I want to submit expense claims for reimbursement, so that I'm reimbursed for business expenses. **[MISSING]**

**US-ACC-013**: As a Manager, I want to approve or reject expense claims, so that spending is controlled. **[MISSING]**

**US-ACC-014**: As an Accountant, I want expenses to sync automatically to the general ledger, so that financial reports are accurate. **[MISSING]**

### Accounts Receivable (AR)

**US-ACC-015**: As an Accountant, I want to track all customer invoices and payments in one place, so that AR is organized.
*Status: **DONE**. `/accounting/invoices` lists every invoice with status, and `paymentsFor()` returns the payment history per invoice — exercised throughout `accounting.test.ts` and `receivables.writes.test.ts`.*

**US-ACC-016**: As a Finance Manager, I want to see an aging report showing overdue invoices, so that I can follow up on collections.
*Status: **DONE** (2026-09-13). `/accounting/ar-aging` buckets every open invoice into current/1-30/31-60/61-90/90+ by days past due, as of a chosen date. Per-customer rows in the invoice's own currency, no cross-currency total — see `accounting.repo.ts`'s `arAging()` and `accounting.test.ts`'s "AR aging" suite.*

**US-ACC-017**: As a Business Owner, I want to forecast short-term cash flow (30-day projection), so that I can plan for cash needs.
*Status: **MISSING**. No forecasting code exists — this is Gap #1 in `accounting-gap-analysis.md` and remains unbuilt.*

**US-ACC-018**: As an Accountant, I want to apply customer payments to multiple invoices, so that accounts are accurate.
*Status: **DONE** (2026-09-13). `/accounting/receive-payment` allocates one payment across several of a customer's open invoices — `acc.recordLockboxPayment()` posts one journal entry (one Cash debit, one AR credit per invoice) and refuses when the allocations don't sum to the stated total received. See `accounting.repo.ts` and `receivables.writes.test.ts`'s "receiving a lockbox payment across multiple invoices" suite.*

**US-ACC-019**: As a Business Owner, I want to see which customers owe money and how much, so that I can manage credit risk.
*Status: **DONE** (2026-09-13). `/accounting/customer-balances` groups every open invoice by customer, showing invoice count, invoiced/paid/credited/due totals (`total_credited` added 2026-09-13 alongside credit memos, so the four figures reconcile visibly rather than leaving an unexplained gap), and the customer's own credit limit, with the balance flagged when it exceeds that limit. See `acc.customerBalances()` and `accounting.test.ts`'s "customer balances" suite.*

**US-ACC-020**: As an Accountant, I want to write off bad debts when invoices are uncollectible, so that AR reflects reality.
*Status: **DONE** (2026-09-13). `acc.recordWriteOff()` posts Dr Bad Debt Expense (`5500`, added to the fixture chart of accounts) / Cr Accounts Receivable, sharing `invoice_credits` and its reversing-entry mechanism with the credit memo half of this story (§1.1's finding) via a `credit_type` column rather than a parallel table. Sets a new `written_off` status only when the balance reaches exactly zero, and refuses a write-off larger than the invoice's own balance (`over_writeoff`). See `accounting.repo.ts`'s `recordInvoiceCredit()` and `receivables.writes.test.ts`'s "writing off bad debt" suite.*

### Accounts Payable (AP)

**US-ACC-021**: As an Accountant, I want to enter vendor bills by dragging and dropping PDF files, so that bill entry is faster.
*Status: **PARTIAL** (2026-09-12). Manual bill entry now exists — `/accounting/bills/new`, `pay.createBill()` in `payables.repo.ts` — with a real per-line expense-account picker, not just a form that types out what OCR would have filled in. `bills.file_url` remains an unused column; there is still no drag-and-drop/file-upload path, so the "faster" half of this story (skip retyping the PDF) is not addressed.*

**US-ACC-022**: As an Accountant, I want the system to automatically read bill data using OCR, so that I don't have to manually type everything.
*Status: **MISSING**. `bills.ocr_processed`/`ocr_data` are unused columns — confirmed by grep against `payables.repo.ts`.*

**US-ACC-023**: As a Finance Manager, I want to schedule bill payments based on due dates, so that I optimize cash flow and avoid late fees.
*Status: **MISSING**. `bills.payment_scheduled_date` is an unused column; `recordVendorPayment` pays immediately, on demand, for one bill at a time.*

**US-ACC-024**: As an Accountant, I want to track which bills are due soon, so that I can prioritize payments.
*Status: **DONE** (2026-09-13). `/accounting/ap-due-soon` lists approved, unpaid bills due within a chosen window (7/14/30/60 days) of a chosen date — forward-looking, and distinct from `is_overdue`'s present-tense flag. See `payables.repo.ts`'s `apDueSoon()` and `payables.test.ts`'s "AP due soon" suite.*

**US-ACC-025**: As a Finance Manager, I want to pay multiple vendor bills in a single batch, so that I save time.
*Status: **DONE** (2026-09-19). `/accounting/bills` — checkboxes on the list plus a "Pay selected" action, `payBillsInBatch()` in `payables.repo.ts`. Each selected bill is paid in full (a batch run is "clear this stack," not a place to enter partial amounts); one payment/journal entry per vendor, since the schema ties a payment to a single vendor, so a batch spanning vendors becomes several payments automatically. All-or-nothing — every bill validated before any write. Matches `recordLockboxPayment`'s own precedent in excluding settlement FX gain/loss (a batch can span bills at different booking rates even within one vendor). The one user-entered `reference` is copied onto every payment the batch produces, so if a later bank-reconciliation feature matches by reference, N payments sharing one string is ambiguous — reconciliation should match by amount/date/vendor too, not reference alone. Tested in `payables.writes.test.ts` ("batch vendor payment run") against the real database, plus a smoke/form-errors e2e case.*

**US-ACC-026**: As an Accountant, I want to reconcile vendor statements with our records, so that accounts are accurate.
*Status: **MISSING**. Bank-transaction-to-payment matching exists (see US-ACC-028) but that's a different reconciliation (bank feed vs. internal payments) — there's no vendor-statement-specific reconciliation feature.*

### Bank Reconciliation

**US-ACC-027**: As an Accountant, I want to connect my bank accounts via secure feed, so that transactions are imported automatically.
*Status: **MISSING**. `bank_accounts.feed_provider`/`feed_enabled` are unused schema columns — no Plaid/Yodlee or any bank-feed integration exists. Bank transactions in the fixture are seed data, not imported.*

**US-ACC-028**: As an Accountant, I want the system to suggest matches between bank transactions and invoices/bills, so that reconciliation is faster.
*Status: **DONE**. `candidatePaymentsForTransactions` returns same-currency, same-direction, still-unmatched payments for a set of transactions — a real suggestion mechanism, tested in `payables.writes.test.ts:463` ("offers only same-currency, same-direction, still-unmatched payments"). The human still picks the match (`matchBankTransaction`, tested at `:364`, `:380`, `:401`, `:412`, `:423`) — nothing auto-applies a suggestion, which the story doesn't actually require.*

**US-ACC-029**: As an Accountant, I want to create rules for recurring transactions, so that they're categorized automatically.
*Status: **DONE** (2026-09-19). `/accounting/banking/rules` — a rule names an optional bank account, description contains/regex, amount range and direction, and a chart-of-accounts category; the exchange-rate-refresh precedent from Tier 7 applies here too: there is no scheduler in this codebase, so "Apply rules" is a manual-trigger action, run whenever new transactions come in, rather than automatic. `action_type` is fixed to `'categorize'` — the table's other columns (`auto_match`, `create_transaction`, `vendor_id`, `customer_id`) anticipate matching a transaction straight to a payment or vendor/customer, but `bank_transactions` has no `vendor_id`/`customer_id` column to write that onto, so categorizing to a GL account is the only action this schema can actually carry out today. `applyReconciliationRules()` in `payables.repo.ts` is one set-based UPDATE (bank_transactions is SCALE_SENSITIVE), priority-ordered with a fully deterministic tie-break; `times_applied` is recomputed from the real rows each run (L58), not incremented, so it is a current count rather than a lifetime tally and drops if a categorized transaction is later re-matched to a payment. A rule's `description_regex` is validated at creation via `app.is_valid_regex()` (new migration) rather than a JS `RegExp` check, since Postgres's ARE dialect diverges from JS regex and a pattern that passes JS validation can still raise from Postgres — which would otherwise turn every future apply-rules run into a 500. Fixed a pre-existing fixture bug in the same pass: the seeded rule's `description_regex`/`amount_*`/`transaction_type` columns had been filled by the fixture's generic "no empty column" backfill with placeholder text (e.g. `'Transaction Type 1'`) that had never been rendered or evaluated by any code before this feature — now corrected to values consistent with the rule's own story. Tested in `payables.writes.test.ts` ("bank reconciliation rules (US-ACC-029)") against the real database, plus smoke/form-errors e2e cases, and verified live end-to-end (create a rule, apply it, confirm the transaction categorized and the audit trail recorded).*

**US-ACC-030**: As a Finance Manager, I want to see which transactions are unreconciled, so that I know what needs attention.
*Status: **DONE**. `payables.test.ts:143` ("counts what still needs matching") and `:177` ("shows every reconciliation state the screen has to render") — real, tested.*

**US-ACC-031**: As an Accountant, I want to reconcile multiple bank accounts including foreign currency accounts, so that all cash is tracked.
*Status: **PARTIAL**. Multiple bank accounts are supported and tested (`payables.test.ts:97`, "keeps the bank's balance and the feed's balance as separate facts", run across all accounts). Foreign-currency bank account *revaluation* at period-end still does not exist — US-ACC-053's report-only revaluation (2026-09-18, see the Tier 7 entry) deliberately covers invoices/bills only, not bank balances, since a bank account has no stored per-account booking rate to revalue against. See [19-accounting-test-plan.md §3.3](19-accounting-test-plan.md).*

### General Ledger & Chart of Accounts

**US-ACC-032**: As an Accountant, I want to set up a chart of accounts based on industry templates, so that I don't start from scratch.
*Status: **MISSING**. No setup wizard or industry-template feature exists — `chart_of_accounts` has no CRUD route at all (see US-ACC-033).*

**US-ACC-033**: As an Accountant, I want to customize account names and codes to match my business, so that reporting is meaningful.
*Status: **PARTIAL**. `CREATE UNIQUE INDEX idx_chart_of_accounts_code ON chart_of_accounts (tenant_id, account_code)` enforces uniqueness at the DB level, but there is no route or repo function to create, rename, or recode an account at all — the schema supports the story; nothing lets a user act on it.*

**US-ACC-034**: As an Accountant, I want to create manual journal entries for adjustments, so that I can correct errors and make period-end entries.
*Status: **MISSING**. No manual-JE creation path exists anywhere; `postJournal` is only ever called by `issueInvoice`, `recordPayment`, and `approveBill`.*

**US-ACC-035**: As a Controller, I want to lock accounting periods to prevent changes, so that historical data is protected.
*Status: **PARTIAL**. The enforcement half is real and well tested: `postJournal` refuses any new posting into a non-`'open'` period (`period_closed`, tested in `receivables.writes.test.ts:262,271` and `payables.writes.test.ts:175`). But there is no route or action that actually *locks* a period — nothing writes to `accounting_periods.status` anywhere in the app. And per the top-of-document correction in [19-accounting-test-plan.md](19-accounting-test-plan.md), a posted entry inside an already-closed period can still be UPDATEd — RLS has no predicate against it — so "historical data is protected" overstates what's actually enforced.*

**US-ACC-036**: As an Accountant, I want to track multi-currency transactions with automatic exchange rate conversion, so that foreign transactions are recorded correctly.
*Status: **PARTIAL** (2026-09-14). Conversion math at the point of invoice issuance is DONE and precisely tested (US-ACC-005). Rate *lookup/update* is now real for a fixed set of currencies (USD, CAD, GBP, EUR, INR): `/accounting/exchange-rates` pulls each one's rate against USD from Yahoo Finance's public chart endpoint and upserts `exchange_rates` (`fx_rates.ts`, `source = 'yahoo'`). Still not "automatic" in the sense the story implies — there is no scheduler; refresh is a manually-triggered button, and wiring a daily cron/trigger to hit it is an ops step, not built here. `invoices`/`bills` still don't look this table up when a document is created — the rate a document books at is still typed in, or copied, at the point of entry; this closes the "no way to get a current rate at all" gap, not the "the app finds it for you" one.*

**US-ACC-037**: As an Accountant, I want to see a complete audit trail of all financial transactions, so that I can trace any entry.
*Status: **DONE**. `issue`, `recordPayment` (×2), `voidInvoice`, `approve`, `match` are all registered in `audit/register.ts:129-158`, each capturing the actor; the trail itself is append-only and tamper-proof (`audit.test.ts:134,140`).*

### Financial Reporting

*Status for this entire section, as of the 2026-09-11 annotation pass: **MISSING**. No Balance Sheet, P&L, Cash Flow, or Trial Balance report existed anywhere in the codebase — confirmed by searching `apps/web/src` and `packages` for report-related terms and finding only one unrelated HR comment. This was base spec (FR-ACC-007 below), not a roadmap wish — 0% built. Trial balance, Profit & Loss, Balance Sheet, Cash Flow, and Statement of Changes in Equity (all 2026-09-12) have since shipped — see their own stories below and [19-accounting-test-plan.md §1.5/§5](19-accounting-test-plan.md) for the full detail. Every other story below is still MISSING for the reason originally stated here.*

**US-ACC-038**: As a Business Owner, I want to generate a Profit & Loss statement with one click, so that I can see profitability quickly. **[PARTIAL]** (2026-09-12)
*`/accounting/profit-loss` generates the statement live from `journal_entry_lines`, with a `from`/`to` period filter — one click in the sense of "no manual data entry", not literally zero clicks (the route itself is the one click, once navigated to). Missing against the fuller wish: no COGS/gross-margin subtotal, no comparison periods, no export, no department filter. See [19-accounting-test-plan.md §5](19-accounting-test-plan.md).*

**US-ACC-039**: As a CFO, I want to view a Balance Sheet showing assets, liabilities, and equity, so that I understand financial position. **[PARTIAL]** (2026-09-12)
*`/accounting/balance-sheet` generates it live, as of any date, from `journal_entry_lines`. Missing against the fuller wish: no comparison periods, no department filter, no export. See [19-accounting-test-plan.md §5](19-accounting-test-plan.md).*

**US-ACC-040**: As a Finance Manager, I want to run a Cash Flow statement, so that I can see how cash moved during the period. **[PARTIAL]** (2026-09-12)
*`/accounting/cash-flow` generates it live, indirect method, for a `from`/`to` period. Investing and Financing sections are structurally present but always near-empty — this chart of accounts has no fixed-asset/investment/loan account category to draw from, a real schema gap rather than an unfinished computation. See [19-accounting-test-plan.md §5](19-accounting-test-plan.md).*

**US-ACC-041**: As a Business Owner, I want to compare financial reports across periods (month-over-month, year-over-year), so that I can identify trends. **[MISSING]**

**US-ACC-042**: As an Accountant, I want to customize report formats and save templates, so that monthly reporting is consistent. **[MISSING]**

**US-ACC-043**: As a Business Owner, I want to see financial reports in multiple currencies, so that I can understand performance in different markets. **[MISSING]**

**US-ACC-044**: As a Department Manager, I want to filter reports by department or location, so that I can see my area's performance. **[MISSING]**

**US-ACC-045**: As a Business Owner, I want to export reports to Excel or PDF, so that I can share them with stakeholders. **[MISSING]**

### Tax Management

**US-ACC-046**: As an Accountant, I want to configure sales tax rates by jurisdiction, so that invoices calculate tax correctly.
*Status: **PARTIAL** (2026-09-13). A real `tax_rates` table exists, and all five accounting tax FKs (`invoice_lines.tax_rate_id`, `bill_lines.tax_rate_id`, `chart_of_accounts.tax_rate_id`, `journal_entry_lines.tax_rate_id`, `customers.tax_rate_id`) resolve to it — `20260913223213_accounting_tax_rates.sql`. `/accounting/tax-rates` now lets finance create a rate (code, name, type, rate, country/region/jurisdiction, reverse charge, effective date) and deactivate/reactivate one — `accounting.write`-gated and audited. Still missing: editing a rate's other fields once created (a mistyped rate is deactivated and replaced, not corrected in place — the same reasoning a period's close/reopen uses), and invoices/bills still take a manually-typed tax amount rather than computing one from a configured rate.*

**US-ACC-047**: As a UK Accountant, I want to configure VAT rates and handle reverse charge, so that I comply with UK tax law.
*Status: **MISSING**. VAT jurisdiction configuration exists now (US-ACC-046 — `tax_rates.is_reverse_charge` is already a column, just unused by any posting logic). Reverse charge itself is unbuilt and **deliberately deferred** (2026-09-13, user decision — no UK customers yet): it needs the vendor's zero-VAT invoice to still self-assess both an output and input side, and the self-assessed amount excluded from what's actually payable to the vendor, which `recomputeBillTotals`/`approveBill` don't distinguish today.*

**US-ACC-048**: As an Accountant, I want to generate tax reports (sales tax summary, VAT return), so that I can file returns easily.
*Status: **PARTIAL** (2026-09-13). `/accounting/tax-summary` (`acc.taxLiabilitySummary()`) reports output tax collected and input tax paid, grouped by jurisdiction, for an optional `from`/`to` period — read from the real posted GL (`journal_entry_lines` on accounts `"2200"`/`"1200"`), not the invoice/bill subledger. `packages/spec-tests`' `INV-ACC-006` (`summarizeTaxLines`) still tests the correct output-minus-input formula as a pure function against hand-built objects, unconnected to this report; the two aren't meant to converge, since the app version does the arithmetic in SQL over real rows. Gap: still no VAT-return-shaped export (boxes/line format a filing expects), and reverse charge (US-ACC-047) isn't handled — see US-ACC-049's note.*

**US-ACC-049**: As an Accountant, I want to track tax paid on bills (input tax) and tax collected on invoices (output tax), so that I can calculate tax liability.
*Status: **PARTIAL** (2026-09-13). `issueInvoice`/`approveBill` now post ONE GL tax line per `tax_rate_id` rather than a single lump sum — grouped by rate in SQL before posting, so an invoice or bill mixing rates attributes each rate's tax to its own jurisdiction rather than collapsing them together (break/revert-verified: reverting to the lump-sum shape makes the grouping test fail). `tax_rate_id` reaches the GL from a new, optional per-line "Tax rate" `<select>` on the invoice/bill create forms (`invoice_lines.tax_rate_id`/`bill_lines.tax_rate_id`, populated from active `tax_rates`) — a reference only; the tax amount is still typed in directly, not computed from the rate (that remains the same deferred gap 2.24 already documented). `taxLiabilitySummary()` nets output minus input per rate, with an explicit, separately-labelled row for tax posted with no rate attributed (`tax_rate_id IS NULL`) rather than silently folding it into a real jurisdiction. The committed fixture's own posted tax line (`BILL-AWS-2026-01`'s recoverable input tax) is now tagged with its rate via a targeted, amount-preserving `UPDATE` — not a blanket backfill — giving the report one genuine, non-synthetic row; asserted directly in `accounting.writes.test.ts` against the real fixture, not just rollback-posted synthetic data. Known gap, not yet designed around: `postJournal` drops any line that nets to zero, so a reverse-charge rate (output and input cancelling by design) would post no GL line at all and so surface no jurisdiction row in this report — US-ACC-047's remaining work.*

**US-ACC-050**: As a Business Owner, I want to track tax-exempt customers, so that their invoices don't include tax.
*Status: **PARTIAL** (2026-09-13). `customers.tax_exempt_until` (nullable `DATE`, `20260913230000_customer_tax_exempt_until.sql`) lets an exemption expire; `NULL` means indefinite. Enforced in two places, deliberately: `createInvoice` refuses a taxed line for a customer exempt as of the invoice's own date (not "today"), and `issueInvoice` — the step that actually posts `tax_total` to the ledger — repeats the same check against the invoice's stored date, because a draft can be created before an exemption is set, edited, or issued after one has expired, none of which `createInvoice`'s own check would see. Both refusals go through `AccountingRefused("customer_tax_exempt")`. Gap: no UI exists to set `is_tax_exempt`/`tax_exempt_until` — same posture as `chart_of_accounts.tax_rate_id` (US-ACC-046) — today it is fixture- or direct-database-only, and the invoice form's customer picker does not surface a customer's exemption status, so a user discovers it via the refusal rather than before typing the line.*

### Multi-Currency Operations

**US-ACC-051**: As a Business Owner with international operations, I want to invoice customers in their local currency, so that they can pay easily.
*Status: **DONE**. Same evidence as US-ACC-005.*

**US-ACC-052**: As an Accountant, I want exchange rates to update automatically, so that valuations are current.
*Status: **PARTIAL** (2026-09-14). Same increment as US-ACC-036: `/accounting/exchange-rates` refreshes USD/CAD/GBP/EUR/INR from Yahoo Finance, `accounting.write`-gated and audited. "Update automatically" is the remaining gap — refresh is manual-trigger only, no scheduler exists in this repo. Yahoo's endpoint is unofficial and unversioned (no API key, no SLA); a per-currency failure is isolated and surfaced rather than failing the whole refresh, which is what a shape change on Yahoo's side would trip. This table now feeds both US-ACC-053 (revaluation) and US-ACC-054 (settlement), as of 2026-09-18.*

**US-ACC-053**: As a CFO, I want to see unrealized gains/losses on foreign currency balances, so that I understand FX exposure.
*Status: **PARTIAL** (2026-09-18) — the story as literally written ("I want to see") is done: `/accounting/fx-revaluation` reports unrealized gain/loss on every open foreign-currency invoice/bill as of a chosen date. Report-only by design, not a stopping point chosen for convenience — see the Tier 7 entry in this document for why posting a non-reversing adjustment would double-count against US-ACC-054's own settlement recognition. Bank account balances are excluded from the report (no per-account booking rate exists to revalue against); posting/reversal is unbuilt.*

**US-ACC-054**: As an Accountant, I want to record realized gains/losses when foreign invoices are paid, so that P&L reflects actual FX impact.
*Status: **DONE** (2026-09-18). `recordPayment`/`recordVendorPayment` look up the settlement-date rate and realize the gain/loss against the invoice's/bill's booking rate, writing `payment_allocations.fx_gain_loss`. See the Tier 7 entry in this document for the shape and its two documented simplifications. Tested in `receivables.writes.test.ts`/`payables.writes.test.ts` against the real database (gain, loss, and both fallbacks), and `INV-ACC-004` in `packages/spec-tests` remains the reference formula these were built to match.*

**US-ACC-055**: As a Business Owner, I want to run reports in my base currency with automatic conversion, so that I can consolidate multi-currency operations.
*Status: **MISSING**. Every invoice/bill carries its own `base_total` (converted at its own rate, correctly — see US-ACC-005), but there is no consolidated *report* of any kind to run in base currency (see Financial Reporting section above).*

---

## Functional Requirements

### FR-ACC-001: Invoice Management

**Description**: System shall provide comprehensive invoicing capabilities with multi-currency support and online payment integration.

**Features**:
1. Create, edit, delete invoices (draft, final)
2. Professional invoice templates with company branding
3. Line items with descriptions, quantities, unit prices, taxes
4. Support for multiple currencies per invoice
5. Online payment links (Stripe, PayPal, GoCardless integration)
6. Invoice status tracking (draft, sent, viewed, partial, paid, overdue, void)
7. Automated payment reminders (configurable schedule)
8. Recurring invoices with flexible schedules
9. Invoice attachments (PDFs, supporting documents)
10. Customer portal for invoice viewing and payment
11. Partial payments and payment allocation
12. Credit notes and refunds
13. Tracking categories (region, product, campaign, salesperson)
14. Keyboard shortcuts for faster invoice creation
15. Bulk invoice actions (send, void, apply discounts)

**Acceptance Criteria**:
- Invoice numbers auto-generated with customizable format (prefix, padding)
- Invoice dates timezone-aware based on tenant settings
- Payment terms configurable (Net 15, Net 30, Due on Receipt, custom)
- Tax calculations based on customer location and tax rules
- Currency exchange rates locked at invoice creation date
- Automated reminders sent at tenant-specified intervals (3 days before due, on due date, 7 days after)
- Online payments update invoice status automatically
- Payment gateway fees tracked separately
- Invoice PDF generated with tenant branding (logo, colors, footer)
- Multilingual invoice templates available
- Cannot edit finalized invoices (must create credit note)
- Complete audit trail of invoice lifecycle

**Multi-Currency Example**:
```json
{
  "invoice_id": "INV-2025-001",
  "tenant_id": "uuid",
  "customer_id": "uuid",
  "invoice_date": "2025-12-03",
  "due_date": "2025-12-18",
  "currency": "EUR",
  "exchange_rate": 1.09,
  "base_currency": "USD",
  "line_items": [
    {
      "description": "Professional Services - Q4 2025",
      "quantity": 80,
      "unit_price": 150.00,
      "amount": 12000.00,
      "tax_rate": 0.20,
      "tax_amount": 2400.00,
      "tracking_categories": {
        "region": "Europe",
        "project": "Migration"
      }
    }
  ],
  "subtotal": 12000.00,
  "tax_total": 2400.00,
  "total": 14400.00,
  "total_in_base_currency": 15696.00,
  "status": "sent",
  "payment_url": "https://pay.platform.com/inv/uuid"
}
```

### FR-ACC-002: Expense Management

**Description**: System shall provide expense capture, categorization, and tracking with receipt management and reimbursement workflows.

**Features**:
1. Mobile receipt capture with camera
2. OCR for automatic data extraction (vendor, date, amount, category)
3. AI-powered expense categorization
4. Manual expense entry
5. Expense categories aligned with chart of accounts
6. Multi-currency expense support
7. Employee expense claims and reimbursement
8. Approval workflows (manager, finance)
9. Receipt attachment to expense records
10. Mileage tracking with rate calculation
11. Per diem expense tracking
12. Credit card transaction import
13. Expense reporting (by category, vendor, employee, department)
14. Sync expenses to general ledger
15. Expense policy compliance checking

**Acceptance Criteria**:
- OCR accuracy >90% for receipt data extraction
- Support image formats: JPG, PNG, PDF
- Maximum file size: 10MB per receipt
- Expense categories must exist in chart of accounts
- Foreign currency expenses converted at date of expense
- Reimbursement requests generate AP bills
- Approved expenses post to GL automatically
- Duplicate receipt detection (by amount, date, vendor)
- Expense reports exportable to PDF/Excel
- Mobile app for on-the-go expense capture
- Expense claims require manager approval
- Audit trail of all expense modifications

**Expense Flow**:
```
Employee captures receipt → OCR extracts data →
Employee reviews/edits → Submit for approval →
Manager approves → Finance processes →
AP bill created → Payment scheduled →
GL entries posted
```

### FR-ACC-003: Accounts Receivable (AR)

**Description**: System shall manage customer invoices, payments, and collections with aging analysis.

**Features**:
1. Customer master data (contact info, payment terms, credit limit)
2. Invoice tracking by customer
3. Payment recording (full, partial, overpayment)
4. Payment allocation to multiple invoices
5. AR aging report (30/60/90/90+ days)
6. Customer statements generation
7. Collection reminders automation
8. Credit notes and refunds
9. Write-offs for bad debts
10. Customer payment history
11. Short-term cash flow forecasting (30-day)
12. Days Sales Outstanding (DSO) metrics
13. Customer credit management
14. Early payment discounts
15. Multi-currency customer balances

**Acceptance Criteria**:
- Customer records unique per tenant
- Payment terms default from customer record
- Payments must reference invoice(s)
- Overpayments tracked as customer credits
- Aging calculated from invoice due date
- Customer statements show all open invoices
- Write-offs require authorization (role permission)
- Credit limits enforced at invoice creation
- DSO calculated: (AR / Revenue) × Days in Period
- Cash flow forecast based on invoice due dates
- Multi-currency customers show balance per currency
- Customer portal shows real-time balance

**AR Dashboard**:
- Total outstanding AR (base currency)
- Overdue amount and percentage
- AR aging breakdown (chart)
- Top 10 customers by balance
- This month's collections vs. target
- Average days to payment

### FR-ACC-004: Accounts Payable (AP)

**Description**: System shall manage vendor bills, payment scheduling, and disbursements with automated data entry.

**Features**:
1. Vendor master data (contact info, payment terms, tax ID)
2. Bill entry with drag-and-drop file upload
3. OCR for automatic bill data extraction
4. Multiple bill attachments (originals, supporting docs)
5. Bill approval workflows
6. Payment scheduling by due date
7. Batch payment processing
8. Payment methods (check, ACH, wire, credit card)
9. AP aging report (30/60/90/90+ days)
10. Vendor statements reconciliation
11. 1099 vendor tracking and reporting (US)
12. Three-way matching (PO, receipt, invoice) - future
13. Early payment discount capture
14. Vendor payment history
15. Multi-currency vendor balances

**Acceptance Criteria**:
- Vendor records unique per tenant
- OCR extracts: vendor name, bill date, due date, amount, line items
- Bill approval routes based on amount thresholds
- Payment schedule optimizes cash flow while avoiding late fees
- Batch payments generate single bank transaction with multiple allocations
- Payment confirmation updates bill status
- AP aging calculated from bill due date
- 1099 reporting for US vendors with >$600 annual payments
- Early payment discounts automatically calculated
- Vendor statements matched against internal records
- Multi-currency vendors tracked per currency
- Cannot pay more than bill amount without authorization

**Automated Bill Entry**:
```
User drags PDF bill → OCR processes →
System extracts data → Creates draft bill →
User reviews/edits → Submit for approval →
Approver reviews → Approved →
Payment scheduled → Payment executed →
GL entries posted
```

### FR-ACC-005: Bank Reconciliation

**Description**: System shall provide automated bank transaction import and matching with manual reconciliation capabilities.

**Features**:
1. Bank feed integration (Plaid, Yodlee, direct bank API)
2. Manual bank statement upload (CSV, OFX, QBO)
3. Automatic transaction matching with invoices/bills
4. Smart matching rules (amount, date range, description patterns)
5. Manual transaction matching
6. Transaction categorization to GL accounts
7. Recurring transaction rules
8. Bank transfer handling (between accounts)
9. Unreconciled transaction dashboard
10. Reconciliation reports
11. Multi-currency bank account support
12. Opening/closing balance validation
13. Reconciliation locking (period close)
14. Bank account register view
15. Transaction search and filtering

**Acceptance Criteria**:
- Bank feeds refresh daily automatically
- Transactions matched within ±3 days and ±5% amount variance
- Matching confidence score displayed (high, medium, low)
- Manual matches require user confirmation
- Unmatched transactions flagged for review
- Recurring rules apply automatically to new transactions
- Inter-account transfers don't duplicate transactions
- Foreign currency transactions converted at bank rate
- Reconciled transactions cannot be modified without unlock
- Reconciliation reports show opening balance, transactions, closing balance
- Bank register sorted by date with running balance
- Bulk transaction categorization available

**Matching Rules Example**:
```json
{
  "rule_name": "Monthly Office Rent",
  "conditions": {
    "description_contains": "PROPERTY MGMT LLC",
    "amount_equals": 5000.00,
    "tolerance": 0.01
  },
  "action": {
    "category": "Rent Expense",
    "vendor": "Property Management LLC",
    "auto_match": true,
    "create_bill": false
  }
}
```

### FR-ACC-006: General Ledger & Chart of Accounts

**Description**: System shall maintain a comprehensive general ledger with double-entry bookkeeping and multi-currency support.

**Features**:
1. Chart of accounts setup with templates (by industry)
2. Account types: Assets, Liabilities, Equity, Revenue, Expenses
3. Account codes and descriptions (multilingual)
4. Account hierarchy (parent-child relationships)
5. Manual journal entries
6. Recurring journal entries
7. Automatic entries from invoices, bills, payments
8. Multi-currency transactions
9. Exchange rate management (daily updates, manual entry)
10. Realized/unrealized FX gains and losses
11. Accounting period management
12. Period closing and locking
13. Year-end closing procedures
14. General ledger reports
15. Trial balance
16. Account activity detail
17. Audit trail for all entries

**Acceptance Criteria**:
- Chart of accounts customizable per tenant
- Account codes unique within tenant
- Debit = Credit enforcement (balanced entries)
- Journal entries require description
- Posting date must be within open accounting period
- Locked periods prevent new/edited entries
- Multi-currency entries track foreign and base amounts
- Exchange rates: automatic daily update from reliable source (e.g., ECB, Fed)
- Unrealized gains/losses recalculated at each period close
- Realized gains/losses posted when foreign invoice/bill paid
- Trial balance always balances
- Complete audit log: user, timestamp, before/after values
- GL reports filterable by date range, account, department

**Chart of Accounts Structure**:
```
1000-1999: Assets
  1000-1099: Current Assets
    1000: Cash - Operating Account (USD)
    1010: Cash - EUR Account
    1100: Accounts Receivable
    1200: Inventory
  1100-1999: Fixed Assets
    1500: Equipment
    1510: Accumulated Depreciation - Equipment

2000-2999: Liabilities
  2000-2099: Current Liabilities
    2000: Accounts Payable
    2100: Accrued Expenses
  2100-2999: Long-term Liabilities
    2500: Notes Payable

3000-3999: Equity
  3000: Owner's Equity
  3900: Retained Earnings

4000-4999: Revenue
  4000: Sales Revenue
  4100: Service Revenue

5000-9999: Expenses
  5000: Cost of Goods Sold
  6000: Operating Expenses
  7000: Payroll Expenses
```

### FR-ACC-007: Financial Reporting

**Description**: System shall generate comprehensive financial reports with multi-currency, multi-period, and segmentation capabilities.

**Features**:
1. **Standard Reports**:
   - Profit & Loss (Income Statement)
   - Balance Sheet
   - Cash Flow Statement
   - Trial Balance
   - General Ledger Detail
   - Account Transactions
2. **AR/AP Reports**:
   - AR Aging Summary/Detail
   - AP Aging Summary/Detail
   - Customer Balances
   - Vendor Balances
3. **Tax Reports**:
   - Sales Tax Summary
   - VAT Return
   - Tax Detail Report
4. **Management Reports**:
   - Budget vs. Actual
   - Departmental P&L
   - Project Profitability
5. **Report Features**:
   - Date range selection (period, quarter, year, custom)
   - Comparison periods (prior period, prior year)
   - Drill-down to transaction detail
   - Multi-currency reporting (source or base currency)
   - Segment reporting (department, location, tracking category)
   - Export formats (PDF, Excel, CSV)
   - Scheduled report generation and email
   - Custom report builder
   - Report templates and favorites

**Acceptance Criteria**:
- All reports generated in real-time from current data
- P&L shows revenue, expenses, net income with subtotals
- Balance Sheet balances (Assets = Liabilities + Equity)
- Cash Flow uses direct or indirect method (configurable)
- Comparative reports show variance (amount and %)
- Drill-down opens transaction list for any line item
- Multi-currency reports convert to base currency or show in original
- Reports respect closed accounting periods
- Export to Excel maintains formatting and formulas
- Scheduled reports sent via email at specified time
- Custom reports saved per user or shared with team
- Report access controlled by permissions

**Profit & Loss Example**:
```
Company ABC - Profit & Loss
Period: January 1 - December 31, 2025
Currency: USD

Revenue
  Sales Revenue                 $1,250,000
  Service Revenue                 $850,000
  --------------------------------
  Total Revenue                 $2,100,000

Cost of Goods Sold
  Materials                       $350,000
  Direct Labor                    $200,000
  --------------------------------
  Total COGS                      $550,000

Gross Profit                    $1,550,000
Gross Margin                         73.8%

Operating Expenses
  Payroll Expenses                $600,000
  Rent                             $120,000
  Marketing                        $180,000
  Office Expenses                   $45,000
  Professional Fees                 $35,000
  --------------------------------
  Total Operating Expenses        $980,000

Operating Income                  $570,000

Other Income (Expense)
  Interest Income                    $5,000
  Interest Expense                  -$15,000
  FX Gains (Losses)                  $2,500
  --------------------------------
  Total Other Income (Expense)      -$7,500

Net Income                        $562,500
Net Margin                           26.8%
```

### FR-ACC-008: Tax Management

**Description**: System shall calculate, track, and report sales taxes, VAT, and GST based on jurisdiction.

**Features**:
1. Tax rate configuration by jurisdiction
2. Multiple tax types (sales tax, VAT, GST)
3. Tax rate effective dates
4. Tax exemption management (customers, products)
5. Automatic tax calculation on invoices and bills
6. Tax rounding rules
7. Reverse charge VAT handling (EU B2B)
8. Tax component breakdown (state, county, city)
9. Tax collected tracking (output tax)
10. Tax paid tracking (input tax)
11. Tax liability calculation
12. Tax reports and returns
13. 1099 reporting (US)
14. Making Tax Digital (MTD) support (UK)
15. Tax audit trail

**Acceptance Criteria**:
- Tax rates configurable with start/end dates
- Tax applied based on customer location and product taxability
- Invoice line items show tax separately
- Tax-exempt customers/products don't calculate tax
- Reverse charge VAT: no tax charged, customer self-assesses
- Tax reports show tax collected vs. tax paid
- Tax liability = Output Tax - Input Tax (VAT/GST systems)
- 1099 forms generated for qualifying vendors
- MTD submission ready (UK HMRC integration)
- Tax returns pre-filled from transaction data
- Tax calculations auditable (rate used, basis amount)

**US Sales Tax Configuration**:
```json
{
  "jurisdiction": "California",
  "tax_components": [
    {
      "name": "State Sales Tax",
      "rate": 0.0725,
      "authority": "California Department of Tax and Fee Administration"
    },
    {
      "name": "County Tax (Los Angeles)",
      "rate": 0.0025,
      "authority": "Los Angeles County"
    },
    {
      "name": "District Tax",
      "rate": 0.015,
      "authority": "Local District"
    }
  ],
  "total_rate": 0.09,
  "effective_date": "2025-01-01"
}
```

### FR-ACC-009: Multi-Currency Operations

**Description**: System shall support 160+ currencies with automatic exchange rate updates and FX gain/loss tracking.

**Features**:
1. Support for 160+ currencies (ISO 4217)
2. Tenant base currency selection
3. Enable multiple additional currencies
4. Automatic daily exchange rate updates
5. Manual exchange rate entry and locking
6. Currency-specific bank accounts
7. Multi-currency invoicing
8. Multi-currency bill payment
9. Currency conversion at transaction date
10. Unrealized gain/loss calculation
11. Realized gain/loss on settlement
12. Multi-currency reporting
13. Currency revaluation (period end)
14. Historical exchange rate tracking
15. Exchange rate variance analysis

**Acceptance Criteria**:
- Exchange rates update daily from reliable source (ECB, Federal Reserve)
- Transaction amounts stored in original currency and base currency
- Exchange rate locked at transaction date
- Foreign currency bank accounts tracked separately
- Unrealized gains/losses calculated at reporting date
- Realized gains/losses posted when payment settles invoice
- Currency revaluation adjusts open balances to current rate
- Multi-currency reports show in base currency or keep original
- Historical rates preserved for audit trail
- Rate variance report shows rate changes over time
- Manual rate entry allowed with audit log

**Multi-Currency Transaction Example**:
```json
{
  "transaction_type": "invoice_payment",
  "transaction_date": "2025-12-03",
  "invoice_currency": "EUR",
  "invoice_amount": 10000.00,
  "exchange_rate_at_invoice": 1.10,
  "invoice_base_amount": 11000.00,

  "payment_currency": "EUR",
  "payment_amount": 10000.00,
  "exchange_rate_at_payment": 1.08,
  "payment_base_amount": 10800.00,

  "base_currency": "USD",
  "realized_fx_loss": -200.00,
  "gl_entries": [
    {
      "account": "Cash - EUR Account",
      "debit": 10000.00,
      "currency": "EUR"
    },
    {
      "account": "FX Loss",
      "debit": 200.00,
      "currency": "USD"
    },
    {
      "account": "Accounts Receivable",
      "credit": 10000.00,
      "currency": "EUR",
      "base_credit": 11000.00
    }
  ]
}
```

---

## Data Model

**Note:** Data model specifications have been moved to the centralized data models specification.

See [schema.sql](../packages/database/reference/schema.sql) for complete database schemas including:
- Chart of Accounts
- Journal Entries and Journal Entry Lines
- Customers and Invoices
- Vendors and Bills
- Payments and Payment Allocations
- Bank Accounts and Transactions
- Bank Reconciliation Rules
- Expenses
- Tax Rates and Exchange Rates
- Accounting Periods

---

## API Specifications

**Note:** API specifications have been moved to the centralized API endpoints specification.

See [api-endpoints.md](./api-endpoints.md#accounting-module) for complete API documentation including:
- Chart of Accounts endpoints
- Invoice management endpoints
- Payment processing endpoints
- Bill management endpoints
- Bank reconciliation endpoints
- Expense management endpoints
- Financial reporting endpoints

---

## User Interface Specifications

### Navigation Structure

```
Accounting Module (Main Menu)
├── Dashboard
├── Invoicing
│   ├── Invoices (List)
│   ├── Create Invoice
│   ├── Recurring Invoices
│   └── Customer Payments
├── Purchases
│   ├── Bills (List)
│   ├── Enter Bill
│   ├── Pay Bills
│   └── Vendor Payments
├── Banking
│   ├── Bank Accounts
│   ├── Reconciliation
│   ├── Transactions
│   └── Bank Rules
├── Expenses
│   ├── My Expenses
│   ├── Submit Expense
│   ├── Expense Claims (Manager)
│   └── Expense Reports
├── Accounting
│   ├── Chart of Accounts
│   ├── Journal Entries
│   ├── General Ledger
│   └── Trial Balance
├── Reports
│   ├── Profit & Loss
│   ├── Balance Sheet
│   ├── Cash Flow
│   ├── AR Aging
│   ├── AP Aging
│   └── Custom Reports
├── Taxes
│   ├── Tax Rates
│   ├── Tax Returns
│   └── 1099 Forms (US)
└── Settings
    ├── Company Settings
    ├── Currencies & Exchange Rates
    ├── Payment Gateways
    └── Accounting Periods
```

### Key Pages

#### Accounting Dashboard

**URL**: `/accounting/dashboard`

**Layout** (Grid of widgets):

**Cash Position Widget**:
- Current cash balance (all accounts, base currency)
- 7-day chart showing trend
- Quick link to bank accounts

**Outstanding AR/AP Widget**:
- Total AR with aging breakdown (pie chart)
- Total AP with aging breakdown (pie chart)
- Quick actions: View overdue invoices, Pay bills

**Short-term Cash Flow Widget**:
- 30-day cash flow forecast
- Expected collections (by invoice due date)
- Upcoming payments (by bill due date)
- Net cash position projection

**Quick P&L Summary**:
- MTD Revenue vs. target
- MTD Expenses vs. budget
- Net Income
- Link to full P&L report

**Recent Activity**:
- Latest invoices sent
- Recent payments received
- Recent bills entered
- Unreconciled bank transactions count

**Actions** (Quick create buttons):
- New Invoice
- Enter Bill
- Record Payment
- Add Expense

#### Invoice List Page

**URL**: `/accounting/invoices`

**Layout**:
- Search bar (invoice number, customer name)
- Filters: Status (All, Draft, Sent, Overdue, Paid), Date range, Customer, Currency
- Sort by: Date, Due date, Amount, Customer
- Bulk actions: Send, Void, Export

**Table Columns**:
- Invoice # (clickable)
- Customer
- Date
- Due Date
- Amount
- Amount Due
- Status badge (color-coded)
- Actions dropdown (View, Send, Record Payment, Void, Download PDF)

**Summary Bar** (above table):
- Total Outstanding: $X
- Overdue: $Y (red)
- Due this week: $Z

#### Create Invoice Page

**URL**: `/accounting/invoices/new`

**Layout** (Single page form):

**Header Section**:
- Invoice # (auto-generated, editable)
- Customer (searchable dropdown with "Add new customer" option)
- Invoice Date (date picker, defaults to today)
- Due Date (auto-calculated from payment terms, editable)
- Currency (dropdown, defaults from customer)
- Reference (optional)

**Line Items Section** (Table):
- Description | Quantity | Unit Price | Tax | Amount
- Add line button
- Drag to reorder rows
- Delete row icon

**Totals Section** (Right sidebar):
- Subtotal
- Tax total (breakdown by tax type if multiple)
- **Total**
- Amount Paid (if partial payments)
- Amount Due

**Footer Section**:
- Notes (to customer)
- Terms & Conditions
- Footer text

**Tracking** (Collapsible section):
- Tracking categories (Region, Project, Salesperson, etc.)

**Actions**:
- Save as Draft
- Save and Send (opens email modal)
- Save and Continue (creates invoice and stays on page for another)
- Cancel

**Email Modal** (when Send clicked):
- To: (customer email, editable)
- CC: (optional)
- Subject: (pre-filled, editable)
- Body: (template with merge fields, editable)
- Attach PDF: (checkbox, checked)
- Send button

#### Invoice Detail Page

**URL**: `/accounting/invoices/:id`

**Layout**:

**Header**:
- Invoice number and status badge
- Customer name
- Actions: Send, Record Payment, Void, Download PDF, Print

**Invoice Preview**:
- Professional PDF-style layout showing all invoice details
- Company logo and branding

**Activity Timeline** (Right sidebar):
- Created: Date, user
- Sent: Date, user, recipient
- Viewed: Date(s), IP address
- Payment recorded: Date, amount, user
- Notes: Any manual notes added

**Payment History** (if applicable):
- Table: Date | Amount | Payment Method | Reference

**Related Transactions**:
- Journal entry link
- Payment links

**Communication Log**:
- Emails sent (subject, date, recipient)
- Resend button

#### Bill Entry Page

**URL**: `/accounting/bills/new`

**Layout**:

**File Upload Zone** (Prominent at top):
- Drag & drop PDF/image of bill
- "Upload Bill" button
- "Or enter manually" link

**After Upload** (OCR Processing):
- Loading spinner: "Reading bill data..."
- Success: "Bill data extracted! Please review below."

**Bill Form** (Pre-filled from OCR):
- Vendor (searchable dropdown, highlighted if extracted)
- Bill Date (highlighted if extracted)
- Due Date (highlighted if extracted)
- Bill Number (vendor's number, highlighted if extracted)
- Currency
- Reference

**Line Items** (Pre-filled from OCR):
- Description | Quantity | Unit Price | Tax | Account | Amount
- Highlight fields extracted from OCR
- Confidence score indicator (high/medium/low)
- Edit inline

**Totals**:
- Subtotal
- Tax
- Total

**Attached File**:
- Thumbnail preview
- Download link

**Approval Workflow** (if required):
- Approver (auto-assigned based on rules)
- Approval status

**Actions**:
- Save as Draft
- Submit for Approval
- Approve and Pay (if user has permission)
- Cancel

#### Bank Reconciliation Page

**URL**: `/accounting/banking/reconcile/:bank_account_id`

**Layout**:

**Header**:
- Bank account name and balance
- Statement date range (from/to date pickers)
- Statement ending balance (input)

**Two-Panel Layout**:

**Left Panel - Bank Transactions**:
- List of imported bank transactions
- Columns: Date | Description | Amount | Match Status
- Filter: All, Unmatched, Matched, Reconciled
- Search box

**Right Panel - Suggested Matches**:
- When transaction selected on left, show suggested matches
- Confidence score (color-coded)
- Match options:
  - Invoice match: Invoice #, Customer, Amount, Date
  - Bill match: Bill #, Vendor, Amount, Date
  - Payment match: Payment #, Amount, Date
  - Transfer: Another bank account
- "Create New Transaction" option
- "Categorize" option (for unmatched)

**Transaction Detail** (when item selected):
- Full description
- Amount, date
- Suggested category
- "Create Rule" button (to auto-match future similar transactions)
- Notes field

**Bottom Summary**:
- Opening balance: $X
- + Transactions matched: $Y
- - Transactions cleared: $Z
- = Calculated balance: $A
- Statement balance: $B
- Difference: $C (should be $0 when fully reconciled)
- "Complete Reconciliation" button (enabled when difference is $0)

#### Expense Submission Page (Mobile-Optimized)

**URL**: `/accounting/expenses/submit`

**Mobile Layout** (Responsive):

**Receipt Capture**:
- Large "Take Photo" button (camera icon)
- "Upload from Gallery" button
- Preview area

**After Capture**:
- Receipt image preview
- "Processing receipt..." (OCR running)
- Auto-filled fields:
  - Date (editable)
  - Vendor (editable)
  - Amount (editable)
  - Category (dropdown, suggested from OCR)

**Additional Fields**:
- Description (optional)
- Reimbursable (toggle, default on)
- Department (dropdown)

**Submit Button**:
- "Submit for Approval"

**Success Message**:
- "Expense submitted! Your manager will review."
- "Submit Another" button

#### Profit & Loss Report Page

**URL**: `/accounting/reports/profit-loss`

**Layout**:

**Report Controls** (Top bar):
- Date Range: Dropdown (This Month, This Quarter, This Year, Custom) + Date pickers
- Compare to: Dropdown (None, Prior Period, Prior Year, Custom) + Date pickers
- Currency: Dropdown (Base, USD, EUR, etc.)
- Department: Dropdown (All, specific department)
- "Run Report" button
- Export: Dropdown (PDF, Excel, CSV)

**Report Display** (Professional format):

```
Company Name
Profit & Loss
January 1 - December 31, 2025
Currency: USD

Income
  Sales Revenue              $1,250,000    $1,100,000    +$150,000    +13.6%
  Service Revenue              $850,000      $750,000    +$100,000    +13.3%
  ─────────────────────────────────────────────────────────────────
  Total Income              $2,100,000    $1,850,000    +$250,000    +13.5%

Cost of Goods Sold
  Materials                    $350,000      $320,000     +$30,000     +9.4%
  Direct Labor                 $200,000      $180,000     +$20,000    +11.1%
  ─────────────────────────────────────────────────────────────────
  Total COGS                  $550,000      $500,000     +$50,000    +10.0%

Gross Profit                $1,550,000    $1,350,000    +$200,000    +14.8%
Gross Margin                     73.8%         73.0%        +0.8%

Operating Expenses
  Payroll                      $600,000      $550,000     +$50,000     +9.1%
  Rent                         $120,000      $120,000           $0      0.0%
  Marketing                    $180,000      $150,000     +$30,000    +20.0%
  [... more expense categories ...]
  ─────────────────────────────────────────────────────────────────
  Total Operating Expenses    $980,000      $900,000     +$80,000     +8.9%

Operating Income              $570,000      $450,000    +$120,000    +26.7%

Other Income (Expense)
  Interest Income                $5,000        $4,000      +$1,000    +25.0%
  Interest Expense             -$15,000      -$12,000     -$3,000    +25.0%
  FX Gains (Losses)              $2,500        -$500       +$3,000        -
  ─────────────────────────────────────────────────────────────────
  Total Other Income           -$7,500       -$8,500      +$1,000    -11.8%

Net Income                    $562,500      $441,500    +$121,000    +27.4%
Net Margin                       26.8%         23.9%        +2.9%
```

**Interactive Features**:
- Click account name to drill down to transaction detail
- Hover over amount to see tooltip with more info
- Expand/collapse sections
- Print-friendly version

#### Chart of Accounts Page

**URL**: `/accounting/accounts`

**Layout**:

**Header**:
- Search bar (account code, name)
- Filter: Account Type (All, Assets, Liabilities, Equity, Revenue, Expenses)
- Filter: Status (Active, Inactive, All)
- "Add Account" button

**Table** (Hierarchical view):
- Account Code | Account Name | Type | Currency | Balance | Status | Actions
- Indent child accounts under parents
- Expand/collapse icons for parent accounts

**Actions Dropdown**:
- Edit
- View Transactions
- Deactivate/Activate
- Delete (only if no transactions)

**Add/Edit Account Modal**:
- Account Code (input)
- Account Name (input)
- Multilingual Names (expandable section)
- Account Type (dropdown)
- Account Subtype (dropdown, filtered by type)
- Parent Account (dropdown, optional)
- Currency (dropdown, optional - defaults to base)
- Description (textarea)
- Save/Cancel buttons

---

## Business Logic & Rules

### Double-Entry Bookkeeping

**Fundamental Rule**: Every transaction must have balanced debits and credits.

```
Debits = Credits (always)
```

**Account Type Rules**:
- **Assets**: Debit increases, Credit decreases
- **Liabilities**: Credit increases, Debit decreases
- **Equity**: Credit increases, Debit decreases
- **Revenue**: Credit increases, Debit decreases
- **Expenses**: Debit increases, Credit decreases

### Invoice Workflow

1. **Draft**: Invoice created, editable
2. **Sent**: Invoice emailed to customer, PDF generated, status = "sent"
   - Journal Entry Created:
     ```
     DR: Accounts Receivable (Asset)
     CR: Revenue Account (Revenue)
     ```
3. **Viewed**: Customer opened invoice (tracked via pixel/link)
4. **Partial**: Partial payment received
   - Journal Entry:
     ```
     DR: Cash/Bank Account (Asset)
     CR: Accounts Receivable (Asset)
     ```
5. **Paid**: Full payment received, status = "paid"
6. **Overdue**: Due date passed and amount_due > 0
   - Automated reminder sent based on schedule
7. **Void**: Invoice cancelled, reversal journal entry created

### Bill Approval Workflow

1. **Draft**: Bill entered (manually or OCR)
2. **Submitted**: Bill submitted for approval
   - Approval routes to:
     - Direct manager (if bill < $1,000)
     - Department head (if $1,000 - $10,000)
     - CFO (if > $10,000)
3. **Approved**: Approver reviews and approves
   - Journal Entry Created:
     ```
     DR: Expense Account (Expense)
     DR: Tax Paid (Asset, if recoverable)
     CR: Accounts Payable (Liability)
     ```
4. **Payment Scheduled**: Bill added to payment batch
5. **Paid**: Payment executed
   - Journal Entry:
     ```
     DR: Accounts Payable (Liability)
     CR: Cash/Bank Account (Asset)
     ```

### Bank Reconciliation Matching Rules

**Automatic Matching** occurs when:
1. Amount matches within tolerance (default ±$0.05)
2. Date within range (default ±3 days)
3. Description contains reference (invoice #, customer name)
4. Confidence score > 90%

**Manual Matching** required when:
1. Multiple possible matches
2. Confidence score < 90%
3. Amount or date variance exceeds threshold

**Matching Rule Priority**:
1. Exact amount + exact date + description match
2. Exact amount + date range + description partial match
3. Amount range + description match
4. Custom rules (user-defined, applied in priority order)

### Multi-Currency Transactions

**Exchange Rate Locking**:
- Invoice/Bill: Rate locked at document date
- Payment: Rate locked at payment date
- If rates differ between invoice and payment, FX gain/loss recorded

**Unrealized Gain/Loss** (Period End):
- Recalculate all open foreign currency invoices/bills at current rate
- Post adjustment to Unrealized FX Gain/Loss account
- Reverse at start of next period

**Realized Gain/Loss** (Settlement):
- When foreign invoice paid:
  ```
  Original Invoice (Jan 1): €10,000 @ 1.10 = $11,000 DR AR
  Payment (Feb 1): €10,000 @ 1.08 = $10,800 DR Cash
  FX Loss: $200 DR FX Loss

  Journal Entry:
  DR: Cash €10,000 ($10,800)
  DR: FX Loss $200
  CR: Accounts Receivable €10,000 ($11,000)
  ```

### Tax Calculation Rules

**US Sales Tax**:
- Tax based on ship-to address (destination-based)
- Nexus determination: Does seller have physical presence or economic nexus?
- Tax-exempt customers require exemption certificate on file
- Composite rate = State + County + City + District

**EU VAT**:
- **B2C**: Charge VAT of seller's country (if buyer in same country) or buyer's country (if threshold exceeded)
- **B2B**: Reverse charge if buyer provides valid VAT number
- **Intra-EU**: VAT not charged, buyer self-assesses
- **Import/Export**: Zero-rated or exempt

**Tax Rounding**:
- Calculate tax per line item
- Round to 2 decimals per line
- Sum all line taxes for total tax

### Accounting Period Rules

**Open Period**:
- All transactions can be created/edited
- Default posting date = today

**Closed Period**:
- No new transactions
- No edits to existing transactions
- Reports are finalized

**Locked Period**:
- Like closed, but permanent
- Used after external audit or tax filing
- Requires special permission to unlock

**Year-End Close**:
1. Close all revenue and expense accounts to Retained Earnings
2. Carry forward asset, liability, equity balances
3. Lock prior year periods
4. Create opening balances for new year

---

## Validation Rules

### Invoice Validation

- Customer must be active
- Invoice date ≤ today (warning if future date)
- Due date ≥ invoice date
- At least one line item required
- Line item amount = quantity × unit_price (calculated)
- Subtotal = sum of line amounts
- Tax calculated based on tax rates
- Total = subtotal + tax
- Invoice number must be unique within tenant
- Currency must be enabled for tenant
- Revenue accounts must be of type "revenue"

### Bill Validation

- Vendor must be active
- Bill date ≤ today (warning if future date)
- Due date ≥ bill date
- At least one line item required
- Bill number (vendor's) not required but recommended
- Expense accounts must be of type "expense" or "asset" (for capital expenditures)
- File upload recommended for audit trail

### Payment Validation

- Payment amount > 0
- Payment date ≤ today
- Customer payment: allocations must reference invoices
- Vendor payment: allocations must reference bills
- Total allocations ≤ payment amount
- Cannot over-allocate (pay more than invoice/bill total)
- Bank account must be active
- Payment method required

### Journal Entry Validation

- Entry date must be within open accounting period
- Description required
- At least 2 lines (one debit, one credit)
- Total debits = total credits (balanced entry)
- All accounts must be active
- Cannot post to inactive accounts
- Exchange rates required for foreign currency entries
- Base currency amounts calculated automatically

### Bank Reconciliation Validation

- Statement ending balance must match calculated balance
- All transactions in date range must be matched or reconciled
- Cannot reconcile with unmatched transactions (unless marked "ignore")
- Opening balance = prior statement closing balance

---

## Security Considerations

### Data Access Control

**Role-Based Permissions**:
- `accounting:full` - Full access (CFO, Controller)
- `accounting:invoices:*` - Invoice management
- `accounting:bills:*` - Bill management
- `accounting:expenses:*` - Expense management
- `accounting:reports:read` - View financial reports
- `accounting:accounts:manage` - Manage chart of accounts
- `accounting:bank:reconcile` - Bank reconciliation
- `accounting:periods:close` - Close accounting periods

**Data-Level Security**:
- All queries filtered by `tenant_id` automatically
- Users can only access data for their tenant
- Row-level security policies enforce tenant isolation
- Department-level access control (optional): Users see only their department's data

### Sensitive Data Protection

**Encryption**:
- Vendor bank account numbers encrypted at rest (AES-256)
- Customer payment information not stored (use payment gateway tokens)
- Tax ID numbers encrypted
- Audit log entries encrypted

**PCI DSS Compliance** (if processing payments):
- No credit card numbers stored in database
- Use payment gateway tokens only
- PCI DSS Level 1 compliant payment providers (Stripe, PayPal)

**Access Logging**:
- All financial transaction views logged
- Report generation logged (who ran what report when)
- Export actions logged
- Financial data modifications logged with before/after values

### Audit Trail

**Comprehensive Logging**:
- Every financial transaction includes: created_by, created_at, updated_by, updated_at
- Journal entries are immutable once posted (new entry required for corrections)
- Invoice/bill modifications create version history
- Payment allocations tracked with timestamps
- Bank reconciliation actions logged
- Account balance changes tracked

**Audit Reports**:
- User activity report (who did what when)
- Transaction detail report (full journal entry history)
- Account activity report (all changes to account balances)
- Export log (what data was exported by whom)

---

## Integration Points

### Payment Gateway Integration

**Supported Providers**:
- Stripe (Credit/Debit cards, ACH)
- PayPal (PayPal balance, cards)
- GoCardless (Direct Debit - UK, EU, Australia)

**Integration Flow**:
1. Tenant connects payment gateway account (OAuth)
2. Invoice includes payment link with gateway-specific URL
3. Customer clicks link, enters payment details on gateway
4. Gateway processes payment, sends webhook to platform
5. Platform records payment, allocates to invoice
6. Invoice status updated to "paid"
7. Email confirmation sent to customer and merchant

**Webhook Handling**:
- Signature verification (HMAC)
- Idempotent payment processing
- Retry logic for failed webhooks
- Payment dispute handling

### Bank Feed Integration

**Supported Providers**:
- Plaid (US, Canada)
- Yodlee (Global)
- Direct bank APIs (selected banks)
- Manual CSV/OFX upload

**Integration Flow**:
1. User connects bank account via OAuth/credentials
2. Platform fetches last 90 days of transactions
3. Daily sync imports new transactions
4. Transactions automatically matched using rules
5. User reviews and confirms matches
6. Reconciliation completed

**Security**:
- Bank credentials never stored (OAuth tokens only)
- Encrypted token storage
- Read-only access to bank accounts
- Multi-factor authentication supported

### Accounting Software Integration (Future)

**Potential Integrations**:
- QuickBooks Online (export invoices, bills, payments)
- Xero (full sync)
- NetSuite (for enterprise customers)
- Custom CSV export for any system

**Sync Direction**:
- One-way export (platform → external system)
- Two-way sync (selected fields only)
- Conflict resolution rules

### HR/Payroll Integration

**Internal Integration**:
- Employee data from HR module
- Payroll journal entries posted to GL
- Expense reimbursements create AP bills
- Employee department for expense categorization

---

## Reporting Requirements

### Standard Financial Reports

**1. Profit & Loss (Income Statement)**
- Time period: Custom range, MTD, QTD, YTD
- Comparison: Prior period, prior year, budget
- Grouping: By account type (Revenue, COGS, Expenses)
- Drill-down: Click account to see transactions
- Export: PDF, Excel, CSV

**2. Balance Sheet**
- As of date: Any date
- Comparison: Prior period, prior year
- Grouping: Assets, Liabilities, Equity
- Format: Standard or comparative
- Export: PDF, Excel, CSV

**3. Cash Flow Statement**
- Time period: Custom range, MTD, QTD, YTD
- Method: Direct or indirect
- Sections: Operating, Investing, Financing activities
- Shows: Beginning cash, net change, ending cash
- Export: PDF, Excel

**4. Trial Balance**
- As of date: Any date
- Shows: All accounts with debit/credit balances
- Verification: Total debits = total credits
- Drill-down: To account detail
- Export: PDF, Excel, CSV

**5. General Ledger Detail**
- Time period: Custom date range
- Filter: By account, date range
- Shows: All journal entries with line details
- Drill-down: To source document (invoice, bill, etc.)
- Export: PDF, Excel, CSV

### AR/AP Reports

**6. AR Aging Summary**
- As of date: Any date
- Aging buckets: Current, 1-30, 31-60, 61-90, 90+ days
- Grouping: By customer
- Shows: Total outstanding, % by aging bucket
- Export: PDF, Excel, CSV

**7. AR Aging Detail**
- As of date: Any date
- Shows: Individual invoices with aging
- Filter: By customer, currency
- Drill-down: To invoice detail

**8. AP Aging Summary**
- Similar to AR aging for vendors/bills

**9. Customer Balances**
- As of date: Any date
- Shows: All customers with outstanding balance
- Sorted: By balance (high to low)
- Filter: Active customers only

**10. Vendor Balances**
- Similar to customer balances

### Tax Reports

**11. Sales Tax Summary (US)**
- Time period: Quarter, month, custom
- Shows: Tax collected by jurisdiction
- Supports: Multi-state operations
- Format: Ready for tax filing
- Export: PDF, CSV for upload to tax authority

**12. VAT Return (UK/EU)**
- Time period: Quarter
- Shows: Output tax, input tax, net tax due
- Format: HMRC MTD compatible
- Supports: Digital submission

**13. 1099 Report (US)**
- Time period: Tax year
- Shows: Payments to 1099 vendors
- Filter: Vendors with >$600 payments
- Export: PDF, file format for IRS

### Management Reports

**14. Budget vs. Actual**
- Time period: Month, quarter, year
- Shows: Budget, actual, variance ($ and %)
- Grouping: By department, account category
- Visual: Color coding for variances

**15. Department P&L**
- Time period: Custom
- Shows: Revenue and expenses by department
- Comparison: Across departments
- Useful for: Cost center analysis

**16. Project Profitability**
- Requires: Tracking categories enabled
- Shows: Revenue and expenses by project
- Calculates: Profit margin per project
- Useful for: Service businesses

**17. Cash Flow Forecast**
- Time period: Next 30, 60, 90 days
- Shows: Expected collections (from invoices)
- Shows: Expected payments (from bills)
- Calculates: Net cash position by date
- Visual: Chart showing cash trend

### Custom Reports

**Report Builder**:
- Select data source (invoices, bills, transactions, accounts)
- Choose columns to display
- Apply filters (date, customer, vendor, account, etc.)
- Set grouping and sorting
- Add calculations (sum, average, count)
- Save report template
- Schedule email delivery (daily, weekly, monthly)

---

## Testing Requirements

### Unit Testing

**Critical Functions**:
- Tax calculation logic (all tax types)
- Multi-currency conversion and FX gain/loss calculation
- Invoice/Bill total calculations
- Journal entry balancing validation
- AR/AP aging calculation
- Bank transaction matching algorithm
- OCR data extraction accuracy
- Exchange rate retrieval and storage

**Test Coverage Target**: >85% for accounting module

### Integration Testing

**Test Scenarios**:
1. **Invoice-to-Payment Flow**:
   - Create invoice → Send → Record payment → Verify GL entries
2. **Bill-to-Payment Flow**:
   - Enter bill → Approve → Schedule payment → Pay → Verify GL entries
3. **Bank Reconciliation**:
   - Import transactions → Match to invoices/bills → Reconcile → Verify balances
4. **Expense Workflow**:
   - Submit expense → Approve → Create AP bill → Pay → Verify reimbursement
5. **Multi-Currency Transaction**:
   - Create EUR invoice → USD payment → Verify FX gain/loss GL entry
6. **Period Close**:
   - Close period → Verify no edits allowed → Generate reports → Verify accuracy

### End-to-End Testing

**User Workflows**:
1. **New Business Setup**:
   - Create tenant → Set up chart of accounts → Add customers/vendors → Create first invoice
2. **Monthly Close**:
   - Review unreconciled transactions → Complete bank reconciliation → Adjust entries → Generate reports → Close period
3. **Tax Filing**:
   - Generate tax report → Review → Export → File with authority
4. **Audit Prep**:
   - Run GL detail → Export trial balance → Provide access to auditor (read-only) → Answer questions with drill-down reports

### Performance Testing

**Load Testing**:
- 1,000 concurrent users generating reports
- 10,000 invoices created per hour
- 1M journal entry lines queried for P&L report
- Real-time dashboard with 100 concurrent views

**Target Performance**:
- Invoice creation: <2 seconds
- Report generation (P&L, YTD): <5 seconds
- Bank transaction import: 10,000 transactions in <30 seconds
- Dashboard load: <1 second

### Security Testing

**Penetration Testing**:
- SQL injection attempts on all input fields
- Cross-tenant data access attempts
- Privilege escalation attempts
- API authentication bypass attempts
- Sensitive data exposure checks

**Compliance Testing**:
- GDPR: Data export, right to be forgotten
- PCI DSS: Payment data handling (if applicable)
- SOC 2: Access controls, audit logging

---

## Future Enhancements

### Phase 2 (6-12 months)

1. **Advanced Inventory Management**:
   - Inventory tracking (FIFO, LIFO, Average Cost)
   - Purchase orders
   - Goods received notes
   - Stock valuation reports

2. **Fixed Assets Management**:
   - Asset register
   - Depreciation calculation (Straight-line, declining balance)
   - Disposal tracking
   - Asset reports

3. **Budgeting Module**:
   - Budget creation by account, department
   - Budget vs. actual variance analysis
   - Budget approval workflows
   - Rolling forecasts

4. **Advanced Approvals**:
   - Multi-level approval workflows
   - Conditional approvals (based on amount, department)
   - Approval delegation
   - Approval dashboards

5. **Payroll Integration**:
   - Seamless journal entry posting from payroll
   - Employee expense allocation
   - Tax liability tracking

### Phase 3 (12-24 months)

1. **Advanced Analytics**:
   - AI-powered insights (anomaly detection, trend prediction)
   - Predictive cash flow
   - Customer payment behavior analysis
   - Vendor payment optimization

2. **Collaboration Tools**:
   - Comments on transactions
   - @mentions for team members
   - Approval chat
   - Document sharing

3. **External Accountant Portal**:
   - Grant limited access to external accountant
   - Real-time collaboration
   - Adjusting entry proposals
   - Report generation by accountant

4. **Advanced Multi-Entity**:
   - Consolidation accounting
   - Inter-company transactions
   - Elimination entries
   - Consolidated financial statements

5. **Blockchain Integration** (Exploratory):
   - Immutable audit trail on blockchain
   - Smart contracts for automated invoicing
   - Cryptocurrency payment acceptance

---

## Implementation Roadmap — Remaining Work

**Added 2026-09-11.** Concrete, priority-ordered punch list of what's left,
derived from the User Stories status annotations above and the leaf-level
verification in [19-accounting-test-plan.md](19-accounting-test-plan.md).
Unlike "Future Enhancements" above (which is unranked, aspirational, and
mixes verified gaps with speculative ideas), every item here maps to a
specific MISSING/PARTIAL finding that was checked directly against the
schema, code, and tests as of this date.

**Check items off as they ship** — change `- [ ]` to `- [x]` and add the
completion date and a link to the commit/PR, e.g.
`- [x] Invoice creation UI (2026-10-02, #412)`. When a whole tier is
complete, note it in the Document Change Log below rather than deleting the
tier, so this stays a record of what was true and when.

**The one real fork in this ordering**: it picks **data-entry-first**
(make the ledger's data real, since every write path today only ever acts on
fixture-seeded rows) over **reports-first** (build what an accountant reads
day-to-day against the existing fixture). If priorities shift toward
demoable reporting sooner, move Tier 3 ahead of Tier 1 — the dependency
argument in Tier 3 (trial balance before financial statements) still holds
either way.

### Tier 1 — Data entry (unblocks everything else)

- [x] Invoice creation UI (new-invoice form + line-item entry) (2026-09-11).
      `/accounting/invoices/new` — `acc.createInvoice()` in
      `accounting.repo.ts`, form + dynamic line-item entry in
      `+page.svelte`. Also, while touching this exact code path: wired
      `invoice_lines.discount_percent`/`discount_amount` into
      `recomputeInvoiceTotals` (previously dead columns, per the taxonomy's
      §2.1 finding) and added the `no_such_customer` `AccountingRefused`
      reason. Not in scope here, deliberately: PDF/branding, online payment
      links, per-line revenue-account posting (still hardcoded to one
      account in `issueInvoice` — a new line's `revenue_account_id` is set
      but not yet read at posting time) — see US-ACC-001/002/007 in the User
      Stories section, still MISSING. Tests: 7 new cases in
      `receivables.writes.test.ts` ("creating an invoice", including the
      discount-through-issuance case that also fixed `INVOICE_SELECT`'s
      `line_subtotal` drift check to net discounts the same way `subtotal`
      does), 3 new e2e cases in `form-errors.spec.ts`, 1 new `smoke.spec.ts`
      row. `./check` (app + db) and the full `smoke`/`form-errors` e2e
      suites pass.
- [x] Bill entry UI (manual line-item entry; drag-drop/OCR deferred to Tier
      6/7) (2026-09-12). `/accounting/bills/new` — `pay.createBill()` in
      `payables.repo.ts`, form + dynamic line-item entry in `+page.svelte`.
      Unlike invoices, `bill_number` is the vendor's own free text, not
      generated — no numbering retry loop, uniqueness is per (tenant,
      vendor) via `idx_bills_vendor_number`. Unlike `issueInvoice`'s
      hardcoded revenue account, `approveBill` already read each line's own
      `expense_account_id` at posting time, so this form gives every line a
      real account picker (`listExpenseAccountsForPicker`) — not a
      cosmetic field with no effect the way a per-line revenue picker on
      invoices would currently be. Added the `no_such_vendor`
      `AccountingRefused` reason. Not in scope here: file upload, OCR —
      US-ACC-021 (now PARTIAL), US-ACC-022 (still MISSING). Tests: 6 new
      cases in `payables.writes.test.ts` ("creating a bill"), including a
      create-then-approve integration case proving each line posts to its
      own expense account; 3 new e2e cases in `form-errors.spec.ts`
      (no lines, negative quantity, duplicate vendor+number); 1 new
      `smoke.spec.ts` row. `./check` (app + db) and the full
      `smoke`/`form-errors` e2e suites pass.

### Tier 2 — Cheap, real correctness fixes

- [x] Posted journal entry immutability (2026-09-12). New migration
      `20260912060000_journal_entry_immutability.sql` adds a RESTRICTIVE
      `status <> 'posted'` predicate to `accounting_update` on
      `journal_entries`, and an equivalent (via its parent's status, an
      `EXISTS`, not `NOT EXISTS` — an invisible parent must deny, not
      silently permit) on `journal_entry_lines`. Tested in the new
      `accounting.writes.test.ts` ("a posted journal entry resists an
      UPDATE"): both tables return zero rows on a real posted fixture entry,
      and — the positive control L48 also demands — a `status = 'draft'`
      row (no CHECK constraint behind the column, so a test can construct
      one) still permits the UPDATE, proving the predicate discriminates
      rather than just denying everything. `docs/19-accounting-test-plan.md`'s
      top-of-document correction and §1.3 bullet updated to reflect this is
      fixed, not a live finding.
- [x] `postJournal` zero-line/single-line guard (2026-09-12). Previously
      relied entirely on its two callers (`issueInvoice`/`approveBill`)
      checking first — a zero-line entry would otherwise "balance" trivially
      (0 = 0) and insert a header row for nothing. `postJournal` now refuses
      `AccountingRefused("no_lines")` when fewer than 2 real (non-zero) lines
      remain after filtering, before any row is written, so a future third
      caller can't skip it.
- [x] A test that feeds `postJournal` a deliberately unbalanced entry and
      confirms `does_not_balance` actually fires (2026-09-12), per L48 — "a
      guard never observed failing is not evidence." New
      `accounting.writes.test.ts` ("posting a journal entry directly") tests
      this directly, plus the zero/single/all-one-sided-line guard above,
      plus a genuinely balanced entry to prove neither guard over-rejects.
      6 new unit tests total for `postJournal`, none of it exercised through
      a subledger. `./check` (db + app) passes; `supabase db reset` was
      required for the new migration, which also surfaced
      [L81](10-lessons-learned.md) (`app_user`'s password must be reset by
      hand after a bare `db reset`).

### Tier 3 — Trial balance, then financial statements

- [x] Trial balance report + GL-control-account-to-subledger tie-out
      (2026-09-12). `/accounting/trial-balance` — `acc.trialBalance()`,
      `acc.trialBalanceTotals()` (an independent second aggregation, not a
      sum of the first's own rows) and `acc.controlAccountTieOut()` in
      `accounting.repo.ts`. All three sum `base_debit_amount`/
      `base_credit_amount`/`base_amount_due` — the tenant's base currency —
      not the raw currency-native columns, which would silently mix USD/EUR/
      GBP figures from entries posted in different currencies. The subledger
      side filters on `journal_entry_id IS NOT NULL`, not `status` — status is
      a hand-set label independent of whether a row was ever actually posted.
      Building the tie-out immediately found something real, exactly as
      predicted below: AR and AP do **not** currently tie to their subledgers
      in this fixture (off by `-10000.00` and `-2500.00`) — two distinct,
      fully-explained gaps, not one aggregate mystery. AR: most fixture
      invoices were hand-authored with a plausible status and never actually
      issued, so the AR subledger total is near-zero and the whole GL
      difference is one orphaned journal entry (`JE-2026-0004`, a $10,000
      credit with no matching debit or invoice). AP: the subledger side ties
      exactly; the whole difference is a second orphaned entry
      (`JE-2026-0006`, a $2,500 debit with no bill behind it). Both are
      fixture data-modeling gaps — hand-authored journal entries and
      invoice/bill rows never actually linked to each other — not an
      application bug. A separate test proves the write paths themselves add
      zero net drift: a fresh invoice/bill taken to fully paid through the
      real functions changes the AR/AP difference by exactly zero. See §1.5/§6 in
      [19-accounting-test-plan.md](19-accounting-test-plan.md) for the exact
      figures and citations. Tests: 5 new cases in `accounting.test.ts`
      ("the trial balance", including a refused-actor RLS check for a plain
      employee), 2 new cases in `accounting.writes.test.ts`
      ("the control-account tie-out reflects a clean write"), 1 new
      `smoke.spec.ts` row, 1 new nav entry. `./check` (app + db, 22 steps)
      and the full e2e suite (71 tests) pass.
- [x] Profit & Loss statement (2026-09-12). `/accounting/profit-loss` —
      `acc.profitAndLoss()`/`acc.profitAndLossTotals()` in `accounting.repo.ts`,
      summing `journal_entry_lines` for `revenue`/`expense` accounts in base
      currency over an optional `from`/`to` period (periodic, unlike the
      trial balance's cumulative `asOf`). Revenue is signed
      credits-minus-debits, expense debits-minus-credits, so both read
      positive for the ordinary case and net income is a plain subtraction.
      Totals are a second, independent SQL aggregation — not a JS reduction
      of the per-account rows, which would silently concatenate money
      strings instead of adding them. Tests: 5 new cases in
      `accounting.test.ts` ("the profit and loss statement"), including RLS
      as a refused plain employee. 1 new `smoke.spec.ts` row, 1 new nav
      entry. `./check` (22 steps) and the full e2e suite (72 tests) pass.
      US-ACC-038, FR-ACC-007.
- [x] Balance Sheet (2026-09-12). `/accounting/balance-sheet` —
      `acc.balanceSheet()`/`acc.balanceSheetTotals()` in `accounting.repo.ts`,
      cumulative as of a date like the trial balance, not periodic like the
      P&L. This codebase has no closing-entry process that rolls
      revenue/expense into retained earnings, so `equity` alone would
      understate what a real balance sheet needs — `balanceSheetTotals()`
      folds the current period's net income back in as its own
      `total_equity`/`total_liabilities_and_equity` figures, shown as a
      "Current period earnings (no closing entry has run)" line, which is
      what actually has to tie to assets. Verified against the real
      fixture: `59061.53` (assets) = `95981.53` (liabilities) + `20000.00`
      (equity) + `-56920.00` (net income) — `equity` moved off `0` on
      2026-09-12 when the fixture gained a real opening-balance entry (see
      the Statement of Changes in Equity item below). Tests: 4 new cases in
      `accounting.test.ts` ("the balance sheet"), including RLS as a refused
      plain employee, plus 2 write-path positive controls in
      `accounting.writes.test.ts` proving `equity` moves further when a
      second credit is posted and that `balances` actually goes `false` for
      a one-sided posted entry (CLAUDE.md L48/L50: a green assertion over a
      zero/never-triggered subject isn't evidence). 1 new `smoke.spec.ts`
      row, 1 new nav entry. `./check` and the full e2e suite pass.
      US-ACC-039, FR-ACC-007.
- [x] Cash Flow statement (2026-09-12). `/accounting/cash-flow` —
      `acc.cashFlowStatement()`/`acc.cashFlowTotals()` in
      `accounting.repo.ts`, the indirect method: net income for the period
      plus the period's change in every non-cash working-capital account
      (identified by `account_type IN ('asset','liability')` excluding
      `chart_of_accounts.is_bank_account`), reconciled against the real
      Cash-account balance change. `reconciles` is algebraically forced by
      the same double-entry identity `balanceSheetTotals` asserts — proven
      against the real fixture (`68900.00` beginning-plus-change equals the
      real Cash balance, both unfiltered and for the Feb-only period).
      Investing is always `0`: no fixed-asset or investment account category
      exists in this chart of accounts to populate it — a real, stated
      schema gap. Financing is no longer always empty: the fixture's
      opening-balance entry crediting Retained Earnings (2026-09-12; see the
      Statement of Changes in Equity item below) is a real financing-side
      posting, so `financing_cash_flow` is a genuine `20000.00` and the
      Financing Activities section renders a real row. Tests: 4 new cases in `accounting.test.ts` ("the cash
      flow statement"), including RLS as a refused plain employee, plus 1
      write-path positive control in `accounting.writes.test.ts` (folded
      into the existing one-sided-entry insert) proving `reconciles`
      actually goes `false`, not just `balanceSheetTotals`/
      `trialBalanceTotals`'s own checks. Also discovered and worked around
      a real postgres.js limitation while building this: a `tx.unsafe()`
      fragment with more than one bind parameter, embedded via `${...}`
      inside another tagged-template query, throws (`bind message
      supplies 0 parameters, but prepared statement requires 2`) rather
      than binding correctly — confirmed empirically with a throwaway
      script before it reached committed code, not shipped as a bug; the
      two functions duplicate their shared account-balances CTE inline
      instead. 1 new `smoke.spec.ts` row, 1 new nav entry. `./check` and
      the full e2e suite pass. US-ACC-040, FR-ACC-007.
- [x] Statement of Changes in Equity (2026-09-12). `/accounting/equity` —
      `acc.equityStatement()`/`acc.equityStatementTotals()` in
      `accounting.repo.ts`, a period roll-forward per active equity account
      (beginning balance, direct postings, ending balance), with net income
      shown as its own line rather than folded into an account's own
      changes — this codebase has no closing-entry process, so net income
      never actually reaches an equity account. `ending_equity_including_
      current_earnings` matches `balanceSheetTotals().total_equity` for the
      same date exactly, proven in a test. The fixture originally had
      nothing to show (Retained Earnings had zero posted activity), so as a
      2026-09-12 follow-up it gained a real opening-balance entry
      (`JE-2026-0000`, dated 2026-01-01: Debit Cash `20000.00` / Credit
      Retained Earnings `20000.00`, modeling FY2025 earnings carried into
      the new year) rather than leaving the report permanently over a zero
      subject (CLAUDE.md L50/L51) — unfiltered, `equityStatementTotals()`
      now shows `direct_changes` `20000.00` and `ending_equity` `20000.00`
      against real fixture data. A write-path positive control in
      `accounting.writes.test.ts` posts a second, incremental credit and
      uses `from` set to that posting's own date to isolate it from the
      fixture's opening balance, proving beginning/direct-changes/ending all
      move by exactly that increment. Unlike every other report in this
      module, active equity accounts are listed even at zero — proven with
      a real period query dated before any posting exists — the equity
      section is a small, fixed set of lines, not a large chart to filter
      down. Tests: 3 new cases in `accounting.test.ts` ("the statement of
      changes in equity"), including RLS as a refused plain employee. 1 new
      `smoke.spec.ts` row, 1 new nav entry. `./check` and the full e2e suite
      pass. §5.4.
- [x] Period comparison (MoM/YoY) on the Profit & Loss statement
      (2026-09-12). `acc.profitAndLossComparison()` in `accounting.repo.ts`
      computes the prior window's boundaries in SQL rather than in JS —
      Postgres's own date arithmetic handles month length and leap days.
      `previous_period` is an equal-length window immediately before `from`
      (not necessarily a calendar month: comparing Feb 2026's 28 days lands
      the prior window on Jan 4–31, not Jan 1–31 — an honest consequence of
      comparing by window length for an arbitrary `from`/`to`, not a
      month-picker); `previous_year` shifts both dates back exactly a year.
      Scoped to totals only (revenue/expenses/net income), not a per-account
      comparison — merging two periods' rows by account code where either
      side can be missing a row is materially more code for a report whose
      job is trend-watching at the totals level, per FR-ACC-007. `compare`
      requires both `from` and `to`; refused otherwise, with an e2e case in
      `form-errors.spec.ts`. Tests: 3 new cases in `accounting.test.ts`
      ("profit and loss period comparison"), including RLS as a refused
      plain employee. `./check` and the full e2e suite pass. US-ACC-041.
- [x] Period comparison extended to Cash Flow and the Statement of Changes
      in Equity (2026-09-13). `acc.cashFlowComparison()` doubles
      `cashFlowTotals()`'s own begin/end-balance pattern across two windows
      (four balance points per account instead of two), scoped to the
      operating/financing/net-change subtotals. `acc.equityComparison()`
      compares the period's own activity (`direct_changes`, `net_income`),
      not the cumulative `ending_equity` balances either window ends on —
      diffing those would mostly reflect elapsed time, not a change in the
      rate of equity activity. Both reuse the exact `compare` vocabulary and
      three guards (needs both dates; an off-list value gets its own
      message; `previous_year` refused for a period a year or longer) from
      the P&L, now factored into `$lib/server/accounting/period-compare.ts`
      instead of copied a third time — the P&L page was refactored to use
      the same module. Tests: 2 new cases each in `accounting.test.ts`
      ("cash flow period comparison", "equity statement period comparison"),
      including RLS as a refused plain employee, each cross-checked against
      `cashFlowTotals()`/`equityStatementTotals()` run independently over
      the same two windows. `./check` and the full e2e suite pass.
      US-ACC-041.
- [x] Period comparison on the trial balance and balance sheet. US-ACC-041
      (remainder, 2026-09-13). Both are cumulative "as of" reports, not
      periodic ones — comparison there means two independent `asOf` dates (a
      real, standard comparative-balance-sheet shape: "as of Dec 31 2025"
      next to "as of Dec 31 2026"), not `profitAndLossComparison()`'s
      "current window vs. a computed prior window", so this needed its own
      differently-shaped functions: `trialBalanceComparison()`/
      `trialBalanceComparisonTotals()` and `balanceSheetComparison()`/
      `balanceSheetComparisonTotals()`. Each date's own `sum(...) FILTER
      (WHERE ...)` is computed once and read multiple times downstream,
      rather than repeating the CASE expression itself. Found and fixed a
      real bug while writing the row-level test: an account with rows dated
      after one of the two `asOf` cutoffs (but before the other) summed to
      SQL NULL on that side, which silently made the `change` column NULL
      too rather than the true amount — fixed by `COALESCE`ing each side to
      0 before subtracting, an account that "hadn't started yet" as of the
      earlier date being a real zero, not an absence of data. Both trial
      balance and balance sheet pages gained a "Compare to" second date
      field and a comparison card, additive to the existing single-date
      view. Tested in `accounting.test.ts` against real fixture figures,
      including the same-date-both-sides identity check (a comparison
      against itself must reproduce the single-date report exactly) and
      finance-only RLS. `./check` and the full e2e suite pass.
- [ ] Department/location filtering on financial reports. US-ACC-044.
      Not a code gap: `journal_entry_lines` already carries both FKs, but
      every one of the fixture's 19 lines points at the same single
      department and location (confirmed via `psql`) — a filter would have
      nothing to exclude, which is the L50/L51 shape this session has spent
      real effort avoiding elsewhere. Needs fixture diversification first,
      the same kind of work as the equity opening-balance entry above,
      before this is worth building.

### Tier 4 — AR/AP reports and lifecycle completion

- [x] AR aging report (current/30/60/90+). US-ACC-016 (2026-09-13).
      `acc.arAging()` buckets open invoices (`amount_due > 0`, not
      draft/void) by `asOf - due_date`, defaulting a blank `asOf` to
      `CURRENT_DATE` — unlike the balance sheet's `asOf`, where blank means
      no upper bound, aging needs a real reference date to bucket against.
      `amount_due` is already `total - amount_paid`
      (`ck_invoices_amounts_reconcile`), so a partial payment ages by its
      remaining balance with no extra logic. Grouped by `(customer_id,
      currency)` and reads the invoice's own currency, never
      `base_amount_due` — a customer with invoices in two currencies is two
      rows, and there is no cross-customer total, since summing across
      currencies would violate BR-FP-003 (money is never converted for
      display). `/accounting/ar-aging`, gated `accounting.read`. Tests in
      `accounting.test.ts` ("AR aging") walk the same fixture invoices
      (shared `due_date`) through every bucket as `asOf` moves, every
      boundary break/revert-verified (30/31, 60/61, 90/91 days), and assert
      the five buckets sum to each row's total — plus draft-exclusion,
      own-currency, and finance-only RLS checks. `./check` and the full e2e
      suite pass.
- [x] AP "due soon" view (forward-looking, distinct from the existing
      overdue flag). US-ACC-024 (2026-09-13). `pay.apDueSoon()` lists
      approved, unpaid bills (`amount_due > 0`, not draft/void/cancelled)
      with `due_date` between a chosen `asOf` (blank defaults to
      `CURRENT_DATE`, same reasoning as `arAging()`'s) and `asOf +
      withinDays`. `withinDays` is a fixed `select` (7/14/30/60), not free
      text — the same "vocabulary lives in one place" choice as the status
      filters. A bill already past `asOf` is overdue, not due soon, so the
      lower bound excludes it — the feature's whole reason to exist,
      distinct from `is_overdue`. `/accounting/ap-due-soon`, gated
      `accounting.read`, flat list sorted soonest-first, no cross-vendor
      total (mirrors the invoices list's precedent — currencies are never
      summed, BR-FP-003). Tests in `payables.test.ts` ("AP due soon")
      break/revert-verify the window's upper boundary against the
      fixture's one qualifying bill, assert a draft bill in the same date
      range is excluded, and check finance-only RLS. `./check` and the
      full e2e suite pass.
- [x] Credit memos / refunds (AR) — reverses revenue, Dr Revenue / Cr AR.
      US-ACC-020 (first half, 2026-09-13). This is the reversing-entry
      mechanism §1.1 found didn't exist at all: a new `invoice_credits`
      table (one row per credit memo — a future bad-debt write-off adds a
      `credit_type` column here rather than a second, near-identical table,
      deferred rather than built ahead of need) and new
      `invoices.amount_credited`/`base_amount_credited` columns, with the
      `ck_invoices_amounts_reconcile` CHECK widened to
      `amount_due = total - amount_paid - amount_credited` rather than
      overloading `amount_paid` with a non-cash reduction (which would make
      "Amount Paid" a lie on every invoice it touched).
      `recomputeInvoiceTotals()` now sums `invoice_credits` the same way it
      already summed `payment_allocations`. `acc.recordCreditMemo()` posts
      one journal entry (Dr Revenue / Cr AR), refuses a credit larger than
      the invoice's own current balance (`over_credit`, distinct from
      `overpayment` since nothing was paid), and sets a new `credited`
      status only when the credit brings the balance to exactly zero — a
      partial credit leaves the existing status untouched. New UI on the
      invoice detail page (`/accounting/invoices/[id]`, "Issue a credit"),
      new audit action (`record_credit`), RLS/disclosure-matrix/scale
      classification entries matching every other accounting table. 7 new
      tests in `receivables.writes.test.ts` ("issuing a credit memo"), both
      guards break/revert-verified. One fixture credit memo (Britannia's
      INV-2026-002, `journal_entry_id` deliberately NULL — hand-authored
      like most of this invoice's own history, per
      `controlAccountTieOut()`'s doc comment, so it changes nothing about
      the GL-side figures every other report's tests assert against)
      rippled into `customerBalances()` gaining a `total_credited` column
      (so invoiced/paid/credited/due reconcile visibly) and several
      hardcoded test figures being recomputed from the real database, not
      hand-calculated. `./check` and the full e2e suite pass.
- [x] Bad-debt write-off — a separate entry, Dr Bad Debt Expense / Cr AR;
      does not require a credit memo. US-ACC-020 (second half, 2026-09-13).
      Added a Bad Debt Expense account (`5500`) to the fixture chart of
      accounts — the blocker the first half of this story stopped at — and
      a `credit_type` column on `invoice_credits` (plain `varchar`, no
      CHECK, vocabulary in `accounting.repo.ts`, same shape as
      `journal_entries.source_type`) rather than a second, near-identical
      table, exactly as `invoice_credits`' own migration comment predicted
      it would. `recordCreditMemo()` and the new `acc.recordWriteOff()` now
      both call a shared private `recordInvoiceCredit()` — numbering, the
      reversing entry, the over-amount guard and `recomputeInvoiceTotals`
      are identical between them; only the debited account, the number
      prefix (`CM-`/`WO-`) and the closing status differ. A new
      `written_off` invoice status (`critical` tone — a write-off is a
      recognised loss, not the "positive" outcome `credited` is), a new
      `over_writeoff` refusal distinct from `over_credit` so the write-off
      form's own field gets marked, a new `record_writeoff` audit action,
      and UI on the invoice detail page mirroring "Issue a credit"
      ("Write off" button and modal; the "Credits issued" list now labels
      each row by `credit_type`). `is_overdue` excludes `written_off`
      alongside `credited`, `draft` and `void` — a defense-in-depth
      addition caught in review, since `amount_due > 0` already made it
      unreachable today. 7 new tests in `receivables.writes.test.ts`
      ("writing off bad debt"), including one write-off and one credit
      memo against the SAME invoice to prove `invoice_credits` and
      `amount_credited` correctly sum both kinds, plus one more added to
      the existing "issuing a credit memo" block confirming a second
      credit against an already-fully-credited invoice is refused
      (`over_credit`) — a gap advisor review of 2.17 caught. The shared
      `recordInvoiceCredit()` guard body was already break/revert-verified
      by the credit-memo increment; what this increment added was the
      `recordWriteOff()` wrapper's own routing, verified by swapping its
      `overAmountReason` and `settledStatus` to the credit-memo values and
      watching the write-off-specific assertions fail on the wrong reason
      and the wrong status, respectively, before reverting both. One
      fixture write-off (Britannia's INV-2026-002, alongside its existing
      credit memo — 2,000.00 credit + 860.00 write-off = 2,860.00
      combined, due 16,000.00) rippled into the same handful of hardcoded
      test figures the first half's fixture credit already touched; it is
      a partial write-off, so no fixture invoice actually reaches
      `written_off` — the same fixture-homogeneity gap already on record
      for the credit-risk page's uniform `100.00` credit limit. `./check`
      and the full e2e suite pass.
- [x] Multi-invoice payment allocation (lockbox-style). US-ACC-018
      (2026-09-13). `acc.recordLockboxPayment()` at `/accounting/receive-payment`
      takes one `totalAmount` (the known deposit/check figure) and a set of
      per-invoice allocations, posting one journal entry — one Cash debit
      for the total, one AR credit per invoice — reusing `postJournal()`'s
      existing multi-line support rather than one entry per invoice. The
      allocations must sum to `totalAmount` exactly, checked in SQL/NUMERIC
      (`allocation_mismatch`), since two independently-entered figures
      agreeing is a rule no single `FormReader` field can express. Each
      invoice is checked in its own right — same customer as the payment
      (`wrong_customer`), not draft/void (`wrong_status`), no individual
      overpayment, no invoice named twice in the batch
      (`duplicate_invoice`) — and every invoice's `postJournal` currency
      must agree, since one entry carries one currency/exchange-rate pair.
      The eligible invoice set for the write action comes from a fresh
      server-side query, never from client-submitted field names — the
      same discipline `matchBankTransaction`'s doc comment already
      describes. Status/total recompute for each of the batch's own
      invoices is a bounded loop (exempted in
      `scripts/verify-no-loop-queries.mjs`, reusing the single trusted
      `recomputeInvoiceTotals()` rather than a second parallel
      implementation), the same shape already exempted for
      `invoice_lines`/`bill_lines`/`journal_entry_lines`. New audit
      register entry (`accounting/receive-payment::allocate`). Along the
      way, found and fixed a real bug — [L83](10-lessons-learned.md) — six
      `AccountingRefused` refusal handlers across the accounting module
      returned `{ message, field }` instead of `f.problem()`'s actual
      shape `{ message, errorFields }`, so the refused input never got its
      red border or `aria-invalid`, invisibly, since the alert message
      still rendered correctly either way. 8 new tests in
      `receivables.writes.test.ts` and a new `form-errors.spec.ts` case for
      the mismatch refusal.
- [x] Per-customer aggregate balance view (`listInvoices` currently has no
      customer grouping). US-ACC-019 (2026-09-13). `acc.customerBalances()`
      groups open invoices (`amount_due > 0`, not draft/void) by
      `(customer_id, currency)`, unlike `arAging()` with no `asOf` at
      all — this is a live "how much does this customer owe right now"
      figure for credit-risk review, not a point-in-time bucketed report,
      so there is no reference date to bucket against. Carries
      `invoice_count`, `total_invoiced`, `total_paid`, `total_due`, and the
      customer's own `credit_limit`; the page flags a balance that exceeds
      the limit via `compareDecimal` (never `Number()` on money) rather
      than a new SQL boolean, since the fixture only ever exercises the
      over-limit branch (every customer's limit is `100.00`, dwarfed by
      real balances) — the same fixture-homogeneity shape as the
      department/location gap below. `/accounting/customer-balances`,
      gated `accounting.read`. Tests in `accounting.test.ts` ("customer
      balances") assert `total_due = total_invoiced - total_paid` against
      real fixture figures (break/revert-verified), exclude a
      draft-only customer, and check finance-only RLS.

### Tier 5 — Manual journal entries and period close

- [x] Manual journal entry creation (adjustments, corrections), with the
      same balancing/period/permission checks as system-generated entries.
      US-ACC-034. (2026-09-13) — `recordManualJournalEntry()` layers over the
      existing `postJournal()` (the shared posting engine every invoice/bill
      write already goes through), resolving the picker's account IDs to the
      codes `postJournal` takes in one query, then delegating the
      balancing/period checks to it unchanged. `sourceType`/`sourceId` are
      `"manual"`/`null`, distinguishing it from an invoice/bill/payment
      posting in the ledger's own "Source" column. `/accounting/ledger`
      gained a "New entry" button (finance-write only) leading to
      `/accounting/journal-entries/new`; a posted entry cannot be edited or
      reversed yet (§1.3's reversing-entry gap remains open), so the page
      says so before submission. Audited as `post_journal_entry`. Each line
      requires exactly one of debit/credit, enforced both in the form
      (`f.reject` on a row with both or neither) and implicitly by
      `postJournal` itself (a zero/zero row would otherwise vanish silently
      before its own line-count check). Advisor review of this increment
      surfaced a real, newly-reachable edge case: `postJournal` rounds
      `base_debit_amount`/`base_credit_amount` PER LINE, so a sum of rounded
      values is not the same as rounding the sum — an entry can balance
      exactly in its native currency and still fail the base-currency check
      (confirmed: three lines of `0.05`/`0.02`/`0.03` at an exchange rate of
      `1.1` balance natively but not after rounding, `0.06` vs `0.05`).
      `issueInvoice`/`approveBill` never hit this because their lines come
      from computed totals; a manual entry is the first caller where a
      person types arbitrary native amounts against an arbitrary rate.
      `postJournal`'s balance check now reports the native and base sides as
      two distinct failures rather than one bare "does not balance", and the
      page surfaces the actual figures (`does_not_balance`'s `e.detail`) the
      same way `bills/[id]`/`invoices/[id]` already do — previously
      discarded here. Tested in `accounting.writes.test.ts` ("recording a
      manual journal entry", 5 cases) and end-to-end (`smoke.spec.ts`
      renders the page; `form-errors.spec.ts` covers under-two-lines, a
      debit+credit line, and a mismatched total).
- [x] Period close workflow (an actual action that writes
      `accounting_periods.status`, not just the existing "no posting into a
      non-open period" enforcement). US-ACC-035. (2026-09-13) — `/accounting/periods`
      (`acc.closePeriod()`/`acc.reopenPeriod()`) lists every period with a
      Close (open-only) and Reopen (closed-only) action, `accounting.write`-gated.
      Reason field is required and audited (`close_period`/`reopen_period`).
      Deliberately no checklist/outstanding-item gate before closing (§13's
      close-checklist gap is unchanged) — this is the status change alone.
- [x] Period reopen workflow requiring permission, reason, and audit — this
      is `INV-ACC-002`'s own stated requirement in `packages/spec-tests`,
      previously untested against real code because there was no real code
      to reopen a period with. §1.4, §13. (2026-09-13) — reopen is refused
      on anything but `closed`: an `open` period has nothing to reopen, and a
      `locked` period reaches that stronger state through a process this
      codebase doesn't build (no code writes `status = 'locked'` anywhere;
      the fixture's one locked row, December 2025, models a hypothetical
      future lock step) — reopening a lock without a real lock workflow to
      observe would mean guessing at its ceremony. `closed_by`/`closed_at`
      are cleared on reopen rather than left stale; the audit entry is the
      durable record that the period was ever closed. `@kaaj/authz` gains no
      new permission — `accounting.write` plus a mandatory reason plus audit
      matches how `voidInvoice`/`recordWriteOff` already work, per the reason
      this codebase already gives for not inventing narrower write
      permissions. Tested in `accounting.writes.test.ts` ("closing and
      reopening an accounting period", 6 cases, including a real close then
      reopen round-trip and refusing to reopen the fixture's locked period)
      and end-to-end (`smoke.spec.ts` renders the page; `form-errors.spec.ts`
      covers closing a non-open period, reopening with no reason, and
      reopening a non-closed period).
- [x] Year-end close (zero revenue/expense into retained earnings). §1.4.
      US-ACC-051. (2026-09-13) — `/accounting/year-end-close`
      (`acc.previewYearEndClose()`/`acc.yearEndClose()`) posts one journal
      entry per close: each revenue/expense account with a nonzero
      cumulative balance as of a chosen date is zeroed against itself, and
      the net result posts to Retained Earnings (`3000`, added to
      `ACCOUNTS` the same way `badDebtExpense` was for write-offs). Not
      gated on any period being closed first — no close-checklist gate
      exists yet (§13) — so this is just another `postJournal` caller,
      refused the normal way (`period_closed`) if `asOf` falls in an
      already-closed period; the page tells the user to post this BEFORE
      closing that period. Idempotent by construction, not a flag: the
      closing entry's own lines are posted activity too, so re-running with
      the same `asOf` finds every account back at zero and refuses
      (`no_lines`) rather than double-counting. The page previews exactly
      what would be zeroed (read-only) before a separate confirm posts it —
      closing the books is not something to discover only after clicking
      through. The preview and the post are two separate requests, so the
      confirm form carries the previewed net income as a hidden field and
      `yearEndClose` refuses (`allocation_mismatch`) if what it recomputes at
      post time no longer matches — the same shape as a lockbox batch's own
      `allocation_mismatch`, checked in SQL/NUMERIC rather than trusted from
      the page's own arithmetic. The check is on the bottom-line net income
      only, same level of rigor as the lockbox check on its total: it
      guarantees the net-income figure the user confirmed is exactly what
      posts to Retained Earnings, not that every individual revenue/expense
      line is unchanged — an offsetting pair posted in between (a revenue and
      an expense of the same size) leaves net income identical while
      changing which accounts get zeroed, and would close on a line the user
      never previewed. Figures verified independently via `psql` before writing any code or
      tests: net income `-56920.00` as of `2026-12-31` matches the
      already-trusted `balanceSheetComparisonTotals` figure exactly, and the
      per-account breakdown (revenue `4000` nets `42300.00`; expenses
      `5000`/`5100`/`5300` net `96500.00`/`900.00`/`1820.00`) sums to the
      same total. Tested in `accounting.writes.test.ts` ("year-end close",
      7 cases): the preview matches the verified figures; a real close posts
      the correct debit/credit on every line including Retained Earnings; a
      preview taken right after the close confirms the accounts really are
      back at zero, not just that the post claimed so; running it twice finds
      nothing left the second time; a stale/mismatched confirm is refused;
      posting into a closed period is refused; and finance-only RLS.
      Break/revert-verified both the debit/credit sign logic (flipping which
      account type triggers a debit vs. credit — the two amount-checking
      tests fail, one with `does_not_balance`, since flipping the rule
      unbalances the entry) and the mismatch guard itself (forcing the SQL
      comparison to always report no mismatch — the stale-preview test then
      fails with "expected a refusal ... and the write succeeded"). Advisor
      review caught the stale-preview gap; a decision that forward-dated
      `asOf` values are permitted (not refused) rather than a gap: the
      balance sheet, trial balance and P&L pages already report "as of" any
      date, past or future, purely from what's posted by that date — nothing
      in this codebase ties a report's `asOf` to wall-clock "today", and a
      guard doing so would have broken those pages' own existing, shipped
      behavior. Advisor also caught that the mismatch refusal dead-ends the
      page: SvelteKit's `use:enhance` only re-runs `load` on a SUCCESSFUL
      submit by default, so a refusal would otherwise leave the confirm form
      (and the table it's copied from) holding the very figures that were
      just refused, and resubmitting would repeat the same refusal forever —
      fixed by calling `invalidateAll()` in the form's own submit handler
      regardless of outcome. Verified by driving it through a real rendered
      page rather than reasoning about it: a DOM assertion on the stale
      field's value can't tell the two cases apart, since nothing in this
      read-only suite actually changes the real figure, so Svelte never
      rewrites the field either way — the reliable signal is on the wire,
      where a `__data.json` request follows a refusal only when `load`
      actually reran. With the fix reverted, that request doesn't happen and
      the test fails; with it restored, the test passes. `form-errors.spec.ts`
      covers nothing-to-close, period-closed, the stale-preview mismatch, and
      the re-fetch-on-refusal behavior.

### Tier 6 — Tax model fix and tax reporting

- [ ] A real accounting `tax_rates` table. US-ACC-046 (PARTIAL — table and FKs
      fixed; no configuration route yet). (2026-09-13) —
      `20260913223213_accounting_tax_rates.sql` adds `tax_rates`
      (tenant-scoped: code, tax_name, tax_type, rate, country/region/
      jurisdiction, is_reverse_charge, tax_collected_account_id/
      tax_paid_account_id, is_active, effective_from/to) and repoints all
      five accounting tax FKs (`invoice_lines.tax_rate_id`,
      `bill_lines.tax_rate_id`, `chart_of_accounts.tax_rate_id`,
      `journal_entry_lines.tax_rate_id`, `customers.tax_rate_id`) at it —
      confirmed via `pg_constraint.confrelid` after `db reset`, before the
      snapshot was regenerated, and guarded going forward by a new
      `verify-stories.sql` check (`US-ACC-046-fk`) that reads the same five
      constraints; it would have failed against the old FK target and passes
      now. The fixture's three sales-tax/VAT rows move out of
      `payroll_tax_rates` (which held them only because the FK forced them
      there) into `tax_rates`, keeping their ids and codes so every row that
      names them by id needed no change. `payroll_tax_rates` gets its first
      genuinely payroll row in return — a US federal income-tax bracket —
      since removing its only three rows would otherwise have emptied it and
      failed the tenant-isolation harness's "every table has fixture rows"
      check; `tax_type` has no income-tax value in its enum (every option is
      a consumption-tax concept), so that row uses `'none'` as the closest
      fit — a pre-existing payroll-side enum gap, not something this
      migration fixes. Two blanket backfills that predated this migration
      did not carry forward: `chart_of_accounts.tax_rate_id` had been set on
      all seventeen accounts regardless of type (now only the one revenue
      account real invoicing posts to, `4000`), and
      `journal_entry_lines.tax_rate_id` had been set on every line even
      though no posted line — in the fixture or in application code — ever
      carries a nonzero `tax_amount` to associate a rate with (now left NULL
      and added to `verify-fixture-coverage.mjs`'s `EXPECTED_SPARSE`, with
      that reason).

      A second commit adds the configuration route: `/accounting/tax-rates`
      (`tax_rates.repo.ts`) lists every rate and lets finance create one
      (code, name, type, rate, country/region/jurisdiction, reverse charge,
      effective date) and deactivate/reactivate it — `accounting.write`-gated,
      each action audited (`create`/`deactivate`/`activate`). A rate is never
      edited in place once created; a mistyped one is deactivated and
      replaced, the same reasoning a period's close/reopen uses rather than
      letting history be rewritten. Tested in `tax_rates.writes.test.ts` (6
      cases): create and read back the same figures, a duplicate code within
      the tenant is refused, deactivate/reactivate round-trips, a nonexistent
      id returns null rather than a silent success (break/revert-verified —
      hardcoding a fallback row made the "nonexistent id" test fail exactly
      as expected), and finance-only RLS (an auditor reads but cannot write;
      a plain employee sees nothing). `form-errors.spec.ts` covers a
      duplicate code and a missing effective date; `smoke.spec.ts` renders
      the page. Still marked partial: no editing of a rate's other fields,
      and invoices/bills still take a manually-typed tax amount rather than
      computing one from a configured rate — a real rate lookup on
      invoice/bill creation is a larger change than this route, deliberately
      out of scope here.
- [x] Tax-exempt customers + exemption expiry. US-ACC-050 (2026-09-13).
      `customers.tax_exempt_until` (nullable `DATE`) added; `createInvoice`
      and `issueInvoice` both refuse a taxed line for a customer exempt as of
      the invoice's own date, checked independently at posting time since a
      draft can outlive the exemption state it was created under. Still
      marked partial in the story itself: no UI to set the columns, and the
      invoice form doesn't surface a customer's exemption status up front.
- [x] Sales tax summary tied to real ledger totals. US-ACC-048, US-ACC-049
      (2026-09-13). `/accounting/tax-summary` groups output/input tax by
      jurisdiction, read from posted `journal_entry_lines`, not the
      subledger. Getting here required posting `tax_rate_id` onto the GL
      line in the first place — `issueInvoice`/`approveBill` now group
      taxed lines by rate before posting (one GL line per rate, not a lump
      sum), fed by a new optional per-line tax-rate picker on the
      invoice/bill create forms. Still open: no VAT-return-shaped export,
      and reverse charge (below) will post no line at all under the
      current zero-nets-out-of-the-entry rule.
- [ ] UK VAT reverse charge. US-ACC-047. **Deliberately deferred** (2026-09-13,
      user decision) — the product has no UK customers yet, and this is a
      real modeling change, not a follow-on to the tax-summary report just
      shipped: reverse charge means the vendor bills zero VAT, so the buyer
      self-assesses both sides (a credit as if collected, a debit as if
      reclaimed, for the same notional amount) and — the part that isn't
      free — that amount must be EXCLUDED from what's actually owed to the
      vendor, which `recomputeBillTotals` doesn't distinguish today. Revisit
      when UK customers are in scope.

### Tier 7 — Multi-currency completeness

- [x] Populate `exchange_rates` — daily-refreshable rate lookup for
      USD/CAD/GBP/EUR/INR against USD, from Yahoo Finance
      (`/accounting/exchange-rates`). US-ACC-052, US-ACC-036 (2026-09-14,
      both moved MISSING → PARTIAL — manual-trigger only, no scheduler;
      see their status blocks above). Settlement gain/loss, revaluation
      and reconciliation below still don't read this table — that's their
      own remaining work, not closed by this item.
- [x] Settlement FX gain/loss (2026-09-18). `recordPayment`/`recordVendorPayment`
      now look up the settlement-date rate (`exchange_rates.repo.ts`'s new
      `rateAsOf`) and realize the gain/loss against the settlement-date rate
      versus the invoice's/bill's own booking rate, via a shared
      `settlementFxDelta` helper in `accounting.repo.ts`. When there is a
      gain/loss to recognize, the entry posts in USD rather than the
      invoice's native currency: `postJournal` carries one currency/rate per
      entry, but a settlement inherently needs two (cash converts at the new
      rate, the receivable/payable clears at the old one), and the gain/loss
      line itself has no native-currency equivalent — the DB's
      `ck_journal_entry_lines_one_sided_positive` constraint requires every
      line to carry a nonzero native amount, which rules out a
      native-currency-zero "base-only" plug line. Falls back to today's
      booking-rate 2-line entry — never refusing the payment — when there is
      no rate on file for the settlement date, or the tenant's chart of
      accounts has no `4200` account (seeded for Northwind only; a new
      tenant needs it added before this recognizes anything). Reuses `4200`
      for both directions (debit for a loss, credit for a gain) rather than
      adding a separate loss account. `recordLockboxPayment` is NOT covered —
      the spec names only the two single-invoice/bill functions, and a
      lockbox batch can span invoices with different booking rates, which is
      real added complexity left for later. Tested in
      `receivables.writes.test.ts`/`payables.writes.test.ts` (gain, loss, and
      both fallbacks) against the real database. US-ACC-054. §3.2.
      Two known simplifications, not fixed here: `payments.exchange_rate`/
      `base_amount` still store the booking rate rather than the settlement
      rate (nothing reads them today, so this is inert, but a future reader
      of "how much USD hit the bank" would get the wrong answer from that
      column specifically — `payment_allocations.fx_gain_loss` and the
      journal are the correct source). And a `fx_gain_loss` of exactly `0`
      is indistinguishable from "no rate was on file for the settlement
      date" — `settlementFxDelta` logs the latter via `log.info`, but
      nothing surfaces it in the product; a CFO reading the allocations
      table later can't tell the two apart without checking the logs.
- [x] Period-end FX revaluation — report-only (2026-09-18).
      `/accounting/fx-revaluation` (`fx_revaluation.repo.ts`) shows
      unrealized gain/loss on every open foreign-currency invoice and bill
      as of a chosen date, comparing each one's own booking rate against the
      latest rate on file on or before that date. Deliberately posts
      nothing: a non-reversing adjustment would double-count against
      settlement FX gain/loss's own recognition (the item above) once the
      same invoice/bill actually settles, and this codebase has no
      reversing-entry mechanism (a `reverses_entry_id` link plus something
      to fire the reversal at next period open) to prevent that. Posting is
      a real, larger follow-on feature, not a rejected idea — this closes
      the user story as written ("see unrealized gains/losses") without
      answering the harder posting question wrongly. **Bank account
      balances are NOT included**, unlike invoices/bills: a `bank_account`
      has no stored per-account booking rate to revalue against (its GL
      cash account is shared across all bank accounts of that currency, and
      `current_balance` is a live native-currency figure with no
      base-currency baseline attached) — a defensible number here would need
      its own design, not a proxy borrowed from AR/AP's shape. US-ACC-053.
      §3.3. Also closes US-ACC-031's remaining gap (see its status block
      above) for invoices/bills — the two are the same underlying feature,
      not separate work; **bank-account reconciliation's revaluation half
      specifically remains open**, for the reason above.

### Tier 8 — Automation

- [ ] Recurring invoices/bills. US-ACC-004.
- [ ] Accruals (auto-reversing) and deferred revenue/prepaid expense
      amortization. §11 — flagged as a genuine specification gap, not just
      an implementation one; neither `module-accounting.md` nor
      `accounting-gap-analysis.md` names this as a known gap before now.
- [ ] Bank feed integration (Plaid/Yodlee). US-ACC-027.
- [x] Bank reconciliation rules (auto-categorization) (2026-09-19).
      US-ACC-029. See its status block above for the shape and scope.
- [x] Batch vendor payment runs (2026-09-19). US-ACC-025. See its status
      block above for the shape and scope.
- [ ] Automated payment reminders for overdue invoices. US-ACC-003 (PARTIAL
      as of 2026-09-20 — select-and-send exists on `/accounting/invoices`;
      a configured cadence/schedule does not. See its status block above).

### Tier 9 — New modules (largest effort, product decisions)

- [ ] Expense management. Schema is fully designed (`expenses` table:
      receipts, OCR fields, mileage, reimbursement workflow) with zero
      application code — confirmed no repo file, route, or app-level test
      references it. RLS on the table is already tested. US-ACC-009–014.
- [ ] Fixed assets & depreciation. §2.4.
- [ ] Inventory / COGS. §2.5.
- [ ] Budgeting (GL-account-level, distinct from the existing
      project/task `budget` field). §14.
- [ ] Multi-entity / consolidation. §3.4.
- [ ] Purchase orders & three-way match. US-ACC-021 (procurement half).

### Tier 10 — Polish

- [ ] PDF generation + company branding on invoices. US-ACC-001, US-ACC-008.
- [ ] Online payment links (Stripe/PayPal) on customer invoices — distinct
      from Kaaj's existing Stripe integration, which is wired only to its
      own SaaS subscription billing. US-ACC-002.
- [ ] Report export (Excel/PDF). US-ACC-045.
- [ ] Central document management for financial records. Gap #11 in
      `accounting-gap-analysis.md`.

---

## Appendices

### Glossary

- **Accrual Accounting**: Revenue recognized when earned, expenses when incurred
- **Cash Accounting**: Revenue/expenses recognized when cash changes hands
- **GL**: General Ledger
- **AR**: Accounts Receivable
- **AP**: Accounts Payable
- **COGS**: Cost of Goods Sold
- **FX**: Foreign Exchange
- **OCR**: Optical Character Recognition
- **VAT**: Value Added Tax
- **GST**: Goods and Services Tax
- **GAAP**: Generally Accepted Accounting Principles
- **IFRS**: International Financial Reporting Standards
- **MTD**: Making Tax Digital (UK)

### Document Change Log

| Version | Date | Author | Changes |
|---------|------|--------|---------|
| 2.0 | 2025-12-03 | Initial | Complete accounting module specification based on Xero features |
| 2.1 | 2026-09-11 | Claude Sonnet 5 | Annotated every User Story (US-ACC-001 to 055) with a DONE/PARTIAL/MISSING status against the actual schema, code, and tests, cross-referenced to [19-accounting-test-plan.md](19-accounting-test-plan.md). This section now describes reality as of that date; the "Testing Requirements" section (unit/integration/E2E coverage targets) and the Functional Requirements below it were not re-verified in this pass and may overstate what exists — e.g. FR-ACC-002 (Expense Management) and FR-ACC-007 (Financial Reporting) both read as live requirements but are 0% built per the User Stories annotations. |
| 2.2 | 2026-09-11 | Claude Sonnet 5 | Added the "Implementation Roadmap — Remaining Work" section: a priority-ordered, checkable punch list (10 tiers) of every MISSING/PARTIAL item from the v2.1 annotations, in the order we intend to build them. Update the checkboxes in place as items ship; note tier completion here rather than deleting the tier. This partly reconciles the v2.1 row's note about the Functional Requirements: FR-ACC-007 is now explicitly mapped (Tier 3) and FR-ACC-002's scope is covered (Tier 9) — the rest of the FRs below are still as-unverified as v2.1 left them. |
| 2.3 | 2026-09-12 | Claude Sonnet 5 | Shipped both Tier 1 items: invoice creation and bill entry UIs, each with real test coverage (see the roadmap checkboxes for the exact citations). US-ACC-021 moved MISSING → PARTIAL. Tier 1 is now complete. |
| 2.4 | 2026-09-12 | Claude Sonnet 5 | Shipped all three Tier 2 items: posted journal entry immutability (new migration + RLS predicate + positive-control test), `postJournal`'s zero/single-line guard, and a direct `does_not_balance` test. §1.1 and §1.3's immutability bullet in [19-accounting-test-plan.md](19-accounting-test-plan.md) updated; the top-of-document correction about immutability is now marked fixed rather than live. Tier 2 is now complete. |
| 2.5 | 2026-09-12 | Claude Sonnet 5 | Shipped Tier 3's first item: trial balance report + GL-control-account-to-subledger tie-out. Found two distinct, fully-explained drifts between the GL and the AR/AP subledgers in the fixture — one orphaned journal entry each (§1.5/§6 updated) — a data gap, not an application bug, confirmed by a separate test proving the write paths themselves add zero drift. Tier 3's remaining items (P&L, Balance Sheet, Cash Flow, Statement of Changes in Equity, period comparison) are unstarted. |
| 2.6 | 2026-09-12 | Claude Sonnet 5 | Shipped Tier 3's second item: a Profit & Loss statement (`/accounting/profit-loss`), periodic rather than cumulative, with net income summed independently in SQL rather than reduced from the per-account rows in JS (money strings don't add in JS). US-ACC-038 moved MISSING → PARTIAL. Balance Sheet, Cash Flow, Statement of Changes in Equity, and period comparison are still unstarted. |
| 2.7 | 2026-09-12 | Claude Sonnet 5 | Shipped Tier 3's third item: a Balance Sheet (`/accounting/balance-sheet`), cumulative as of a date. Since this codebase has no closing-entry process, `equity` alone doesn't tie to assets — the report folds the current period's net income back in as its own line, verified against the real fixture figures rather than assumed. US-ACC-039 moved MISSING → PARTIAL. Cash Flow, Statement of Changes in Equity, and period comparison are still unstarted. |
| 2.8 | 2026-09-12 | Claude Sonnet 5 | Shipped Tier 3's fourth item: a Cash Flow statement (`/accounting/cash-flow`), indirect method, reconciled against the real Cash-account balance. Investing/Financing sections are real but structurally near-empty — this chart of accounts has no fixed-asset/investment/loan account category, a stated schema gap. Found and worked around a real postgres.js limitation along the way (a multi-parameter `tx.unsafe()` fragment nested in another query throws rather than binding). US-ACC-040 moved MISSING → PARTIAL. Statement of Changes in Equity and period comparison are still unstarted — the last two items in Tier 3. |
| 2.9 | 2026-09-12 | Claude Sonnet 5 | Shipped Tier 3's fifth item: a Statement of Changes in Equity (`/accounting/equity`), a per-account period roll-forward with net income shown as its own unclosed line. The fixture has almost no real equity activity to show — Retained Earnings has never been posted to — so the only real proof of correctness is a write-path positive control, not a read-only assertion over the fixture as it stands. §5.4 addressed. Only period comparison (MoM/YoY) and department/location filtering remain in Tier 3. |
| 2.10 | 2026-09-12 | Claude Sonnet 5 | Closed the v2.9 gap directly: the Northwind fixture now carries a real opening-balance entry (`JE-2026-0000`, 2026-01-01, Debit Cash `20000.00` / Credit Retained Earnings `20000.00`, modeling FY2025 earnings carried into the new year), so the equity statement — and every other report whose totals include the equity term — now runs against genuine non-zero data instead of a permanently-zero subject. Rippled into every already-shipped report that sums account balances without an upper `to` bound: balance sheet (`equity` `0`→`20000.00`, `assets`/`total_liabilities_and_equity` `39061.53`→`59061.53`), cash flow (`financing_cash_flow` `0`→`20000.00`, `ending_cash` `48900.00`→`68900.00`), and trial balance's as-of-Jan-21 total. `net_income` is unchanged everywhere — the entry touches only Cash and Retained Earnings, never revenue or expense — which is the check that confirms the right pair of accounts was chosen. The existing write-path positive control in `accounting.writes.test.ts` now isolates its own $500 posting from the fixture's opening balance by querying with `from` set to the posting's own date, rather than relying on the fixture carrying zero equity activity of its own. All hardcoded figures in `accounting.test.ts`, [19-accounting-test-plan.md](19-accounting-test-plan.md), and this document's own Tier 3 roadmap checklist bullets above were recomputed from the running database, not hand-calculated — the v2.7–2.9 changelog rows above are historical and were deliberately left as-is. |
| 2.11 | 2026-09-12 | Claude Sonnet 5 | Shipped period comparison (US-ACC-041) on the Profit & Loss statement — `acc.profitAndLossComparison()` computes the prior comparison window's dates in SQL (Postgres date arithmetic, not JS), for `previous_period` (an equal-length trailing window, not a calendar month) or `previous_year`. Scoped to totals, not per-account, and to P&L only — the other four Tier 3 reports and department/location filtering (US-ACC-044) remain unstarted; the latter is blocked on fixture diversification, since every posted line in the fixture shares one department and one location today. Tier 3 is now fully addressed except for that remainder. |
| 2.12 | 2026-09-13 | Claude Sonnet 5 | Extended period comparison to Cash Flow and the Statement of Changes in Equity, closing the "P&L only" gap v2.11 left open. `acc.cashFlowComparison()` and `acc.equityComparison()` reuse the same prior-window SQL shape as the P&L, each cross-checked in tests against `cashFlowTotals()`/`equityStatementTotals()` run independently over the identical two windows. The `compare` vocabulary and its three guards (needs both dates; an unrecognized value gets its own message; `previous_year` refused when the period is a year or longer) were factored out of the P&L page into `$lib/server/accounting/period-compare.ts` rather than copied a third time, and the P&L page itself refactored onto it. Trial balance and balance sheet remain without comparison — both are cumulative "as of" reports, so a comparison there is a differently-shaped feature (two `asOf` columns, not two windows), not an extension of this one. Department/location filtering (US-ACC-044) remains blocked on fixture diversification. |
| 2.13 | 2026-09-13 | Claude Sonnet 5 | Opened Tier 4 (Tier 3's remainder — trial balance/balance sheet comparison and department/location filtering — is still open, per v2.12): shipped an AR aging report (`/accounting/ar-aging`, `acc.arAging()`), US-ACC-016. Buckets open invoices by days past due as of a chosen date (blank defaults to `CURRENT_DATE`, deliberately unlike the balance sheet's open-ended blank `asOf`); reads each invoice's own currency rather than `base_amount_due` and shows no cross-customer total, since summing across currencies would violate BR-FP-003. Tests walk the same fixture invoices through every bucket as `asOf` moves, assert the five buckets sum to the total at each date, and the bucket boundaries are break/revert-verified. Five items remain in Tier 4: AP "due soon", credit memos/refunds, bad-debt write-off, multi-invoice payment allocation, and a per-customer aggregate balance view. |
| 2.14 | 2026-09-13 | Claude Sonnet 5 | Shipped Tier 4's second item: an AP "due soon" view (`/accounting/ap-due-soon`, `pay.apDueSoon()`), US-ACC-024 — bills due within a chosen window, forward-looking and distinct from the existing `is_overdue` flag. Mirrors `arAging()`'s `asOf` default (blank → `CURRENT_DATE`) and the invoices list's no-cross-currency-total precedent. `withinDays` is a fixed select (7/14/30/60) rather than free text. Four items remain in Tier 4: credit memos/refunds, bad-debt write-off, multi-invoice payment allocation, and a per-customer aggregate balance view. |
| 2.15 | 2026-09-13 | Claude Sonnet 5 | Shipped Tier 4's third item: a per-customer aggregate balance view (`/accounting/customer-balances`, `acc.customerBalances()`), US-ACC-019 — invoice count, invoiced/paid/due totals and credit limit per customer, for credit-risk review. Unlike every other report shipped this week, it takes no `asOf`: a live balance has no reference date to bucket against. The over-limit flag is a page-level `compareDecimal` comparison, not new SQL, since the fixture's uniform `100.00` credit limit only ever exercises the over-limit branch — noted rather than hidden, the same fixture-homogeneity shape already on record for department/location filtering. Three items remain in Tier 4: credit memos/refunds, bad-debt write-off, and multi-invoice payment allocation — the next two share a reversing-entry mechanism that doesn't exist yet and will be designed as their own increment. |
| 2.16 | 2026-09-13 | Claude Sonnet 5 | Shipped Tier 4's fourth item: multi-invoice payment allocation (`/accounting/receive-payment`, `acc.recordLockboxPayment()`), US-ACC-018 — one payment posted across several of a customer's open invoices in one journal entry, refusing when the allocations don't sum to the stated total (checked in SQL/NUMERIC, not trusted from the page). Found and fixed a real, six-file bug along the way: every `AccountingRefused` refusal handler in the accounting module returned `{ message, field }` instead of `f.problem()`'s actual `{ message, errorFields }` shape, so a refused input's red border and `aria-invalid` silently never applied — [L83](10-lessons-learned.md). Two items remain in Tier 4: credit memos/refunds and bad-debt write-off, which share a reversing-entry mechanism that doesn't exist yet and will be designed as their own increment before either ships. |
| 2.17 | 2026-09-13 | Claude Sonnet 5 | Shipped Tier 4's fifth item, and the first genuine schema migration this whole roadmap effort: credit memos (US-ACC-020, first half). New `invoice_credits` table and `invoices.amount_credited`/`base_amount_credited` columns, with `ck_invoices_amounts_reconcile` widened rather than overloading `amount_paid` with a non-cash reduction — the same correct-looking-number-in-the-wrong-column failure shape this codebase's security section warns about. `acc.recordCreditMemo()` posts one journal entry (Dr Revenue / Cr AR) and introduces a `credited` invoice status, set only when a credit brings the balance to exactly zero. Scoped deliberately to credit memos alone: bad-debt write-off (US-ACC-020's second half) is deferred because `chart_of_accounts` has no Bad Debt Expense account yet, and discovering that mid-migration would have been the expensive order. One fixture credit memo rippled into `customerBalances()` gaining a `total_credited` column and several hardcoded test figures across `accounting.test.ts` and `payables.test.ts` being recomputed from the real database — the latter also exposed and fixed a pre-existing, unrelated fragility in the AP-due-soon tests (`CURRENT_DATE + 10` in the fixture meeting a hardcoded calendar date in the test, broken by nothing more than a `supabase db reset` on a different day). |
| 2.18 | 2026-09-13 | Claude Sonnet 5 | Shipped Tier 4's sixth and final item: bad-debt write-off (US-ACC-020, second half), closing out the whole tier. Added the missing Bad Debt Expense account (`5500`) to the fixture chart of accounts, and a `credit_type` column to `invoice_credits` (plain `varchar`, no CHECK, same shape as `journal_entries.source_type`) rather than a second table — exactly what the credit-memo migration's own comment predicted. `recordCreditMemo()` and the new `acc.recordWriteOff()` both call a shared private `recordInvoiceCredit()`; only the debited account, the number prefix, and the closing status (`credited` vs. `written_off`) differ between them. New `written_off` invoice status (`critical` tone, distinct from `credited`'s `positive` — a write-off is a recognised loss, not a customer-facing adjustment), a new `over_writeoff` refusal so the write-off form's own field is the one marked, and matching UI/audit-register entries. Advisor review of the credit-memo increment (2.17) also caught two things fixed here: `is_overdue` now excludes `written_off` alongside `credited` (defense-in-depth — `amount_due > 0` already made it unreachable), and a new test confirms a second credit against an already-fully-credited invoice is refused as `over_credit`. One fixture write-off, on the same Britannia invoice as the existing credit memo (2,000.00 + 860.00 = 2,860.00 combined, due 16,000.00), rippled into the same small set of hardcoded test figures the first half already touched. `./check` and the full e2e suite pass. |
| 2.19 | 2026-09-13 | Claude Sonnet 5 | Closed out Tier 3's remainder: period comparison on the trial balance and balance sheet (US-ACC-041). New `trialBalanceComparison()`/`trialBalanceComparisonTotals()` and `balanceSheetComparison()`/`balanceSheetComparisonTotals()` — a genuinely different shape from the periodic P&L/cash-flow/equity comparisons already shipped, since a cumulative "as of" report compares two independent dates directly rather than a computed prior window. Found and fixed a real bug writing the row-level test: an account with no activity as of one of the two dates summed to SQL NULL there, which silently made the `change` column NULL instead of the true amount — fixed by `COALESCE`ing each side to 0 before subtracting. Both pages gained a "Compare to" date field and an additive comparison card; `compare_as_of` is deliberately allowed on either side of `as_of` (a snapshot pair, not a range), and a `compare_as_of` with no `as_of` is refused with its own 400, covered in `form-errors.spec.ts`, with both new comparison views exercised end-to-end in `smoke.spec.ts`. Department/location filtering (US-ACC-044, the tier's other remaining item) stays deferred: still blocked on fixture diversification, not a code gap. `./check` and the full e2e suite pass. |
| 2.20 | 2026-09-13 | Claude Sonnet 5 | Opened Tier 5 (manual journal entries and period close): shipped manual journal entry creation (US-ACC-034), the tier's first of four items. `recordManualJournalEntry()` is a thin layer over the existing `postJournal()` — the same posting engine every invoice/bill write already shares — so the balancing and period-closed checks are exercised, not reimplemented. `/accounting/ledger` gained a "New entry" button (finance-write only) to `/accounting/journal-entries/new`. No reversal or draft path exists yet, so the page states up front that a posted entry cannot be edited — §1.3's reversing-entry gap is unchanged by this increment. Advisor review found a real edge case new to this caller: per-line rounding to base currency can make an entry balance natively but not after conversion (a manual entry is the first caller with both free-form amounts and a free-form rate); `postJournal`'s `does_not_balance` refusal now distinguishes the two, and the page surfaces the real figures instead of a bare "does not balance". Period close, period reopen (`INV-ACC-002`), and year-end close remain in Tier 5, planned as two further commits (close+reopen together, since reopen is untestable without close; year-end close separately, since it is the only one of the three that itself posts a journal entry). |
| 2.21 | 2026-09-13 | Claude Sonnet 5 | Shipped Tier 5's second and third items together: period close and reopen (US-ACC-035, `INV-ACC-002`). New `/accounting/periods` lists every period with a Close (open→closed) and Reopen (closed→open, reason required) action, both `accounting.write`-gated and audited — before this, nothing in the application wrote `accounting_periods.status` at all; the only closed/locked periods were hand-written fixture rows. Reopen deliberately refuses a `locked` period: nothing in this codebase writes that status either (the fixture's one locked row models a hypothetical future lock step), so reopening one would mean inventing a ceremony with no real lock workflow to observe it against. No new `@kaaj/authz` permission — `accounting.write` plus a mandatory reason plus an audit entry, the same shape `voidInvoice`/`recordWriteOff` already use. Advisor review caught two things fixed here: `closePeriod`/`reopenPeriod`'s `UPDATE` now checks `RETURNING id` and refuses on an empty result, since the SELECT that precedes it only proves the row is READABLE, not writable — `accounting_update`'s RESTRICTIVE policy is a separate check an auditor (reads everything, writes nothing) passes the first and fails the second of, break/revert-verified with a dedicated test; and `closed_at` is returned as the `Date` postgres.js already gives it rather than cast to `::text`, since `instant()`'s parse of Postgres's own text form isn't guaranteed portable (L36). Year-end close remains, the tier's last item. |
| 2.22 | 2026-09-13 | Claude Sonnet 5 | Closed out Tier 5 with its last item: year-end close (US-ACC-051). `/accounting/year-end-close` zeroes every revenue/expense account's cumulative balance as of a chosen date into Retained Earnings (`3000`) in one journal entry, previewing exactly what would be zeroed before a separate confirm posts it. Idempotent by construction — the closing entry's own lines are posted activity too, so a second run at the same date finds nothing left. Not gated on a period being closed first (no close-checklist gate exists, §13); refused the normal way if the date falls in an already-closed period, same as any other `postJournal` caller. Advisor review caught two things. First: the preview and the post are two separate requests with nothing tying them together, so anything posted in between would close on unconfirmed figures — fixed by carrying the previewed net income as a hidden field and refusing (`allocation_mismatch`) if the recomputed figure no longer matches, checked in SQL/NUMERIC the same way a lockbox batch's own total is. Second, on a follow-up review of that fix: the mismatch refusal dead-ended the page, since `use:enhance` only re-runs `load` on success by default, leaving the confirm form stuck on the very figures just refused — fixed with an explicit `invalidateAll()` in the form's submit handler, verified on the wire (a `__data.json` request follows the refusal only with the fix present, since a DOM assertion on the stale field can't distinguish the two cases here). Every figure was verified against the real database via `psql` before being wired into code, and the debit/credit sign logic and both fixes above were break/revert-verified. Tier 5 (manual journal entries, period close/reopen, year-end close) is now fully shipped. |
| 2.23 | 2026-09-13 | Claude Sonnet 5 | Opened Tier 6 (tax model): fixed the FK model behind US-ACC-046 — a schema-only increment, UI deferred to a follow-up per advisor's explicit recommendation. Every accounting tax FK (`invoice_lines`, `bill_lines`, `chart_of_accounts`, `journal_entry_lines`, `customers`) pointed at `payroll_tax_rates(id)`, a payroll income-tax table, not a sales-tax jurisdiction table. `20260913223213_accounting_tax_rates.sql` adds a real `tax_rates` table and repoints all five, confirmed by reading `pg_constraint.confrelid` after `db reset` before the snapshot was regenerated. Advisor's review caught that the one automated check named after this story (`verify-stories.sql`'s `US-ACC-046`) asserted a fact that was equally true before and after the fix (a sales-tax row exists somewhere) and never actually tested the FK target — added `US-ACC-046-fk`, which reads the five constraints directly and would have failed against the old target. The fixture's three sales-tax/VAT rows move out of `payroll_tax_rates` (which held them only because the FK forced them there) into `tax_rates`, same ids and codes so nothing else needed to change; `payroll_tax_rates` gets its first genuinely payroll row in return, a US federal bracket, since emptying it would have failed the tenant-isolation harness's fixture-row check. Two blanket backfills that predated this migration — every chart-of-accounts row tagged with the same sales-tax rate regardless of type, and every journal-entry line tagged with one despite no posted line ever carrying tax — did not carry forward; scoped to the one revenue account real invoicing uses, and to `EXPECTED_SPARSE` with the honest reason, respectively. `US-ACC-046`/`US-ACC-050`'s status blocks updated to PARTIAL. While correcting the specification check count for this change, found the `./check` step labels for specification, tenant isolation, tables-classified-by-scale and structure-snapshot line count were already stale independent of this work; corrected all four to their current measured values in `CLAUDE.md` and `check`. |
| 2.24 | 2026-09-13 | Claude Sonnet 5 | Closed the remaining gap in US-ACC-046 (2.23's schema fix): `/accounting/tax-rates` lets finance create a sales tax / VAT rate and deactivate/reactivate one — `tax_rates.repo.ts`, `accounting.write`-gated, each action audited. A rate is never edited in place once created, only deactivated and replaced — the same reasoning a period's close/reopen uses. `tax_rates.writes.test.ts` (6 cases) covers create-and-read-back, a duplicate code within the tenant refused by the unique constraint, deactivate/reactivate, a nonexistent id returning null rather than a silent success (break/revert-verified), and finance-only RLS. Building this route surfaced two more `./check` registries the schema commit hadn't touched: `verify-constraint-registry.mjs`'s `FORM_WRITTEN` list didn't include `tax_rates`, so its registered UNIQUE-constraint message was invisible to the checker (reported as "registered constraint does not exist"); once added, the table's two account-link FKs and its rate CHECK also needed `CANNOT_BE_TRIPPED` entries, since the create form never sets those columns and `FormReader` already refuses a negative rate before the DB is reached. Still partial: no editing of a rate's other fields, and invoices/bills still take a manually-typed tax amount rather than computing one from a configured rate. |
| 2.25 | 2026-09-13 | Claude Sonnet 5 | Shipped Tier 6's second item: tax-exempt customers with exemption expiry (US-ACC-050). New nullable `customers.tax_exempt_until` DATE (`20260913230000_customer_tax_exempt_until.sql`; `NULL` means indefinite). Enforced in two places on purpose, not one: `createInvoice` refuses a taxed line for a customer exempt as of the invoice's own date (never "today" — an exemption that has since expired doesn't retroactively apply, and one starting later doesn't apply early), and `issueInvoice` repeats the same check independently against the invoice's stored date and its own fresh read of the customer row. Advisor's review is the reason the second check exists at all: `createInvoice` only guards the draft, but `issueInvoice` is the step that actually posts `tax_total` to the ledger, and a draft can be created before an exemption is set, edited afterward, or issued after the exemption has since expired — none of which the first check would see. A repo-level test constructs exactly that gap (create a normal invoice, then update the customer to exempt before issuing) and the guard was break/revert-verified against it: disabling the `issueInvoice` check made the write silently succeed. Advisor also flagged that the pre-existing `verify-stories.sql` check for this story was vacuous — true before and after the fix, since it only asserted a zero-tax invoice existed for an exempt customer, never that an expiry was involved — replaced it with one asserting `tax_exempt_until IS NOT NULL` and the invoice's own date falls inside the window, which fails against the pre-migration schema. HELIOS, the fixture's one exempt customer, now carries `tax_exempt_until = 2026-12-31`, chosen to keep its existing invoice (dated 2026-01-21) validly exempt. Still partial: no UI to set either column — same posture as `chart_of_accounts.tax_rate_id` (US-ACC-046) — and the invoice form's customer picker doesn't surface a customer's exemption status before a line is typed. `./check` and the full e2e suite (110, single-worker) pass. |
| 2.26 | 2026-09-13 | Claude Sonnet 5 | Shipped Tier 6's third item: a sales tax liability summary by jurisdiction (US-ACC-048, US-ACC-049), read from the real posted GL rather than the invoice/bill subledger. Advisor's review shaped this one before any code was written: the naive version (report from `journal_entry_lines` accounts `"2200"`/`"1200"` as they already existed) would have rendered an empty output-tax column forever, since nothing in application code had ever written `tax_rate_id` onto a posted GL line — the column existed (retargeted to `tax_rates` in 2.23) but was permanently unwritten, the same vacuous-report shape already flagged twice this tier. Closing that required going one layer deeper than the report itself: a new optional "Tax rate" `<select>` on the invoice/bill create forms (populated from active `tax_rates`, a reference only — the tax amount is still typed in directly, not computed from the rate, which stays the same deferred gap 2.24 documented) feeds `invoice_lines.tax_rate_id`/`bill_lines.tax_rate_id`; `issueInvoice`/`approveBill` then group taxed lines by rate and post one GL tax line per group instead of a single lump sum, so an invoice or bill mixing rates attributes each rate's tax correctly rather than collapsing them — break/revert-verified by reverting the grouping to a lump sum and watching the multi-rate test fail. `taxLiabilitySummary()` nets output minus input per rate for an optional period, with tax posted under no rate as its own explicit, labelled row rather than silently merged into a real jurisdiction. Advisor caught two more things: first, that proving this needed a genuinely non-synthetic row, not just rollback-posted test data — resolved by a single targeted, amount-preserving `UPDATE` tagging the fixture's one already-real posted tax line (`BILL-AWS-2026-01`'s recoverable input tax) with the rate its own `bill_lines` row already carried, rather than retrofitting any invoice into the fragile AR/AP control-account tie-out numbers several other tests quote verbatim; asserted directly against the committed fixture, not just synthetic postings. Second, a red herring caught by re-verification rather than trust: an ad hoc `psql` check without the report's own `COALESCE` appeared to show a `NULL` where `"0"` was expected, which would have meant `money(null, ...)` rendering blank on the page — calling the actual repo function (which does have the `COALESCE`) confirmed it correctly returns `"0"`, not `NULL`, and a new test pins that exact string against the real fixture row so a future edit that drops the `COALESCE` fails loudly. `EXPECTED_SPARSE`'s `journal_entry_lines.tax_rate_id` entry — accurate as of 2.23, when nothing wrote the column — is removed now that it's genuinely populated. Two honest gaps remain, documented rather than silently absent: no VAT-return-shaped export (a filing's box/line format), and UK reverse charge (US-ACC-047, the tier's last item) will post no GL line at all under `postJournal`'s existing zero-nets-out-of-the-entry rule, since a reverse-charge rate's output and input are designed to cancel — noted, not designed around, in this increment. `./check` (24/24) and the full e2e suite (114, single-worker) pass. |
| 2.27 | 2026-09-13 | Claude Sonnet 5 | Closed out Tier 6, minus one deliberately deferred item. Asked to assess UK VAT reverse charge (US-ACC-047, the tier's last checklist item) before building it: it is not a follow-on to 2.26's tax-summary work but a real modeling change — the vendor's invoice carries zero VAT under reverse charge, so the buyer must self-assess both an output and input side for the same notional amount, and that amount has to be excluded from what is actually owed to the vendor, which `recomputeBillTotals` does not distinguish from ordinary vendor-charged tax today. Given no UK customers exist yet, the user chose to defer rather than build it speculatively. Documentation-only change: US-ACC-047's status block and Tier 6's checklist bullet now record the deferral and the reason, rather than leaving it as a silent open checkbox indistinguishable from "not yet gotten to." No code changed. |
| 2.28 | 2026-09-14 | Claude Sonnet 5 | Opened Tier 7 (US-ACC-052, US-ACC-036, first item): `/accounting/exchange-rates` refreshes USD/CAD/GBP/EUR/INR against USD from Yahoo Finance's public (unofficial, unversioned, no API key) chart endpoint and upserts `exchange_rates` — global reference data with no `tenant_id`, so the write goes through the service role rather than the tenant-scoped connection, and idempotently per calendar day via the table's own `(from_currency, to_currency, rate_date, source)` unique index. Stored inverted from Yahoo's own quote direction (Yahoo gives USD-per-unit-of-currency; `invoices.exchange_rate`/`bills.exchange_rate` multiply the other way), confirmed against the fixture's own pre-existing hand-authored GBP/EUR rows before writing any code. Deliberately scoped down from the full story per advisor's review: refresh is a manual-trigger button (`accounting.write`-gated, audited) rather than a system/cron endpoint — a shared-secret-protected scheduler would have been the least verifiable thing to add this round, and there is no way to test that a scheduler this repo doesn't control actually fires daily. Wiring a real daily trigger onto this action is an ops step, left undone on purpose; both stories stay PARTIAL, not DONE, for exactly that reason. One currency's Yahoo failure doesn't fail the others — each is fetched and written independently — and a total failure (all four down) surfaces as its own 502, now covered by a dedicated test after advisor's review flagged that path as unexercised. Along the way, found and fixed a real, unrelated, cross-cutting bug via direct PostgREST calls (not assumed): `service_role` has `BYPASSRLS` but had never once been GRANTed SELECT/INSERT/UPDATE on any table — RLS bypass and table grants are separate Postgres layers, and nothing in any prior migration touched the second one. This silently broke every existing service-role write path, not just the new one — including the production Contact Us form, which had been discarding every submission. Surfaced to the user before proceeding broadly; fixed per their explicit direction with a new migration (`20260914090000_service_role_table_grants.sql`, mirroring `app_user`'s own `GRANT`/`ALTER DEFAULT PRIVILEGES` pattern, minus DELETE) and a new, break/revert-verified `./check` step that queries `has_table_privilege('service_role', ...)` directly against the live database rather than trusting that a file being on `verify-service-role.mjs`'s import allowlist means it can actually write ([L84](10-lessons-learned.md)). `DatabaseDefinitions.ts` — stale since the original SaaS-starter template and covering only 3 of the schema's ~98 tables — was regenerated in full so `.from("exchange_rates")` would typecheck; only 5 low-risk generic-parameter call sites import it. `./check` (24/24) and the full e2e suite (115, single-worker) pass; the feature was also verified live in a real browser against the real Yahoo endpoint before the database was reset back to a clean fixture state. |
| 2.29 | 2026-09-18 | Claude Sonnet 5 | Closed out Tier 7's remaining two items, in two commits. First, settlement FX gain/loss (US-ACC-054): `recordPayment`/`recordVendorPayment` now look up the settlement-date rate and realize the gain/loss against the invoice's/bill's booking rate — see the Tier 7 entry above for the shape, including why the recognizing entry posts in USD (`ck_journal_entry_lines_one_sided_positive` rules out a native-currency-zero plug line, discovered only after an initial `JournalLine` base-amount-override design failed against the live database) and its two documented simplifications. Second, period-end FX revaluation (US-ACC-053), scoped to report-only after the user chose between that and a full posting-with-reversal feature: a non-reversing adjustment would double-count against the settlement recognition just shipped, and this codebase has no reversing-entry mechanism — `/accounting/fx-revaluation` answers the user story as literally written ("I want to see") without answering the harder posting question wrongly. Bank-account balances are excluded from the report by design, not oversight (no per-account booking rate to revalue against). A cross-test race surfaced along the way: temporary `exchange_rates` rows inserted through a raw superuser connection (`app_user` has no write policy on that table) commit outside any rolled-back transaction, so two tests mutating the same currency's rate history could interfere under concurrent test execution — fixed by giving each fabricated-rate test its own currency (GBP stays read-only, relying on the fixture's real history). Tested in `receivables.writes.test.ts`/`payables.writes.test.ts` (gain, loss, both fallbacks) and a new `fx_revaluation.test.ts` (a real gain, the no-rate-on-file case, a bill's opposite-direction loss, and that no USD document ever appears), all against the real database; a new `smoke.spec.ts` row and a live browser check confirm the report page itself. `./check` (25/25) passes. Tier 7 is now fully checked off, with two remainders carried forward explicitly rather than silently: settlement FX's two simplifications, and revaluation's bank-account exclusion and deferred posting/reversal. |

### References

- [Xero.com Feature Overview](https://www.xero.com/us/accounting-software/all-features/)
- [Product Specification](./product-specification.md)
- [Technical Architecture](./architecture-technical.md)
- [Firm Profile Module](./module-firm-profile.md)
- [HR Module](./module-hr.md)

---

**Document Owner**: Product Management
**Review Cycle**: Quarterly
**Next Review Date**: 2026-12-11 (last review 2026-09-11; the prior date of
2026-03-03 had lapsed unnoticed — six months stale — same class of drift
this update is trying to close)

---

*This comprehensive specification provides the foundation for building a world-class accounting module that competes with leading cloud accounting platforms while maintaining seamless integration with the broader business management platform.*
