# D1 Schema Help Guide - Part 3

> **⚠️ Status: partially superseded — field meanings remain accurate.**
>
> This guide was written against the Cloudflare D1 (SQLite) schema. The
> authoritative schema is now [`schema.sql`](../../packages/database/reference/schema.sql) (Supabase PostgreSQL).
>
> **Still accurate:** every table and field described here exists in the current
> schema, and the *business meaning*, purpose, dependencies and examples are
> unchanged. All 52 tables documented below survive the migration.
>
> **Now stale:** column types (`INTEGER`/`TEXT` → `BOOLEAN`/`TIMESTAMPTZ`/`JSONB`),
> and identifier examples. Natural keys such as `EMP-001` and `US-NYC` are no
> longer primary keys — they are tenant-scoped business keys alongside a surrogate
> `UUID` primary key. See
> [SCHEMA-RECONCILIATION.md](./SCHEMA-RECONCILIATION.md).
>
> Scheduled for a refresh pass; it also does not yet cover the 41 tables added
> during the merge.

---


**Tables 33-52: Compensation, Payroll, Time Tracking, HR Additional**

[← Back to Index](SCHEMA-HELP-GUIDE.md) | [← Part 2](SCHEMA-HELP-GUIDE-PART-2.md)

---

## COMPENSATION MODULE

### Table 33: `compensation_work_schedules`

**Purpose**: Define work schedules with hours per week, shifts, and schedule patterns.

**Dependencies**:
- `employees` (employee on this schedule)

**Key Features**:
- Flexible scheduling (standard, flex, shift-based, etc.)
- Hours per week tracking
- Shift patterns stored as JSONB
- On-call rotation support

#### Columns

| Column | Purpose | Sample Values | Type/Constraints |
|--------|---------|---------------|------------------|
| `schedule_id` | **Primary Key** | `"SCH-001"` | TEXT |
| `employee_id` | Employee | `"EMP-042"` | TEXT, FK to employees, NOT NULL |
| `schedule_type` | Schedule type | `"standard"`, `"flexible"`, `"shift_based"`, `"on_call"`, `"remote"` | TEXT, ENUM, DEFAULT 'standard' |
| `hours_per_week` | Standard hours/week | `40.0`, `35.0`, `20.0` | REAL, NOT NULL, DEFAULT 40.00 |
| `days_per_week` | Working days/week | `5`, `4`, `6` | INTEGER, DEFAULT 5 |
| `shift_pattern` | Shift details **(JSONB)** | `{"monday":{"start":"09:00","end":"17:00","break_minutes":60}}` | TEXT (JSONB), DEFAULT '{}' |
| `is_on_call_rotation` | On-call rotation? | `1`, `0` | INTEGER, DEFAULT 0 |
| `on_call_frequency` | On-call frequency | `"weekly"`, `"bi-weekly"`, `"monthly"` | TEXT |
| `effective_from` | Effective start date | `"2024-01-01"` | TEXT (ISO date), NOT NULL |
| `effective_to` | Effective end date | `"2024-12-31"`, `NULL` (active) | TEXT (ISO date) |
| `notes` | Additional notes | `"Remote worker - flexible hours"` | TEXT |
| `created_at` | Creation timestamp | `"2024-01-01T00:00:00Z"` | TEXT, NOT NULL |
| `updated_at` | Last update timestamp | `"2024-01-15T10:00:00Z"` | TEXT, NOT NULL |
| `created_by` | Creator employee ID | `"EMP-001"` | TEXT, NOT NULL |

**Enumerations**:
- `schedule_type`: See [enumerations.json - employment.workArrangement](enumerations.json)

**Indexes**:
- Index on `employee_id`
- Partial index on `employee_id, effective_from` WHERE `effective_to IS NULL` (active schedules)

---

### Table 34: `compensation_variable`

**Purpose**: Variable compensation (bonuses, commissions) separate from base pay.

**Dependencies**:
- `employees` (employee earning variable comp)

**Key Features**:
- Multiple variable comp types (commission, bonus, profit sharing, etc.)
- Commission structure and quota tracking stored as JSONB
- Performance metrics stored as JSONB
- Frequency and payment tracking

#### Columns

| Column | Purpose | Sample Values | Type/Constraints |
|--------|---------|---------------|------------------|
| `variable_comp_id` | **Primary Key** | `"VC-001"` | TEXT |
| `employee_id` | Employee | `"EMP-042"` | TEXT, FK to employees, NOT NULL |
| `comp_type` | Compensation type | `"commission"`, `"bonus"`, `"profit_sharing"`, `"sales_incentive"` | TEXT, ENUM, NOT NULL |
| `name` | Component name | `"Q4 Performance Bonus"`, `"Sales Commission"` | TEXT, NOT NULL |
| `description` | Description | `"Quarterly performance-based bonus"` | TEXT |
| `target_amount` | Target amount | `10000.00`, `25000.00` | REAL |
| `currency` | Currency | `"USD"`, `"EUR"`, `"INR"` | TEXT, DEFAULT 'USD' |
| `frequency` | Payment frequency | `"monthly"`, `"quarterly"`, `"annually"`, `"one_time"` | TEXT, ENUM, DEFAULT 'quarterly' |
| `commission_structure` | Commission rules **(JSONB)** | See JSONB reference | TEXT (JSONB), DEFAULT '{}' |
| `quota_structure` | Sales quota details **(JSONB)** | See JSONB reference | TEXT (JSONB), DEFAULT '{}' |
| `performance_metrics` | KPIs **(JSONB)** | See JSONB reference | TEXT (JSONB), DEFAULT '{}' |
| `next_payment_date` | Next payment date | `"2024-07-15"` | TEXT (ISO date) |
| `status` | Status | `"active"`, `"inactive"`, `"pending"`, `"completed"` | TEXT, ENUM, DEFAULT 'active' |
| `effective_from` | Effective start date | `"2024-01-01"` | TEXT (ISO date), NOT NULL |
| `effective_to` | Effective end date | `"2024-12-31"`, `NULL` | TEXT (ISO date) |
| `created_at` | Creation timestamp | `"2024-01-01T00:00:00Z"` | TEXT, NOT NULL |
| `updated_at` | Last update timestamp | `"2024-06-15T10:00:00Z"` | TEXT, NOT NULL |
| `created_by` | Creator | `"EMP-001"` | TEXT, NOT NULL |

**JSONB Fields**: See JSONB-FIELD-EXAMPLES.md:
- `commission_structure`: [Example #22](JSONB-FIELD-EXAMPLES.md#22-commission_structure---commission-plan-details)
- `quota_structure`: [Example #23](JSONB-FIELD-EXAMPLES.md#23-quota_structure---sales-quota-details)
- `performance_metrics`: [Example #24](JSONB-FIELD-EXAMPLES.md#24-performance_metrics---performance-measurement)

**Enumerations**:
- `comp_type`: See [enumerations.json - compensation.variableCompType](enumerations.json)
- `frequency`: See [enumerations.json - payroll.payFrequency](enumerations.json)

**Indexes**:
- Index on `employee_id`
- Index on `comp_type`
- Partial index on `status` WHERE `status = 'active'`

---

### Table 35: `compensation_equity`

**Purpose**: Equity compensation (stock options, RSUs, etc.).

**Dependencies**:
- `employees` (employee receiving equity)

**Key Features**:
- Multiple equity types (ISO, NSO, RSU, restricted stock, etc.)
- Grant and vesting tracking
- Exercise price and expiration
- Vesting schedule stored as JSONB

#### Columns

| Column | Purpose | Sample Values | Type/Constraints |
|--------|---------|---------------|------------------|
| `equity_grant_id` | **Primary Key** | `"EQ-001"` | TEXT |
| `employee_id` | Employee | `"EMP-042"` | TEXT, FK to employees, NOT NULL |
| `equity_type` | Type of equity | `"stock_options"`, `"iso"`, `"nso"`, `"rsu"`, `"restricted_stock"` | TEXT, ENUM, NOT NULL |
| `grant_name` | Grant name | `"2024 New Hire Grant"`, `"2024 Annual Refresh"` | TEXT, NOT NULL |
| `grant_date` | Grant date | `"2024-01-15"` | TEXT (ISO date), NOT NULL |
| `grant_shares` | Shares granted | `10000`, `5000` | INTEGER, NOT NULL |
| `vesting_type` | Vesting schedule type | `"time_based"`, `"milestone_based"`, `"performance_based"` | TEXT, ENUM, DEFAULT 'time_based' |
| `vesting_start_date` | Vesting start | `"2024-01-15"` | TEXT (ISO date), NOT NULL |
| `vesting_end_date` | Vesting end | `"2028-01-15"` (4 years) | TEXT (ISO date) |
| `vesting_schedule` | Vesting details **(JSONB)** | `{"cliff_months":12,"monthly_vest":true,"schedule":[...]}` | TEXT (JSONB), DEFAULT '{}' |
| `vested_shares` | Shares vested to date | `2500`, `0` | INTEGER, DEFAULT 0 |
| `unvested_shares` | Shares not yet vested | `7500`, `10000` | INTEGER |
| `exercise_price` | Strike price (options) | `10.50`, `25.00` | REAL |
| `current_fair_market_value` | Current FMV | `45.00`, `30.00` | REAL |
| `expiration_date` | Expiration date (options) | `"2034-01-15"` (10 years) | TEXT (ISO date) |
| `status` | Status | `"active"`, `"vested"`, `"exercised"`, `"forfeited"`, `"expired"` | TEXT, ENUM, DEFAULT 'active' |
| `notes` | Additional notes | `"Subject to board approval"` | TEXT |
| `created_at` | Creation timestamp | `"2024-01-15T00:00:00Z"` | TEXT, NOT NULL |
| `updated_at` | Last update timestamp | `"2024-06-15T10:00:00Z"` | TEXT, NOT NULL |
| `created_by` | Creator | `"EMP-001"` | TEXT, NOT NULL |

**Enumerations**:
- `equity_type`: See [enumerations.json - compensation.equityType](enumerations.json)
- `vesting_type`: See [enumerations.json - compensation.vestingType](enumerations.json)

**Indexes**:
- Index on `employee_id`
- Index on `equity_type`
- Index on `status`
- Partial index on `vesting_end_date` WHERE `status = 'active'`

---

### Table 36: `compensation_allowances`

**Purpose**: Additional allowances (housing, transportation, meals, phone, etc.).

**Dependencies**:
- `employees` (employee receiving allowance)

**Key Features**:
- Multiple allowance types (housing, transport, meal, phone, etc.)
- Amount and frequency tracking
- Taxability configuration
- Effective date ranges

#### Columns

| Column | Purpose | Sample Values | Type/Constraints |
|--------|---------|---------------|------------------|
| `allowance_id` | **Primary Key** | `"ALW-001"` | TEXT |
| `employee_id` | Employee | `"EMP-042"` | TEXT, FK to employees, NOT NULL |
| `allowance_type` | Type of allowance | `"housing"`, `"transportation"`, `"meal"`, `"phone"`, `"internet"` | TEXT, ENUM, NOT NULL |
| `name` | Allowance name | `"Monthly Housing Allowance"`, `"Meal Vouchers"` | TEXT, NOT NULL |
| `amount` | Amount per period | `2000.00`, `500.00` | REAL, NOT NULL |
| `currency` | Currency | `"USD"`, `"INR"`, `"EUR"` | TEXT, DEFAULT 'USD' |
| `frequency` | Payment frequency | `"monthly"`, `"bi-weekly"`, `"quarterly"` | TEXT, ENUM, DEFAULT 'monthly' |
| `is_taxable` | Taxable allowance? | `1` (taxable), `0` (non-taxable) | INTEGER, DEFAULT 1 |
| `effective_from` | Effective start | `"2024-01-01"` | TEXT (ISO date), NOT NULL |
| `effective_to` | Effective end | `"2024-12-31"`, `NULL` | TEXT (ISO date) |
| `notes` | Additional notes | `"Includes utilities and parking"` | TEXT |
| `created_at` | Creation timestamp | `"2024-01-01T00:00:00Z"` | TEXT, NOT NULL |
| `updated_at` | Last update timestamp | `"2024-01-15T10:00:00Z"` | TEXT, NOT NULL |
| `created_by` | Creator | `"EMP-001"` | TEXT, NOT NULL |

**Enumerations**:
- `allowance_type`: See [enumerations.json - compensation.allowanceType](enumerations.json)
- `frequency`: See [enumerations.json - payroll.payFrequency](enumerations.json)

**Indexes**:
- Index on `employee_id`
- Index on `allowance_type`
- Partial index on `employee_id, effective_from` WHERE `effective_to IS NULL` (active allowances)

---

### Table 37: `compensation_premiums`

**Purpose**: Pay premiums and differentials (shift differential, weekend, on-call, hazard pay, etc.).

**Dependencies**:
- `employees` (employee receiving premium)

**Key Features**:
- Multiple premium types (shift differential, weekend, holiday, on-call, etc.)
- Percentage or flat amount
- Effective date ranges
- Conditions stored as JSONB

#### Columns

| Column | Purpose | Sample Values | Type/Constraints |
|--------|---------|---------------|------------------|
| `premium_id` | **Primary Key** | `"PREM-001"` | TEXT |
| `employee_id` | Employee | `"EMP-042"` | TEXT, FK to employees, NOT NULL |
| `premium_type` | Type of premium | `"shift_differential"`, `"weekend"`, `"holiday"`, `"on_call"`, `"hazard_pay"` | TEXT, ENUM, NOT NULL |
| `name` | Premium name | `"Night Shift Differential"`, `"Weekend Premium"` | TEXT, NOT NULL |
| `premium_rate_type` | Rate type | `"percentage"`, `"flat_amount"`, `"hourly_rate"` | TEXT, ENUM, NOT NULL |
| `premium_rate` | Premium rate | `15.0` (15% increase), `5.00` (extra $5/hr) | REAL, NOT NULL |
| `currency` | Currency (if flat/hourly) | `"USD"`, `NULL` | TEXT |
| `conditions` | Premium conditions **(JSONB)** | `{"hours":{"start":"18:00","end":"06:00"},"days":["saturday","sunday"]}` | TEXT (JSONB), DEFAULT '{}' |
| `effective_from` | Effective start | `"2024-01-01"` | TEXT (ISO date), NOT NULL |
| `effective_to` | Effective end | `"2024-12-31"`, `NULL` | TEXT (ISO date) |
| `notes` | Additional notes | `"Applies to all hours worked 6pm-6am"` | TEXT |
| `created_at` | Creation timestamp | `"2024-01-01T00:00:00Z"` | TEXT, NOT NULL |
| `updated_at` | Last update timestamp | `"2024-01-15T10:00:00Z"` | TEXT, NOT NULL |
| `created_by` | Creator | `"EMP-001"` | TEXT, NOT NULL |

**Enumerations**:
- `premium_type`: See [enumerations.json - compensation.premiumType](enumerations.json)

**Indexes**:
- Index on `employee_id`
- Index on `premium_type`
- Partial index on `employee_id, effective_from` WHERE `effective_to IS NULL` (active premiums)

---

## PAYROLL MODULE

### Table 38: `payroll_runs`

**Purpose**: Payroll processing runs (regular, off-cycle, bonus, etc.).

**Dependencies**: None (foundational table)

**Key Features**:
- Multiple run types (regular, off-cycle, bonus, correction, etc.)
- Status tracking through workflow (draft → calculating → approved → finalized → paid)
- Pay period and payment date tracking
- Audit trail with approver and processor

#### Columns

| Column | Purpose | Sample Values | Type/Constraints |
|--------|---------|---------------|------------------|
| `run_id` | **Primary Key** | `"PR-2024-001"` | TEXT |
| `run_type` | Type of payroll run | `"regular"`, `"off_cycle"`, `"bonus"`, `"correction"`, `"termination"` | TEXT, ENUM, DEFAULT 'regular' |
| `run_name` | Run name | `"Bi-Weekly Payroll #1 2024"`, `"Q4 Bonus Run"` | TEXT, NOT NULL |
| `pay_period_start` | Pay period start date | `"2024-01-01"` | TEXT (ISO date), NOT NULL |
| `pay_period_end` | Pay period end date | `"2024-01-14"` | TEXT (ISO date), NOT NULL |
| `payment_date` | Payment date | `"2024-01-19"` | TEXT (ISO date), NOT NULL |
| `status` | Payroll run status | `"draft"`, `"calculating"`, `"pending_approval"`, `"approved"`, `"finalized"`, `"paid"` | TEXT, ENUM, DEFAULT 'draft' |
| `employee_count` | Employees in run | `142`, `50` | INTEGER, DEFAULT 0 |
| `total_gross_pay` | Total gross pay | `450000.00` | REAL, DEFAULT 0.00 |
| `total_net_pay` | Total net pay | `320000.00` | REAL, DEFAULT 0.00 |
| `total_employer_taxes` | Total employer taxes | `35000.00` | REAL, DEFAULT 0.00 |
| `currency` | Currency | `"USD"`, `"INR"` | TEXT, DEFAULT 'USD' |
| `calculated_at` | Calculation timestamp | `"2024-01-17T10:00:00Z"`, `NULL` | TEXT |
| `approved_at` | Approval timestamp | `"2024-01-17T14:00:00Z"`, `NULL` | TEXT |
| `approved_by` | Approver employee ID | `"EMP-001"` (CFO), `NULL` | TEXT, FK to employees |
| `finalized_at` | Finalization timestamp | `"2024-01-18T09:00:00Z"`, `NULL` | TEXT |
| `finalized_by` | Finalizer employee ID | `"EMP-002"`, `NULL` | TEXT, FK to employees |
| `paid_at` | Payment timestamp | `"2024-01-19T00:00:00Z"`, `NULL` | TEXT |
| `notes` | Additional notes | `"Includes year-end bonuses"` | TEXT |
| `created_at` | Creation timestamp | `"2024-01-15T00:00:00Z"` | TEXT, NOT NULL |
| `updated_at` | Last update timestamp | `"2024-01-19T00:00:00Z"` | TEXT, NOT NULL |
| `created_by` | Creator | `"EMP-002"` (Payroll Admin) | TEXT, NOT NULL |

**Enumerations**:
- `run_type`: See [enumerations.json - payroll.payrollRunType](enumerations.json)
- `status`: See [enumerations.json - payroll.payrollRunStatus](enumerations.json)

**Indexes**:
- Index on `status`
- Index on `pay_period_start, pay_period_end`
- Index on `payment_date`

---

### Table 39: `payroll_run_employees`

**Purpose**: Individual employee paystubs within a payroll run.

**Dependencies**:
- `payroll_runs` (parent payroll run)
- `employees` (employee being paid)

**Key Features**:
- Detailed earnings breakdown stored as JSONB
- Pre-tax and post-tax deductions stored as JSONB
- Tax withholdings stored as JSONB
- Employer taxes stored as JSONB
- Taxable wage bases stored as JSONB
- Payment method details stored as JSONB
- Calculation audit trail stored as JSONB

#### Columns

| Column | Purpose | Sample Values | Type/Constraints |
|--------|---------|---------------|------------------|
| `paystub_id` | **Primary Key** | `"PS-2024-001-EMP042"` | TEXT |
| `run_id` | Payroll run | `"PR-2024-001"` | TEXT, FK to payroll_runs, NOT NULL |
| `employee_id` | Employee | `"EMP-042"` | TEXT, FK to employees, NOT NULL |
| `employee_name` | Employee name | `"John Smith"` | TEXT, NOT NULL |
| `pay_period_start` | Pay period start | `"2024-01-01"` | TEXT (ISO date), NOT NULL |
| `pay_period_end` | Pay period end | `"2024-01-14"` | TEXT (ISO date), NOT NULL |
| `payment_date` | Payment date | `"2024-01-19"` | TEXT (ISO date), NOT NULL |
| `regular_hours` | Regular hours worked | `80.0` | REAL, DEFAULT 0.00 |
| `overtime_hours` | Overtime hours | `5.0`, `0.0` | REAL, DEFAULT 0.00 |
| `pto_hours` | PTO hours used | `8.0`, `0.0` | REAL, DEFAULT 0.00 |
| `earnings` | Earnings breakdown **(JSONB)** | See JSONB reference | TEXT (JSONB), NOT NULL, DEFAULT '{}' |
| `gross_pay` | Total gross pay | `5467.80` | REAL, NOT NULL, DEFAULT 0.00 |
| `pretax_deductions` | Pre-tax deductions **(JSONB)** | See JSONB reference | TEXT (JSONB), DEFAULT '{}' |
| `taxes` | Tax withholdings **(JSONB)** | See JSONB reference | TEXT (JSONB), DEFAULT '{}' |
| `total_taxes` | Total taxes withheld | `1277.38` | REAL, DEFAULT 0.00 |
| `posttax_deductions` | Post-tax deductions **(JSONB)** | See JSONB reference | TEXT (JSONB), DEFAULT '{}' |
| `net_pay` | Net pay (take-home) | `3353.96` | REAL, NOT NULL, DEFAULT 0.00 |
| `employer_taxes` | Employer tax contributions **(JSONB)** | See JSONB reference | TEXT (JSONB), DEFAULT '{}' |
| `total_employer_taxes` | Total employer taxes | `401.38` | REAL, DEFAULT 0.00 |
| `taxable_wages` | Taxable wage bases **(JSONB)** | See JSONB reference | TEXT (JSONB), DEFAULT '{}' |
| `payment_method` | Payment method | `"direct_deposit"`, `"check"`, `"paycard"` | TEXT, ENUM, DEFAULT 'direct_deposit' |
| `payment_details` | Payment details **(JSONB)** | See JSONB reference | TEXT (JSONB), DEFAULT '{}' |
| `calculation_details` | Calculation audit trail **(JSONB)** | See JSONB reference | TEXT (JSONB), DEFAULT '{}' |
| `currency` | Currency | `"USD"`, `"INR"` | TEXT, DEFAULT 'USD' |
| `is_void` | Voided paystub? | `1`, `0` | INTEGER, DEFAULT 0 |
| `void_reason` | Void reason | `"Correction needed"`, `NULL` | TEXT |
| `void_date` | Void timestamp | `"2024-01-20T10:00:00Z"`, `NULL` | TEXT |
| `created_at` | Creation timestamp | `"2024-01-17T10:00:00Z"` | TEXT, NOT NULL |
| `updated_at` | Last update timestamp | `"2024-01-17T14:00:00Z"` | TEXT, NOT NULL |

**JSONB Fields**: See JSONB-FIELD-EXAMPLES.md:
- `earnings`: [Example #14](JSONB-FIELD-EXAMPLES.md#14-earnings---earnings-breakdown)
- `pretax_deductions`: [Example #15](JSONB-FIELD-EXAMPLES.md#15-pretax_deductions---pre-tax-deductions)
- `taxes`: [Example #16](JSONB-FIELD-EXAMPLES.md#16-taxes---tax-withholdings)
- `employer_taxes`: [Example #17](JSONB-FIELD-EXAMPLES.md#17-employer_taxes---employer-tax-contributions)
- `posttax_deductions`: [Example #18](JSONB-FIELD-EXAMPLES.md#18-posttax_deductions---post-tax-deductions)
- `taxable_wages`: [Example #19](JSONB-FIELD-EXAMPLES.md#19-taxable_wages---taxable-wage-breakdown)
- `payment_details`: [Example #20](JSONB-FIELD-EXAMPLES.md#20-payment_details---payment-method-info)
- `calculation_details`: [Example #21](JSONB-FIELD-EXAMPLES.md#21-calculation_details---payroll-calculation-audit-trail)

**Enumerations**:
- `payment_method`: See [enumerations.json - payroll.paymentMethod](enumerations.json)

**Indexes**:
- UNIQUE on `(run_id, employee_id)`
- Index on `employee_id`
- Index on `run_id`
- Partial index on `is_void` WHERE `is_void = 0` (active paystubs)

---

### Table 40: `payroll_tax_rates`

**Purpose**: Tax rate reference data (federal, state, local, FICA, etc.).

**Dependencies**: None (reference data)

**Key Features**:
- Multiple tax types (federal income, state, social security, medicare, etc.)
- Country and state/province specific
- Effective date ranges
- Rate structure stored as JSONB (brackets, thresholds, etc.)

#### Columns

| Column | Purpose | Sample Values | Type/Constraints |
|--------|---------|---------------|------------------|
| `tax_rate_id` | **Primary Key** | `"TAX-US-FED-2024"`, `"TAX-CA-NY-2024"` | TEXT |
| `country` | Country code | `"US"`, `"CA"`, `"IN"` | TEXT, NOT NULL |
| `state_province` | State/province code | `"CA"`, `"NY"`, `"ON"`, `"MH"` | TEXT |
| `locality` | City/locality | `"New York City"`, `NULL` | TEXT |
| `tax_type` | Type of tax | `"federal_income_tax"`, `"state_income_tax"`, `"social_security"`, `"medicare"` | TEXT, ENUM, NOT NULL |
| `tax_name` | Tax name | `"Federal Income Tax"`, `"California SDI"` | TEXT, NOT NULL |
| `tax_year` | Tax year | `2024`, `2025` | INTEGER, NOT NULL |
| `rate_structure` | Tax brackets/rates **(JSONB)** | `{"type":"progressive","brackets":[{"min":0,"max":11000,"rate":0.10},...]}` | TEXT (JSONB), NOT NULL, DEFAULT '{}' |
| `wage_base_limit` | Wage base cap | `168600.00` (2024 SS), `NULL` (no cap) | REAL |
| `effective_from` | Effective start | `"2024-01-01"` | TEXT (ISO date), NOT NULL |
| `effective_to` | Effective end | `"2024-12-31"`, `NULL` | TEXT (ISO date) |
| `is_active` | Currently active? | `1`, `0` | INTEGER, DEFAULT 1 |
| `notes` | Additional notes | `"Updated for 2024 tax year"` | TEXT |
| `created_at` | Creation timestamp | `"2023-12-01T00:00:00Z"` | TEXT, NOT NULL |
| `updated_at` | Last update timestamp | `"2023-12-15T10:00:00Z"` | TEXT, NOT NULL |

**Enumerations**:
- `tax_type`: See [enumerations.json - payroll.taxType](enumerations.json)
- `country`: See [enumerations.json - geography.country](enumerations.json)

**Indexes**:
- Index on `country, state_province, tax_type`
- Index on `tax_year`
- Partial index on `is_active` WHERE `is_active = 1`

---

### Table 41: `payroll_deduction_definitions`

**Purpose**: Define deduction types (401k, health insurance, dental, garnishments, etc.).

**Dependencies**: None (foundational configuration)

**Key Features**:
- Multiple deduction categories
- Pre-tax vs. post-tax classification
- Default rates and limits
- Employer match configuration (for 401k, etc.)

#### Columns

| Column | Purpose | Sample Values | Type/Constraints |
|--------|---------|---------------|------------------|
| `deduction_code` | **Primary Key** - Deduction code | `"401K"`, `"HEALTH"`, `"DENTAL"` | TEXT, 2-20 chars, A-Z0-9- |
| `deduction_name` | Deduction name | `"401(k) Contribution"`, `"Health Insurance"` | TEXT, NOT NULL |
| `category` | Deduction category | `"retirement_401k"`, `"health_insurance"`, `"garnishment"`, `"union_dues"` | TEXT, ENUM, NOT NULL |
| `is_pretax` | Pre-tax deduction? | `1` (pre-tax), `0` (post-tax) | INTEGER, DEFAULT 1 |
| `default_rate_type` | Rate type | `"percentage"`, `"flat_amount"` | TEXT, ENUM |
| `default_rate` | Default rate | `6.0` (6% of pay), `250.00` (flat $250) | REAL |
| `max_annual_amount` | Annual max | `23000.00` (2024 401k limit), `NULL` | REAL |
| `employer_match_enabled` | Employer match? | `1`, `0` | INTEGER, DEFAULT 0 |
| `employer_match_type` | Match type | `"percentage"`, `"dollar_for_dollar"`, `NULL` | TEXT |
| `employer_match_rate` | Match rate | `3.0` (match up to 3%), `NULL` | REAL |
| `employer_match_max` | Match max | `6000.00`, `NULL` | REAL |
| `is_active` | Currently active? | `1`, `0` | INTEGER, DEFAULT 1 |
| `notes` | Additional notes | `"Company matches up to 3% of salary"` | TEXT |
| `created_at` | Creation timestamp | `"2024-01-01T00:00:00Z"` | TEXT, NOT NULL |
| `updated_at` | Last update timestamp | `"2024-01-15T10:00:00Z"` | TEXT, NOT NULL |
| `created_by` | Creator | `"EMP-001"` | TEXT, NOT NULL |

**Enumerations**:
- `category`: See [enumerations.json - payroll.deductionCategory](enumerations.json)

**Indexes**:
- Index on `category`
- Partial index on `is_active` WHERE `is_active = 1`

---

### Table 42: `payroll_employee_deductions`

**Purpose**: Employee-specific deduction configurations (override defaults).

**Dependencies**:
- `employees` (employee)
- `payroll_deduction_definitions` (deduction type)

**Key Features**:
- Employee-specific rates and amounts
- Effective date ranges
- Override default deduction settings
- Support for multiple deductions of same type

#### Columns

| Column | Purpose | Sample Values | Type/Constraints |
|--------|---------|---------------|------------------|
| `employee_deduction_id` | **Primary Key** | `"ED-001"` | TEXT |
| `employee_id` | Employee | `"EMP-042"` | TEXT, FK to employees, NOT NULL |
| `deduction_code` | Deduction type | `"401K"`, `"HEALTH"`, `"DENTAL"` | TEXT, FK to payroll_deduction_definitions, NOT NULL |
| `rate_type` | Rate type | `"percentage"`, `"flat_amount"` | TEXT, ENUM, NOT NULL |
| `rate` | Deduction rate | `6.0` (6% of pay), `350.00` (flat $350) | REAL, NOT NULL |
| `annual_max_amount` | Annual max override | `23000.00`, `NULL` (use default) | REAL |
| `effective_from` | Effective start | `"2024-01-01"` | TEXT (ISO date), NOT NULL |
| `effective_to` | Effective end | `"2024-12-31"`, `NULL` | TEXT (ISO date) |
| `notes` | Additional notes | `"Increased to match bonus"` | TEXT |
| `created_at` | Creation timestamp | `"2024-01-01T00:00:00Z"` | TEXT, NOT NULL |
| `updated_at` | Last update timestamp | `"2024-01-15T10:00:00Z"` | TEXT, NOT NULL |
| `created_by` | Creator | `"EMP-042"` (self-service) | TEXT, NOT NULL |

**Indexes**:
- Index on `employee_id`
- Index on `deduction_code`
- Partial index on `employee_id, effective_from` WHERE `effective_to IS NULL` (active deductions)

---

### Table 43: `payroll_tax_deposits`

**Purpose**: Track tax deposits/payments to government agencies.

**Dependencies**:
- `payroll_runs` (optional - link to specific payroll run)

**Key Features**:
- Tax deposit tracking by type and period
- Payment confirmation
- Deposit schedule tracking (weekly, monthly, etc.)
- Reference number and confirmation tracking

#### Columns

| Column | Purpose | Sample Values | Type/Constraints |
|--------|---------|---------------|------------------|
| `deposit_id` | **Primary Key** | `"TD-2024-001"` | TEXT |
| `run_id` | Payroll run (if applicable) | `"PR-2024-001"`, `NULL` | TEXT, FK to payroll_runs |
| `tax_type` | Type of tax | `"federal_income_tax"`, `"social_security"`, `"medicare"`, `"state_income_tax"` | TEXT, ENUM, NOT NULL |
| `tax_period_start` | Tax period start | `"2024-01-01"` | TEXT (ISO date), NOT NULL |
| `tax_period_end` | Tax period end | `"2024-01-31"` | TEXT (ISO date), NOT NULL |
| `deposit_due_date` | Deposit due date | `"2024-02-15"` | TEXT (ISO date), NOT NULL |
| `deposit_amount` | Deposit amount | `45000.00` | REAL, NOT NULL |
| `currency` | Currency | `"USD"`, `"INR"` | TEXT, DEFAULT 'USD' |
| `payment_date` | Payment date | `"2024-02-14"`, `NULL` | TEXT (ISO date) |
| `payment_method` | Payment method | `"eftps"`, `"wire_transfer"`, `"check"` | TEXT |
| `confirmation_number` | Confirmation number | `"EFTPS-123456789"` | TEXT |
| `status` | Deposit status | `"pending"`, `"submitted"`, `"confirmed"`, `"failed"` | TEXT, ENUM, DEFAULT 'pending' |
| `notes` | Additional notes | `"Q1 2024 federal tax deposit"` | TEXT |
| `created_at` | Creation timestamp | `"2024-02-10T00:00:00Z"` | TEXT, NOT NULL |
| `updated_at` | Last update timestamp | `"2024-02-14T15:00:00Z"` | TEXT, NOT NULL |
| `created_by` | Creator | `"EMP-002"` (Payroll Admin) | TEXT, NOT NULL |

**Enumerations**:
- `tax_type`: See [enumerations.json - payroll.taxType](enumerations.json)
- `status`: See [enumerations.json - payroll.depositStatus](enumerations.json)

**Indexes**:
- Partial index on `run_id` WHERE `run_id IS NOT NULL`
- Index on `tax_type`
- Index on `deposit_due_date`
- Index on `status`

---

## TIME TRACKING MODULE

### Table 44: `time_tracking_entries`

**Purpose**: Individual time tracking entries (general time tracking, not task-specific).

**Dependencies**:
- `employees` (employee who worked)
- `projects` (optional - project worked on)
- `tasks` (optional - task worked on)
- `employees` (optional - approver)

**Key Features**:
- Timer-based or manual entry
- Project and task association
- Billable vs. non-billable tracking
- Activity type categorization
- Approval workflow
- Tags for categorization

#### Columns

| Column | Purpose | Sample Values | Type/Constraints |
|--------|---------|---------------|------------------|
| `entry_id` | **Primary Key** | `"TE-2024-001"` | TEXT |
| `employee_id` | Employee who worked | `"EMP-042"` | TEXT, FK to employees, NOT NULL |
| `project_id` | Project (optional) | `"PROJ-2024-001"`, `NULL` | TEXT, FK to projects |
| `task_id` | Task (optional) | `"TASK-142"`, `NULL` | TEXT, FK to tasks |
| `entry_date` | Date of work | `"2024-06-15"` | TEXT (ISO date), NOT NULL |
| `start_time` | Start time | `"2024-06-15T09:00:00Z"` | TEXT |
| `end_time` | End time | `"2024-06-15T11:30:00Z"`, `NULL` (running timer) | TEXT |
| `duration_minutes` | Duration (minutes) | `150` (2.5 hours) | INTEGER |
| `hours` | Hours (decimal) | `2.5`, `8.0` | REAL, NOT NULL |
| `is_manual_entry` | Manual entry? | `1`, `0` | INTEGER, DEFAULT 0 |
| `entry_type` | How created | `"timer"`, `"manual"`, `"imported"`, `"auto_generated"` | TEXT, ENUM, DEFAULT 'manual' |
| `activity_type` | Type of work | `"development"`, `"design"`, `"meeting"`, `"admin"`, `"qa"` | TEXT, ENUM |
| `description` | Work description | `"Worked on homepage redesign"` | TEXT |
| `is_billable` | Billable to client? | `1`, `0` | INTEGER, DEFAULT 1 |
| `hourly_rate` | Hourly rate | `150.00`, `200.00` | REAL |
| `billable_amount` | Amount (hours × rate) | `375.00` | REAL |
| `tags` | Tags for categorization | `"client-facing urgent"`, `NULL` | TEXT |
| `status` | Entry status | `"draft"`, `"submitted"`, `"approved"`, `"rejected"`, `"invoiced"` | TEXT, ENUM, DEFAULT 'draft' |
| `approved_by` | Approver | `"EMP-010"`, `NULL` | TEXT, FK to employees |
| `approved_at` | Approval timestamp | `"2024-06-16T10:00:00Z"`, `NULL` | TEXT |
| `invoice_id` | Invoice (if invoiced) | `"INV-001"`, `NULL` | TEXT |
| `timesheet_id` | Timesheet (if submitted) | `"TS-2024-W25"`, `NULL` | TEXT, FK to time_tracking_timesheets |
| `created_at` | Creation timestamp | `"2024-06-15T09:00:00Z"` | TEXT, NOT NULL |
| `updated_at` | Last update timestamp | `"2024-06-15T11:30:00Z"` | TEXT, NOT NULL |

**Enumerations**:
- `entry_type`: See [enumerations.json - timeTracking.timeEntryType](enumerations.json)
- `activity_type`: See [enumerations.json - timeTracking.activityType](enumerations.json)
- `status`: See [enumerations.json - timeTracking.timeEntryStatus](enumerations.json)

**Indexes**:
- Index on `employee_id, entry_date DESC`
- Partial index on `project_id` WHERE `project_id IS NOT NULL`
- Partial index on `task_id` WHERE `task_id IS NOT NULL`
- Index on `status`
- Partial index on `timesheet_id` WHERE `timesheet_id IS NOT NULL`

---

### Table 45: `time_tracking_timesheets`

**Purpose**: Timesheet aggregations (weekly, bi-weekly, monthly) for approval and invoicing.

**Dependencies**:
- `employees` (employee)
- `employees` (approver)

**Key Features**:
- Period-based aggregation (weekly, bi-weekly, monthly)
- Approval workflow
- Invoice linking
- Total hours and billable amount tracking

#### Columns

| Column | Purpose | Sample Values | Type/Constraints |
|--------|---------|---------------|------------------|
| `timesheet_id` | **Primary Key** | `"TS-2024-W25"`, `"TS-2024-M06"` | TEXT |
| `employee_id` | Employee | `"EMP-042"` | TEXT, FK to employees, NOT NULL |
| `period_type` | Period frequency | `"weekly"`, `"bi_weekly"`, `"monthly"` | TEXT, ENUM, NOT NULL |
| `period_start` | Period start date | `"2024-06-10"` | TEXT (ISO date), NOT NULL |
| `period_end` | Period end date | `"2024-06-16"` | TEXT (ISO date), NOT NULL |
| `total_hours` | Total hours | `42.5`, `80.0` | REAL, DEFAULT 0.00 |
| `billable_hours` | Billable hours | `38.0` | REAL, DEFAULT 0.00 |
| `non_billable_hours` | Non-billable hours | `4.5` | REAL, DEFAULT 0.00 |
| `total_billable_amount` | Total billable amount | `5700.00` | REAL, DEFAULT 0.00 |
| `entry_count` | Number of time entries | `15` | INTEGER, DEFAULT 0 |
| `status` | Timesheet status | `"draft"`, `"submitted"`, `"approved"`, `"rejected"`, `"invoiced"` | TEXT, ENUM, DEFAULT 'draft' |
| `submitted_at` | Submission timestamp | `"2024-06-17T09:00:00Z"`, `NULL` | TEXT |
| `approved_by` | Approver | `"EMP-010"`, `NULL` | TEXT, FK to employees |
| `approved_at` | Approval timestamp | `"2024-06-17T14:00:00Z"`, `NULL` | TEXT |
| `rejected_at` | Rejection timestamp | `"2024-06-17T14:00:00Z"`, `NULL` | TEXT |
| `rejection_reason` | Rejection reason | `"Missing time entries for 6/14"`, `NULL` | TEXT |
| `invoice_id` | Invoice (if invoiced) | `"INV-001"`, `NULL` | TEXT |
| `notes` | Additional notes | `"Includes 5 hours overtime"` | TEXT |
| `created_at` | Creation timestamp | `"2024-06-10T00:00:00Z"` | TEXT, NOT NULL |
| `updated_at` | Last update timestamp | `"2024-06-17T14:00:00Z"` | TEXT, NOT NULL |

**Enumerations**:
- `period_type`: See [enumerations.json - timeTracking.periodType](enumerations.json)
- `status`: See [enumerations.json - timeTracking.timesheetStatus](enumerations.json)

**Indexes**:
- UNIQUE on `(employee_id, period_start, period_end)`
- Index on `employee_id`
- Index on `status`
- Index on `period_start, period_end`
- Partial index on `approved_by, status` WHERE `status = 'submitted'` (pending approvals)

---

### Table 46: `time_tracking_billable_expenses`

**Purpose**: Track billable expenses (travel, meals, supplies, etc.) for client invoicing.

**Dependencies**:
- `employees` (employee who incurred expense)
- `projects` (optional - project expense)
- `employees` (optional - approver)

**Key Features**:
- Multiple expense categories
- Receipt attachment support
- Approval workflow
- Invoice linking
- Reimbursement tracking

#### Columns

| Column | Purpose | Sample Values | Type/Constraints |
|--------|---------|---------------|------------------|
| `expense_id` | **Primary Key** | `"EXP-2024-001"` | TEXT |
| `employee_id` | Employee | `"EMP-042"` | TEXT, FK to employees, NOT NULL |
| `project_id` | Project (optional) | `"PROJ-2024-001"`, `NULL` | TEXT, FK to projects |
| `expense_date` | Expense date | `"2024-06-15"` | TEXT (ISO date), NOT NULL |
| `category` | Expense category | `"travel"`, `"meals"`, `"lodging"`, `"supplies"`, `"mileage"` | TEXT, ENUM, NOT NULL |
| `expense_type` | Expense type | `"general"`, `"mileage"`, `"per_diem"`, `"travel"` | TEXT, ENUM, DEFAULT 'general' |
| `description` | Expense description | `"Client meeting lunch - ACME Corp"` | TEXT, NOT NULL |
| `merchant_name` | Merchant/vendor | `"Starbucks"`, `"Delta Airlines"` | TEXT |
| `amount` | Expense amount | `85.50`, `450.00` | REAL, NOT NULL |
| `currency` | Currency | `"USD"`, `"EUR"` | TEXT, DEFAULT 'USD' |
| `is_billable` | Billable to client? | `1`, `0` | INTEGER, DEFAULT 1 |
| `markup_percentage` | Markup % | `10.0` (10% markup), `0.0` | REAL, DEFAULT 0.00 |
| `billable_amount` | Billable amount | `94.05` (with markup) | REAL |
| `receipt_url` | Receipt image URL | `"https://cdn.../receipt-123.pdf"` | TEXT |
| `mileage_distance` | Miles driven (if mileage) | `45.5`, `NULL` | REAL |
| `mileage_rate` | Rate per mile | `0.655` (2024 IRS rate), `NULL` | REAL |
| `status` | Expense status | `"draft"`, `"submitted"`, `"approved"`, `"rejected"`, `"invoiced"`, `"reimbursed"` | TEXT, ENUM, DEFAULT 'draft' |
| `submitted_at` | Submission timestamp | `"2024-06-16T09:00:00Z"`, `NULL` | TEXT |
| `approved_by` | Approver | `"EMP-010"`, `NULL` | TEXT, FK to employees |
| `approved_at` | Approval timestamp | `"2024-06-16T14:00:00Z"`, `NULL` | TEXT |
| `rejected_at` | Rejection timestamp | `NULL` | TEXT |
| `rejection_reason` | Rejection reason | `"Missing receipt"`, `NULL` | TEXT |
| `invoice_id` | Invoice (if invoiced) | `"INV-001"`, `NULL` | TEXT |
| `reimbursed_at` | Reimbursement timestamp | `"2024-06-19T00:00:00Z"`, `NULL` | TEXT |
| `notes` | Additional notes | `"Split with colleague - my portion"` | TEXT |
| `created_at` | Creation timestamp | `"2024-06-15T15:00:00Z"` | TEXT, NOT NULL |
| `updated_at` | Last update timestamp | `"2024-06-16T14:00:00Z"` | TEXT, NOT NULL |

**Enumerations**:
- `category`: See [enumerations.json - expenses.expenseCategory](enumerations.json)
- `expense_type`: See [enumerations.json - accounting.expenseType](enumerations.json)
- `status`: See [enumerations.json - expenses.expenseStatus](enumerations.json)

**Indexes**:
- Index on `employee_id, expense_date DESC`
- Partial index on `project_id` WHERE `project_id IS NOT NULL`
- Index on `status`
- Partial index on `approved_by, status` WHERE `status = 'submitted'` (pending approvals)

---

## HR MODULE - ADDITIONAL FEATURES

### Table 47: `hr_employee_documents`

**Purpose**: Store employee document metadata (contracts, I-9, W-4, certifications, etc.).

**Dependencies**:
- `employees` (employee)

**Key Features**:
- Multiple document categories
- Expiration tracking
- Approval workflow
- Document status tracking (pending upload, uploaded, approved, expired)

#### Columns

| Column | Purpose | Sample Values | Type/Constraints |
|--------|---------|---------------|------------------|
| `document_id` | **Primary Key** | `"DOC-001"` | TEXT |
| `employee_id` | Employee | `"EMP-042"` | TEXT, FK to employees, NOT NULL |
| `category` | Document category | `"contract"`, `"i9"`, `"w4"`, `"certification"`, `"nda"` | TEXT, ENUM, NOT NULL |
| `document_name` | Document name | `"Employment Contract - John Smith"` | TEXT, NOT NULL |
| `file_name` | Original filename | `"contract-signed.pdf"` | TEXT |
| `file_url` | Document URL | `"https://cdn.../contract-123.pdf"` | TEXT, NOT NULL |
| `file_size_bytes` | File size | `1048576` (1 MB) | INTEGER |
| `mime_type` | MIME type | `"application/pdf"`, `"image/jpeg"` | TEXT |
| `issue_date` | Issue/upload date | `"2024-01-15"` | TEXT (ISO date) |
| `expiration_date` | Expiration date | `"2026-01-15"`, `NULL` | TEXT (ISO date) |
| `status` | Document status | `"pending_upload"`, `"uploaded"`, `"approved"`, `"rejected"`, `"expired"` | TEXT, ENUM, DEFAULT 'pending_upload' |
| `uploaded_by` | Uploader | `"EMP-042"` (self), `"EMP-001"` (HR) | TEXT, FK to employees, NOT NULL |
| `uploaded_at` | Upload timestamp | `"2024-01-15T10:00:00Z"` | TEXT, NOT NULL |
| `approved_by` | Approver | `"EMP-001"` (HR), `NULL` | TEXT, FK to employees |
| `approved_at` | Approval timestamp | `"2024-01-15T14:00:00Z"`, `NULL` | TEXT |
| `notes` | Additional notes | `"Original signed contract"` | TEXT |
| `created_at` | Creation timestamp | `"2024-01-15T10:00:00Z"` | TEXT, NOT NULL |
| `updated_at` | Last update timestamp | `"2024-01-15T14:00:00Z"` | TEXT, NOT NULL |

**Enumerations**:
- `category`: See [enumerations.json - documents.documentCategory](enumerations.json)
- `status`: See [enumerations.json - documents.documentStatus](enumerations.json)

**Indexes**:
- Index on `employee_id`
- Index on `category`
- Partial index on `expiration_date` WHERE `expiration_date IS NOT NULL AND status != 'expired'` (expiring docs)

---

### Table 48: `hr_benefits_enrollments`

**Purpose**: Track employee benefits enrollment selections.

**Dependencies**:
- `employees` (employee)

**Key Features**:
- Multiple benefit types (health, dental, vision, 401k, etc.)
- Coverage level tracking (employee only, +spouse, +family)
- Cost tracking (employee and employer portions)
- Enrollment period tracking
- Dependent information

#### Columns

| Column | Purpose | Sample Values | Type/Constraints |
|--------|---------|---------------|------------------|
| `enrollment_id` | **Primary Key** | `"BEN-001"` | TEXT |
| `employee_id` | Employee | `"EMP-042"` | TEXT, FK to employees, NOT NULL |
| `benefit_type` | Type of benefit | `"health_insurance"`, `"dental_insurance"`, `"retirement_401k"`, `"hsa"` | TEXT, ENUM, NOT NULL |
| `plan_name` | Plan name | `"PPO Gold"`, `"Standard Dental"` | TEXT, NOT NULL |
| `carrier` | Insurance carrier | `"Blue Cross Blue Shield"`, `"Delta Dental"` | TEXT |
| `coverage_level` | Coverage level | `"employee_only"`, `"employee_spouse"`, `"employee_children"`, `"employee_family"` | TEXT, ENUM |
| `employee_cost_monthly` | Employee cost/month | `350.00`, `25.00` | REAL |
| `employer_cost_monthly` | Employer cost/month | `850.00`, `75.00` | REAL |
| `employee_contribution_percentage` | Employee contrib % (401k) | `6.0`, `NULL` | REAL |
| `employer_match_percentage` | Employer match % (401k) | `3.0`, `NULL` | REAL |
| `enrolled_date` | Enrollment date | `"2024-01-01"` | TEXT (ISO date), NOT NULL |
| `effective_date` | Coverage start | `"2024-01-01"` | TEXT (ISO date), NOT NULL |
| `termination_date` | Coverage end | `"2024-12-31"`, `NULL` | TEXT (ISO date) |
| `status` | Enrollment status | `"pending"`, `"active"`, `"waived"`, `"terminated"` | TEXT, ENUM, DEFAULT 'pending' |
| `dependents` | Dependent info **(JSONB Array)** | `[{"name":"Jane Doe","relationship":"spouse","dob":"1985-03-15"}]` | TEXT (JSONB), DEFAULT '[]' |
| `beneficiaries` | Beneficiary info **(JSONB Array)** | `[{"name":"Jane Doe","relationship":"spouse","percentage":100}]` | TEXT (JSONB), DEFAULT '[]' |
| `notes` | Additional notes | `"Enrolled during open enrollment"` | TEXT |
| `created_at` | Creation timestamp | `"2024-01-01T00:00:00Z"` | TEXT, NOT NULL |
| `updated_at` | Last update timestamp | `"2024-01-15T10:00:00Z"` | TEXT, NOT NULL |

**Enumerations**:
- `benefit_type`: See [enumerations.json - benefits.benefitType](enumerations.json)
- `coverage_level`: See [enumerations.json - benefits.coverageLevel](enumerations.json)
- `status`: See [enumerations.json - benefits.enrollmentStatus](enumerations.json)

**Indexes**:
- Index on `employee_id`
- Index on `benefit_type`
- Partial index on `status` WHERE `status = 'active'`

---

### Table 49: `hr_onboarding_tasks`

**Purpose**: Onboarding task checklists for new hires.

**Dependencies**:
- `employees` (new hire employee)
- `employees` (task assignee)

**Key Features**:
- Task assignment (employee, HR, manager, IT, etc.)
- Due dates and completion tracking
- Onboarding task types (document upload, training, equipment, etc.)
- Dependency tracking

#### Columns

| Column | Purpose | Sample Values | Type/Constraints |
|--------|---------|---------------|------------------|
| `task_id` | **Primary Key** | `"OB-001"` | TEXT |
| `employee_id` | New hire employee | `"EMP-042"` | TEXT, FK to employees, NOT NULL |
| `task_type` | Type of task | `"document_upload"`, `"training_video"`, `"equipment_request"`, `"meeting"` | TEXT, ENUM, NOT NULL |
| `task_name` | Task name | `"Complete I-9 Form"`, `"Watch Safety Training Video"` | TEXT, NOT NULL |
| `task_description` | Task description | `"Upload completed and signed I-9 form with verification documents"` | TEXT |
| `assigned_to_type` | Who is responsible | `"employee"`, `"hr"`, `"manager"`, `"it"`, `"facilities"` | TEXT, ENUM, NOT NULL |
| `assigned_to` | Assignee employee ID | `"EMP-042"` (employee), `"EMP-001"` (HR) | TEXT, FK to employees |
| `due_date` | Due date | `"2024-01-22"` (1 week from start) | TEXT (ISO date) |
| `priority` | Task priority | `"high"`, `"medium"`, `"low"` | TEXT, ENUM, DEFAULT 'medium' |
| `status` | Task status | `"not_started"`, `"in_progress"`, `"completed"`, `"skipped"`, `"blocked"` | TEXT, ENUM, DEFAULT 'not_started' |
| `completion_date` | Completion date | `"2024-01-20"`, `NULL` | TEXT (ISO date) |
| `completed_by` | Who completed | `"EMP-042"`, `NULL` | TEXT, FK to employees |
| `document_url` | Attached document | `"https://cdn.../i9-completed.pdf"`, `NULL` | TEXT |
| `dependency_task_ids` | Prerequisite tasks **(JSONB Array)** | `["OB-100", "OB-101"]` | TEXT (JSONB), DEFAULT '[]' |
| `notes` | Additional notes | `"HR verified documents in person"` | TEXT |
| `created_at` | Creation timestamp | `"2024-01-15T00:00:00Z"` | TEXT, NOT NULL |
| `updated_at` | Last update timestamp | `"2024-01-20T15:00:00Z"` | TEXT, NOT NULL |

**Enumerations**:
- `task_type`: See [enumerations.json - onboarding.onboardingTaskType](enumerations.json)
- `assigned_to_type`: See [enumerations.json - onboarding.taskAssigneeType](enumerations.json)
- `status`: See [enumerations.json - onboarding.onboardingTaskStatus](enumerations.json)

**Indexes**:
- Index on `employee_id`
- Index on `assigned_to`
- Index on `status`
- Partial index on `due_date` WHERE `status NOT IN ('completed', 'skipped')`

---

### Table 50: `hr_feedback`

**Purpose**: Continuous feedback system (praise, coaching, recognition, etc.).

**Dependencies**:
- `employees` (employee receiving feedback)
- `employees` (feedback author)

**Key Features**:
- Multiple feedback types (positive, constructive, recognition, coaching, etc.)
- Private vs. shared feedback
- Tagging support
- Attachment support

#### Columns

| Column | Purpose | Sample Values | Type/Constraints |
|--------|---------|---------------|------------------|
| `feedback_id` | **Primary Key** | `"FB-001"` | TEXT |
| `employee_id` | Employee receiving feedback | `"EMP-042"` | TEXT, FK to employees, NOT NULL |
| `author_employee_id` | Feedback author | `"EMP-010"` (manager) | TEXT, FK to employees, NOT NULL |
| `feedback_type` | Type of feedback | `"positive"`, `"constructive"`, `"recognition"`, `"coaching"`, `"360_degree"` | TEXT, ENUM, NOT NULL |
| `feedback_text` | Feedback content | `"Excellent work on the client presentation..."` | TEXT, NOT NULL |
| `is_private` | Private feedback? | `1` (private), `0` (shared) | INTEGER, DEFAULT 1 |
| `is_anonymous` | Anonymous feedback? | `1`, `0` | INTEGER, DEFAULT 0 |
| `tags` | Tags **(JSONB Array)** | `["leadership", "communication", "teamwork"]` | TEXT (JSONB), DEFAULT '[]' |
| `related_review_id` | Related review | `"REV-2024-001"`, `NULL` | TEXT, FK to hr_reviews |
| `shared_with` | Shared with **(JSONB Array)** | `["EMP-001", "EMP-010"]` (HR, manager) | TEXT (JSONB), DEFAULT '[]' |
| `acknowledged` | Acknowledged by employee? | `1`, `0` | INTEGER, DEFAULT 0 |
| `acknowledged_at` | Acknowledgment timestamp | `"2024-06-16T10:00:00Z"`, `NULL` | TEXT |
| `created_at` | Creation timestamp | `"2024-06-15T14:00:00Z"` | TEXT, NOT NULL |
| `updated_at` | Last update timestamp | `"2024-06-15T14:00:00Z"` | TEXT, NOT NULL |

**Enumerations**:
- `feedback_type`: See [enumerations.json - performance.feedbackType](enumerations.json)

**Indexes**:
- Index on `employee_id`
- Index on `author_employee_id`
- Partial index on `is_private` WHERE `is_private = 0` (public feedback)

---

### Table 51: `hr_surveys`

**Purpose**: Employee surveys (pulse surveys, engagement surveys, exit surveys, etc.).

**Dependencies**: None (foundational table)

**Key Features**:
- Multiple survey types
- Questions stored as JSONB
- Anonymous response support
- Status tracking (draft, active, closed)

#### Columns

| Column | Purpose | Sample Values | Type/Constraints |
|--------|---------|---------------|------------------|
| `survey_id` | **Primary Key** | `"SRV-001"` | TEXT |
| `survey_name` | Survey name | `"Q2 2024 Employee Engagement Survey"` | TEXT, NOT NULL |
| `survey_type` | Type of survey | `"engagement"`, `"pulse"`, `"exit"`, `"onboarding"`, `"custom"` | TEXT, ENUM, NOT NULL |
| `description` | Survey description | `"Quarterly employee engagement and satisfaction survey"` | TEXT |
| `questions` | Survey questions **(JSONB Array)** | `[{"id":"q1","question":"How satisfied are you...","type":"scale_1_5"}]` | TEXT (JSONB), NOT NULL, DEFAULT '[]' |
| `is_anonymous` | Anonymous responses? | `1`, `0` | INTEGER, DEFAULT 1 |
| `target_audience` | Who should take survey | `"all"`, `"department:ENG"`, `"new_hires"` | TEXT |
| `start_date` | Survey start date | `"2024-06-01"` | TEXT (ISO date), NOT NULL |
| `end_date` | Survey end date | `"2024-06-15"` | TEXT (ISO date), NOT NULL |
| `status` | Survey status | `"draft"`, `"active"`, `"closed"`, `"cancelled"` | TEXT, ENUM, DEFAULT 'draft' |
| `response_count` | Total responses | `85` | INTEGER, DEFAULT 0 |
| `target_response_count` | Target responses | `120` (all employees) | INTEGER |
| `created_at` | Creation timestamp | `"2024-05-15T00:00:00Z"` | TEXT, NOT NULL |
| `updated_at` | Last update timestamp | `"2024-06-15T23:59:59Z"` | TEXT, NOT NULL |
| `created_by` | Creator | `"EMP-001"` (HR) | TEXT, FK to employees, NOT NULL |

**Enumerations**:
- `survey_type`: Custom enum (engagement, pulse, exit, onboarding, custom)
- `status`: Custom enum (draft, active, closed, cancelled)

**Indexes**:
- Index on `status`
- Index on `start_date, end_date`

---

### Table 52: `hr_survey_responses`

**Purpose**: Individual employee responses to surveys.

**Dependencies**:
- `hr_surveys` (survey)
- `employees` (optional - employee who responded, NULL if anonymous)

**Key Features**:
- Anonymous response support
- Answers stored as JSONB (question_id → answer mapping)
- Completion tracking

#### Columns

| Column | Purpose | Sample Values | Type/Constraints |
|--------|---------|---------------|------------------|
| `response_id` | **Primary Key** | `"SRV-RESP-001"` | TEXT |
| `survey_id` | Survey | `"SRV-001"` | TEXT, FK to hr_surveys, NOT NULL |
| `employee_id` | Employee (NULL if anonymous) | `"EMP-042"`, `NULL` | TEXT, FK to employees |
| `answers` | Survey answers **(JSONB)** | `{"q1":4,"q2":"Very satisfied","q3":["teamwork","communication"]}` | TEXT (JSONB), NOT NULL, DEFAULT '{}' |
| `is_complete` | Completed survey? | `1`, `0` | INTEGER, DEFAULT 0 |
| `submitted_at` | Submission timestamp | `"2024-06-10T15:30:00Z"`, `NULL` | TEXT |
| `ip_address` | IP address (for fraud detection) | `"192.168.1.100"` | TEXT |
| `user_agent` | User agent | `"Mozilla/5.0..."` | TEXT |
| `created_at` | Creation timestamp | `"2024-06-10T15:20:00Z"` | TEXT, NOT NULL |
| `updated_at` | Last update timestamp | `"2024-06-10T15:30:00Z"` | TEXT, NOT NULL |

**Indexes**:
- Index on `survey_id`
- Partial index on `employee_id` WHERE `employee_id IS NOT NULL`
- Partial index on `is_complete` WHERE `is_complete = 1`

---

## Summary

This completes the documentation for all 52 tables in the D1 schema:

### Tables by Module:
- **Firm Profile**: 3 tables (locations, departments, holidays)
- **Employee Profile**: 4 tables (employees, assets, training, certifications)
- **User Groups**: 3 tables (groups, members, roles)
- **HR Core**: 7 tables (PTO policies, time off requests, attendance, review cycles, reviews, change requests, emergency contacts)
- **Ticketing**: 4 tables (business areas, tickets, updates, attachments)
- **Project Management**: 17 tables (objectives, projects, tasks, dashboards, widgets, automations, execution logs, comments, templates, time entries, attachments, and more)
- **Compensation**: 5 tables (work schedules, variable comp, equity, allowances, premiums)
- **Payroll**: 6 tables (runs, paystubs, tax rates, deduction defs, employee deductions, tax deposits)
- **Time Tracking**: 3 tables (entries, timesheets, billable expenses)
- **HR Additional**: 6 tables (documents, benefits enrollments, onboarding tasks, feedback, surveys, survey responses)

### Key Features Across Schema:
- **JSONB Fields**: 25+ JSONB fields for flexible data storage
- **Enumerations**: 100+ enumeration types for data consistency
- **Audit Trails**: created_at, updated_at, created_by on most tables
- **Soft Deletes**: is_active flags on many tables
- **Effective Dating**: effective_from/effective_to for temporal data
- **Status Tracking**: Workflow states on transactions (draft → submitted → approved)
- **Hierarchies**: Parent-child relationships (departments, tasks, projects, etc.)

---

[← Back to Index](SCHEMA-HELP-GUIDE.md) | [← Part 2](SCHEMA-HELP-GUIDE-PART-2.md)
