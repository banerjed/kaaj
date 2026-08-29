# Spec Traceability Test Plan

**Status:** draft
**Created:** August 29, 2026
**Scope:** Mapping Kaaj specifications to testable coverage.

---

## Purpose

This document defines how every requirement in the specs becomes testable.
Traceability is the mechanism that prevents broad specifications from hiding
untested product risk.

Every feature must trace from source requirement to fixture, expected evidence,
automated or manual test, and review status.

---

## Requirement ID Model

Use existing IDs when the specs provide them:

- `US-*` for user stories.
- `FR-*` for functional requirements.
- `BR-*` for business rules.
- `VR-*` for validation rules, assigned in the test matrix when the spec has
  validation prose but no stable ID.
- `SR-*` for security rules.
- `RR-*` for reporting rules.
- `IR-*` for integration rules.
- `DR-*` for document/statutory-record rules.
- `INV-*` for invariants that must never be violated.

If a source has no requirement IDs, assign test-plan IDs without modifying the
source document. Example: `TP-HR-ONBOARDING-DR-001`.

---

## Traceability Row Schema

Each row in the eventual matrix should contain:

| Field | Meaning |
|---|---|
| `requirement_id` | Stable source or test-plan ID |
| `source` | Spec file and section |
| `module` | Product module |
| `persona` | Actor who initiates or consumes the workflow |
| `workflow` | Named business workflow |
| `risk` | `R0`, `R1`, `R2`, or `R3` |
| `jurisdiction` | Country, state, city, or `global` |
| `effective_date_basis` | Date law, policy, or config version applies |
| `fixtures` | Named fixture records required |
| `positive_cases` | Happy-path cases |
| `negative_cases` | Denial, invalid, edge, and abuse cases |
| `expected_evidence` | Data, document, report, audit, notification, export |
| `test_types` | Unit, workflow, invariant, UI, contract, golden-file, etc. |
| `automation_status` | planned, manual-only, automated, blocked |
| `review_owner` | Product, engineering, compliance, finance, payroll, HR |

---

## Extraction Rules

1. Extract every explicit user story.
2. Extract every functional requirement.
3. Extract business rules even when they are repeated under user stories.
4. Extract validation prose into `VR-*` rows.
5. Extract reporting requirements into `RR-*` rows.
6. Extract security and permission requirements into `SR-*` rows.
7. Extract API endpoints into contract coverage rows.
8. Extract integration points into `IR-*` rows.
9. Extract tables, constraints, and cross-module references into data coverage.
10. Extract gap-analysis items as planned requirements, not as optional notes.

The extraction process should preserve source conflicts. A conflict is a test
planning output, not a nuisance to smooth over.

---

## Required Coverage Per Risk Level

| Risk | Minimum Coverage |
|---|---|
| `R0` | Positive, negative, permission, audit, invariant, golden fixture, effective-date version, cross-tenant where applicable |
| `R1` | Positive, negative, permission, audit, workflow or API contract |
| `R2` | Positive, negative, role-aware UI or API coverage |
| `R3` | Smoke, display, accessibility, empty/error state |

Examples of `R0` requirements:

- Payroll tax calculation.
- Garnishment priority and caps.
- Direct deposit bank account updates.
- Statutory employment document selection.
- I-9 timing and retention.
- Closed payroll runs and accounting periods.
- Double-entry journal balance.
- Tenant isolation.
- PII encryption and decrypted access.
- Marketing consent and global unsubscribe.

---

## Acceptance Criteria Template

Every user story should receive acceptance criteria in this shape:

```text
Given <fixture state>
And <role/permission context>
And <jurisdiction/effective-date context>
When <actor performs workflow>
Then <business outcome>
And <data state>
And <audit event>
And <document/report/notification/export, if applicable>
And <security/privacy boundary remains true>
```

High-risk workflows should also include:

```text
When <workflow is repeated, delayed, corrected, denied, reversed, or attempted
without permission>
Then <system rejects, routes, audits, or corrects through the required explicit
process>
And <no silent mutation occurs>
```

---

## Cross-Cutting Coverage Tags

Apply these tags to every traceability row where relevant:

- `tenant-isolation`
- `pii`
- `field-encryption`
- `decrypted-read-audit`
- `effective-dated`
- `money`
- `tax`
- `payroll`
- `accounting`
- `state-compliance`
- `local-compliance`
- `document-generation`
- `document-retention`
- `signature`
- `notification`
- `workflow-state`
- `idempotency`
- `external-integration`
- `mobile`
- `i18n`
- `accessibility`
- `ai-permission-boundary`
- `marketing-consent`

These tags make it possible to ask questions such as "show every test that
touches payroll and state compliance" across modules.

---

## Negative Case Categories

Negative tests should be designed deliberately. Do not rely only on empty-field
validation.

Use these categories:

- Unauthorized actor.
- Authorized actor attempting a forbidden field or record.
- Wrong tenant.
- Wrong effective date.
- Overlapping effective dates.
- Stale policy version.
- Missing statutory document.
- Wrong jurisdiction.
- Wrong language.
- Late submission.
- Duplicate submission.
- Replay after success.
- External provider timeout.
- External provider duplicate response.
- Closed period or locked run.
- Invalid tax identifier.
- Invalid bank routing/account data.
- Rounding boundary.
- Leap year or daylight-saving boundary.
- Cross-currency mismatch.
- Deleted or inactive reference data.
- AI answer/action beyond permissions.
- Suppressed or unsubscribed communication recipient.

---

## Traceability Review Checklist

Before a module begins implementation, reviewers should confirm:

- Every `US-*` has at least one acceptance test.
- Every `FR-*` has workflow or API contract coverage.
- Every `BR-*` has either a deterministic example or an invariant.
- Every validation rule has both valid and invalid examples.
- Every report states its source records and as-of date semantics.
- Every integration has retry, idempotency, failure, and audit expectations.
- Every statutory document has source URL, version/effective date, language,
  triggering condition, retention rule, and expected packet placement.
- Every high-risk action has separation-of-duties and audit coverage.
- Every module has at least one cross-tenant isolation test.

