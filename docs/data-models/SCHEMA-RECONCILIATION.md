# Schema Reconciliation

**Version:** 1.2
**Last Updated:** August 27, 2026
**Status:** Authoritative record of the merge

This document records how two partial, divergent schemas were merged into one
Supabase Postgres schema (`schema.sql`), and — critically — **every capability
that was restored, preserved, or deliberately dropped**.

It exists because the merge was not a rename. The D1 schema's "SMB optimization"
pass removed eleven tables, and several of those removals lost real
functionality. Merging naively would have silently shipped that loss.

---

## Sources

| Source | Dialect | Tables | Status |
|---|---|---|---|
| `data-models.md` | PostgreSQL | 43 | Superseded — merged in |
| `data-models/d1-schema-clean.sql` | SQLite / D1 | 52 | Superseded — merged in |
| `data-models/critical-tables-addon.sql` | SQLite / D1 | 4 | Superseded — merged in |
| **`data-models/schema.sql`** | **PostgreSQL** | **98** | **Authoritative** |

The two main sources overlapped by only **14 tables** once module prefixes
(`firm_`, `payroll_`, `compensation_`) were normalized. They were largely
*complementary*, not duplicative:

- `data-models.md` covered accounting, finance, firm profile, payroll and
  compensation — with `tenant_id` on 34 of 43 tables — but had **no `employees`
  table at all** and no full-text search.
- `d1-schema-clean.sql` covered HR, project management, ticketing and time
  tracking — but used database-per-organization tenancy with natural primary
  keys (`US-NYC`, `ENG`, `EMP-001`) that collide under shared tenancy.

Neither was usable alone.

---

## Table of Contents

1. [Restored functionality](#restored-functionality)
2. [Deliberate drops](#deliberate-drops)
3. [Preserved D1 simplifications](#preserved-d1-simplifications)
4. [Merged tables](#merged-tables)
5. [Schema-wide transformations](#schema-wide-transformations)
6. [New tables](#new-tables)
7. [Verification](#verification)

---

## Restored functionality

The D1 v6.0 changelog records: *"BREAKING: Removed 11 over-normalized tables
(20% reduction: 55 → 44 tables)."* Each removal was re-examined. Eight carried
real capability and are **restored**.

### 1. `compensation_base` — effective-dated compensation history

**D1 did:** inlined `compensation_type`, `base_amount`, `currency`,
`pay_frequency`, `overtime_eligible` onto `employees`.

**What was lost:** `effective_from`, `effective_to`, `change_reason`,
`annual_equivalent`, `standard_hours_per_day`, `standard_days_per_week`,
`overtime_rules`. Inlining keeps only the *current* salary.

**Why restored:** payroll must be reproducible for any past period. A payslip
reissued for March must use March's salary, not today's. Without effective
dating, back-pay, retroactive adjustments, and audits are impossible.

**Resolution:** `compensation_base` restored as a temporal table. The current
values remain on `employees` as a **read cache**, maintained by trigger, marked
in the schema as non-authoritative.

### 2. `employment_terms` — contract and work authorization

**D1 did:** kept only `employment_type`, `start_date`, `end_date`, `fte` on
`employees`.

**What was lost:** `contract_type`, `renewal_option`, `probation_period_days`,
`probation_end_date`, `notice_period_days`, `work_authorization_type`,
**`work_authorization_expiry`**, `planned_end_date`, `actual_end_date`.

**Why restored:** work authorization expiry is a compliance obligation — an
employer must know when a visa or permit lapses. Probation and notice periods
drive termination workflows. This is not optional data for an HR product.

**Resolution:** `employment_terms` restored in full.

### 3. `tax_withholding_certificates` — withholding records

**D1 did:** inlined to `employees.tax_withholding` (JSONB).

**What was lost:** per-jurisdiction certificates with effective dates, filing
status, allowances, and supporting document references — 24 columns of
auditable record.

**Why restored:** tax withholding produces filings. A JSONB blob with no
effective dating cannot answer "what did we withhold for this employee in Q2,
and on the authority of which certificate?"

**Resolution:** `tax_withholding_certificates` restored.
`employees.tax_withholding` retained as a current-state cache.

### 4. `hr_time_off_balances` — leave balances

**D1 did:** inlined to `employees.pto_balances` (JSONB).

**What was lost:** per-policy balances with accrual, usage, carryover, and
expiry tracking.

**Why restored:** leave balances are a financial liability that appears on the
balance sheet, and accrual disputes are common. They need an audit trail, not a
mutable blob.

**Resolution:** `hr_time_off_balances` restored with accrual ledger semantics.
`employees.pto_balances` retained as a display cache.

### 5. `hr_goals` — performance goals

**D1 did:** inlined to `hr_reviews.goals` (JSONB).

**What was lost:** goals that span review cycles, independent progress tracking,
and — importantly — the link to `pm_objectives`.

**Why restored:** `cross-module-integration-plan.md` treats goal-to-objective
alignment as a cross-module integration point. Goals nested inside a review row
cannot participate in it.

**Resolution:** `hr_goals` restored with an optional FK to `pm_objectives`.

### 6. `time_tracking_hourly_rates` — rate history

**D1 did:** inlined to `employees.default_hourly_rate` and
`projects.hourly_rate_override`.

**What was lost:** effective-dated rates, and per-client / per-role rate cards.

**Why restored:** billing accuracy. An invoice for work done in January must use
January's rate. Professional-services firms — the Phase 1B target — also need
different rates per client.

**Resolution:** `time_tracking_hourly_rates` restored with effective dating and
optional client/role scoping. The inline defaults remain as fallback.

### 7 & 8. `payroll_india_salary_structure`, `payroll_india_tax_declarations`

**D1 did:** dropped entirely — *"use employees.salary_structure JSONB for
India."*

**What was lost:** 49 columns of India-specific payroll modelling (basic, HRA,
LTA, special allowance, PF, ESI, professional tax, gratuity; Section 80C/80D
declarations, regime election, proof submission).

**Why restored:** India is in scope. `enumerations.json` includes `hi-IN` and
`INR`; `validation-utils.js` exports `sanitizePAN` and `sanitizeAadhaar`;
`data-models.md` models both tables. Indian statutory payroll cannot be
expressed as a generic JSONB blob — it has prescribed components and filing
formats.

**Resolution:** both tables restored. Launch scope is a product decision, not a
schema one — see open question 6 in
[Architecture Decisions](../05-architecture-decisions.md#open-questions).

### 9. The 16 `_i18n` columns

**D1 did:** *"Removed all `_i18n` fields for SMB optimization."*

**What was lost:** multilingual names on `tenants`, `locations`, `departments`,
`job_titles`, `job_levels`, `pay_schedules`, `benefits_packages`,
`benefit_items`, `holidays`, `tax_rates`, `chart_of_accounts`.

**Why restored:** `product-specification.md` principle #2 is *"Global by
Design — full internationalization from day one"* and commits to 19 locales.
A department named only in English defeats that for every non-English tenant.
The cost is one nullable `JSONB` column per translatable name.

**Resolution:** all 16 restored, on customer-visible named entities only.

---

## Deliberate drops

### `pm_column_definitions` + `pm_task_column_values` — stays dropped

This was Entity-Attribute-Value. D1 correctly removed it. It is replaced by
`custom_field_definitions` (see [New tables](#new-tables)), which is the
well-formed version of what EAV was reaching for — typed, validated, and
renderable, without a join per attribute.

Rationale in
[Customization Model](../06-customization-model.md#what-we-refuse-to-support).

### `custom_table_definitions` + `custom_table_data` — stays dropped

Same reasoning. Replaced by Tier 2 custom fields.

### Denormalized `department_name`, `location_name`, `manager_name` — dropped

D1 added these to `employees` for *"0 joins for employee directory."*

Dropped because a department rename becomes an N-row update, the values go stale
silently, and under shared tenancy a stale value is a cross-tenant display risk.
ADR-001 puts modules in one database, so these are ordinary joins — and a
SvelteKit `load` function resolves the directory in one query regardless.

### `time_tracking_timesheet_entries` — stays dropped

D1 replaced a join table with a direct FK on `time_tracking_entries.timesheet_id`.
Correct: the relationship is 1:N, not N:M. No functionality lost.

---

## Preserved D1 simplifications

Not everything in the D1 pass was a loss. These are kept:

| D1 change | Kept because |
|---|---|
| `hr_reviews` JSONB (`self_assessment`, `manager_assessment`, `competencies`) | Genuinely document-shaped, never queried relationally |
| `tasks` direct columns (`status`, `priority`, `assigned_to`, `due_date`) | Replaced EAV with real columns — an improvement |
| `projects` cached aggregates (`task_count`, `actual_hours`) | Legitimate cache with a clear trigger-based invalidation |
| `hr_benefits_enrollments` dependents/beneficiaries as JSONB | Document-shaped, varies by plan |
| Module name prefixes (`firm_`, `hr_`, `pm_`, `ticketing_`) | Improves navigability across 94 tables — applied uniformly |
| Removal of 4 speculative indexes | Unused indexes cost write throughput |

The eight new HR tables added in D1 v6.1 (`hr_change_requests`,
`hr_emergency_contacts`, `hr_employee_documents`, `hr_benefits_enrollments`,
`hr_onboarding_tasks`, `hr_feedback`, `hr_surveys`, `hr_survey_responses`) are
carried over in full — they exist only in the D1 schema.

---

## Merged tables

Fourteen tables existed in both sources under different names. Each was merged
column-by-column, taking the union.

| Merged name | From `data-models.md` | From `d1-schema-clean.sql` |
|---|---|---|
| `firm_locations` | `locations` | `firm_locations` |
| `firm_departments` | `departments` | `firm_departments` |
| `firm_holidays` | `holidays` | `firm_holidays` |
| `payroll_runs` | `payroll_runs` | `payroll_runs` |
| `payroll_run_employees` | `payroll_run_employees` | `payroll_run_employees` |
| `payroll_tax_rates` | `tax_rates` | `payroll_tax_rates` |
| `payroll_tax_deposits` | `tax_deposits` | `payroll_tax_deposits` |
| `payroll_deduction_definitions` | `deduction_definitions` | `payroll_deduction_definitions` |
| `payroll_employee_deductions` | `employee_deductions` | `payroll_employee_deductions` |
| `compensation_allowances` | `compensation_allowances` | `compensation_allowances` |
| `compensation_equity` | `compensation_equity` | `compensation_equity` |
| `compensation_premiums` | `compensation_premiums` | `compensation_premiums` |
| `compensation_variable` | `compensation_variable` | `compensation_variable` |
| `compensation_work_schedules` | `work_schedules` | `compensation_work_schedules` |

Two further tables were duplicated *within* the Postgres sources and merged:
`tenants` (29 cols in `data-models.md`, 31 in `critical-tables-addon.sql`) and
`pay_schedules` (14 and 25 cols respectively). The union was taken in both cases.

**Merge rule applied:** union of columns; where both defined a column, the
richer definition won (wider type, more constraints, i18n variant preferred).
No column present in either source was dropped except those listed under
[Deliberate drops](#deliberate-drops).

---

## Schema-wide transformations

Applied uniformly to all 94 tables:

| From (D1 / SQLite) | To (Supabase Postgres) |
|---|---|
| `TEXT PRIMARY KEY` natural keys (`US-NYC`, `EMP-001`) | `UUID PRIMARY KEY DEFAULT gen_random_uuid()` |
| Human codes as identity | Retained as `UNIQUE (tenant_id, code)` business keys |
| `INTEGER` booleans (`0`/`1`) | `BOOLEAN` |
| `TEXT` ISO-8601 timestamps | `TIMESTAMPTZ` |
| `TEXT` holding JSON | `JSONB` |
| `CHECK (... GLOB ...)` | `CHECK (... ~ ...)` regex |
| FTS5 virtual tables + 6 sync triggers | `tsvector` columns + GIN indexes + triggers |
| *(absent)* | `tenant_id UUID NOT NULL` on all 94 tables |
| *(absent)* | RLS policies, `FORCE ROW LEVEL SECURITY` |

### Natural keys → surrogate keys

The single most invasive change. Under database-per-org, `location_code = 'US-NYC'`
as a primary key is fine. Under shared tenancy, two customers both having a
`US-NYC` location collide.

Every natural key became a surrogate `UUID` PK, with the human-readable code
preserved as a tenant-scoped unique constraint:

```sql
-- was:  location_code TEXT PRIMARY KEY
id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
tenant_id     UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
location_code TEXT NOT NULL,
UNIQUE (tenant_id, location_code)
```

Customers keep readable codes; the database keeps globally unique identity.

### Global unique indexes → tenant-scoped

Three unique indexes were globally scoped and would have broken shared tenancy
outright:

| Index | Was | Now |
|---|---|---|
| `idx_firm_locations_hq` | one headquarters **across all tenants** | one per tenant |
| `idx_pm_objectives_number` | `objective_number` globally unique | unique per tenant |
| `idx_projects_number` | `project_number` globally unique | unique per tenant |

The first was a hard failure: the second customer to sign up could not have
created a headquarters.

### Full-text search rebuilt

The D1 schema had two FTS5 virtual tables (`tickets_fts`, `updates_fts`) with
six sync triggers. These also carried a latent bug: they declared
`content='tickets'` and `content='ticket_updates'`, but the actual tables are
named `ticketing_tickets` and `ticketing_updates` — the external-content
configuration pointed at tables that do not exist.

Rebuilt as `tsvector` columns with GIN indexes and corrected trigger targets.
**`tenant_id` is part of every search predicate** — search is the most likely
place for a cross-tenant leak to reach a user's screen.

### Tables lacking `tenant_id`

Ten tables in the Postgres source had no `tenant_id`. Resolved as:

| Table | Resolution |
|---|---|
| `tenants` | Correct as-is — it *is* the registry |
| `exchange_rates` | Correct as-is — genuinely global reference data |
| `invoice_lines`, `bill_lines`, `journal_entry_lines`, `payment_allocations`, `bank_transactions` | `tenant_id` **denormalized onto each** — join-based RLS policies are slow and error-prone |
| `firm_holidays`, `benefit_items` | **Were bugs.** Both are tenant-scoped in reality; without `tenant_id` they would collide or leak |
| `payroll_tax_rates` | **Split**: statutory rates are global (`tenant_id IS NULL`), tenant overrides carry `tenant_id`. Enforced by a partial unique index |

---

## New tables

Added to satisfy decisions made after both source schemas were written:

| Table | Source decision |
|---|---|
| `tenant_users` | ADR-008 — membership, and multi-tenant users with an active tenant |
| `custom_field_definitions` | [Customization Model](../06-customization-model.md) Tier 2 |
| `tenant_settings` | [Customization Model](../06-customization-model.md) Tier 3 |
| `jobs` | ADR-002 — `SKIP LOCKED` background queue |
| `audit_log` | `product-specification.md` — comprehensive audit logging |
| `translations` | `product-specification.md` — database-backed translation system |
| `cross_module_links` | `cross-module-integration-plan.md` polymorphic linking |
| `hr_goals`, `compensation_base`, `employment_terms`, `tax_withholding_certificates`, `hr_time_off_balances`, `time_tracking_hourly_rates`, `payroll_india_salary_structure`, `payroll_india_tax_declarations` | [Restored functionality](#restored-functionality) |

---

## Verification

**The merged schema was executed against PostgreSQL 17 and applies with zero
errors.** It was not merely inspected.

### Verified structure

| Metric | Value |
|---|---|
| Tables | 93 |
| Columns | 2,025 |
| Indexes | 495 |
| Foreign keys | 155 |
| RLS policies | 93 |
| Tables with RLS enabled | 93 / 93 |
| Tables with `FORCE ROW LEVEL SECURITY` | 92 (all except `exchange_rates`, by design) |
| Tables without `tenant_id` | 2 (`tenants`, `exchange_rates`, both intentional) |
| Enum types | 9 |

### Verified behaviour

Two live tests were run against the applied schema using a non-owner
`app_user` role:

1. **Cross-tenant isolation.** Two tenants were each given a department with
   the identical code `ENG` — which the old natural-key primary key made
   impossible. With `request.jwt.claims` set to tenant A, only A's row is
   visible; set to tenant B, only B's. With **no** tenant claim, the query
   returns **zero rows** — the policy fails closed rather than open.
2. **The headquarters constraint.** Two different tenants can each designate a
   headquarters (the original global unique index permitted only one across the
   entire system). A second headquarters *within* one tenant is still rejected,
   so the business rule is preserved while the tenancy bug is fixed.

### Merge verification

The merge itself was verified mechanically, not by inspection:

1. **Column preservation.** Every column in every source table was extracted
   (2,273 definitions total) and checked against the merged schema. Any column
   not present in `schema.sql` must appear in
   [Deliberate drops](#deliberate-drops). There are no unaccounted losses.
2. **Overlap detection.** Table names were normalized for module prefixes and
   fuzzy-matched to catch renamed duplicates — this is how
   `employee_deductions` ↔ `payroll_employee_deductions` was caught, which exact
   matching missed.
3. **Tenant coverage.** Every table except `tenants` and `exchange_rates`
   carries `tenant_id NOT NULL` and has an RLS policy.
4. **Index leading column.** Every index on a tenant-scoped table leads with
   `tenant_id`, per ADR-003 rule 2.
5. **Type conversion audit.** The SQLite-to-Postgres boolean heuristic
   (`INTEGER DEFAULT 0/1` → `BOOLEAN`) misfired on 20 columns that were
   genuinely counters — `version`, `task_count`, `display_order`,
   `current_sequence`, `break_minutes` and similar. Each was resolved against
   its original SQLite declaration and restored to `INTEGER`. Columns that were
   semantically boolean despite lacking a `CHECK` constraint (`private`,
   `active`, `requires_approval`, `client_can_comment`, ...) were kept as
   `BOOLEAN`.

### Post-merge corrections (2026-08-27)

Applied after the first validation pass, all found by loading the schema and the
mock data into PostgreSQL 17 rather than by inspection:

- **40 natural business keys were wrongly typed `UUID`.** The `_id`-suffix rule
  fired after the natural-key rule, converting `employees.employee_id`,
  `projects.project_id` and 38 others. Restored to `TEXT`, alongside their
  surrogate `UUID` primary key and tenant-scoped `UNIQUE` constraint.
- **13 foreign keys had been silently lost.** When the target's key changed from
  a natural code to a surrogate `id`, references such as
  `employee_assets.employee_id` and `ticketing_updates.ticket_id` no longer
  resolved. Constraints re-established.
- **3 columns were genuinely vestigial** — `ticketing_tickets.ticket_id`,
  `ticketing_business_areas.business_area_id` and `payroll_run_employees.run_id`
  each duplicated their table's own `id`. Dropped.
- **4 columns were never identifiers**: `employees.ssn_tax_id`, `clients.tax_id`,
  `customers.tax_number`, `firm_locations.holiday_calendar_id`. The `_id` suffix
  misled the converter; restored to `TEXT`.
- **`time_tracking_timesheets` had no primary key** — the natural-key conversion
  removed it. Restored as a surrogate `UUID`.
- **`payroll_runs.pay_period_id` removed.** It referenced a `pay_periods` table
  that existed in neither source. Pay periods are derived from
  `payroll_pay_schedules` plus `pay_period_start`/`pay_period_end`. Revisit if
  explicit pay-period records are ever needed.

### Known follow-ups

- `ticketing_business_areas.custom_fields` defaulted to `'[]'` (array) while
  every other table used `'{}'` (object). Normalized to object.
- **Defects found and fixed during validation**, all pre-existing in the
  sources: `data-models.md` referenced nine enum types (`employment_type`,
  `compensation_type`, `allowance_type`, `equity_type`, `premium_type`,
  `variable_comp_type`, `work_arrangement`, `vesting_type`,
  `time_tracking_type`) that it **never defined** — they are now created from
  `enumerations.json`; four `created_at`/`updated_at` columns defaulted to
  SQLite's `strftime()`; and three columns in `ticketing_business_areas` carried
  multi-line JSON seed blobs as column defaults, which now default to empty
  (seed content belongs in seed data).
- Foreign keys are declared in a final `ALTER TABLE` section rather than
  inline. With 93 tables there is no practical topological ordering, and this
  removes every forward-reference failure at once.
- One foreign key was dropped: `payroll_runs.pay_period_id` referenced a
  `pay_periods` table that exists in neither source. Needs a product decision —
  either model pay periods or remove the column.
- ~~Seed data has not been ported~~ — **done.** `mock-data.sql` regenerated
  against this schema (229 rows, 43 tables, verified to load).
- ~~`d1-best-practices.md` still describes the D1 model~~ — **deleted**, along
  with the other superseded D1 sources.
- `SCHEMA-HELP-GUIDE-PART-{1,2,3}.md` and `JSONB-FIELD-EXAMPLES.md` are
  **retained** — every table and field they document still exists, and their
  business-meaning content is not reproduced anywhere else. Each now carries a
  staleness header. A refresh pass should update types and identifier examples,
  and cover the 41 tables they do not yet document.

---

## Module coverage audit (2026-08-27)

All 13 module specifications were audited against the schema. Findings and
resolutions below. The audit compared each spec's declared entities, its
`## Data Model` section, and its user stories against the tables actually built.

### Gaps closed — 5 new tables

| Table | Closes | Source requirement |
|---|---|---|
| `employee_bank_accounts` | **Payroll could not pay anyone.** The only banking in the schema was `bank_accounts` (the company's own) and `vendors`. | `module-payroll.md` FR-PAY-005, US-PAY-010 |
| `hr_employment_history` | Job title, department, manager and location existed only as *current* values. `compensation_base` covered salary history; career progression had no store. | `module-hr.md` US-HR-007/008/010/011 |
| `hr_onboarding_templates` | `hr_onboarding_tasks.template_data` held a per-employee *copy*, so templates could not be maintained centrally. | `module-hr.md` FR-HR-009 |
| `hr_onboarding_template_tasks` | Task definitions across the pre-boarding → 90-day phases, with role-based assignment. | `module-hr.md` FR-HR-009 |
| `hr_company_news` | Company news feed and recognition posts had no store. | `module-hr.md` FR-HR-011 |

`employee_bank_accounts` supports ACH, NEFT/RTGS and SEPA, split deposits by
percentage or fixed amount, and prenote verification. Two constraints are
enforced by the database: exactly one primary account per employee, and a
non-remainder allocation must carry a value.

### Gap closed without a table

**Celebrations** (`module-hr.md` FR-HR-012, US-HR-070/075) are served by the
`v_upcoming_celebrations` **view**. Birthdays and work anniversaries derive from
`employees.birth_date` and `employees.start_date`; a table would duplicate them
and immediately drift. Privacy controls read from
`employees.celebration_preferences`. The view inherits RLS from `employees`, so
it is tenant-safe by construction.

### Ticketing SLA

`module-ticketing.md` configures `slaHours` per category and exposes
`/business-areas/{id}/reports/sla-compliance`, but compliance could not be
computed: `due_date` was `DATE` — too coarse for a 4-hour SLA — and nothing
recorded first response. Added to `ticketing_tickets`: `sla_due_at`,
`sla_response_due_at`, `first_response_at`, `sla_paused_seconds`,
`sla_resolution_breached`, `sla_response_breached`. `due_date` is now nullable,
since the spec never required one on every ticket.

### Typing corrections — 19 columns

The SQLite→Postgres conversion only retyped columns with a JSON-shaped
`DEFAULT`, so columns holding JSON without a default stayed `TEXT`. Every one is
documented as JSONB in `SCHEMA-HELP-GUIDE`.

**`TEXT` → `JSONB` (8):** `compensation_premiums.eligibility_rules`,
`firm_benefits_plans.plan_details`, `firm_benefits_plans.eligibility_rules`,
`hr_benefits_enrollments.election_details`, `hr_change_requests.request_details`,
`hr_onboarding_tasks.template_data`, `hr_onboarding_tasks.result_data`,
`pm_dashboard_widgets.cached_data`.

**`TEXT` → `DATE` (5):** `tenants.trial_end_date`, `clients.acquisition_date`,
`firm_benefits_plans.effective_date`, `firm_benefits_plans.end_date`,
`payroll_pay_schedules.next_pay_date`.

**`TEXT` → `TIMESTAMPTZ` (6):** `hr_attendance.clock_in_time`,
`hr_attendance.clock_out_time`, `pm_task_time_entries.start_time`,
`pm_task_time_entries.end_time`, `time_tracking_entries.start_time`,
`time_tracking_entries.end_time`.

### Deferred

**AI Assistant** (`module-ai-assistant.md`, Phase 1 module #5) specifies
`ai_conversations`, `ai_messages`, `ai_knowledge_base` and `ai_user_preferences`.
**None exist**, and the tables were deliberately not added — deferred by
decision, not oversight. Both source schemas predated the module, so the merge
had nothing to carry over. This remains the largest known gap, and it is the
module ADR-001 identifies as the product's clearest differentiator.

### Verified as correctly absent

Not gaps; recorded so they are not "fixed" later:

- **Marketing** — appears in no phase list in `product-specification.md`; the
  spec is HubSpot competitive research, not a build specification.
- **Phase 1B modules** — Proposals, CRM, Client Portal, Document Management and
  Retainer Management have no schema because their module specs do not exist
  yet. Tracked in `MISSING-FUNCTIONALITY.md`.
- **Accounting** — Phase 2, but fully modelled with 17 tables. Ahead of its
  phase, not behind.
- **`dependents` / `beneficiaries`** — stored as JSONB on
  `hr_benefits_enrollments`, a preserved D1 simplification. Worth revisiting if
  per-dependent querying is needed, since `module-hr.md` FR-HR-008 requires
  name, DOB, relationship and SSN per dependent.


---

## Related documents

- [Architecture Decisions](../05-architecture-decisions.md) — ADR-003 tenancy,
  ADR-008 Supabase
- [Customization Model](../06-customization-model.md) — custom fields and settings
- [`schema.sql`](../../packages/database/reference/schema.sql) — the authoritative schema
