# Test Plan — Cycle 1

**Method:** [TESTING_GUIDELINES.md](TESTING_GUIDELINES.md). **Personas:**
[TESTING_GUIDELINES.md §1.2](TESTING_GUIDELINES.md#L1). **Built against:** the
running app at commit `d1882d7`, explored live via Playwright/Chrome plus
direct `psql` verification — every "confirmed" item below was reproduced, not
inferred from reading code.

This cycle already found two `R0` defects during the reconnaissance pass used
to write it (§0). Everything after that is the plan to run next: concrete
test cases, an execution vehicle for each (existing spec / new spec to write
/ vitest / manual), and a risk class, organized so a test run can work
straight down the tables.

---

## 0. Confirmed defects (found writing this plan — fix before the rest matters)

### DEFECT-01 — A terminated employee keeps a fully working login — **FIXED**

**R0. Confirmed live**, not inferred.

- `nadia.hassan@northwind.example` (employee `E012`) has
  `employment_status = 'terminated'`, `is_active = FALSE`,
  `end_date = '2026-01-15'`, and is the fixture's own GDPR Article 17
  erasure-request subject (`audit_log`, reason "Data subject erasure request
  (GDPR Art. 17)").
- Her `tenant_users.is_active` is still `TRUE`. Nothing observed connects
  employee termination to tenant membership deactivation.
- **Reproduced:** signed in as her (`devpassword`) and landed on `/employees`
  with a full, working session — sidebar, topbar ("Nadia Hassan · Contractor"),
  every nav item a `contractor` base role gets.
- **Violates a named requirement:** `docs/module-hr.md` US-HR-006 — "As an HR
  Administrator, I want to mark an employee as terminated ... so that their
  access is revoked appropriately."
- **Root cause, not yet confirmed:** no trigger/hook found linking
  `employees.is_active`/`employment_status` to `tenant_users.is_active`, and
  the Supabase Auth session itself is presumably not revoked either (untested
  — see SEC-01 below).

**Fixed:** `employees/[id]/edit/+page.server.ts`'s `default` action now
deactivates the matching `tenant_users` row, in the same transaction as the
employee update, whenever `employment_status` transitions into
`terminated`/`retired` (and records a `role_revoke` audit entry —
`docs/10-lessons-learned.md` L79 territory but not the same lesson; see
below). `custom_access_token_hook` already filtered memberships on
`is_active`, so revoking the row is sufficient — no session-invalidation
mechanism was needed. Deliberately one-directional: reactivating someone
does not restore a prior membership, since what role they should come back
as is a product decision this fix doesn't make.

The fixture itself modeled a *pre-existing* inconsistent state (terminated
via raw SQL, membership left active) that the fixed application can no
longer produce going forward; `packages/database/fixtures/mock-data.sql` now
derives Nadia's seeded `tenant_users.is_active` from her employment status
instead of hardcoding `TRUE`, and `dev-users.sql` was corrected to still
seed her a working Supabase Auth login despite the inactive membership — see
`docs/10-lessons-learned.md` L78, a real trap this surfaced (an inactive
seeded membership silently deleted the login itself, not just the access, so
the test read as a click-race flake until traced).

**Verified:**
- `apps/web/e2e/access-lifecycle.spec.ts` — was failing, now **passes**.
- The transition path itself (not just the fixture's already-terminated
  state) was verified live with a throwaway spec: POSTed a real termination
  through the edit action for an otherwise-active employee, confirmed
  `tenant_users.is_active` flipped and a `role_revoke` audit row landed with
  `{"is_active": {"from": "true", "to": "false"}}`, then reseeded. Not kept
  as a permanent spec — it writes, and the suite has no serial-write project
  yet (same gap blocking ADV-01/02/08/09).

### DEFECT-02 — A customer-portal contact can reach the entire staff application — **FIXED**

**R0. Confirmed live.** More severe than DEFECT-01 — this is the boundary
CLAUDE.md and `docs/17-customer-portal.md` are most explicit about ("a portal
contact is never one missing `if` away from an internal one"), and it's
missing.

- `dana.whitcombe@acme.example` is a customer-portal contact: base role
  `customer`, permission bundle limited to `ticket.submit`, `ticket.read.own`,
  `document.read.own`, `document.upload.own` (`packages/authz/src/index.ts`).
  The correct, intended experience for her exists and works: `/portal` shows
  "Signed in as Dana Whitcombe · Acme Manufacturing" with a `Tickets` link,
  and `/portal/tickets` correctly scopes to her own two tickets.
- **Reproduced:** after signing in, she is **not** routed to `/portal` at
  all — she lands on `/employees` (the staff app's default landing page) with
  the **full staff sidebar**: Employees, HR, Compensation, Payroll, Change
  Requests, Projects, Time Tracking, CRM, Client Portal, Marketing Hub,
  Analytics, Accounting.
- The `/employees` list itself correctly shows 0 rows — `employee_visibility`
  RLS held. But **`/settings/company` renders completely**, with real data:
  Northwind's legal entity name, industry, company size, and its per-locale
  name translations. `firm.settings.read` is nowhere in the `customer` role's
  permission bundle.
- **Root cause, confirmed by reading the code:**
  `apps/web/src/routes/(app)/+layout.server.ts` — the one gate every page
  under `(app)` shares — checks only `session && user` (authenticated at
  all) and `locals.tenantId` (has *some* active membership). It never checks
  `locals.tenantRole`. A customer-portal `tenant_users` row satisfies both
  checks trivially, so nothing in the shared layout distinguishes a staff
  member from a portal contact once `(app)` is reached.
- The `permissions` array the layout computes and hands to the client is
  correctly minimal for `customer` — so the **sidebar's own filtering**, and
  **every individual page's own permission check**, are the only remaining
  defenses, and at least one page (`/settings/company`) has none. Untested:
  how many of the other ~25 `(app)` routes also render for `customer` (RLS
  may blank some; `/settings/company` reads straight from `tenants`, which
  has no row-visibility policy restricting it by role at all — only tenant
  isolation).

**Regression tests written and run:** `apps/web/e2e/portal.spec.ts` —
**fails**, confirming the defect and its exact scope. A full sweep of the
`(app)` route list (SEC-03) shows this is not uniform:

- **17 of 22 routes fully render the staff page (HTTP 200, no redirect) for
  a `customer` session**: `/employees`, `/time-off`, `/attendance`,
  `/performance`, `/onboarding`, `/compensation`, `/projects`,
  `/time-tracking`, `/payroll/payslips`, and **all six** `/settings/*`
  routes tested (`company`, `departments`, `locations`, `job-titles`,
  `holidays`, `benefits`, `payroll/policies`, `payroll/schedules`). For most
  of these, RLS still blanks the underlying rows (e.g. `/employees` shows
  "0 people" — the row-visibility policy holds even though the shell
  shouldn't have rendered at all). **`/settings/company` is the one
  confirmed to leak real data anyway**, because `tenants` carries no
  row-visibility policy narrower than tenant membership.
- **6 routes correctly refuse**: `/payroll/runs`, `/accounting/invoices`,
  `/accounting/bills`, `/accounting/ledger`, `/accounting/banking`,
  `/ticketing`. These modules evidently have their own page-level
  permission check independent of the shared layout — worth finding and
  copying the pattern from, rather than inventing a new one, when this gets
  fixed.

**Broadened by `rbac-boundaries.spec.ts` (SEC-05):** `/settings/company`'s
gap is not portal-specific either. Signed in as `marcus.chen` — an ordinary
staff `employee` with no functional role at all, who legitimately belongs
in `(app)` — the page still returns **200 with full content**, not 403.
`firm.settings.read` is nowhere in the plain-`employee` permission bundle
(`packages/authz`), and the page's own `load()` (confirmed by reading
`(app)/settings/company/+page.server.ts`) checks only `locals.tenantId` —
no `requireCan` call at all. This means **two separate fixes are needed**,
not one: a role check in `(app)/+layout.server.ts` closes the
customer-portal boundary (redirects `customer` away from every route at
once), but it would **not** stop Marcus, who is legitimately staff — that
requires `requireCan(ctx, "firm.settings.read")` added to the page's own
`load()`, the same pattern the 6 correctly-refusing routes below evidently
already use.

**Fixed, both halves:**
- `(app)/+layout.server.ts` now redirects any session with `tenantRole ===
  "customer"` to `/portal`, right after the existing `tenantId` check —
  closing the portal-contact boundary for all ~22 routes at once rather than
  patching each individually.
- All 8 `/settings/*` pages' `load()` functions now call
  `requireCan(contextFrom(locals), "firm.settings.read")` as their first
  statement, matching the `can()` + `error(403)` pattern already used by
  `payroll/runs`, every `accounting/*` page and `ticketing` — confirmed by
  reading those routes before writing this fix, so it extends an existing
  convention rather than adding a second one. This is the general form of
  the gap: a page's `load()` had no read-permission check of its own, only
  its write `actions` did. Recorded as `docs/10-lessons-learned.md` L79 and
  a new rule in `CLAUDE.md`'s "Rules that are easy to get wrong", since nine
  other `(app)` pages could plausibly have had the identical gap and weren't
  individually audited — only the 8 settings pages and the layout-level
  portal boundary were addressed by this fix.

**Verified:**
- `apps/web/e2e/portal.spec.ts`'s sweep (SEC-03) — was 17/22 leaking, now
  **0/22 leak** (all pass).
- `apps/web/e2e/rbac-boundaries.spec.ts`'s Marcus-vs-`/settings/company` case
  (SEC-05) — was failing, now **passes** (403).
- Full `./check` (21 steps) and the full e2e suite (60/60) both green after
  the fix, including `smoke.spec.ts`'s owner-authenticated visits to all 8
  settings pages (owner holds `firm.settings.read`, so no regression there).

---

## 1. Persona roster (recap)

Full detail and the two CHECK constraints that shape combinations:
[TESTING_GUIDELINES.md §1.2](TESTING_GUIDELINES.md). One caveat discovered
this cycle: **the fixture's only `contractor`-base-role login (Nadia) is also
its terminated/GDPR-erasure fixture subject** (DEFECT-01). Any test that
wants a *clean, active* contractor for ordinary-behavior testing (not
lifecycle/access testing) has no persona for it today — flagged as
`FUNC-CONTRACTOR-GAP` below rather than worked around silently.

---

## 2. Security & access-control (`R0` — run first)

| ID | Case | Persona(s) | Expected | Vehicle | Status |
|---|---|---|---|---|---|
| SEC-01 | Terminated employee's session/login | nadia.hassan | Either the login itself is refused, or an existing session is invalidated once `employees.is_active` flips to false. | `apps/web/e2e/access-lifecycle.spec.ts` | **Fixed — passes.** DEFECT-01: the edit action now revokes `tenant_users.is_active` on termination; the token hook already filtered logins on it. |
| SEC-02 | Customer contact cannot reach any `(app)` route | dana.whitcombe (+ felix, imogen, theo) | Redirected to `/portal` on any `(app)/**` URL, not just blocked data. | `apps/web/e2e/portal.spec.ts` | **Fixed — passes.** DEFECT-02: `(app)/+layout.server.ts` redirects `tenantRole === "customer"` to `/portal`. |
| SEC-03 | Sweep every `(app)` route as `customer` | dana.whitcombe | For each of the ~22 routes in `smoke.spec.ts`'s `PAGES` list plus `/settings/*`: does the page 403/redirect, render empty (RLS held), or leak real data? | `apps/web/e2e/portal.spec.ts` (`expect.soft` sweep) | **Fixed — 0/22 leak.** Was 17/22; the layout redirect closes all of them at once. See §0/DEFECT-02. |
| SEC-04 | Role-boundary sweep, positive half | Each persona in the roster | For every screen its role bundle should reach, it reaches it and sees real data (not a blank RLS-starved page passing by accident — L21). | Existing `smoke.spec.ts` (owner only) + extend | Partial (owner only) |
| SEC-04 | Role-boundary sweep, positive half | marcus.chen (compensation redaction control) | Confirmed correct: `/compensation/<colleague>` shows the explicit `EmptyState` "You cannot see this person's compensation." rather than an ambiguous blank (L21 done right). | `apps/web/e2e/rbac-boundaries.spec.ts` | **Done — passes.** Still only one persona/screen pair exercised; broader sweep remains future work. |
| SEC-05 | Role-boundary sweep, negative half | marcus.chen | Two cases run: (1) `/settings/company` as a plain employee — refused (403); (2) compensation redaction — **passes** (same as SEC-04's row). | `apps/web/e2e/rbac-boundaries.spec.ts` | **Fixed — both pass.** (1) was the DEFECT-02 addendum: all 8 settings pages now call `requireCan(ctx, "firm.settings.read")` in `load()`. |
| SEC-06 | Auditor cannot write, anywhere, including through a control the UI still shows | lena.fischer | Resolved: a `noValidate`-bypassed, empty submission to `/employees/new` gets a real 403 and no redirect — `requireCan(ctx, "employee.create")` runs before any form parsing and correctly refuses her regardless of what the client-side validator had been silently blocking. | `apps/web/e2e/rbac-boundaries.spec.ts` | **Done — passes.** (Was "inconclusive"; root cause of the earlier inconclusive result was an unfilled native-`required` `employee_id` field, invisible because its placeholder text reads like a value.) |
| SEC-07 | Segregation-of-duties CHECK constraints hold at the DB, not just in `packages/authz` | N/A (DB-level) | Attempt `functional_roles = {hr_admin, payroll_admin}` and `functional_roles = {auditor, sales_admin}` directly via SQL; confirm both raise `tenant_users_pay_setter_is_not_pay_approver` / `tenant_users_auditor_writes_nothing`. | `packages/database/tests/verify-invariants.sql`'s `authz/constraint-refuses` probes | **Already done — pre-existing.** Runs as part of `./check`'s "schema invariants" step (142 assertions, already green); manually re-verified live via `psql` (all 3 forbidden combos raised the expected constraint name; a legal combo — `it_admin`+`finance_admin` — succeeded as a control). Corrected from "Not started" — should have been checked against existing infra before being planned as new work. |
| SEC-08 | IDOR — cross-persona UUID substitution | marcus.chen, targeting Priya's `employeeId` | A raw `POST` to `/compensation/<priya>?/raise`, bypassing the UI entirely (the "Record a change" control never renders for Marcus, but the action is reachable regardless) — refused with 403. | `apps/web/e2e/rbac-boundaries.spec.ts` | **Done — passes.** Only one target (compensation write) exercised; PII and ticketing IDOR remain open. |
| SEC-09 | Tenant isolation for the new ticketing tables | Fabricated tenant claim (no second populated tenant in the fixture — same limitation the pre-existing "tenant isolation still holds underneath" test already accepts) | `SELECT count(*) FROM ticketing_tickets` returns 0 for a bogus `tenant_id`, even for a role (`it_admin`) that reads all of Northwind's own tickets. | `apps/web/src/lib/server/db/row-visibility.test.ts` (extended) | **Done — passes.** 173/173 in that file, including this new case. |

---

## 3. Adversarial (injection & business-logic abuse)

Every case below targets a **real form found this cycle** — not a generic
list. Use `form-errors.spec.ts`'s `submitPastTheBrowser` pattern
(`form.noValidate = true`, click submit) so client-side validation never
masks what the server actually does.

| ID | Target | Payload | Expected | Status |
|---|---|---|---|---|
| ADV-01 | `/employees/new` — Introduction (rich free text) | `<script>alert(1)</script>`, `<img src=x onerror=...>` | Stored/rendered literally, never executed | **Open — needs a write.** Introduction is plain `{introduction}` interpolation, not `{@html}` (confirmed by grep — the only `{@html}` sites in the app are the ticket description/comment fields covered by ADV-12), so Svelte's own auto-escaping should make this safe by construction. Proving it requires actually creating an employee and rendering the detail page, which the shared read-only fixture can't absorb (form-errors.spec.ts and portal.spec.ts are deliberately write-free) — needs its own serial project + reseed. |
| ADV-02 | `/employees/new` — First/Last name, Job title | Backtick, `--`, `/* */`, `${...}` | Stored/displayed literally, and never reaches a non-parameterized query | **Open — needs a write**, same reason as ADV-01: these values are plausible-looking names/titles (`sanitizeName` doesn't reject punctuation), so proving safe storage/display means a real row. `./check`'s "no backtick in SQL" invariant guards the *codebase's own* SQL text, not user data reaching it — separate, already-covered concern. |
| ADV-03 | `/employees` search box | `' OR '1'='1`, `%` | Standard search behavior only | **Done — passes**, `apps/web/e2e/adversarial.spec.ts`. `' OR '1'='1` matches nobody (parameterized `ILIKE`, confirmed inert — the discriminating result: injection success would show all 11, not "No one matches"); a bare `%` legitimately matches everyone (ILIKE's own wildcard, not an injection — recorded as the actual, correct behavior rather than assumed). |
| ADV-04 | Compensation "Record a change" amount field | `123456.789012` (six decimals on `numeric(15,2)`) | Refused, not rounded | **Already done — pre-existing.** `form-errors.spec.ts`'s "a refused form keeps what was typed into it" test is this exact case; missed on the first pass through the file, same oversight as SEC-07. |
| ADV-05 | Employee birth date | `2026-02-30` | Refused via `f.date()`'s round-trip check (L67), not silently rolled to a real date | **Done — passes**, `form-errors.spec.ts`. A native `<input type="date">` refuses to even *hold* this value (confirmed live: `input.value = '2026-02-30'` → `""`), so this can only be tested via a raw `page.request.post` — which also surfaced [L77](docs/10-lessons-learned.md): a `fail()` result answers HTTP 200 with the real status embedded in the JSON body for anything that isn't a full browser form submission. |
| ADV-06 | `/employees/new` — Employee ID field | A value colliding with an existing `employee_id` (`E001`); a value with SQL-special characters (`` E999`-- ``) | UNIQUE-constraint refusal names the field; special characters refused by format, never reach a query | **Done — passes**, `form-errors.spec.ts`, both cases. The format check is a regex (`^[A-Z0-9-]{1,50}$`) in `parseEmployeeForm`, not a `FormReader` reader — refuses backticks/`--` before they're anywhere near SQL. |
| ADV-07 | `employment_status` | A value outside the enum (`"vibing"`), via raw POST bypassing the `<select>` | Refused, never stored as free text | **Done — passes**, `form-errors.spec.ts`. Refused by a manual `valuesOf(...).includes()` check in `parseEmployeeForm` (functionally equivalent to `FormReader.choice()`, just not written through it) — not stored, no row created. |
| ADV-08 | Portal ticket creation (`/portal/tickets`, "New ticket") | XSS payload in subject/body; a `customer_id`/`customer_contact_id` added to the POST body that doesn't belong to the signed-in contact (mass assignment / IDOR) | Payload inert on render; foreign IDs ignored | **Open — needs a write**, same constraint as ADV-01/02: a real ticket has to be created to check it. Needs its own serial project + reseed, separate from `portal.spec.ts`'s read-only tests. |
| ADV-09 | Company Profile translations (`/settings/company`) | XSS payload in a translation field | Inert everywhere the localized company name renders | **Open — needs a write, and a riskier one than the others.** There is exactly one company-profile row per tenant, and it's read by nav/topbar headings that many *other* passing tests already assert against (`smoke.spec.ts`'s "Northwind Consulting" checks, for one) — a mistake here doesn't just need a reseed, it can make unrelated tests fail confusingly mid-run. Do this only in a fully isolated tenant or a dedicated serial project with its own teardown, not inline with the rest of this cycle. |
| ADV-10 | Login form | SQL-special characters in the email field | Ordinary "invalid credentials," no crash | **Done — passes**, `apps/web/e2e/adversarial.spec.ts`. Handled entirely by Supabase Auth's own client; no crash, no unintended navigation. |
| ADV-11 | Repeated failed logins | 10+ failed attempts against one seeded account | Establish whether there's any throttling at all | **Investigated, not automated — reported here rather than as a pass/fail.** 12 rapid failed attempts against `marcus.chen` returned the same "Invalid login credentials" response every time, with no increasing delay and no lockout observed. This is Supabase Auth's own behavior, not app code, so it's recorded as a finding rather than a failing assertion: **there is no visible rate-limiting or lockout on repeated failed logins today.** Whether that's acceptable depends on what's configured on the hosted GoTrue instance (rate limits are commonly enforced at that layer, not observable against the local stack) — worth confirming against the actual deployment target rather than assuming either way from local behavior. |
| ADV-12 | Ticket description/comment rich text (`sanitizeRichText`) | `<script>`, `onerror=`/`onclick=` attributes, `javascript:` URIs, an out-of-palette color, an out-of-allowlist style property | Stripped in every case; allowed tags and the fixed 6-color/4-size palette survive unchanged | **Done — passes.** `apps/web/src/lib/server/rich-text.test.ts`, 9/9 (vitest, not e2e — cheaper for a pure function than a browser). |

---

## 4. Functionality, by module

Each module: positive path, at least one real negative path, and the
evidence to check (not "the page loaded"). `R0`/`R1` per
[testplan-index.md](docs/testplan-index.md)'s ranking.

### 4.1 Employees / HR — `R0`

- **FUNC-EMP-01**: Create employee (owner/hr_admin) → row exists, audit
  entry in `register.ts`'s vocabulary, appears in the directory list
  immediately (L57's question: can the thing just created be found again?).
  Vehicle: new e2e, writes — needs its own serial project + reseed per
  TESTING_GUIDELINES §1.3/§3.
- **FUNC-EMP-02**: Terminate an employee (hr_admin) → `employment_status`,
  `end_date`, `is_active` all update together; **and** — per DEFECT-01 —
  confirm what (if anything) happens to their `tenant_users`/session. This
  is the same underlying gap as SEC-01, tested from the HR-workflow side
  instead of the login side.
- **FUNC-EMP-03**: Manager visibility — `aisha.okafor` (manager of James,
  Lena, no admin hat) sees her reports' compensation band per the
  `self+manager+hr` audience in `matrix.ts`; a non-manager colleague does
  not. Vehicle: vitest, mirroring `row-visibility.test.ts`.
- **FUNC-CONTRACTOR-GAP**: No active, non-terminated `contractor`-base-role
  persona exists to test ordinary contractor self-service (own timesheet,
  own profile) — only Nadia, who is also DEFECT-01's subject. Decide whether
  to extend the roster (a second contractor login) before running
  contractor-specific `R2` cases, or accept Nadia for both roles and note
  every contractor test as "run against an already-terminated account."

### 4.2 Compensation & Payroll — `R0`

- **FUNC-COMP-01**: Compensation change respects the `payroll_admin`/
  `hr_admin` segregation — `diego.morales` (sales_admin+finance_admin, no HR
  or payroll hat) cannot record a compensation change; `rachel.adeyemi`
  (hr_admin) can, `payroll_admin` holders cannot (per `authz`: "No
  compensation.write").
- **FUNC-PAY-01**: A locked payroll run cannot be edited (CLAUDE.md's
  standing invariant) — attempt via `sarah.johnson` (payroll_admin) after
  lock; expect refusal, not silent success.
- **FUNC-PAY-02**: Payslip reissue for a period before the rate change on
  2025-12-02 uses the earlier `compensation_base` row (the fixture comment
  calls this out explicitly as a designed two-row scenario) — confirm the
  UI actually picks the historical rate, not the current one.

### 4.3 Accounting — `R0`

- **FUNC-ACC-01**: Bank-transaction matching (`/accounting/banking`) — the
  existing `form-errors.spec.ts` case covers "no payment chosen"; add the
  positive path (a real match) and confirm it's refused for `diego.morales`
  correctly (he holds `finance_admin`, so this should actually be a
  **positive** case for him, not negative — verify).
- **FUNC-ACC-02**: Vendor payment with a third decimal — existing coverage;
  extend to invoices (currently only bills are covered).
- **FUNC-ACC-03**: `auditor` (lena.fischer) reads every accounting page,
  writes nothing — pair with SEC-06's pattern.

### 4.4 Time Tracking / Projects — `R1`

- **FUNC-TT-01**: Existing `form-errors.spec.ts` case (missing description)
  covers one refusal. Add: logging time against a project the actor isn't
  staffed on (if that's a rule); logging negative or zero hours.
- **FUNC-TT-02**: `oliver.grant` is part-time (`fte = 0.5`) — confirm any
  FTE-prorated calculation actually uses 0.5, not 1.0.

### 4.5 Ticketing — `R1` (new feature, currently only smoke-covered)

- **FUNC-TIX-01**: Staff side (`/ticketing`) already renders per
  `smoke.spec.ts`. Add a `form-errors.spec.ts`-style negative case for
  ticket creation (missing subject/description) and an SLA-breach display
  check (`sla_response_breached`/`sla_resolution_breached` columns exist per
  `mock-data.sql`).
- **FUNC-TIX-02**: Portal side (`/portal/tickets`) — **read-side now covered**
  in `apps/web/e2e/portal.spec.ts`, all passing: the list is scoped to the
  signed-in contact's own tickets (`CS-0001`, `CS-0003`); a second Acme
  contact (`felix.ndiaye`) sees the *same* tickets (shared per-customer
  visibility per `docs/17-customer-portal.md` holds); `imogen.faulkner`
  (Britannia — a different customer) sees neither. **Still open:** create a
  ticket and confirm it's attributed to the right `customer_id`/
  `customer_contact_id` (ADV-08) — that needs a real write, so it needs its
  own serial project + reseed rather than joining the read-only tests above.

### 4.6 Settings / Company Profile — `R1`, `R0` for the access question

- **FUNC-SET-01**: Company Profile's locale translations (en-US, en-GB,
  en-IN, fr-FR, de-DE fields observed live) — set an `fr-FR` translation,
  confirm it's what's shown to a session in that locale rather than the
  default `company_name` falling through.
- **FUNC-SET-02**: The live "Preview" panel (Date/Time/Currency/Number)
  updates correctly when the tenant's default locale/currency changes —
  this is the concrete, in-product hook for all of §5's i18n cases below.
- Everything else in this module is gated behind DEFECT-02 being fixed
  first — re-run SEC-03's route sweep after the fix to confirm settings
  pages correctly refuse `customer` and correctly allow `firm_admin`/
  `hr_admin`/`owner`.

---

## 5. Internationalization (formatting, not translation — see TESTING_GUIDELINES §7)

Confirmed this cycle: `/settings/company` genuinely does support per-locale
**company name** translation and has a live Date/Time/Currency/Number
preview — this is real, testable surface, not hypothetical.

| ID | Case | Expected | Vehicle |
|---|---|---|---|
| I18N-01 | Set tenant default locale to `fr-FR`, reload a money-bearing page (payslip, invoice) | `1 234,56 €`-shaped output via `money()`, not `1,234.56` | Manual → new e2e case |
| I18N-02 | Same, for dates | `DD/MM/YYYY`-shaped via `calendarDate()` | Manual → new e2e case |
| I18N-03 | Set an invalid/unsupported locale code directly via psql (bypassing the `locale` `FormReader`) | Confirm the app doesn't 500 with a `RangeError` from `Intl` (L24) — this specifically tests the failure mode, not the happy path | Manual, DB-level |
| I18N-04 | French country-specific validation (`@kaaj/validation`'s `FR` phone/postal/INSEE/VAT patterns — confirmed present in `packages/validation/src/index.js`) | Real valid/invalid French values accepted/refused correctly wherever the product surfaces them | Grep for call sites first — not yet confirmed the UI actually exposes a field using these validators |
| I18N-05 | Company name translation fallback | Blank `fr-FR` translation falls back to the plain `company_name`, as the UI's own helper text claims ("Blank falls back to the company name above") | New e2e case |

---

## 6. Performance — `R2`

Not exercised live this cycle beyond default page-load times (all fast on
the 12-employee fixture). Per TESTING_GUIDELINES §8:

- **PERF-01**: Seed a disposable local copy with a much larger employee
  count and watch `/employees`, `/ticketing`, `/accounting/*` for N+1 query
  patterns invisible at 12 rows.
- **PERF-02**: `./check`'s own budget (~25s / ~90s with `--all`) — track it
  as a regression signal across this cycle's changes, not just a one-time
  measurement.

---

## 7. Usability & accessibility — `R2`/`R3`

- **UX-01**: SEC-06's silent-validation-failure — clicking "Create employee"
  with an incomplete form gave **no visible feedback at all** (no alert, no
  field highlight observed) as `lena.fischer`. This is either a client-side
  required-field gate with no error surfaced, or a control genuinely
  disabled without indication. Needs a follow-up pass with
  `read_console_messages` and a close look at which field is actually
  required, then a case in `form-errors.spec.ts` if it's a real form-error
  gap (per CLAUDE.md Forms philosophy: a refused submission must name the
  field).
- **UX-02**: Every page in `smoke.spec.ts`'s list — rerun with `getByRole`
  heading checks for the two new areas (`/ticketing` already covered,
  `/portal` and `/portal/tickets` are not).
- **UX-03**: Long-value overflow — the fixture already has good raw
  material (`"Northwind Consulting LLC"`, various long job titles); check a
  maximally long company-name translation doesn't overflow the topbar
  (L11's shape).
- **UX-04**: Company Profile's "Preview" panel is a strong, already-built
  example of the kind of live-formatting feedback the product should have
  more of — worth confirming it's WCAG-contrast-compliant in both themes
  per CLAUDE.md's still-open `corporate`-theme measurement gap.

---

## 8. New spec files

| File | Covers | Status |
|---|---|---|
| `apps/web/e2e/portal.spec.ts` | SEC-02, SEC-03, FUNC-TIX-02 (read side), UX-02 (portal routes) | **Written and run — all 5 pass.** Documented DEFECT-02, then verified fixed (was 2 failing). Ticket-write cases (ADV-08, FUNC-TIX-02 write side) still open — need their own serial project. |
| `apps/web/e2e/access-lifecycle.spec.ts` | SEC-01, FUNC-EMP-02 | **Written and run — passes.** Documented DEFECT-01, then verified fixed. |
| `apps/web/e2e/rbac-boundaries.spec.ts` | SEC-04, SEC-05, SEC-06, SEC-08 | **Written and run — all 4 pass.** Documented the DEFECT-02 addendum (plain employee vs. `/settings/company`), then verified fixed; SEC-06, IDOR and redaction controls all held throughout. |
| `apps/web/e2e/helpers.ts` | Shared `signInAs()`, `openModal()`, `submitPastTheBrowser()` — the last two duplicated from `form-errors.spec.ts` rather than imported, so that file stays untouched | **Written.** Not a spec file itself; no tests of its own. |
| `apps/web/src/lib/server/rich-text.test.ts` | ADV-12 | **Written and run.** 9/9 passing (vitest — cheaper than a browser for a pure function). |
| `apps/web/src/lib/server/db/row-visibility.test.ts` (extended, not new) | SEC-09 | **Done.** One case added to the existing "tenant isolation still holds underneath" `describe` block; 173/173 passing in the file. |
| `packages/database/tests/verify-invariants.sql` (pre-existing) | SEC-07 | **Already covered** — see SEC-07's row above. |
| Extend `apps/web/e2e/form-errors.spec.ts` | ADV-04 (already existed), ADV-05, ADV-06 (×2), ADV-07 | **Done — 4 new cases, all pass** (plus the pre-existing ADV-04 case). |
| `apps/web/e2e/adversarial.spec.ts` | ADV-03 (×2), ADV-10 | **Written and run.** 3 tests, all pass. |
| — (investigated directly against GoTrue, not a spec file) | ADV-11 | **Investigated — see its row above.** No rate-limiting observed on 12 rapid attempts locally; not encoded as a pass/fail assertion since the right answer may live in hosted-instance configuration rather than app code. |

**Still open, and why:** ADV-01, ADV-02, ADV-08, ADV-09 all require a
successful write to check what happens to a value *after* it's stored and
rendered — unlike everything above, which tests a REFUSAL (safe for the
shared, read-only fixture by construction). ADV-09 in particular touches
the tenant's one company-profile row, which several already-passing tests
read from — do these in a serial project with a reseed, not folded into the
read-only suites above.

**Current full-suite result:** `pnpm --filter @kaaj/web e2e` — **60/60
passing.** DEFECT-01 and DEFECT-02 (and its broadened addendum) are fixed;
see §0. `./check` (21 steps) and all vitest files are fully green.

**A note on `signInAs`'s own bug, found writing it:** the first version
resolved success by `waitForURL(/\/(portal|employees|login)/)` — a regex
loose enough to match the URL you're *already on* before a click even
fires. Combined with a submit button whose handler attaches on hydration (a
known race — `form-errors.spec.ts`'s `openModal` exists for the same
reason), a click that lands too early leaves the page exactly where it was,
`waitForURL` resolves immediately against the stale `/login/sign_in` URL,
and the test proceeds as if sign-in had already finished. This produced
one false PASS (`access-lifecycle.spec.ts`, before the fix — it looked like
Nadia's access *was* being refused, for the wrong reason: her login never
actually submitted) and one false FAIL (`portal.spec.ts`'s first test,
which reported landing at `/login/sign_in` when the real question — did she
reach `/portal` or the staff app — was never actually tested). Fixed by
retrying the click itself until the URL demonstrably leaves
`/login/sign_in`, mirroring `openModal`'s pattern. Recorded as
[L76](docs/10-lessons-learned.md) for whoever next writes a Playwright
helper that logs in as someone other than the suite's default persona.

---

## 9. Run order

1. §0/§2 — confirm DEFECT-01/02's exact blast radius (SEC-03's route sweep)
   before anything else; these are `R0` and already proven, not hypothetical.
2. §3 adversarial cases against forms already identified.
3. §4 functional cases, module by module, `R0` first (Compensation/Payroll/
   Accounting) then `R1`.
4. §5 i18n, §6 performance, §7 usability — lower risk, run after the above.
5. Update this file's status column as each ID moves from "Not started" to
   a result, and file every confirmed defect per
   [TESTING_GUIDELINES.md §10](TESTING_GUIDELINES.md).
