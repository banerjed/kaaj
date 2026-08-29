# Kaaj

Unified workplace management software for SMBs. Multi-tenant SaaS, competing
with Zoho and Odoo

---

## Setting up a machine

```bash
git clone <repo> && cd kaaj && ./setup
```

Installs anything missing, starts the local Supabase stack, applies migrations,
seeds the fixture, and runs the full verification. About 30 seconds on a machine
that already has the tools; longer on the first run, which pulls Docker images.
Idempotent — safe to re-run.

```
./setup              install what is missing, start everything, verify
./setup --check      report what is missing, change nothing
./setup --no-install use only what is present; fail if anything is absent
./setup --reset      rebuild the database from migrations and reseed
```

**`./setup` is a developer bootstrap, not an on-premise installer.** It creates
a stack with well-known demo credentials and seeds the Northwind *test* fixture.
Never point it at a customer's infrastructure.

---

## ⚠️ Required before pushing

```bash
./check
```

**Everything must pass before you push, and always before deploying to
production.** Ten steps, about ten seconds. Non-zero exit means do not push.

```
./check          everything — run this before pushing
./check --db     database only
./check --app    application only
./check --quick  skip the build (fastest useful signal)
```

Needs the local stack running (`supabase start`). It finds `psql` and resolves
`DATABASE_URL` on its own — no shell setup required, and it works from any
directory in the repo.

### Deploying to production

```bash
./check                              # must be green
supabase db push                     # apply migrations to the hosted project
packages/database/tests/verify-remote.sh             # read-only verification against production
```

`supabase db push` is not reversible. Migrations are forward-only: a mistake is
corrected by writing another migration, never by rolling back.

**Never run `verify-rls.sql` against production** — it seeds a second tenant and
writes probe rows. `packages/database/tests/verify-remote.sh` is the only harness safe to point
at a live database; it forces a read-only transaction and aborts if that did not
take effect.

---

## What `./check` runs

| Step | Proves | Count |
|---|---|---|
| tenant isolation | every RLS policy actually filters, per table | 575 |
| specification | the schema answers the module specs | 167 |
| schema invariants | ADR design rules hold | 40 |
| structure snapshot | the schema is exactly what was committed | 4,152 facts |
| enum fixture | `expected-enums.sql` is current with `enumerations.json` | — |
| format / lint / typecheck / unit tests / build | every workspace package, via turbo | 21 tests |

These are complementary and none substitutes for another:

- **Isolation** proves policies work, but only where fixture rows reach — which
  is why it *fails* when a table has no fixture rather than passing vacuously.
- **Specification** proves the schema can answer the module specs. Its RLS
  checks are metadata-only; a policy of `USING(true)` passes them.
- **Invariants** prove rules hold, but say nothing about drift.
- **Snapshot** proves nothing changed, but cannot say whether it was right.

---

## Architecture in one paragraph

A **modular monolith**: SvelteKit is both frontend and backend
([ADR-004](docs/05-architecture-decisions.md)), modules are directories rather
than services ([ADR-001](docs/05-architecture-decisions.md)), and PostgreSQL is
the only datastore — search, job queue and cache included
([ADR-002](docs/05-architecture-decisions.md)). Supabase provides Postgres, Auth
and Storage ([ADR-008](docs/05-architecture-decisions.md)). Tenancy is shared
schema with `tenant_id`, isolated by row-level security
([ADR-003](docs/05-architecture-decisions.md)).

Full reasoning, including what was rejected and why, is in
[docs/05-architecture-decisions.md](docs/05-architecture-decisions.md).

---

## Layout

Turborepo monorepo, pnpm workspaces.

```
kaaj/
├── check                  ← run this before pushing
├── turbo.json             task graph; ./check and CI both drive it
├── .github/workflows/     CI. Must live at the ROOT; GitHub ignores it elsewhere
├── supabase/              Must stay at the ROOT: the CLI searches UPWARD only
│   ├── config.toml        ← migrations/ MUST stay beside this
│   └── migrations/        the authoritative schema
├── apps/
│   └── web/               SvelteKit — frontend and backend (ADR-004)
├── packages/
│   ├── validation/        33 country-specific validators, framework-agnostic
│   ├── enums/             enumerations.json + the SQL fixture generator
│   ├── database/          fixtures, harnesses, snapshot, schema reference
│   ├── eslint-config/     shared flat config
│   └── typescript-config/
└── docs/                  prose only — no executable artifacts
```

**Packages stay framework-agnostic.** Plain TS/JS, no Svelte imports, so a
future mobile app can consume them whatever it is built with. `@kaaj/validation`
is the reason: maintaining 33 country-specific validators in two languages would
produce a wrong tax identifier on a payslip, not a cosmetic bug.

**No `packages/ui` yet.** Every `.svelte` file is under `routes/`; building a
shared UI package before a second consumer exists would shape it around one
caller.

---

## The UI reference

**<https://nexus.daisyui.com/dashboards/ecommerce> is the canonical example.**
Compare every screen against it before calling UI work done — spacing, card and
table treatment, type scale, density, empty and loading states, and how the
shell behaves at each breakpoint.

It is the live version of the template in `nexus-sveltekit-ref`, so it is also
the fastest way to answer "is this how Nexus does it, or did we invent it?" —
the question behind most of the UI entries in
[docs/10-lessons-learned.md](docs/10-lessons-learned.md).

What we deliberately diverge on, and why, is recorded in
[docs/07-app-provenance.md](docs/07-app-provenance.md): the information
architecture, the URLs, the accessibility floor, and any demo feature with
nothing behind it. Divergence is fine — *undocumented* divergence is drift.

---

## Before building a module

Read **[docs/10-lessons-learned.md](docs/10-lessons-learned.md)**. It is a
running list of the traps in this codebase, each of which failed *silently* —
an empty page, an unstyled component, a control no keyboard can reach. Comments
in the app code reference it by number (`L4`, `L11`) rather than restating it.

Append to it when something bites. Do not rewrite past entries.

### Keep this file and the lessons file current

**When a salient bug is found in generated code, write the rule down before
moving on.** A bug that is fixed but not recorded gets regenerated — by the next
contributor, or by the next model, from the same plausible-looking assumption
that produced it the first time. The fix costs an hour; the rule costs a line.

Where it goes:

| Kind of finding | Goes in |
|---|---|
| A trap in *this* codebase — a thing that fails silently, a stale doc, a library behaviour that surprises | `docs/10-lessons-learned.md`, as a new `Lnn` |
| A rule that changes how code should be *written* here — a convention, a forbidden pattern, a required check | **this file**, under `Rules that are easy to get wrong` |
| Both | Both. The lesson explains; the rule constrains |

A finding qualifies as salient if any of these hold:

- it produced **no error** — an empty page, a silently unstyled component, a
  control no keyboard can reach, a check that passed vacuously
- it would be **repeated by someone reasonable** working from the docs as they
  stand, which usually means a doc is stale and should be corrected too
- it was **found by looking rather than by testing**, which means the test suite
  has a blind spot worth naming
- fixing it required **reading a dependency's source** to discover the real
  behaviour

Do not record ordinary bugs, one-off typos, or anything the code already makes
obvious. This file is read in full on every session; every line added is a line
everyone pays for. If an entry stops being true, delete it.

---

## Rules that are easy to get wrong

**Migrations, not `schema.sql`.** `packages/database/reference/schema.sql` is the design
document: it issues no `GRANT`s, so no role can read anything, and it defines
`app.set_updated_at()` without wiring it to a trigger. Only
`supabase/migrations/` produces a working database. Build and test from there.

**`config.toml` and `migrations/` must be siblings, at the repo root.** The CLI
resolves `migrations/` relative to `config.toml` and searches only *upward* for
it. At the root, `supabase start` works from any directory. When the two were
split, `supabase db reset` applied **zero** migrations and reported success.

**`config.toml` points at the fixture by relative path.** A wrong
`[db.seed] sql_paths` makes `db reset` report success against an empty database.
After any move, check `SELECT count(*) FROM employees` returns 12, not 0.

**Regenerate the snapshot only from a migration-built database.**

```bash
supabase db reset && pnpm db:snapshot
```

Generating from a hand-modified database bakes local experiments into the
baseline. This has already happened once: a manual `ALTER` left `invoices.total`
as `numeric(18,2)` when the migration says `numeric(15,2)`.

**Every exemption is a committed literal, never a filter.** The harnesses list
exempt tables and indexes by name with reasons. A new violation fails, and so
does removing a justified one — both require a reviewed edit. A `NOT IN` pattern
silently absorbs future violations, which is how a suite quietly stops testing
anything.

## Money

**`NUMERIC`, never `real`/`double precision`/`float`.** Postgres `NUMERIC` is
exact base-10; the float types are binary and lose digits before any code sees
them. Measured against this database: `99999.99` stored as `real` returns
`100000`, and `1234567.89` returns `1234570`. No downstream rounding recovers
that. `./check` fails on a monetary column declared as a float — see the
`money/numeric-not-float` invariant.

**Two scales, chosen deliberately:**

| Kind | Type | Why |
|---|---|---|
| Money — salaries, invoices, premiums | `numeric(15,2)` | Ten trillion minor units; covers INR at crore scale |
| Rates and quantities — hourly rates, hours, FTE | `numeric(18,4)` | A rate of 12.3456/hour is meaningful, and rounding it before multiplying compounds across a timesheet |

**Money is a `string` in TypeScript, end to end.** This is the rule people get
wrong, and it is where money actually dies — not in the database.

- postgres.js returns `NUMERIC` as a **string**, and `client.ts` sets
  `types: {}` so it stays one. Do not "helpfully" parse it.
- `Number("9007199254740993.00")` is `9007199254740992`. Silently.
- Repository types declare money as `string`. `$lib/format.ts` `money()` takes a
  string and converts only inside `Intl.NumberFormat`.
- Form fields use `inputmode="decimal"`, never `type="number"` — the latter
  round-trips through a float in the browser.

**Arithmetic happens in SQL, not in JavaScript.** Summing invoice lines,
computing gross pay, prorating: all `NUMERIC` in Postgres, where it is exact.

**Currency travels with the amount, always,** and is never converted for
display (BR-FP-003). A figure is shown in its currency of record, formatted in
the locale of the market it belongs to — see `localeForCurrency` and
[L24](docs/10-lessons-learned.md).

**Postgres ROUNDS to scale, silently — it does not truncate.**
`12345678.9052::numeric(12,2)` is `12345678.91`. When the same value is stored
in two columns of different scale, round to the authoritative one before
writing the other, and pick a test value that distinguishes rounding from
truncation — `.9052`, not `.9012` ([L25](docs/10-lessons-learned.md)).

**Not integer minor units.** The other defensible answer, rejected: every query
needs division to be readable, JPY (0 decimals) and BHD (3) break the ×100
assumption, and `Intl.NumberFormat` wants major units. `NUMERIC` gives
exactness without that tax.

---

**Secondary text stops at `base-content/70`.** Below that it fails WCAG AA on a
light background (`/60` is 4.26:1 against 4.5 required), and it passes in dark
mode either way — so the failure is invisible if you only check one theme. Any
new colour pair needs measuring in all six; see
[L22](docs/10-lessons-learned.md).

**Customization is data, never code.** Customers customize through rows, custom
field definitions and settings — never per-tenant schema changes or per-tenant
code. See [docs/06-customization-model.md](docs/06-customization-model.md).

**Custom fields must never feed payroll or accounting calculations.** They are
untyped and untested. A customer needing a custom allowance on a payslip is a
modelling gap to fix in the product, not a custom field.

**`PRIVATE_SUPABASE_SERVICE_ROLE` bypasses RLS entirely.** Server-side and
worker only — never in anything reachable from a request handler, and never in a
`PUBLIC_`-prefixed variable, which SvelteKit ships to the browser.

---

## Common tasks

```bash
pnpm install                         # install the whole workspace
supabase start                       # bring the local stack up
pnpm dev                             # http://localhost:5173

supabase migration new <name>        # new migration
supabase db reset                    # rebuild from migrations, reseed fixture
pnpm db:snapshot                     # regenerate the snapshot after a change
pnpm --filter @kaaj/enums build      # regenerate the enum fixture

pnpm turbo run build                 # everything, cached
pnpm --filter @kaaj/web dev          # one package only
supabase status                      # URLs and keys
```

Studio is at http://127.0.0.1:54323 and all outbound mail is captured at
http://127.0.0.1:54324.

Local environment values live in `apps/web/.env.local` and are loaded automatically.
Production values live in `apps/web/.env.prod`, which is deliberately **not**
auto-loaded so a stray `npm run dev` cannot write to production. Both are
gitignored.
