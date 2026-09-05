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

### DEFECT-01 — A terminated employee keeps a fully working login

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

**Regression test written and run:** `apps/web/e2e/access-lifecycle.spec.ts`
— **fails**, confirming the defect
(`page.url()` still matches `/employees` after signing in as Nadia). Left
red on purpose per TESTING_GUIDELINES.md; will flip green the day this is
fixed.

### DEFECT-02 — A customer-portal contact can reach the entire staff application

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

This should almost certainly be fixed by adding a role check to
`(app)/+layout.server.ts` (redirect `customer` to `/portal`), which would
close it for every route at once rather than patching the remaining 16
individually — worth flagging to whoever fixes it, though the fix itself is
out of scope for this plan.

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
| SEC-01 | Terminated employee's session/login | nadia.hassan | Either the login itself is refused, or an existing session is invalidated once `employees.is_active` flips to false. Today: neither — login succeeds (DEFECT-01). | `apps/web/e2e/access-lifecycle.spec.ts` | **Confirmed failing** (run: 1 failed, as expected) |
| SEC-02 | Customer contact cannot reach any `(app)` route | dana.whitcombe (+ felix, imogen, theo) | Redirected to `/portal` on any `(app)/**` URL, not just blocked data. Today: lands on `/employees`, full shell renders (DEFECT-02). | `apps/web/e2e/portal.spec.ts` | **Confirmed failing** (run: 1 failed, as expected) |
| SEC-03 | Sweep every `(app)` route as `customer` | dana.whitcombe | For each of the ~22 routes in `smoke.spec.ts`'s `PAGES` list plus `/settings/*`: does the page 403/redirect, render empty (RLS held), or leak real data? | `apps/web/e2e/portal.spec.ts` (`expect.soft` sweep) | **Done — 17/22 leak, 6 refuse.** Full list in §0/DEFECT-02 above. |
| SEC-04 | Role-boundary sweep, positive half | Each persona in the roster | For every screen its role bundle should reach, it reaches it and sees real data (not a blank RLS-starved page passing by accident — L21). | Existing `smoke.spec.ts` (owner only) + extend | Partial (owner only) |
| SEC-05 | Role-boundary sweep, negative half | Each persona against a screen/action it should be refused | Refusal is real: checked against the **network response**, not just the DOM (L44 — a hidden link is not a permission). Priority targets: compensation detail as a plain employee viewing a colleague; payroll runs as a non-payroll_admin; accounting as a non-finance role. | New e2e: `apps/web/e2e/rbac-boundaries.spec.ts` | Not started |
| SEC-06 | Auditor cannot write, anywhere, including through a control the UI still shows | lena.fischer | `lena.fischer` (auditor) can open `/employees/new` — the "New Employee" button is not hidden or disabled for her. **Inconclusive this cycle**: filled the form and clicked submit twice; no `POST` was observed (`read_network_requests` showed nothing matching `employees`) and no row was created in the database — client-side validation silently blocked it (likely an unfilled required select — Department/Office/Level — with no visible error, itself worth a UX-track finding). Need `submitPastTheBrowser`-style raw submission (`form-errors.spec.ts`'s pattern: `form.noValidate = true` then click) to actually reach the server and confirm `employee.create` is refused server-side, not just gated by a silent client validator. | New e2e case in `rbac-boundaries.spec.ts` | Started, inconclusive |
| SEC-07 | Segregation-of-duties CHECK constraints hold at the DB, not just in `packages/authz` | N/A (DB-level) | Attempt `functional_roles = {hr_admin, payroll_admin}` and `functional_roles = {auditor, sales_admin}` directly via SQL; confirm both raise `tenant_users_pay_setter_is_not_pay_approver` / `tenant_users_auditor_writes_nothing`. | `packages/spec-tests` or a one-off psql check | Not started (constraints exist; watching them actually fire is the L48 "never observed failing is not evidence" rule) |
| SEC-08 | IDOR — cross-persona UUID substitution | Any employee vs. another employee's compensation/PII UUID; portal contact vs. another customer's ticket UUID | Substituting a real, valid UUID belonging to someone else into a URL/form field for an otherwise-authorized action is refused server-side. | New e2e case, `rbac-boundaries.spec.ts` | Not started |
| SEC-09 | Tenant isolation for the new ticketing tables | Any Northwind persona vs. a second tenant's ticket (needs a second tenant — none in the fixture today) | No cross-tenant ticket read via direct ID. | Vitest — mirror `row-visibility.test.ts`'s pattern for `ticketing_tickets` | Not started |

---

## 3. Adversarial (injection & business-logic abuse)

Every case below targets a **real form found this cycle** — not a generic
list. Use `form-errors.spec.ts`'s `submitPastTheBrowser` pattern
(`form.noValidate = true`, click submit) so client-side validation never
masks what the server actually does.

| ID | Target | Payload | Expected | Vehicle |
|---|---|---|---|---|
| ADV-01 | `/employees/new` — Introduction (rich free text) | `<script>alert(1)</script>`, `<img src=x onerror=...>` | Stored/rendered literally, never executed, on the employee detail page and anywhere else it's displayed | New e2e case |
| ADV-02 | `/employees/new` — First/Last name, Job title | Backtick, `--`, `/* */`, `${...}` | Stored/displayed literally; also exercise `./check`'s "no backtick in SQL" invariant isn't bypassed by this data reaching a dynamically-built query anywhere | New e2e case + grep for dynamic SQL near employee search |
| ADV-03 | `/employees` search box | `' OR '1'='1`, `%`, `_`, a string containing `ILIKE` wildcards | Standard search behavior only (postgres.js parameterizes `ILIKE ${..}` — confirmed from `employees.repo.ts:94-98` — so this should be inert; confirm it actually is) | New e2e case |
| ADV-04 | Compensation "Record a change" amount field | `123456.789012` (six decimals on `numeric(15,2)`) | Refused, not rounded — same shape as `form-errors.spec.ts`'s existing case; confirm the pattern holds on every money field, not just the ones already covered | Extend `form-errors.spec.ts` |
| ADV-05 | Employee "Date of birth" / any date field | `2026-13-45`, `2026-02-31` | Refused via `f.date()`'s round-trip check, not silently rolled to a nearby real date (L67) | New e2e case |
| ADV-06 | `/employees/new` — Employee ID field | A value colliding with an existing `employee_id`, and a value with SQL-special characters | UNIQUE constraint refusal surfaces a sentence naming the field (per the constraint registry), not an Internal Error | New e2e case |
| ADV-07 | Any select-backed field (Gender, Marital status, Status, Type) | A value outside the rendered `<option>` list, submitted via a raw request bypassing the `<select>` | Refused by `FormReader`'s `enumValue`/`choice`, not stored as free text | New e2e case, raw fetch |
| ADV-08 | Portal ticket creation (`/portal/tickets`, "New ticket") | XSS payload in subject/body; a `customer_id`/`customer_contact_id` field added to the POST body that doesn't belong to the signed-in contact (mass assignment / IDOR) | Payload inert on render; foreign IDs ignored — ticket is created under the actual session's identity regardless of what the body claims | New e2e: `portal.spec.ts` (not yet written — this specific case needs a real write, so it needs its own serial project + reseed per TESTING_GUIDELINES §3, unlike the read-only cases already added to that file) |
| ADV-12 | Ticket description/comment rich text (`sanitizeRichText`, applied on both write via `FormReader.html()` and read via `ticketing.repo.ts`) | `<script>`, `onerror=`/`onclick=` attributes, `javascript:` URIs, an out-of-palette color, an out-of-allowlist style property | Stripped in every case; allowed tags (`b`/`i`/`ul`/`li`/etc.) and the fixed 6-color/4-size palette survive unchanged | **Done** — `apps/web/src/lib/server/rich-text.test.ts`, 9/9 passing (vitest, not e2e — a pure function, cheaper to test directly than through a browser per TESTING_GUIDELINES §3) |
| ADV-09 | Company Profile translations (`/settings/company`, en-US/en-GB/en-IN/fr-FR/de-DE fields) | XSS payload in a translation field | Inert on every page that renders the localized company name | New e2e case |
| ADV-10 | Login form | SQL-special characters in the email field, and a very long password (denial-of-resource check, not a crash) | Ordinary "invalid credentials," no 500, no timing oracle worth escalating | Manual / new e2e case |
| ADV-11 | Repeated failed logins | 10+ failed attempts against one seeded account | Establish whether there's any throttling at all today (this cycle didn't check) — if none exists, that's a finding, not necessarily a fix-now item | Manual |

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
| `apps/web/e2e/portal.spec.ts` | SEC-02, SEC-03, FUNC-TIX-02 (read side), UX-02 (portal routes) | **Written and run.** 5 tests: 2 fail (correctly, documenting DEFECT-02), 3 pass. Ticket-write cases (ADV-08, FUNC-TIX-02 write side) still open — need their own serial project. |
| `apps/web/e2e/access-lifecycle.spec.ts` | SEC-01, FUNC-EMP-02 | **Written and run.** 1 test, fails (correctly, documenting DEFECT-01). |
| `apps/web/e2e/helpers.ts` | Shared `signInAs()` used by both files above — signs in a persona other than the suite's default owner within a single test, with the same hydration-race retry `form-errors.spec.ts` already uses for clicks | **Written.** Not a spec file itself; no tests of its own. |
| `apps/web/src/lib/server/rich-text.test.ts` | ADV-12 | **Written and run.** 9/9 passing (vitest — cheaper than a browser for a pure function). |
| `apps/web/e2e/rbac-boundaries.spec.ts` | SEC-04–SEC-06, SEC-08 | Not started |
| Extend `apps/web/e2e/form-errors.spec.ts` | ADV-04–ADV-07, ADV-09 | Not started |
| Vitest, mirroring `row-visibility.test.ts` | SEC-07, SEC-09, FUNC-EMP-03 | Not started |

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
