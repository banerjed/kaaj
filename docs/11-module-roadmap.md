# Module Roadmap

**Status:** active
**Created:** 2026-08-29

Phases 0–2 of [09-build-plan.md](./09-build-plan.md) are done: the shell, the
data layer, the firm profile and the employee profile. This document covers what
is left, and the order to build it in.

11 of the 116 repositories `api-surface.md` enumerates exist. That ratio
overstates the work remaining — the hard parts (tenancy, the transaction
wrapper, formatting, the form and table patterns) are built and every module
below reuses them.

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

`docs/module-compensation.md` · 6 tables, all already used read-only by the
employee directory.

| Table | Page |
|---|---|
| `compensation_base` | ✅ `/employees/[id]` → editable Compensation tab |
| `compensation_allowances` | ✅ same tab |
| `compensation_variable`, `compensation_equity` | ✅ same tab |
| `compensation_work_schedules` | ✅ shown on the tab (no fixture rows for premiums) |

`compensation_premiums` has no fixture rows and no UI yet — shift differentials
and on-call, which belong with time tracking (Phase 5) where the hours they
attach to actually live.

**Why first:** the directory already reads `compensation_base` and the detail
page already renders its history. This closes a loop that is half-built, and it
is the smallest module remaining.

**The hard part is effective dating.** A raise is a new row with an
`effective_from`, not an edit — and saving one must close the previous row's
`effective_to` in the same transaction, or two rows claim the same day and the
directory's `DISTINCT ON` picks arbitrarily. There is no constraint preventing
overlap, so it belongs in the repository with a test.

**Money never converts.** Same rule as job levels and benefits (BR-FP-006).

---

## Phase 4 — HR (in progress)

`docs/module-hr.md` · 19 tables. The largest module, and the one with the most
user-facing surface.

Build in three slices, each shippable:

1. **Time off** — `hr_time_off_policies`, `_balances`, `_requests`. A request
   page, an approval queue, and a balance that is computed from the ledger
   rather than stored as a running total.
2. **Attendance** — `hr_attendance`, tied to the office's timezone and the
   holiday calendar Phase 1 built.
3. **Performance and onboarding** — `hr_reviews`, `hr_review_cycles`,
   `hr_goals`, `hr_feedback`, `hr_onboarding_templates`, `_tasks`.

**Watch for:** accrual arithmetic in a leap year; a request spanning a holiday
in one office and not another; and approval state that must not be inferable
from a query alone — it needs an explicit audit trail.

---

## Phase 5 — Time Tracking

`docs/module-time-tracking.md` · 4 tables.

Timesheets, billable hours and hourly rates. Feeds both payroll (overtime,
against the Phase 1 policies) and accounting (billable expenses).

**The hard part is rounding.** `firm_payroll_policies.time_rounding` already
exists and is respected nowhere yet. Rounding must happen once, at a defined
boundary, or the same week totals differently on a timesheet and on an invoice.

---

## Phase 6 — Payroll

`docs/module-payroll.md` · 10 tables, including India-specific ones
(`payroll_india_salary_structure`, `payroll_india_tax_declarations`).

Reads everything above. Pay runs, tax withholding, deposits, payslips.

**This is the module where correctness is not negotiable.** Two rules from
CLAUDE.md apply directly:

- Custom fields must never feed payroll calculations.
- `@kaaj/validation`'s 33 country-specific validators exist because a wrong tax
  identifier on a payslip is not a cosmetic bug.

The pay-date projection from Phase 1 is already tested and reused here.

---

## Phase 7 — Projects and Time-to-Cash

`docs/module-project-management-v2.md`, `docs/module-accounting.md` ·
11 + 18 tables.

Projects, tasks, objectives and dashboards; then invoicing, bills, the ledger,
banking and reconciliation. Accounting is the largest single module and the one
with the most invariants — double-entry must balance, and
`docs/accounting-gap-analysis.md` lists ten endpoints the module specs missed.

---

## Phase 8 — Support surfaces

Ticketing (4 tables), change requests (deferred from Phase 2), user groups.
Smaller, and each depends on the employee record being complete.

---

## Deferred, and still deferred

Unchanged from [09-build-plan.md](./09-build-plan.md), and worth re-reading
before any of the above is called done:

1. **Field-level PII encryption.** The employee spec requires it; the schema
   stores `ssn_tax_id` in plaintext. **This should be resolved before payroll
   (Phase 6)**, not after — payroll is where tax identifiers are actually used,
   and retrofitting encryption under live payslip data is far worse than doing
   it first.
2. **Per-user locale** (L24). A column, a migration, and one function to
   change.
3. Command palette, AI assistant, org chart diagram, marketing module.
4. ADR-009 tiers B and C — explicitly not built until a customer pays for them.

---

## How each phase is done

Unchanged from the build plan, and it has caught a real bug in every phase so
far:

- `./check` green — all ten steps.
- Pages render the Northwind fixture's real rows as `app_user` under RLS.
- No module data path touches `supabaseServiceRole` or PostgREST.
- Money and dates read in the locale of the market they belong to (L24).
- No `approxMoney()` on any figure a person acts on — payslips, invoice
  lines, salary bands, tax figures. Abbreviation is for scale only.
- The finished screen compared against
  <https://nexus.daisyui.com/dashboards/ecommerce>.
- Anything that failed silently gets an entry in
  [10-lessons-learned.md](./10-lessons-learned.md).
