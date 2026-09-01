# Pending Modules Specification

**Status:** draft
**Created:** September 1, 2026
**Related:**
[challenging-workflows.md](./challenging-workflows.md),
[workflow-templates-spec.md](./workflow-templates-spec.md),
[cross-module-integration-plan.md](./cross-module-integration-plan.md)

---

## Purpose

This document captures common small and medium business workflows that are not
fully owned by the currently planned module set. The goal is to identify product
gaps that must be filled for Kaaj to deliver on the promise of streamlined,
automatic, cross-module operations.

The current planned modules cover important records and workflows across HR,
employee profile, compensation, payroll, accounting, time tracking, project
management, ticketing, marketing, user groups, change requests, firm profile,
and AI assistance. The gaps below are areas where common SMB workflows would
still require spreadsheets, external SaaS products, manual coordination, or
unclear ownership unless Kaaj adds explicit module support.

---

## Prioritized Pending Modules

| Rank | Pending Module                              | Priority | Why It Matters                                                                                                 |
| ---- | ------------------------------------------- | -------- | -------------------------------------------------------------------------------------------------------------- |
| 1    | Workflow Orchestration                      | R0       | Makes cross-module templates, checklists, subtasks, automation, dependencies, and holistic review first-class  |
| 2    | CRM / Sales Pipeline                        | R1       | Owns leads, companies, contacts, opportunities, sales stages, account ownership, and handoff to delivery       |
| 3    | Proposals / Quotes                          | R1       | Connects sales intent to scoped work, pricing, approvals, signatures, projects, and invoices                   |
| 4    | Contract Lifecycle Management               | R1       | Owns contracts, signatures, renewals, obligations, terms, legal holds, and client/employee document governance |
| 5    | Benefits Administration                     | R0       | Owns plans, eligibility, elections, dependents, life events, carrier exports, and payroll deductions           |
| 6    | Recruiting / ATS                            | R1       | Covers candidate sourcing, interviews, offers, offer approvals, background checks, and onboarding handoff      |
| 7    | Procurement / Purchase Orders               | R1       | Covers purchase requests, approvals, POs, receiving, vendor bills, budgets, and three-way match                |
| 8    | Vendor Management                           | R1       | Owns vendor onboarding, tax docs, risk, contracts, bank/payment details, insurance, and renewal tracking       |
| 9    | Expense Management / Corporate Cards        | R1       | Covers employee expenses, receipts, travel approvals, policy checks, card feeds, reimbursements, and GL coding |
| 10   | Asset Management                            | R1       | Owns equipment purchase, assignment, maintenance, depreciation, recovery, and offboarding reconciliation       |
| 11   | Client Portal / Customer Success            | R1       | Gives clients a unified place for invoices, projects, tickets, approvals, documents, renewals, and status      |
| 12   | Analytics / BI / Report Builder             | R1       | Allows unified reporting across HR, payroll, finance, sales, projects, support, and marketing                  |
| 13   | Compliance Calendar / Obligation Management | R0       | Tracks statutory deadlines, filings, notices, certifications, acknowledgments, renewals, and audit evidence    |
| 14   | Knowledge Base / SOP Management             | R2       | Owns policies, SOPs, versioning, attestations, and AI knowledge governance                                     |
| 15   | Communications / Notification Hub           | R2       | Centralizes message templates, preferences, digests, escalation, delivery status, and notification audit       |
| 16   | Data Import / Migration / Data Quality      | R1       | Enables one-day customer onboarding through mapping, transformation, validation, dedupe, and rollback          |
| 17   | Inventory / Operations Management           | R2       | Needed for manufacturing or product-heavy SMBs: stock, work orders, BOMs, fulfillment, and COGS                |

---

## Tier 1: Foundation Gaps

### 1. Workflow Orchestration

**Problem:** Current specs describe many cross-module workflows, but no single
module owns workflow templates, generated subtasks, dependencies, automation
runs, status rollups, and holistic review.

**Common workflows unlocked:**

- New hire onboarding.
- Employee transfer.
- Location/work-state change.
- Offboarding.
- Payroll-to-GL close.
- Billable time to invoice.
- Deal-to-project handoff.
- Month-end close blockers.
- Data-subject/legal request.

**Minimum capabilities:**

- Declarative workflow templates.
- Template applicability rules.
- Generated workflow instances.
- Generated subtasks/tickets.
- Dynamic assignee resolution.
- Due-date formulas.
- Step dependencies.
- Automation modes.
- Exception steps.
- Status rollups.
- Audit and idempotency.

**Integration points:** All modules.

**Priority rationale:** This is the core mechanism that makes unified SaaS feel
automatic rather than merely colocated.

### 2. CRM / Sales Pipeline

**Problem:** Marketing exists, but marketing automation does not fully cover
sales pipeline management, account ownership, opportunities, forecasts, handoff
to projects, or customer lifecycle tracking.

**Common workflows unlocked:**

- Lead qualification.
- Opportunity management.
- Sales forecast to capacity planning.
- Closed-won handoff to projects.
- Campaign attribution through revenue.
- Account-owner driven renewals and escalations.

**Minimum capabilities:**

- Accounts/companies.
- Contacts.
- Leads.
- Opportunities/deals.
- Pipeline stages.
- Activities and notes.
- Account ownership.
- Forecast probability.
- Deal-source attribution.
- Handoff triggers.

**Integration points:** Marketing, proposals, contracts, project management,
accounting, client portal, AI assistant.

### 3. Proposals / Quotes

**Problem:** Project management references proposals, but there is no module that
owns scope, pricing, quote approvals, client acceptance, or conversion to project
and invoice.

**Common workflows unlocked:**

- Quote creation from opportunity.
- Scope approval.
- Pricing/margin review.
- Client acceptance.
- Conversion to project objectives/tasks.
- Invoice schedule generation.

**Minimum capabilities:**

- Proposal records.
- Quote line items.
- Pricing models.
- Discount approval.
- Margin preview.
- Scope and deliverables.
- Versioning.
- Client approval.
- Signature/acceptance status.
- Conversion to project/accounting.

**Integration points:** CRM, contracts, projects, accounting, client portal,
documents, AI assistant.

### 4. Contract Lifecycle Management

**Problem:** Documents are referenced across modules, but contracts need their
own lifecycle: drafting, signatures, renewals, obligations, amendments, legal
holds, and retention.

**Common workflows unlocked:**

- Proposal to signed contract.
- Contract renewal.
- SLA/obligation tracking.
- Pricing term lookup.
- Client approval gating.
- Employee offer letters.
- Contractor agreements.
- Legal holds and retention.

**Minimum capabilities:**

- Contract records.
- Parties and counterparties.
- Terms and obligations.
- Renewal dates.
- Signature requests.
- Versioning and amendments.
- Clause metadata.
- Document retention.
- Legal hold.
- Contract-to-project/invoice links.

**Integration points:** CRM, proposals, accounting, projects, HR, employee
profile, vendor management, client portal, audit.

---

## Tier 2: HR, Payroll, And Compliance Gaps

### 5. Benefits Administration

**Problem:** Benefits are referenced in HR, payroll, and change requests, but no
dedicated module owns benefit plans, eligibility, elections, dependents, life
events, carrier files, or deduction reconciliation.

**Common workflows unlocked:**

- New hire benefits enrollment.
- Open enrollment.
- Qualifying life event.
- Dependent verification.
- Carrier export.
- Payroll deduction changes.
- Benefit deduction reconciliation.

**Minimum capabilities:**

- Benefit plans.
- Eligibility rules.
- Enrollment windows.
- Employee elections.
- Dependents and beneficiaries.
- Life-event workflows.
- Required supporting documents.
- Carrier export/import.
- Payroll deduction mapping.
- Reconciliation and audit.

**Integration points:** Employee profile, payroll, change requests, documents,
firm profile, workflow orchestration, audit.

### 6. Recruiting / ATS

**Problem:** The employee lifecycle begins at employee creation. SMBs also need
candidate intake, interviews, offer approvals, offer letters, background checks,
and onboarding handoff.

**Common workflows unlocked:**

- Job requisition approval.
- Job posting.
- Candidate pipeline.
- Interview scheduling.
- Scorecards.
- Offer approval.
- Background check.
- Candidate-to-employee conversion.

**Minimum capabilities:**

- Requisitions.
- Job postings.
- Candidates.
- Applications.
- Interview plans.
- Interview feedback.
- Offer package.
- Offer approval.
- Background check status.
- Conversion to employee profile/onboarding.

**Integration points:** Firm profile, employee profile, compensation, documents,
workflow orchestration, user groups, AI assistant.

### 7. Compliance Calendar / Obligation Management

**Problem:** State employment packets cover onboarding documents, but SMBs also
need recurring compliance deadlines, filings, policy acknowledgments, license
renewals, certifications, tax deadlines, audits, and evidence management.

**Common workflows unlocked:**

- Payroll filing deadlines.
- State/local employment notices.
- Annual policy acknowledgment.
- License/certification renewal.
- Insurance renewal.
- Audit evidence collection.
- Compliance exception remediation.

**Minimum capabilities:**

- Obligation registry.
- Jurisdiction applicability.
- Due dates and recurrence.
- Owners.
- Evidence requirements.
- Escalation rules.
- Completion proof.
- Versioned legal/source references.
- Audit-ready history.

**Integration points:** Payroll, HR, employee profile, documents, accounting,
firm profile, workflow orchestration, audit.

---

## Tier 3: Finance And Operations Gaps

### 8. Procurement / Purchase Orders

**Problem:** Accounting can record bills, but purchase intent, budget approval,
PO creation, receiving, and three-way match are separate workflows.

**Common workflows unlocked:**

- Purchase request.
- Budget check.
- Approval routing.
- PO issuance.
- Goods/services receipt.
- Vendor bill matching.
- Payment approval.

**Minimum capabilities:**

- Purchase requests.
- Purchase orders.
- Approval thresholds.
- Budget reservation.
- Receiving records.
- Three-way match.
- PO-to-bill conversion.
- Exceptions.

**Integration points:** Accounting, vendor management, projects, departments,
firm profile, workflow orchestration, audit.

### 9. Vendor Management

**Problem:** Accounting may store vendors for bills, but vendor onboarding,
contracts, tax forms, banking, insurance, risk, renewals, and compliance need
their own lifecycle.

**Common workflows unlocked:**

- Vendor onboarding.
- W-9/W-8 collection.
- Payment setup.
- Contract renewal.
- Insurance certificate tracking.
- Preferred vendor management.
- Vendor risk review.

**Minimum capabilities:**

- Vendor profiles.
- Vendor contacts.
- Tax documents.
- Bank/payment instructions.
- Insurance certificates.
- Contracts.
- Risk/compliance status.
- Renewal reminders.
- Approval workflow.

**Integration points:** Accounting, procurement, contracts, documents, workflow
orchestration, audit.

### 10. Expense Management / Corporate Cards

**Problem:** Accounting has expense records, but employee expense submission,
receipt capture, policy checks, travel approval, card feed matching,
reimbursement, and exception handling are a workflow of their own.

**Common workflows unlocked:**

- Mobile receipt submission.
- Expense policy validation.
- Manager approval.
- Finance review.
- Corporate card reconciliation.
- Payroll reimbursement.
- GL posting.

**Minimum capabilities:**

- Expense reports.
- Expense line items.
- Receipt OCR.
- Policy rules.
- Approval routes.
- Corporate card feeds.
- Reimbursement status.
- GL coding.
- Duplicate detection.

**Integration points:** Accounting, payroll, employee profile, HR policies,
workflow orchestration, AI assistant, audit.

### 11. Asset Management

**Problem:** Employee profile and tickets mention assets, but no module owns
asset purchase, assignment, custody, repair, depreciation, recovery, and disposal.

**Common workflows unlocked:**

- New hire equipment provisioning.
- Asset assignment.
- Repair/replacement.
- Asset audit.
- Offboarding recovery.
- Depreciation/export to accounting.

**Minimum capabilities:**

- Asset inventory.
- Assignment history.
- Custody acknowledgment.
- Purchase/vendor link.
- Warranty/support status.
- Maintenance tickets.
- Return checklist.
- Depreciation metadata.
- Disposal records.

**Integration points:** Employee profile, ticketing, procurement, vendor
management, accounting, documents, workflow orchestration.

### 12. Inventory / Operations Management

**Problem:** Product spec includes manufacturing SMBs, but current planned
modules do not cover stock, work orders, bills of materials, fulfillment,
inventory valuation, or COGS.

**Common workflows unlocked:**

- Purchase stock.
- Receive goods.
- Track inventory.
- Build work order.
- Fulfill customer order.
- Calculate COGS.
- Reorder planning.

**Minimum capabilities:**

- Items/SKUs.
- Inventory locations.
- Stock movements.
- Purchase receipts.
- Bills of materials.
- Work orders.
- Fulfillment/shipping status.
- Inventory valuation.
- Reorder rules.

**Integration points:** Accounting, procurement, CRM/orders, projects, vendor
management, workflow orchestration.

---

## Tier 4: Customer, Reporting, And Platform Gaps

### 13. Client Portal / Customer Success

**Problem:** Project management references client visibility, but a full client
portal should own customer access, invoice visibility, approvals, documents,
tickets, renewals, and account health.

**Common workflows unlocked:**

- Client invoice review.
- Client task/deliverable approval.
- Support ticket submission.
- Shared document access.
- Project status review.
- Renewal and escalation management.

**Minimum capabilities:**

- Client users.
- Portal permissions.
- Client-visible projects/tasks.
- Client-visible invoices/payments.
- Client document sharing.
- Client approvals.
- Account health.
- Renewal reminders.

**Integration points:** CRM, projects, accounting, ticketing, documents,
contracts, workflow orchestration.

### 14. Analytics / BI / Report Builder

**Problem:** Each module defines reports, but SMB leaders need cross-module
answers without spreadsheets.

**Common workflows unlocked:**

- Profitability by client/project.
- Headcount and payroll forecast.
- Campaign ROI to margin.
- Utilization vs pipeline.
- Department budget variance.
- Close readiness.
- Compliance status.

**Minimum capabilities:**

- Cross-module semantic model.
- Saved reports.
- Dashboards.
- Drill-through.
- Scheduled reports.
- Permissioned exports.
- Metrics definitions.
- Snapshot/version history.

**Integration points:** All modules.

### 15. Knowledge Base / SOP Management

**Problem:** AI can retrieve knowledge, but no module owns the knowledge itself:
policies, SOPs, help articles, article approval, versioning, and attestations.

**Common workflows unlocked:**

- Publish HR policy.
- Publish expense policy.
- Require employee acknowledgment.
- Answer employee questions with approved sources.
- Retire stale SOPs.
- Audit who saw which version.

**Minimum capabilities:**

- Articles.
- Categories.
- Approval workflow.
- Versioning.
- Effective dates.
- Attestations.
- Search metadata.
- AI knowledge permissions.
- Retirement/archive.

**Integration points:** AI assistant, HR, accounting, payroll, ticketing,
documents, workflow orchestration.

### 16. Communications / Notification Hub

**Problem:** Many specs mention notifications, but delivery preferences,
templates, digests, escalation, SMS/email/in-app status, and audit should be
central.

**Common workflows unlocked:**

- Approval reminders.
- Payroll notices.
- Client invoice notifications.
- Compliance deadline escalation.
- Ticket SLA alerts.
- Digest emails.
- Failed-notification retry.

**Minimum capabilities:**

- Message templates.
- Notification preferences.
- Channel routing.
- Digest rules.
- Delivery status.
- Retry rules.
- Escalation rules.
- Suppression/quiet hours.
- Audit log.

**Integration points:** All modules, especially workflow orchestration,
marketing consent, ticketing, payroll, HR, accounting, client portal.

### 17. Data Import / Migration / Data Quality

**Problem:** The product goal says new customer onboarding should happen within
one day, but import, transformation, cleaning, duplicate detection, validation,
rollback, and reconciliation need first-class product support.

**Common workflows unlocked:**

- Import employees.
- Import payroll history.
- Import customers/vendors.
- Import accounting balances.
- Import contacts and consent.
- Validate data quality.
- Roll back failed migration.

**Minimum capabilities:**

- Import templates.
- Field mapping.
- Transformation rules.
- Validation rules.
- Duplicate detection.
- Preview.
- Error resolution.
- Staged import.
- Rollback.
- Import audit trail.

**Integration points:** All modules.

---

## Recommended Build Order

### Foundation Sequence

1. Workflow Orchestration.
2. Benefits Administration.
3. CRM / Sales Pipeline.
4. Proposals / Quotes.
5. Contract Lifecycle Management.

### Finance And Operations Sequence

1. Expense Management.
2. Procurement / Purchase Orders.
3. Vendor Management.
4. Asset Management.
5. Analytics / BI.

### Platform Expansion Sequence

1. Client Portal / Customer Success.
2. Compliance Calendar.
3. Data Import / Migration / Data Quality.
4. Knowledge Base / SOP Management.
5. Communications / Notification Hub.
6. Inventory / Operations Management, if manufacturing remains a target market.

---

## Test-Plan Implications

Each pending module should define:

- Module ownership boundaries.
- Cross-module workflows unlocked.
- Required source records.
- Generated records in downstream modules.
- Permissions and field-level security.
- Audit events.
- Idempotency requirements.
- Workflow template steps.
- Negative cases for stale data, wrong tenant, revoked permission, duplicate
  event, missing document, closed period, and partial retry.

The highest-priority executable tests should be:

1. New hire onboarding with benefits, payroll, statutory docs, user groups, and
   equipment tickets.
2. Employee location/work-state change with state/local docs and payroll tax
   jurisdiction.
3. Payroll-to-GL posting with benefits and department cost allocation.
4. Billable time to invoice with project rates and client-visible summaries.
5. Expense reimbursement from receipt to payroll and GL clearing.
6. Deal-to-project-to-invoice conversion.
7. Benefits life event to carrier export and payroll deduction reconciliation.
8. Month-end close blocker rollup.
9. Access review after department/manager/role change.
10. Data import dry run with validation, dedupe, and rollback.
