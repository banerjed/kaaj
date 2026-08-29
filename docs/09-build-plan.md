# Build Plan: Firm Profile, then Employee Profile

**Status:** Phase 0 and Phase 1 complete · Phase 2 directory and detail done
**Started:** 2026-08-28
**Living document.** The checklist below is the source of truth for what is
done. Tick a box only when the step is verified, not when the code is written.

---

## Why this exists

The database is finished and the application is not. `supabase/migrations/`
defines 98 tables with RLS forced on every one, `./check` proves isolation
across 575 policy checks, and the Northwind fixture seeds 12 employees across
three countries. What sits in `apps/web` is still the unmodified CMSaasStarter
template — a marketing site and Stripe billing, with no Kaaj module in it.

This plan builds the product on that schema:

| Concern | Authority |
|---|---|
| Shell, components, styling | `nexus-sveltekit-ref` (Nexus SvelteKit 3.0.0) |
| Information architecture, URLs | [02-ux-design-specification.md](./02-ux-design-specification.md), [html-mockups/](./html-mockups/) |
| Performance rules | [03-perf_guide.md](./03-perf_guide.md) |
| Responsive and touch rules | [04-mobile_guide.md](./04-mobile_guide.md) |
| Server-side shape | [api-surface.md](./api-surface.md) § Surface B |
| Module content | [module-firm-profile.md](./module-firm-profile.md), [module-employee-profile.md](./module-employee-profile.md) |

Firm Profile ships first because every other module foreign-keys into it —
departments, locations, job titles and holidays are what an employee record
points at. Employee Profile follows. The remaining modules come after, on the
same rails.

---

## Pre-flight findings

Each was verified against the running local stack before any code was written.
Each would otherwise have been a silent empty-page failure. A fifth, recorded
under [0.1](#01-make-login-produce-a-tenant-claim--done), only surfaced once the
work began.

**1. Tenant context is `request.jwt.claims`, not `app.tenant_id`.**
[ADR-003](./05-architecture-decisions.md) rule 4 says
`SET LOCAL app.tenant_id = ...`. But `app.current_tenant_id()`, as rewritten by
`20260827000004_harden_tenant_context.sql`, reads
`current_setting('request.jwt.claims')` and extracts `{app_metadata,tenant_id}`.
**The ADR prose is stale relative to the migration.** The blessed form is in
`packages/database/tests/verify-rls.sql:206` — the harness that proves isolation
actually works — and it is confirmed to return 12 employees, 3 locations and
6 departments.

**2. `app_user` has `LOGIN` but no password, and `DATABASE_URL` is the owner.**
`postgres` bypasses `FORCE ROW LEVEL SECURITY`. An application built against
`DATABASE_URL` has RLS in name only, and every isolation bug stays invisible
until production — the exact failure [ADR-003](./05-architecture-decisions.md)
rule 3 exists to prevent. Hence a separate `APP_DATABASE_URL` and a local
`ALTER ROLE app_user WITH PASSWORD` in `./setup`.

**3. No login can currently carry a tenant claim.** *(Resolved in 0.1.)*
`auth.users` is empty, and
`[auth.hook.custom_access_token]` is commented out in `supabase/config.toml`.
The hook function exists — `20260827000002_auth_and_grants.sql` creates it and
says in a comment that registration is a separate step — but nothing registers
it. Until both are fixed, every page renders empty.

**4. PostgREST is deliberately unreachable.**
`20260827000002_auth_and_grants.sql` §5 grants nothing to `authenticated` or
`anon`, so `/rest/v1/*` returns 42501 for every table, by design. `locals.supabase`
is for auth and storage only. Every module read and write goes through
postgres.js.

---

## Decisions taken

- **`(marketing)` and `(admin)/account` are left untouched.** New work lands in
  a new `(app)` route group alongside them. Nothing currently passing `./check`
  is disturbed. The CMSaasStarter scaffolding can be removed later, once the
  real application stands on its own — see [07-app-provenance.md](./07-app-provenance.md).
- **Data-level i18n, English UI chrome.** `*_i18n` JSONB columns are read,
  written and round-tripped through per-locale form inputs driven by the
  tenant's `supported_locales`; dates, numbers and currency format through
  `Intl` bound to the tenant locale. A UI translation catalogue is deferred.
- **Route group is `(app)`, not `(admin)`.** Nexus's group is `(admin)` and
  `apps/web/src/routes/(admin)/account/` already exists; they would collide.
  `api-surface.md` writes `(app)` itself.

---

## Phase 0 — Foundations and one working vertical slice

Ends with a single real page reading fixture rows as the non-owner `app_user`
role under RLS, inside the Nexus layout, with `./check` green.

### 0.1 Make login produce a tenant claim — **DONE**

- [x] Enable `[auth.hook.custom_access_token]` in `supabase/config.toml`
      (`pg-functions://postgres/public/custom_access_token_hook`)
- [x] Add `packages/database/fixtures/dev-users.sql` — `auth.users` and
      `auth.identities` rows derived **from `tenant_users`**, so ids match by
      construction rather than by copied literals
- [x] Register it in `[db.seed] sql_paths` after `mock-data.sql`
- [x] Point `site_url` / `additional_redirect_urls` at the SvelteKit dev port
      (was `:3000`; vite dev serves `:5173`)
- [x] `20260828000001_fix_access_token_hook_search_path.sql` — see below
- [x] `./setup` sets the `app_user` password and proves the role does not
      bypass RLS
- [x] Verify: all five seeded users log in and carry
      `app_metadata.tenant_id` + `role`
- [x] `./check` green (10 steps); snapshot regenerated for the function change

Dev-only, and labelled as such in the file. Same standing rule as the rest of
`./setup`: well-known demo credentials, developer bootstrap, never pointed at
customer infrastructure.

> #### Finding 5 — the access-token hook could never have worked
>
> Registering the hook for the first time turned every login into a 500:
>
> ```
> ERROR: relation "tenant_users" does not exist (SQLSTATE 42P01)
> ```
>
> GoTrue invokes the hook as `supabase_auth_admin`, whose `search_path` does not
> include `public`, and `custom_access_token_hook()` referenced `tenant_users`
> unqualified. `20260827000002_auth_and_grants.sql` got all three grants right —
> `USAGE` on `public`, `SELECT` on `tenant_users`, and the
> `auth_admin_reads_memberships` policy that breaks the RLS deadlock — so this
> reads as a permission problem and is not one. Name resolution was the missing
> piece.
>
> It had never surfaced because registration is a separate, non-SQL step, so
> nothing had ever called the function. **A hook error is a 500 on `/token`,
> not a degraded login** — this was total, not partial.
>
> Fixed forward (migrations are never rolled back) in
> `20260828000001_fix_access_token_hook_search_path.sql`: `SET search_path = ''`
> plus schema-qualified references, which is the form Supabase recommends for
> any function reachable by another role. Body otherwise unchanged.

**Dev logins** — all `@northwind.example`, password `devpassword`:
`sarah.johnson` (owner), `rachel.adeyemi` (hr_admin), `aisha.okafor` (manager),
`marcus.chen` and `tom.whitfield` (member).

> **`config.toml` changes need `supabase stop && supabase start`.**
> `supabase db reset` restarts the containers but does not re-read the config,
> so the hook silently stays unregistered and login succeeds *without* a claim —
> which looks like the hook working until you decode the token.

### 0.2 The data layer — **DONE**

`apps/web/src/lib/server/db/`

- [x] `client.ts` — postgres.js 3.4.9 pool on `APP_DATABASE_URL`. Module-scoped,
      the one piece of shared server state doc 03 sanctions, because
      [ADR-009](./05-architecture-decisions.md) specifies exactly this map.
      Exposed as `getConnection(tenantId)` — the tier-aware signature from day
      one, so the per-subdomain router lands later without touching a call site.
- [x] `tenant.ts` — `withTenant(tenantId, fn)`: `sql.begin()` →
      `SET LOCAL ROLE app_user` → `set_config('request.jwt.claims', $1, true)` →
      `fn(tx)`. Repositories accept a `Tx` they cannot construct, so there is
      exactly one way to reach the database and it always carries a tenant.
- [x] `hooks.server.ts` resolves `tenantId` once into `locals.tenantId`
      (ADR-003 rule 5); declared in `app.d.ts`
- [x] `APP_DATABASE_URL` in `.env.example` / `.env.local`; `./setup` sets the
      `app_user` password and asserts the role does **not** bypass RLS
- [x] `tenant.test.ts` — 6 tests, against a real database
- [x] `./check` green

> **Two mechanics that silently do nothing if you get them wrong**, and the
> reason this is one function rather than a convention: `set_config(..., true)`
> is transaction-local, so outside an explicit transaction it is a no-op and
> every query then sees no tenant; and postgres.js cannot parameterise `SET`, so
> it must be `set_config($1,$2,true)` rather than an interpolated `SET LOCAL` —
> the value derives from a token.

**What the test covers, and why each case is there.** `verify-rls.sql` already
proves the 575 policies filter. What it cannot prove is that `withTenant` builds
the same session — and a mistake there does not raise, it returns either nothing
or everything. Both directions are asserted, because a test for one passes under
the other: 12 employees for Northwind, 0 for a tenant that owns nothing, no leak
between back-to-back transactions on the same pooled connection, a clean
connection afterwards, a malformed id rejected before it reaches SQL, and
rollback on throw.

> #### Finding 6 — `SET LOCAL ROLE` makes isolation independent of the DSN
>
> Running the suite with `APP_DATABASE_URL` deliberately pointed at the **owner**
> (`postgres`) still passes. That is not the test being weak — it was confirmed
> against a wrong-password URL, which fails 5 of 6, so the override genuinely
> reaches the client.
>
> The reason is `SET LOCAL ROLE app_user` inside the transaction: it drops to
> the non-owner role for the duration, and RLS is evaluated against
> `current_user`. So isolation does not rest solely on the connection string
> being right — a misconfigured DSN degrades performance and privilege hygiene,
> not tenancy. Worth knowing, and **not** a reason to relax about the DSN: the
> `SET LOCAL ROLE` is the only thing standing between the two, and `./setup`
> asserts the connection is `app_user` regardless.

### 0.3 Nexus shell into `apps/web` — **DONE**

- [x] `components/admin-layout/*`, `styles/**`, `ConfigProvider`, `Logo`,
      `ThemeToggle`, `PageTitle` copied into `apps/web/src/lib/`
- [x] `@tailwindcss/postcss` → `@tailwindcss/vite`; `postcss.config.js` deleted
- [x] Marketing pages confirmed unchanged **in a browser**, not just in a build
- [x] `pnpm format` over everything copied
- [x] Nexus's `warningFilter` deliberately **not** copied

**The two daisyUI themes coexist rather than one winning.** `src/app.css` is now
the single Tailwind entry point; `saasstartertheme` lost `themes: false` and
`default: true` (which collided with Nexus's `light`), and `(marketing)` and
`(admin)/account` claim it explicitly with `data-theme` on a `display: contents`
wrapper. Total CSS is 237 KB raw, **28 KB brotli** — inside doc 02's budget.

**Deps taken:** `@iconify/tailwind4`, `@iconify-json/lucide`,
`tailwindcss-motion`, `simplebar`, `postgres`. Deferred: apexcharts, quill,
filepond, swiper, sortablejs, flatpickr.

**Fonts moved out of CSS.** Nexus chains four Google Fonts families through
`@import url(...)`, which is render-blocking three requests deep. Replaced with
one family via `<link rel="preconnect">` + `<link>` in `app.html`.

> #### Finding 7 — the suppressed warnings were real, and there were 73
>
> Not copying `warningFilter` surfaced **73 lint errors** in the copied
> components. They were defects, not stylistic noise:
>
> - Every control in the appearance panel was `onclick` on a plain `<div>` —
>   mouse-only, no tab stop, no role. WCAG 2.1.1 and 4.1.2 failures, in the one
>   panel a low-vision user is most likely to need.
> - ~35 self-closing non-void tags (`<span />`), which HTML parses as an *open*
>   tag, nesting everything after them.
> - `Sidebar`'s active-item tracking was seeded `$state`, capturing only the
>   initial `menuItems` — a Svelte 5 reactivity bug that would bite the moment
>   the menu becomes role-dependent.
> - Unlabelled icon buttons and `href="#"` links throughout.
>
> All fixed. The full list is in
> [07-app-provenance.md](./07-app-provenance.md#the-second-source-nexus-ui-template).

> #### Finding 9 — three things were hand-rolled that daisyUI ships
>
> Prompted by a review of utility-class density. The general objection does not
> hold — daisyUI is a component layer *on* Tailwind, and layout utilities are the
> intended usage; Nexus's own `CustomerTableRow.svelte`, written by the daisyUI
> template author, is `<tr class="hover:bg-base-200/40 cursor-pointer *:text-nowrap">`.
> But three specific components were genuinely rebuilt by hand:
>
> | Was | Now | Why it mattered |
> |---|---|---|
> | `grid gap-3` + nested `card`/`card-body`/flex for the mobile fallback | `list` / `list-row` / `list-col-grow` / `list-col-wrap` | A purpose-built component existed. Hand-built spacing drifts from the rest of the app one page at a time |
> | `flex items-center justify-between px-6 pb-4` in the footer | `footer` + `footer-horizontal` | Component exists, and grows correctly when columns are added |
> | `min-h-11` on one button | one `@media (pointer: coarse)` rule in `app.css` | The per-element form has to be remembered at every call site forever and is invisible when forgotten. The rule now covers controls nobody has written yet |
>
> Deliberately **not** changed, having checked: `hover:bg-base-200/40` on table
> rows (daisyUI 5 dropped the v4 `hover` table modifier, and this is Nexus's own
> string), and `Logo.svelte` (a brand mark replacing two missing PNGs, not a
> component instance).
>
> Also learned: daisyUI already ships
> `@media (pointer: coarse) { .input:focus { --font-size: 1rem } }`, so doc 04's
> "16px inputs to stop iOS zoom" is handled by the library.
>
> Verified in a real 400px viewport (an iframe — Chrome would not shrink the
> window far enough): table hidden, list shown, 3 correct rows, `.list-row`
> computing to `display: grid`. The 44px floor could **not** be exercised in a
> desktop browser, since `pointer: coarse` never matches there; the rule was
> confirmed present in the delivered CSSOM instead.

### 0.4 Route group and navigation — **DONE**

- [x] `(app)/+layout.svelte` — Nexus shell wrapped in `ConfigProvider`, mounted
      here rather than at the root so the marketing theme is not overwritten
- [x] `(app)/+layout.server.ts` — redirects on no session, and separately on a
      session with no tenant claim, which is a real state deserving a message
      rather than an empty page
- [x] `menu.ts` — doc 02's five module groups. Unbuilt modules are listed and
      marked `disabled`, so the shape of the product is legible without dead
      links (`SidebarMenuItem` gained a `disabled` branch for this)
- [x] Breadcrumbs via `PageTitle` (root crumb changed from "Nexus" to "Home")

**Demo content removed rather than rewired**: the ⌘K palette over a hardcoded
list, the five-language switcher, the invented notification tray, "Denish N",
"John Doe", the fake team roster, the "Upgrade — save 30%" panel, and the
footer's "Buy Now" link to the daisyUI store. A shell that looks finished and
behaves broken is worse than an absence, and would have to be un-shipped before
the real feature could land.

### 0.5 The slice — **DONE**

- [x] `$lib/server/firm-profile/firm_locations.repo.ts`
- [x] `(app)/settings/locations/` — renders the fixture's 3 real locations
- [x] Verified in a browser as the seeded owner: New York HQ (US-NYC),
      Bangalore Delivery Centre (IN-BLR), London Office (UK-LON), each with its
      own timezone, live local time and currency
- [x] Card fallback confirmed at a 507px viewport: table hidden, 3 cards shown
- [x] Primary action measured at exactly 44px (doc 04's touch target)
- [x] **`./check` green — 10 steps**

> #### Finding 8 — `user.app_metadata` never carries the tenant claim
>
> The first working login redirected straight to "no tenant", despite the JWT
> demonstrably carrying `app_metadata.tenant_id`.
>
> `custom_access_token_hook()` rewrites the claims of the **token being issued**.
> It does not touch the `auth.users` row. `getUser()` returns that row, so
> `user.app_metadata` holds only what GoTrue itself stored —
> `{provider: "email", providers: ["email"]}` — and never the tenant.
>
> This is the most dangerous shape of bug in this codebase: `undefined` for every
> user, every page empty, and **no error anywhere**. `hooks.server.ts` now reads
> the claim out of `session.access_token`, which is safe precisely there because
> `safeGetSession` has already validated that token through `getUser()`.

## Phase 1 — Firm Profile

Nine repositories under `apps/web/src/lib/server/firm-profile/`, one per table,
at exactly the paths `api-surface.md` enumerates. Each gets the canonical
`list / getById / create / update / archive|remove`. `firm_locations.repo.ts`
from Phase 0 is the pattern; the other eight follow it.

- [x] `firm_locations` · `firm_departments` · `firm_job_titles` · `firm_job_levels`
- [x] `firm_payroll_policies` (+ `tenants`, `payroll_pay_schedules`)
- [x] `firm_benefits_packages` · [ ] `firm_benefits_plans` (carrier detail, deferred)
- [x] `firm_holidays` · `firm_benefit_items`

Pages, with URLs from the module spec § Page Specifications — not from Nexus:

| Page | URL | Notes | Done |
|---|---|---|---|
| Company profile | `/settings/company` | tenant info, regional settings, live formatting preview | [x] |
| Locations | `/settings/locations` | 3-tab modal, HQ rule, archive guard | [x] |
| Departments | `/settings/departments` | tree via `parent_department_id`; cycle guard | [x] |
| Job titles & levels | `/settings/job-titles` | levels nested; multi-currency bands per market | [x] |
| Payroll policies | `/settings/payroll/policies` | firm-wide default + per-office overrides | [x] |
| Pay schedules | `/settings/payroll/schedules` | 12-date projection, two timezones, clash flags | [x] |
| Benefits | `/settings/benefits` | packages → items, multi-currency costs | [x] |
| Holidays | `/settings/holidays` | per-office calendar, per-office date locale | [x] |

**Reuse rather than rebuild:**

- `@kaaj/validation` for country-specific address, phone and tax-identifier
  validation. It is the reason packages are framework-agnostic, and it is
  already a dependency of `@kaaj/web`.
- `@kaaj/enums` (`packages/enums/src/enumerations.json`) for every dropdown
  backed by a Postgres enum. **No hand-typed option lists in Svelte** — the enum
  fixture step in `./check` exists precisely to keep these in step.
- Nexus's `forms/FileUploader.svelte` for logo upload, and its table and modal
  patterns (`ecommerce/customers/CustomerTable.svelte` is the closest shape).

---

## Phase 2 — Employee Profile

Nine repositories under `apps/web/src/lib/server/employee-profile/`:
`employees`, `employment_terms`, `employee_assets`, `employee_certifications`,
`employee_training_records`, `employee_bank_accounts`, `employee_group_members`,
`employee_group_roles`, `employee_user_groups`.

- [x] **Directory** `/employees` — one `load`, one query joining `employees` +
      `firm_departments` + `compensation_base`. Doc 03's one-page-one-query
      rule; `api-surface.md` names this exact join as its worked example.
      Server-side pagination, filter state in the URL, columns per
      `html-mockups/employees.html`
- [x] **Detail** `/employees/[id]` — Personal / Employment / Compensation tabs;
      remaining tabs per `html-mockups/employee-detail.html`:
      Personal Information, Employment Details, Compensation, Assets,
      Training & Certifications, Documents
- [ ] **Create / edit** — progressive disclosure and an onboarding wizard per
      doc 02, with the sub-resource tables as nested sections

---

## Cross-cutting, applied from the first repository

Retrofitting any of these means rewriting every repository.

- **Doc 03** — one query per page; queries shaped to match the schema's
  `(tenant_id, …)` leading indexes; `parent()` called last in `load`; every list
  paginated; no N+1 in the join layer; charts updated rather than recreated.
- **Doc 04** — 44px minimum touch targets; 16px inputs, below which iOS zooms on
  focus; a card fallback for every table below `sm`, since Nexus's tables are
  desktop-first; bottom-sheet modals on small screens.
- **Doc 02** — designed empty states, loading skeletons, WCAG 2.1 AA.

---

## Deferred deliberately

Flagged rather than silently skipped. Any of these can be pulled forward.

1. **Field-level PII encryption.** `module-employee-profile.md` § Encryption
   Specification requires key generation, storage, rotation and per-field
   encryption. The committed schema stores `ssn_tax_id TEXT` in plaintext —
   **the specification and the schema disagree.** Closing this needs a migration
   and a key-management decision; it does not belong inside a UI phase.
2. **Command palette (⌘K)** — doc 02; only meaningful once several modules exist.
3. **AI assistant panel** — doc 02; `module-ai-assistant.md` is its own module.
4. **Change requests / approval workflow** — `module-change-requests.md` is a
   separate spec; employee self-service edits belong there.
5. **Org chart as a rendered diagram** — Phase 1 ships the department tree; the
   visual chart with locale switching comes after.
6. **UI translation catalogue and currency conversion helpers** — per the
   decision above; conversion also needs `exchange_rates` wired up.
7. **ADR-009 subdomain routing and control plane** — the pool is shaped for it,
   but the ADR is explicit that tiers B and C are not built until a customer has
   paid for them.

---

## Verification

```bash
supabase db reset                                          # migrations + both seed files
psql "$DATABASE_URL" -c "select count(*) from employees"   # 12, not 0
```

Then prove the application reads through RLS as the non-owner role, which is
the entire point of the data layer:

```bash
psql "$APP_DATABASE_URL" -c "select count(*) from employees"   # 0 — no claim, no rows
pnpm dev                                                       # log in as the seeded owner
```

The page must show 3 locations / 6 departments / 12 employees.

- Page renders rows **and** `APP_DATABASE_URL` alone returns zero → the tenant
  claim is working. Correct.
- Page renders rows **and** the raw connection also returns rows → the
  application is connected as the owner and RLS is decorative. **Stop and fix
  the connection string.**

Automated cross-tenant check: the Phase 0 vitest asserts tenant A's claim
returns none of tenant B's rows through `withTenant`.

Finally, and non-negotiably before any push:

```bash
./check
```

All ten steps green. Non-zero exit means do not push.

**Definition of done, per phase:** `./check` green, the pages render the
Northwind fixture's real rows as `app_user` under RLS, no module data path
touches `supabaseServiceRole` or PostgREST, and **the finished screen has been
compared against <https://nexus.daisyui.com/dashboards/ecommerce>** — the
canonical template — with any deliberate divergence recorded in
[07-app-provenance.md](./07-app-provenance.md).
