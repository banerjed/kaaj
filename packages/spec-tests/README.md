# Spec Tests

This package turns the markdown test plans into executable, implementation-independent checks.

The first suites cover US state employment records, accounting, payroll, security, workflow/integration, and marketing-consent invariants. They are intentionally table-driven:

- `fixtures/` contains realistic fake workers and tenants.
- `requirements/` contains expected behavior extracted from `docs/testplan-*.md`.
- `src/` contains small pure functions that can later be replaced by adapters into production code.
- `tests/` verifies coverage, golden expected outputs, risk metadata, source governance, and high-risk invariants.

Current executable suites:

- `us-state-employment.spec.test.ts`: all 50 states plus DC onboarding packet coverage.
- `accounting-invariants.spec.test.ts`: double-entry balance, closed periods, source-to-ledger reconciliation, FX, bank-feed replay, and tax-line summaries.
- `employment-invariants.spec.test.ts`: I-9 timing, I-9 retention, purge eligibility, legal holds, and effective-dated employment records.
- `payroll-invariants.spec.test.ts`: run immutability, gross-to-net reconciliation, tax ceilings, India statutory deductions, withholding versions, garnishment priority, and custom-field isolation.
- `security-invariants.spec.test.ts`: tenant isolation, role/resource matrix coverage, sensitive read permissions, MFA, denied-body behavior, and bank masking.
- `security-operational.spec.test.ts`: search filtering, cache keys, webhook replay, scheduled report sends, credential checks, CSRF/rate limiting, and telemetry redaction.
- `security-traceability.spec.test.ts`: guardrail that documented role-security categories remain mapped to executable case IDs.
- `workflow-integration-invariants.spec.test.ts`: valid transitions, workflow-version pinning, idempotent callbacks, and notification action safety.
- `marketing-consent-invariants.spec.test.ts`: suppression precedence, historical consent snapshots, pending double opt-in, and duplicate-contact merge behavior.
- `high-risk-traceability.spec.test.ts`: guardrail that named catastrophic-risk areas remain represented.

Run it with:

```sh
pnpm --filter @kaaj/spec-tests test
```

Run the dedicated role-security gate with:

```sh
pnpm test:security
```

State-level employment packet rules are marked `planning-needs-state-source-review` until each state has official source URLs, retrieval dates, effective dates, and compliance review. Tests should not downgrade that status silently.

When production domain services exist, add adapter tests that feed these same fixtures into the real service and compare against the same expected outcomes.
