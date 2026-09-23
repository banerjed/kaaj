# Test Inventory — What Actually Runs Today

Unlike the `testplan-*.md` set (spec-derived, target coverage for the product
as designed), this is an inventory of the tests that exist in the repository
right now and actually execute in CI — one row per test file, counted and
grouped by the module it exercises. Counts were generated from the running
suites on 2026-09-23; re-run the commands below to refresh them rather than
trusting this file once it drifts.

```bash
pnpm --filter @kaaj/web run test          # unit tests (vitest) — 1,077 tests, 54 files
pnpm --filter @kaaj/web e2e                # end-to-end (Playwright) — 134 tests, 7 spec files
./check                                    # schema/RLS/invariant harnesses — 25 steps
```

`./check` is required before every push; `e2e` is not part of it (deliberately
— see `playwright.config.ts`'s own comment) and is run separately.

---

## 1. Unit tests (vitest) — grouped by module

1,077 tests across 54 files. Counts below are per file; the indented lines
are that file's top-level `describe` blocks, not every `it`.

### Accounting & Finance — 332 tests

The largest single area by a wide margin: general ledger, AR, AP, tax,
financial statements, payment processing, exports.

- `lib/server/accounting/accounting.test.ts` [55] — general ledger, accounting
  periods, invoices, AR aging, customer balances, trial balance (+ comparison),
  P&L (+ comparison), balance sheet (+ comparison), cash flow (+ comparison),
  statement of changes in equity (+ comparison)
- `lib/server/accounting/accounting.writes.test.ts` [58] — posting a journal
  entry, recording a manual journal entry, closing/reopening a period,
  year-end close, immutability of a posted entry, control-account tie-out,
  statement checks are real not vacuous, tax-exempt customers, tax liability
  by jurisdiction, accruals & amortization (§11), invoice PDF generation
- `lib/server/accounting/receivables.writes.test.ts` [73] — creating/issuing
  an invoice, receiving a payment, settlement FX gain/loss, lockbox payments
  across multiple invoices, credit memos, bad-debt write-off, voiding,
  payment reminders, recurring invoice schedules
- `lib/server/accounting/payables.writes.test.ts` [55] — creating/approving a
  bill, paying a vendor, batch vendor payment runs, settlement FX gain/loss,
  matching a bank transaction to a payment, bank reconciliation rules
- `lib/server/accounting/payables.test.ts` [16] — bills, AP due soon, bank
  accounts, bank transactions
- `lib/server/accounting/stripe_gateway.test.ts` [12] — Stripe integration
- `lib/server/accounting/tax_rates.writes.test.ts` [6] — tax rate CRUD
- `lib/server/accounting/csv.test.ts` [6] — `toCsv`
- `lib/server/accounting/invoice_pdf.test.ts` [6] — `renderInvoicePdf`
- `lib/server/accounting/fx_revaluation.test.ts` [4] — FX revaluation report
- `lib/server/accounting/fx_rates.test.ts` [3] — `refreshExchangeRates`
- `routes/.../accounting/report-export.test.ts` [18] — CSV export, six reports
- `routes/.../accounting/invoices/[id]/page.server.test.ts` [7] — email
  invoice, Stripe payment link creation
- `routes/.../accounting/payment-gateway/page.server.test.ts` [6] — save/
  disconnect
- `routes/.../accounting/invoices/page.server.test.ts` [3] — send reminders
- `routes/.../accounting/{ap-due-soon,fx-revaluation,ledger}/export/row-cap.test.ts`
  [1 each, 3 total] — export row-cap guards

### Payroll & Compensation — 46 tests

- `lib/server/payroll/payroll_lifecycle.test.ts` [18] — opening/calculating a
  run, separation of duties, one-way transitions, the two status columns
  cannot diverge
- `lib/server/payroll/payroll.test.ts` [13] — figures add up, money stays a
  string, runs across jurisdictions, a person's payslip history
- `lib/server/compensation/compensation_base.test.ts` [9] — effective dating
- `lib/server/compensation/compensation.test.ts` [6] — current pay, as
  different people

### HR & Employee Lifecycle — 94 tests

- `lib/server/hr/performance.test.ts` [38] — a manager's assessment hidden
  until submitted, who sees which reviews, the cycle, goals, feedback
  anonymity, who may read which feedback, writing a review
- `lib/server/hr/onboarding.test.ts` [14] — choosing a template, the plan it
  produces, a hire's actual tasks
- `lib/firm-profile/pay-dates.test.ts` [11] — `nextPayDates` (monthly,
  bi-weekly, weekly, semi-monthly), clash detection
- `lib/server/hr/attendance.test.ts` [9] — attendance hours, office timezone
- `lib/server/hr/time_off.test.ts` [8] — balances, policies, approving
- `lib/firm-profile/regional.test.ts` [7] — brand-color contrast
- `lib/server/employee-profile/employees.test.ts` [4] — the directory, by role
- `lib/firm-profile/fixture-projection.test.ts` [3] — the fixture's own pay
  schedules

### Projects & Time Tracking — 35 tests

- `lib/server/projects/projects.writes.test.ts` [18] — task counters, moving
  a task, creating/editing a project
- `lib/server/projects/projects.test.ts` [10] — the project list, tasks,
  client-visible slice
- `lib/server/time-tracking/time_tracking_entries.writes.test.ts` [7] —
  logging time keeps task/project hours true

### Ticketing — 0 dedicated unit tests

No `lib/server/ticketing/*.test.ts` exists. Coverage is indirect: 8 RLS
assertions inside `db/row-visibility.test.ts` (below), plus e2e (§2). No
unit test exercises `ticketing.repo.ts` write paths directly.

### Documents — 0 unit tests

No unit test file anywhere under `lib/server/documents/`. The only coverage
at all is two e2e render checks (`smoke.spec.ts`, §2) — no write path, no
sharing/permission logic, no refusal is exercised by any automated test.

### Team Chat — 12 tests

Deliberately NOT left at documents'/ticketing's bar (0) — `team-chat.repo.ts`
hides two genuinely non-obvious Postgres RLS/trigger interactions
(docs/10-lessons-learned.md L93/L95), and both have a permanent regression
test rather than only having been fixed once and trusted to stay fixed.

- `lib/server/team-chat/team-chat.writes.test.ts` [9] — `findOrCreateDm`
  idempotency and `member_ids` seeding, `joinPublicChannel`'s first-ever-join
  and leave/rejoin cases (the L93/L95 regression guard), keyset pagination,
  the deleted-message tombstone, refusing to edit/delete someone else's
  message, unread-count recompute (§2's "recomputed, not maintained"),
  `archiveChannel` and its double-archive refusal.
- `lib/server/team-chat/realtime.test.ts` [3] — the SSE relay's in-process
  fan-out (docs/20-team-chat.md §5), against a real `pg_notify` on the
  shared pool rather than a mock: a subscribed conversation/tenant pair
  receives the pointer frame, a different tenant on the same conversation
  id never does, and `unsubscribe()` actually stops delivery.

### Tenancy, RLS & Row Visibility — 198 tests

Cross-cutting by nature — asserts what every module's RLS policy actually
does, as the DEPLOYED enforcement (see CLAUDE.md's note on this suite vs.
`packages/spec-tests`).

- `lib/server/db/row-visibility.test.ts` [191] — staff directory, pay, RLS
  vs. `can()` agreement, tenant isolation, "Tier 1: every role sees what it
  should" (80 tests spanning compensation, HR, projects, tickets and more),
  feedback visibility, accounting visibility (71 tests), customer portal,
  team chat (6 — member vs. non-member, public-before-join vs. private,
  a DM's own two participants, the owner override, a portal contact seeing
  nothing at all per 20§1)
  identity, ticketing (8)
- `lib/server/db/tenant.test.ts` [7] — `withTenant`

### Auth & Authorization — 136 tests

- `lib/server/auth/action-authz.test.ts` [109] — per-action authorization
  matrix across compensation, employees, settings (company, locations,
  departments, holidays, benefits, job-titles, payroll policies/schedules),
  performance; "the matrix covers every action that exists"
- `lib/server/auth/can.test.ts` [27] — the floor, separation of duties,
  owner/firm_admin, derived managers, bundle composition, reading vs.
  revealing a sensitive value

### Audit — 18 tests

- `lib/server/audit/audit.test.ts` [18] — writing to the trail, the trail
  cannot be rewritten, reading the trail, the change record's shape, what
  must never reach the trail

### PII, Secrets & Disclosure — 94 tests

- `lib/server/security/disclosure.test.ts` [62] — the disclosure matrix
- `lib/server/pii/pii.test.ts` [32] — the envelope, the stored fixture,
  writing an encrypted field, GDPR Art. 17 erasure, key rotation, two kinds
  of subject

### Forms, Formatting & Shared Infrastructure — 89 tests

Not module-specific — every page's form and every money/date/locale render
goes through these.

- `lib/server/forms.test.ts` [32] — `FormReader`: three outcomes not two
  (L33), the column type is not the validator (L34), values that feed
  `Intl`, decimal bounds compared as decimals
- `lib/format.test.ts` [27] — `money`, `money` (compact), `calendarDate`,
  `instant`, `currentTimeIn`, `localised`, `number`, `hours`
- `lib/server/rich-text.test.ts` [9] — `sanitizeRichText`
- `lib/mailer.test.ts` [7] — templated email send/failure
- `lib/errors.test.ts` [5] — `safeError`
- `lib/decimal.test.ts` [5] — `compareDecimal`
- `lib/validation.test.ts` [4] — `@kaaj/validation` resolves from apps/web

### Settings & Admin — 13 tests

- `routes/(app)/settings/company/logo.server.test.ts` [9] — upload/remove
  logo, validation and the real local Storage service
- `routes/(admin)/account/api/page.server.test.ts` [4] — email subscription
  toggle

### UI / Navigation infrastructure — 9 tests

- `lib/components/admin-layout/helpers.test.ts` [9] — `visibleMenuItems`,
  `getActivatedItemParentKeys`

### Misc — 1 test

- `src/index.test.ts` [1] — placeholder (`sum test`)

---

## 2. End-to-end tests (Playwright) — grouped by purpose

134 tests across 7 spec files plus one setup project. Unlike the unit suite,
these files are organized by TESTING PURPOSE rather than by module — each
spans many modules. Real browser, real login, no mocks; the fixture is
shared and read-only except where a file's own header says otherwise.

- **`smoke.spec.ts` [58]** — every module page renders for a signed-in owner:
  its own heading, the nav shell, zero console errors. One entry per route
  (employees, time-off, attendance, performance, onboarding, compensation,
  projects, time-tracking, payroll, all 19 accounting pages, ticketing,
  documents, chat, all 9 settings pages), plus the unauthenticated-redirect
  check, the directory-has-real-rows check, the assistant panel, and the
  tax-rate Type select population check.
- **`form-errors.spec.ts` [53]** — a refused form names the field, marks it,
  and the form survives. Spans accounting (invoices, bills, journal entries,
  periods, year-end close, tax rates, banking, recurring schedules, Stripe),
  HR (holidays, employee IDs, ticketing), compensation, time-tracking,
  projects, company settings, and team chat (empty channel name, empty message).
- **`theme.spec.ts` [9]** — light/dark/system application, actual paint
  (canvas-measured per CLAUDE.md's colour rule), fallback on a deleted or
  garbage stored theme, where theme selection lives in the UI.
- **`portal.spec.ts` [5]** — the customer-facing portal: lands a contact on
  `/portal` not the staff app, a sweep asserting no staff route renders
  staff content for a customer contact, ticket-list scoping to the
  signed-in contact's own customer.
- **`rbac-boundaries.spec.ts` [4]** — specific access-control regressions:
  an unpermissioned settings read, cross-employee compensation visibility,
  server-side refusal of a client-gated action, IDOR via a raw request.
- **`adversarial.spec.ts` [3]** — SQL-special characters and wildcards in
  search behave as literal text, not a crash or a pattern; an unusual login
  email is an ordinary refusal, not a 500.
- **`access-lifecycle.spec.ts` [1]** — a terminated employee's session
  cannot reach the staff app.
- **`auth.setup.ts` [1, setup project]** — signs in once as the seeded
  owner; every `chromium`-project test reuses that session.

---

## 3. Database & schema verification (`./check`)

Not unit or e2e tests — SQL harnesses and Node scripts that assert
properties of the schema and its policies directly, independent of any
application code path. Full detail (what each proves, and what it
deliberately doesn't) is in `CLAUDE.md`'s own table under "What it runs";
summarized here rather than duplicated so it can't drift out of sync:

| Suite                           | Proves                                                                                                                                                                                                                                            | Scale          |
| ------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------- |
| tenant isolation                | every RLS policy filters, per table                                                                                                                                                                                                               | 672 assertions |
| specification                   | the schema answers the module specs                                                                                                                                                                                                               | 173            |
| schema invariants               | ADR design rules hold, closed on a bad claim                                                                                                                                                                                                      | 157            |
| structure snapshot              | schema is exactly what was committed                                                                                                                                                                                                              | 4,290 lines    |
| security                        | authorization, PII, tenant isolation (both suites)                                                                                                                                                                                                | 360            |
| + 16 more single-purpose checks | authz, actor propagation, no-backtick, no-loop-query, scale classification, unprotected fallback, sensitive-column classification, audit coverage, refusal messages, service-role quarantine, fixture completeness, dedicated-tenant reachability | —              |

`packages/spec-tests` is a second, independent authorization suite — spec-
derived rather than deployed-enforcement-derived — compared against the
first by `packages/spec-tests/tests/authz-conformance.spec.test.ts`.

---

## 4. Coverage gaps this inventory surfaces

Built while auditing what runs today, not from the spec — these are
observations, not a plan:

- **Documents has no unit tests and no write-path e2e coverage at all.**
  Folder/document CRUD, sharing, archiving and cross-user permission
  isolation were verified manually during development (per the feature's
  own commit) but nothing in either suite exercises them automatically.
- **Ticketing has no dedicated unit test file.** Its only coverage is 8 RLS
  assertions in `row-visibility.test.ts` and the render/refusal checks in
  `smoke.spec.ts`/`form-errors.spec.ts` — no test exercises
  `ticketing.repo.ts`'s write paths (task lifecycle, linking, sharing)
  directly.
- **`accounting.writes.test.ts` and `receivables.writes.test.ts` are the
  two largest files in the repo** (58 and 73 tests) — a reasonable split
  candidate if either grows further, matching the existing
  `payables.test.ts`/`payables.writes.test.ts` read/write split.
