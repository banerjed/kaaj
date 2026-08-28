# JSONB Field Structure Examples

> **⚠️ Status: partially superseded — field meanings remain accurate.**
>
> This guide was written against the Cloudflare D1 (SQLite) schema. The
> authoritative schema is now [`schema.sql`](../../packages/database/reference/schema.sql) (Supabase PostgreSQL).
>
> **Still accurate:** every table and field described here exists in the current
> schema, and the *business meaning*, purpose, dependencies and examples are
> unchanged. All 25 JSONB columns across 8 tables documented below survive the migration.
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


**Version:** 6.0
**Date:** 2025-12-28
**Purpose:** Complete reference for all JSONB fields in simplified SMB schema

---

## EMPLOYEES TABLE

### 1. `pto_balances` - PTO/Time Off Balances

**Purpose:** Track employee vacation, sick, and personal time balances
**Type:** Object with balance types as keys

```json
{
  "vacation": 15.5,
  "sick": 10.0,
  "personal": 3.0,
  "floating_holiday": 2.0
}
```

**Update Trigger:** Recalculate when:
- Time off request approved
- Annual accrual runs
- Manual adjustment by HR

**Access Pattern:**
```sql
-- Get employee's vacation balance
SELECT pto_balances->>'vacation' as vacation_balance
FROM employees
WHERE employee_id = 'EMP-001';

-- Find employees with low PTO
SELECT employee_id, name, pto_balances->>'vacation' as vacation
FROM employees
WHERE CAST(pto_balances->>'vacation' AS REAL) < 5.0;
```

---

### 2. `tax_withholding` - Tax Withholding Information

**Purpose:** Store W-4 (US) or equivalent tax election data
**Type:** Object with country-specific fields

#### US Employee Example (W-4):
```json
{
  "country": "US",
  "filing_status": "married_filing_jointly",
  "multiple_jobs": false,
  "dependents_amount": 4000,
  "other_income": 0,
  "deductions": 2000,
  "extra_withholding": 50,
  "exempt": false,
  "state_withholding": {
    "CA": {
      "filing_status": "married",
      "allowances": 2,
      "extra_withholding": 0
    }
  },
  "updated_date": "2024-01-15"
}
```

#### India Employee Example (Form 12BB):
```json
{
  "country": "IN",
  "tax_regime": "new",
  "pan_number": "ABCDE1234F",
  "section_80c": 150000,
  "section_80d": 25000,
  "hra_exemption_monthly": 15000,
  "rent_paid_monthly": 25000,
  "metro_city": true,
  "previous_employer": {
    "income": 500000,
    "tds_deducted": 50000
  },
  "updated_date": "2024-04-01"
}
```

**Validation:**
```javascript
// Example validation logic
function validateTaxWithholding(data) {
  if (data.country === 'US') {
    const validStatuses = ['single', 'married_filing_jointly', 'married_filing_separately', 'head_of_household'];
    if (!validStatuses.includes(data.filing_status)) {
      throw new Error('Invalid filing status');
    }
  }

  if (data.country === 'IN' && data.tax_regime === 'old') {
    // Old regime requires section declarations
    if (!data.section_80c) data.section_80c = 0;
  }
}
```

---

### 3. `salary_structure` - Detailed Salary Breakdown

**Purpose:** Store detailed salary components (especially for India CTC breakdown)
**Type:** Object with earnings, deductions, and employer contributions

#### India Employee (CTC Structure):
```json
{
  "country": "IN",
  "annual_ctc": 1200000,
  "currency": "INR",
  "earnings": {
    "basic_salary": 600000,
    "hra": 240000,
    "special_allowance": 240000,
    "conveyance_allowance": 19200,
    "medical_allowance": 15000,
    "education_allowance": 12000,
    "lta": 0,
    "performance_bonus": 50000,
    "annual_bonus": 23800
  },
  "deductions": {
    "employee_pf": 21600,
    "professional_tax": 2400
  },
  "employer_contributions": {
    "employer_pf": 21600,
    "employer_esi": 0,
    "gratuity": 23077
  },
  "monthly_gross": 93267,
  "monthly_net": 91067,
  "updated_date": "2024-04-01"
}
```

#### US Employee (Simple Structure):
```json
{
  "country": "US",
  "annual_salary": 120000,
  "currency": "USD",
  "earnings": {
    "base_salary": 120000
  },
  "benefits_cost": {
    "health_insurance": 8400,
    "dental_insurance": 600,
    "vision_insurance": 180,
    "life_insurance": 240,
    "401k_match": 6000
  },
  "updated_date": "2024-01-01"
}
```

**Null for Simple Cases:**
```json
// Most US hourly employees can have null salary_structure
null
```

---

### 4. `variable_compensation` - Bonuses, Commissions

**Purpose:** Track variable pay components
**Type:** Array of compensation components

```json
[
  {
    "type": "quarterly_bonus",
    "name": "Q4 Performance Bonus",
    "target_amount": 10000,
    "currency": "USD",
    "frequency": "quarterly",
    "next_payment_date": "2024-01-15",
    "performance_metrics": {
      "revenue_target": 500000,
      "customer_satisfaction": 4.5,
      "team_goals_met": 0.9
    },
    "status": "active"
  },
  {
    "type": "commission",
    "name": "Sales Commission",
    "commission_rate": 0.05,
    "quota_monthly": 100000,
    "currency": "USD",
    "frequency": "monthly",
    "tier_structure": [
      {"threshold": 0, "rate": 0.03},
      {"threshold": 100000, "rate": 0.05},
      {"threshold": 150000, "rate": 0.07}
    ],
    "status": "active"
  }
]
```

**Empty Array for Most Employees:**
```json
[]
```

---

### 5. `benefits_elections` - Benefits Enrollment

**Purpose:** Track employee benefit selections
**Type:** Object with benefit categories

```json
{
  "health_insurance": {
    "plan": "PPO Gold",
    "coverage": "employee_spouse",
    "carrier": "Blue Cross",
    "employee_cost_monthly": 350,
    "employer_cost_monthly": 850,
    "enrolled_date": "2024-01-01",
    "dependents": [
      {"name": "Jane Doe", "relationship": "spouse", "dob": "1985-03-15"}
    ]
  },
  "dental_insurance": {
    "plan": "Standard",
    "coverage": "employee_only",
    "employee_cost_monthly": 25,
    "enrolled_date": "2024-01-01"
  },
  "retirement_401k": {
    "contribution_percentage": 6.0,
    "employer_match_percentage": 3.0,
    "vested_percentage": 60.0,
    "enrolled_date": "2024-01-01"
  },
  "hsa": {
    "employee_contribution_annual": 3000,
    "employer_contribution_annual": 1000,
    "enrolled_date": "2024-01-01"
  },
  "life_insurance": {
    "coverage_amount": 250000,
    "beneficiary": "Jane Doe",
    "beneficiary_relationship": "spouse"
  }
}
```

---

### 6. `custom_fields` - Organization-Specific Fields

**Purpose:** Store any custom employee fields defined by organization
**Type:** Flexible object

```json
{
  "employee_id_legacy": "12345",
  "shirt_size": "L",
  "parking_spot": "A-42",
  "security_clearance": "Secret",
  "preferred_pronouns": "she/her",
  "dietary_restrictions": "vegetarian",
  "emergency_contact_relationship": "spouse",
  "home_office_stipend_eligible": true,
  "company_vehicle_assigned": false,
  "laptop_model": "MacBook Pro 16-inch M3",
  "laptop_serial": "C02XJ0PHJG5H"
}
```

---

## TASKS TABLE

### 7. `custom_fields` - Task Custom Fields

**Purpose:** Store project-specific custom task fields
**Type:** Flexible object

**Professional Services Example:**
```json
{
  "client_contact": "John Smith",
  "client_email": "john@client.com",
  "billable": true,
  "invoice_line_item_id": "INV-123-LINE-5",
  "deliverable_type": "Design Mockups",
  "approval_required": true,
  "approved_by": "EMP-045",
  "approved_date": "2024-12-15",
  "client_feedback": "Looks great, minor revisions needed",
  "revision_count": 2,
  "final_deliverable_url": "https://files.example.com/mockups-v3.pdf"
}
```

**Software Development Example:**
```json
{
  "story_points": 8,
  "sprint": "Sprint 23",
  "epic_id": "EPIC-45",
  "component": "Authentication",
  "qa_status": "passed",
  "deployed_to_staging": true,
  "deployed_to_production": false,
  "code_review_url": "https://github.com/org/repo/pull/456",
  "test_coverage_percent": 87.5
}
```

**Marketing Campaign Example:**
```json
{
  "campaign_name": "Q1 Product Launch",
  "channel": "Email",
  "target_audience": "Enterprise customers",
  "budget_allocated": 5000,
  "budget_spent": 3200,
  "impressions": 50000,
  "click_through_rate": 3.2,
  "conversion_rate": 1.8,
  "roi": 2.5
}
```

**Empty Object (Most Common):**
```json
{}
```

---

## PROJECTS TABLE

### 8. `custom_fields` - Project Custom Fields

**Purpose:** Store project-specific metadata
**Type:** Flexible object

**Client Project Example:**
```json
{
  "client_name": "Acme Corp",
  "client_contact": "Jane Smith",
  "client_email": "jane@acme.com",
  "client_phone": "+1-555-0123",
  "contract_type": "Fixed Price",
  "contract_value": 150000,
  "payment_terms": "Net 30",
  "payment_milestones": [
    {"milestone": "Kickoff", "percentage": 25, "due_date": "2024-01-15", "status": "paid"},
    {"milestone": "Design Complete", "percentage": 25, "due_date": "2024-02-15", "status": "pending"},
    {"milestone": "Development Complete", "percentage": 30, "due_date": "2024-04-15", "status": "pending"},
    {"milestone": "Launch", "percentage": 20, "due_date": "2024-05-15", "status": "pending"}
  ],
  "nda_signed": true,
  "nda_date": "2023-12-01",
  "contract_url": "https://files.example.com/contracts/acme-2024.pdf",
  "project_manager_notes": "Client prefers weekly check-ins on Fridays",
  "risk_level": "low"
}
```

**Internal Project Example:**
```json
{
  "department": "Engineering",
  "quarter": "Q1 2024",
  "okr_alignment": "Improve product stability",
  "success_criteria": [
    "Reduce bug count by 50%",
    "Improve test coverage to 90%",
    "Zero critical incidents"
  ],
  "stakeholders": ["CTO", "VP Engineering", "Product Manager"]
}
```

---

## HR_REVIEWS TABLE

### 9. `self_assessment` - Employee Self-Assessment

**Purpose:** Structured self-assessment data
**Type:** Object with assessment components

```json
{
  "accomplishments": [
    "Led migration to new tech stack, reducing load time by 40%",
    "Mentored 2 junior developers",
    "Shipped 12 major features on time"
  ],
  "challenges": [
    "Balancing technical debt with feature development",
    "Learning new cloud infrastructure"
  ],
  "strengths": "Problem solving, collaboration, technical expertise",
  "areas_for_growth": "Public speaking, project management",
  "career_goals": "Move into tech lead role within next year",
  "training_requested": [
    "AWS Solutions Architect certification",
    "Leadership fundamentals course"
  ],
  "overall_self_rating": 4,
  "comments": "Strong year with significant technical contributions"
}
```

---

### 10. `manager_assessment` - Manager Assessment

**Purpose:** Manager's evaluation of employee
**Type:** Object with assessment components

```json
{
  "performance_summary": "Exceptional technical contributions. Consistently delivers high-quality work ahead of schedule.",
  "strengths": [
    "Strong technical skills across full stack",
    "Excellent collaboration with cross-functional teams",
    "Proactive in identifying and solving problems"
  ],
  "areas_for_improvement": [
    "Could improve written documentation",
    "Take on more leadership in team meetings"
  ],
  "key_accomplishments": [
    "Architected and led successful platform migration",
    "Reduced system downtime by 60%",
    "Became go-to expert for performance optimization"
  ],
  "goals_for_next_period": [
    "Lead design reviews for team",
    "Mentor 3 junior engineers",
    "Complete AWS certification"
  ],
  "promotion_readiness": "Ready for Senior Engineer promotion",
  "compensation_recommendation": "5% merit increase + promotion adjustment",
  "overall_rating": 5,
  "rating_justification": "Exceeds expectations in all areas. Strong candidate for promotion."
}
```

---

### 11. `goals` - Review Period Goals

**Purpose:** Track goals set during review
**Type:** Array of goal objects

```json
[
  {
    "goal_id": "G-2024-001",
    "category": "technical",
    "description": "Complete AWS Solutions Architect certification",
    "due_date": "2024-06-30",
    "status": "completed",
    "completed_date": "2024-05-15",
    "notes": "Passed with score of 920/1000"
  },
  {
    "goal_id": "G-2024-002",
    "category": "leadership",
    "description": "Mentor 2 junior developers through onboarding",
    "due_date": "2024-12-31",
    "status": "in_progress",
    "progress_percentage": 60,
    "notes": "Currently mentoring Sarah and Mike"
  },
  {
    "goal_id": "G-2024-003",
    "category": "project",
    "description": "Lead redesign of payment processing system",
    "success_criteria": [
      "Zero payment failures",
      "Sub-500ms response time",
      "PCI compliance audit passed"
    ],
    "due_date": "2024-09-30",
    "status": "not_started",
    "dependencies": "Waiting on vendor selection"
  }
]
```

---

### 12. `competencies` - Skill Ratings

**Purpose:** Track ratings on defined competencies
**Type:** Array of competency ratings

```json
[
  {
    "competency": "Technical Expertise",
    "rating": 5,
    "comments": "Expert-level knowledge of React, Node.js, PostgreSQL. Quickly masters new technologies."
  },
  {
    "competency": "Problem Solving",
    "rating": 5,
    "comments": "Exceptional at diagnosing complex issues. Proactive in preventing problems."
  },
  {
    "competency": "Collaboration",
    "rating": 4,
    "comments": "Works well with team. Could improve cross-department communication."
  },
  {
    "competency": "Leadership",
    "rating": 3,
    "comments": "Developing leadership skills. Shows promise in mentoring juniors."
  },
  {
    "competency": "Communication",
    "rating": 4,
    "comments": "Clear technical communication. Written documentation needs improvement."
  },
  {
    "competency": "Initiative",
    "rating": 5,
    "comments": "Consistently goes above and beyond. Self-directed and proactive."
  }
]
```

**Rating Scale:** 1 = Needs Improvement, 2 = Developing, 3 = Meets Expectations, 4 = Exceeds Expectations, 5 = Outstanding

---

## TIME_TRACKING_ENTRIES TABLE

### 13. `tags` - Time Entry Tags/Labels

**Purpose:** Categorize time entries for reporting
**Type:** Simple text field (space or comma-separated tags)

**Examples:**
```
"billable client-facing urgent"
"internal admin non-billable"
"bug-fix production-issue client-acme"
"research r-and-d non-billable"
```

**As JSON Array Alternative:**
```json
["billable", "client-facing", "urgent"]
```

---

## PAYROLL_RUN_EMPLOYEES TABLE

### 14. `earnings` - Earnings Breakdown

**Purpose:** Detailed earnings components for pay period
**Type:** Object with earning types

```json
{
  "regular_pay": 3846.15,
  "overtime_pay": 450.00,
  "double_time_pay": 0,
  "pto_pay": 296.15,
  "sick_pay": 0,
  "holiday_pay": 0,
  "bonus": 1000.00,
  "commission": 750.00,
  "reimbursements": 125.50,
  "other": 0
}
```

---

### 15. `pretax_deductions` - Pre-Tax Deductions

**Purpose:** Deductions that reduce taxable income
**Type:** Object with deduction types

```json
{
  "401k": 461.54,
  "health_insurance": 175.00,
  "dental_insurance": 25.00,
  "vision_insurance": 10.00,
  "hsa": 115.38,
  "fsa_healthcare": 0,
  "fsa_dependent_care": 0,
  "commuter_benefits": 50.00
}
```

---

### 16. `taxes` - Tax Withholdings

**Purpose:** Federal, state, local tax withholdings
**Type:** Object with tax types

**US Employee:**
```json
{
  "federal_income_tax": 720.00,
  "social_security": 296.15,
  "medicare": 69.23,
  "state_income_tax": 180.00,
  "local_income_tax": 0,
  "sdi": 12.00,
  "sui": 0
}
```

**India Employee:**
```json
{
  "tds": 5000.00,
  "employee_pf": 1800.00,
  "employee_esi": 150.00,
  "professional_tax": 200.00
}
```

---

### 17. `employer_taxes` - Employer Tax Contributions

**Purpose:** Employer portion of taxes (for accounting)
**Type:** Object with tax types

```json
{
  "social_security": 296.15,
  "medicare": 69.23,
  "futa": 6.00,
  "suta": 30.00,
  "employer_pf": 1800.00,
  "employer_esi": 150.00
}
```

---

### 18. `posttax_deductions` - Post-Tax Deductions

**Purpose:** Deductions after tax calculation
**Type:** Object with deduction types

```json
{
  "roth_401k": 200.00,
  "life_insurance": 20.00,
  "disability_insurance": 15.00,
  "union_dues": 50.00,
  "garnishment_child_support": 0,
  "garnishment_student_loan": 0,
  "charitable_contributions": 25.00
}
```

---

### 19. `taxable_wages` - Taxable Wage Breakdown

**Purpose:** Different wage bases for different taxes
**Type:** Object with wage types

```json
{
  "federal_wages": 5467.80,
  "social_security_wages": 4781.31,
  "medicare_wages": 4781.31,
  "state_wages": 5467.80,
  "local_wages": 0,
  "futa_wages": 4781.31,
  "suta_wages": 4781.31
}
```

---

### 20. `payment_details` - Payment Method Info

**Purpose:** How employee gets paid
**Type:** Object with payment method details

**Direct Deposit:**
```json
{
  "method": "direct_deposit",
  "bank_name": "Chase Bank",
  "account_type": "checking",
  "account_last_four": "1234",
  "routing_number_last_four": "5678"
}
```

**Check:**
```json
{
  "method": "check",
  "check_number": "45678",
  "mailing_address": "123 Main St, Anytown, CA 12345"
}
```

**Paycard:**
```json
{
  "method": "paycard",
  "card_last_four": "9876",
  "provider": "ADP Paycard"
}
```

---

### 21. `calculation_details` - Payroll Calculation Audit Trail

**Purpose:** Track how pay was calculated (for auditing)
**Type:** Object with calculation metadata

```json
{
  "calculated_date": "2024-01-05T10:30:00Z",
  "calculated_by": "system",
  "calculation_version": "2.1.5",
  "time_entries_included": 42,
  "time_entries_total_hours": 88.5,
  "pto_hours_used": 8.0,
  "holiday_hours_paid": 0,
  "overtime_calculation": {
    "regular_hours": 80,
    "overtime_hours": 8.5,
    "double_time_hours": 0,
    "overtime_threshold": 40,
    "overtime_multiplier": 1.5
  },
  "tax_calculation": {
    "federal_withholding_method": "wage_bracket",
    "state_withholding_method": "percentage",
    "exemptions_claimed": 0,
    "additional_withholding": 50.00
  },
  "warnings": [],
  "adjustments": [
    {
      "type": "manual",
      "reason": "Correction for previous period",
      "amount": 50.00,
      "adjusted_by": "HR-MGR-001"
    }
  ]
}
```

---

## COMPENSATION_VARIABLE TABLE

### 22. `commission_structure` - Commission Plan Details

**Purpose:** Define how commissions are calculated
**Type:** Object with commission rules

**Tiered Commission:**
```json
{
  "type": "tiered",
  "base_rate": 0.05,
  "tiers": [
    {"threshold": 0, "rate": 0.03, "label": "0-100k"},
    {"threshold": 100000, "rate": 0.05, "label": "100k-250k"},
    {"threshold": 250000, "rate": 0.07, "label": "250k+"}
  ],
  "calculation_basis": "revenue",
  "payment_timing": "upon_collection"
}
```

**Flat Rate Commission:**
```json
{
  "type": "flat_rate",
  "rate": 0.10,
  "calculation_basis": "gross_profit",
  "minimum_margin": 0.30,
  "payment_timing": "monthly"
}
```

---

### 23. `quota_structure` - Sales Quota Details

**Purpose:** Define sales targets and accelerators
**Type:** Object with quota rules

```json
{
  "period": "quarterly",
  "quota_amount": 500000,
  "currency": "USD",
  "accelerators": [
    {
      "threshold_percentage": 100,
      "multiplier": 1.0,
      "label": "At quota"
    },
    {
      "threshold_percentage": 125,
      "multiplier": 1.5,
      "label": "25% over quota"
    },
    {
      "threshold_percentage": 150,
      "multiplier": 2.0,
      "label": "50% over quota"
    }
  ],
  "minimum_threshold": 0.80,
  "below_threshold_penalty": "pro_rated"
}
```

---

### 24. `performance_metrics` - Performance Measurement

**Purpose:** Track KPIs for variable compensation
**Type:** Object with metrics and targets

```json
{
  "revenue_target": 500000,
  "revenue_weight": 0.60,
  "customer_satisfaction_target": 4.5,
  "customer_satisfaction_weight": 0.20,
  "retention_rate_target": 0.95,
  "retention_rate_weight": 0.20,
  "measurement_period": "quarterly",
  "payout_calculation": "weighted_average"
}
```

---

## FIRM_LOCATIONS TABLE

### 25. `working_hours` - Location Working Hours

**Purpose:** Define business hours for location
**Type:** Object with days of week (ALREADY IN SCHEMA - this is a good example)

```json
{
  "monday": {"start": "09:00", "end": "17:00"},
  "tuesday": {"start": "09:00", "end": "17:00"},
  "wednesday": {"start": "09:00", "end": "17:00"},
  "thursday": {"start": "09:00", "end": "17:00"},
  "friday": {"start": "09:00", "end": "17:00"},
  "saturday": {"start": "closed", "end": "closed"},
  "sunday": {"start": "closed", "end": "closed"}
}
```

**24/7 Operation:**
```json
{
  "monday": {"start": "00:00", "end": "23:59"},
  "tuesday": {"start": "00:00", "end": "23:59"},
  "wednesday": {"start": "00:00", "end": "23:59"},
  "thursday": {"start": "00:00", "end": "23:59"},
  "friday": {"start": "00:00", "end": "23:59"},
  "saturday": {"start": "00:00", "end": "23:59"},
  "sunday": {"start": "00:00", "end": "23:59"}
}
```

---

## BEST PRACTICES FOR JSONB FIELDS

### Validation

```javascript
// Example Cloudflare Worker validation
function validatePTOBalances(balances) {
  const allowedTypes = ['vacation', 'sick', 'personal', 'floating_holiday'];

  for (const [type, balance] of Object.entries(balances)) {
    if (!allowedTypes.includes(type)) {
      throw new Error(`Invalid PTO type: ${type}`);
    }

    if (typeof balance !== 'number' || balance < 0) {
      throw new Error(`Invalid balance for ${type}: must be positive number`);
    }
  }

  return true;
}
```

### Querying

```sql
-- Extract specific field
SELECT
  employee_id,
  pto_balances->>'vacation' as vacation_days
FROM employees;

-- Filter by JSONB field
SELECT employee_id, name
FROM employees
WHERE CAST(pto_balances->>'vacation' AS REAL) < 5.0;

-- Search within array (SQLite json_each)
SELECT e.employee_id, e.name
FROM employees e,
     json_each(e.variable_compensation) vc
WHERE json_extract(vc.value, '$.type') = 'commission'
  AND json_extract(vc.value, '$.status') = 'active';
```

### Updating

```sql
-- Update entire JSONB field
UPDATE employees
SET pto_balances = '{"vacation": 20.0, "sick": 10.0}'
WHERE employee_id = 'EMP-001';

-- Update specific field (requires JSON manipulation)
UPDATE employees
SET pto_balances = json_set(
  pto_balances,
  '$.vacation',
  json_extract(pto_balances, '$.vacation') - 8.0
)
WHERE employee_id = 'EMP-001';
```

### Defaults

```sql
-- In table definition
CREATE TABLE employees (
  ...
  pto_balances TEXT DEFAULT '{}',
  tax_withholding TEXT DEFAULT '{}',
  custom_fields TEXT DEFAULT '{}',
  ...
);
```

---

## MIGRATION GUIDE

### Converting Existing Data

```javascript
// Example: Migrate from compensation_base table to inline fields
async function migrateCompensationBase(db) {
  const compensationRecords = await db
    .prepare('SELECT * FROM compensation_base WHERE effective_to IS NULL')
    .all();

  for (const comp of compensationRecords) {
    await db
      .prepare(`
        UPDATE employees
        SET
          compensation_type = ?,
          base_amount = ?,
          pay_frequency = ?,
          overtime_eligible = ?
        WHERE employee_id = ?
      `)
      .bind(
        comp.compensation_type,
        comp.amount,
        comp.pay_frequency,
        comp.overtime_eligible,
        comp.employee_id
      )
      .run();
  }
}
```

### Indexing JSONB Fields

```sql
-- For frequently queried JSONB fields, create generated columns
ALTER TABLE employees
ADD COLUMN vacation_balance REAL
GENERATED ALWAYS AS (CAST(pto_balances->>'vacation' AS REAL)) STORED;

CREATE INDEX idx_employees_vacation_balance
ON employees(vacation_balance)
WHERE vacation_balance IS NOT NULL;
```

---

**End of JSONB Field Examples**
