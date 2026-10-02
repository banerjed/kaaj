---
paths:
  - "supabase/**"
  - "packages/database/**"
  - "apps/web/src/lib/server/**/*.repo.ts"
  - "apps/web/src/lib/server/security/**"
  - "scripts/verify-*.mjs"
---

# Database rules

Claude Code loads this file when it reads a migration, a database package file, a
repository or a verification script. Read it before you design a table or an RLS
policy, also if no such file is open yet.

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

**If another session works in a parallel worktree, do not reset or snapshot
the shared local database. Build a scratch database with `ci-database.sh`
and point `DATABASE_URL` at it** ([L122](docs/10-lessons-learned.md)). Every
worktree's tests use the one local stack. A migration that another branch
applied there goes into your snapshot, and `--generate` cannot tell the two
apart. Read the diff of `00-tables.txt` before you commit it.

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
