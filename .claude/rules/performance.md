---
paths:
  - "apps/web/src/lib/server/**/*.repo.ts"
  - "apps/web/src/routes/**/+page.server.ts"
  - "apps/web/src/routes/**/+server.ts"
  - "apps/web/src/lib/server/pickers.ts"
  - "apps/web/src/lib/server/db/paged.ts"
  - "apps/web/src/lib/components/Pagination.svelte"
  - "packages/database/perf/**"
  - "scripts/verify-query-scale.mjs"
  - "scripts/verify-no-loop-queries.mjs"
---

# Performance rules

Claude Code loads this file when it reads a repository, a page `load()`, the
perf tenant or a scale register. Read it before you write a query that a page
runs.

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

**The target for the first load of the application is less than 100ms, and
`./check` fails the build if the load takes more time.** The load starts with
a signed-in user and ends when `/employees` is fully loaded. The step uses the
MEDIAN of five samples. Before the five samples, it does one warm-up load and
ignores its result. One latency sample is not a measurement.

**CAUTION:** Until 2026-10-02 this step timed the SIGN-IN page, not
`/employees` ([L120](docs/10-lessons-learned.md)), and the target was 50ms.
The 21.8-25.4ms (idle) and 25.9-46.0ms (busy) once recorded here are
sign-in page numbers. A full first load of `/employees`, from the sign-in
POST to the `load` event, measures 74-88ms idle and about 97ms on a busy
machine: hence 100ms. This step runs when the machine is busy: immediately
after `build` and the unit suites. If the code becomes slower, every sample
becomes slower, so the median also fails. The median removes the effect of a
short delay in the scheduler, which caused approximately one run in four to
fail. If the step fails, the error shows all five samples.

The 100ms target is larger than the 20ms server target on purpose. It is the
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

No automated step or test examines the shape of a query. Two pages do not
obey this rule today, and each is a known exception, not a precedent:

- `/crm/pipeline` ranks every deal to show 20 for each stage.
- `/payroll/export` reads every time entry and time-off day of the period
  (at most 31 days) for the whole firm, on every page of its review, and
  pages the result in JavaScript. The export must find every problem before
  it offers the file, so the whole period is the subject; a page of
  employees is only the view. The budget records the cost (22,955 data
  pages at the perf tenant's size, against about 400 for a comparable
  list). A cheaper shape computes the problems once per period and pages
  the employees in SQL.

**Regenerate the page budget only on purpose, and commit it with the change
that moved it.** `packages/database/perf/budgets.tsv` records the cost of each
page to the database, for each perf actor. The cost is the statements that run
and the data pages that Postgres reads. Unlike time, these are the same on each
machine. `pnpm db:perf regress --update` writes the file again. Then a page that
costs more shows as a diff that a person reviews.

**CAUTION:** Do not run `--update` only to make a failed push pass. First, read
which page moved, and find the reason. This is the snapshot rule again, at a
higher level.

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
