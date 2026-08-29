# Test Fixtures And Golden Data Plan

**Status:** draft
**Created:** August 29, 2026
**Scope:** Fixture strategy for spec-based tests.

---

## Purpose

Spec tests need realistic data, not generic rows. A test tenant should model the
messy business cases that break HR, payroll, accounting, compliance, and
cross-module workflows.

This document defines fixture sets that should exist before a module is called
spec-covered.

---

## Fixture Principles

- Fixtures are named stories, not anonymous records.
- Every fixture states which requirements and invariants it covers.
- High-risk fixtures include expected audit events and expected documents.
- Golden outputs are versioned.
- Jurisdiction fixtures include source-versioned law/form assumptions.
- Historical outputs remain reproducible after future rule changes.
- Custom fields exist in fixtures, but must not drive payroll, tax, accounting,
  or statutory-document logic.

---

## Golden Tenants

### `tenant-northwind-us`

Purpose: US multi-state professional-services employer.

Coverage:

- NJ, NY, MA, CA, WA, PA offices and remote workers.
- Payroll, HR, benefits, compensation, time tracking, accounting, projects.
- Multi-state and local tax scenarios.
- Statutory onboarding packets.
- Service-business time-to-cash flow.

### `tenant-northwind-global`

Purpose: Multi-country tenant for i18n, currencies, India payroll, and
cross-border policy behavior.

Coverage:

- US and India payroll.
- Multi-currency compensation.
- Locale-sensitive dates, numbers, documents, and reports.
- Remote workers and legal employing entities.

### `tenant-riverstone-small`

Purpose: Small employer below several statutory thresholds.

Coverage:

- Employer-size boundaries.
- Paid/unpaid sick time thresholds.
- PFML/PFL employer contribution thresholds.
- Simplified accounting and guided setup.

### `tenant-aperture-large`

Purpose: Larger employer above thresholds and with stricter controls.

Coverage:

- Separation of duties.
- Auditor/compliance role.
- Advanced benefits administration.
- Bulk imports/exports.
- Payroll approvals and GL posting review.

---

## Golden Employee Personas

| Fixture ID | Description | Primary Coverage |
|---|---|---|
| `EMP-NJ-HOURLY-001` | NJ hourly employee, English primary language | NJ new hire, sick leave, TDI/FLI, hourly payroll |
| `EMP-NJ-SPANISH-001` | NJ employee, Spanish primary language | Translated notices, sick leave notice, document packet |
| `EMP-NY-NONRES-001` | NJ resident working in NY | NY nonresident allocation, NY withholding, NJ residence |
| `EMP-NY-NYC-001` | NY employee working in NYC | NYC withholding, pay notice, local tax |
| `EMP-NY-YONKERS-001` | Employee with Yonkers tax exposure | Yonkers withholding and locality detection |
| `EMP-MA-SMALL-001` | MA employee at 10-person employer | Sick time unpaid threshold |
| `EMP-MA-LARGE-001` | MA employee at 11-person employer | Sick time paid threshold |
| `EMP-CA-SPANISH-001` | CA employee, Spanish primary language | DE 4, 2810.5, paid sick leave, translated forms |
| `EMP-CA-10HR-001` | CA employee on 10-hour shifts | Sick leave five-days/40-hours edge case |
| `EMP-WA-HOURLY-001` | WA hourly employee | No state income tax, PFML, WA Cares, sick leave |
| `EMP-WA-OT-001` | WA employee with overtime hours | Sick leave accrual on all hours worked |
| `EMP-PA-PSD-001` | PA employee with different home/work PSD codes | Local EIT/LST and residency certification |
| `EMP-PA-NJ-001` | NJ resident working in PA | Reciprocal withholding and REV-419 |
| `EMP-XSTATE-MOVE-001` | Employee moves NJ to PA mid-pay-period | Effective-dated jurisdiction change |
| `EMP-REHIRE-BOUNDARY-001` | Rehire before/at/after threshold cases | New hire reporting boundary tests |
| `EMP-EXEC-EQUITY-001` | Executive with salary, bonus, equity, allowances | Compensation and payroll complexity |
| `EMP-GARNISH-001` | Employee with child support plus creditor garnishment | Garnishment priority and caps |
| `EMP-I9-REVERIFY-001` | Employee with expiring work authorization | I-9 reverification and retention |
| `EMP-REMOTE-CHANGE-001` | Remote employee moves from NY to WA | Packet, payroll, locality, and prospective changes |

---

## Cross-Module Fixture Stories

### `FLOW-HIRE-TO-PAY-001`

New hire starts in California, completes federal and state onboarding packets,
receives compensation, enrolls in benefits, submits time, and appears in the
first payroll run.

Expected evidence:

- Employee profile.
- Employment history.
- Compensation rows.
- Federal and CA document packet.
- New hire reporting record.
- Benefits election.
- Timesheet.
- Payroll run employee line.
- Pay stub.
- Audit events for sensitive documents and payroll.

### `FLOW-CHANGE-TO-PAYROLL-001`

Employee submits address change from NJ to PA through change request. HR
approves. Payroll jurisdiction changes prospectively.

Expected evidence:

- Change request state history.
- Supporting document record if required.
- Employment/location or address effective-dated record.
- PA local tax fixture selected after effective date.
- Prior payroll remains reproducible under old jurisdiction.
- Audit event for sensitive address change.

### `FLOW-TIME-TO-CASH-001`

Consultant tracks billable time on a client project. Manager approves
timesheet. Approved hours become invoice lines. Customer pays. Accounting
posts AR, cash, revenue, and any tax.

Expected evidence:

- Time entries.
- Timesheet approval.
- Project budget rollup.
- Invoice and invoice lines.
- Payment and allocation.
- Balanced journal entries.
- Audit trail.
- No mutation of invoiced/locked time.

### `FLOW-PAYROLL-TO-GL-001`

Payroll run posts wages, taxes, benefits deductions, employer liabilities, and
net pay into the general ledger.

Expected evidence:

- Payroll register.
- Employee pay stubs.
- Tax liabilities.
- Benefit deduction liabilities.
- Net pay clearing.
- Balanced journal entry.
- Reconciliation report.
- Locked payroll run.

### `FLOW-BENEFITS-QLE-001`

Employee reports marriage as a qualifying life event, adds spouse, uploads
document, changes coverage, and payroll deductions update on the correct date.

Expected evidence:

- Change request.
- Dependent record.
- Supporting document.
- Benefits election.
- Payroll deduction change.
- Carrier export row.
- Audit events.
- Denial case when required document is missing.

### `FLOW-MARKETING-CONSENT-001`

Lead submits form, grants consent, enters nurture workflow, later unsubscribes,
and is suppressed from all future marketing sends.

Expected evidence:

- Contact.
- Form submission.
- Consent event.
- Workflow enrollment.
- Email send events.
- Unsubscribe/suppression event.
- Denied future send.
- Audit trail for consent state.

---

## Golden Output Types

The following outputs should be stored as golden artifacts when implementation
begins:

- Statutory onboarding packet manifests.
- Completed form metadata, not necessarily full PII-bearing PDFs in repo.
- Pay stubs with masked sensitive data.
- Payroll registers.
- Payroll tax filing summaries.
- Benefits carrier export summaries.
- GL posting reports.
- Invoices and payment receipts.
- Bank reconciliation reports.
- Time-off balance ledgers.
- Time tracking invoice-conversion reports.
- Marketing consent and send eligibility reports.
- Audit logs for sensitive actions.

Do not store real PII in repository fixtures. Use deterministic fake values
that pass format validators but cannot identify real people.

---

## Boundary Fixture Requirements

Each high-risk calculation needs boundary data:

- Date just before, on, and after rule effective date.
- Rehire just before, on, and after reporting threshold.
- Employer size just below, on, and above threshold.
- Income just below, on, and above wage base or deduction cap.
- Locality just outside and inside city tax boundary.
- Pay period crossing month-end, quarter-end, year-end, leap day, and daylight
  saving time.
- Currency rate before, on, and after payment date.
- Multiple workflows racing to update the same record.

---

## Fixture Review Checklist

Before fixtures are accepted:

- Every high-risk fixture maps to an invariant.
- Every state fixture maps to an official source URL.
- Every fixture has expected outputs.
- Every expected output has an as-of or effective date.
- No real PII is present.
- Sensitive fields are represented by fake values with realistic formats.
- Cross-module stories include all affected modules.
- Negative variants are named alongside happy paths.
- Fixtures can be replayed deterministically.

