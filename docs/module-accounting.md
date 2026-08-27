# Module Specification: Accounting (Multi-Tenant & i18n)

**Version:** 2.0
**Last Updated:** December 3, 2025
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
- Support 160+ currencies (ISO 4217 codes)
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
- Australia/NZ: GST
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

### Invoice Management

**US-ACC-001**: As a Business Owner, I want to create professional invoices with my company branding, so that I can bill customers quickly and maintain brand consistency.

**US-ACC-002**: As an Accountant, I want to send invoices with online payment links (Stripe, PayPal), so that customers can pay immediately and improve cash flow.

**US-ACC-003**: As a Sales Manager, I want to set up automated payment reminders for overdue invoices, so that I reduce manual follow-up work.

**US-ACC-004**: As a Business Owner, I want to create recurring invoices for subscription customers, so that billing is automated.

**US-ACC-005**: As a Freelancer, I want to invoice in multiple currencies, so that I can bill international clients in their local currency.

**US-ACC-006**: As an Accountant, I want to track invoice status (draft, sent, viewed, paid, overdue), so that I know which invoices need attention.

**US-ACC-007**: As a Business Owner, I want to add tracking categories to invoices (by region, product, campaign), so that I can analyze revenue by segment.

**US-ACC-008**: As a Customer, I want to receive a professional PDF invoice by email, so that I have documentation for my records.

### Expense Management

**US-ACC-009**: As an Employee, I want to snap a photo of receipts with my mobile phone, so that I can capture expenses on the go.

**US-ACC-010**: As an Accountant, I want expenses to be automatically categorized using OCR and AI, so that I reduce manual data entry.

**US-ACC-011**: As a Finance Manager, I want to track spending patterns by category and vendor, so that I can identify cost-saving opportunities.

**US-ACC-012**: As an Employee, I want to submit expense claims for reimbursement, so that I'm reimbursed for business expenses.

**US-ACC-013**: As a Manager, I want to approve or reject expense claims, so that spending is controlled.

**US-ACC-014**: As an Accountant, I want expenses to sync automatically to the general ledger, so that financial reports are accurate.

### Accounts Receivable (AR)

**US-ACC-015**: As an Accountant, I want to track all customer invoices and payments in one place, so that AR is organized.

**US-ACC-016**: As a Finance Manager, I want to see an aging report showing overdue invoices, so that I can follow up on collections.

**US-ACC-017**: As a Business Owner, I want to forecast short-term cash flow (30-day projection), so that I can plan for cash needs.

**US-ACC-018**: As an Accountant, I want to apply customer payments to multiple invoices, so that accounts are accurate.

**US-ACC-019**: As a Business Owner, I want to see which customers owe money and how much, so that I can manage credit risk.

**US-ACC-020**: As an Accountant, I want to write off bad debts when invoices are uncollectible, so that AR reflects reality.

### Accounts Payable (AP)

**US-ACC-021**: As an Accountant, I want to enter vendor bills by dragging and dropping PDF files, so that bill entry is faster.

**US-ACC-022**: As an Accountant, I want the system to automatically read bill data using OCR, so that I don't have to manually type everything.

**US-ACC-023**: As a Finance Manager, I want to schedule bill payments based on due dates, so that I optimize cash flow and avoid late fees.

**US-ACC-024**: As an Accountant, I want to track which bills are due soon, so that I can prioritize payments.

**US-ACC-025**: As a Finance Manager, I want to pay multiple vendor bills in a single batch, so that I save time.

**US-ACC-026**: As an Accountant, I want to reconcile vendor statements with our records, so that accounts are accurate.

### Bank Reconciliation

**US-ACC-027**: As an Accountant, I want to connect my bank accounts via secure feed, so that transactions are imported automatically.

**US-ACC-028**: As an Accountant, I want the system to suggest matches between bank transactions and invoices/bills, so that reconciliation is faster.

**US-ACC-029**: As an Accountant, I want to create rules for recurring transactions, so that they're categorized automatically.

**US-ACC-030**: As a Finance Manager, I want to see which transactions are unreconciled, so that I know what needs attention.

**US-ACC-031**: As an Accountant, I want to reconcile multiple bank accounts including foreign currency accounts, so that all cash is tracked.

### General Ledger & Chart of Accounts

**US-ACC-032**: As an Accountant, I want to set up a chart of accounts based on industry templates, so that I don't start from scratch.

**US-ACC-033**: As an Accountant, I want to customize account names and codes to match my business, so that reporting is meaningful.

**US-ACC-034**: As an Accountant, I want to create manual journal entries for adjustments, so that I can correct errors and make period-end entries.

**US-ACC-035**: As a Controller, I want to lock accounting periods to prevent changes, so that historical data is protected.

**US-ACC-036**: As an Accountant, I want to track multi-currency transactions with automatic exchange rate conversion, so that foreign transactions are recorded correctly.

**US-ACC-037**: As an Accountant, I want to see a complete audit trail of all financial transactions, so that I can trace any entry.

### Financial Reporting

**US-ACC-038**: As a Business Owner, I want to generate a Profit & Loss statement with one click, so that I can see profitability quickly.

**US-ACC-039**: As a CFO, I want to view a Balance Sheet showing assets, liabilities, and equity, so that I understand financial position.

**US-ACC-040**: As a Finance Manager, I want to run a Cash Flow statement, so that I can see how cash moved during the period.

**US-ACC-041**: As a Business Owner, I want to compare financial reports across periods (month-over-month, year-over-year), so that I can identify trends.

**US-ACC-042**: As an Accountant, I want to customize report formats and save templates, so that monthly reporting is consistent.

**US-ACC-043**: As a Business Owner, I want to see financial reports in multiple currencies, so that I can understand performance in different markets.

**US-ACC-044**: As a Department Manager, I want to filter reports by department or location, so that I can see my area's performance.

**US-ACC-045**: As a Business Owner, I want to export reports to Excel or PDF, so that I can share them with stakeholders.

### Tax Management

**US-ACC-046**: As an Accountant, I want to configure sales tax rates by jurisdiction, so that invoices calculate tax correctly.

**US-ACC-047**: As a UK Accountant, I want to configure VAT rates and handle reverse charge, so that I comply with UK tax law.

**US-ACC-048**: As an Accountant, I want to generate tax reports (sales tax summary, VAT return), so that I can file returns easily.

**US-ACC-049**: As an Accountant, I want to track tax paid on bills (input tax) and tax collected on invoices (output tax), so that I can calculate tax liability.

**US-ACC-050**: As a Business Owner, I want to track tax-exempt customers, so that their invoices don't include tax.

### Multi-Currency Operations

**US-ACC-051**: As a Business Owner with international operations, I want to invoice customers in their local currency, so that they can pay easily.

**US-ACC-052**: As an Accountant, I want exchange rates to update automatically, so that valuations are current.

**US-ACC-053**: As a CFO, I want to see unrealized gains/losses on foreign currency balances, so that I understand FX exposure.

**US-ACC-054**: As an Accountant, I want to record realized gains/losses when foreign invoices are paid, so that P&L reflects actual FX impact.

**US-ACC-055**: As a Business Owner, I want to run reports in my base currency with automatic conversion, so that I can consolidate multi-currency operations.

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

See [schema.sql](./data-models/schema.sql) for complete database schemas including:
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

### References

- [Xero.com Feature Overview](https://www.xero.com/us/accounting-software/all-features/)
- [Product Specification](./product-specification.md)
- [Technical Architecture](./architecture-technical.md)
- [Firm Profile Module](./module-firm-profile.md)
- [HR Module](./module-hr.md)

---

**Document Owner**: Product Management
**Review Cycle**: Quarterly
**Next Review Date**: 2026-03-03

---

*This comprehensive specification provides the foundation for building a world-class accounting module that competes with leading cloud accounting platforms while maintaining seamless integration with the broader business management platform.*
