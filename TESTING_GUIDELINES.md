# Testing Guidelines

**Audience:** an independent testing agent — human or AI — operating on Kaaj
with one incentive: **find every defect before a customer does.** Nothing
here rewards a green run. A test suite that passes because it never looked is
worse than no test suite, because it looks like coverage.

This document is the operating manual for planning and executing a test
cycle. It does not restate what to build (that's
[CODING_GUIDELINES.md](CODING_GUIDELINES.md)) or what already bit someone
(that's [docs/10-lessons-learned.md](docs/10-lessons-learned.md)) or what the
spec requires module-by-module (that's `docs/testplan-*.md` and
`docs/module-*.md`). It is where those become an executable plan against the
running application, using the real e2e suite plus real browser exploration,
and it is where a finding becomes a filed, reproducible bug.

---

## 0. The mandate

1. **You are adversarial toward the software, not toward the test suite.**
   Your job is not to make `./check` pass — it already does, or the author
   wouldn't be pushing. Your job is to find the case nobody wrote a test for.
2. **A defect you can reproduce is worth more than ten you can only assert.**
   Every finding in your report must include the exact steps, the exact
   input, and the exact observed-vs-expected output. "Feels off" is not a
   finding; a screenshot, a request/response pair, or a failing Playwright
   assertion is.
3. **Silent failure is the house style of bugs here.** Read
   [docs/10-lessons-learned.md](docs/10-lessons-learned.md) before you start.
   Every entry in it is a bug that produced **no error** — a blank page, a
   passing check over `NULL`, a class name Tailwind never generated, a 500
   with no field marked. Assume the next bug looks like that too: a page that
   renders "successfully" is not evidence of correctness, only evidence that
   nothing crashed.
4. **Test as the actor meant to be refused, not just the actor meant to
   succeed.** The single highest-yield move in this codebase's own security
   history (see CLAUDE.md, "Security: how the breaches actually happened") is
   running the same action as a less-privileged role and checking it is
   actually blocked, not just that the intended role can do the intended
   thing.
5. **When you find something, check whether it's already known.** Grep
   `docs/10-lessons-learned.md` for the shape of the bug before filing it as
   new. If it isn't there, your bug report is also a candidate `Lnn` entry —
   flag that in your report (see §9).

---

## 1. Before you touch anything

### 1.1 Stand up the environment

```bash
./setup --check     # see what's missing, change nothing
./setup              # idempotent bootstrap: local Supabase, migrations, fixture, verification
```

Confirm the fixture actually loaded before testing anything on top of it —
`./setup` seeds the Northwind tenant (12 employees). If you're not sure it's
current:

```bash
./setup --reset      # rebuild the database from migrations and reseed
```

Useful local endpoints once the stack is up:

| What | Where |
|---|---|
| App | http://localhost:5173 (`pnpm dev`) |
| Studio (inspect data directly) | http://127.0.0.1:54323 |
| Captured outbound mail | http://127.0.0.1:54324 |
| E2E dev server (Playwright only, do not confuse with the above) | http://localhost:5175 |

### 1.2 Know your personas

The seeded fixture (`packages/database/fixtures/dev-users.sql`, driven by
the `tenant_users` rows in `packages/database/fixtures/mock-data.sql`) gives
you real, working logins — password `devpassword` for all of them. Every
base role and every functional role in `packages/authz` has at least one
login; three people deliberately hold more than one hat, and `manager` is
never a grant — it's derived from `employees.manager_id`, so a persona
"has" it by being someone else's reports-to:

| Email | Base role | Functional role(s) | Manager of |
|---|---|---|---|
| `sarah.johnson@northwind.example` | owner | `payroll_admin` | Marcus, Tom, Oliver |
| `marcus.chen@northwind.example` | employee | — | — |
| `priya.raman@northwind.example` | employee | — | — (subject of the one review still in `draft`) |
| `tom.whitfield@northwind.example` | employee | — | — |
| `aisha.okafor@northwind.example` | employee | — | James, Lena — the plain "manager" persona, no admin hat |
| `james.reid@northwind.example` | **firm_admin** | `legal_admin` + `project_manager` | — |
| `lena.fischer@northwind.example` | employee | `auditor` — alone, by CHECK | — |
| `diego.morales@northwind.example` | employee | `sales_admin` + `finance_admin` | Yuki |
| `yuki.tanaka@northwind.example` | employee | `marketing_admin` | — |
| `rachel.adeyemi@northwind.example` | employee | `hr_admin` | — |
| `oliver.grant@northwind.example` | employee | `it_admin` | — |
| `nadia.hassan@northwind.example` | **contractor** | — | — (matches her `employment_type`) |
| `dana.whitcombe@acme.example` | customer | — | portal, Acme Manufacturing (primary contact) |
| `felix.ndiaye@acme.example` | customer | — | portal, Acme Manufacturing |
| `imogen.faulkner@britco.example` | customer | — | portal, Britannia Retail Group |
| `theo.bakshi@helios.example` | customer | — | portal, Helios Energy |

Two constraints shape who can combine what — read them off `mock-data.sql`'s
comment before proposing a new combination, don't guess:
`hr_admin`+`payroll_admin` can never coexist on one login (segregation of
duties — whoever sets pay must not approve the run that pays it), and
`auditor` can never coexist with any other functional role or with an
`owner`/`firm_admin` base role (an auditor who can write anything, anywhere,
is not an auditor). Both are enforced by a database `CHECK`, not just by
convention — try to violate one from Studio/psql if you want to see it
actually refuse.

If a test plan needs a role/combination this roster doesn't cover, extend
`mock-data.sql`'s `tenant_users` insert (it already gives every employee a
login; you're only changing the `role`/`functional_roles` `CASE` branches)
and re-run `supabase db reset` — don't hand-edit a session's claims for
anything you intend to reuse across a test cycle, and don't invent a
persona nobody can log back in as tomorrow.

### 1.3 Know the fixture, and don't corrupt it

The Northwind fixture is **shared** with the unit suites, which assert exact
counts and exact rows against it. `smoke.spec.ts` and `form-errors.spec.ts`
are deliberately read-only or refusal-only for this reason — driving the app
by hand once left a stray project and payment behind and turned nine unit
tests red.

**Rule for you too:** any exploration that *succeeds* in creating, editing,
or deleting a fixture row needs its own reseed afterward
(`supabase db reset`) before the shared suites are trusted again, or its own
isolated tenant/serial run if it must coexist with other testing. Prefer
reading and attempting-refused-writes over completing real writes when
you're just exploring; when a test plan calls for asserting a *successful*
write, say so explicitly and reseed after.

### 1.4 Read the ground truth, don't invent it

Before writing a test plan for a module, read its spec
(`docs/module-*.md`) and its coverage entry in
[docs/testplan-module-coverage.md](docs/testplan-module-coverage.md) if one
exists. Testing against your own assumption of what a feature should do,
instead of the spec, produces false-positive bug reports that waste a
developer's time confirming they're not bugs. Where the spec and the running
app disagree, that disagreement — spec says X, app does Y — **is** the
finding; file it as one rather than silently testing against whichever you
guessed was right.

---

## 2. Building a test plan

A test plan is not a list of pages to click. For every requirement you plan
to test, write down — before you execute anything:

1. **Requirement and source.** Which spec, which `US-*`/`FR-*`/`BR-*`, or
   which line of CLAUDE.md / CODING_GUIDELINES.md.
2. **Persona and permission boundary.** Who should succeed, who should be
   refused, and what "refused" should look like (a hidden button is not a
   permission — L44).
3. **Positive path.** The straightforward case.
4. **Negative paths — at least as many as positive ones.** Invalid input,
   missing input, input that's syntactically valid but semantically wrong
   (a real UUID for the wrong row, a real date that doesn't exist, a
   third-decimal amount), and input a legitimate user would never produce
   but a script could.
5. **Boundary values.** Empty string vs. null vs. whitespace; zero vs.
   negative; the exact column length (`varchar(n)` at `n` and `n+1`,
   counted in code points); the day a rate/effective-date range starts or
   ends.
6. **Evidence, not vibes.** What in the database, the audit log, the
   rendered DOM, or the network response proves the outcome — see
   [testplan-methodology.md's Evidence Model](docs/testplan-methodology.md).
   "The page didn't crash" is never sufficient evidence on its own.
7. **Risk class**, using the existing `R0`–`R3` scale from
   [testplan-index.md](docs/testplan-index.md) — this determines how much
   adversarial depth the item needs (§4) and whether a UI-only check is
   acceptable (`R0` never is).
8. **Execution vehicle.** Which of the four lanes in §3 will exercise it.

Group the plan by module, using
[docs/testplan-module-coverage.md](docs/testplan-module-coverage.md) as your
checklist of what exists, and prioritize using
[testplan-index.md's "Highest Risk Areas"](docs/testplan-index.md) — payroll,
accounting, tenancy, PII, and permissions before anything cosmetic.

---

## 3. Execution lanes

Four ways to actually run a test here. Pick the cheapest one that produces
real evidence — don't reach for a browser when a repository test already
proves the same thing faster.

| Lane | Command | Use for |
|---|---|---|
| Unit / repository / invariant | `pnpm test` (per package), `pnpm test:security` | Money/date/rounding logic, tenant-scoped queries, RLS as different actors, PII sealing, form readers |
| Spec-derived conformance | `pnpm test:spec` (`packages/spec-tests`) | Requirement-matrix coverage, the authz **conformance bridge** between deployed and spec-derived authorization |
| Database-level | `./check --db` | RLS actually filters, schema invariants, disclosure matrix completeness, audit register completeness |
| Browser / e2e | `pnpm --filter @kaaj/web e2e`, or manual driving via `claude-in-chrome` | Rendering, workflows across multiple screens, real login, real form submission, visual/accessibility checks |

`./check` (no flags) runs everything except the browser suite in about 25
seconds; `./check --all` adds it. **Run `./check` after any fix you verify,
and `./check --db` immediately after touching anything RLS-related** — a
`DROP`/`CREATE POLICY` pair silently loses `AS RESTRICTIVE` and nothing but
this check catches it (L63).

### Extending the e2e suite

New Playwright specs belong in `apps/web/e2e/`. Follow the existing
conventions, don't invent new ones:

- **A new page under `(app)` gets a line in `smoke.spec.ts`** — heading by
  role, nav chrome present, zero console errors. This is the only check in
  the whole repo that renders a page; a broken import or failed hydration
  shows up here and nowhere else.
- **A new form gets a case in `form-errors.spec.ts`** — submit exactly what
  the action refuses (missing required field, a value the column rejects, a
  UNIQUE/CHECK/FK collision), never a value it accepts. This keeps the suite
  read-only and fast to run alongside the unit suites.
- **Anything that performs a real write** (creates a row that survives) does
  not belong in either file. Give it its own spec, run it against a serial
  Playwright project, and reseed after — see `playwright.config.ts`'s
  comment on why the existing suite is `fullyParallel`.
- Match the existing idioms: sign in once via `auth.setup.ts`'s saved
  storage state, don't inject tokens; use `getByRole`/`getByLabel` over CSS
  selectors so a test also asserts accessibility; retry the click-then-check
  pattern (`openModal`, `toPass`) rather than adding a raw `waitForTimeout`,
  because a hydration race is the actual failure mode here, not slowness
  (see the comments in `form-errors.spec.ts` for the specific race and
  L65's warning that a wait for nothing can pass before the code runs).

When you can't automate an item (a manual visual judgment, a cross-device
check, a thing that requires two logged-in sessions interacting), say so in
the plan as a **manual checklist item** rather than skipping it silently —
per `testplan-methodology.md`'s coverage-artifact model.

---

## 4. Functionality testing

Walk each module's real user workflows end to end, not screen by screen —
"create a time-off request, have it approved, see the balance move, see the
audit entry" is one test; "the time-off page renders" is a much weaker one
already covered by `smoke.spec.ts`.

For every workflow, verify the **evidence chain**, not just the last screen:

- The database mutation is what the action claims (not just "some row
  changed" — the right row, the right columns, `RETURNING id` actually
  matched — L68: a write that matches nothing still reports success unless
  it checks).
- The audit entry exists, in the register
  (`apps/web/src/lib/server/audit/register.ts`), with real `from`/`to`
  string values, not the whole row dumped (L54, and CLAUDE.md's "Every
  write is classified").
- Any counter or subtotal the workflow updates actually reconciles against
  the rows it's supposed to summarize (L58) — check right after the write,
  not just on a fresh page load where it might have been recomputed anyway.
- The row surfaces again wherever it should be findable — a list, a filter,
  a report. A create form and a filter that quietly disagree on the
  vocabulary is how a freshly created "draft" project disappeared from
  every filter in L57 — the write "succeeded" and was simply never seen
  again.
- Anything with an effective date or a rate/band applies the version that
  was in force **on the relevant date**, not today's.

Deliberately test the unhappy paths a spec enumerates but a developer might
deprioritize: cancellation, reversal, re-opening a closed period, correcting
an already-audited change, concurrent edits to the same row from two
sessions.

---

## 5. Security & authorization testing

This is the highest-leverage category in this codebase — read CLAUDE.md's
"Security: how the breaches actually happened" section before starting, and
treat every bullet there as a standing test heuristic, not background
reading:

- **A protected value has more than one home.** For any sensitive field you
  test, ask where else it might leak: a cache, a JSONB blob, an audit
  entry, an export, an index, a log line, a computed subtotal. Test each
  home, not just the primary column.
- **Ask who can read what was just written.** Every write you test for §4
  also gets this pass: who else can now see the new row, and should they?
- **A guard you've never seen fail is not evidence it works.** Where
  feasible, deliberately reproduce the broken version (revert a policy
  locally, drop a `requireCan` call) and confirm the test you're relying on
  actually goes red. If it doesn't, the test — not the code — is the bug.

### 5.1 Role-boundary testing (RBAC / ABAC)

For every screen and every form action:

1. Load it as the persona meant to succeed. Confirm it does, and that the
   right data appears.
2. Load or submit it as a persona meant to be **refused**. Confirm the
   refusal is real — a 403/redirect/empty result with no data leaked in the
   payload, not just a hidden button (L44: a hidden link is not a
   permission — check the network response directly, not only the DOM).
3. For any field with per-column visibility (see
   `apps/web/src/lib/server/security/matrix.ts` — `Audience` values like
   `self+manager+hr`, `self+hr`, `hr+payroll`), confirm the audience
   boundary, not just row access: a manager reading an employee's page
   should see contact details and not compensation history unless the
   matrix says otherwise. Use `row-visibility.test.ts`'s pattern — assert
   **both halves**: refused actor gets `NULL`/nothing, permitted actor
   still gets the real value. A policy that blanks the field for everyone
   passes a lazy test and fails a real one.

Every role in §1.2's roster is now reachable by real login, so a plan that
skips one is skipping it by choice, not by necessity — say so explicitly if
you do. If a future role or combination genuinely has no seeded persona yet,
extend `mock-data.sql` per §1.2 rather than routing around the gap with a
fabricated claim that nobody can reproduce by signing in.

### 5.2 Tenant isolation

Every module that reads or writes tenant-scoped data:

- Confirm a row created in one tenant is invisible to another (RLS, not
  application-level filtering — try to reach it through as many paths as
  the module exposes: direct URL by id/UUID, a list endpoint, a search, an
  export).
- Confirm the tenant claim is actually what scopes it — a session with no
  tenant claim should render **empty**, not error, per L21/L74; that empty
  state looks identical to "this tenant really has no data" from a
  screenshot, which is exactly why `smoke.spec.ts` asserts on the URL and
  on real fixture names, not on "the page loaded."
- Try IDOR directly: take a real UUID belonging to another tenant (or
  another employee, for self-scoped data) and substitute it into a URL, a
  hidden form field, or an API payload for an action you're otherwise
  authorized to call. UUIDs here are not secret, so tenant isolation must
  hold entirely on the server side, never on unguessability.

### 5.3 PII and encryption

- Confirm a PII field is genuinely encrypted at rest (check the actual
  column value in Studio/psql — a plaintext value where `_pvt`/`_ct` is
  expected is an instant, unconditional bug per CLAUDE.md's naming rule).
- Confirm an employee's encrypted fields survive a role change and are
  actually destroyed on erasure (GDPR Art. 17) — check that the key, not
  just a display value, is gone.
- Confirm nothing formats a raw PII value into a log line, an error
  message, or an audit `changes` entry — `message` on a validation error
  echoes the submitted value (a date-of-birth typo included), so trigger
  exactly that kind of failure and check what actually reached the
  response and any server log.

### 5.4 Service-role and infrastructure boundaries

- Confirm `PRIVATE_SUPABASE_SERVICE_ROLE` is never observable from the
  browser: check page source, network responses, and any client-side
  bundle for its value or for behavior that only makes sense if RLS were
  bypassed.
- If you're reviewing code rather than the running app, confirm no new
  importer of the service role exists outside the committed allowlist
  (`./check`'s "service role quarantined" step already enforces this — if
  you find a path around it, that's an `R0` finding).

### 5.5 The authz conformance bridge

`packages/spec-tests/tests/authz-conformance.spec.test.ts` is the one place
that compares the deployed authorizer (`apps/web`) against the spec-derived
one (`packages/spec-tests`) on outcomes. If you find a case where they
disagree, that is itself the finding — "decide which is right" is the
correct next step, not silently trusting either implementation.

---

## 6. Adversarial testing

Treat every input surface as hostile. This is the one category where you
should actively try to break things a well-behaved user never would.

### 6.1 Injection

- **SQL injection.** All application queries go through the tagged-template
  `tx\`...\`` interface (postgres.js), which parameterizes automatically —
  classic string-concatenation SQLi should not be reachable from normal
  form fields. Test it anyway, and target the places where it's more
  plausible to break: any dynamically-built identifier (table/column name
  chosen from user input rather than a literal), any raw SQL fragment
  assembled from parts, and any place `./check`'s "no backtick in SQL"
  invariant matters — try submitting a value containing a backtick,
  `--`, `/*`, and `${...}`-looking strings through every text field, and
  confirm they're stored/rendered literally rather than interpreted.
- **XSS.** Svelte escapes interpolated text by default — target the
  exceptions: any `{@html ...}`, any attribute built from user input
  (`href`, `src`), rich-text fields (ticket descriptions, notes), and
  anything rendered into an email via `html-to-text`/outbound mail
  templates (check Mailpit's rendering of a submitted value, not just the
  app's). Try `<script>`, `<img src=x onerror=...>`, and a javascript:
  URI in every free-text field, especially ones a *different* user later
  views (comments, tickets, chat, shared documents).
- **Header/log injection.** Submit CRLF sequences and control characters in
  fields that might reach an email header (invite/notification sends) or a
  log line.

### 6.2 Business-logic abuse

- **Enum/vocabulary tampering.** Submit a value outside the allowed set for
  every `select`/status field — past the browser's own `<select>` (edit the
  DOM or submit via a raw request) — and confirm the server-side
  `enumValue`/`choice` reader in `FormReader` actually refuses it rather
  than the column silently accepting free text.
- **Decimal/type fuzzing.** Extra decimal places on money fields (must
  refuse, not round — a form-errors.spec.ts pattern already exists for
  this; extend it to fields it doesn't cover), scientific notation, huge
  numbers (`9007199254740993.00`-shaped values — see CLAUDE.md's money
  section on float64 precision loss), negative values where only positive
  makes sense, and non-numeric strings coerced by a lax client.
- **Malformed dates.** `2026-13-45`, `2026-02-30` — shape-valid,
  calendar-invalid (L67); confirm `f.date()`'s round-trip check catches it
  everywhere a date field exists, not just where it's already tested.
- **Replay / double-submit.** Submit the same form twice in quick
  succession (double-click, or two concurrent requests) for any action that
  shouldn't be idempotent in effect — a payment, an approval, a pay-run
  lock. Confirm it doesn't double-apply.
- **State-machine violations.** Try to transition a record past a guard a
  legitimate UI wouldn't offer — approve an already-approved request, pay
  an already-paid bill, edit a locked payroll run, post to a closed
  accounting period — by submitting the form action directly rather than
  through the button that would normally be hidden or disabled.
- **Mass assignment.** Add extra fields to a POST body that the visible
  form doesn't include (a role, a tenant_id, a computed total) and confirm
  the server only reads what `FormReader` explicitly asks for.
- **Claim tampering.** Where feasible, inspect and attempt to modify the
  JWT/claims used for tenant/role resolution and confirm the `app.*`
  claim-reading functions fail closed on a malformed claim (L62) rather
  than 500ing or, worse, resolving to an unintended tenant/role.

### 6.3 Authentication surface

- Brute-force/rate-limiting on login — attempt repeated failed logins and
  see whether anything throttles or locks.
- Session fixation/reuse — confirm a session invalidated by sign-out (or by
  revoking a role) can't still make authorized requests.
- Open-redirect — check any post-login redirect parameter for
  externally-controllable destinations.
- Direct navigation to an authenticated route with no session: must bounce
  to `/login`, never render an empty authenticated shell (the exact
  distinction `smoke.spec.ts`'s unauthenticated test exists to make).

### 6.4 What NOT to do

- Never run adversarial payloads against anything but the local stack.
  `./setup` explicitly says it is a developer bootstrap with well-known
  credentials — the same rule applies doubly to injection/fuzzing input.
- Never run `packages/database/tests/verify-rls.sql` (or any script that
  seeds a second tenant / writes probe rows) against production. The only
  harness safe to point at a live database is
  `packages/database/tests/verify-remote.sh`, and only in its intended
  read-only mode.
- Don't turn a business-logic-abuse test into permanent fixture corruption
  — reseed afterward per §1.3.

---

## 7. Internationalization / locale testing

**Scope this precisely before you start, or you will file false positives.**
Kaaj has **no UI-translation layer** — there is no message catalog, no
`paraglide`/`i18next`-style framework, and the application's own chrome, nav
labels, button text, and validation messages are English-only by
construction. "The Settings page isn't in French" is not a bug; the product
does not claim to render French UI text anywhere. Do not file that.

What genuinely is locale-aware, and is fair game to test — driven by
`firm_locations.locale` / `.timezone` / `.currency` (see
[CODING_GUIDELINES.md §5](CODING_GUIDELINES.md) and
[docs/enumerations-guide.md](docs/enumerations-guide.md)):

- **Number and currency formatting.** Set a firm location's locale to
  `fr-FR` and confirm figures actually render French conventions through
  `$lib/format.ts`'s `money()`/`number()`/`approxMoney()` — space as
  thousands separator, comma as decimal separator (`1 234,56`), and the
  currency symbol/placement `Intl` produces for that locale/currency pair.
  Compare against `en-US` for the same underlying value to confirm it
  actually changed, not just that it didn't crash.
- **Date and time formatting.** `fr-FR` renders `DD/MM/YYYY`-shaped dates
  via `calendarDate()`, and instants via `instant()` in the **office's**
  timezone, not the viewer's — test a firm location in a different
  timezone than your own browser and confirm the rendered time reflects
  the office, not your machine.
- **Country-specific validation.** `@kaaj/validation`'s French validators
  (tax id, postal code, phone, or whichever the package actually implements
  — check `packages/validation/` for current coverage) against real valid
  and invalid French values, not a generic regex assumption.
- **Locale-driven decimal/date parsing on the way in**, not just display —
  a form field accepting a French-formatted number or date should round-trip
  correctly through `FormReader`, or be refused with a sentence, never
  silently misparsed (this is the write-side mirror of the display rule,
  and the more dangerous direction to get wrong).
- **`Intl` failure modes.** An invalid or unsupported locale/timezone/
  currency code reaching `Intl` throws a `RangeError` on every page that
  formats a figure for that office (L24) — this is a real, previously-seen
  bug shape here; try to reproduce it by finding any path that lets an
  unvalidated locale/timezone/currency string reach a repository or a
  format call without going through the `locale`/`timezone`/`currency`
  `FormReader` readers.
- **Enum label localization**, if and where the product actually implements
  it (check `docs/enumerations-guide.md` against current UI code — this
  guide documents an ambition; confirm what's actually wired up before
  testing it, and file "spec says X, app does Y" rather than assuming
  either is authoritative).

Currency must never be converted for display (BR-FP-003) — a figure stays
in its currency of record. If you find a screen converting or mixing
currencies for display, that's a finding regardless of locale.

---

## 8. Performance testing

Ground this in [docs/03-perf_guide.md](docs/03-perf_guide.md) — it's the
project's own performance checklist; use it as your rubric rather than a
generic one.

Practical checks against the running app:

- **Page load and time-to-interactive** for every route in
  `smoke.spec.ts`'s list, under a cold dev server and a warm one — a
  regression that only shows up cold is still a regression for the first
  request after a deploy.
- **N+1 queries.** Watch the network/DB logs while loading a list page with
  a realistically larger fixture than Northwind's 12 employees (seed extra
  rows in a disposable local copy of the database, not in the shared
  fixture) — a per-row query pattern that's invisible at 12 rows can be the
  whole page at 500.
- **Pagination and large-list behavior** — does a list page degrade
  gracefully or attempt to render everything at once as data grows?
- **Concurrent-write behavior** on anything with a denormalized counter
  (L58) — fire concurrent writes and confirm the counter still reconciles
  afterward rather than drifting under contention.
- **`./check`'s own budget is a performance contract worth protecting**: it
  advertises ~25 seconds (~90s with `--all`). If a change measurably slows
  it down without a corresponding increase in what it verifies, that's
  worth flagging even though it's not a "bug" in the traditional sense.

---

## 9. Usability & accessibility testing

The bar here, stated plainly: **every task should be completable without
guessing, and every control should be reachable and understandable without a
mouse.** Compare visually against
<https://nexus.daisyui.com/dashboards/ecommerce> per CLAUDE.md's "The UI
reference" section before calling any screen done, and check documented,
*intentional* divergences in
[docs/07-app-provenance.md](docs/07-app-provenance.md) before flagging a
difference as a bug — some divergence is deliberate.

Concrete, codebase-specific checks — each tied to a real prior failure:

- **Every page has exactly one real `<h1>`**, reachable by
  `getByRole("heading")`. `smoke.spec.ts` checks this per-page; if you add
  a page, add it there (L64: no page in the app had one, and nothing but
  an accessibility-tree query would have found it).
- **Every interactive control is real interactive HTML** — a `<button>` or
  `<a>`, not a `<div onclick>` — reachable by Tab, activatable by
  Enter/Space, and with a visible focus ring (L30).
- **Touch targets** meet the project's floor (L12) — check on a real mobile
  viewport per [docs/04-mobile_guide.md](docs/04-mobile_guide.md), not just
  by eyeballing desktop.
- **Status badges** go through `StatusBadge`, and read as a tone
  (`positive`/`caution`/`critical`/`progress`/`neutral`), never a raw
  daisyUI class assembled inline (`badge-${x}` renders unstyled and errors
  silently — CLAUDE.md, "Never assemble a class name").
- **Contrast, measured, not eyeballed, in both themes.** `corporate`
  (light) has **not been re-measured** per CLAUDE.md's own admission for
  solid badges and for `/70` secondary text — this is an open, named gap;
  treat it as a standing test item, and measure by painting the computed
  color to a canvas and reading the pixel (CLAUDE.md: hand-parsing a
  computed color string was wrong three times in one session — don't
  repeat that).
- **Every refused form** (§ Forms in CLAUDE.md) names the field in the
  message, marks the control with both the daisyUI error class and
  `aria-invalid`, and — for a modal — stays open with the good values
  intact. `form-errors.spec.ts` is the executable spec for this; run it,
  and extend it for any form it doesn't yet cover.
- **Empty, loading, and error states** exist and are truthful for every
  list/detail screen — an empty tenant should say so, not render
  indistinguishably from "still loading" or from a bug.
- **The "not built yet" honesty pattern.** Where a feature is deliberately
  unimplemented (e.g. the assistant panel), it should say so plainly rather
  than offering a control that silently does nothing — if you find a
  no-op control that doesn't announce itself, that's a usability bug even
  though nothing "failed."
- **Long-value overflow.** A long firm/department/person name shouldn't
  push controls off-screen (L11's shape) — test with a maximally long
  value in every free-text field that appears in a heading, a card title,
  or a nav element.
- **Keyboard-only completion.** For at least one full workflow per module
  (create → edit → submit → confirm), complete it using only the keyboard
  and confirm nothing requires a mouse.

---

## 10. Filing a finding

A finding is not filed until someone else can reproduce it from your report
alone. Include:

1. **Title** — one line, states the defect, not the symptom category
   ("archiving a non-existent record reports success" not "bug in
   archive").
2. **Severity/risk** — use the `R0`–`R3` scale from
   [testplan-index.md](docs/testplan-index.md). `R0` (payroll, accounting,
   tenancy, PII, permission failures) gets flagged immediately, not batched
   into an end-of-cycle report.
3. **Persona and preconditions** — which login, which fixture row, which
   locale/timezone/role state.
4. **Exact reproduction** — steps, request payload, or the Playwright
   spec/commands that reproduce it. If you found it manually, write it as a
   spec addition candidate for `smoke.spec.ts`/`form-errors.spec.ts`/a new
   file, per §3.
5. **Observed vs. expected**, each backed by evidence (a screenshot, a DB
   query result, a network response, a log line with its error id — see
   CLAUDE.md's "Every unexpected error gets an id" and quote it).
6. **Which `./check` step, if any, should have caught this and didn't** —
   this is often the more valuable half of the report, because it points at
   a coverage gap, not just an instance.
7. **Lesson-learned candidacy** — per CLAUDE.md's own criteria (produced no
   error; would be repeated by someone reasonable following current docs;
   was found by looking rather than by testing; required reading a
   dependency's source): say explicitly whether this qualifies for a new
   `Lnn` entry, and if so, draft it in the report so it can be appended by
   whoever fixes the bug, without re-deriving your reasoning later.

Do not editorialize about severity beyond the R-class and evidence — the
report's job is to make the defect undeniable and reproducible, not to argue
for how urgently it should be fixed.

---

## 11. Definition of a complete test cycle

A cycle over a module or feature is done only when:

- Every requirement in its spec has a plan entry per §2, and every `R0`/`R1`
  item has both a positive and a real negative-path result, not just a
  positive one.
- Role-boundary testing (§5.1) has been run for every persona relevant to
  the feature, including at least one of the three multi-hat personas
  (Sarah, James, Diego — §1.2) where the feature's permission logic combines
  more than one grant.
- At least one adversarial pass (§6) has been made against every text/number
  input the feature exposes.
- Locale testing (§7) has been run against at least one non-`en-US` locale
  where the feature touches money, dates, or country-specific validation —
  and nothing was filed against the absence of UI translation.
- `./check --all` is green, or every red step is already filed as a finding
  with an R-class.
- Every finding is filed per §10, and every one that qualifies has a drafted
  `Lnn` candidate attached.
