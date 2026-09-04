# Kaaj

Unified workplace management software for SMBs. Multi-tenant SaaS

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
production.** 21 steps, about 25 seconds; `./check --all` adds the
browser suite. Non-zero exit means do not
push.

```
./check          everything — run this before pushing
./check --db     database only
./check --app    application only
./check --quick  skip the build (fastest useful signal)
```

Needs the local stack running (`supabase start`). It finds `psql` and resolves
`DATABASE_URL` on its own — no shell setup required, and it works from any
directory in the repo.

### What it runs

| Step | Proves | Count |
|---|---|---|
| tenant isolation | every RLS policy actually filters, per table | 587 |
| specification | the schema answers the module specs | 167 |
| schema invariants | ADR design rules hold, and a bad claim fails closed | 142 |
| structure snapshot | the schema is exactly what was committed | 3,823 lines |
| enum fixture | `expected-enums.sql` is current with `enumerations.json` | — |
| authorization | every form action authorizes; no DELETE in app code | 45 |
| actor | every `withTenant` carries the actor, not a bare tenant id | — |
| no backtick in SQL | no `--` comment inside a `tx\`...\`` template holds a backtick | — |
| no unprotected fallback | no protected column `COALESCE`s to an open one | — |
| sensitive cols classified | every column is in the matrix or the not-sensitive list | — |
| writes are audited | every action is in the audit register, either list | 31 + 6 |
| refusals have a message | every constraint a form can trip answers with a sentence | 23 |
| service role quarantined | nothing outside a committed list bypasses RLS | 5 files |
| product name not hardcoded | the product name is spelled once, in config.ts | — |
| fixtures are complete | no base-table column is empty in the fixture | — |
| security | authorization, PII and tenant isolation, both suites | 357 |
| format / lint / typecheck / unit tests / build | every workspace package, via turbo | 964 tests |

**These counts go stale.** They are here because a number nobody can check is a
claim nobody can challenge — so correct them when they move, or delete the
column. They were last verified 2026-09-03.

These are complementary and none substitutes for another:

- **Isolation** proves policies work, but only where fixture rows reach — which
  is why it *fails* when a table has no fixture rather than passing vacuously.
- **Specification** proves the schema can answer the module specs. Its RLS
  checks are metadata-only; a policy of `USING(true)` passes them.
- **Invariants** prove rules hold, but say nothing about drift.
- **Snapshot** proves nothing changed, but cannot say whether it was right.

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

**`vite dev` refuses to start against anything but `127.0.0.1`/`localhost`, with
no override.** A real environment variable beats a `.env` file, so a
`PUBLIC_SUPABASE_URL` exported in a shell profile — copied out of a one-line
"point dev at prod for one run" command and left there — silently outranks
`apps/web/.env.local` for every future `pnpm dev` on that machine, with nothing
in the UI to say so ([L75](docs/10-lessons-learned.md)). There is deliberately
no opt-out env var for this check: that would just be the same footgun one
level up. `pnpm build` against `.env.prod` — the actual deploy path — is
unaffected: the guard only fires on `command === "serve"`, which is `vite dev`
and anything that starts one, including the vitest runner and the e2e
`webServer`.

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
    └── user-guide/        written for CUSTOMERS, not contributors. No table
                           names, no internals. See its README
```

**Two test suites assert authorization. Keep them independent, and keep the
bridge.** `apps/web/src/**/*.test.ts` asserts the DEPLOYED enforcement — real
`can()`, real actions, real database. `packages/spec-tests` asserts the
SPEC-DERIVED requirement matrix, with traceability IDs. They are separate
implementations on purpose: two catch each other's errors, one cannot.

Independence only pays off if something compares them — both were green for
weeks while contradicting each other on whether a payroll admin sees a full bank
number. `packages/spec-tests/tests/authz-conformance.spec.test.ts` is that
comparison. It asserts **outcomes**, never internals, and a failure means
"decide which is right", not "make one match the other".

**Do not make either suite call the other's authorizer.** That leaves one
implementation wearing two hats. `@kaaj/authz` is the product's vocabulary,
consumed by `apps/web` and the bridge; `spec-tests` keeps its own.

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

**A status badge goes through `StatusBadge` (`$lib/components/`).** Eleven
pages each held their own ternary returning `badge-success`/`badge-error`/…;
the vocabularies differ and should — "paid" belongs to invoices and "present"
to attendance — but the daisyUI spelling was copied eleven times. A page now
names a *tone* (`positive` · `caution` · `critical` · `progress` · `neutral`)
and the component holds the ten complete class strings, so restyling every
status badge is one edit ([L72](docs/10-lessons-learned.md)).

**They are SOLID, not `badge-soft`, against both Nexus and daisyUI's own
preference.** `badge-soft` failed AA in the light theme when it was `nord` —
1.32:1 to 3.27:1, against solid's 4.97 to 12.24. It passes in dark, but a badge
style cannot be theme-dependent. The light theme is now `corporate`, and this
has **not been re-measured**: `corporate` pairs pure-white content colours with
several mid-bright backgrounds, the same shape that failed before
([L73](docs/10-lessons-learned.md)) — treat solid vs. soft as unverified there
until it is. The accessibility floor outranks template fidelity and the
divergence is recorded in
[docs/07-app-provenance.md](docs/07-app-provenance.md).

**Never assemble a class name.** `badge-${size}` is invisible to Tailwind,
which reads source text and cannot evaluate an expression — the class is simply
never generated, the element renders unstyled, and nothing errors. Map each
state to a COMPLETE class string, as `StatusBadge`'s `BADGE` table does —
daisyUI's own audit flags an assembled one for the same reason.

**The palettes are daisyUI's built-in `corporate` (light) and `night` (dark),
and the app never owns a copy of them.** `data-theme` carries those names; the
labels a person reads are still Light and Dark, and `TopbarProfileMenu` keeps
value and label separate on purpose. `system` removes `data-theme` entirely,
which is what `--prefersdark` on `night` is for — daisyUI warns against
combining `--prefersdark` with a controller, and that warning is about
controllers WITHOUT a system option. The two themes used to be ~98 hand-written
lines, and owning that copy is how 3 of 4 solid badges came to fail AA
([L73](docs/10-lessons-learned.md)).

**Measure a colour pair by letting the BROWSER convert it** — paint it to a
canvas and read the pixel. Hand-parsing a computed colour string was wrong
three times in one session: `oklab()` components read as RGB, an alpha colour
composited over white rather than its backdrop, and a `/\d+/g` channel regex
over `oklch(0.20768 …)` scoring a near-black surface at brightness 20788.

**Two faces, in BOTH themes: `--font-sans` is Inter, `--font-display` is
Instrument Serif.** daisyUI themes carry no font slot and Tailwind `@theme`
tokens are global, so a per-theme typeface would mean redefining tokens under
`[data-theme]` and reflowing every heading on a toggle. A theme switch changes
colour, not type. Instrument Serif ships ONE weight — `font-display` headings
must not carry `font-bold`, or the browser synthesises a fake bold.

**Secondary text stops at `base-content/70`.** Below that it fails WCAG AA on a
light background (`/60` is 4.26:1 against 4.5 required), and it passes in dark
mode either way — so the failure is invisible if you only check one theme. Any
new colour pair needs measuring in BOTH — and the light one is the half that
fails; see [L22](docs/10-lessons-learned.md). The light theme is now
`corporate`, and `/70` has not been re-measured against it — re-check before
relying on this floor.

**Customization is data, never code.** Customers customize through rows, custom
field definitions and settings — never per-tenant schema changes or per-tenant
code. See [docs/06-customization-model.md](docs/06-customization-model.md).

---

## Before building a module

Read **[CODING_GUIDELINES.md](CODING_GUIDELINES.md)** — the patterns for
authorizing a new API call, RLS on a new table, money, timezones, locale,
audit logging, error handling, UI code and form validation, each with a real
GOOD/BAD example. It teaches the pattern; this file and `./check` are still
the authority on the specifics.

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

## Security: how the breaches actually happened

Every disclosure found here was a *correct-looking number in the right-looking
column*. None raised an error, none failed a test, and several sat behind
guards that were passing. The concrete rules are below; these are the lenses
that let you spot the **next** one. Each links the case that produced it.

- **A protected value has more than one home.** Protection is applied per
  MECHANISM; disclosure happens per VALUE. List every place the value exists —
  caches, JSONB, audit entries, exports, indexes, logs (L47, L55).
- **Ask who can READ what you write.** A new write is designed as a write and
  its read side is examined by nobody. The highest-yield question here (L55).
- **A guard never observed failing is not evidence.** Reintroduce the bug and
  watch it fail (L48).
- **An empty column is an unchecked column.** A test whose subject is NULL
  reports the absence of data as the absence of a problem (L50, L51).
- **Test as the actor meant to be REFUSED.** Suites run as an owner, which
  makes the refused branch unreachable. Assert both halves (L47).
- **A rule written only in prose is applied unevenly.** Make it a committed
  register plus a `./check` step that fails on anything unclassified (L48, L54).
- **`any` forbids nothing.** An untyped row is unexaminable downstream (L53).
- **Make the classification visible in the name.** `_pvt`, `_ct` — so a
  reviewer sees it in the diff, enforced both ways (L49).

The planned mechanisation — an exhaustive taint check over every read path ×
every actor — is in
[docs/16-disclosure-verification.md](docs/16-disclosure-verification.md),
including what it deliberately will **not** catch.

### Before shipping anything touching personal or financial data

1. **Where else does this value live?** Each home needs its own defence.
2. **Run the read as a refused actor**, against the live database, not in your
   head — an employee, and a `finance_admin` or `it_admin`. The roles powerful
   somewhere else are the ones whose limits nobody tests.
3. **Watch the guard fail.** If nothing failed, you have not tested it.
4. **Check the fixture has data.** A green assertion over NULL is not a pass.
5. **Confirm it is classified** — disclosure matrix, audit register, or a
   committed exemption with a reason.

Answering "who may write this" is half the work. The breaches were all in the
other half.

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

**A restricted column on `employees` is named `_pvt`; ciphertext is named
`_ct`.** A column on that table carrying neither is directory data, by
construction. The disclosure matrix decides and the name must AGREE with it —
`./check` fails both a restricted column without the suffix and a suffixed
column nobody classified. This asserts the classification; it never infers it
([L49](docs/10-lessons-learned.md)). Only `employees` needs this: elsewhere a
row policy scopes the whole row.

**No column anywhere may be empty in the fixture.** A test whose subject is
NULL does not fail — it reports the absence of data as the absence of a problem
([L50](docs/10-lessons-learned.md), [L51](docs/10-lessons-learned.md)).
`./check` enforces it across every base table, with a committed sparse list;
"not got round to it" is not a reason — the only accepted one so far is "the
table it references does not exist yet". Generate ciphertext through
`sealField`, never by hand: `pii.test.ts` opens every sealed fixture value,
because a copied envelope still looks populated.

**Every sensitive column is classified before it ships.**
`apps/web/src/lib/server/security/matrix.ts` records, per value, who may read
it and **which mechanism holds it** — `rls`, `encrypted`, `projection` or
`open`. `./check` fails on any column that is neither classified nor on the
committed not-sensitive list, because every disclosure bug here so far was an
*unclassified* column rather than a mis-classified one
([L48](docs/10-lessons-learned.md)).

Two rules for using it: **`defense` is the spine, not audience** — on a
broadly-visible row RLS cannot hide a column, so a NULL in the fixture is not
evidence of anything. And **declare per column only where the row is broadly
visible**; where a row policy scopes the whole row, one table-level
declaration covers every column on it.

**A protected column NEVER falls back to an unprotected one.** RLS hides the
row; a `COALESCE` puts the value back. `compensation_base` is policy-protected
and `employees.base_amount` is an unprotected cache of the same figure, so
`COALESCE(cp.amount, e.base_amount)` disclosed every salary in the firm to
every employee — correct-looking number, no error, no failing test
([L47](docs/10-lessons-learned.md)). Read the protected column alone and let it
be NULL: a blank figure is the right answer for someone who may not see it.
`./check` fails on this shape.

**A test for an access rule runs as the actor who is meant to be REFUSED.**
Repository suites deliberately run as an owner, so a policy cannot silently
narrow what they see — which means the restricted branch of every query is
unreachable from them. Assert both halves: the refused actor gets NULL, *and*
the permitted one still gets the figure. A policy that blanks everything reads
as a broken page, not as a rule.

**Type every `tx` query that crosses into a page.** An untyped row is `any`
downstream, and `any` satisfies every parameter — so a wrong-shaped argument is
not merely allowed, it is unexaminable. `data.tenant` was untyped and a
`FormatContext` argument received a bare string, rendering a timestamp with no
date and passing `svelte-check`
([L53](docs/10-lessons-learned.md)).

**Never compare a database value to `Date.now()`.** The app and Postgres are on
different machines, and a Docker VM's clock drifts across a host sleep. Compare
against `clock_timestamp()` in the same query, or assert `col = now()` to prove
a column default was used ([L43](docs/10-lessons-learned.md)).

**A row policy is `AS RESTRICTIVE` unless it is deliberately an alternative,
and recreating one means restating every modifier.** Postgres defaults to
PERMISSIVE and OR-s permissive policies together, so a table with
`tenant_isolation` plus a visibility policy needs the second to be RESTRICTIVE
or the two become *either* rather than *both*. A `DROP`/`CREATE` pair is not a
diff: `AS RESTRICTIVE`, `FOR`, `TO` and `WITH CHECK` are all lost by omission,
the statement succeeds, and nothing looks wrong. This has already caused a
12-row cross-tenant leak, caught only by `./check`
([L63](docs/10-lessons-learned.md)). **Run `./check --db` immediately after any
policy change.**

**Never parse `request.jwt.claims` inside a policy expression — call an `app.*`
function.** The `::jsonb` cast raises on a malformed claim, and a policy
expression cannot carry an `EXCEPTION` handler, so the request becomes a 500
rather than an empty page — intermittently, because it depends on whether the
planner evaluates that arm ([L62](docs/10-lessons-learned.md)). Every such
function returns the closed answer (`NULL`, `false`) on a bad claim;
`./check` calls each one with `not-json` and fails if it raises.

**A denormalised counter is RECOMPUTED in the same transaction, never
incremented.** `SET n = n + 1` is correct only if every writer remembers it and
no write ever fails partway; `SET n = (SELECT count(*) ...)` is correct whatever
happened before it, so a row that is already wrong is repaired by the next write
instead of carrying the error forward. The read path counts the real rows
alongside the stored figure so a disagreement is visible, and a test asserts
they agree AFTER a write ([L58](docs/10-lessons-learned.md)). A wrong counter
feeds a progress bar, and a wrong progress bar looks exactly like a right one.

**A vocabulary for a plain `text` column lives in the repository, and the pages
import it.** These columns have no enum and no CHECK behind them, so the list IS
the constraint — and two copies of a constraint are one constraint that will
disagree. `/projects` filtered on a status list that omitted `draft`, the column
default, so the first project anyone created would have been written correctly
and then been invisible under every filter ([L57](docs/10-lessons-learned.md)).
Ask of any new write: **can the thing this creates be found again by the page
that lists it?**

**A new page under `(app)` gets a line in `apps/web/e2e/smoke.spec.ts`; a new
FORM gets a case in `apps/web/e2e/form-errors.spec.ts`.** They are the only
checks that load a URL — nothing else in `./check` renders anything. Headings
are asked for BY ROLE, which is how it found that no page in the product had an
`<h1>` ([L64](docs/10-lessons-learned.md)). Both are read-only: the fixture is
shared with the unit suites, so a spec that writes needs its own serial project
and a reseed. Run with `pnpm --filter @kaaj/web e2e` — deliberately NOT in
`./check`, which is 24 seconds and worth keeping that way.

**An error is never logged raw — it goes through `safeError`
(`$lib/errors.ts`), and unexpected ones through `handleError`.** A
`PostgresError` carries the offending row in `detail`, and `where`, `query`
and the bound parameters alongside it. Postgres withholds `detail` from
`app_user`, so the request path is already covered — but the table owner sees
it, and that is what `./check`, the migrations, `verify-remote.sh` and anything
on the service role connect as ([L69](docs/10-lessons-learned.md)). The
allowlist is defence in depth there and the only defence everywhere else.
`message` echoes the submitted value whatever the role — `invalid input syntax
for type date: "1985-03-12"` is a date of birth — which is why these lines stay
in infrastructure we control.

**Every unexpected error gets an id, and the id is on the page.** `handleError`
in both hooks mints one, logs the error against it as JSON on stdout with the
actor from `locals`, and returns `{ id, message }`. SvelteKit replaces the real
message with "Internal Error" before it reaches the browser, so without the id
a bug report has nothing to quote and we have nothing to search.

**Every exemption is a committed literal, never a filter.** The harnesses list
exempt tables and indexes by name with reasons. A new violation fails, and so
does removing a justified one — both require a reviewed edit. A `NOT IN` pattern
silently absorbs future violations, which is how a suite quietly stops testing
anything.

---

## Forms

**Every field an action writes goes through `FormReader`
(`$lib/server/forms.ts`). No exceptions, and no `formString` for a value that
reaches a column.** `required`, `maxlength` and `type` are browser UX and vanish
on a crafted POST; `varchar(n)`, `uuid` and Postgres enums are the *last* line
of defence and their failure mode is an unhandled 500, not a field error
([L34](docs/10-lessons-learned.md)).

| Column | Reader | What it stops |
|---|---|---|
| `varchar(n)`, `text` | `text(name, { max: n })` | `value too long` — a 500. `max` **must** match the column; count is in code points, as Postgres counts |
| `uuid` | `uuid(name)` | `invalid input syntax for type uuid` from any hidden `id` |
| a Postgres enum | `enumValue(name, "<type>")` | `invalid input value for enum`; values come from `@kaaj/enums`, which `./check` keeps in step |
| a fixed set on `varchar` | `choice(name, ALLOWED)` | anything off-list reaching display code |
| `date` | `date(name)` | `2026-13-45` — well-shaped, not real, and a 500 on the cast |
| money and rates | `decimal(name, { scale })` | a float64 round trip, and a third decimal the column would round away in silence |
| `int4` | `integer(name, { min, max })` | out-of-range — also a 500 |
| a locale / zone / currency | `locale` / `timezone` / `currency` | `en_US` and friends: `RangeError` inside `Intl`, on every page that formats a figure for that office ([L24](docs/10-lessons-learned.md)) |

Country-specific formats still come from `@kaaj/validation` — never a regex at
the call site — and the result is length-checked before it is stored.

**An optional field has three outcomes, not two.** Blank, valid, and
*rejected*. Collapsing invalid into the same return as blank deletes the field
and reports success: an overtime multiplier vanished exactly this way and
overtime then computed at 1x ([L33](docs/10-lessons-learned.md)). `FormReader`
is built around this; a hand-rolled `Number(x) || 0` is not.

**Read every field BEFORE `if (!f.ok)`, never inside the object built after
it.** A reader called in the argument to `create`/`update` runs after the gate
has already passed, so its rejection is raised too late to be reported — and a
non-required field returns `null` on rejection, so the column saves as NULL and
the action answers `saved: true`. This has bitten once, in the same commit that
documented L33. Assign to a local above the gate and reference the local:

```ts
const middleName = f.text("middle_name", { max: 100 })   // ✅ before
if (!f.ok) return fail(400, f.problem())
await repo.update(tx, id, { middle_name: middleName })

await repo.update(tx, id, {
  middle_name: f.text("middle_name", { max: 100 }),      // ❌ never reported
})
```

**Never pass `''` to a parameter that is cast.** SQL does not short-circuit, so
`(${x} = '' OR c = ${x}::date)` evaluates the cast anyway — and for `::date`
postgres.js serialises it in the driver and throws `RangeError: Invalid time
value` before the query is sent. Pass `null` and test `IS NULL`
([L37](docs/10-lessons-learned.md)).

**A rule the reader cannot express calls `f.reject("field")`** — a cycle, a
date clash, an inverted band — so every failure arrives through one path and
the page can put the cursor on the field.

**A write the database can refuse is caught and answers with a sentence.**
`FormReader` validates the shape of a value; it cannot know the code is already
taken or the row was archived a minute ago. Uncaught, every such refusal —
UNIQUE, CHECK, FK — was an "Internal Error" page with the form's contents gone
([L66](docs/10-lessons-learned.md)).

```ts
try {
  return await withTenant(actorFrom(locals), async (tx) => { … })
} catch (e) {
  const refused = constraintFailure(e)   // $lib/server/db/constraints
  if (refused) return refused
  throw e
}
```

The registry keys on **`constraint_name`, never the message text** — the name
is in the migration, and SQLSTATE `23505` alone cannot say which field to mark.
An unregistered constraint keeps crashing loudly, which is what gets it
registered rather than hidden behind "something went wrong". `./check`'s
`refusals have a message` step fails on any constraint on a form-written table
that is neither registered nor exempted with a reason.

**A shape regex is not a date check.** `/^\d{4}-\d{2}-\d{2}$/` accepts
`2026-02-31`; postgres.js then rolls it through a JS `Date` and stores
`2026-03-03`, with no error and `saved: true`
([L67](docs/10-lessons-learned.md)). Use `f.date()`, which round-trips the
parse. The same goes for anything the driver serialises — validate in the units
the column stores.

**A write reports what it DID, not that the request arrived.** An `UPDATE …
WHERE id = $1` matching nothing still succeeds, so all eight `archive` actions
answered `{ archived: true }` for rows that did not exist — and audited it
([L68](docs/10-lessons-learned.md)). Return `RETURNING id` and check it. Ask of
any write: **if this silently did nothing, would the page look different?**

**A refused field is MARKED, and the form is still there to mark.** Three parts,
each of which failed separately ([L68](docs/10-lessons-learned.md)):

- the message NAMES the field — `f.problem()` does this by default ("Check
  Anchor date."), so never pass a bare "Some fields need attention."
- the control carries the daisyUI modifier AND `aria-invalid`, via
  `fieldErrors(form)` in `$lib/form-errors`. A red border does not reach a
  screen reader.
- a modal form uses `use:enhance={closeOnSuccess(() => (editing = null))}` from
  `$lib/form-enhance`; a plain POST reloads and resets the `$state` holding it
  open. **`update({ reset: false })` is not optional** — the default resets the
  form and discards the work the person is being asked to fix. Non-modal forms
  use `keepValues` for the same reason.

`apps/web/e2e/form-errors.spec.ts` asserts all three, and stays read-only by
only ever submitting what the action refuses.

`src/lib/server/forms.test.ts` is the regression guard. Every case in it
returned a 500, or a silent `saved: true`, against the running app before the
reader existed. Add to it when a new reader is added.

---

## Time

**A `timestamptz` is an instant. Render it in the OFFICE's timezone** —
`firm_locations.timezone` — never the viewer's and never UTC. The same instant
is a 09:00 start in Bangalore and a 22:30 finish in New York, and only one of
those is a workday. `instant()` in `$lib/format.ts` takes the zone; nothing
formats a time itself.

**A local date is not derivable from a `timestamptz`.** `hr_attendance.attendance_date`
is the date in the office, and a shift ending 23:00 in New York is 04:00 UTC the
next day. A `::date` cast on a timestamp column is the bug — `AT TIME ZONE`
first ([L35](docs/10-lessons-learned.md)).

**`DATE` columns carry no zone and are formatted in UTC** — a hire date is that
day everywhere. That is `calendarDate()`, and it is a different function from
`instant()` for exactly this reason.

**postgres.js returns `timestamptz` as a `Date` and `NUMERIC` as a string.**
`types: {}` registers custom handlers, it does not remove built-in ones
([L36](docs/10-lessons-learned.md)). Declare repository types from what the
driver returns, not from the column type.

**Durations go through `hours()`**, which renders `7h 45m`. Printing decimal
hours lets `Intl`'s default three-digit cap turn a stored `6.9333` into
`6.933` — neither the stored value nor a number anyone recognises.

---

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

**Money inside JSONB is a string too.** `salary_ranges`, `costs_by_currency`,
`overtime_rules` — a JSON *number* is stored exactly by Postgres and then handed
to JavaScript as a float64 on the way back out, so the loss happens on read
where nothing looks wrong. Store `"95000"`, not `95000`. Ordering checks go
through `compareDecimal` in `$lib/decimal.ts`, which compares without parsing;
`./check` cannot see inside a JSONB column, so this rule is the only guard.

**A guard that reads `information_schema.columns` cannot see inside JSONB.**
`money/numeric-not-float` never could, which is how payroll held every earning
and tax as a JSON number ([L41](docs/10-lessons-learned.md)).
`money/jsonb-is-text` walks a registered list of paths instead — add a new JSONB
money column to it, deliberately, the way every other list here works.

**Arithmetic happens in SQL, not in JavaScript.** Summing invoice lines,
computing gross pay, prorating: all `NUMERIC` in Postgres, where it is exact.
Adding two money strings in JS is silent *concatenation*, with no type error.

**Currency travels with the amount, always,** and is never converted for
display (BR-FP-003). A figure is shown in its currency of record, formatted in
the locale of the market it belongs to — see `localeForCurrency` and
[L24](docs/10-lessons-learned.md).

**Postgres ROUNDS to scale, silently — it does not truncate.**
`12345678.9052::numeric(12,2)` is `12345678.91`. When the same value is stored
in two columns of different scale, round to the authoritative one before
writing the other, and pick a test value that distinguishes rounding from
truncation — `.9052`, not `.9012` ([L25](docs/10-lessons-learned.md)).

**Display goes through `$lib/format.ts`. Nothing formats money itself.**
`money()`, `approxMoney()`, `number()`, `hours()`, `calendarDate()`, `instant()`
and `localised()` are the only places `Intl` is constructed for display. A component that reaches for
`Intl.NumberFormat` or `toLocaleString()` is a bug — it will drift from the rest
of the app, and it will pick up the *browser's* locale rather than the market's.

**Two functions, and the choice is visible at the call site:** `money()` is
exact and is the default; `approxMoney()` abbreviates. It follows the locale's
own convention — there is no lakh/crore code anywhere,
because `Intl` already knows:

```
en-US  18,123,432  ->  $18.12M
en-IN  18,123,432  ->  ₹1.81Cr      (crore; en-IN 1,423,323 -> ₹14.23L)
```

Decimals are capped at 2, not forced, so `950` stays `$950` rather than
`$950.00`.

`approxMoney` is a separate function rather than an option so a reviewer sees
the choice — `approxMoney` on a payslip line reads wrong; a `compact: true`
buried in an options object does not.

**Abbreviated money is for scale, never for action.** `approxMoney()` belongs
on dashboards, chart axes and summary tiles — figures a person reads to get a
sense of size. It must never appear on a payslip, an invoice line, a salary
band, a tax figure, or anything reconciled against a bank statement. `₹14.23L`
is not a number you can pay someone, and the abbreviation is lossy on purpose.
When in doubt, use `money()`: being exact where approximation would have done
is a cosmetic problem, and the reverse is a financial one.

**Custom fields must never feed payroll or accounting calculations.** They are
untyped and untested. A customer needing a custom allowance on a payslip is a
modelling gap to fix in the product, not a custom field.

Integer minor units were the rejected alternative; the reasoning is in
[docs/05-architecture-decisions.md](docs/05-architecture-decisions.md).

---

## Tenancy, audit and disclosure

**Every `withTenant` takes `actorFrom(locals)`, never `locals.tenantId`.** Row
visibility keys on the role and the person, so a bare tenant id returns zero
rows — silently, as a wrong number rather than an error
([L42](docs/10-lessons-learned.md)). `./check` enforces it.

**Auditing a value copies it — protect the copy the same way.** `audit_log`
had no row policy, so once pay changes were audited every employee could read
every pay change in the firm ([L55](docs/10-lessons-learned.md)). It now carries
row-level visibility: HR, payroll, an auditor and the owner see everything;
everyone else sees only entries about themselves or recording what they did.
Ask of any new write: **who can read what this writes?**

**Every write is classified in `apps/web/src/lib/server/audit/register.ts`,
and `./check` fails on one that is not.** The rule below was prose for months
and 3 of 26 actions followed it ([L54](docs/10-lessons-learned.md)). `changes`
is `Record<string, {from, to}>` with STRING values — a JSON number returns as a
float64 and this table cannot be corrected — `action` comes from a closed set,
`entityType` names the table, and prose goes in `reason`, never mixed with
values, because redaction matches field NAMES. `audit.diff()` records only the
fields that moved: burying the one that changed among twenty that did not, in a
table nobody can prune, is the same as not recording it.

**A write that someone may later be asked to justify records an audit entry in
the SAME transaction.** `$lib/server/audit` — approvals, pay changes, role
grants, erasures. Written afterwards or best-effort, the trail records what the
application believed happened, and the two diverge exactly when it matters
([L40](docs/10-lessons-learned.md)). `audit_log` holds INSERT and SELECT only;
a correction is a new row. Pass the fields that changed, never a row dump: the
table cannot be deleted from, so anything written there is written forever.

**A flag that governs disclosure is enforced where the data is READ, and the
governed value stays out of the returned type.** `is_anonymous`,
a review's `status`, `pii.reveal` — in every case the value sits in the row
next to the flag, so a page that renders it breaks the promise silently
([L39](docs/10-lessons-learned.md)). Resolve it in SQL (`CASE WHEN ... THEN
NULL`), not after the query: a repository that fetches and drops has still put
it in a result set, a log line and a heap dump. And add the fixture row that
triggers the rule, or nobody is testing it.

---

## PII and secrets

**PII is encrypted in the application, never in SQL, and always through
`$lib/server/pii`.** `sealField`/`openField` are the only write and read paths.
They bind every ciphertext to `tenant | table | column | row`, so a value cannot
be moved between rows or tenants, and a call site that assembles that binding by
hand will eventually get it wrong.

- **Never add a plaintext PII column.** `./check` has four `pii/*` rules and
  they fail on exactly this. A new PII column is either encrypted or added to
  `_pii_pending` in `verify-invariants.sql` with a reason — a committed literal,
  like every other exemption here.
- **Never index a PII column.** A btree keeps every value readable in its pages,
  and dropping the column does not scrub them.
- **Keys are per EMPLOYEE.** GDPR Art. 17 is an individual right; a tenant-wide
  key cannot answer it. Erasure destroys the key, which reaches backups that
  `UPDATE ... SET NULL` never will.
- **The spec's `DERIVE_KEY(org_prefix + org_4digit_code)` must not be
  implemented** — it is ~13 bits, and both inputs live in the database it
  protects. It is a key *label*. See
  [docs/13-pii-encryption.md](docs/13-pii-encryption.md).
- **`PRIVATE_PII_KEK` is backed up separately from the database.** Losing it
  destroys every encrypted field, by design.

**`PRIVATE_SUPABASE_SERVICE_ROLE` bypasses RLS entirely** — every policy,
every tenant predicate, every row-visibility rule. It is **imported**, never
handed out on `locals`: it used to sit on `event.locals` for every request,
which put it one destructure from any handler and made it read as ordinary
request state. `./check`'s `service role quarantined` step holds a committed
list of the five files allowed to import it — none under `(app)` — and fails on
a new importer, on a removed justification, and on any `.svelte` file touching
it at all, which would ship the key to the browser. Never in a `PUBLIC_`
variable, which SvelteKit ships to the browser by design.

**Accounting rows are visible to the finance function only.** `invoices`,
`payments`, `bank_accounts` and twelve more carry RESTRICTIVE policies keyed to
the role — `finance_admin`, `auditor` and the base admins read; `auditor` does
not write. The application already refused, but RLS did not, so one missed
`requireCan` was the firm's whole ledger. Both halves are asserted in
`row-visibility.test.ts`: the refused actor gets zero rows AND the permitted one
still gets rows.

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

pnpm --filter @kaaj/web e2e          # end-to-end, real browser, real login
pnpm --filter @kaaj/web e2e:ui       # the same, with Playwright's inspector

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

