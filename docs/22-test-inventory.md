# Test Inventory — What Actually Runs Today

Unlike the `testplan-*.md` set (spec-derived, target coverage for the product
as designed), this is an inventory of the tests that exist in the repository
right now and actually execute in CI — one row per test file, counted and
grouped by the module it exercises. Counts were generated from the running
suites on 2026-09-23; re-run the commands below to refresh them rather than
trusting this file once it drifts.

```bash
pnpm --filter @kaaj/web run test          # unit tests (vitest) — 1,166 tests, 59 files
pnpm --filter @kaaj/web e2e                # end-to-end (Playwright) — 139 tests, 7 spec files
./check                                    # schema/RLS/invariant harnesses — 25 steps
```

`./check` is required before every push; `e2e` is not part of it (deliberately
— see `playwright.config.ts`'s own comment) and is run separately.

---

## 1. Unit tests (vitest) — grouped by module

1,166 tests across 59 files. Counts below are per file; the indented lines
are that file's top-level `describe` blocks, not every `it`.

### Accounting & Finance — 401 tests

The largest single area by a wide margin: general ledger, AR, AP, tax,
financial statements, payment processing, exports.

- `lib/server/accounting/conformance/acs.conformance.ts` [211 fixtures] — the
  accounting conformance suite (docs/34): one case per YAML fixture in
  `packages/database/conformance/scenarios/`, run with `pnpm db:acs run`
  against the suite's own cluster. Deliberately NOT matched by the default
  vitest include, so `./check` does not need that cluster.
- `lib/server/accounting/accounting.test.ts` [55] — general ledger, accounting
  periods, invoices, AR aging, customer balances, trial balance (+ comparison),
  P&L (+ comparison), balance sheet (+ comparison), cash flow (+ comparison),
  statement of changes in equity (+ comparison)
- `lib/server/accounting/statement-import/statement-import.test.ts` [57] —
  the bank statement parser, no database: amounts and dates (never a float,
  never rounded, never a guessed format), CSV shaped like common US, UK,
  Indian and German exports, card statements, the running-balance check,
  stable duplicate ids, OFX 1.x/2.x/QFX, encodings, refused spreadsheets
- `lib/server/accounting/statement-import.writes.test.ts` [10] — importing a
  statement: lines written unmatched with their import, a repeat or
  overlapping statement adding only what is new, look-alike lines flagged;
  the banking page's balance is the day's last one in either file order and
  carries forward over lines that print none; finance may import, a plain employee cannot see the account, an auditor
  reads but cannot write
- `routes/(app)/accounting/banking/import/page.server.test.ts` [7] — the
  import page's actions on every path that writes nothing: preview, a
  missing file, a spreadsheet by content, a plain employee refused, and the
  import refused without a preview, after the file changed, or before the
  direction is confirmed
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
- `lib/server/accounting/gl_daily_balances.test.ts` [5] — the per-day ledger
  table the reports read agrees with the posted lines: as the fixture
  stands, after a posted journal, as a draft is posted, re-dated and deleted,
  and after two concurrent posts to one account and day (without the
  advisory lock the second overwrites the first — watched failing); two
  transactions posting to the same accounts in opposite orders finish
  (per-account locks deadlocked here — watched failing)
- `lib/server/db/paged.test.ts` [6] — the paged AR aging, customer
  balances, AP due soon and FX revaluation (receivables and payables
  separately) stitch back, page by page, into exactly the unpaged report,
  and every page's total is the full row count

### Payroll & Compensation — 37 tests

- `lib/payroll/export-formats.test.ts` [9] — each provider's import file
  byte for byte (ADP RUN, ADP Workforce Now, Gusto, Paychex Flex), blanks
  never zeros, the Workforce Now character set and second record, a name a
  spreadsheet would run as a formula
- `lib/server/payroll/payroll_export.test.ts` [8] — daily, weekly and double
  time against a written-out oracle, a workweek that starts before the
  period, ineligible and salaried employees, unapproved hours, prorated time
  off, what refuses the file
- `routes/(app)/payroll/export/file/payroll-export-file.test.ts` [5] — the
  download as the refused employee and the permitted payroll admin, the
  audit entry, leave mapped to "not exported", period and frequency limits
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

### Projects & Time Tracking — 81 tests

- `lib/server/projects/projects.writes.test.ts` [33] — task counters, moving
  a task, creating/editing a project; subtasks (depth_level, one level only,
  same-project parent) and task dependencies (cycle detection, the
  `blocks_task_ids` reverse index scoped to its own project, the "blocked
  by" annotation appearing and clearing, the `no_self_dependency` CHECK
  fired directly, bypassing the repository) — docs/23-project-management-phase1.md
- `lib/server/objectives/objectives.test.ts` [10] — objective rollup
  (progress_percentage, health_status, actual_revenue) recomputed from
  linked projects, never incremented, on both the create path and the
  edit-a-previously-unlinked-project path — docs/23-project-management-phase1.md
- `routes/.../objectives/page.server.test.ts` [1] and
  `routes/.../objectives/[id]/page.server.test.ts` [1] — the `create` and
  `updateObjective` actions' audit entries, against the REAL deployed
  action (not a simulation): exactly one entry, diffing only the intended
  fields, nothing else leaking in
- `routes/.../projects/[id]/kanban.test.ts` [3] — the Kanban board shares
  the list view's `moveTask` control (one `{#snippet}` definition, more
  than one render site, exactly one `?/moveTask` form) rather than forking
  a second status-writing path
- `lib/server/projects/projects.test.ts` [10] — the project list, tasks,
  client-visible slice
- `lib/server/time-tracking/time_tracking_entries.writes.test.ts` [12] —
  logging time keeps task/project hours true, including when a PLAIN
  employee who sees only their own entries logs (the total and the `TE-nnn`
  number still span everyone's, L106); `ownEntriesOnly` names a plain
  employee and narrowing to them changes nothing they see, and is null for
  someone the policy lets see everything (L117); a capped count stops at
  its cap and an uncapped one does not
- `lib/server/projects/comments.repo.test.ts` [8] — adding, editing and
  soft-deleting a task comment; refuses a task from a different project or
  no such task; the fixture's own pre-existing comment is real coverage, not
  a placeholder — docs/25-project-management-phase2.md
- `lib/server/projects/templates.repo.test.ts` [8] — `saveAsTemplate`
  captures only top-level tasks (never a subtask), computes
  `due_offset_days` relative to the earliest due date, captures no
  assignee/dates/dependencies, refuses a missing project/template,
  `recordUse` is a plain increment — docs/25-project-management-phase2.md

### Ticketing — 7 tests

- `lib/server/ticketing/ticketing.writes.test.ts` [7] — a ticket's area,
  category and subcategory form a chain the SCHEMA holds: no area, a
  category from another area, and a subcategory from another category are
  each refused by name, beside the consistent insert that is accepted;
  `createTicket` refuses the same two mismatches itself, naming which.

Beyond that, coverage is indirect: 8 RLS assertions inside
`db/row-visibility.test.ts` (below), plus e2e (§2).

### CRM — 26 tests

- `lib/server/customers/customers.writes.test.ts` [15] — person accounts, the
  shape where a client is an individual rather than a business.
  `personName` joins, trims, and handles a mononym without a dangling space.
  `createIndividual` writes the `customers` row and its single
  `customer_contacts` row together with the account name derived, invents no
  industry/size/website, accepts a client with **no email at all** (the case
  `20261001100000` exists for), lets two such clients coexist because NULLs
  are distinct under `UNIQUE (tenant_id, email)`, and is refused by name on
  an address already on file. `updateIndividual` renames both rows so the
  derived name cannot drift, keeps the account's email in step with the
  contact's copy, leaves the client still a person account, and returns
  `false` rather than claiming success for a client that does not exist
  (L68). `isPersonAccount` — the single predicate the page and the save
  action share — treats an individual with none or several contacts as a
  company, which is the case that made such a row unsaveable when the two
  disagreed.
- `lib/server/crm/deals.repo.test.ts` [11] — the pipeline board's read path.
  `listForBoard` caps each COLUMN independently (a single `LIMIT` over the
  board would starve the later stages), expands only the named column, takes
  the newest of a column rather than an arbitrary slice, and asks for no
  stage without passing `''` to a cast (L37). `stageSummary` counts what the
  column HOLDS rather than what the board loaded — counting the loaded cards
  would report the page size as the pipeline — keeps a column's currencies
  apart instead of adding USD to GBP (BR-FP-003), sums exactly in SQL as a
  string (`0.10 + 0.20` is `0.30`, where JavaScript gives
  `0.30000000000000004`), and still counts a deal that carries no value.
  The expand-stage parameter is exercised with every shape a query string can
  actually produce — absent, `""`, malformed, and a well-formed uuid that is
  not a stage. It previously asserted only `null`, the one value never at
  risk, and passed while `/crm/pipeline?stage=` was a live Internal Error.

Beyond that, coverage is indirect: the CRM RLS assertions inside
`db/row-visibility.test.ts` (below), plus e2e (§2).

### Custom fields — 26 tests

- `lib/server/custom-fields/custom-fields.repo.test.ts` [26] — definitions
  ordered General first, then by category first use, then within the
  category; a ticket area sees only its own fields; move within a category;
  rename a category including archived fields; archive only within the
  page's scope. The schema refuses a duplicate key with no area, an unknown
  entity type, a ticket field without an area (and an area elsewhere), a
  value naming two records or none, a value for another kind of record's
  field, and a value for a missing record. `saveValues` round-trips every
  type, reports only what changed, clears to an all-NULL row, and refuses
  an unknown or out-of-scope definition, another area's ticket field, an
  unreadable record and an off-list option. Company and deal fields save and
  list under their categories, and a company field is refused on a deal. Visibility (ticket values follow
  the ticket, for a portal contact and a private ticket) is in
  `row-visibility.test.ts`.

### Documents — 4 tests

`lib/server/documents/documents.repo.test.ts` [4] covers only the
entity-rooted-folder addition for task files (docs/25-project-management-phase2.md):
`defaultFolderForEntity` is lookup-or-create (idempotent on a second call),
the folder it creates is `company`-visibility, and `forEntities` groups by
entity id and never crosses entity types. Nothing else under
`lib/server/documents/` has a unit test — folder sharing, archiving,
visibility, and `upload.ts`'s own Storage-writing path are still covered
only by two e2e render checks (`smoke.spec.ts`, §2), no write path, no
refusal.

### Team Chat — 13 tests

Deliberately NOT left at documents'/ticketing's bar (0) — `team-chat.repo.ts`
hides two genuinely non-obvious Postgres RLS/trigger interactions
(docs/10-lessons-learned.md L93/L95), and both have a permanent regression
test rather than only having been fixed once and trusted to stay fixed.

- `lib/server/team-chat/team-chat.writes.test.ts` [10] — `findOrCreateDm`
  idempotency and `member_ids` seeding, `joinPublicChannel`'s first-ever-join
  and leave/rejoin cases (the L93/L95 regression guard), keyset pagination,
  the deleted-message tombstone, refusing to edit/delete someone else's
  message, unread-count recompute (§2's "recomputed, not maintained"),
  `archiveChannel` and its double-archive refusal; the sidebar holds the 50
  most recent conversations, counts the rest, and finds an older one by
  name (watched failing without the cap).
- `lib/server/team-chat/realtime.test.ts` [3] — the SSE relay's in-process
  fan-out (docs/20-team-chat.md §5), against a real `pg_notify` on the
  shared pool rather than a mock: a subscribed conversation/tenant pair
  receives the pointer frame, a different tenant on the same conversation
  id never does, and `unsubscribe()` actually stops delivery.

### Tenancy, RLS & Row Visibility — 203 tests

Cross-cutting by nature — asserts what every module's RLS policy actually
does, as the DEPLOYED enforcement (see CLAUDE.md's note on this suite vs.
`packages/spec-tests`).

- `lib/server/db/row-visibility.test.ts` [238] — staff directory, pay, RLS
  vs. `can()` agreement, tenant isolation, "Tier 1: every role sees what it
  should" (80 tests spanning compensation, HR, projects, tickets and more),
  feedback visibility, accounting visibility (71 tests), customer portal,
  team chat (6 — member vs. non-member, public-before-join vs. private,
  a DM's own two participants, the owner override, a portal contact seeing
  nothing at all per 20§1)
  identity, ticketing (9 — includes a business-area GROUP grant, additive to
  individual membership), projects (4 — opt-in `is_restricted`, group
  grants, `reads_all_projects()`, and a task following its project's
  visibility; docs/28-user-groups.md), a child row visible exactly when its
  parent is (3 — ticket attachments, a restricted project's custom field
  value), and the error log having no application reader (1). The "Tier 1"
  table spec also covers `hr_benefits_enrollments`, `payroll_runs`,
  `payroll_tax_deposits` and the three time-tracking tables, and RLS/`can()`
  agreement covers `app.approves_time_entries()`.
  A portal contact reads only their own company and none of the CRM —
  deals, activities, stages, or contact, company and deal custom fields —
  and cannot write a company; staff still read all of it.
- `lib/server/db/tenant.test.ts` [7] — `withTenant`

### Auth & Authorization — 187 tests

- `lib/server/auth/sso-enforcement.test.ts` [7] — `isSsoSatisfied` for a
  tenant that requires SSO: a SAML session is recognised from `amr`, an OIDC
  one from its identity provider, a password session is refused, and a tenant
  with no SSO configured is unaffected (ADR-010).
- `lib/server/db/subdomain.test.ts` [7] — `extractSubdomain` across
  `.localhost`, a port, an IPv4 host and the apex, which is what routes a
  sign-in to the right tenant's identity provider before any session exists.

- `lib/server/auth/action-authz.test.ts` [145] — per-action authorization
  matrix across compensation, employees, settings (company, locations,
  departments, holidays, benefits, job-titles, payroll policies/schedules),
  performance, projects (create/updateProject/addTask/moveTask/
  addDependency/removeDependency) and objectives (create/updateObjective/
  addProject) — the last two closed a gap `projects` had even before
  docs/23-project-management-phase1.md; "the matrix covers every action
  that exists"
- `lib/server/auth/can.test.ts` [28] — the floor, separation of duties,
  owner/firm_admin, derived managers, bundle composition, reading vs.
  revealing a sensitive value. Module access vs. row visibility:
  `projects.read` is held by every staff role (it gates the module; the
  rows are `project_visibility` RLS) and refused for a `customer` base
  role — the only branch where it answers false, so the guard is observed
  failing rather than assumed to work.

### Audit — 18 tests

- `lib/server/audit/audit.test.ts` [18] — writing to the trail, the trail
  cannot be rewritten, reading the trail, the change record's shape, what
  must never reach the trail

### PII, Secrets & Disclosure — 117 tests

- `lib/server/security/disclosure.test.ts` [62] — the disclosure matrix
- `lib/server/pii/pii.test.ts` [32] — the envelope, the stored fixture,
  writing an encrypted field, GDPR Art. 17 erasure, key rotation, two kinds
  of subject
- `lib/server/db/secrets.test.ts` [23] — a dedicated tenant's sealed
  connection string (docs/24-deployment-and-pooling.md §5.2): round trip,
  never in the clear, same wire format as `pii/envelope.ts` in both
  directions, refused on another tenant's row / wrong key / tampering / a
  key version dropped from the ring, still opens after key rotation,
  `resolveSecret` for sealed and plain env-var refs, and `resolveTarget`
  routing through a sealed ref (control plane mocked — no shared-DB write).

### Forms, Formatting & Shared Infrastructure — 89 tests

Not module-specific — every page's form and every money/date/locale render
goes through these.

- `lib/server/forms.test.ts` [36] — `FormReader`: three outcomes not two
  (L33), the column type is not the validator (L34), values that feed
  `Intl`, decimal bounds compared as decimals, a password read exactly as
  typed (never trimmed). Plus `uuidParam`, which is
  the query string's equivalent of `f.uuid()` — `""` and a malformed value
  both answer null rather than reaching a `::uuid` cast and raising (L37).
- `lib/format.test.ts` [27] — `money`, `money` (compact), `calendarDate`,
  `instant`, `currentTimeIn`, `localised`, `number`, `hours`
- `lib/server/rich-text.test.ts` [9] — `sanitizeRichText`
- `lib/mailer.test.ts` [7] — templated email send/failure
- `lib/errors.test.ts` [5] — `safeError`
- `lib/decimal.test.ts` [5] — `compareDecimal`
- `lib/validation.test.ts` [4] — `@kaaj/validation` resolves from apps/web

### Settings & Admin — 20 tests

- `routes/(app)/settings/company/logo.server.test.ts` [9] — upload/remove
  logo, validation and the real local Storage service
- `routes/(admin)/account/api/page.server.test.ts` [4] — email subscription
  toggle
- `lib/server/groups/groups.repo.test.ts` [7] — create/archive, the fixture's
  own pre-existing group and membership as real coverage,
  `setMembers`' replace-whole-list-not-delete (docs/28-user-groups.md). Its
  effect on ticketing and project visibility is asserted separately, in
  `row-visibility.test.ts` (Tenancy section above).

### UI / Navigation infrastructure — 14 tests

- `lib/components/admin-layout/helpers.test.ts` [9] — `visibleMenuItems`,
  `getActivatedItemParentKeys`
- `lib/permissions.test.ts` [5] — `has`/`hasAny` over the viewer's capability
  list, which is what decides whether a row offers an edit icon. Hiding a
  control is navigation hygiene, never access control (L44) — the action's
  own `requireCan` is what refuses.

### Misc — 1 test

- `src/index.test.ts` [1] — placeholder (`sum test`)

---

## 2. End-to-end tests (Playwright) — grouped by purpose

154 tests across 7 spec files plus one setup project. Unlike the unit suite,
these files are organized by TESTING PURPOSE rather than by module — each
spans many modules. Real browser, real login, no mocks; the fixture is
shared and read-only except where a file's own header says otherwise.

- **`smoke.spec.ts` [72]** — every module page renders for a signed-in owner:
  its own heading, the nav shell, zero console errors. One entry per route
  (employees, time-off, attendance, performance, onboarding, compensation,
  objectives, projects, time-tracking, payroll, all 19 accounting pages,
  ticketing, documents, chat, all 9 settings pages, and all 6 CRM pages —
  including a business client and a person account, whose detail pages render
  different layouts off the same route), plus the
  unauthenticated-redirect check, the directory-has-real-rows check, the
  assistant panel, the tax-rate Type select population check, and three
  project-management checks (the Add-task Parent select is scoped to the
  project's own top-level tasks, the Kanban board's column/card structure,
  and the List↔Kanban toggle firing no network request either way).
- **`form-errors.spec.ts` [60]** — a refused form names the field, marks it,
  and the form survives. Spans accounting (invoices, bills, journal entries,
  periods, year-end close, tax rates, banking, recurring schedules, Stripe),
  HR (holidays, employee IDs, ticketing), compensation, time-tracking,
  projects (a dependency cycle reads as a sentence, not a crash page),
  objectives (an invalid target end date), company settings, team chat
  (empty channel name, empty message), CRM (a client's duplicate email —
  the uncaught 500 the constraint registry now answers for — and a crafted
  POST adding a second contact to a person account, refused by the action
  rather than only hidden), and custom fields (a duplicate field
  name marked only in the editor it came from; a required ticket field named
  by its label).
- **`theme.spec.ts` [9]** — light/dark/system application, actual paint
  (canvas-measured per CLAUDE.md's colour rule), fallback on a deleted or
  garbage stored theme, where theme selection lives in the UI.
- **`portal.spec.ts` [3]** — the customer portal is switched off: a
  contact's sign-in reaches no firm, the `/portal` pages return 404, and a
  sweep of staff routes confirms none renders for a contact.
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

| Suite                           | Proves                                                                                                                                                                                                                                                           | Scale          |
| ------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------- |
| tenant isolation                | every RLS policy filters, per table                                                                                                                                                                                                                              | 672 assertions |
| specification                   | the schema answers the module specs                                                                                                                                                                                                                              | 173            |
| schema invariants               | ADR design rules hold, closed on a bad claim                                                                                                                                                                                                                     | 157            |
| structure snapshot              | schema is exactly what was committed                                                                                                                                                                                                                             | 4,290 lines    |
| security                        | authorization, PII, tenant isolation (both suites)                                                                                                                                                                                                               | 360            |
| provisioning script             | `node --test scripts/provision-tenant.test.mjs` — NOT in `./check`; DB cases need `PROVISION_TEST_PG`: provisions, dry-run writes nothing, duplicate refused, registration atomic, no password/DSN leak, restricted login, Management API against a fake `fetch` | 18             |
| tenant SSO script               | `node --test scripts/configure-tenant-sso.test.mjs` — NOT in `./check` and NOT in CI (`scripts/` is not a workspace package, so turbo never reaches it); run it by hand when touching the script. Pure/refusal/mocked-`fetch` cases always run; the one database case needs a throwaway Postgres SUPERUSER                                                 | 18             |
| + 16 more single-purpose checks | authz, actor propagation, no-backtick, no-loop-query, scale classification, unprotected fallback, sensitive-column classification, audit coverage, refusal messages, service-role quarantine, fixture completeness, dedicated-tenant reachability                | —              |

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
- **Ticketing's write paths are barely tested.** Only ticket creation's
  area/category/subcategory chain has a unit test; task lifecycle, linking
  and sharing are covered by nothing but the RLS assertions in
  `row-visibility.test.ts` and the render/refusal checks in
  `smoke.spec.ts`/`form-errors.spec.ts`.
- **`accounting.writes.test.ts` and `receivables.writes.test.ts` are the
  two largest files in the repo** (58 and 73 tests) — a reasonable split
  candidate if either grows further, matching the existing
  `payables.test.ts`/`payables.writes.test.ts` read/write split.
