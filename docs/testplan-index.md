# Spec-Based Test Plan Index

**Status:** draft
**Created:** August 29, 2026
**Scope:** Test planning from product and module specifications, not from the
current implementation.

---

## Purpose

This document set defines how Kaaj will be tested against the specifications.
The current application is still being built, so these plans intentionally test
the target product behavior described in the specs rather than the routes,
repositories, or screens that happen to exist today.

The central rule is simple:

> A feature is not covered until the requirement, workflow, data, permission,
> audit trail, document output, negative path, and jurisdiction behavior are all
> explicitly testable.

---

## Document Set

1. [testplan-methodology.md](./testplan-methodology.md)
   - Test philosophy, traceability model, evidence model, and review gates.
2. [testplan-traceability.md](./testplan-traceability.md)
   - How to map `US-*`, `FR-*`, `BR-*`, validation, API, reporting, security,
     and integration requirements into executable coverage.
3. [testplan-module-coverage.md](./testplan-module-coverage.md)
   - Module-by-module coverage matrix across people, operations, finance,
     marketing, support, documents, and AI.
4. [testplan-high-risk-invariants.md](./testplan-high-risk-invariants.md)
   - Catastrophic-risk areas: payroll, accounting, tenancy, PII, permissions,
     documents, workflows, and integrations.
5. [testplan-role-security.md](./testplan-role-security.md)
   - Exhaustive RBAC, ABAC, field-level, document, export, AI, tenant, audit,
     and CI authorization checks.
6. [testplan-us-state-employment.md](./testplan-us-state-employment.md)
   - Dedicated US employment-record and statutory-document coverage for all 50
     states plus DC, with deep dives for NJ, NY, MA, CA, WA, and PA.
7. [testplan-fixtures.md](./testplan-fixtures.md)
   - Golden tenants, golden employees, jurisdiction scenarios, and expected
     outputs needed for repeatable spec tests.
8. [testplan-execution-governance.md](./testplan-execution-governance.md)
   - How tests are reviewed, versioned, updated for law changes, and promoted
     from spec plan to automated test suites.

---

## Primary Internal Authorities

- [product-specification.md](./product-specification.md)
- [module-firm-profile.md](./module-firm-profile.md)
- [module-employee-profile.md](./module-employee-profile.md)
- [module-hr.md](./module-hr.md)
- [module-compensation.md](./module-compensation.md)
- [module-payroll.md](./module-payroll.md)
- [module-change-requests.md](./module-change-requests.md)
- [module-accounting.md](./module-accounting.md)
- [accounting-gap-analysis.md](./accounting-gap-analysis.md)
- [module-time-tracking.md](./module-time-tracking.md)
- [module-project-management-v2.md](./module-project-management-v2.md)
- [service-provider-modules-overview.md](./service-provider-modules-overview.md)
- [module-ticketing.md](./module-ticketing.md)
- [module-ai-assistant.md](./module-ai-assistant.md)
- [module-marketing.md](./module-marketing.md)
- [06-customization-model.md](./06-customization-model.md)
- [05-architecture-decisions.md](./05-architecture-decisions.md)
- [api-surface.md](./api-surface.md)
- [packages/database/reference/schema.sql](../packages/database/reference/schema.sql)

---

## Risk Ranking

Every requirement receives a risk class before test design:

| Risk | Meaning                                                                   | Required Evidence                                                                                                    |
| ---- | ------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------- |
| `R0` | Catastrophic compliance, payroll, accounting, tenancy, or privacy failure | Golden fixtures, invariant tests, negative tests, audit tests, source-versioned regulatory references, manual review |
| `R1` | High user or financial impact                                             | Workflow tests, permission tests, negative tests, audit tests                                                        |
| `R2` | Normal product workflow                                                   | Positive and negative tests, role coverage                                                                           |
| `R3` | Low-risk display or convenience behavior                                  | Smoke tests and accessibility checks                                                                                 |

No `R0` requirement can be marked complete by UI tests alone.

---

## Definition Of Covered

A requirement is covered only when all applicable items below are defined:

- Requirement identifier and source document.
- Persona and role/permission boundary.
- Positive path.
- Negative path.
- Edge cases.
- Required fixture data.
- Expected data mutation or derived result.
- Expected audit event.
- Expected notification, if applicable.
- Expected document, statutory notice, report, or export, if applicable.
- Jurisdiction and effective-date assumptions.
- Retention and deletion behavior.
- Test owner and review cadence.

---

## Highest Risk Areas

The first testing investment should go into these areas:

1. US state employment records and statutory documents.
2. Payroll gross-to-net, taxes, deductions, garnishments, filings, reversals,
   and locked-run immutability.
3. Accounting double-entry, period close, tax, FX, reconciliation, and audit.
4. PII encryption, document access, and decrypted-read audit logs.
5. Multi-tenant isolation and role-based access boundaries.
6. Benefits eligibility, life events, dependent verification, carrier exports,
   and payroll deduction reconciliation.
7. Workflow engines that modify money, employment status, payroll, benefits,
   or customer communications.
8. Marketing consent, suppression, unsubscribe, bounce, and deliverability
   rules.

---

## Review Gates

Each `testplan-*` document should be reviewed before implementation work begins
for a module. Reviews must answer:

- Does every spec requirement have a coverage path?
- Are catastrophic failures tested as invariants, not only examples?
- Are legal sources cited with effective dates?
- Are jurisdiction-specific tests explicit?
- Are audit and permission expectations present?
- Are fixtures realistic enough to catch cross-module errors?
- Are negative cases stronger than "missing required field" tests?
