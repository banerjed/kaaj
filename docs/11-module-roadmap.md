# Module Roadmap

**Status:** active
**Created:** 2026-08-29
**Last verified against the code:** 2026-09-04, at `78585ec`

Phases 0–2 of [09-build-plan.md](./09-build-plan.md) are done: the shell, the
data layer, the firm profile and the employee profile. This document covers what
is left, and the order to build it in.

31 of the 116 repositories `api-surface.md` enumerates exist. That ratio still
overstates the work remaining — the hard parts (tenancy, the transaction
wrapper, formatting, the form and table patterns, authorization, the audit
register) are built and every module below reuses them.

**Keep the date above current.** This file went fifteen commits stale once: it
claimed 11 repositories when there were 30, and listed row-level visibility as
"not started" after it had shipped. A roadmap nobody can trust is worse than no
roadmap, because it is read as fact. The check is cheap — `find` the repos,
`grep -rl "export const actions"` the routes — and it is the difference between
a plan and a wish.

---

## The distinction that organises this file

Every module below is in one of three states, and the middle one is where most
of the work now sits:

| State | Means |
|---|---|
| ✅ **done** | Read side and write side, with the writes classified in the audit register |
| 📖 **read side** | Pages render real fixture rows. `export const actions` is **absent** — nothing can be changed |
| ⬜ **not started** | No repository, no route |

📖 is not a half-finished ✅. A read side is a complete, verified deliverable —
it proves the query, the row policy, the formatting and the page. What it does
not prove is anything about a write, and the write is where the invariants are.

---

## Ordering principle: follow the foreign keys

Modules are built in dependency order, not in specification order. Every module
below reads something the one above it writes, and building out of order means
either stubbing data or rewriting a page once the real source appears.

```
firm profile ──► employee profile ──► compensation ──► payroll
                        │                                 ▲
                        ├──► HR (time off, attendance) ────┘
                        │
                        ├──► time tracking ──► projects ──► accounting
                        │
                        └──► change requests · user groups · ticketing
```

Two consequences worth stating:

- **Payroll is last of the people modules, not first.** It reads compensation,
  time off, attendance and the holiday calendar. Built early it would be built
  against fixtures and then rewritten.
- **Accounting can start any time**, because it depends on almost nothing else.
  It is scheduled late only because it is large, not because it is blocked.

---

## Phase 3 — Compensation ✅ done

`docs/module-compensation.md` · 6 tables, 5 repositories.

| Table | Page |
|---|---|
| `compensation_base` | ✅ `/compensation/[employeeId]` → the audited `raise` action |
| `compensation_allowances` | ✅ same tab |
| `compensation_variable`, `compensation_equity` | ✅ same tab |
| `compensation_work_schedules` | ✅ shown on the tab |

**The write is the module's exemplar.** `raise` is the first action in the
codebase that closes the row it supersedes and writes its audit entry in the
same transaction, with the OLD and NEW value of every field that moved. Copy it
rather than inventing a second idiom — it is the shape every action below
should have.

`compensation_premiums` has no fixture rows and no UI yet — shift differentials
and on-call, which belong with time tracking (Phase 5) where the hours they
attach to actually live.

**The hard part was effective dating**, and it is solved: `addRaise` refuses a
same-date, backdated or overlapping write through a typed `RaiseRefused` rather
than corrupting the history. There is no constraint preventing overlap, so the
rule lives in the repository with a test.

**Money never converts.** Same rule as job levels and benefits (BR-FP-006).

---

## Phase 4 — HR (mostly done)

`docs/module-hr.md` · 19 tables, 8 repositories. The largest module, and the one
with the most user-facing surface.

1. **Time off** — ✅ **done.** `/time-off` renders requests and balances, and
   the `decide` action approves or refuses with an audit entry. The balance is
   computed from the ledger rather than stored as a running total.

2. **Attendance** — 📖 **read side.** `/attendance` shows the timesheet in each
   office's own zone, filtered by date range and status, with the hours
   identity tested.

   `totals()` in the repository is built and tested but not yet on a page — it
   is what US-HR-022 ("my timesheet for this pay period") needs, and it exists
   so the summing stays in SQL when that lands.

   **Deferred, deliberately, and not started:** clock in/out (US-HR-021) and
   corrections (US-HR-025). Overtime is *stored*, not computed:
   `firm_payroll_policies` has no rows, so deriving OT from the policy Phase 1
   built has nothing behind it yet. The holiday tie-in — flagging attendance on
   a day the office observes as a holiday — is also not built.

3. **Performance** — ✅ **done.** `/performance` shows the cycle, your own
   review, your goals, and — for a reviewer or HR — the reviews they may see.
   Writing a review is draft → submitted → acknowledged, one way only; each
   author writes their own half, and only while it is a draft. Both transitions
   write an audit entry in the same transaction.

   **The rule that matters here: a manager's assessment is withheld from its
   subject until it is submitted.** Both halves live in one row and RLS filters
   by tenant, so the repository is the only control — which is why the
   redaction is there and not in the page.

4. **Feedback** — ✅ done. `hr_feedback`. The author of an anonymous note is
   never returned, resolved in SQL so the id never leaves the database (L39).
   `visibility` and `is_anonymous` are separate questions, both constrained.

5. **Onboarding** — 📖 read side. `/onboarding` renders a hire's tasks, and
   template selection is most-specific-wins and deterministic; without that,
   which plan a hire got would depend on physical row order.

   **Still ahead:** *generating* a plan for a hire — a write, and one that
   should record WHICH template was chosen, or nobody can explain later why a
   hire missed a step.

6. **Surveys** — ⬜ not started. `hr_surveys` / `hr_survey_responses`.

**Watch for:** accrual arithmetic in a leap year; a request spanning a holiday
in one office and not another; and approval state that must not be inferable
from a query alone — it needs an explicit audit trail.

---

## Phase 5 — Time Tracking (slice 1 done; timesheets and expenses ahead)

`docs/module-time-tracking.md` · the tables (`time_tracking_entries`,
`time_tracking_hourly_rates`, `time_tracking_timesheets`,
`time_tracking_billable_expenses`) turned out to already exist — a schema
coverage pass created them from the module spec with no application code on
top, which is what "not started" actually meant here.

**`/attendance` is not this module.** `hr_attendance` belongs to HR, and the
existence of an attendance page has twice been read as Phase 5 having begun.
Manual time entries are, now — but timesheets and billable expenses are not.

1. **Manual time entries — ✅ done.** `/time-tracking` renders and writes:
   log a draft against a project (and optionally a task), submit, approve or
   reject. `hourly_rate` resolves from `time_tracking_hourly_rates`
   (effective-dated on the entry date, falling back to the project's own
   rate — never the employee's `_pvt` default) at creation; `billable_amount`
   is snapshotted only at approval, through the office's
   `firm_payroll_policies.time_rounding`. `tasks.actual_hours` /
   `billable_hours` / `non_billable_hours` and `projects.actual_hours`
   recompute in the same transaction, never incremented (L58), guarded by
   `staleHours()`.

   **The hard part was rounding**, and it is solved: `hours` is stored raw
   and never rewritten; only the derived `billable_amount` is rounded, at
   approval rather than at entry time, because the applicable policy can
   change between the two and there is no raw figure to recompute from if it
   snapshotted early.

2. **Timesheets** — ⬜ not started. `time_tracking_timesheets` exists but
   `period_start`/`period_end` are `TEXT`, not `DATE` — fix that before
   building a UI on top, or every date comparison is a string comparison.

3. **Billable expenses** — ⬜ not started. `time_tracking_billable_expenses`
   exists, unused.

4. **Real-time timers** — ⬜ not started, deliberately deferred. Manual entry
   covers the billing need; a start/stop timer is a UI feature on the same
   table, not a schema change.

**Found and resolved: a duplicate table.** `pm_task_time_entries` was a
second, narrower time-entry table (task/project both `NOT NULL`, no
timesheet, no submit step) — a project-management coverage pass that didn't
know about the time-tracking module's own tables. It had one fixture row and
no application code either way, and nothing else in the schema referenced it
(no FK pointed at it). `time_tracking_entries` is the one this slice built on
(richer, matches the module spec, and its nullable `project_id`/`task_id` is
required by a real fixture row — a non-project entry `pm_task_time_entries`
could not represent). Dropped in `20260903160000_drop_duplicate_time_entry_table.sql`.

---

## Phase 6 — Payroll (lifecycle done; the calculation is not)

`docs/module-payroll.md` · 10 tables, 2 repositories
(`payroll_runs`, `payroll_pay_schedules`). India-specific tables
(`payroll_india_salary_structure`, `payroll_india_tax_declarations`) are
untouched.

`/payroll/runs`, `/payroll/runs/[id]` and `/payroll/payslips` render, and the
run **lifecycle** now writes: open a draft, calculate, approve, finalize,
cancel. Every transition is audited in the same transaction, and the header
totals are recomputed from `payroll_run_employees` on every one of them
(L58's rule, applied to money rather than to a task count).

**What is deliberately NOT built: computing anybody's pay.** Gross, taxes and
net per person need per-jurisdiction tax tables that do not exist here —
`payroll_tax_rates` is unpopulated and the India structures are untouched.
Inventing them would put a correct-*looking* number on a payslip, which is the
failure mode this codebase keeps being bitten by. Lines come from the fixture;
nothing in the product writes one. **That is the next slice of this phase.**

Four CHECK constraints back the transitions, and each was observed refusing a
bad write before being relied on. Two things they do *not* give, both enforced
in the repository instead: **direction** (the database is equally happy with
`finalized → draft`) and the **NULL calculator** case (separation of duties
fires only when both `calculated_by` and `approved_by` are set, so approving a
run nothing calculated slips past it).

**This is the module where correctness is not negotiable.** Three rules from
CLAUDE.md apply directly:

- Custom fields must never feed payroll calculations.
- `@kaaj/validation`'s 33 country-specific validators exist because a wrong tax
  identifier on a payslip is not a cosmetic bug.
- Money inside JSONB is a string. `9a3c922` fixed this once, on the read side;
  a write must not put a JSON number back, and `./check` cannot see inside a
  JSONB column to catch it.

The pay-date projection from Phase 1 is already tested and reused here.

---

## Phase 7 — Projects and Time-to-Cash

`docs/module-project-management-v2.md`, `docs/module-accounting.md` ·
11 + 18 tables, 3 repositories.

**Projects** — ✅ **done.** `/projects` and `/projects/[id]` render the board
and now write to it: create a project, edit it, add a task, move a task across
statuses. `projects.repo.ts` covers `projects` and `tasks`; objectives and
dashboards are not built.

The counters are the thing that had to be got right, and are:
`task_count` / `completed_task_count` are **recomputed** in the same
transaction as every task write, never incremented, so a row that has already
drifted is repaired rather than carried forward ([L58](./10-lessons-learned.md)).
`staleCounters()` is now the regression guard — 18 write tests, six of which
fail if the recount is removed.

Project create and edit are audited (budget, rate, billable flag — the terms
work is billed on); task writes are in `NOT_AUDITED` with the reason, because a
line per board movement would bury the pay changes the trail exists to make
findable.

**Accounting — ✅ done, for the slice this codebase builds.**
`/accounting/{invoices,invoices/[id],bills,bills/[id],ledger,banking}` all
render, and the **receivables cycle**, the **payables cycle** and **bank
matching now write**: issue an invoice, receive a payment against it, void a
draft; approve a bill, pay a vendor against it; match an imported bank line to
a payment already recorded.

Each of those posts a BALANCED journal entry in the same transaction as the
document, reusing one `postJournal()` engine for both cycles:

```
issue     DR Accounts Receivable  total
            CR Consulting Revenue        subtotal
            CR Sales Tax Payable         tax      (omitted when zero)

payment   DR Cash at Bank         amount
            CR Accounts Receivable       amount

approve   DR <expense account>    per bill_line, by its own amount
            DR Input Tax Recoverable     tax      (omitted when zero)
            CR Accounts Payable                 total

pay       DR Accounts Payable     amount
            CR Cash at Bank              amount
```

Approving a bill posts one line per `bill_line`'s own `expense_account_id`
rather than one lump sum, confirmed against the fixture's own pre-existing
approval entries before any code was written — a bill spanning rent and
travel does not collapse into one figure the way a single-account invoice
subtotal does.

An invoice's or a bill's money columns are recomputed from its lines and its
allocations — the L58 rule again — and the base-currency half rounds each part
BEFORE summing, because `ck_invoices_amounts_reconcile` and
`ck_bills_amounts_reconcile` both require `base_total = base_subtotal +
base_tax_total`, and rounding the gross independently lands a cent away.

A **closed accounting period refuses new postings**, for both cycles.
`accounting_periods` has January 2026 `closed` and December 2025 `locked`, and
every invoice in the fixture but one is dated inside the closed month — so this
is not hypothetical. `packages/spec-tests` asserted the rule (INV-ACC-002)
against its own implementation while the deployed path had no check at all:
two suites green and contradicting each other, which is the shape CLAUDE.md
names. The rule is stated as "not open" rather than as a list of bad statuses,
so a status added later refuses by default.

**Paying a vendor refuses the bill's own approver.** The same segregation
payroll enforces between `calculated_by` and `approved_by` on one row
(`payroll_runs`) applies here across two tables — a bill's `approved_by`
against the payment's actor — because approving a liability and paying it are
the two steps a real AP control keeps apart, and the column was already being
stored either way.

**Bank matching writes too, and Phase 7 is done.** A bank_transaction can be
tagged as matched to a payment already on the books — `/accounting/banking`,
row action. Deliberately narrow: this ties one imported line to one existing
payment, manually, one at a time. Bank feed integration, auto-match rules, and
the "reconcile a statement against a running balance" workflow the module spec
describes are not built — `docs/accounting-gap-analysis.md` catalogues the
rest of that gap.

No `postJournal` here, and no `period_closed` check as a result: the cash
movement was already posted by `recordPayment`/`recordVendorPayment` when the
payment itself was recorded, so posting again would double-count cash, and the
period gate lives inside `postJournal`, which this write never calls. That is
a deliberate break from the pattern the last two slices established, not an
oversight.

**Direction matters as much as currency.** `bank_transactions.amount` is
signed — a credit is money in, a debit is money out — while a payment's
`amount` is always positive and its direction lives in which id is set
(`customer_id` for money received, `vendor_id` for money paid). Same currency
and a plausible amount is not enough: a GBP credit and a USD vendor payment
share neither currency nor direction, and matching a credit to a vendor
payment would silently record money received as money paid out. Both are
refused, and both were fixture-blind before two more transactions were added —
every bank_transaction above was already GBP-vs-nothing, leaving
`direction_mismatch` with no real subject (L50, L51 again).

---

## Phase 8 — Support surfaces 🏗️ started

Ticketing (4 tables), change requests (deferred from Phase 2), user groups.
Smaller, and each depends on the employee record being complete.

**Ticketing's biggest piece is a second class of authenticated actor, and
that piece is now built.** [17-customer-portal.md](./17-customer-portal.md)
designs a customer contact — no employee record — plus the ticketing
configuration model, a document portal (internal and client-facing), and
chat, all sharing one identity and one row-visibility pattern rather than
each inventing its own. Portal identity (§1) is done: `customer_contacts`, a
`customer` base role, the third RLS pattern, and a `/portal` shell that
proves the whole chain end to end. Ticketing/documents/chat (§2–4) are still
spec only.

The `(marketing)` route group is the CMSaasStarter site
([07-app-provenance.md](./07-app-provenance.md)), **not** the marketing module,
which is also not started.

---

## Write paths: what shipped, and what is still read-only

Ordered by **which writes already had an invariant that would catch a mistake**
— not by size. Every one of the three turned out to have its detector already
written on the read side, and in each case that detector became the regression
guard: `staleCounters()`, `inconsistentRuns()`, and the per-entry balance rule
in `verify-stories.sql`.

**In every slice the guard was removed and the tests watched failing before it
was trusted** — six tests for the project counters, three for the payroll
header, two for the accounting posting. A guard that has never been observed to
fail is not evidence.

Still read-only after this work: **payroll calculation** (per-person gross,
tax and net) — named in its phase above. Bank matching now writes too (below),
though the full statement-reconciliation workflow the module spec describes —
bank feeds, auto-match rules, a running-balance confirmation — is not built.

### 1. Projects — ✅ done

The counter was the invariant, and it held. See Phase 7 above for what shipped.

Two things the slice taught, both now rules in CLAUDE.md: a denormalised
counter is recomputed rather than incremented ([L58](./10-lessons-learned.md)),
and the vocabulary for a plain `text` column lives in the repository so the
filter and the create form cannot disagree — `/projects` omitted `draft` from
its status list, which would have made the first project anyone created
invisible ([L57](./10-lessons-learned.md)).

### 2. Payroll — ✅ lifecycle done, calculation still ahead

See Phase 6 above. The CHECKs were confirmed to bite before being relied on,
and the header recompute was removed to watch three tests fail before it was
trusted.

Two findings, both now lessons: a duplicate column is dormant rather than
inert — `payroll_runs.status` was harmless only while nothing could write its
twin ([L59](./10-lessons-learned.md)) — and a test asserting an error *class*
passes on the wrong error, which hid a transition bug behind three green
separation-of-duties tests ([L60](./10-lessons-learned.md)).

### 3. Accounting — ✅ done

The balance rule was **not** only a spec test.
`packages/database/tests/verify-stories.sql` asserts, over the live schema, that
every journal entry balances, that it balances in base currency too, that every
line is one-sided and positive, and that invoice journals tie to the invoice
base total within 0.02. `packages/spec-tests` asserts the same rules
independently (INV-ACC-001 … 006). That made accounting last for **size**, not
for risk — and the sequencing held.

Two things the receivables slice taught. `ck_journal_entry_lines_one_sided_positive`
refuses a zero line, so **an invoice with no tax posts two lines, not three** —
code that writes a 0.00 credit "for symmetry" fails at runtime. And a test
whose subject is zero cannot tell two implementations apart: the rounding test
passed over the fixture's zero-tax GBP invoice even with the rounding
deliberately broken ([L61](./10-lessons-learned.md)).

Payables reused `postJournal()` rather than a second engine, and reused the
fixture's own pre-existing bill-approval and vendor-payment journal entries to
confirm the posting shape before writing any code — the L50/L51 fix landed
again on the way in: every seeded bill was already `approved` or `paid`, so two
draft bills were added (one in the open period, one in the closed one) or
`approveBill()` would have had nothing real to operate on.

Bank matching reused nothing from `postJournal()`, deliberately — matching
tags an existing bank_transaction with the payment it corresponds to; the cash
was already posted when that payment was recorded, so this write never opens a
journal entry. Its own guard, `direction_mismatch`, was verified the same
way as the counter and header guards before it: removed, watched fail, then
restored — same L48 discipline as the rest of this list.

### What every one of these writes needs

Established already — do not rediscover it:

- **A decision in `apps/web/src/lib/server/audit/register.ts`**, in the same
  commit. `./check` fails on an action in neither list. Issuing an invoice,
  approving a bill, executing a pay run and recording a payment are "money,
  employment, rights" by the register's own test; a task moving across a board
  probably belongs in `NOT_AUDITED`, with the reason written down.
- **Every reader above `if (!f.ok)`**, `requireCan` before any write,
  `withTenant(actorFrom(locals))`, the audit entry in the same `tx`, and a
  typed domain refusal rather than a raw error.
- **Money as a string, arithmetic in SQL**, `f.decimal(name, { scale })` in,
  and never a JSON number into JSONB.
- **Who can READ what this write creates.** Both disclosures that reached
  `main` were reads of something a write had put somewhere new (L47, L55).

---

## Found while building the write paths, and fixed

Neither was caused by the write-path work; both were surfaced by running
`./check` against a freshly reset database more often than usual.

**A malformed JWT claim raised instead of returning nothing.** Three of seven
`app.*` claim parsers lacked the `EXCEPTION` handler their siblings had, and
`employees.employee_visibility` cast the claim **inline in the policy**, where
no handler can reach it. No rows leaked — an exception is fail-closed — but a
corrupted token produced a 500 rather than an empty page, intermittently,
because it depended on the query plan. `20260902041935` moves the parsing into
`app.claim_role()` and adds nine invariant checks that call every claim parser
with `not-json` ([L62](./10-lessons-learned.md)).

**Recreating that policy dropped `AS RESTRICTIVE` and leaked 12 foreign rows.**
Postgres defaults to PERMISSIVE and OR-s permissive policies together, so the
visibility policy stopped narrowing `tenant_isolation` and started bypassing
it. Caught by `verify-rls.sql` phase C on the next run, which is exactly why
587 isolation checks exist ([L63](./10-lessons-learned.md)). Both are now rules
in CLAUDE.md.

---

## Deferred, and where each actually stands

Re-verified 2026-09-04. Four of these have closed since the list was written,
which is the reason for the verification date at the top of this file.

1. **Field-level PII encryption — ✅ closed.** 19 fields across 6 tables are
   registered in `_pii_encrypted` in `verify-invariants.sql`
   ([13-pii-encryption.md](./13-pii-encryption.md)): the employee-subject ones,
   where erasing the person destroys the key, and the tenant-subject ones
   (`clients`, `vendors`) where it must not. `_pii_pending` is **empty** — the
   temp table stays so the rule keeps working the moment a new PII column is
   added.

1b. **Authorization — ✅ closed.** All write actions authorize before writing,
   separation of duties is enforced by `CHECK` constraints, and `./check` fails
   an ungated action ([14-access-control.md](./14-access-control.md)).
   **Still ahead:** the subject-access export.

1c. **Row-level visibility — ✅ closed.** All 15 Tier 1 tables, in
   `20260831090000` and `20260831110000`, with 75 role-visibility tests
   ([15-row-level-visibility.md](./15-row-level-visibility.md)). Measured at
   0.07ms at SMB scale with the InitPlan pattern, 38× worse without it. The
   tests were the project, as predicted; the policies were the small half.

1d. **Auditing — ✅ closed, and enforced.** Every write is classified in
   `audit/register.ts` — 36 audited operations and 8 explicitly not-audited,
   each with a reason — and `./check` fails on an action in neither list. The
   rule was prose for months and 3 of 26 actions followed it (L54). `audit_log`
   now carries row-level visibility of its own, because auditing a value copies
   it and the copy needed the same protection (L55).

1e. **Disclosure verification — 📋 specified, not implemented.**
   [16-disclosure-verification.md](./16-disclosure-verification.md) specifies an
   exhaustive taint check over every read path × every actor, **and states what
   it deliberately will not catch.** Written 2026-09-01 for offline review and
   to survive a context reset. Nothing is built.

2. **Per-user locale** (L24). Still deferred. A column, a migration, and one
   function to change.

3. Command palette, AI assistant, org chart diagram, marketing module. Still
   deferred.

4. ADR-009 tiers B and C — explicitly not built until a customer pays for them.

---

## How each phase is done

Unchanged from the build plan, and it has caught a real bug in every phase so
far:

- `./check` green — all 17 steps.
- Pages render the Northwind fixture's real rows as `app_user` under RLS.
- No module data path touches `supabaseServiceRole` or PostgREST.
- Money and dates read in the locale of the market they belong to (L24).
- No `approxMoney()` on any figure a person acts on — payslips, invoice
  lines, salary bands, tax figures. Abbreviation is for scale only.
- The finished screen compared against
  <https://nexus.daisyui.com/dashboards/ecommerce>.
- Anything that failed silently gets an entry in
  [10-lessons-learned.md](./10-lessons-learned.md).

And, for anything with a write path:

- Every new action classified in the audit register, in the same commit.
- The read run as the actor meant to be REFUSED, against the live database.
- The guard watched failing before it is trusted.
