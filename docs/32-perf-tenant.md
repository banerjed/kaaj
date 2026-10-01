# Performance Tenant — a Large, Realistic Second Tenant

**Status:** proposed (2026-10-01), not built.

**Goal:** a permanent, reproducible second tenant the size of a real
1,000-person firm two years into using the product, loaded on demand into the
local stack, so the whole app can be measured at scale and its slow parts found
— per page, per kind of user, and per query.

---

## What exists, and why it is not enough

- **`scripts/loadtest.mjs`** clones ONE existing Northwind row N times per
  `SCALE_SENSITIVE` table. Three problems for this purpose:
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
`sealField` for encrypted columns, and `measure-render-times.mjs`. Once this
exists, `loadtest.mjs` is superseded and its header says so.

## Where it lives

A normal **shared-tier** tenant in the local `postgres` database, beside
Northwind:

- sign-in works as for any tenant (Supabase Auth and the token hook read
  `auth.users`/`tenant_users` in this database);
- it measures the path most tenants take — `tenant_id`-leading indexes with
  one large tenant among small ones, RLS policy subqueries over large tables.

It is **never** in `[db.seed] sql_paths`: `supabase db reset` stays
Northwind-only and fast. It is loaded explicitly and removed by a reset (or
`drop`). The generator takes a target URL, so the same data can later be
loaded into a dedicated-tier cluster for comparison.

```
pnpm db:perf seed [--scale=1] [--as-of=2026-10-01]   build it (minutes, not seconds)
pnpm db:perf status                                  row counts per table, vs the model
pnpm db:perf drop                                    remove the tenant (DELETE cascades from tenants)
pnpm db:perf measure                                 pages × actors, plus the slowest queries
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

About **2.6 million rows**. Every `SCALE_SENSITIVE` table gets rows: a check
fails if one is left empty, because an empty table renders an empty page and
an empty page is an unmeasured page.

## Who is measured

Owner-only timings miss the slowest paths: the owner short-circuits policies
such as `reads_all_tickets()`, while a plain employee pays for every `EXISTS`
in the ticket, project and custom-field policies. Perf-tenant logins
(`@perf.example`, password `devpassword`, local only):

| Actor | Why |
|---|---|
| owner | the fast path, as a baseline |
| finance admin | accounting at volume |
| HR admin | employees, attendance, time off |
| IT admin | every ticket, by role |
| auditor | reads everything, writes nothing |
| sales manager | CRM at volume |
| line manager (40 reports) | manager-scoped employee and time views |
| plain employee | pays for every row policy |

## Measurement

- `measure-render-times.mjs` gains a perf profile: perf-tenant ids for each
  `[param]`, the actor list, and a report per page per actor with server
  time and response size — size catches the unpaged list.
- `pg_stat_statements` (shipped with Supabase) is reset before a run and
  ranked after it by total and mean time, so the report names the query, not
  just the page.
- The first full run is written up as a baseline: the slowest pages and
  queries, and what each needs (an index, paging, a rewritten policy).

## Interaction with `./check`

To be measured, not assumed: run `./check` with the perf tenant loaded. If it
passes, the suites are genuinely tenant-scoped and the tenant may stay loaded.
If not, `./check` gains a first step that refuses while the perf tenant is
present and says how to remove it — never a confusing failure later.

## Phases

1. **Generator core and the first half of the app:** organisation, auth and
   actors, groups; CRM with custom fields; projects, tasks and time;
   ticketing with custom fields; accounting. `status`, `drop`, `ANALYZE`, the
   coverage check, and the `./check` evaluation.
2. **The rest:** HR (attendance, time off, reviews, goals, feedback,
   onboarding), payroll runs, documents, chat, audit log.
3. **Measurement:** the perf profile in `measure-render-times.mjs`, the
   `pg_stat_statements` ranking, and the baseline write-up.
