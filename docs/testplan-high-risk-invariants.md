# High-Risk Invariants Test Plan

**Status:** draft
**Created:** August 29, 2026
**Scope:** Invariant and adversarial tests for catastrophic-risk product areas.

---

## Purpose

Some failures cannot be handled as ordinary bugs. Payroll errors, accounting
imbalance, tenant data leakage, PII exposure, missing statutory documents, and
unauthorized workflow actions can cause regulatory, financial, or trust damage.

This document defines the high-risk invariants that must hold regardless of UI,
API, import, workflow automation, background job, or administrator action.

---

## Invariant Design Rule

For every `R0` area, tests must prove both:

- The intended workflow succeeds.
- The unacceptable state cannot be created, or is immediately detected and
  quarantined before user-visible or externally submitted output is produced.

Do not rely on UI validation for `R0` controls. Invariants must be enforced at
the strongest practical layer: database constraints, transactions, repository
logic, workflow state machines, export validation, and reconciliation jobs.

---

## Payroll Invariants

### INV-PAY-001: Payroll Run Immutability

Once a payroll run is approved, submitted, or finalized, ordinary edits must be
rejected. Changes require explicit correction, reversal, void, or amendment
flows.

Test coverage:

- Attempt to edit finalized employee gross pay.
- Attempt to edit finalized deduction line.
- Attempt to edit finalized employer tax line.
- Attempt to remove an employee from a finalized run.
- Attempt to change direct deposit allocation after submission.
- Verify correction produces new linked records, not destructive updates.
- Verify audit events identify actor, reason, previous value, new value,
  correction type, and source run.

### INV-PAY-002: Employee Lines Reconcile To Run Totals

Payroll run totals must equal the sum of employee-level earnings, deductions,
taxes, employer liabilities, reimbursements, and net payments.

Test coverage:

- Every run-level total reconciles to line-level records.
- Every pay stub reconciles to the employee run record.
- Every GL posting reconciles to the payroll register.
- Rounding differences are explicit and below the configured tolerance.
- No employee has negative net pay except through an explicitly supported
  arrears/recovery workflow.

### INV-PAY-003: Tax Jurisdiction Is Effective-Dated

Payroll tax jurisdiction must be determined from residence, work location,
locality, remote-work allocation, and effective dates.

Test coverage:

- Employee moves states mid-pay-period.
- Employee works in one state and resides in another.
- Employee has multiple work states in one pay period.
- Employee works in a local tax city for only part of the period.
- State tax form changes after payroll cutoff.
- Recalculation uses the rule version effective on the pay date or wage period,
  as specified by the jurisdiction.

### INV-PAY-004: Withholding Forms Are Versioned

Federal, state, and local withholding forms must be versioned by effective date,
employee submission date, and payroll effective date.

Test coverage:

- Federal W-4 current-year form.
- Missing federal W-4 default withholding.
- Revised W-4 applied no later than the legally required payroll period.
- State form missing where required.
- State form conflicts with federal form.
- Lock-in letter or state adjustment notice overrides employee update.
- Electronic form can be reproduced as a hardcopy-equivalent record.

### INV-PAY-005: Garnishments Respect Priority And Caps

Court-ordered deductions must obey priority rules, disposable earnings limits,
state/federal caps, remittance schedules, and case status.

Test coverage:

- Multiple garnishments of different types.
- Child support plus creditor garnishment.
- Insufficient disposable earnings.
- Garnishment order suspended or terminated.
- Employer fee applied where allowed.
- Remittance report reconciles to deduction lines.
- Termination notice triggered when employee with active order leaves.

### INV-PAY-006: Direct Deposit Is High-Risk PII

Bank account setup and changes must require strong identity assurance and must
not expose full account numbers to ordinary users.

Test coverage:

- Employee adds account with MFA.
- Employee changes allocation after payroll preview but before submission.
- Employee attempts change without MFA.
- Payroll admin views masked account only unless explicitly permitted.
- Prenote/failure/return/reissue flows are auditable.
- Deleted bank account remains in historical payment evidence in masked form.

### INV-PAY-007: Custom Fields Never Drive Payroll Calculations

Customer-defined fields must not feed payroll, tax, benefit, or accounting
calculations unless promoted into an explicit supported configuration model.

Test coverage:

- Custom field named like a payroll field is ignored.
- Malicious custom field payload cannot alter earnings or tax logic.
- Import with custom pay-rate column is rejected or mapped only through an
  approved compensation import workflow.
- Audit warns when a user attempts to use custom fields for payroll logic.

---

## Accounting Invariants

### INV-ACC-001: Journal Entries Balance

Every posted journal entry must have total debits equal total credits in the
entry currency and base currency where applicable.

Test coverage:

- Manual journal entry.
- Invoice posting.
- Payment posting.
- Payroll posting.
- FX revaluation.
- Bank-fee posting.
- Rounding adjustment posting.
- Attempted unbalanced entry rejected.

### INV-ACC-002: Closed Periods Cannot Be Mutated

Once an accounting period is closed, ordinary writes into that period must be
rejected. Corrections must post through an allowed adjustment period or reopen
workflow.

Test coverage:

- Edit invoice dated in closed period.
- Delete payment from closed period.
- Reclassify expense in closed period.
- Import bank transaction into closed period.
- Payroll correction affecting closed period.
- Reopen requires permission, reason, audit, and lock status transition.

### INV-ACC-003: Source Documents Reconcile To Ledger

Every accounting source document must reconcile to generated journal entries.

Test coverage:

- Invoice subtotal, discount, tax, total, payment allocation, AR balance.
- Bill subtotal, tax, payment allocation, AP balance.
- Expense reimbursement liability and payment.
- Payroll register and employer tax liability.
- Bank reconciliation status and cash account movement.
- Bad debt write-off.

### INV-ACC-004: Multi-Currency Is Explicit

Foreign-currency transactions must store source currency, base currency,
exchange rate, rate source, rate date, and realized/unrealized gain/loss.

Test coverage:

- Invoice issued in foreign currency.
- Partial payment at different exchange rate.
- Foreign-currency bank account.
- Revaluation at period end.
- Realized gain/loss on final settlement.
- Report in base currency.
- No silent currency conversion in compensation or payroll displays.

### INV-ACC-005: Bank Reconciliation Is Idempotent

Bank matching and reconciliation must not duplicate payments, expenses, or
journal entries when feeds resend transactions.

Test coverage:

- Duplicate bank transaction from provider.
- Split transaction.
- Many-to-one and one-to-many matches.
- Rule auto-categorization followed by manual correction.
- Reconciliation undone and redone.
- Provider outage and replay.

### INV-ACC-006: Tax Reports Reconcile To Source Tax Lines

Sales tax, VAT, GST, and other tax reports must reconcile to invoice, bill, and
payment tax lines by jurisdiction and period.

Test coverage:

- Tax-exempt customer.
- Reverse charge.
- Multiple jurisdictions on one invoice.
- Credit memo.
- Closed-period adjustment.
- Report export matches source records exactly.

---

## Employment And Statutory Document Invariants

### INV-EMP-001: Required Documents Are Jurisdictional

Onboarding and employment-change packets must include required federal, state,
local, language, role, and employer-size documents.

Test coverage:

- State determined by work location.
- Residence state differs from work state.
- Remote worker home is the worksite for local rules where applicable.
- Primary language triggers translated notice when official translation exists.
- Employer-size threshold changes packet.
- Rehire triggers new-hire reporting and document review when required.

### INV-EMP-002: I-9 Timing And Retention Are Explicit

I-9 Section 1, Section 2, reverification, remote examination, retention, and
purge eligibility must be calculated and audited.

Test coverage:

- Section 1 due by first day of employment.
- Section 2 due within three business days of first day of employment.
- Receipt presented instead of final document.
- Work authorization expiration triggers reverification.
- Terminated employee retention is later of three years after hire or one year
  after termination.
- I-9 purge cannot delete under legal hold.

### INV-EMP-003: Employment Record Effective Dates Do Not Overlap

Current employment status, manager, title, department, work location,
compensation, and policy eligibility must derive from effective-dated records
with no ambiguous overlap.

Test coverage:

- Promotion effective next pay period.
- Manager change on same date as department transfer.
- Location change mid-pay-period.
- Termination after final payroll.
- Rehire with prior service record preserved.
- Attempt to create overlapping current rows rejected.

---

## Tenancy And Permission Invariants

### INV-SEC-001: Tenant Isolation Holds For Every Data Path

Tenant-owned data must never be visible or mutable across tenants through UI,
API, repository, import, export, search, jobs, or AI assistant.

Test coverage:

- Every table with tenant data is isolated.
- Background jobs run with tenant context.
- Search indexes do not include another tenant's data.
- Exports include only requested tenant data.
- Webhook replay cannot target another tenant.
- AI assistant retrieves only authorized tenant context.

### INV-SEC-002: Sensitive Fields Require Explicit Permission

PII, payroll, tax, bank, medical, benefits, immigration, and legal documents
must have field-level and document-level access checks.

Test coverage:

- Self access.
- Manager access.
- HR admin access.
- Payroll admin access.
- Finance admin access.
- Compliance officer read-only access.
- Auditor access.
- External client access.
- Denied access creates no sensitive response body.

### INV-SEC-003: Decrypted Access Is Audited

Every decrypted read of high-sensitivity data must be auditable.

Test coverage:

- SSN/tax ID read.
- Bank account read.
- Medical/benefits document read.
- Tax form read.
- I-9 document read.
- Bulk export.
- AI assistant attempted retrieval.

---

## Workflow And Integration Invariants

### INV-WF-001: State Transitions Are Valid

Workflow objects must move only through allowed transitions.

Objects:

- Change requests.
- Time off requests.
- Benefits elections.
- Payroll runs.
- Accounting periods.
- Tickets.
- Projects/tasks.
- Marketing workflows.
- Campaign approvals.

Test coverage:

- Invalid transition rejected.
- Actor lacks transition permission.
- Approval cannot be applied twice.
- Rejection cannot later auto-apply changes.
- Workflow version remains attached to historical execution.

### INV-WF-002: External Calls Are Idempotent

External integrations must tolerate retries, timeouts, and duplicate provider
callbacks.

Integrations:

- Payment processors.
- Bank feeds.
- Payroll tax filing.
- Direct deposit/ACH.
- Benefits carrier exports.
- E-signature providers.
- Email/SMS.
- Marketing ad/social platforms.

Test coverage:

- Retry after timeout.
- Duplicate webhook.
- Provider accepts but local commit fails.
- Local commit succeeds but provider callback delayed.
- Manual replay.
- Cancellation after partial completion.

### INV-WF-003: Notifications Do Not Become Source Of Truth

Notifications must reflect workflow state but must not create state by
themselves unless routed through an explicit action endpoint.

Test coverage:

- Email approval link expired.
- Slack/Teams action replayed twice.
- SMS reply from wrong phone.
- Notification generated but workflow write fails.
- Notification suppressed for unauthorized recipient.

---

## Marketing Consent Invariants

### INV-MKT-001: Suppression Wins

Global unsubscribe, suppression lists, hard bounce status, spam complaint,
consent withdrawal, and legal basis expiry must prevent marketing sends.

Test coverage:

- Bulk campaign.
- Workflow email.
- Resent email.
- A/B test variant.
- Imported audience.
- Manually selected contact.
- Contact merged after unsubscribe.

### INV-MKT-002: Consent Is Historical

The system must preserve what consent existed at the time of a send, form
submission, subscription update, or suppression event.

Test coverage:

- Consent granted.
- Consent withdrawn.
- Consent re-granted.
- Double opt-in pending.
- Contact imported with implied consent.
- Preference center update.
- Data subject request.

---

## Review Checklist

Before a high-risk area is accepted:

- Invariants are named and mapped to source requirements.
- Invariants are tested below the UI layer.
- Every mutation has audit expectations.
- Every money calculation reconciles to source lines.
- Every document packet has source-versioned rules.
- Every retryable operation is idempotent.
- Every denied sensitive request returns no secret material.
- Every historical output remains reproducible under its original rule version.

