# Test Execution Governance Plan

**Status:** draft
**Created:** August 29, 2026
**Scope:** Governance for keeping spec-based tests correct over time.

---

## Purpose

The test plan will only stay useful if it has ownership, review gates, and a
rule-update process. This document defines how spec tests move from prose to
fixtures to automation, and how high-risk areas stay current.

---

## Lifecycle

1. **Spec extraction**
   - Requirements are extracted into the traceability matrix.
2. **Risk classification**
   - Each requirement receives `R0` through `R3`.
3. **Acceptance criteria**
   - Positive, negative, permission, audit, document, and jurisdiction
     expectations are written.
4. **Fixture design**
   - Named fixtures and golden outputs are created.
5. **Product review**
   - Product verifies the behavior matches buyer intent.
6. **Compliance/finance/payroll review**
   - Required for employment, payroll, benefits, accounting, privacy, and
     marketing consent.
7. **Automation design**
   - Engineering maps cases to unit, repository, workflow, API, UI, invariant,
     golden-file, and integration contract tests.
8. **Implementation gate**
   - No high-risk module starts without accepted test-plan coverage.
9. **Regression gate**
   - Every bug fix adds or updates traceability coverage.
10. **Periodic review**

- Compliance sources and high-risk fixtures are refreshed on cadence.

---

## Ownership

| Area                                 | Review Owner               |
| ------------------------------------ | -------------------------- |
| HR and employee lifecycle            | HR/product                 |
| US state employment records          | HR/compliance              |
| Payroll calculation and filing       | Payroll/compliance/finance |
| Accounting and period close          | Finance/controller         |
| Tax and jurisdiction logic           | Finance/compliance         |
| PII, encryption, document access     | Security/compliance        |
| Multi-tenant isolation               | Engineering/security       |
| Marketing consent and deliverability | Marketing/compliance       |
| AI assistant permissions             | Product/security           |
| Accessibility and mobile             | Product/design/engineering |

For `R0` requirements, engineering cannot self-approve product correctness.

---

## Source Update Cadence

| Source Type                     | Cadence                            | Trigger                                            |
| ------------------------------- | ---------------------------------- | -------------------------------------------------- |
| Federal payroll/tax forms       | Annual plus immediate updates      | IRS form/table update                              |
| State withholding forms         | Annual plus immediate updates      | State revenue update                               |
| State new hire reporting        | Quarterly                          | State agency page or file spec update              |
| State leave/disability/PFML/PFL | Quarterly plus annual rate updates | Rate, wage cap, threshold, notice update           |
| Workplace posters/notices       | Quarterly                          | Poster/form update                                 |
| Benefits carrier formats        | Per carrier release                | Carrier file spec update                           |
| Accounting/tax integrations     | Per provider release               | API or file format change                          |
| Marketing consent law           | Semiannual plus legal update       | CAN-SPAM, CASL, GDPR, TCPA, platform policy change |

Every update creates or confirms a rule-version record. Do not silently edit
historical expectations.

---

## Executable Spec Harness

Executable spec tests live in `packages/spec-tests`. This package is
implementation-independent: it tests requirements, fixtures, golden expected
outputs, statutory source metadata, and invariants before those behaviors are
wired into the web application.

The first automated suites cover US state employment packets plus the named
high-risk invariants for accounting, payroll, tenancy, sensitive-data access,
workflow/integration safety, and marketing consent. They check all-state `R0`
employment coverage, I-9 timing and retention, effective-dated employment
records, double-entry balance, closed-period controls, source document
reconciliation, FX settlement, bank-feed idempotency, payroll immutability,
gross-to-net reconciliation, tax ceilings, withholding versions, garnishment
priority, custom-field isolation, tenant filtering, MFA-sensitive reads,
notification action safety, and suppression/consent history.

Run it with:

```sh
pnpm test:spec
```

Run the high-signal role-security and operational-security gate with:

```sh
pnpm test:security
```

As production code matures, each pure resolver in `packages/spec-tests/src`
should be replaced or paired with a thin adapter that calls the real domain
service. The requirement cases and golden fixtures should remain stable unless
the spec or source-versioned law changes.

## Promotion Criteria

### From Spec To Planned Test

- Requirement source is identified.
- Risk is assigned.
- Persona and workflow are identified.
- Expected evidence is listed.

### From Planned Test To Fixture

- Named fixture exists.
- Positive and negative variants exist.
- Expected output is defined.
- Jurisdiction and effective-date basis are recorded.

### From Fixture To Automated Test

- Automation layer is selected.
- Test can run deterministically.
- Sensitive fake data passes validators.
- External dependencies are mocked or contract-tested.
- Golden artifacts are reviewed.

### From Automated Test To Release Gate

- Test is in CI or an explicit pre-release suite.
- Failure blocks the relevant module.
- Owner is assigned for triage.
- Flaky behavior is fixed or quarantined with an expiry date.

---

## High-Risk Release Gates

An `R0` feature cannot be released unless:

- Traceability is complete.
- Fixtures and golden outputs are reviewed.
- Positive, negative, permission, audit, and invariant tests pass.
- Statutory source versions are recorded where applicable.
- Manual compliance review is complete where automation cannot verify law.
- Data retention and audit rules are tested.
- Cross-tenant isolation is tested.
- Rollback/correction behavior is defined.

---

## Bug Triage Rules

Classify bugs by violated invariant or requirement:

- `P0`: Payroll/accounting/tenant/PII/statutory output wrong in a way that could
  harm customers or expose data.
- `P1`: High-impact workflow incorrect, blocked, or insecure.
- `P2`: Normal workflow defect.
- `P3`: Cosmetic, copy, or low-risk display defect.

For `P0` and `P1`:

- Add a regression test before closing.
- Check whether fixtures are too weak.
- Check whether the spec is ambiguous.
- Check whether audit, alerting, or reconciliation should have caught it.
- Add a lessons-learned entry if the failure mode was not already documented.

---

## Compliance Review Packet

For employment/payroll/accounting/benefits compliance changes, reviewers should
receive:

- Requirement IDs.
- Source URLs and retrieval dates.
- Effective date assumptions.
- Fixture IDs.
- Expected documents or reports.
- Expected calculations.
- Screenshots or golden artifacts when UI/document output matters.
- Audit-event examples.
- Negative cases.
- Open legal/product questions.

---

## Automation Backlog Shape

Use one backlog item per traceable requirement group:

```text
Title: test(<module>): <workflow or invariant>
Sources:
- <spec file and requirement IDs>
- <external source URL if applicable>
Fixtures:
- <fixture IDs>
Expected evidence:
- <data/document/audit/report>
Risk: R0/R1/R2/R3
Test layers:
- <unit/workflow/API/UI/invariant/golden>
Reviewer:
- <owner>
```

This keeps test work schedulable without losing the requirement context.

---

## Open Governance Questions

These should be resolved before high-risk automation begins:

- Where will the traceability matrix live: markdown table, CSV, database table,
  or generated artifact?
- Where will non-PII golden files live?
- How will PII-bearing statutory form renderings be verified without committing
  sensitive content?
- Which compliance sources require legal counsel review before implementation?
- What is the rule for accepting third-party tax/payroll provider calculations?
- Which tests block every PR, and which run as nightly or pre-release suites?
