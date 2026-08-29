# Spec Test Methodology

**Status:** draft
**Created:** August 29, 2026
**Scope:** Methodology for testing Kaaj against the specifications.

---

## Principle

The test plan starts from the specification, not from implementation structure.
Current code can lag the spec, but the coverage model should not. This lets the
team ask, for every feature: what would have to be true for this to be safe to
sell, safe to operate, and safe to audit?

Tests should be designed around workflows and invariants. A workflow proves a
person can complete a business task. An invariant proves the system cannot enter
an unacceptable state.

---

## Requirement Sources

Test coverage must be derived from these requirement types:

- User stories, usually `US-*`.
- Functional requirements, usually `FR-*`.
- Business rules, usually `BR-*`.
- Validation rules.
- Security and permission rules.
- Reporting requirements.
- API endpoint definitions.
- Integration requirements.
- Data model constraints.
- Cross-module workflow descriptions.
- Explicit gaps in gap-analysis documents.

When two documents disagree, the test plan must record the conflict instead of
silently choosing one. High-risk conflicts block the feature until the product
owner resolves the requirement.

---

## Coverage Artifacts

Every requirement should eventually produce four artifacts:

1. **Traceability row**
   - Source, requirement ID, persona, module, workflow, risk, jurisdiction, and
     planned test types.
2. **Fixture story**
   - Named realistic data that exercises the requirement and its edge cases.
3. **Expected evidence**
   - Database result, report, document, audit event, notification, export, or
     workflow state.
4. **Executable test**
   - Automated where possible; manual checklist only when automation cannot
     reasonably verify the requirement.

---

## Test Types

| Test Type | Use For |
|---|---|
| Unit | Pure calculations, validators, formatting, state machines |
| Repository | Tenant-scoped data access, constraints, effective dating, joins |
| Workflow | Multi-step business processes across tables/modules |
| API contract | Request/response shape, idempotency, auth, validation |
| UI acceptance | Persona workflows, accessibility, mobile, empty/error states |
| Invariant | Conditions that must never be violated |
| Property/fuzz | Money, tax, date, rounding, schedule, and allocation logic |
| Golden-file | Statutory forms, pay stubs, tax reports, invoices, exports |
| Permission | Self, manager, HR, payroll, finance, admin, client, auditor roles |
| Audit | Immutable event records for sensitive operations |
| Integration contract | External systems, imports, exports, webhooks, carrier files |
| Migration | Existing customer data, schema upgrades, regulatory version changes |

---

## Evidence Model

Each test must specify what evidence proves success. "The page rendered" is
rarely sufficient.

Examples of stronger evidence:

- Time-off approval creates the request status, balance ledger entries,
  notifications, and audit event.
- Payroll lock prevents later mutation and requires correction/reversal flows.
- A statutory onboarding packet contains the correct federal and state forms
  for the employee's work state, residence state, language, and hire date.
- A manager can see team contact details but cannot see SSN, bank account, or
  another department's compensation history without permission.
- A multi-currency invoice stores source currency, base currency, exchange
  rate, rate date, realized gain/loss on payment, and balanced journal entries.

---

## Risk-Driven Depth

Low-risk features can be tested with representative examples. High-risk
features need adversarial coverage.

`R0` tests must include:

- At least one happy path.
- At least three meaningful negative paths.
- Permission denial tests.
- Audit log assertions.
- Effective-date or version-date coverage.
- Boundary values.
- Replay/idempotency coverage when state changes.
- Cross-tenant isolation if tenant-owned data is touched.
- Manual source review when law, tax, or statutory documents are involved.

---

## High-Risk Review Standard

A reviewer should reject an `R0` test plan if it only checks that the ordinary
path works. The plan must also prove that dangerous states are impossible or
detectable.

Dangerous states include:

- Payroll run totals do not reconcile to employee-level lines.
- A closed payroll run can be edited.
- A journal entry is unbalanced.
- A closed accounting period accepts ordinary writes.
- A custom field changes payroll, tax, or accounting calculations.
- An employee in one tenant can be queried by another tenant.
- A manager can read an employee's SSN, bank details, medical documents, or tax
  forms without explicit permission.
- A statutory document packet uses the wrong state, wrong language, or wrong
  effective-date version.
- A workflow sends marketing email to a suppressed or unsubscribed contact.

---

## Source-Versioned Compliance

Legal and tax tests must never hard-code "current" law without recording the
source version. For every statutory rule, capture:

- Jurisdiction.
- Source URL.
- Page title or form identifier.
- Effective date or last-reviewed date where available.
- Retrieval date.
- Rule summary.
- Applicability conditions.
- Expected test cases.

When a source changes, add a new versioned fixture rather than overwriting the
old expectation. Historical payroll, statutory documents, and closed accounting
periods must remain reproducible under the rule version that applied at the
time.

---

## Review Rhythm

1. Product/spec review before development starts.
2. Test-plan review before implementation starts.
3. Fixture review before automated tests are written.
4. Implementation review against the traceability matrix.
5. Regression review after bug fixes.
6. Quarterly compliance-source review for HR/payroll/accounting rules.
7. Immediate review when a federal, state, tax, or benefit source changes.

