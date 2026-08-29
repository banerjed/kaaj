# Module Coverage Test Plan

**Status:** draft
**Created:** August 29, 2026
**Scope:** Module-level test coverage derived from Kaaj specifications.

---

## Purpose

This document describes the test coverage each module needs before it can be
called spec-complete. It is intentionally broader than the current
implementation.

---

## Coverage Summary

| Module | Primary Risk | Coverage Focus |
|---|---|---|
| Firm Profile | `R1` | Tenant setup, locations, departments, job titles, benefits, holidays, payroll policies, i18n |
| Employee Profile | `R0` | PII, identity, employment status, documents, bank data, custom fields, permissions |
| HR | `R0` | Time off, attendance, benefits enrollment, onboarding, I-9, performance, surveys, dashboards |
| Compensation | `R0` | Effective dating, salary/hourly/commission/equity/allowances/premiums, FTE, currency |
| Payroll | `R0` | Gross-to-net, tax, deductions, garnishments, filings, direct deposit, locked runs |
| Change Requests | `R0` | Approval, application, documents, audit, sensitive-field changes |
| Accounting | `R0` | Double-entry, period close, AR/AP, bank reconciliation, FX, tax, reports |
| Time Tracking | `R0` | Hours, rounding, approvals, invoicing, payroll feed, lock after billing/payroll |
| Projects | `R1` | Tasks, dependencies, automations, client visibility, budget rollups |
| CRM/Sales | `R1` | Leads, contacts, companies, deals, proposals, activities, pipeline |
| Marketing | `R0` | Consent, suppression, email, campaigns, workflows, attribution |
| Client Portal | `R1` | External access, documents, invoices, payments, project visibility |
| Documents | `R0` | ACLs, statutory files, signatures, retention, legal hold |
| Ticketing | `R1` | SLA, private tickets, subscribers, attachments, audit |
| AI Assistant | `R0` | Permission-aware answers, action execution, audit, hallucination containment |

---

## Firm Profile

Spec authorities:

- `module-firm-profile.md`
- `product-specification.md`

Required coverage:

- Tenant creation, subdomain uniqueness, and tenant defaults.
- Locale, timezone, currency, and supported-locale configuration.
- Location creation with address, timezone, working hours, headquarters flag,
  multilingual labels, and address formatting.
- Department hierarchy, department head, cost center, multilingual names, and
  cycle prevention.
- Job titles, job levels, salary ranges, descriptions, and localized display.
- Payroll policies by region/currency/location, including overtime, pay
  schedules, pay-date projection, and rounding policies.
- Benefits packages, benefit items, employee/employer cost split, currencies,
  eligibility, and localization.
- Holiday calendars by location and timezone.

High-value negative tests:

- Two headquarters for one tenant.
- Department parent cycle.
- Salary range with mixed currencies inside one range.
- Holiday imported twice into one calendar.
- Pay schedule crossing month-end, weekend, holiday, and timezone boundaries.
- Tenant A cannot see or use Tenant B reference data.

---

## Employee Profile

Spec authorities:

- `module-employee-profile.md`
- `module-hr.md`
- `module-change-requests.md`

Required coverage:

- Core identity fields, employee ID uniqueness, legal/preferred names.
- Employment status and employment type lifecycle.
- Manager, department, title, level, location, start/end dates.
- Emergency contacts, dependents where applicable, social links, pronouns,
  profile photo, education, prior employment, affinity groups.
- Assets assigned, returned, damaged, replaced, and audited.
- Training and certifications with due dates, completion, expiration, and
  compliance status.
- Custom fields and custom tables.
- Field-level PII encryption and decrypted-read audit events.
- GDPR/CCPA export, retention, and deletion/anonymization behavior.

High-value negative tests:

- Manager reads SSN, bank data, or tax forms without permission.
- Employee edits immutable employment fields directly.
- Custom field attempts to feed payroll or accounting calculations.
- Terminated employee retains active system access.
- Offboarding deletes data that must be retained.
- Search leaks encrypted PII.

---

## HR

Spec authorities:

- `module-hr.md`
- `module-firm-profile.md`
- `module-employee-profile.md`

Required coverage:

- Time off policies, accrual, carryover, manual adjustments, requests,
  approvals, denials, conflicts, team calendar, notifications.
- Attendance clock-in/out, missed punch correction, timesheet approval,
  break rules, late/early reporting, timezone handling.
- Benefits enrollment, open enrollment, dependents, qualifying life events,
  waivers, contributions, reports, carrier exports.
- Performance cycles, templates, goals, self-assessments, manager reviews,
  acknowledgements, 360 feedback, historical visibility.
- Onboarding templates, task assignment, buddy assignment, training, documents,
  I-9 timing, electronic signatures, equipment requests.
- Surveys, anonymity thresholds, pulse survey results, engagement reporting.
- Dashboards for employee, manager, and HR administrator.
- Celebrations, privacy controls, and who's-out calendars.
- Org chart and directory search.

High-value negative tests:

- Time off request spans a local holiday in one office but not another.
- Accrual calculation crosses leap day.
- Manager approves their own restricted HR request.
- Anonymous survey result shown for too-small cohort.
- I-9 Section 2 deadline missed without alert/escalation.
- Benefits QLE change applied without required documentation.

---

## Compensation

Spec authorities:

- `module-compensation.md`
- `module-payroll.md`
- `module-hr.md`

Required coverage:

- Base compensation models: salary, hourly, daily, weekly, monthly,
  piece-rate, commission-only.
- Employment types and work arrangements.
- Work schedules, FTE calculation, core hours, shift patterns, breaks.
- Variable compensation: bonuses, commission, tiers, accelerators, draws,
  quota-based incentives, profit sharing.
- Equity: options, RSUs, SARs, phantom stock, ESPP, performance shares,
  vesting schedules.
- Allowances/stipends and taxable/non-taxable classification.
- Shift differentials, on-call, weekend, holiday, hazard, certification, and
  bilingual premiums.
- Multi-currency storage and display without silent conversion.
- Effective-dated history with no overlap.

High-value negative tests:

- Overlapping compensation rows for the same employee and pay component.
- Retroactive compensation change after payroll lock without correction flow.
- FTE derived from wrong weekly hours.
- Taxable allowance treated as non-taxable.
- Commission draw double-counted.
- Currency converted silently.

---

## Payroll

Spec authorities:

- `module-payroll.md`
- `module-compensation.md`
- `module-hr.md`
- `module-firm-profile.md`
- `module-change-requests.md`

Required coverage:

- Pay periods and payroll runs by frequency.
- Gross-to-net calculation.
- Federal, state, and local withholding.
- Multi-state allocation for residence/work states and remote workers.
- Social Security, Medicare, FUTA, SUTA/SUI, SDI, PFL/PFML, local taxes.
- India payroll: TDS, old/new regimes, EPF, ESI, professional tax, Form 16.
- Pre-tax, post-tax, voluntary, statutory, and garnishment deductions.
- Direct deposit, checks, paycards, failed payments, reversals.
- Pay stubs, W-2, 1099-NEC, 941, 940, Form 16, 24Q.
- Off-cycle, bonus, correction, termination, and retroactive payroll.
- Payroll register, GL export/posting, payroll cost reporting.
- Locked-run immutability and correction audit trail.

High-value negative tests:

- Payroll submitted with unapproved timesheets.
- State/local tax calculated using residence when work location controls, or
  the reverse.
- Garnishment exceeds cap or priority order.
- W-4 update applied to a pay period where it should not yet be effective.
- Direct deposit changed without MFA or approval.
- Closed payroll run edited directly.

---

## Accounting

Spec authorities:

- `module-accounting.md`
- `accounting-gap-analysis.md`
- `module-time-tracking.md`
- `service-provider-modules-overview.md`

Required coverage:

- Invoice creation, sending, payment links, reminders, recurring invoices,
  statuses, PDFs, tracking categories.
- Expense capture, OCR, categorization, claim approval, reimbursement,
  ledger sync.
- AR aging, payment allocation, customer credit risk, bad debt write-off.
- AP bills, OCR, due-date prioritization, batch payments, vendor statement
  reconciliation.
- Bank feeds, suggested matches, rules, unreconciled transactions, foreign
  currency accounts.
- Chart of accounts, journal entries, period lock, audit trail.
- P&L, balance sheet, cash flow, report templates, exports.
- Sales tax, VAT, GST, reverse charge, tax-exempt customers.
- Multi-currency, exchange rates, realized/unrealized FX.
- Cash flow forecasting, guided setup, AI insights, inventory, purchase orders,
  quotes/estimates, project/job costing, accountant portal, smart alerts.

High-value negative tests:

- Unbalanced journal entry.
- Ordinary write into closed period.
- Invoice payment allocated twice.
- Bank transaction matched to wrong tenant/customer.
- FX gain/loss omitted at payment.
- Tax-exempt customer charged tax.
- OCR creates payable without review threshold.

---

## Time Tracking And Projects

Spec authorities:

- `module-time-tracking.md`
- `module-project-management-v2.md`
- `service-provider-modules-overview.md`

Required coverage:

- Timer start/stop, manual entries, billable/non-billable classification.
- Timesheet generation, submission, approval, rejection, and lock.
- Hourly rates by employee, project, client, task, and effective date.
- Auto-invoice from approved hours.
- Payroll feed for hourly workers and overtime.
- Projects, tasks, subtasks, dependencies, attachments, comments, templates.
- Dashboards, widgets, objectives, automations, workload, Gantt/calendar views.
- Client-visible progress and approvals.

High-value negative tests:

- Timer overlaps another active timer.
- Rounded time differs between payroll and invoice.
- Approved/invoiced time can be edited.
- Client sees internal-only task/comment.
- Automation repeats after retry and creates duplicate task or notification.
- Project budget rollup ignores expenses or billable time.

---

## CRM, Marketing, And Sales

Spec authorities:

- `module-marketing.md`
- `service-provider-modules-overview.md`

Required coverage:

- Contacts, companies, leads, deals, lifecycle stages, activities, tasks,
  notes, associations, dedupe, import/export.
- Pipeline stages, probabilities, forecasting, lead routing, deal assignment.
- Forms, progressive profiling, hidden fields, spam filtering, file uploads.
- Segments/lists, lead scoring, score decay, predictive scoring.
- Email campaigns, templates, personalization, dynamic content, A/B tests,
  bounce handling, unsubscribe.
- Consent, lawful basis, suppression lists, preference center.
- Marketing workflows with enrollment, re-enrollment, branches, delays,
  idempotency, failure handling, and audit.
- Campaigns, landing pages, CTAs, ads, social publishing, social inbox,
  analytics, attribution.
- Sales enablement: calls, meetings, sequences, quotes, proposals.

High-value negative tests:

- Marketing email sent to globally unsubscribed contact.
- Workflow enrolls a record twice after retry.
- Dedupe merges records across tenants.
- Form maps to wrong CRM property.
- Attribution double-counts revenue.
- Lead score ignores negative behavior or decay.

---

## Ticketing, Documents, Client Portal, And AI

Spec authorities:

- `module-ticketing.md`
- `module-ai-assistant.md`
- `service-provider-modules-overview.md`
- `product-specification.md`

Required coverage:

- Ticket lifecycle, business areas, categories, severity, SLA, assignment,
  subscribers, private/public updates, attachments, linked tickets.
- Document folders, upload, preview, versioning, permissions, retention,
  signatures, legal hold, full-text search.
- Client portal login, project visibility, documents, invoices, payments,
  tickets, contracts, white-label access.
- AI assistant knowledge Q&A, context, module actions, permission enforcement,
  audit logs, rate limits, multilingual support.

High-value negative tests:

- Private ticket update visible to requester or wrong team.
- Document search leaks restricted file content.
- Client portal exposes internal project margin or employee pay.
- AI assistant answers using data the user cannot access.
- AI assistant executes restricted action without approval.
- Legal-hold document deleted or retention clock reset incorrectly.

