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

[docs/35-check-steps.md](docs/35-check-steps.md) lists each step, what it
proves, and its count. Correct the counts in that file when they change.

### Deploying to production

The steps and the production-only tools are in the `deploy-production` skill
([.claude/skills/deploy-production/SKILL.md](.claude/skills/deploy-production/SKILL.md)).
**WARNING:** Read that file before you run any command against production.

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
  each step. But no code calculates the pay of an employee. Every gross, tax
  and net amount comes from the fixture.
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

The rules for this section are in [.claude/rules/svelte-ui.md](.claude/rules/svelte-ui.md).

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

That file teaches the pattern. This file, the files in `.claude/rules/` and
`./check` are still the authority on the details.

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
| A rule that changes how you *write* code here: a convention, a prohibited pattern, a step that `./check` must have | the file in **`.claude/rules/`** for its area (see `Rules that are easy to get wrong`). If the rule applies to each area, also add one line to `Rules that apply everywhere` in this file |
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
line that every session must read. A file in `.claude/rules/` loads only for
its `paths`, so put a rule there if it belongs to one area. If an entry is not
true now, delete it.

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

These rules are in separate files. Claude Code loads each file when it reads a
file that matches the `paths` of that file. If a task is in one of these areas,
read the file before you start, also if no matching file is open yet.

| File | Area |
|---|---|
| [.claude/rules/database.md](.claude/rules/database.md) | migrations, the snapshot, RLS policies, foreign keys, counters, `gl_daily_balances`, the disclosure matrix, registers and exemptions, the fixture |
| [.claude/rules/server.md](.claude/rules/server.md) | `load()` guards, form actions, typed `tx` queries, errors, shared predicates and vocabularies |
| [.claude/rules/performance.md](.claude/rules/performance.md) | render targets, pagination, the 100-row rule, query shape, the page budget, scale classification |
| [.claude/rules/svelte-ui.md](.claude/rules/svelte-ui.md) | the UI reference, badges, themes, contrast, Svelte 5 runes |
| [.claude/rules/forms.md](.claude/rules/forms.md) | `FormReader`, query strings, constraint refusals, marked fields |
| [.claude/rules/money-time.md](.claude/rules/money-time.md) | money, timestamps, dates, durations, `Date.now()` |
| [.claude/rules/tenancy-audit-pii.md](.claude/rules/tenancy-audit-pii.md) | `withTenant`, the audit log, disclosure flags, PII, the service role, accounting RLS |
| [.claude/rules/testing.md](.claude/rules/testing.md) | tests as the refused actor, e2e specs, CI workflows, the test inventory |

### Rules that apply everywhere

These rules have their full text in the files above. They are here because
they apply to each area:

- Money is a `string` from the database to the browser and back. Do arithmetic
  on money in SQL, never in JavaScript.
- Render a `timestamptz` in the timezone of the office. Format a `DATE` in UTC.
- Every `withTenant` takes `actorFrom(locals)`, never `locals.tenantId`.
- A protected column NEVER falls back to an unprotected one.
- Every field that an action writes goes through `FormReader`.
- Every write is classified in the audit register. An audit entry goes in the
  SAME transaction as the write.
- Encrypt PII only through `$lib/server/pii`.
- On a request path, a query must not read more rows than it returns, apart
  from a capped count.
- After each change to an RLS policy, run `./check --db` immediately.

**A code review records the last COMMIT SHA that it examined, in
[docs/33-code-review-log.md](docs/33-code-review-log.md).** Several sessions
commit here at the same time. Thus, "everything since Tuesday" is a range
that moves: it covers some work again, and it skips other work. The log holds
the `git diff <sha> HEAD` command for the next run. It also holds the list of
rules that a review is FOR. These are the rules that CLAUDE.md states and
that `./check` cannot see. `./check` is green on each commit, so if you run it
again, that is not a review.

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

The rules for this section are in [.claude/rules/performance.md](.claude/rules/performance.md).

---

## Svelte

The rules for this section are in [.claude/rules/svelte-ui.md](.claude/rules/svelte-ui.md).

---

## Forms

The rules for this section are in [.claude/rules/forms.md](.claude/rules/forms.md).

---

## Time

The rules for this section are in [.claude/rules/money-time.md](.claude/rules/money-time.md).

---

## Money

The rules for this section are in [.claude/rules/money-time.md](.claude/rules/money-time.md).

---

## Tenancy, audit and disclosure

The rules for this section are in [.claude/rules/tenancy-audit-pii.md](.claude/rules/tenancy-audit-pii.md).

---

## PII and secrets

The rules for this section are in [.claude/rules/tenancy-audit-pii.md](.claude/rules/tenancy-audit-pii.md).

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

