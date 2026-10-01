# Performance Tenant — a Large, Realistic Second Tenant

**Status:** phases 1 and 2 built (2026-10-01): every `SCALE_SENSITIVE` table
has rows. Phase 3 (measurement) not started.

**Goal:** a permanent, reproducible second tenant the size of a real
1,000-person firm two years into using the product, loaded on demand into the
local stack, so the whole app can be measured at scale and its slow parts found
— per page, per kind of user, and per query.

---

## What exists, and why it is not enough

- **`scripts/loadtest.mjs`** (deleted once this was built) cloned ONE
  existing Northwind row N times per `SCALE_SENSITIVE` table. Three problems
  for this purpose:
  - every clone of a child row keeps its parent's foreign key, so 200,000
    invoice lines land on one invoice and new invoices get none
    ([L86](./10-lessons-learned.md));
  - every clone is identical, so filters, sorts and index selectivity behave
    nothing like real data;
  - it writes into Northwind — the fixture every unit suite asserts exact
    counts against — and must be reverted afterwards.
- **`dedicated-demo-tenant.sql`** (Fenwick) is deliberately tiny.
- **`apps/web/scripts/measure-render-times.mjs`** measures server render time
  per page, as one owner, against Northwind ids. It is the measurement half
  this work extends.

Reused: `loadtest.mjs`'s refusal to run anywhere but the local stack, the
`SCALE_SENSITIVE` register in `verify-query-scale.mjs` (read, not restated),
`sealField` for encrypted columns, and `measure-render-times.mjs`.
`loadtest.mjs` itself is deleted rather than kept as a deprecated second way.

## Where it lives

**Its own Postgres cluster** (`packages/database/perf/cluster.sh`: port
54349, database `kaaj_perf`, data in `~/.kaaj/perf-pgdata`), migrated from
the same files as the shared database. Planned first as a tenant inside the
shared database; changed during the build, because:

- `supabase db reset` — run by any session in any worktree — recreates the
  Supabase server and drops **every** database on it, so a permanent store
  cannot live there;
- millions of generated rows must never sit under another session's
  `./check` or unit tests.

This is ADR-009's dedicated tier, exactly as Fenwick's demo tenant
(`provision-dedicated-db.sh`): the tenant's business data lives in its own
database, while sign-in stays in the shared one. Measuring through the app
(phase 3) registers the tenant with the control plane the same way. What it
gives up: a large tenant *among* small ones in shared tables; per-tenant
query cost — the `tenant_id`-leading indexes, the RLS policy subqueries —
is the same.

```
pnpm db:perf:cluster up|rebuild|status|stop          the cluster itself
pnpm db:perf seed [--scale=1] [--as-of=2026-10-01]   build the tenant (clean, deterministic)
pnpm db:perf status                                  row counts per table, vs the model
pnpm db:perf verify                                  invariants + sealed values open
pnpm db:perf drop                                    remove the tenant
pnpm db:perf measure                                 pages × actors, slowest queries (phase 3)
```

`--scale=0.05` gives a 50-person version for a quick run.

## How it is generated

1. **Parents first; children fanned out from their parents** with
   `generate_series` joined to the parent rows — each invoice gets 1–10 lines,
   each project 5–400 tasks. Never cloning one row (L86).
2. **Deterministic.** Stable ids — `md5('perf:<kind>:<n>')::uuid` — and
   hash-based pseudo-randomness, so two runs produce identical data and the
   measurement script can name specific records.
3. **Skewed, not uniform.** A few customers carry hundreds of invoices and
   most a handful; a few projects are huge; ticket volume clusters in IT and
   Customers. Uniform data hides index-selectivity problems.
4. **Anchored on `as_of`**, captured at generation time and stored; activity
   spans the two years before it, so "last 30 days" views are populated and
   nothing depends on a literal date.
5. **Encrypted columns are really encrypted**, through `sealField` from Node,
   with per-employee keys — decryption on the employee pages is a real
   per-row cost. Bulk volume is SQL; only sealed columns go through Node.
6. **The app's invariants hold on its own data:** journal entries balance;
   invoice totals equal their lines; denormalised counters are recomputed
   (L58); ticket numbers follow each area's sequence; search triggers fire.
7. **`ANALYZE`** at the end — without it every measurement is meaningless.

## Volume model (scale = 1)

A 1,000-person professional-services firm, 4 countries (US, UK, India,
Germany) and 4 currencies, 24 months in.

### Bounded by the organisation

| Table | Rows | Basis |
|---|---|---|
| employees | 1,000 (+60 who left) | the firm |
| firm_locations / departments / job_titles / job_levels | 12 / 25 / 60 / 8 | the firm's shape |
| employee groups / memberships | 40 / 3,000 | |
| ticketing business areas / categories | 8 / 40 | the default areas |
| chart_of_accounts / bank_accounts | 250 / 12 | per currency and entity |
| custom_field_definitions | ~60 | company, contact, deal, ticket, project, task |

### Grows with time (`SCALE_SENSITIVE`)

| Table | Rows | Basis |
|---|---|---|
| customers (companies) | 3,000 | 60% active, 25% prospect, 15% inactive/churned |
| customer_contacts | 9,000 | ~3 per company, skewed |
| crm_deals | 12,000 | ~500 a month |
| crm_activities | 60,000 | ~5 per deal |
| projects | 1,500 | |
| tasks | 60,000 | 5–400 per project, skewed |
| pm_task_comments | 40,000 | |
| time_tracking_entries | 480,000 | 800 billable staff × ~250 days × 2 years, ~1.2 a day |
| time_tracking_timesheets | 104,000 | weekly per person |
| ticketing_tickets | 40,000 | |
| ticketing_updates | 200,000 | ~5 per ticket |
| ticketing_attachments / ticket_tasks | 20,000 / 30,000 | |
| custom_field_values | ~250,000 | every record of a type with fields |
| invoices / invoice_lines | 30,000 / 120,000 | |
| payments / payment_allocations | 25,000 / 28,000 | |
| bills / bill_lines | 12,000 / 40,000 | |
| journal_entries / journal_entry_lines | 70,000 / 210,000 | one per invoice, bill and payment, balanced |
| bank_transactions | 50,000 | |
| expenses | 25,000 | |
| hr_attendance | 480,000 | per person per working day |
| hr_time_off_requests | 12,000 | |
| hr_reviews / hr_goals / hr_feedback | 4,000 / 5,000 / 10,000 | |
| payroll_run_employees | 24,000 | 24 monthly runs |
| documents | 20,000 | metadata only |
| team_chat_messages | 200,000 | |
| audit_log | 150,000 | |

About **2.6 million rows**. Every `SCALE_SENSITIVE` table gets rows:
`pnpm db:perf status` lists any left empty, because an empty table renders an
empty page and an empty page is an unmeasured page.

### Phase 1 as built (scale 1, as of 2026-10-01)

1,843,671 rows in about 3 minutes on a quiet machine (12 under heavy load from
other sessions — the time entries dominate). Where it differs from the model,
the build is the more realistic figure:

| Table | Built | Note |
|---|---|---|
| customers / contacts | 3,000 / 9,693 | |
| crm_deals / crm_activities | 12,000 / 53,807 | |
| projects / tasks / comments | 1,500 / 55,136 / 36,488 | |
| time_tracking_entries / timesheets | 417,679 / 55,981 | only delivery staff log time — about 560 people, not 800 |
| ticketing_tickets / updates | 40,000 / 182,376 | |
| custom_field_values | 249,779 | on companies, contacts, deals, tickets, projects and tasks |
| invoices / lines | 30,000 / 117,455 | |
| payments / bills / bill lines | 35,857 / 12,000 / 30,792 | payments include supplier payments |
| journal_entries / lines | 77,196 / 197,760 | every one balanced natively and in base |
| bank_transactions / expenses | 40,857 / 25,000 | |

`SCALE_SENSITIVE` tables still empty, for phase 2: `hr_attendance`,
`hr_time_off_requests`, `hr_reviews`, `hr_goals`, `hr_feedback`,
`hr_change_requests`, `hr_onboarding_tasks`, `hr_survey_responses`,
`hr_employee_documents`, `documents`, `team_chat_messages`, `audit_log`,
`app_error_log`, `jobs`, `invoice_credits`, `bank_statement_imports`,
`pm_task_attachments`, `pm_automation_executions`,
`ticketing_ticket_reference_links`.

`pnpm db:perf verify` checks, on every build: journals balance in both
currencies; invoices and bills equal their lines; payments equal their
allocations; every issued document has its journal entry; denormalised
counters equal their rows; time entries point at their own project's tasks;
ticket counters match; nothing is dated after `as_of`; and a sample of
sealed values opens with the app's own key handling.
`packages/database/perf/fingerprint.sql` prints the same line for two builds
at the same scale and date.

## Already found while building

Before any measuring, the generator surfaced two scan-per-insert patterns
that grow with the tenant:

- `app.next_time_entry_number()` takes `max()` over a regex of `entry_id`
  across every time entry in the firm — ~420,000 rows per new entry.
- `nextSequenceNumber` (invoices, journal entries, payments) does the same
  over `LIKE 'PREFIX-%'`.

## Who is measured

Owner-only timings miss the slowest paths: the owner short-circuits policies
such as `reads_all_tickets()`, while a plain employee pays for every `EXISTS`
in the ticket, project and custom-field policies. Perf-tenant logins
(`perf.<actor>@brightline.example`, password `devpassword`, local only;
`_perf.actors` lists them):

| Actor | Why |
|---|---|
| owner | the fast path, as a baseline |
| finance admin | accounting at volume |
| HR admin | employees, attendance, time off |
| IT admin | every ticket, by role |
| auditor | reads everything, writes nothing |
| sales manager | CRM at volume |
| line manager (the most reports) | manager-scoped employee and time views |
| plain employee | pays for every row policy |

## Measurement

`pnpm db:perf measure [--repeats=3] [--actors=owner,employee] [--top=25]`
(`packages/database/perf/measure.mjs`), against a build
(`pnpm --filter @kaaj/web build`); it starts its own `vite preview` on 5178.

- **Registered for the run only.** The tenant, its `tenant_registry` row
  (dedicated tier, a `sealed:v1:` ref to the perf cluster as `app_user`), the
  actors' `tenant_users` rows and their `auth.users` / `auth.identities` are
  written to the shared database at the start and deleted in a `finally` —
  and deleted first, in case an earlier run died. A permanent row would make
  every session's `./check` depend on the perf cluster being up. The ref is
  sealed, not an environment-variable name, so any session that meets the
  row mid-run can open it.
- **Every `(app)` page, as every actor**, discovered from `src/routes/(app)`
  (`apps/web/scripts/page-timing.mjs`, shared with
  `measure-render-times.mjs`). Each `[param]` opens the *largest* record of
  its kind — the busiest ticket, the project with most tasks, the invoice
  with most lines.
- **Per actor, `pg_stat_statements` is reset before and read after**, so the
  report shows what each kind of user costs the database as well as a merged
  ranking by total and mean time. A run in which no `app_user` statement
  reached the perf cluster stops: routing that fell back to the shared
  database would time fast, empty pages.
- **The machine's load average** at the start and end is printed with the
  results. Timings from a machine shared with other builds are only
  comparable with each other.
- Raw results go to `~/.kaaj/perf-measurements/<timestamp>.json`.

## Interaction with `./check`

The tenant lives in its own cluster, so `./check` and the unit suites never
see its rows. The one overlap is a `measure` run: while it runs, the shared
database holds a dedicated-tier registry row, which the "dedicated targets"
step resolves and checks like Fenwick's. It passes while the perf cluster is
up and migrated to the same version, and the row is gone when the run ends.

## Phases

1. **Generator core and the first half of the app:** organisation, auth and
   actors, groups; CRM with custom fields; projects, tasks and time;
   ticketing with custom fields; accounting. `status`, `drop`, `ANALYZE`, the
   coverage check, and the `./check` evaluation.
2. **The rest:** HR (attendance, time off, reviews, goals, feedback,
   onboarding), payroll runs, documents, chat, audit log.
3. **Measurement:** the perf profile in `measure-render-times.mjs`, the
   `pg_stat_statements` ranking, and the baseline write-up.
