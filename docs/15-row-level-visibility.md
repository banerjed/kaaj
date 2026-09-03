# Row-Level Visibility: where RLS by role belongs

**Status:** ✅ **all 15 Tier 1 tables implemented** — 20260831090000 and
20260831110000. 75 role-visibility tests
**Created:** 2026-08-30

Tenant isolation is already enforced by RLS on all 103 tables and proved by 587
checks in `./check`. This document is about a second, narrower question: **among
people who legitimately belong to the same tenant, which rows should some of
them not see?**

It is deliberately not applied everywhere. The rest of this document is the list
and the reasoning.

---

## The criterion

A table belongs in Tier 1 when **both** are true:

1. **The application read path is the only control today.** If a page forgets to
   scope a query, the rows come back.
2. **A correctly-authenticated, same-tenant reader could cause harm with them.**
   Not "is person-scoped" — the office holiday calendar is about people and
   harms nobody.

The second test is what keeps the list short. `hr_attendance` is person-scoped,
and a colleague learning you clocked in at 09:02 is not a harm worth a policy on
every read.

---

## Measured cost

Real policies, 20,000 synthetic employees, then 500. The concern that RLS would
slow the app is **founded for a naive implementation and not otherwise**:

| Directory page | tenant-only | + role-aware |
|---|---|---|
| 500 employees (a large SMB) | 0.33 ms | **0.40 ms** |
| 20,000 employees | 10.6 ms | 15.0 ms |

**The naive version is 38× worse.** Written the obvious way, Postgres *inlines*
the SQL function into the predicate and re-parses the JWT claim per row —
35–40 ms on a 20,000-row scan. Rewriting in PL/pgSQL stops the inlining but it
is still *called* per row.

**Every predicate must wrap its function calls in a scalar subquery**, which
becomes an InitPlan evaluated once:

```sql
CREATE POLICY employee_visibility ON employees AS RESTRICTIVE FOR SELECT
USING (
  (SELECT app.reads_all_employees())
  OR id = (SELECT app.current_employee_id())
);
```

35 ms → 6.4 ms on the same scan. At SMB scale the difference is 70 microseconds,
against a measured 131 ms TTFB. This pattern is not optional, and getting it
wrong makes the app feel broken for a reason no profiler points at.

**And the predicate must never parse the claim itself.** The full policy has a
third arm — a role check — which originally cast
`current_setting('request.jwt.claims', true)::jsonb` inline. A policy
expression cannot carry an `EXCEPTION` handler, so a malformed claim raised
from inside the policy instead of returning no rows: a 500 rather than an empty
page, appearing and disappearing with the query plan. It now calls
`app.claim_role()`, which returns NULL on a bad claim like its siblings, and
`./check` refuses any policy that casts the claim itself
([L62](./10-lessons-learned.md), `20260902041935`).

**`AS RESTRICTIVE` is load-bearing.** These tables also carry
`tenant_isolation`, and Postgres OR-s *permissive* policies together — so a
visibility policy recreated without those two words stops narrowing tenant
isolation and starts bypassing it. Recreating one leaked 12 foreign rows, and
`verify-rls.sql` phase C caught it on the next run
([L63](./10-lessons-learned.md)).

---

## Tier 1 — add row-level RLS (15 tables)

### Already relying on an application-only rule (4)

These have hand-written read rules today that nothing backs up. They are the
strongest case, because the control already exists and has no second layer.

| Table | The rule today |
|---|---|
| `hr_reviews` ✅ | a manager's draft assessment is withheld from its subject — `redactFor` only |
| `hr_feedback` ✅ | an anonymous note never returns its author — a SQL `CASE` only |
| `employees` | ✅ **done.** Everyone reads the directory; a contractor reads only themselves |
| `hr_survey_responses` ✅ | pulse responses must not be attributable. **Currently safe by data, not by rule**: the anonymous survey's rows carry a NULL `respondent_id`. Nothing enforces that — a cross-table CHECK needs a trigger |

### Pay and its history (7)

| Table | |
|---|---|
| `compensation_base` | ✅ **done** |
| `compensation_allowances` ✅ |
| `compensation_variable` ✅ |
| `compensation_equity` ✅ |
| `compensation_premiums` ✅ |
| `employment_terms` ✅ |
| `hr_employment_history` ✅ |

### PII-bearing (3)

Encrypted at rest, but the **row's existence** still leaks — that someone has
three bank accounts, or an emergency contact with a given relationship.

| Table |
|---|
| `employee_bank_accounts` ✅ |
| `hr_emergency_contacts` ✅ |
| `hr_employee_documents` ✅ |

### Payroll (5)

✅ Done ahead of Phase 6 rather than with it. All five carry fixture rows, so
the policies are tested now — and a policy added with the table costs nothing,
while retrofitting one under live payslip data is the situation this repository
has already decided to avoid once, for PII encryption.

| Table |
|---|
| `payroll_run_employees` ✅ |
| `payroll_employee_deductions` ✅ |
| `payroll_india_salary_structure` ✅ |
| `payroll_india_tax_declarations` ✅ |
| `payroll_tax_withholding_certificates` ✅ |

---

## Tier 2 — person-scoped, deferred deliberately (11)

Real subjects, low harm between colleagues. Revisit if a customer asks, or if
one of these starts carrying something sensitive.

`hr_attendance` · `hr_time_off_requests` · `hr_time_off_balances` ·
`hr_onboarding_tasks` · `hr_goals` · `employee_assets` ·
`employee_certifications` · `employee_training_records` ·
`hr_benefits_enrollments` · `hr_change_requests` · `employee_group_members`

`hr_benefits_enrollments` is the one most likely to move up: a plan tier can
imply a medical circumstance.

---

## Accounting — moved out of Tier 3 (15)

`invoices` · `invoice_lines` · `bills` · `bill_lines` · `journal_entries` ·
`journal_entry_lines` · `chart_of_accounts` · `payments` ·
`payment_allocations` · `bank_accounts` · `bank_transactions` ·
`bank_reconciliation_rules` · `accounting_periods` · `vendors` · `expenses`

These were Tier 3 on the reasoning that they are "business records that
everyone in a function reads". **That reasoning was wrong**, and it is worth
writing down why rather than quietly deleting it: a plain employee is not in
the finance function. `accounting.read` and `accounting.write` are granted to
`finance_admin` alone (`packages/authz`), so the permission model had already
made the judgement the tier list contradicted. Tenant-only RLS meant one missed
`requireCan`, one join from an unguarded page, or one repository helper reused
in a new context would return every invoice, payment and bank account the firm
holds.

Two predicates rather than one, because `auditor` reads everything and writes
nothing:

- `app.reads_all_accounting()` — `owner`, `firm_admin`, `finance_admin`,
  `auditor`
- `app.writes_accounting()` — the same, minus `auditor`

Four RESTRICTIVE policies per table (SELECT / INSERT / UPDATE / DELETE),
because a single `FOR ALL` policy cannot express "may read, may not write".
Migration `20260903045821_accounting_row_visibility.sql`; asserted in
`row-visibility.test.ts`, both halves, including that a malformed claim reads
nothing rather than raising.

---

## Tier 3 — tenant-only, and should stay that way (~60)

Firm configuration, reference data, and business records that everyone in a
function reads. A role predicate here costs something and protects nothing.

- **Firm config** — `firm_locations`, `firm_departments`, `firm_job_titles`,
  `firm_job_levels`, `firm_holidays`, `firm_benefits_packages`,
  `firm_benefits_plans`, `firm_benefit_items`, `firm_payroll_policies`,
  `payroll_pay_schedules`, `tenants`, `tenant_settings`,
  `custom_field_definitions`
- **Reference** — `payroll_tax_rates`, `exchange_rates`, `translations`
*(Accounting used to be listed here. It was wrong — see below.)*
- **Projects, CRM, marketing, ticketing** — `projects`, `tasks`, `pm_*`,
  `clients`, `customers`, `ticketing_*`
- **Time tracking** — `time_tracking_entries`, `_timesheets`, `_hourly_rates`,
  `_billable_expenses`

Accounting is Tier 3 on the reasoning that `finance_admin` is the gate, and
someone who holds it needs the whole ledger. If a customer wants per-project
financial visibility that becomes a Tier 1 conversation for `expenses` and
`invoices`, not a change to this default.

---

## Explicitly excluded, with reasons

These look like candidates and are not. Each would cause a specific problem.

| Table | Why not |
|---|---|
| `tenant_users` | `custom_access_token_hook` reads it as `supabase_auth_admin`. A RESTRICTIVE policy is AND-ed for **every** role, so it can break login — and a hook failure is a 500 on `/token`, meaning no login at all ([L5](./10-lessons-learned.md)) |
| `pii_keys` | the row holds only a **wrapped** key; reading it teaches nothing without `PRIVATE_PII_KEK`, which is not in Postgres. And `eraseSubject` must find and delete a key — a narrowing predicate risks breaking Article 17 erasure |
| `pii_erasures` | its purpose is demonstrating that an erasure happened. Scoping it to the subject is backwards: the subject is gone |
| `audit_log` | the question is table-level — who may read the trail at all — not row-level. A role predicate would let people read their own entries, which is not the intent |
| `jobs` | a work queue, not business data |
| `profiles`, `stripe_customers`, `contact_requests` | CMSaasStarter leftovers, isolated per-user already, pending removal ([07-app-provenance.md](./07-app-provenance.md)) |

---

## Two things to settle before the first policy

**1. `verify-rls.sql` assumes one policy per table.** 587 checks are built around
that shape. A second, RESTRICTIVE policy may need the harness taught about it, or
the failures will look like leaks. Check this before writing the first migration.

**2. RLS and `can()` would then enforce the same rules in two places** — the
divergence problem again, this time between a policy and application code. The
answer is the one already used for the two test suites: **do not merge them,
assert they agree.** A conformance test per Tier 1 table, checking that what RLS
returns and what `can()` permits give the same answer.

---

## The real cost is tests, not policies

A RESTRICTIVE policy that is too tight **blanks a page rather than erroring** —
[L21](./10-lessons-learned.md), the default failure mode in this codebase. Every
Tier 1 table needs a test asserting the right rows **do** come back, per role,
not only that the wrong ones do not.

Fifteen tables × roughly four roles is the actual scope of this work. The
policies are an afternoon; the tests are the project.

---

## What the policies do NOT do

They are the backstop for ROW visibility — whether a row exists for you at all.
They deliberately do **not** reimplement the finer rules the application already
enforces on FIELDS:

| Rule | Where it lives | Why not RLS |
|---|---|---|
| a manager's draft assessment withheld from its subject | `hr_reviews.repo.ts` | field-level; RLS cannot redact a column |
| an anonymous note's author | `hr_feedback.repo.ts` | field-level, resolved in SQL as `CASE WHEN` |
| a masked bank number for `pii.read` without `pii.reveal` | `@kaaj/authz` | field-level |
| a manager seeing their reports' pay | `can()` | walking `manager_id` per row is the shape that makes RLS expensive |

Two layers, two questions. A policy that tried to do both would diverge from
`can()`, which is the failure this repository has already had once between its
two test suites.

## What the first slice actually cost

`employees` turned out not to be a contained change: **twelve repositories join
to it**, so a policy there reaches nearly every read path in the app. And
`withTenant` only ever sent `tenant_id` — the database did not know WHO was
asking, so with the policy in place a plain employee would have seen nothing
anywhere.

That is now fixed and is the load-bearing part of this work:
**`withTenant` carries the whole actor** — tenant, person, role, functional
roles — via `actorFrom(locals)`. A bare tenant id still isolates by tenant and
is still accepted, but row-visibility policies deny it, which is fail-closed and
deliberate. 17 route files and 9 test files were updated.

Two harness corrections fell out:

- **PHASE H of `verify-rls.sql` demanded `WITH CHECK` on every policy.** Postgres
  *refuses* `WITH CHECK` on `FOR SELECT` — "WITH CHECK cannot be applied to
  SELECT or DELETE" — so the rule was asking for something the database will not
  accept, and made every read-only policy an exemption to remember. It now
  filters on `cmd`, which is what its own prose already described.
- **The isolation harness sends a tenant-only claim**, which the new policies
  correctly deny — surfacing as "owner saw 0 of 12" and looking exactly like a
  leak test failing. Its claim now carries `role: owner`, because that file asks
  a *tenant* question; row visibility has its own tests.

## Suggested order

1. ✅ `employees` + `compensation_base`
2. The rest of pay (6)
3. `hr_reviews`, `hr_feedback`, `hr_survey_responses` — the ones with an
   application-only rule today
4. PII-bearing (3)
5. Payroll (5), with Phase 6 rather than before it
