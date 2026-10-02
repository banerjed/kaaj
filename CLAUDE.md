# Kaaj

Kaaj is workplace management software for small and medium businesses
(SMBs). It puts all of these functions in one product. It is multi-tenant
SaaS.

---

## Setting up a machine

```bash
git clone <repo> && cd kaaj && ./setup
```

`./setup` does these steps:

1. It installs the tools that are not on the machine.
2. It starts the local Supabase stack.
3. It applies the migrations.
4. It loads the fixture.
5. It runs the full verification.

On a machine that has the tools, `./setup` takes approximately 30 seconds.
The first run takes longer, because it pulls the Docker images. The script is
idempotent. You can run it again safely.

```
./setup              install what is missing, start everything, verify
./setup --check      report what is missing, change nothing
./setup --no-install use only what is present; fail if anything is absent
./setup --reset      rebuild the database from migrations and reseed
```

**`./setup` prepares a developer machine. It is not an on-premise
installer.** It creates a stack with well-known demo credentials. It loads the
Northwind *test* fixture.

**WARNING:** Do not run `./setup` against the infrastructure of an
organization.

---

## ⚠️ Required before pushing

```bash
./check
```

**All steps must pass before you push. All steps must also pass before you
deploy to production.** `./check` has 25 steps and takes approximately 25
seconds. `./check --all` adds the browser test suite and two steps against the
perf tenant:

- the 100-row check
- the budget of each page.

These two steps take approximately one minute more. They need
`pnpm db:perf seed` one time on each machine.

**A pre-push hook runs `./check --all` on each push.** The hook is
`.githooks/pre-push`, and `./setup` enables it. The hook refuses tracked
changes that you did not commit. Otherwise, the hook tests these changes, but
the push does not include them. `git push --no-verify` skips the hook. CI does
not run the perf steps.

If `./check` exits with a non-zero code, do not push.

```
./check          everything — run this before pushing
./check --db     database only
./check --app    application only
./check --quick  skip the build (fastest useful signal)
```

`./check` needs the local stack. Start the local stack with `supabase start`.
`./check` finds `psql` and resolves `DATABASE_URL` itself. You do not need to
set up the shell. You can run `./check` from any directory in the repository.

### What it runs

| Step | Proves | Count |
|---|---|---|
| tenant isolation | each RLS policy filters the rows, for each table | 672 |
| specification | the schema can answer the specifications of the modules | 173 |
| schema invariants | the ADR design rules are true, and a bad claim fails closed | 157 |
| structure snapshot | the schema is the same as the committed schema | 4,290 lines |
| enum fixture | `expected-enums.sql` agrees with `enumerations.json` | — |
| authorization | each form action has a guard; the application code contains no DELETE | 99 |
| actor | each `withTenant` gets the actor, not only a tenant id | — |
| no backtick in SQL | no `--` comment in a `tx\`...\`` template contains a backtick | — |
| no query inside a loop | no `tx`...`` /`tx.unsafe` call is in a loop or in an iteration callback (an N+1 query pattern on large data) | 5 exemptions |
| tables classified by scale | each table is `SCALE_SENSITIVE` or `NOT_SCALE_SENSITIVE`, with a reason | 40 + 87 |
| no unprotected fallback | no protected column uses `COALESCE` to get the value of an open column | — |
| every table classified | each table is row-scoped (the step compares this with its policies), per-column, tenant-wide, or exposed-pending. Each column of each per-column table has a classification | 130 tables, 0 exposed |
| writes are audited | each action is in the audit register, in one of its two lists | 59 + 29 |
| refusals have a message | each constraint that a form can violate gives a sentence as its answer | 52 |
| service role quarantined | only the files in a committed list bypass RLS. Each table that the service role can reach has a real grant, not only an exemption from RLS | 7 files |
| product name not hardcoded | the product name occurs one time, in config.ts | — |
| fixtures are complete | no column of a base table is empty in the fixture | — |
| dedicated targets | each dedicated-tier row in `tenant_registry` resolves to a real database that the step can reach and that has the correct migrations (ADR-009) | — |
| security | authorization, PII and tenant isolation, in both test suites | 558 |
| format / lint / typecheck / unit tests / build | each workspace package, through turbo | 1,399 tests |
| front-page load | the step signs in as a real user, loads `/employees` 5×, and fails if the MEDIAN load time is more than 50ms (`apps/web/scripts/verify-front-page-load.mjs`) | 50ms |
| pages within budget (`--all`) | each page × each perf actor costs the database no more queries or data pages than `budgets.tsv` permits. Each page also takes no more time than in the last run on this machine | 640 |

**These counts do not stay correct.** They are in this file for a reason. If
nobody can examine a number, nobody can dispute the claim that it makes. If a
count changes, correct it, or delete the column. The last verification of
these counts was on 2026-10-01.

These steps add to each other. No step can replace another step:

- **Isolation** proves that the policies work. But it proves this only for the
  tables that have fixture rows. For this reason, it *fails* when a table has
  no fixture rows. It does not pass when it has nothing to test.
- **Specification** proves that the schema can answer the module
  specifications. Its RLS tests examine only metadata. A policy of
  `USING(true)` passes them.
- **Invariants** prove that the rules are true. They do not find drift
  (changes that nobody intended).
- **Snapshot** proves that nothing changed. It cannot tell you if the
  committed schema was correct.

### Deploying to production

```bash
./check                              # must be green
supabase db push                     # apply migrations to the hosted project
packages/database/tests/verify-remote.sh             # read-only verification against production
```

`supabase db push` is not reversible. Migrations go forward only. To correct a
mistake, write another migration. Do not roll back.

**WARNING: Do not run `verify-rls.sql` against production.** It adds a second
tenant and writes probe rows. `packages/database/tests/verify-remote.sh` is
the only test script that is safe against the production database. It starts
a read-only transaction. If the read-only setting did not take effect, the
script stops.

**Three more production-only tools are at the same level as
`verify-remote.sh`. `./check` runs none of them.** A local development
database does not have the quantity of production errors that these tools
examine:

- `packages/database/tests/check-error-rates.mjs` is read-only, and it uses
  the same read-only guard on its connection. It counts the errors in
  `app_error_log` in a recent time window. If the count is more than a limit
  in its committed `THRESHOLDS` registry, the script exits with a non-zero
  code. Use a cron job on a host to run it. To connect a real alert channel,
  change one function (`notifyOncall`). This change is not done yet.
- `packages/database/tests/error-report.mjs` is read-only. It shows the same
  data in a form for people to read. It has the commands
  `routes`/`tenants`/`trend`, and each command takes `--days` (the default is
  7). It also has `lookup <error_id>`, which finds the one row for an id that
  a user gave you. Use it for a weekly review, not as a threshold test.
- `scripts/prune-error-log.mjs` is the only script here that writes to
  production. It deletes the `app_error_log` rows that are older than
  `--days` (the default is 30). By default, it does a dry run and only prints
  the count. **WARNING:** A delete is not reversible. The script deletes rows
  only when you give `--execute`. It connects as the database owner, because
  `app_user` has no DELETE grant on this table.

**`vite dev` refuses to start against an address other than
`127.0.0.1`/`localhost`, and nothing can override this.** A real environment
variable has priority over a `.env` file. For example, a user copies a
one-line command that points development at production for one run. The user
leaves the export of `PUBLIC_SUPABASE_URL` in a shell profile. That value then
has priority over `apps/web/.env.local` for each later `pnpm dev` on that
machine. This occurs with no error, and the UI does not show it
([L75](docs/10-lessons-learned.md)).

This guard intentionally has no environment variable that turns it off. Such
a variable would cause the same problem at a higher level. The guard has no
effect on `pnpm build` against `.env.prod`, which is the real deployment path.
The guard operates only when `command === "serve"`. That is `vite dev` and all
tools that start it, which include the vitest runner and the e2e `webServer`.

---

## Architecture in one paragraph

Kaaj is a **modular monolith**. SvelteKit is both the frontend and the backend
([ADR-004](docs/05-architecture-decisions.md)). Modules are directories, not
services ([ADR-001](docs/05-architecture-decisions.md)). PostgreSQL is the only
datastore, also for search, the job queue and the cache
([ADR-002](docs/05-architecture-decisions.md)). Supabase supplies Postgres, Auth
and Storage ([ADR-008](docs/05-architecture-decisions.md)). For tenancy, all
tenants share one schema with `tenant_id`, and row-level security isolates them
([ADR-003](docs/05-architecture-decisions.md)).

[docs/05-architecture-decisions.md](docs/05-architecture-decisions.md) gives the
full reasons. It also tells which alternatives we rejected, and why.

**The customer portal is switched off.** The sign-in of a customer contact
carries no tenant (`20260930130000_customer_portal_off.sql`). The `/portal`
pages are gone. Portal contacts were `app_user` with a tenant claim. Thus they
could read every table that had only `tenant_isolation`
([L111](docs/10-lessons-learned.md)). Before you switch the portal on again,
close every staff table to portal contacts.

**Payroll and expense tracking are NOT YET IMPLEMENTED.**
- **Payroll** has a run lifecycle and nothing more. `/payroll/runs` moves a
  run through draft, calculate, approve and finalize, with an audit entry for
  each step. But no code calculates the pay of an employee. Every gross, tax and net
  amount comes from the fixture.
- **Expense tracking** has no module. `expenses` exists, and accounting
  reports read it. But no code submits, approves or reimburses an expense.
  - Billable expenses are columns on `expenses`: `is_billable`,
    `customer_id`, `project_id` and `billable_amount`.
  - Under RLS, only the finance function can read `expenses`. If an employee
    submits their own expense, the employee will need an RLS policy that lets
    them read it back.

See [docs/11-module-roadmap.md](docs/11-module-roadmap.md).

---

## Layout

The repository is a Turborepo monorepo with pnpm workspaces.

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
bridge.**
- `apps/web/src/**/*.test.ts` asserts the DEPLOYED enforcement: the real
  `can()`, the real actions and the real database.
- `packages/spec-tests` asserts the SPEC-DERIVED requirement matrix, with
  traceability IDs.

The two are separate implementations on purpose. Two implementations find the
errors of each other. One implementation cannot do that.

The independence has value only if a test compares the two suites. For weeks,
both suites passed, but they did not agree on one question: can a payroll
admin see a full bank number? `packages/spec-tests/tests/authz-conformance.spec.test.ts`
is that comparison. It asserts **outcomes**, never internals. If it fails,
decide which suite is correct. Do not simply make one suite agree with the
other.

**Do not make one suite call the authorizer of the other suite.** Then one
implementation does the work of two, and the comparison has no value.
`@kaaj/authz` is the permission vocabulary of the product. `apps/web` and the
bridge use it. `spec-tests` keeps its own vocabulary.

**Packages stay framework-agnostic.** Write them in plain TS/JS, with no Svelte
imports. Then a future mobile app can use them, whatever framework it uses.
`@kaaj/validation` is the reason. If we kept 33 country-specific validators in
two languages, a payslip could show a wrong tax identifier. That is not a
cosmetic bug.

**There is no `packages/ui` yet.** Every `.svelte` file is under `routes/`. If
we make a shared UI package before a second consumer exists, the package will
fit only its first caller.

---

## The UI reference

**<https://nexus.daisyui.com/dashboards/ecommerce> is the canonical example.**
Before you call UI work complete, compare every page with it. Compare these
items:
- spacing
- the treatment of cards and tables
- the type scale and the density
- the empty states and the loading states
- the behavior of the shell at each breakpoint.

It is the live version of the template in `nexus-sveltekit-ref`. Thus it also
gives the fastest answer to this question: "Does Nexus do it this way, or did
we make it ourselves?" Most of the UI entries in
[docs/10-lessons-learned.md](docs/10-lessons-learned.md) come from that
question.

[docs/07-app-provenance.md](docs/07-app-provenance.md) records each intentional
difference from Nexus, and the reason for it. These differences include the
information architecture, the URLs, the accessibility minimum, and each demo
feature that has no function behind it. A difference is acceptable. A difference
that nobody recorded is drift.

**A status badge goes through `StatusBadge` (`$lib/components/`).** Before, each
of eleven pages had its own ternary that returned `badge-success`/`badge-error`/….
The words for the statuses are different on each page, and that is correct.
"paid" is for invoices and "present" is for attendance. But eleven pages had a
copy of the daisyUI class names. Now a page names a *tone* (`positive` ·
`caution` · `critical` · `progress` · `neutral`). The component holds the ten
complete class strings. Thus one edit changes the style of every status badge
([L72](docs/10-lessons-learned.md)).

**The badges are SOLID, not `badge-soft`, although Nexus and daisyUI both
prefer `badge-soft`.**
- `badge-soft` failed AA in the light theme when that theme was `nord`. Its
  contrast was 1.32:1 to 3.27:1. The contrast of solid badges was 4.97 to
  12.24.
- `badge-soft` passes in the dark theme. But the style of a badge must be the
  same in each theme.
- The light theme is now `corporate`, and nobody has **measured the contrast
  again**. `corporate` puts pure-white content colours on several mid-bright
  backgrounds. That is the same condition that failed before
  ([L73](docs/10-lessons-learned.md)). Until somebody measures it, do not
  think that solid or soft is correct in `corporate`.

The accessibility minimum is more important than fidelity to the template.
[docs/07-app-provenance.md](docs/07-app-provenance.md) records this difference.

**Never assemble a class name.** Tailwind cannot see `badge-${size}`. Tailwind
reads the source text and cannot calculate an expression. Thus Tailwind does
not generate the class, the element shows with no style, and no error occurs.
Map each state to a COMPLETE class string, as the `BADGE` table of
`StatusBadge` does. The audit of daisyUI also flags an assembled class name, for
the same reason.

**The palettes are the built-in `corporate` (light) and `night` (dark) themes
of daisyUI. The application never keeps a copy of them.**
- `data-theme` holds those names. The labels that a user reads are still Light
  and Dark. `TopbarProfileMenu` keeps the value and the label separate on
  purpose.
- `system` removes `data-theme` fully. `--prefersdark` on `night` is for this
  case.
- daisyUI tells you not to use `--prefersdark` together with a controller. That
  warning is about controllers WITHOUT a system option.
- Before, the two themes were approximately 98 lines that people wrote by hand.
  Because we kept that copy, 3 of 4 solid badges came to fail AA
  ([L73](docs/10-lessons-learned.md)).

**To measure a colour pair, let the BROWSER convert it.** Paint the colour on a
canvas and read the pixel. In one session, we parsed a computed colour string by
hand, and the result was wrong three times:
- We read the components of `oklab()` as RGB.
- We put an alpha colour on white, not on its real background.
- A `/\d+/g` channel regex on `oklch(0.20768 …)` gave a near-black surface a
  brightness of 20788.

**Use one typeface in BOTH themes. `--font-sans` and `--font-display` both
resolve to Roboto Variable.** Nexus also uses a single family.
- The two tokens stay separate. Thus display text can have a size or weight
  that is different from body text, with no second font file.
- daisyUI themes have no font slot, and Tailwind `@theme` tokens are global.
  Thus, a typeface for each theme would need new token definitions under
  `[data-theme]`. Then every heading would move when the user changes the
  theme.
- A change of theme changes colour, not type.
- Roboto Variable covers weight 100–900. Thus `font-bold`/`font-medium` on
  `font-display` text shows a real weight, not a synthesised weight. The
  Instrument Serif that Roboto replaced did not do this.

**Secondary text stops at `base-content/70`.** Below `/70`, the text fails WCAG
AA on a light background. (`/60` is 4.26:1, and AA requires 4.5.) In dark mode,
the text passes at both values. Thus, if you examine only one theme, you do not
see the failure. Measure each new colour pair in BOTH themes. The light theme is
the one that fails. See [L22](docs/10-lessons-learned.md). The light theme is
now `corporate`, and nobody has measured `/70` against it again. Measure it again
before you use this minimum.

**Customization is data, never code.** Customers customize through rows,
custom field definitions and settings. They never customize through schema
changes for one tenant or code for one tenant. See
[docs/06-customization-model.md](docs/06-customization-model.md).

---

## Before building a module

Read **[CODING_GUIDELINES.md](CODING_GUIDELINES.md)**. It gives the patterns
for these tasks, each with a real GOOD/BAD example:
- authorize a new API call
- RLS on a new table
- money, timezones and locale
- audit logging and error handling
- UI code and form validation.

That file teaches the pattern. This file and `./check` are still the authority
on the details.

Read **[docs/10-lessons-learned.md](docs/10-lessons-learned.md)**. It is a list
of the traps in this codebase, and the list continues to grow. Each trap failed
*with no error*: an empty page, a component with no style, a control that a
keyboard cannot reach. Comments in the application code refer to the entries by
number (`L4`, `L11`). The comments do not repeat the text.

When a trap causes a problem, add an entry to that file. Do not write past
entries again.

### Keep this file and the lessons file current

**When you find a salient bug in generated code, write the rule before you
continue.** If somebody fixes a bug but does not record it, the bug comes back.
The next contributor or the next model makes the same plausible assumption that
caused it the first time. The fix costs an hour. The rule costs a line.

Put the finding here:

| Kind of finding | Goes in |
|---|---|
| A trap in *this* codebase: a thing that fails with no error, a document that is out of date, a library behaviour that you did not expect | `docs/10-lessons-learned.md`, as a new `Lnn` |
| A rule that changes how you *write* code here: a convention, a prohibited pattern, a step that `./check` must have | **this file**, under `Rules that are easy to get wrong` |
| Both | Both. The lesson explains. The rule sets the limit |

A finding is salient if one or more of these conditions is true:

- It caused **no error**. Examples: an empty page, a component with no style,
  or a control that a keyboard cannot reach. Another example is a test that
  passed because it had nothing to test.
- **A reasonable person would make it again** from the documents as they are
  now. Usually this means that a document is out of date. Then correct the
  document also.
- Somebody **found it when they looked at the code or the page, not with a
  test**. This means that the test suite has a blind spot. Record that blind
  spot.
- To fix it, somebody had to **read the source of a dependency** to find the
  real behaviour.

Do not record ordinary bugs, single typos, or a thing that the code already
makes clear. Each session reads this file fully. Each line that you add is a
line that every session must read. If an entry is not true now, delete it.

---

## Security: how the breaches actually happened

Each disclosure that we found here was *a number that looked correct, in a
column that looked right*. None of them caused an error, and none of them made
a test fail. Several of them were behind guards that passed. The specific rules
are below. The items in this list help you find the **next** disclosure. Each
item links to the case that caused it.

- **A protected value is in more than one place.** A protection applies per
  MECHANISM. A disclosure occurs per VALUE. Make a list of each place that
  holds the value: caches, JSONB, audit entries, exports, indexes and logs
  (L47, L55).
- **Ask who can READ what you write.** People design a new write as a write,
  and nobody examines its read side. Here, this question finds the most
  disclosures (L55).
- **A guard that you did not see fail is not evidence.** Put the bug back in
  the code, and watch the guard fail (L48).
- **An empty column is a column that no test examines.** If the subject of a
  test is NULL, the test reports "no data" as "no problem" (L50, L51).
- **Do the test as the actor that the guard must REFUSE.** The test suites run
  as an owner, thus they cannot reach the branch that refuses. Assert both
  halves (L47).
- **Different people apply a rule that is only in prose in different ways.**
  Make the rule a committed register. Add a `./check` step that fails on each
  item that is not classified (L48, L54).
- **`any` forbids nothing.** Code downstream cannot examine an untyped row
  (L53).
- **Make the classification visible in the name.** Use a suffix such as
  `_pvt` or `_ct`, so that a reviewer sees the classification in the diff.
  `./check` enforces the name in both directions (L49).

[docs/16-disclosure-verification.md](docs/16-disclosure-verification.md)
describes the planned mechanisation: a full taint check over each read path ×
each actor. That document also tells what the check deliberately will **not**
find.

### Before shipping anything touching personal or financial data

1. **Where else is this value?** Each place needs its own defence.
2. **Run the read as an actor that the guard must refuse.** Run it against a
   real database, not in your head. Use an employee, and also a
   `finance_admin` or an `it_admin`. Nobody tests the limits of the roles that
   are powerful in other areas.
3. **Watch the guard fail.** If nothing failed, then your test did not examine
   the guard.
4. **Make sure that the fixture has data.** An assertion that is green on NULL
   is not a pass.
5. **Make sure that the value is classified**: in the disclosure matrix, in the
   audit register, or as a committed exemption with a reason.

The question "who may write this?" is half of the work. All of the breaches
were in the other half.

---

## Rules that are easy to get wrong

**Migrations, not `schema.sql`.** `packages/database/reference/schema.sql` is
the design document. It gives no `GRANT`s, thus no role can read anything. It
defines `app.set_updated_at()`, but it does not connect that function to a
trigger. Only `supabase/migrations/` makes a database that works. Build from
`supabase/migrations/`, and do your tests on that database.

**`config.toml` and `migrations/` must be siblings, at the repo root.** The CLI
finds `migrations/` relative to `config.toml`, and it searches only *upward*
for it. If the two are at the root, `supabase start` works from any directory.
When the two were in different directories, `supabase db reset` applied
**zero** migrations and reported success.

**`config.toml` points at the fixture by relative path.** If
`[db.seed] sql_paths` is wrong, `db reset` reports success against an empty
database.
After you move a file or a directory, make sure that
`SELECT count(*) FROM employees` returns 12, not 0.

**Regenerate the snapshot only from a migration-built database.**

```bash
supabase db reset && pnpm db:snapshot
```

If you make the snapshot from a database that you changed by hand, your local
experiments go into the baseline. This occurred one time: a manual `ALTER` left
`invoices.total` as `numeric(18,2)`, but the migration says `numeric(15,2)`.

**Regenerate the page budget only on purpose, and commit it with the change
that moved it.** `packages/database/perf/budgets.tsv` records the cost of each
page to the database, for each perf actor. The cost is the statements that run
and the data pages that Postgres reads. Unlike time, these are the same on each
machine. `pnpm db:perf regress --update` writes the file again. Then a page that
costs more shows as a diff that a person reviews.

**CAUTION:** Do not run `--update` only to make a failed push pass. First, read
which page moved, and find the reason. This is the snapshot rule again, at a
higher level.

**`supabase db reset` leaves `app_user` unable to log in.** The migration
`20260827000002_auth_and_grants.sql` creates the role with no password.
`./setup` sets a password in a separate step after the reset, and `db reset`
alone does not do that step. Then each test fails with
`password authentication failed`. This looks like a bug in the test, but the
cause is the state of the environment ([L81](docs/10-lessons-learned.md)). If
you run `db reset` without `./setup`, run this command after it:

```bash
psql "postgresql://postgres:postgres@127.0.0.1:54322/postgres" \
  -X -q -c "ALTER ROLE app_user WITH PASSWORD 'app_user'"
```

**Give a restricted column on `employees` the suffix `_pvt`, and give
ciphertext the suffix `_ct`.** If a column on that table has neither suffix,
it is directory data by definition. The disclosure matrix decides the
classification, and the name must AGREE with it. `./check` fails on a
restricted column that has no suffix. It also fails on a column with a suffix
that nobody classified. This step asserts the classification, and it never
infers it ([L49](docs/10-lessons-learned.md)). Only `employees` needs this
rule, because on other tables an RLS policy limits the whole row.

**No column anywhere may be empty in the fixture.** If the subject of a test is
NULL, the test does not fail. It reports "no data" as "no problem"
([L50](docs/10-lessons-learned.md), [L51](docs/10-lessons-learned.md)).
`./check` enforces this rule on each base table, with a committed sparse list
of exemptions. "We did not do it yet" is not a reason. Until now, the only
reason that we accept is "the table that it references does not exist yet".

Make ciphertext with `sealField`, never by hand. `pii.test.ts` opens each
sealed fixture value, because a copied envelope still looks full.

**Classify each table, and each sensitive column, before it ships.**
`apps/web/src/lib/server/security/matrix.ts` records two facts for each value:
who may read it, and **which mechanism holds it** (`rls`, `encrypted`,
`projection` or `open`). `scripts/verify-matrix-complete.mjs` starts from the
SCHEMA, not from the matrix. It fails on each table that is not in exactly one
of these classes:

- row-scoped: the whole-row tables of the matrix, or `ROW_SCOPED`. The script
  examines each of these tables against `pg_policies`.
- per column
- `TENANT_WIDE`
- `EXPOSED_PENDING`

Before we made the step wider, the script started from the matrix. Because of
this, each employee could read `customers.tax_number`, and this step was green
([L103](docs/10-lessons-learned.md)). A new table needs a class. Until now,
each disclosure bug here was an *unclassified* value, not a value with an
incorrect classification ([L48](docs/10-lessons-learned.md)).

`TENANT_WIDE` classifies by table, not by column. Thus, **the step does not
examine a column that you add to a tenant-wide table**. For such a column, ask
if its table must stay tenant-wide.

**`EXPOSED_PENDING` is a list of known disclosures, not an exemption.** The
whole tenant can read each entry in it, but another committed rule says that
the tenant must not. The reason for each entry names that rule. The list is
empty today. To correct an entry, add a RESTRICTIVE policy and move the table
to `ROW_SCOPED`. The step fails if a table has a narrower policy but is still
in the list of exposed tables.

If you deliberately leave a table tenant-wide, put it in `TENANT_WIDE`, with a
reference to that decision. A [docs/15](docs/15-row-level-visibility.md) Tier 2
table is an example. Do not add a table to `EXPOSED_PENDING` to make a new
feature pass.

**A foreign key does not examine the tenant.** Postgres validates an FK with
its own internal query. That query bypasses RLS, thus an id from another tenant
passes. If the id comes from a request, first `SELECT` it under RLS.
`assertCustomerExists` in `projects.repo.ts` does this
([L103](docs/10-lessons-learned.md)).

**When a row holds both a parent and a child of it, the foreign key is
composite.** `ticketing_tickets` holds an area, a category and a subcategory.
With three separate keys, the category in a row can belong to a different area,
and the subcategory can belong to a different category. Reference
`(tenant_id, child_id, parent_id)` against a `UNIQUE` constraint with the same
columns on the child table. This also makes Postgres examine the tenant
([L109](docs/10-lessons-learned.md)).

**Before you add a table, look for a table that already models the concept.**
Look by meaning, not by name. `clients`/`customers` and
`time_tracking_billable_expenses`/`expenses` each held the same rows two times,
and we merged each pair. The protection on one copy did not apply to the other
copy ([L103](docs/10-lessons-learned.md)).

**Do the test of a data migration against a database that has rows, in a
transaction that you roll back. Write the migration as one `DO` block.**
`supabase db reset` loads the fixture AFTER the migrations. Thus, the half of
the migration that moves data runs on empty tables, and it proves nothing.
`ci-database.sh` applies files in autocommit mode. In that mode, `SET LOCAL`
does nothing, and `ON COMMIT DROP` temp tables disappear immediately
([L104](docs/10-lessons-learned.md)).

Two rules apply to the use of the disclosure matrix:

- **`defense` is the field that decides, not audience.** On a row that many
  users can see, RLS cannot hide a column. Thus, a NULL in the fixture is not
  evidence of anything.
- **Declare per column only where many users can see the row.** If an RLS
  policy limits the whole row, one declaration at table level covers each
  column on it.

**A protected column NEVER falls back to an unprotected one.** RLS hides the
row, but a `COALESCE` puts the value back. An RLS policy protects
`compensation_base`, and `employees.base_amount` is an unprotected cache of the
same value. Thus, `COALESCE(cp.amount, e.base_amount)` disclosed each salary in
the organization to each employee. The number looked correct, there was no
error, and no test failed ([L47](docs/10-lessons-learned.md)).

Read only the protected column, and let it be NULL. A blank value is the
correct answer for a user who must not see it. `./check` fails on this shape.

**Write every form action out in the page's own `actions` object.** Shared
action code is a handler that the page calls after its own `requireCan`. Do not
spread actions into the object (`{ ...sharedActions() }`). The authorization
step and the audit step of `./check` read the `actions` object of each page.
Thus, they do not see the guard or the audit classification of a spread
action, and both steps still pass ([L110](docs/10-lessons-learned.md)).

**Run a test for an access rule as the actor that the rule must REFUSE.** The
repository test suites deliberately run as an owner, so that a policy cannot
narrow what they see with no error. But then these suites cannot reach the
restricted branch of any query. Assert both halves: the refused actor gets NULL,
*and* the permitted actor still gets the value.

To do a test of the policy of a child table, read the child table alone. A join
to its parent applies the policy of the parent, and that hides a policy with a
bug on the child ([L110](docs/10-lessons-learned.md)). If a policy hides all
values, the page looks like it has a bug. It does not look like a rule.

**Type every `tx` query that returns data to a page.** Downstream, an untyped
row is `any`, and `any` satisfies each parameter. Thus, the compiler allows an
argument with the wrong shape, and nobody can examine that argument.
`data.tenant` was untyped, and a `FormatContext` argument received a bare
string. The page then rendered a timestamp with no date, and `svelte-check`
passed ([L53](docs/10-lessons-learned.md)).

**Never compare a database value to `Date.now()`.** The application and
Postgres are on different machines. The clock of a Docker VM drifts when the
host sleeps. Compare against `clock_timestamp()` in the same query. To prove
that the database used a column default, assert `col = now()`
([L43](docs/10-lessons-learned.md)).

**An RLS policy is `AS RESTRICTIVE`, unless it is an alternative on purpose.
If you recreate a policy, write each modifier again.** Postgres uses
PERMISSIVE as the default, and it joins permissive policies with OR. Thus, a
table with `tenant_isolation` and a visibility policy needs a RESTRICTIVE
second policy. If the second policy is not RESTRICTIVE, the two policies
become *either* and not *both*.

A `DROP`/`CREATE` pair is not a diff. The pair loses `AS RESTRICTIVE`, `FOR`,
`TO` and `WITH CHECK` when you do not write them again. The statement
succeeds, and nothing looks incorrect. This bug caused a 12-row cross-tenant
disclosure before, and only `./check` found it
([L63](docs/10-lessons-learned.md)). **Run `./check --db` immediately after
each policy change.**

**Do not parse `request.jwt.claims` in a policy expression. Call an `app.*`
function.** The `::jsonb` cast raises an error on a claim that is not valid.
A policy expression cannot hold an `EXCEPTION` handler. Thus, the request
becomes a 500, not an empty page. This occurs only some of the time, because
it depends on whether the planner evaluates that part of the expression
([L62](docs/10-lessons-learned.md)). Each such function returns the closed
answer (`NULL`, `false`) on a bad claim. `./check` calls each function with
`not-json`, and the step fails if the function raises an error.

**The RLS policy of a table must not call a helper that queries that SAME
table again. This rule also applies through `SECURITY DEFINER`.**
`INSERT/UPDATE ... RETURNING` compares the new row with the `SELECT` policies.
It uses the values that it already has, in the middle of the statement. A
nested query cannot see that row yet ([L92](docs/10-lessons-learned.md)).
Write conditions on the same table (ownership, a status column) inline,
against the values of the row itself. Use a helper only for a condition that
reads a *different* table. `verify-rls.sql` only runs `SELECT` statements.
Thus, if `verify-rls.sql` passes, that is not evidence that a self-referential
policy survives `RETURNING`.

**Recompute a denormalised counter in the same transaction. Do not increment
it.** `SET n = n + 1` is correct only if two conditions are true: each writer
remembers it, and no write stops part of the way through.
`SET n = (SELECT count(*) ...)` is correct, whatever occurred before it. Thus,
the next write repairs a row that is already incorrect, and does not carry
the error forward. The read path counts the real rows next to the stored
value, so that a disagreement is visible. A test makes sure that they agree
AFTER a write ([L58](docs/10-lessons-learned.md)).

An incorrect counter supplies a progress bar, and an incorrect progress bar
looks the same as a correct one. The recompute runs under the RLS policies of
the WRITER. Thus, **before you narrow a table, find each recompute that reads
it**. If you do not, the sum covers only the rows that the writer can see,
with no error ([L106](docs/10-lessons-learned.md)).

**`gl_daily_balances` is the one value whose read path does not count the
rows next to it.** The ledger reports read it so that they do not sum each
line. Triggers recompute it on each write that can change a posted amount.
The triggers run as the table owner, under an advisory lock for each tenant.
Instead of a count on the read path, three items make sure that it agrees
with the lines:

- the `ledger/daily-balances-agree` invariant of `./check`
- `gl_daily_balances.test.ts` (after each type of write, and two concurrent
  posts)
- the `verify` command of the perf tenant.

A new path that writes posted journal lines needs nothing more. A path that
bypasses triggers (`session_replication_role = replica`) must rebuild the
table for the data that it changed.

**If a page layout and an action write path depend on the same question, use
one exported function for the predicate. Both must call it.**
`crm/companies/[id]` asked `customer_type === 'individual' && contacts.length === 1`
in the template. It asked `customer_type === 'individual'` in the action.
Nobody could save a row in the shape that the second predicate matched and
the first did not match. Nothing found the bug, because both halves typecheck
and the fixture had no such row ([L113](docs/10-lessons-learned.md)). The next
rule has the same reason: the vocabulary of a `text` column lives in one
place.

**A vocabulary for a plain `text` column lives in the repository, and the
pages import it.** These columns have no enum and no CHECK. Thus, the list IS
the constraint. Two copies of a constraint are one constraint, and the two
copies will disagree. `/projects` filtered on a status list that did not
include `draft`, the column default. The first project that a user created
would be correct in the database, but no filter would show it
([L57](docs/10-lessons-learned.md)). For each new write, ask: **can the page
that lists this item find it again?**

**A new page under `(app)` gets a line in `apps/web/e2e/smoke.spec.ts`. A new
FORM gets a case in `apps/web/e2e/form-errors.spec.ts`.** They are the only
e2e tests that load a URL. Apart from these tests, only the front-page load
step and the perf steps render a page in `./check`. These tests ask for
headings BY ROLE. This is how the smoke test found that no page in
the product had an `<h1>` ([L64](docs/10-lessons-learned.md)).

Both are read-only, because the unit suites use the same fixture. Thus, a
spec that writes needs its own serial project, and it must load the fixture
again. Run them with `pnpm --filter @kaaj/web e2e`. They are NOT in plain
`./check` on purpose: `./check` takes 24 seconds, and the team wants to keep
that time. `./check --all` and the pre-push hook run them.

**A code review records the last COMMIT SHA that it examined, in
[docs/33-code-review-log.md](docs/33-code-review-log.md).** Several sessions
commit here at the same time. Thus, "everything since Tuesday" is a range
that moves: it covers some work again, and it skips other work. The log holds
the `git diff <sha> HEAD` command for the next run. It also holds the list of
rules that a review is FOR. These are the rules that CLAUDE.md states and
that `./check` cannot see. `./check` is green on each commit, so if you run it
again, that is not a review.

**If you did not see a workflow green, do not think that it runs.**
`tests.yml` failed each run for five weeks. In the same weeks, `build`,
`linting`, `format`, `database` and `e2e` were green on the same commits. Many
green marks with one red cross look like "a test over there that sometimes
fails". The failure hid two suites that never ran. Five assertions of those
suites are Storage RLS tenant isolation.

Examine the COUNT of runs, not the last run.
`gh run list --workflow=<file> --limit 30` shows the difference between
"fails" and "never passed". On one red mark, these two look the same
([L114](docs/10-lessons-learned.md)). Examine specifically the workflow of a
suite that connects to a service over HTTP. On a local machine, the
`supabase start` services always run. Thus, on a development machine, "needs
Postgres" and "needs GoTrue" have no difference.

**A new test file, or a new top-level `describe` in a current file, gets a
line in [docs/22-test-inventory.md](docs/22-test-inventory.md).** Nothing
enforces this rule, and no step fails, the same as for the `testplan-*.md`
set. Thus, the doc stays correct only if you update it in the same PR that
adds the test, not after.

The doc groups unit tests by module (`pnpm --filter @kaaj/web run test`) and
e2e tests by purpose (`pnpm --filter @kaaj/web e2e`). Add the line to the
section that already covers the area. If no section covers the area, start a
new section. The doc exists to show this type of gap: a module with no
section. The doc found two already: documents and ticketing had no section.

**The `load()` of a page has a guard for its own read permission. A
`requireCan` in the `actions` of that page does not cover `load()`, and a
guard in a parent layout does not cover it.** Eight `/settings/*` pages had
`requireCan(ctx, "firm.settings.write")` in their write action. In `load()`,
they had only `if (!locals.tenantId)`. Thus, each signed-in staff member could
read all eight pages, with no admin role. The sidebar did not show a link to
these pages, but that is not a permission (L44).

The shared `(app)/+layout.server.ts` guard is for general identity: a
signed-in session, and staff or portal contact. It is not for the specific
permission of a page. A write guard protects only the POST. Add
`requireCan(contextFrom(locals),
"<module>.<thing>.read")` as the first line of `load()`, immediately after the
tenant guard. The read permission and the write permission are different
strings in `@kaaj/authz` on purpose ([L79](docs/10-lessons-learned.md)).

**Do not write an error to a log as it is. Send it through `safeError`
(`$lib/errors.ts`), and send an unexpected error through `handleError`.** A
`PostgresError` holds the row that caused it in `detail`. It also holds
`where`, `query` and the bound parameters. Postgres does not give `detail` to
`app_user`, so the request path is already safe. But the table owner sees
`detail`. `./check`, the migrations, `verify-remote.sh` and all code on the
service role connect as the table owner ([L69](docs/10-lessons-learned.md)).

The allowlist is a second defence there, and it is the only defence in all
other places. For each role, `message` repeats the submitted value. For
example, the value in `invalid input syntax
for type date: "1985-03-12"` is a date of birth. This is why these log lines
stay in infrastructure that we control.

**Every unexpected error gets an id, and the id is on the page.**
`handleError` in both hooks makes an id. It writes the error to stdout as
JSON, with the id and the actor from `locals`. Then it returns
`{ id, message }`. SvelteKit replaces the real message with "Internal Error"
before the message gets to the browser. Thus, without the id, a bug report
has nothing to quote, and we have nothing to search for.

**Classify each table by whether it will become large.** The application is
not complete yet. A table that you add today looks the same as a small
configuration table, until a tenant uses it for two years. In
`scripts/verify-query-scale.mjs`, `SCALE_SENSITIVE` / `NOT_SCALE_SENSITIVE`
covers each table in the schema snapshot, and each table has a reason.
`./check` fails on a new table that is in neither list. This is the same
shape as the sensitive-column matrix and the audit register, for the same
reason. People forget a rule that says "remember to check" when the table
looks ordinary.

Some tables get a row for each EVENT, for example a ticket, a journal entry
or a clock-in. These events continue for as long as the tenant uses Kaaj, so
the table is unbounded. Other tables get a row for each DIMENSION, for example
an employee, a policy or a department. The size or setup of the organization
limits these, so the table is bounded, however long the tenant uses Kaaj. A
`SCALE_SENSITIVE` table is where `scripts/verify-no-loop-queries.mjs` and an
absent index have a real effect. That is the purpose of the classification;
the classification is not a goal by itself.

**Every exemption is a committed literal, not a filter.** The test scripts
list by name the tables and indexes that have an exemption, with reasons. A
new violation fails. If you remove an exemption that has a reason, that also
fails. Both changes need an edit that a reviewer examines. A `NOT IN` pattern
accepts future violations with no error. That is how a suite can test nothing
and show no error.

**Also, make sure that each literal agrees with the schema.**
`verify-constraint-registry.mjs` listed `"projects_tasks"`, a table that does
not exist and never existed. Thus, for months no step examined the
constraints on the real `tasks` table, and `./check` was green. A name that
matches nothing returns an empty result. You cannot tell an empty result
from "nothing to report" ([L100](docs/10-lessons-learned.md)). Each list that
names a schema object by string fails if the schema does not have that name.
Examples of these lists are `FORM_WRITTEN`, `SCALE_SENSITIVE`, the audit
register and the disclosure matrix.

---

## Comments

**Do not write a comment by default. Write a comment only if it gives
information that the code cannot give.** Examples are:

- a constraint that the code does not show
- an invariant that can become false with no error
- the reason why an alternative that looks correct is wrong.

If a skilled reader loses no information when you remove the comment, remove
it.

**Do not write the history of a decision in a comment.** Do not write
"changed from X because Y suggested it". Do not write ticket numbers. Do not
write "tried three approaches, this one works". Put this information in the
commit message, not in the code. A history in a comment becomes incorrect
when its reason is not important any more, and nothing then updates it.

A comment describes the code as it is today. It does not describe the steps
that made the code.

**Do not write in a comment what the code already says.** An identifier with
a good name is already documentation. A comment that repeats it is a second
copy of the same fact. If a person updates only one of the two, the two
*will* become different.

**Fewer comments are better, and a wrong comment is worse than no comment.**
An incorrect comment does more than give no help. It gives the reader
incorrect information, and it makes the reader trust each other comment near
it less. If you are not sure that a comment is necessary, do not write it.

---

## Performance

**The target for the render of each page on the server is less than 20ms.**
This time is all of the `handle` chain: the auth verification, every
`load()`, and SSR to HTML. It does not include the full paint in the browser,
and it does not apply to `vite dev`. For each request, `vite dev` transforms
code, and this cost is much larger than in a production build. Thus
`vite dev` gives a number that is not correct.

To measure the time, run `pnpm --filter @kaaj/web measure-render-times`
(`scripts/measure-render-times.mjs`). Run it against an instance of the
application that you built and started before. The script reads the
`server-timing` response header, which `hooks.server.ts` sets on every
request. The network panel of the browser DevTools shows the same header.

**The target for the first load of the application is less than 50ms, and
`./check` fails the build if the load takes more time.** The load starts with
a signed-in user and ends when `/employees` is fully loaded. The step uses the
MEDIAN of five samples. Before the five samples, it does one warm-up load and
ignores its result. One latency sample is not a measurement.

When the machine has no other work, this page loads in 21.8-25.4ms. When the
machine is busy, the same page measures 25.9-46.0ms, and sometimes one sample
is more than the target. This step runs when the machine is busy: immediately
after `build` and the unit suites. If the code becomes slower, every sample
becomes slower, so the median also fails. The median removes the effect of a
short delay in the scheduler, which caused approximately one run in four to
fail. If the step fails, the error shows all five samples.

The 50ms target is larger than the 20ms server target on purpose. It is the
`load` event of Navigation Timing. This event includes the network transfer,
CSS, JS and hydration, not only the work on the server. The server time alone
was ~3ms, but the *page* took more than 100ms. The cause was an external font
request that stopped the render, and the server timing does not show such a
request (`docs/10-lessons-learned.md` L18).

`apps/web/scripts/verify-front-page-load.mjs` does a real sign-in. It starts
its own `vite preview` against the build that the `build` step made. It runs
only when the `build` step runs, so it does not run under `./check --quick`.

**Paginate each query against a table in `SCALE_SENSITIVE`
(`scripts/verify-query-scale.mjs`) that can return an unlimited number of
rows. Show 20 to 50 rows at a time, and choose the number
from what the user sees on screen.** The list page of `ticketing`
(`PAGE_SIZE = 20`) is the current pattern. It puts `limit`/`offset` in the
query and a page number in the URL. Never "fetch everything and slice in the
template." A dense table can show the larger number of rows. A list with one
card for each row, or another list with more content for each row, must show
the smaller number.

A list with no pagination is correct on the dozen rows of the fixture. After
the tenant uses Kaaj for a year, the same list reads the full table.
`verify-no-loop-queries.mjs` and the scale-sensitive register exist to find
this same type of problem.

**A `LIMIT` with no count next to it hides rows, and nothing tells the
user.** On the page, ten rows from a total of four hundred look the same as a
total of ten rows. Each paginated read operation must also return a
`count(*)`. The page must tell the user which rows it shows. The text of
`crm/companies/[id]`, "Showing the most recent N of M", is the pattern. The
register classifies the TABLE, and nothing examines the query. Thus a query
can read all of a correctly classified table, and that step stays green
([L112](docs/10-lessons-learned.md)).

**A page must not send more than 100 rows of any type to the browser. This
rule also applies to pickers.** A `<select>` that contains every employee or
every customer also reads the full table. A table that the size of the
organization limits is not necessarily small: 1,000 people, 3,000 customers.
A picker on such a table is a `Combobox` with `search`. The page's own
`search*` action supplies its results, and that action calls a function in
`$lib/server/pickers.ts`. The function returns 20 matches with the same
filter that the old list had.

SQL calculates the total next to a paginated list. The page never adds the
total from its own rows ([L117](docs/10-lessons-learned.md)). The total is a
capped count, or it comes from a precomputed table, as the next rule tells.

`pnpm db:perf rows` reads the load data of every page as every actor of the
perf tenant. It fails on each array with more than 100 items, so it also
finds a picker in a closed modal. `./check --all` runs it, and the pre-push
hook also runs it. Plain `./check` does not run it, because it needs the perf
cluster. If a step does not run when the cluster is stopped, the step shows a
pass, and nothing tells you.

**On a request path, a query must not read more rows than it returns. Only a
capped count can read more rows. An aggregate that is large by nature must
come from a precomputed table.** If what is on screen limits the cost of a
query, the query cannot get a very bad plan. A query that reads the full
table to show twenty rows can get a very bad plan after the next statistics
update. The perf budget measures the planner only in its best case, so the
budget cannot find this problem ([L118](docs/10-lessons-learned.md)).
- **Paginate first, then add the other data.** In a CTE with its `LIMIT`,
  select the ids of the rows on the page. Then join or `LATERAL` the other
  data onto only those rows, as `list` in `employees.repo.ts` does. Do not
  join or rank the full table and then paginate the result.
- **On a `SCALE_SENSITIVE` table, the count next to a paginated list stops at
  a cap.** Use `countCap` in `$lib/server/db/paged.ts` with the `atLeast`
  prop of `Pagination`, as time tracking and attendance do. A table that the
  size of the organization limits, such as `employees`, can count all its
  rows.
- **A total over every row comes from a precomputed table.** Examples are a
  ledger total, a balance by day, or any value that the page asks for by
  period. Read such a value from a table that the system updates at write
  time. `gl_daily_balances` is this
  type of table. It must stay equal to its rows, and you must be able to prove
  this.
- **Do not use the application code instead.** If TypeScript gets the rows
  and joins them, the same reads occur, in more round trips. The correct fix
  is the shape of the SQL.

No automated step or test examines the shape of a query. `/crm/pipeline`
ranks every deal to show 20 for each stage, and it does not obey this rule
today.

---

## Svelte

Use Svelte 5, and use only runes. The rules below come from
[svelte.dev/docs/svelte/best-practices](https://svelte.dev/docs/svelte/best-practices).
This file gives them as rules because an alternative that looks correct
compiles, runs, and is wrong.

**Use `$state` only for a value that a template, an `$effect` or a `$derived`
reads reactively. Do not use it for every local variable.**
`$state({...})`/`$state([...])` puts a deep proxy on all of the object graph.
Your code only REPLACES some objects or class instances, and never changes
them through Svelte. Examples are a fetch response, or an instance of a
third-party library that you keep for its methods. For these, use
`$state.raw`.

`$state.raw` adds no proxy and no cost for each field. Also, it does not put
the internal state of a library in a Proxy that the library does not expect.

**If a value comes from other state, use `$derived`, not `$effect`.**
`$derived` takes an expression (use `$derived.by` for a body with more than
one statement). It calculates the value again when its inputs change. It
cannot write to state, so it cannot start the state→effect→state loop that an
`$effect` can start.

Use `$effect` only to send changes OUT to something that is not in the
reactivity of Svelte. Examples are the DOM directly (`{@attach ...}` or an
`$effect` for a `contenteditable`), a chart library, or `localStorage`. Do
not use `$effect` to calculate one part of the state from another part when
`$derived` can do it.

**If a value comes from a prop, use `$derived`. Do not use a `let` that gets
its value from the prop one time only.** Props are reactive.
`let color = $state(type === "danger" ? "red" : "green")` keeps the value
that it had at mount, and it does not follow changes to `type` after that.
Sometimes a component must have its OWN copy that becomes different from the
prop. Examples are a draft that the user edits, or a DOM mirror. For such a
copy, set its first value from the prop explicitly.

Add `// svelte-ignore state_referenced_locally` and a comment that gives the
reason. `RichTextEditor.svelte` and `Combobox.svelte` do this for that
reason.

Sometimes the copy must continue to follow the prop. Examples are a filter
that comes from the URL, or a `load()` result. For such a copy, use an
`$effect` that sets it again, not the `$state` initializer.
`ticketing/+page.svelte` and `ticketing/new/+page.svelte` do this on
purpose, and a comment in each file describes the trap.

**For a `window`/`document` listener, use `<svelte:window on... />` /
`<svelte:document on... />`. Do not use `onMount` + `addEventListener`.** The
element removes its own listener. A listener that you add by hand needs a
`removeEventListener` that you also write by hand, and the same `onMount`
callback must return it. If you forget it, the listener stays after the
component is gone. Use `onMount` only for work that occurs one time at mount,
for example an initial focus or an initial fetch. A listener that must stay
for the full life of the component must be on the element.

**If a list can change its order, or get or lose items, use a keyed
`{#each}`. Never use the loop index as the key.** Write
`{#each rows as row (row.id)}`. If the key is the index and a row leaves the
middle of the list, Svelte changes the WRONG element in place. You cannot see
this until a `bind:` or a transition attaches to the wrong row.

One case is cosmetic and not a bug. That case is a `{#each}` over a small,
static literal that never changes its order (marketing text, a fixed list of
features).
Give this case a real key too. But do not change current code only for this
case.

**In new code that syncs a DOM node to an external library, use
`{@attach}`, not `use:`.** `{@attach}` works together with `{#if}`/`{#each}`
in a way that an action cannot. We do not change current `use:` actions only
for this reason.

**All requests that the server answers share one `$state` at module scope.**
SvelteKit runs one Node process for many tenants. A `let cache = $state(...)`
at the top level of a `.svelte.ts` file is one value for all of the server,
not one value for each request. This is the shape of a cross-tenant
disclosure. A full section of this file is about how to prevent cross-tenant
disclosure at the database layer.

Put reactive state that belongs to one request or one user in the Svelte
context (`setContext`/`getContext`). If possible, put a runes class in the
context, as `ConfigProvider.svelte` does. Never put this state in a shared
module.

**Do not use `svelte/store` in new code. Use a class with `$state` fields.** A
store needs `get()`/`.subscribe()`/`$store` auto-subscription for a reactive
read, and `.update()` for a write. With a runes class, code reads and writes
a field as a usual field. For this reason, you can also safely destructure a
bound method from it, and `this` stays correct
(`const { toggleTheme } = useConfig()` in `ThemeToggle.svelte`).
`svelte/store` is a legacy API from Svelte 4, and Svelte keeps it only for
interop. Do not use it in new code.

**Do not use legacy patterns in new code**, although `svelte-check` and
`./check` do not fail on them. These patterns are:

- `export let` / `$$props` / `$$restProps` instead of `$props()`
- `on:click` instead of `onclick`
- `<slot>` instead of `{#snippet}`/`{@render}`
- a bare `$:` instead of `$derived`/`$effect`

None of these patterns are in `apps/web/src` today. Keep it so. If one of
them gets in, a developer can copy it as the start of the next component.

---

## Forms

**Every field that an action writes goes through `FormReader`
(`$lib/server/forms.ts`). This rule applies to all fields. Do not use
`formString` for a value that goes into a column.** `required`, `maxlength`
and `type` are only browser UX. A crafted POST does not contain them.
`varchar(n)`, `uuid` and Postgres enums are the *last* protection. When they
refuse a value, the result is an unhandled 500, not a field error
([L34](docs/10-lessons-learned.md)).

| Column | Reader | What it stops |
|---|---|---|
| `varchar(n)`, `text` | `text(name, { max: n })` | `value too long`, which is a 500. `max` **must** be equal to the length of the column. The reader counts code points, as Postgres does |
| `uuid` | `uuid(name)` | `invalid input syntax for type uuid` from a hidden `id` field |
| a Postgres enum | `enumValue(name, "<type>")` | `invalid input value for enum`. The values come from `@kaaj/enums`, and `./check` keeps them the same as the database |
| a fixed set on `varchar` | `choice(name, ALLOWED)` | a value that is not on the list, which then gets to the display code |
| `date` | `date(name)` | `2026-13-45`: the shape is correct, but the date is not real, and the cast causes a 500 |
| money and rates | `decimal(name, { scale })` | a conversion to float64 and back, and a third decimal that the column rounds away with no error |
| `int4` | `integer(name, { min, max })` | a value out of range, which also causes a 500 |
| a locale / zone / currency | `locale` / `timezone` / `currency` | `en_US` and similar values: a `RangeError` inside `Intl`, on each page that formats a number for that office ([L24](docs/10-lessons-learned.md)) |

Country-specific formats come from `@kaaj/validation`. Do not write a regex
at the call site. Examine the length of the result before you store it.

**An optional field has three possible results, not two.** The results are
blank, valid and *rejected*. If the code returns the same value for an
invalid field as for a blank field, it deletes the field and reports success.
An overtime multiplier disappeared in this way, and the application then
calculated overtime at 1x ([L33](docs/10-lessons-learned.md)). `FormReader`
has a design for these three results. A hand-written `Number(x) || 0` does
not.

**Read every field BEFORE `if (!f.ok)`. Do not read a field inside the object
that you make after that test.** If you call a reader in the argument to
`create`/`update`, the reader runs after the `if (!f.ok)` test. Thus the
rejection occurs too late, and the action cannot report it. A field that is
not required returns `null` when the reader rejects it. Then the column gets
NULL, and the action answers `saved: true`. This bug occurred one time, in
the same commit that documented L33.

Put the value in a local variable above the `if (!f.ok)` test, and use that
variable:

```ts
const middleName = f.text("middle_name", { max: 100 })   // ✅ before
if (!f.ok) return fail(400, f.problem())
await repo.update(tx, id, { middle_name: middleName })

await repo.update(tx, id, {
  middle_name: f.text("middle_name", { max: 100 }),      // ❌ never reported
})
```

**Validate a value from the QUERY STRING too. Use `uuidParam`, or a
`FormReader` on a `FormData` that you make.** The Forms rule above is
necessary because a crafted POST does not contain `required` and `type`. A
query string never had these attributes. `url.searchParams.get()` returns
`""` for `?x=`. For `?x=garbage`, it returns the text that the user typed. If
either value goes to a `::uuid` or `::date` parameter, the result is an
Internal Error, not an empty filter.

For this reason, `projects/+page.server.ts` and `receive-payment` make a
`FormData` and read it through `FormReader`. `uuidParam`
(`$lib/server/forms.ts`) is the short form for one field.

**Do not give `''` to a parameter that has a cast.** SQL does not stop the
evaluation after the first true condition. Thus
`(${x} = '' OR c = ${x}::date)` does the cast in all cases. For `::date`,
postgres.js serialises the value in the driver. The driver then throws
`RangeError: Invalid time value` before it sends the query. Give `null`, and
use `IS NULL` in the query ([L37](docs/10-lessons-learned.md)).

**If the reader cannot express a rule, call `f.reject("field")`.** Examples
are a cycle, two dates that conflict, and a band with its limits in the wrong
order. Thus each rejection comes through one path, and the page can put the
cursor on the field.

**If the database can refuse a write, catch the refusal and answer with a
sentence.** `FormReader` validates the shape of a value. It cannot know that
a different row already uses the code. It also cannot know that a user
archived the row a minute before. When the code did not catch these refusals
(UNIQUE, CHECK, FK), each one gave an "Internal Error" page. The form also
lost its contents ([L66](docs/10-lessons-learned.md)).

```ts
try {
  return await withTenant(actorFrom(locals), async (tx) => { … })
} catch (e) {
  const refused = constraintFailure(e)   // $lib/server/db/constraints
  if (refused) return refused
  throw e
}
```

The constraint registry uses **`constraint_name` as its key, never the
message text**. The name is in the migration. SQLSTATE `23505` alone cannot
tell which field to mark. A constraint that is not in the registry continues
to cause a visible crash. That crash makes someone add the constraint to the
registry. This is better than a generic "something went wrong" message, which
hides the constraint.

The `./check` step `refusals have a message` examines each constraint on a
form-written table. The step fails if a constraint is not in the registry and
has no exemption with a reason.

**A regex for the shape does not validate a date.** `/^\d{4}-\d{2}-\d{2}$/`
accepts `2026-02-31`. postgres.js then converts it through a JS `Date` and
stores `2026-03-03`. There is no error, and the action answers `saved: true`
([L67](docs/10-lessons-learned.md)). Use `f.date()`, which parses the date
and converts it back to text to compare. The same rule applies to all values
that the driver serialises. Validate each value in the units that the column
stores.

**A write reports what it DID, not that the request arrived.** An
`UPDATE … WHERE id = $1` that matches no row still succeeds. Thus all eight
`archive` actions answered `{ archived: true }` for rows that did not exist.
They also wrote an audit entry for it ([L68](docs/10-lessons-learned.md)).
Add `RETURNING id`, and make sure that the query returns an id. For each
write, ask this question: **if this write does nothing and gives no error,
does the page look different?**

**The page MARKS a refused field, and the form stays on the page for this.**
This has three parts. Each part failed separately before
([L68](docs/10-lessons-learned.md)):

- The message NAMES the field. `f.problem()` does this by default ("Check
  Anchor date."). Thus, do not give only "Some fields need attention."
- The control has the daisyUI modifier AND `aria-invalid`, through
  `fieldErrors(form)` in `$lib/form-errors`. A screen reader does not
  announce a red border.
- A modal form uses `use:enhance={closeOnSuccess(() => (editing = null))}`
  from `$lib/form-enhance`. A plain POST reloads the page and resets the
  `$state` that keeps the modal open. **`update({ reset: false })` is
  necessary.** The default resets the form and discards the work that the
  user must correct. For the same reason, a form that is not modal uses
  `keepValues`.

`apps/web/e2e/form-errors.spec.ts` asserts all three parts. It stays
read-only because it submits only values that the action refuses.

`src/lib/server/forms.test.ts` is the regression test. Before the reader
existed, each case in it gave a 500, or a `saved: true` with no error, from
the application. If you add a new reader, add cases to this file.

---

## Time

**A `timestamptz` is an instant. Render it in the timezone of the OFFICE**
(`firm_locations.timezone`). Do not use the timezone of the user, and do not
use UTC. The same instant is a 09:00 start in Bangalore and a 22:30 finish in
New York. Only one of these is a workday. `instant()` in `$lib/format.ts`
takes the zone. No other code formats a time.

**A `timestamptz` alone does not give a local date.**
`hr_attendance.attendance_date` is the date in the office. A shift that ends
at 23:00 in New York ends at 04:00 UTC on the next day. A `::date` cast on a
timestamp column causes this bug. Apply `AT TIME ZONE` first
([L35](docs/10-lessons-learned.md)).

**A `DATE` column has no zone. Format it in UTC.** A hire date is the same day
in all places. `calendarDate()` does this. For this reason, it is a different
function from `instant()`.

**postgres.js returns `timestamptz` as a `Date` and `NUMERIC` as a string.**
`types: {}` registers custom handlers. It does not remove the built-in
handlers ([L36](docs/10-lessons-learned.md)). Declare repository types from
the values that the driver returns, not from the column type.

**Durations go through `hours()`**, which renders `7h 45m`. If you print
decimal hours, the default limit of three digits in `Intl` changes a stored
`6.9333` into `6.933`. That is not the stored value, and it is not a number
that a user can recognise.

---

## Money

**`NUMERIC`, never `real`/`double precision`/`float`.** Postgres `NUMERIC` is
exact base-10. The float types are binary, and they lose digits before any
code reads the value. We measured this against this database: `99999.99`
stored as `real` returns `100000`, and `1234567.89` returns `1234570`. A
later round operation cannot recover that loss. `./check` fails on a money
column that has a float type. Refer to the `money/numeric-not-float`
invariant.

**We chose two scales on purpose:**

| Kind | Type | Why |
|---|---|---|
| Money: salaries, invoices, premiums | `numeric(15,2)` | Ten trillion minor units. This scale holds INR amounts at crore scale |
| Rates and quantities: hourly rates, hours, FTE | `numeric(18,4)` | A rate of 12.3456/hour has a meaning. If you round it before you multiply, the error increases across each line of a timesheet |

**Money is a `string` in TypeScript, from the database to the browser and
back.** People get this rule wrong. Most errors in money amounts occur at
this point, not in the database.

- postgres.js returns `NUMERIC` as a **string**, and `client.ts` sets
  `types: {}` so that it stays a string. Do not parse it to make it easier to
  use.
- `Number("9007199254740993.00")` is `9007199254740992`, with no error.
- Repository types declare money as `string`. `money()` in `$lib/format.ts`
  takes a string. It converts the string only inside `Intl.NumberFormat`.
- Form fields use `inputmode="decimal"`, never `type="number"`. A
  `type="number"` field converts the value to a float in the browser and back.

**Money inside JSONB is a string too.** Examples are `salary_ranges`,
`costs_by_currency` and `overtime_rules`. Postgres stores a JSON *number*
exactly. But Postgres gives that number to JavaScript as a float64 when the
application reads it. Thus the loss occurs on the read, where nothing looks
wrong.

Store `"95000"`, not `95000`. A comparison of order uses `compareDecimal` in
`$lib/decimal.ts`, which compares the strings and does not parse them.
`./check` cannot see inside a JSONB column, so this rule is the only
protection.

**An invariant that reads `information_schema.columns` cannot see inside
JSONB.** `money/numeric-not-float` never could see inside JSONB. That is how
payroll kept every earning and every tax as a JSON number
([L41](docs/10-lessons-learned.md)). `money/jsonb-is-text` examines each path
in a committed list instead. Add each new JSONB money column to that list on
purpose. Every other list in this project works the same way.

**Arithmetic occurs in SQL, not in JavaScript.** Sums of invoice lines,
calculation of gross pay and proration all use `NUMERIC` in Postgres, where
the arithmetic is exact. If you add two money strings in JavaScript, the
result is a *concatenation* of the strings, and no type error occurs.

**The currency always stays with the amount,** and the application never
converts it for display (BR-FP-003). The application shows an amount in its
currency of record. It formats the amount in the locale of the market that
the amount belongs to. Refer to `localeForCurrency` and
[L24](docs/10-lessons-learned.md).

**Postgres ROUNDS a value to the scale, with no error. It does not truncate
the value.** `12345678.9052::numeric(12,2)` is `12345678.91`. If you store the
same value in two columns of different scale, round it to the scale of the
authoritative column first. Then write the other column. Pick a test value
that shows the difference between a rounded value and a truncated value:
`.9052`, not `.9012` ([L25](docs/10-lessons-learned.md)).

**All display goes through `$lib/format.ts`. No other code formats money.**
`money()`, `approxMoney()`, `number()`, `hours()`, `calendarDate()`,
`instant()` and `localised()` are the only places that construct `Intl` for
display. If a component uses `Intl.NumberFormat` or `toLocaleString()`, that
is a bug. Its output will become different from the rest of the application.
Also, it will use the locale of the *browser*, not the locale of the market.

**Two functions, and the choice is visible at the call site:** `money()` is
exact, and it is the default. `approxMoney()` abbreviates. It follows the
convention of the locale. There is no lakh or crore code anywhere, because
`Intl` already has this data:

```
en-US  18,123,432  ->  $18.12M
en-IN  18,123,432  ->  ₹1.81Cr      (crore; en-IN 1,423,323 -> ₹14.23L)
```

The function shows a maximum of 2 decimals. It does not add decimals, so
`950` stays `$950` and does not become `$950.00`.

`approxMoney` is a separate function, not an option, so that a reviewer sees
the choice. On a payslip line, `approxMoney` looks wrong to a reviewer. A
`compact: true` inside an options object does not look wrong.

**Abbreviated money is for scale, never for action.** `approxMoney()` is for
dashboards, chart axes and summary tiles. These show numbers that a user
reads to understand size. Never use `approxMoney()` on:

- a payslip
- an invoice line
- a salary band
- a tax amount
- an amount that a user reconciles against a bank statement.

`₹14.23L` is not a number that you can pay to a person. The abbreviation
loses data on purpose. If you are not sure, use `money()`. An exact amount
where an approximate amount was sufficient is a cosmetic problem. An
approximate amount where an exact amount was necessary is a financial
problem.

**Custom fields must never supply data to payroll or accounting
calculations.** Custom fields have no type and no tests. If an organization
needs a custom allowance on a payslip, that is a gap in the data model of the
product. Fix the gap in the product. Do not use a custom field.

We rejected the alternative, integer minor units. The reasons are in
[docs/05-architecture-decisions.md](docs/05-architecture-decisions.md).

---

## Tenancy, audit and disclosure

**Every `withTenant` takes `actorFrom(locals)`, never `locals.tenantId`.**
Visibility policies use the role and the identity of the user. Thus a bare
tenant id returns zero rows. No error occurs. The result is only a wrong
number ([L42](docs/10-lessons-learned.md)). `./check`
enforces this rule.

**An audit entry makes a copy of a value. Protect the copy in the same
way.** `audit_log` had no RLS policy. Thus, when the application started to
audit pay changes, every employee could read every pay change in the
organization ([L55](docs/10-lessons-learned.md)).

Now `audit_log` has a visibility policy. HR, payroll, an auditor and the
owner see all entries. All other users see only entries about themselves, or
entries that record their own actions. For each new write, ask: **who can
read what this writes?**

**Every write is classified in `apps/web/src/lib/server/audit/register.ts`,
and `./check` fails on one that is not.** The rule below was only prose for
months, and 3 of 26 actions obeyed it ([L54](docs/10-lessons-learned.md)).
Each audit entry obeys these rules:

- `changes` is `Record<string, {from, to}>` with STRING values. A JSON number
  returns as a float64, and nobody can correct this table.
- `action` comes from a closed set.
- `entityType` names the table.
- Prose goes in `reason`. Never mix prose with values, because redaction
  matches field NAMES.
- `audit.diff()` records only the fields that changed. Do not hide the one
  changed field among twenty unchanged fields. In a table that nobody can
  prune, that is the same as no record.

**If someone can later ask for the reason for a write, the write records an
audit entry in the SAME transaction.** Use `$lib/server/audit`. Examples are
approvals, pay changes, role grants and erasures. If the application writes
the entry afterwards, or as best effort, the trail records only what the
application believed. Then the trail and the real data become different
exactly when the difference is important ([L40](docs/10-lessons-learned.md)).

`audit_log` allows only INSERT and SELECT. A correction is a new row. Pass
the fields that changed, never a dump of the row. Nobody can delete from the
table, so all data that you write there stays there forever.

**Enforce a flag that controls who sees a value at the point where the code
READS the data. Keep the controlled value out of the returned type.**
Examples are `is_anonymous`, the `status` of a review, and `pii.reveal`. In
each example, the value is in the row next to the flag. Thus a page that
renders the value makes the promise false, with no error
([L39](docs/10-lessons-learned.md)).

Resolve the flag in SQL (`CASE WHEN ... THEN NULL`), not after the query. If
a repository gets the value and then removes it, the value is already in a
result set, a log line and a heap dump. Also add the fixture row that
triggers the rule. If you do not add it, no test examines the rule.

---

## PII and secrets

**Encrypt PII in the application, never in SQL. Always encrypt it through
`$lib/server/pii`.** `sealField` and `openField` are the only write path and
the only read path. They bind each ciphertext to
`tenant | table | column | row`. Thus nobody can move a value between rows
or tenants. If a call site assembles that binding itself, it will eventually
make an error.

- **Never add a plaintext PII column.** `./check` has four `pii/*` rules, and
  they fail on exactly this. A new PII column must have encryption, or it must
  be in `_pii_pending` in `verify-invariants.sql` with a reason. That is a
  committed literal, as all other exemptions here are.
- **Never index a PII column.** A btree keeps each value readable in its data
  pages. If you drop the column, the data pages still hold the values.
- **Keys are per EMPLOYEE.** GDPR Art. 17 gives a right to each individual. A
  key for the full tenant cannot satisfy that right. Erasure destroys the key.
  The destroyed key also makes the backups unreadable, and
  `UPDATE ... SET NULL` never changes the backups.
- **Do not implement the `DERIVE_KEY(org_prefix + org_4digit_code)` of the
  spec.** It has approximately 13 bits, and both inputs are in the database
  that it protects. It is a *label* for the key. Refer to
  [docs/13-pii-encryption.md](docs/13-pii-encryption.md).
- **Keep the backup of `PRIVATE_PII_KEK` separate from the database.** If the
  key is lost, all encrypted fields become unreadable. This is intentional.

**`PRIVATE_SUPABASE_SERVICE_ROLE` bypasses all of RLS:** every RLS policy,
every tenant predicate and every visibility rule. Code **imports** it. Code
never puts it on `locals`. Before, it was on `event.locals` for every request.
Then any handler could get it with one line of code, and it looked like
ordinary state of the request.

`./check`'s `service role quarantined` step holds a committed list of the
five files that may import it. None of these files is under `(app)`. The
step fails on a new importer and on a removed justification. It also fails
on any `.svelte` file that uses the key at all, because that would send the
key to the browser. Never put the key in a `PUBLIC_` variable. SvelteKit
sends `PUBLIC_` variables to the browser by design.

**Only the finance function can see accounting rows.** `invoices`,
`payments`, `bank_accounts` and twelve more tables have RESTRICTIVE RLS
policies with the role as the key. `finance_admin`, `auditor` and the base
admins can read. `auditor` does not write.

The application already refused, but RLS did not. Thus one absent
`requireCan` was sufficient to disclose the full ledger of the organization.
`row-visibility.test.ts` asserts both halves: the refused actor gets zero
rows, AND the permitted actor still gets rows.

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

Studio is at http://127.0.0.1:54323. The local stack captures all outbound
mail at http://127.0.0.1:54324.

Local environment values are in `apps/web/.env.local`, and the application
loads them automatically. Production values are in `apps/web/.env.prod`. The
application does **not** load this file automatically, on purpose. Thus an
accidental `npm run dev` cannot write to production. Git ignores both files.

