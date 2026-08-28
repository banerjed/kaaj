# Compensation & Employment Framework

**Version:** 1.0
**Last Updated:** December 1, 2025
**Purpose:** Comprehensive employee compensation structure supporting diverse employment types and pay models

---

## Table of Contents

1. [Overview](#overview)
2. [Employment Types & Work Arrangements](#employment-types--work-arrangements)
3. [Compensation Models](#compensation-models)
4. [Database Schema](#database-schema)
5. [Business Rules](#business-rules)
6. [API Examples](#api-examples)
7. [UI Components](#ui-components)
8. [Use Cases](#use-cases)

---

## Overview

### Design Principles

1. **Flexibility**: Support any compensation structure without schema changes
2. **Composability**: Employees can have multiple compensation components
3. **Temporal**: Track changes over time with effective dates
4. **Multi-Currency**: All amounts support multiple currencies
5. **Audit Trail**: Complete history of compensation changes

### Supported Scenarios

- ✅ Full-time salaried employees
- ✅ Part-time hourly employees with variable schedules
- ✅ Flexible/remote workers with core hours
- ✅ Interns and temporary workers with fixed end dates
- ✅ Overtime-eligible employees with custom overtime rates
- ✅ Commission-based employees with quotas
- ✅ Performance-based bonuses and incentives
- ✅ Equity compensation (stock options, RSUs)
- ✅ Hybrid compensation (base + commission + equity)
- ✅ Contractors/consultants with project-based pay
- ✅ On-call/shift differential pay

---

## Employment Types & Work Arrangements

### Employment Type Taxonomy

```sql
-- Core employment types
CREATE TYPE employment_type AS ENUM (
    'full_time',           -- Standard full-time employee
    'part_time',           -- Part-time with regular schedule
    'contractor',          -- Independent contractor
    'intern',              -- Temporary intern
    'temporary',           -- Temporary/seasonal employee
    'consultant',          -- Professional consultant
    'freelance'            -- Freelance/gig worker
);

-- Work arrangement types
CREATE TYPE work_arrangement AS ENUM (
    'standard',            -- Fixed schedule (e.g., 9-5, Mon-Fri)
    'flexible',            -- Flexible hours with core hours
    'shift_based',         -- Rotating shifts
    'on_call',             -- On-call availability
    'project_based',       -- Project deliverables
    'remote',              -- Fully remote
    'hybrid'               -- Mix of office/remote
);

-- Time tracking requirement
CREATE TYPE time_tracking_type AS ENUM (
    'none',                -- No tracking required (salaried exempt)
    'hours_only',          -- Track hours worked
    'clock_in_out',        -- Clock in/out with timestamps
    'task_based',          -- Track time per task/project
    'deliverable_based'    -- Track deliverables/milestones
);
```

### Work Schedule Configuration

```sql
CREATE TABLE work_schedules (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(id),
    employee_id UUID NOT NULL REFERENCES employees(id),

    -- Schedule basics
    schedule_name VARCHAR(255),
    schedule_type work_arrangement NOT NULL DEFAULT 'standard',

    -- Effective period
    effective_from DATE NOT NULL,
    effective_to DATE,

    -- Standard hours per week (for part-time)
    standard_hours_per_week DECIMAL(5, 2),  -- e.g., 20.00 for half-time

    -- Weekly schedule (NULL for flexible)
    weekly_schedule JSONB,
    /*
    {
      "monday": {"start": "09:00", "end": "17:00", "hours": 8},
      "tuesday": {"start": "09:00", "end": "17:00", "hours": 8},
      "wednesday": {"start": "09:00", "end": "13:00", "hours": 4},
      "thursday": null,  // Day off
      "friday": {"start": "09:00", "end": "17:00", "hours": 8}
    }
    */

    -- Flexible schedule parameters
    core_hours JSONB,
    /*
    {
      "required_days": ["monday", "tuesday", "wednesday", "thursday", "friday"],
      "core_start": "10:00",  // Must be available
      "core_end": "15:00",    // Must be available
      "flex_start": "07:00",  // Earliest start
      "flex_end": "19:00"     // Latest end
    }
    */

    -- Shift-based schedule
    shift_pattern JSONB,
    /*
    {
      "pattern": "4_on_3_off",  // 4 days on, 3 days off
      "shift_start": "07:00",
      "shift_end": "19:00",
      "rotation_weeks": 2
    }
    */

    -- Break requirements
    break_policy JSONB,
    /*
    {
      "lunch_break_minutes": 30,
      "paid_breaks": [
        {"after_hours": 4, "duration_minutes": 15}
      ]
    }
    */

    -- Time tracking
    time_tracking_required time_tracking_type NOT NULL DEFAULT 'hours_only',

    -- Timezone for this schedule
    timezone VARCHAR(100) NOT NULL DEFAULT 'America/New_York',

    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    created_by UUID
);

CREATE INDEX idx_work_schedules_tenant ON work_schedules(tenant_id);
CREATE INDEX idx_work_schedules_employee ON work_schedules(employee_id);
CREATE INDEX idx_work_schedules_effective ON work_schedules(effective_from, effective_to);
```

### Employment Term Configuration

```sql
CREATE TABLE employment_terms (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(id),
    employee_id UUID NOT NULL REFERENCES employees(id),

    -- Employment type
    employment_type employment_type NOT NULL,

    -- Duration (for temporary/intern positions)
    start_date DATE NOT NULL,
    planned_end_date DATE,  -- NULL for permanent positions
    actual_end_date DATE,

    -- Contract details
    contract_type VARCHAR(50),  -- permanent, fixed_term, seasonal, project
    renewal_option BOOLEAN DEFAULT FALSE,

    -- Probation period
    probation_period_days INT DEFAULT 90,
    probation_end_date DATE,

    -- Notice period
    notice_period_days INT,  -- Required notice for termination

    -- Work authorization (for compliance)
    work_authorization_type VARCHAR(50),  -- citizen, permanent_resident, work_visa
    work_authorization_expiry DATE,

    -- FTE (Full-Time Equivalent)
    fte DECIMAL(4, 2) DEFAULT 1.00,  -- 1.00 = full-time, 0.50 = half-time

    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_employment_terms_tenant ON employment_terms(tenant_id);
CREATE INDEX idx_employment_terms_employee ON employment_terms(employee_id);
CREATE INDEX idx_employment_terms_end_date ON employment_terms(planned_end_date)
    WHERE planned_end_date IS NOT NULL;
```

---

## Compensation Models

### Compensation Structure Overview

Employees can have multiple compensation components that combine to form their total compensation:

1. **Base Compensation** (salary or hourly)
2. **Variable Compensation** (commission, bonuses)
3. **Equity Compensation** (stock options, RSUs)
4. **Allowances & Stipends**
5. **Overtime & Premiums**

### Base Compensation

```sql
CREATE TYPE compensation_type AS ENUM (
    'salary',              -- Annual salary
    'hourly',              -- Hourly wage
    'daily',               -- Day rate
    'weekly',              -- Weekly rate
    'monthly',             -- Monthly rate
    'piece_rate',          -- Per unit produced
    'commission_only'      -- 100% commission
);

CREATE TABLE compensation_base (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(id),
    employee_id UUID NOT NULL REFERENCES employees(id),

    -- Effective period
    effective_from DATE NOT NULL,
    effective_to DATE,

    -- Compensation type and amount
    compensation_type compensation_type NOT NULL,

    -- Multi-currency support
    amount DECIMAL(12, 2) NOT NULL,
    currency VARCHAR(3) NOT NULL DEFAULT 'USD',

    -- Payment frequency
    pay_frequency VARCHAR(20),  -- weekly, bi-weekly, semi-monthly, monthly

    -- For hourly/daily workers
    standard_hours_per_day DECIMAL(5, 2),
    standard_days_per_week DECIMAL(4, 2),

    -- Annual equivalent (calculated)
    annual_equivalent DECIMAL(12, 2),

    -- Overtime eligibility
    overtime_eligible BOOLEAN DEFAULT FALSE,
    overtime_rules JSONB,
    /*
    [
      {
        "type": "daily",
        "threshold_hours": 8,
        "rate_multiplier": 1.5,
        "max_hours_per_day": 12
      },
      {
        "type": "weekly",
        "threshold_hours": 40,
        "rate_multiplier": 1.5
      },
      {
        "type": "weekly_after",
        "threshold_hours": 50,
        "rate_multiplier": 2.0
      }
    ]
    */

    -- Change reason
    change_reason VARCHAR(100),  -- promotion, market_adjustment, merit_increase, etc.

    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    created_by UUID,

    CONSTRAINT check_amount_positive CHECK (amount > 0)
);

CREATE INDEX idx_compensation_base_tenant ON compensation_base(tenant_id);
CREATE INDEX idx_compensation_base_employee ON compensation_base(employee_id);
CREATE INDEX idx_compensation_base_effective ON compensation_base(effective_from, effective_to);
```

### Variable Compensation (Commission, Bonuses)

```sql
CREATE TYPE variable_comp_type AS ENUM (
    'commission',          -- Sales commission
    'bonus',               -- Discretionary bonus
    'performance_bonus',   -- Performance-based bonus
    'quota_bonus',         -- Quota achievement bonus
    'retention_bonus',     -- Retention bonus
    'signing_bonus',       -- One-time signing bonus
    'referral_bonus',      -- Employee referral
    'profit_sharing'       -- Company profit sharing
);

CREATE TABLE compensation_variable (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(id),
    employee_id UUID NOT NULL REFERENCES employees(id),

    -- Component details
    component_type variable_comp_type NOT NULL,
    component_name VARCHAR(255),
    description TEXT,

    -- Effective period
    effective_from DATE NOT NULL,
    effective_to DATE,

    -- Target amount (if applicable)
    target_amount DECIMAL(12, 2),
    currency VARCHAR(3) NOT NULL DEFAULT 'USD',

    -- Commission structure
    commission_structure JSONB,
    /*
    {
      "type": "tiered",  // or "flat", "accelerator", "draw"
      "tiers": [
        {
          "from": 0,
          "to": 100000,
          "rate": 0.05,
          "type": "percentage"  // or "fixed_per_unit"
        },
        {
          "from": 100000,
          "to": 200000,
          "rate": 0.07
        },
        {
          "from": 200000,
          "rate": 0.10
        }
      ],
      "base_draw": 3000,  // Monthly draw against commission
      "calculation_basis": "net_sales",  // or "gross_sales", "gross_profit"
      "payment_timing": "monthly"  // when commission is paid
    }
    */

    -- Quota/target structure
    quota_structure JSONB,
    /*
    {
      "period": "quarterly",
      "quota_amount": 500000,
      "quota_units": "USD",
      "achievement_tiers": [
        {"from": 0, "to": 0.80, "payout": 0},
        {"from": 0.80, "to": 1.00, "payout": 0.80},  // % of target bonus
        {"from": 1.00, "to": 1.20, "payout": 1.00},
        {"from": 1.20, "payout": 1.50}  // Accelerator
      ]
    }
    */

    -- Payment schedule
    payment_frequency VARCHAR(50),  -- monthly, quarterly, annually, on_achievement
    next_payment_date DATE,

    -- Performance metrics
    performance_metrics JSONB,
    /*
    [
      {
        "metric": "revenue_target",
        "target": 1000000,
        "weight": 0.60
      },
      {
        "metric": "customer_satisfaction",
        "target": 4.5,
        "weight": 0.20
      },
      {
        "metric": "team_performance",
        "target": 90,
        "weight": 0.20
      }
    ]
    */

    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    created_by UUID
);

CREATE INDEX idx_compensation_variable_tenant ON compensation_variable(tenant_id);
CREATE INDEX idx_compensation_variable_employee ON compensation_variable(employee_id);
CREATE INDEX idx_compensation_variable_type ON compensation_variable(component_type);
```

### Equity Compensation

```sql
CREATE TYPE equity_type AS ENUM (
    'stock_options',       -- Stock options (ISO, NSO)
    'rsu',                 -- Restricted Stock Units
    'sar',                 -- Stock Appreciation Rights
    'phantom_stock',       -- Phantom stock
    'espp',                -- Employee Stock Purchase Plan
    'performance_shares'   -- Performance-based shares
);

CREATE TYPE vesting_type AS ENUM (
    'time_based',          -- Vests over time
    'performance_based',   -- Vests on performance
    'hybrid'               -- Combination
);

CREATE TABLE compensation_equity (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(id),
    employee_id UUID NOT NULL REFERENCES employees(id),

    -- Grant details
    grant_type equity_type NOT NULL,
    grant_date DATE NOT NULL,
    grant_number VARCHAR(50),

    -- Quantity
    shares_granted INT NOT NULL,
    shares_vested INT DEFAULT 0,
    shares_exercised INT DEFAULT 0,
    shares_forfeited INT DEFAULT 0,

    -- Pricing (for options)
    exercise_price DECIMAL(12, 4),  -- Strike price
    grant_price DECIMAL(12, 4),     -- Fair market value at grant
    currency VARCHAR(3) DEFAULT 'USD',

    -- Vesting schedule
    vesting_type vesting_type NOT NULL,
    vesting_start_date DATE NOT NULL,
    vesting_cliff_months INT,  -- e.g., 12 for 1-year cliff
    vesting_period_months INT,  -- e.g., 48 for 4-year vesting

    vesting_schedule JSONB,
    /*
    {
      "type": "monthly",  // or "quarterly", "annual", "milestone"
      "schedule": [
        {"date": "2025-01-15", "shares": 250, "cumulative": 250},
        {"date": "2025-02-15", "shares": 250, "cumulative": 500},
        ...
      ],
      "acceleration_triggers": [
        "termination_without_cause",
        "change_of_control"
      ]
    }
    */

    -- Performance conditions (if applicable)
    performance_conditions JSONB,
    /*
    {
      "metrics": [
        {
          "metric": "revenue_growth",
          "target": 0.30,
          "weight": 0.50
        },
        {
          "metric": "ebitda_margin",
          "target": 0.20,
          "weight": 0.50
        }
      ],
      "measurement_period": "2025-01-01 to 2025-12-31"
    }
    */

    -- Expiration
    expiration_date DATE,

    -- Status
    status VARCHAR(50) DEFAULT 'active',  -- active, exercised, forfeited, expired

    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    created_by UUID,

    CONSTRAINT check_shares_valid CHECK (
        shares_vested + shares_exercised + shares_forfeited <= shares_granted
    )
);

CREATE INDEX idx_compensation_equity_tenant ON compensation_equity(tenant_id);
CREATE INDEX idx_compensation_equity_employee ON compensation_equity(employee_id);
CREATE INDEX idx_compensation_equity_status ON compensation_equity(status);
CREATE INDEX idx_compensation_equity_vesting ON compensation_equity(vesting_start_date);
```

### Allowances & Stipends

```sql
CREATE TYPE allowance_type AS ENUM (
    'housing',             -- Housing allowance
    'transportation',      -- Car/transit allowance
    'mobile_phone',        -- Phone stipend
    'internet',            -- Home internet
    'equipment',           -- Equipment allowance
    'meal',                -- Meal allowance
    'education',           -- Education/training
    'wellness',            -- Gym/wellness
    'childcare',           -- Childcare assistance
    'relocation',          -- Relocation assistance
    'remote_work',         -- Remote work stipend
    'other'                -- Other allowances
);

CREATE TABLE compensation_allowances (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(id),
    employee_id UUID NOT NULL REFERENCES employees(id),

    -- Allowance details
    allowance_type allowance_type NOT NULL,
    allowance_name VARCHAR(255),
    description TEXT,

    -- Effective period
    effective_from DATE NOT NULL,
    effective_to DATE,

    -- Amount
    amount DECIMAL(12, 2) NOT NULL,
    currency VARCHAR(3) NOT NULL DEFAULT 'USD',

    -- Payment frequency
    frequency VARCHAR(50),  -- monthly, quarterly, annually, one-time, per-occurrence

    -- Taxable status
    is_taxable BOOLEAN DEFAULT TRUE,

    -- Reimbursement vs stipend
    is_reimbursement BOOLEAN DEFAULT FALSE,
    requires_receipts BOOLEAN DEFAULT FALSE,
    max_reimbursement_per_period DECIMAL(12, 2),

    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    created_by UUID
);

CREATE INDEX idx_compensation_allowances_tenant ON compensation_allowances(tenant_id);
CREATE INDEX idx_compensation_allowances_employee ON compensation_allowances(employee_id);
CREATE INDEX idx_compensation_allowances_type ON compensation_allowances(allowance_type);
```

### Shift Differentials & Premiums

```sql
CREATE TYPE premium_type AS ENUM (
    'shift_differential',  -- Evening/night shift premium
    'weekend_premium',     -- Weekend work premium
    'holiday_premium',     -- Holiday work premium
    'on_call_premium',     -- On-call availability
    'hazard_pay',          -- Hazardous duty pay
    'certification_pay',   -- Professional certification premium
    'bilingual_premium',   -- Language skills premium
    'lead_premium'         -- Team lead premium
);

CREATE TABLE compensation_premiums (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(id),
    employee_id UUID NOT NULL REFERENCES employees(id),

    -- Premium details
    premium_type premium_type NOT NULL,
    premium_name VARCHAR(255),

    -- Effective period
    effective_from DATE NOT NULL,
    effective_to DATE,

    -- Premium calculation
    calculation_method VARCHAR(50),  -- percentage, fixed_amount, hourly_rate

    -- Amount/rate
    premium_amount DECIMAL(12, 2),
    premium_percentage DECIMAL(5, 2),  -- e.g., 15.00 for 15% premium
    currency VARCHAR(3) DEFAULT 'USD',

    -- Conditions for premium
    conditions JSONB,
    /*
    {
      "shift_differential": {
        "shift_start_after": "18:00",
        "shift_end_before": "06:00",
        "applies_to": "hours_worked"
      },
      "on_call": {
        "payment_for": "availability",
        "additional_if_called": true,
        "minimum_response_time_minutes": 30
      },
      "weekend": {
        "days": ["saturday", "sunday"]
      }
    }
    */

    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    created_by UUID
);

CREATE INDEX idx_compensation_premiums_tenant ON compensation_premiums(tenant_id);
CREATE INDEX idx_compensation_premiums_employee ON compensation_premiums(employee_id);
```

---

## Data Model

**Note:** Data model specifications have been moved to the centralized data models specification.

See [schema.sql](../packages/database/reference/schema.sql) for complete database schemas including:
- Work Schedules (flexible, shift-based, remote)
- Employment Terms (contract types, probation, work authorization)
- Base Compensation (salary, hourly, with overtime rules)
- Variable Compensation (bonuses, commissions with tiered structures)
- Equity Compensation (stock options, RSUs with vesting schedules)
- Allowances (housing, transportation, mobile)
- Premiums (shift differential, on-call, weekend)
- Materialized View for Total Compensation

---

## Business Rules

### BR-COMP-001: Compensation Temporal Validity
- **Rule**: Only one active compensation record per type per employee at any time
- **Enforcement**: Application validates no overlapping effective dates
- **Example**: Cannot have two active base salary records for same employee

### BR-COMP-002: FTE Calculation
- **Rule**: FTE calculated from standard_hours_per_week / 40
- **Enforcement**: Calculated field or trigger
- **Example**: 20 hours/week = 0.50 FTE

### BR-COMP-003: Overtime Eligibility
- **Rule**: Overtime eligibility based on:
  - Employment type (hourly workers typically eligible)
  - Salary level (FLSA exempt threshold)
  - Job classification (exempt vs non-exempt)
- **Enforcement**: Application-level validation
- **Display**: Warning if setting salaried employee as overtime-eligible

### BR-COMP-004: Intern/Temporary End Date
- **Rule**: Interns and temporary employees must have planned_end_date
- **Enforcement**: Database constraint
- **Notification**: Alert HR 30 days before end date

### BR-COMP-005: Commission Calculation
- **Rule**: Commission calculated based on achievement within period
- **Enforcement**: Payroll processing engine
- **Timing**: Commission may be paid in arrears (e.g., 30 days after period close)

### BR-COMP-006: Equity Vesting
- **Rule**: Shares vest according to schedule; unvested shares forfeit on termination
- **Enforcement**: Automated vesting calculation job
- **Acceleration**: Vesting may accelerate on certain events (acquisition, IPO)

### BR-COMP-007: Work Schedule Changes
- **Rule**: Work schedule changes require new record with effective date
- **Enforcement**: New row in work_schedules table
- **Notification**: Employee notified of schedule changes

### BR-COMP-008: Multi-Currency Consistency
- **Rule**: All compensation components for employee should be in same currency
- **Enforcement**: Soft validation (warning, not error)
- **Exception**: Allowed for global employees

---

## API Examples

### Create Part-Time Hourly Employee

```json
POST /api/v1/employees

{
  "employee": {
    "first_name": "Jane",
    "last_name": "Smith",
    "email": "jane.smith@company.com",
    "hire_date": "2025-01-15",
    "employment_type": "part_time",
    "work_arrangement": "standard",
    "job_title_id": "uuid",
    "department_id": "uuid",
    "location_id": "uuid"
  },
  "employment_terms": {
    "employment_type": "part_time",
    "start_date": "2025-01-15",
    "fte": 0.50,
    "probation_period_days": 90
  },
  "work_schedule": {
    "schedule_type": "standard",
    "standard_hours_per_week": 20,
    "weekly_schedule": {
      "monday": {"start": "09:00", "end": "13:00", "hours": 4},
      "wednesday": {"start": "09:00", "end": "13:00", "hours": 4},
      "friday": {"start": "09:00", "end": "17:00", "hours": 8}
    },
    "time_tracking_required": "clock_in_out",
    "timezone": "America/Los_Angeles"
  },
  "base_compensation": {
    "compensation_type": "hourly",
    "amount": 25.00,
    "currency": "USD",
    "effective_from": "2025-01-15",
    "overtime_eligible": true,
    "overtime_rules": [
      {
        "type": "weekly",
        "threshold_hours": 20,
        "rate_multiplier": 1.5
      }
    ]
  }
}
```

### Create Sales Rep with Commission

```json
POST /api/v1/employees

{
  "employee": {
    "first_name": "John",
    "last_name": "Doe",
    "email": "john.doe@company.com",
    "hire_date": "2025-01-15",
    "employment_type": "full_time",
    "job_title_id": "sales-rep-uuid",
    "department_id": "sales-uuid"
  },
  "base_compensation": {
    "compensation_type": "salary",
    "amount": 60000,
    "currency": "USD",
    "pay_frequency": "semi-monthly",
    "effective_from": "2025-01-15"
  },
  "variable_compensation": [
    {
      "component_type": "commission",
      "component_name": "Sales Commission",
      "effective_from": "2025-01-15",
      "commission_structure": {
        "type": "tiered",
        "tiers": [
          {
            "from": 0,
            "to": 500000,
            "rate": 0.05
          },
          {
            "from": 500000,
            "to": 1000000,
            "rate": 0.07
          },
          {
            "from": 1000000,
            "rate": 0.10
          }
        ],
        "base_draw": 2000,
        "calculation_basis": "net_sales",
        "payment_timing": "monthly"
      }
    },
    {
      "component_type": "quota_bonus",
      "component_name": "Quarterly Quota Bonus",
      "target_amount": 15000,
      "currency": "USD",
      "quota_structure": {
        "period": "quarterly",
        "quota_amount": 750000,
        "achievement_tiers": [
          {"from": 0, "to": 0.80, "payout": 0},
          {"from": 0.80, "to": 1.00, "payout": 0.80},
          {"from": 1.00, "to": 1.20, "payout": 1.00},
          {"from": 1.20, "payout": 1.50}
        ]
      },
      "payment_frequency": "quarterly"
    }
  ]
}
```

### Create Employee with Stock Options

```json
POST /api/v1/compensation/equity

{
  "employee_id": "uuid",
  "grant_type": "stock_options",
  "grant_date": "2025-01-15",
  "shares_granted": 10000,
  "exercise_price": 10.00,
  "grant_price": 10.00,
  "currency": "USD",
  "vesting_type": "time_based",
  "vesting_start_date": "2025-01-15",
  "vesting_cliff_months": 12,
  "vesting_period_months": 48,
  "vesting_schedule": {
    "type": "monthly",
    "cliff_shares": 2500,
    "monthly_shares": 208.33,
    "acceleration_triggers": [
      "termination_without_cause",
      "change_of_control"
    ]
  },
  "expiration_date": "2035-01-15"
}
```

### Create Flexible/Remote Worker

```json
POST /api/v1/employees

{
  "employee": {
    "first_name": "Alex",
    "last_name": "Johnson",
    "employment_type": "full_time",
    "work_arrangement": "flexible"
  },
  "work_schedule": {
    "schedule_type": "flexible",
    "standard_hours_per_week": 40,
    "core_hours": {
      "required_days": ["monday", "tuesday", "wednesday", "thursday", "friday"],
      "core_start": "10:00",
      "core_end": "15:00",
      "flex_start": "07:00",
      "flex_end": "20:00"
    },
    "time_tracking_required": "hours_only",
    "timezone": "America/Denver"
  },
  "base_compensation": {
    "compensation_type": "salary",
    "amount": 95000,
    "currency": "USD",
    "overtime_eligible": false
  },
  "allowances": [
    {
      "allowance_type": "remote_work",
      "allowance_name": "Remote Work Stipend",
      "amount": 100,
      "currency": "USD",
      "frequency": "monthly",
      "is_taxable": true
    },
    {
      "allowance_type": "internet",
      "allowance_name": "Internet Reimbursement",
      "amount": 75,
      "currency": "USD",
      "frequency": "monthly",
      "is_reimbursement": true
    }
  ]
}
```

### Create Intern with Fixed Term

```json
POST /api/v1/employees

{
  "employee": {
    "first_name": "Sarah",
    "last_name": "Chen",
    "employment_type": "intern",
    "work_arrangement": "standard"
  },
  "employment_terms": {
    "employment_type": "intern",
    "start_date": "2025-06-01",
    "planned_end_date": "2025-08-31",
    "contract_type": "fixed_term",
    "fte": 1.00
  },
  "work_schedule": {
    "schedule_type": "standard",
    "standard_hours_per_week": 40,
    "weekly_schedule": {
      "monday": {"start": "09:00", "end": "17:00", "hours": 8},
      "tuesday": {"start": "09:00", "end": "17:00", "hours": 8},
      "wednesday": {"start": "09:00", "end": "17:00", "hours": 8},
      "thursday": {"start": "09:00", "end": "17:00", "hours": 8},
      "friday": {"start": "09:00", "end": "17:00", "hours": 8}
    },
    "time_tracking_required": "clock_in_out"
  },
  "base_compensation": {
    "compensation_type": "hourly",
    "amount": 20.00,
    "currency": "USD",
    "effective_from": "2025-06-01",
    "effective_to": "2025-08-31",
    "overtime_eligible": true
  }
}
```

---

## UI Components

### Compensation Summary Card

```typescript
interface CompensationSummary {
  employee_id: string;

  // Base
  base_compensation: {
    type: 'salary' | 'hourly' | 'daily';
    amount: number;
    currency: string;
    annual_equivalent: number;
  };

  // Variable (target)
  variable_compensation: {
    commission_target?: number;
    bonus_target?: number;
    total_target: number;
  };

  // Equity
  equity: {
    total_shares_granted: number;
    shares_vested: number;
    estimated_value: number;
  };

  // Allowances
  allowances: {
    total_annual: number;
    components: Array<{
      type: string;
      name: string;
      annual_amount: number;
    }>;
  };

  // Total
  total_compensation: {
    base_annual: number;
    variable_target: number;
    equity_value: number;
    allowances_annual: number;
    total_target: number;
  };
}
```

### Work Schedule Display Component

Shows employee's current work schedule with visual calendar:

```
Standard Schedule (40 hrs/week)
┌─────────┬──────────┬──────────┐
│ Monday  │ 9:00 AM  │ 5:00 PM  │ 8 hrs
│ Tuesday │ 9:00 AM  │ 5:00 PM  │ 8 hrs
│ Wed     │ 9:00 AM  │ 5:00 PM  │ 8 hrs
│ Thu     │ 9:00 AM  │ 5:00 PM  │ 8 hrs
│ Friday  │ 9:00 AM  │ 5:00 PM  │ 8 hrs
└─────────┴──────────┴──────────┘

Time Tracking: Clock In/Out Required
Timezone: America/New_York (EST)
```

For flexible schedules:

```
Flexible Schedule (40 hrs/week)
Core Hours: 10:00 AM - 3:00 PM EST
Flex Window: 7:00 AM - 8:00 PM EST

Required Days: Mon-Fri
Time Tracking: Hours Only
```

### Compensation Timeline

Visual timeline showing:
- Salary changes
- Commission plan updates
- Equity grants and vesting
- Bonuses received
- Promotions/title changes

---

## Use Cases

### Use Case 1: Part-Time Worker Becomes Full-Time

**Scenario**: Part-time employee (20 hrs/week, $25/hr) promoted to full-time ($52,000/year salary)

**Steps**:
1. Create new `work_schedule` with effective date:
   - `standard_hours_per_week`: 40
   - `weekly_schedule`: Mon-Fri 9-5
2. Create new `compensation_base` record:
   - `compensation_type`: 'salary'
   - `amount`: 52000
   - `effective_from`: promotion date
3. Update `employment_terms`:
   - `fte`: 1.00
4. End previous compensation record by setting `effective_to`

### Use Case 2: Sales Rep with Accelerated Commission

**Scenario**: Sales rep has tiered commission that increases after hitting quota

**Implementation**:
- Create `compensation_variable` with tiered structure
- System calculates monthly sales
- Applies correct tier based on YTD or period sales
- Includes draw against future commissions
- Handles clawbacks if targets not met

### Use Case 3: Executive with Complex Compensation

**Scenario**: Executive with base salary + performance bonus + stock options + allowances

**Components**:
1. Base: $250,000 salary
2. Variable: Performance bonus target $100,000 (paid based on company and individual performance)
3. Equity: 50,000 stock options vesting over 4 years with 1-year cliff
4. Allowances:
   - Car allowance: $1,000/month
   - Executive benefits: $500/month
5. Premiums:
   - Board attendance: $2,500 per meeting

### Use Case 4: Shift Worker with Differentials

**Scenario**: Nurse working rotating shifts with differential pay

**Implementation**:
- Base hourly: $35/hour
- Night shift differential (6pm-6am): +15% = $40.25/hour
- Weekend differential: +10% = $38.50/hour
- Holiday work: 2x base rate = $70/hour
- On-call availability: $100/day

System automatically applies correct rate based on time entry timestamps.

### Use Case 5: Contractor/Consultant

**Scenario**: Independent contractor paid daily rate for project work

**Implementation**:
- `employment_type`: 'contractor'
- `compensation_type`: 'daily'
- `amount`: 800 (daily rate)
- `work_arrangement`: 'project_based'
- `time_tracking_type`: 'deliverable_based'
- Invoice generated based on days worked or deliverables completed

---

## Integration with Existing Modules

### Integration with Payroll Processing

```sql
-- Calculate gross pay for pay period
CREATE FUNCTION calculate_gross_pay(
    p_employee_id UUID,
    p_period_start DATE,
    p_period_end DATE
) RETURNS DECIMAL(12, 2) AS $$
DECLARE
    v_gross_pay DECIMAL(12, 2) := 0;
    v_comp_type compensation_type;
    v_base_amount DECIMAL(12, 2);
    v_hours_worked DECIMAL(10, 2);
    v_overtime_hours DECIMAL(10, 2);
BEGIN
    -- Get base compensation
    SELECT compensation_type, amount
    INTO v_comp_type, v_base_amount
    FROM compensation_base
    WHERE employee_id = p_employee_id
        AND effective_from <= p_period_end
        AND (effective_to IS NULL OR effective_to >= p_period_start)
    ORDER BY effective_from DESC
    LIMIT 1;

    IF v_comp_type = 'salary' THEN
        -- Calculate pro-rated salary for period
        v_gross_pay := v_base_amount / 26;  -- Assuming bi-weekly

    ELSIF v_comp_type = 'hourly' THEN
        -- Get hours worked
        SELECT
            SUM(CASE WHEN is_overtime THEN 0 ELSE hours END),
            SUM(CASE WHEN is_overtime THEN hours ELSE 0 END)
        INTO v_hours_worked, v_overtime_hours
        FROM time_entries
        WHERE employee_id = p_employee_id
            AND entry_date BETWEEN p_period_start AND p_period_end;

        -- Calculate pay
        v_gross_pay := (v_hours_worked * v_base_amount) +
                       (v_overtime_hours * v_base_amount * 1.5);
    END IF;

    -- Add variable compensation earned in period
    v_gross_pay := v_gross_pay + calculate_variable_pay(p_employee_id, p_period_start, p_period_end);

    -- Add allowances
    v_gross_pay := v_gross_pay + calculate_allowances(p_employee_id, p_period_start, p_period_end);

    RETURN v_gross_pay;
END;
$$ LANGUAGE plpgsql;
```

### Integration with Time Tracking

Time entries automatically apply overtime rules and shift differentials based on employee's compensation configuration.

### Integration with Reporting

Standard reports available:
- Total Compensation Report (base + variable + equity + allowances)
- Compensation by Department
- Salary Range Analysis
- Commission Payout Report
- Equity Vesting Schedule
- Overtime Cost Analysis

---

## Summary

This compensation framework provides:

✅ **Flexibility**: Supports any compensation structure
✅ **Scalability**: Add new compensation types without schema changes
✅ **Temporal**: Track all changes over time
✅ **Multi-Currency**: Full i18n support
✅ **Comprehensive**: Covers all scenarios from intern to executive
✅ **Accurate**: Precise calculation of total compensation
✅ **Compliant**: Supports regulatory requirements (FLSA, etc.)

The design uses:
- Separate tables for each compensation component
- JSONB for flexible/complex structures
- Effective dating for temporal changes
- Composable components that sum to total compensation
- Integration with existing employee and payroll systems

**Next Steps**: Update HR module specification to incorporate these compensation tables and workflows.
