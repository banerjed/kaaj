# D1 Schema Help Guide - Index

> **⚠️ Status: partially superseded — field meanings remain accurate.**
>
> This guide was written against the Cloudflare D1 (SQLite) schema. The
> authoritative schema is now [`schema.sql`](./schema.sql) (Supabase PostgreSQL).
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


**Version:** 6.1
**Last Updated:** 2025-12-29
**Schema File:** d1-schema-clean.sql
**Total Tables:** 52

---

## Overview

This help guide provides comprehensive documentation for all tables in the JHIRI D1 database schema. The schema is optimized for small-to-medium businesses (5-200 employees) and includes modules for:

- Firm Profile Management
- Employee & HR Management
- Time Tracking & Timesheets
- Compensation & Payroll
- Project Management (with Objectives)
- Ticketing System
- User Groups & Permissions

---

## Key Features

### Schema Optimization (v6.0)
- **Simplified for SMB**: Reduced from 55 to 44 tables (20% reduction)
- **Denormalized for Performance**: Employee directory queries require 0 joins (previously 5)
- **JSONB Fields**: Flexible fields for complex data (PTO balances, tax withholding, custom fields)
- **Inline Compensation**: Base compensation stored directly in employees table

### Latest Changes (v6.1)
Added 8 new HR tables for complete HR functionality:
- Employee Change Requests
- Emergency Contacts
- Employee Documents
- Benefits Enrollments
- Onboarding Tasks
- Continuous Feedback
- Surveys & Survey Responses

---

## Documentation Structure

This help guide is split into multiple parts for easier navigation:

### **[PART 1: FIRM, EMPLOYEE, USER GROUPS, HR CORE](SCHEMA-HELP-GUIDE-PART-1.md)**
Tables 1-17 covering:
- Firm Profile Module (3 tables)
- Employee Profile Module (4 tables)
- User Groups Module (3 tables)
- HR Core Module (7 tables)

### **[PART 2: TICKETING & PROJECT MANAGEMENT](SCHEMA-HELP-GUIDE-PART-2.md)**
Tables 18-34 covering:
- Ticketing Module (4 tables)
- Project Management Module v2.0 (17 tables)

### **[PART 3: COMPENSATION, PAYROLL, TIME TRACKING & HR ADDITIONAL](SCHEMA-HELP-GUIDE-PART-3.md)**
Tables 35-63 covering:
- Compensation Module (5 tables)
- Payroll Module (7 tables)
- Time Tracking Module (3 tables)
- HR Additional Features (8 tables)

---

## Quick Reference

### Complete Table List by Module

#### Firm Profile Module
1. `firm_locations` - Office locations and settings
2. `firm_departments` - Department hierarchy
3. `firm_holidays` - Location-specific holidays

#### Employee Profile Module
4. `employees` - Core employee records (with inline compensation)
5. `employee_assets` - Equipment assignments
6. `employee_training_records` - Training tracking
7. `employee_certifications` - Professional certifications

#### User Groups Module
8. `employee_user_groups` - Group definitions
9. `employee_group_members` - Group membership
10. `employee_group_roles` - Group permissions

#### HR Core Module
11. `hr_time_off_policies` - PTO policy definitions
12. `hr_time_off_requests` - PTO requests
13. `hr_attendance` - Daily attendance tracking
14. `hr_review_cycles` - Performance review cycles
15. `hr_reviews` - Individual performance reviews
16. `hr_change_requests` - Employee change requests
17. `hr_emergency_contacts` - Emergency contact info

#### Ticketing Module
18. `ticketing_business_areas` - Ticket categories/prefixes
19. `ticketing_tickets` - Support tickets
20. `ticketing_updates` - Ticket comments/updates
21. `ticketing_attachments` - Ticket file attachments

#### Project Management Module v2.0
22. `pm_objectives` - Strategic objectives (top-level)
23. `projects` - Projects under objectives
24. `tasks` - Tasks within projects
25. `pm_dashboards` - Custom dashboards
26. `pm_dashboard_widgets` - Dashboard widgets
27. `pm_automations` - Workflow automations
28. `pm_automation_executions` - Automation run history
29. `pm_task_comments` - Task discussion threads
30. `pm_project_templates` - Reusable project templates
31. `pm_task_time_entries` - Task-level time tracking
32. `pm_task_attachments` - Task file attachments

#### Compensation Module
33. `compensation_work_schedules` - Work schedule definitions
34. `compensation_variable` - Bonuses & commissions
35. `compensation_equity` - Stock options & equity
36. `compensation_allowances` - Housing, transport, etc.
37. `compensation_premiums` - Shift differentials, hazard pay

#### Payroll Module
38. `payroll_runs` - Payroll processing runs
39. `payroll_run_employees` - Individual paystubs
40. `payroll_tax_rates` - Tax rate reference data
41. `payroll_deduction_definitions` - Deduction types (401k, insurance)
42. `payroll_employee_deductions` - Employee-specific deductions
43. `payroll_tax_deposits` - Tax payment tracking

#### Time Tracking Module
44. `time_tracking_entries` - Individual time entries
45. `time_tracking_timesheets` - Timesheet aggregations
46. `time_tracking_billable_expenses` - Billable expense tracking

#### HR Additional Features (v6.1)
47. `hr_employee_documents` - Document management
48. `hr_benefits_enrollments` - Benefits enrollment tracking
49. `hr_onboarding_tasks` - Onboarding workflows
50. `hr_feedback` - Continuous feedback system
51. `hr_surveys` - Pulse surveys & engagement surveys
52. `hr_survey_responses` - Individual survey responses

---

## Reference Data Files

### JSONB Field Examples
See **[JSONB-FIELD-EXAMPLES.md](JSONB-FIELD-EXAMPLES.md)** for complete examples of all JSONB fields including:
- `employees.pto_balances` - PTO/time off balances
- `employees.tax_withholding` - W-4 and India tax declarations
- `employees.salary_structure` - Detailed CTC breakdown (India)
- `employees.variable_compensation` - Bonuses, commissions
- `employees.benefits_elections` - Health insurance, 401k, etc.
- `employees.custom_fields` - Organization-specific fields
- `tasks.custom_fields` - Project-specific task metadata
- `projects.custom_fields` - Client project metadata
- `hr_reviews.self_assessment` - Self-assessment data
- `hr_reviews.manager_assessment` - Manager evaluation
- `hr_reviews.goals` - Review period goals
- `hr_reviews.competencies` - Skill ratings
- `payroll_run_employees.earnings` - Earnings breakdown
- `payroll_run_employees.taxes` - Tax withholdings
- `payroll_run_employees.deductions` - Pre/post-tax deductions

### Enumerations
See **[enumerations.json](enumerations.json)** for all enumeration values organized by domain:
- Employment (employment types, statuses, work arrangements)
- Compensation (compensation types, equity types, allowances)
- Payroll (pay frequencies, payment methods, tax filing statuses)
- Time Off (time off types, accrual methods, carryover rules)
- Performance (review types, goal statuses, feedback types)
- Projects (project types, statuses, priorities, health indicators)
- Ticketing (ticket statuses, severities, request types)
- Assets (asset types, conditions)
- Training (training types, statuses)
- And many more...

---

## Data Model Highlights

### Key Design Patterns

#### 1. Denormalization for Performance
The `employees` table includes denormalized fields to avoid joins:
```sql
-- Instead of joining to departments table
department_name TEXT,        -- Denormalized from firm_departments
location_name TEXT,          -- Denormalized from firm_locations
manager_name TEXT,           -- Denormalized from employees (manager)
```

#### 2. Inline Compensation
Base compensation moved from separate table to employees:
```sql
-- Previously in compensation_base table, now inline:
employment_type TEXT,        -- full_time, part_time, contractor
base_amount REAL,           -- Salary or hourly rate amount
compensation_type TEXT,      -- salary, hourly, contract
pay_frequency TEXT,         -- bi-weekly, monthly, etc.
```

#### 3. JSONB for Flexibility
Complex, variable data stored as JSONB (stored as TEXT in D1):
```sql
pto_balances TEXT DEFAULT '{}',           -- {"vacation": 15.5, "sick": 10.0}
tax_withholding TEXT DEFAULT '{}',        -- W-4 or India tax declarations
custom_fields TEXT DEFAULT '{}',          -- Org-specific fields
```

#### 4. Hierarchical Structures
- **Departments**: `parent_department_code` for org charts
- **Tasks**: `parent_task_id` for subtasks
- **Projects**: `parent_project_id` for sub-projects
- **User Groups**: `parent_group_name` for nested groups

#### 5. Audit Trails
Most tables include:
```sql
created_at TEXT NOT NULL,
updated_at TEXT NOT NULL,
created_by TEXT NOT NULL,
version INTEGER DEFAULT 1  -- Optimistic locking
```

---

## Common Patterns

### Primary Keys
- All tables use UUIDs or custom IDs as TEXT primary keys
- Format examples: `EMP-001`, `PROJ-2024-001`, `TKT#123`

### Foreign Keys
- Cascade on UPDATE for code/ID changes
- CASCADE, SET NULL, or RESTRICT on DELETE depending on relationship
- Example:
```sql
FOREIGN KEY (employee_id) REFERENCES employees(employee_id)
    ON UPDATE CASCADE ON DELETE CASCADE
```

### Indexes
- Primary keys automatically indexed
- Foreign keys indexed for JOIN performance
- Composite indexes for common query patterns
- Partial indexes for filtered queries (`WHERE is_active = 1`)

### Enumerations
- Stored as TEXT (not integers)
- Values defined in `enumerations.json`
- Validated at application layer
- Examples: `employment_status`, `ticket_severity`, `project_status`

### Boolean Fields
- Stored as INTEGER (0 or 1) per SQLite convention
- Examples: `is_active`, `is_billable`, `overtime_eligible`

### Timestamps
- Stored as TEXT in ISO 8601 format: `"2024-01-15T10:30:00Z"`
- All times in UTC, converted to user timezone in application

---

## Usage Notes

### Reading This Guide

Each table section includes:
- **Table Name & Purpose**: High-level description
- **Dependencies**: Related tables and foreign keys
- **Column Reference**: Every column with:
  - **Name**: Column identifier
  - **Purpose**: What the field stores
  - **Sample Values**: Example data for context
  - **Type/Constraints**: Data type and validation rules
  - **Enumeration Reference**: Link to enum values (if applicable)
  - **JSONB Reference**: Link to JSONB examples (if applicable)

### Sample Value Notation

- `"EMP-001"` - String/TEXT values in quotes
- `1`, `42.5` - Numeric values (INTEGER or REAL)
- `0`, `1` - Boolean values (SQLite INTEGER)
- `'2024-01-15'` - Date strings (ISO format)
- `'2024-01-15T10:30:00Z'` - DateTime strings (ISO 8601 with UTC)
- `NULL` - Null/empty value
- `'{...}'` - JSONB object (stored as TEXT)
- `'[...]'` - JSONB array (stored as TEXT)

---

## Version History

### v6.1 (2025-12-29) - Added Missing HR Features
- Added 8 new tables: change requests, emergency contacts, documents, benefits enrollments, onboarding tasks, feedback, surveys
- Total: 52 tables (up from 44)

### v6.0 (2025-12-28) - SMB Optimization
- Removed 11 over-normalized tables (20% reduction)
- Inlined compensation to employees table
- Added JSONB fields for flexibility
- Denormalized for performance (0-join employee directory)
- Total: 44 tables (down from 55)

### v5.0 - Module Prefixes
- Renamed 28 tables with consistent module prefixes
- `firm_*`, `employee_*`, `hr_*`, `pm_*`, `ticketing_*`, `compensation_*`, `payroll_*`, `time_tracking_*`

### v4.0 - Compensation & Payroll
- Added 21 tables for compensation, payroll, and time tracking
- Total: 55 tables (up from 34)

### v3.0 - Project Management v2.0
- Added 13 PM tables with objectives layer
- Dashboards, automations, typed columns
- Total: 34 tables (up from 21)

---

## Getting Started

1. **Browse the Index**: Start here to understand the overall structure
2. **Navigate to Module**: Jump to relevant part (Part 1, 2, or 3)
3. **Review Table Details**: Read column-by-column documentation
4. **Check References**: Refer to JSONB examples and enumerations as needed
5. **Cross-Reference**: Follow foreign key relationships between tables

---

## Additional Resources

- **Schema File**: `d1-schema-clean.sql` - Full DDL with all CREATE TABLE statements
- **JSONB Examples**: `JSONB-FIELD-EXAMPLES.md` - Sample values for all JSONB fields
- **Enumerations**: `enumerations.json` - Complete enumeration definitions
- **Design Specs**: Parent folder contains detailed module specifications
- **Best Practices**: `d1-best-practices.md` - D1 database optimization guidelines

---

## Support & Questions

For questions about:
- **Schema Design**: Refer to `d1-schemas-modules.md` in parent folder
- **Module Functionality**: See `module-*.md` files in parent folder
- **JSONB Usage**: Check `JSONB-FIELD-EXAMPLES.md`
- **Enumerations**: Reference `enumerations.json`
- **Performance**: Review `d1-best-practices.md`

---

**Navigate to:**
- **[Part 1: Firm, Employee, User Groups, HR Core →](SCHEMA-HELP-GUIDE-PART-1.md)**
- **[Part 2: Ticketing & Project Management →](SCHEMA-HELP-GUIDE-PART-2.md)**
- **[Part 3: Compensation, Payroll, Time Tracking, HR Additional →](SCHEMA-HELP-GUIDE-PART-3.md)**
