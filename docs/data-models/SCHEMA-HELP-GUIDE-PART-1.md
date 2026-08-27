# D1 Schema Help Guide - Part 1

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


**Tables 1-17: Firm Profile, Employee Profile, User Groups, HR Core**

[← Back to Index](SCHEMA-HELP-GUIDE.md) | [Part 2 →](SCHEMA-HELP-GUIDE-PART-2.md)

---

## FIRM PROFILE MODULE

### Table 1: `firm_locations`

**Purpose**: Store office locations, addresses, and location-specific settings (working hours, timezone, currency, holiday calendar).

**Dependencies**: None (foundational table)

**Key Features**:
- Supports multiple locations with headquarters designation
- Working hours stored as JSONB
- Timezone and locale settings per location
- Capacity tracking for office space planning

#### Columns

| Column | Purpose | Sample Values | Type/Constraints |
|--------|---------|---------------|------------------|
| `location_code` | **Primary Key** - Unique location identifier | `"NYC"`, `"SF"`, `"LON"` | TEXT, 2-20 chars, A-Z0-9- |
| `name` | Location display name | `"New York Office"`, `"San Francisco HQ"` | TEXT, NOT NULL |
| `address_line1` | Street address line 1 | `"123 Main Street"` | TEXT |
| `address_line2` | Street address line 2 (suite, floor) | `"Suite 400"`, `"Floor 12"` | TEXT |
| `city` | City name | `"New York"`, `"San Francisco"` | TEXT |
| `state` | State/province code | `"NY"`, `"CA"`, `"ON"` | TEXT |
| `postal_code` | ZIP/postal code | `"10001"`, `"94102"` | TEXT |
| `country` | ISO country code | `"US"`, `"CA"`, `"GB"`, `"IN"` | TEXT, DEFAULT 'US' |
| `timezone` | IANA timezone identifier | `"America/New_York"`, `"Europe/London"` | TEXT, DEFAULT 'America/New_York' |
| `locale` | Locale code for formatting | `"en-US"`, `"en-GB"`, `"hi-IN"` | TEXT |
| `currency` | Default currency for location | `"USD"`, `"GBP"`, `"INR"` | TEXT |
| `holiday_calendar_id` | Reference to holiday calendar | `"US-NYC"`, `"IN-MH"` | TEXT |
| `phone` | Location phone number | `"+1-212-555-0100"` | TEXT |
| `email` | Location email address | `"nyc@company.com"` | TEXT |
| `working_hours` | Standard working hours by day **(JSONB)** | See below | TEXT (JSONB), DEFAULT set |
| `is_headquarters` | Is this the headquarters? | `1` (yes), `0` (no) | INTEGER, DEFAULT 0 |
| `is_active` | Location currently active? | `1` (active), `0` (inactive) | INTEGER, DEFAULT 1 |
| `capacity` | Number of employees location can hold | `50`, `100`, `250` | INTEGER |
| `created_at` | Creation timestamp (UTC) | `"2024-01-15T10:30:00Z"` | TEXT, NOT NULL |
| `updated_at` | Last update timestamp (UTC) | `"2024-03-20T14:45:00Z"` | TEXT, NOT NULL |
| `created_by` | Employee ID who created record | `"EMP-001"` | TEXT, NOT NULL |

**JSONB Field: `working_hours`**
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

**Indexes**:
- Unique index on `is_headquarters` WHERE `is_headquarters = 1` (only one HQ)
- Index on `is_active`
- Index on `country`

---

### Table 2: `firm_departments`

**Purpose**: Organizational department hierarchy with parent-child relationships.

**Dependencies**:
- `firm_locations` (optional location assignment)
- Self-referencing for parent departments

**Key Features**:
- Hierarchical structure via `parent_department_code`
- Department head employee assignment
- Cost center and budget tracking
- Can be associated with specific location

#### Columns

| Column | Purpose | Sample Values | Type/Constraints |
|--------|---------|---------------|------------------|
| `department_code` | **Primary Key** - Unique dept identifier | `"ENG"`, `"HR"`, `"SALES"` | TEXT, 2-20 chars, A-Z0-9- |
| `parent_department_code` | Parent department for hierarchy | `"ENG"` (parent of `"ENG-FE"`), `NULL` | TEXT, FK to self |
| `name` | Department display name | `"Engineering"`, `"Human Resources"` | TEXT, NOT NULL |
| `description` | Department description | `"Software development and DevOps"` | TEXT |
| `location_code` | Default location for department | `"NYC"`, `"SF"` | TEXT, FK to firm_locations |
| `head_employee_id` | Department manager/head | `"EMP-042"` | TEXT, FK to employees |
| `cost_center` | Accounting cost center code | `"CC-100"`, `"CC-250"` | TEXT |
| `budget_currency` | Budget currency | `"USD"`, `"EUR"` | TEXT, DEFAULT 'USD' |
| `is_active` | Department currently active? | `1` (active), `0` (inactive) | INTEGER, DEFAULT 1 |
| `created_at` | Creation timestamp (UTC) | `"2024-01-15T10:30:00Z"` | TEXT, NOT NULL |
| `updated_at` | Last update timestamp (UTC) | `"2024-03-20T14:45:00Z"` | TEXT, NOT NULL |
| `created_by` | Employee ID who created record | `"EMP-001"` | TEXT, NOT NULL |

**Indexes**:
- Index on `parent_department_code`
- Index on `location_code`
- Index on `is_active`

**Example Hierarchy**:
```
ENG (Engineering)
  ├── ENG-FE (Frontend Engineering)
  ├── ENG-BE (Backend Engineering)
  └── ENG-DEVOPS (DevOps)
SALES (Sales)
  ├── SALES-EAST (East Coast Sales)
  └── SALES-WEST (West Coast Sales)
```

---

### Table 3: `firm_holidays`

**Purpose**: Location-specific holidays and observed dates.

**Dependencies**:
- `firm_locations` (each holiday tied to a location)

**Key Features**:
- Location-specific holiday calendars
- Recurring holiday support
- Observed date handling (e.g., when holiday falls on weekend)
- Paid/unpaid and mandatory/optional flags

#### Columns

| Column | Purpose | Sample Values | Type/Constraints |
|--------|---------|---------------|------------------|
| `holiday_id` | **Primary Key** - Unique holiday ID | `"HOL-2024-001"` | TEXT |
| `location_code` | Location where holiday applies | `"NYC"`, `"LON"`, `"MUM"` | TEXT, FK to firm_locations, NOT NULL |
| `name` | Holiday name | `"New Year's Day"`, `"Diwali"` | TEXT, NOT NULL |
| `date` | Actual holiday date | `"2024-01-01"`, `"2024-11-12"` | TEXT (ISO date), NOT NULL |
| `observed_at` | Date observed if different | `"2024-01-02"` (Monday if NYD on Sunday) | TEXT (ISO date) |
| `is_recurring` | Repeats annually? | `1` (yes), `0` (no) | INTEGER, DEFAULT 0 |
| `recurrence_rule` | iCal-style recurrence rule | `"FREQ=YEARLY;BYMONTH=1;BYMONTHDAY=1"` | TEXT |
| `is_paid` | Paid time off? | `1` (paid), `0` (unpaid) | INTEGER, DEFAULT 1 |
| `is_mandatory` | Mandatory office closure? | `1` (mandatory), `0` (optional) | INTEGER, DEFAULT 1 |
| `created_at` | Creation timestamp (UTC) | `"2024-01-15T10:30:00Z"` | TEXT, NOT NULL |
| `updated_at` | Last update timestamp (UTC) | `"2024-03-20T14:45:00Z"` | TEXT, NOT NULL |
| `created_by` | Employee ID who created record | `"EMP-001"` | TEXT, NOT NULL |

**Indexes**:
- Index on `location_code, date`
- Index on `date`

**Sample Holidays**:
```sql
-- US Federal Holidays (NYC location)
("HOL-2024-001", "NYC", "New Year's Day", "2024-01-01", NULL, 1, ...)
("HOL-2024-002", "NYC", "Independence Day", "2024-07-04", NULL, 1, ...)
("HOL-2024-003", "NYC", "Thanksgiving", "2024-11-28", NULL, 1, ...)

-- India Holidays (Mumbai location)
("HOL-2024-100", "MUM", "Diwali", "2024-11-01", NULL, 1, ...)
("HOL-2024-101", "MUM", "Holi", "2024-03-25", NULL, 1, ...)
```

---

## EMPLOYEE PROFILE MODULE

### Table 4: `employees`

**Purpose**: Core employee master data with inline compensation, denormalized fields for performance, and JSONB fields for flexibility.

**Dependencies**:
- `firm_departments` (optional)
- `firm_locations` (optional)
- Self-referencing for manager hierarchy

**Key Features**:
- Single source of truth for all employee data
- Denormalized fields (`department_name`, `location_name`, `manager_name`) for 0-join queries
- Inline compensation (base salary, hourly rate) - no separate table needed
- JSONB fields for PTO balances, tax withholding, benefits, custom fields
- Support for US and India payroll requirements
- Social media links, hobbies, affinity groups for employee engagement

#### Columns - Basic Information

| Column | Purpose | Sample Values | Type/Constraints |
|--------|---------|---------------|------------------|
| `employee_id` | **Primary Key** - Unique employee ID | `"EMP-001"`, `"EMP-042"` | TEXT |
| `first_name` | Legal first name | `"John"`, `"Sarah"` | TEXT, NOT NULL |
| `last_name` | Legal last name | `"Smith"`, `"Johnson"` | TEXT, NOT NULL |
| `middle_name` | Middle name | `"Robert"`, `"Marie"` | TEXT |
| `preferred_name` | Name employee prefers | `"Bob"`, `"Sam"` | TEXT |
| `email` | Work email address | `"john.smith@company.com"` | TEXT, NOT NULL |
| `phone` | Primary phone number | `"+1-555-123-4567"` | TEXT |
| `employee_number` | Legacy/payroll employee number | `"E12345"`, `"1042"` | TEXT |
| `gender` | Gender identity | `"male"`, `"female"`, `"non_binary"`, `"prefer_not_to_say"` | TEXT, ENUM |
| `marital_status` | Marital status | `"single"`, `"married"`, `"divorced"` | TEXT, ENUM |
| `ssn_tax_id` | SSN (US) or PAN (India) | `"***-**-1234"` (masked), `"ABCDE1234F"` | TEXT (encrypted) |
| `birth_date` | Date of birth | `"1990-05-15"` | TEXT (ISO date) |
| `pronouns` | Preferred pronouns | `"he/him"`, `"she/her"`, `"they/them"` | TEXT |
| `profile_picture` | URL to profile photo | `"https://cdn.../profile.jpg"` | TEXT |
| `timezone` | Employee's timezone | `"America/New_York"`, `"Asia/Kolkata"` | TEXT, DEFAULT 'America/New_York' |

#### Columns - Employment Information

| Column | Purpose | Sample Values | Type/Constraints |
|--------|---------|---------------|------------------|
| `employment_status` | Current employment status | `"active"`, `"on_leave"`, `"terminated"` | TEXT, ENUM, DEFAULT 'active' |
| `employment_type` | Type of employment | `"full_time"`, `"part_time"`, `"contractor"` | TEXT, ENUM, DEFAULT 'full_time' |
| `start_date` | Employment start date | `"2022-01-15"` | TEXT (ISO date), NOT NULL |
| `end_date` | Employment end date | `"2024-12-31"`, `NULL` (still employed) | TEXT (ISO date) |
| `department_code` | Department code | `"ENG"`, `"SALES"`, `"HR"` | TEXT, FK to firm_departments |
| `job_title` | Job title | `"Software Engineer"`, `"Senior Accountant"` | TEXT |
| `job_level` | Job level/seniority | `"junior"`, `"mid"`, `"senior"`, `"staff"` | TEXT |
| `manager_id` | Direct manager employee ID | `"EMP-010"`, `NULL` (CEO/no manager) | TEXT, FK to employees |
| `location_code` | Primary work location | `"NYC"`, `"SF"`, `"REMOTE"` | TEXT, FK to firm_locations |
| `fte` | Full-time equivalency | `1.00` (full-time), `0.50` (half-time) | REAL, DEFAULT 1.00 |

#### Columns - Denormalized for Performance

| Column | Purpose | Sample Values | Type/Constraints |
|--------|---------|---------------|------------------|
| `department_name` | **Denormalized** - Department display name | `"Engineering"`, `"Sales"` | TEXT |
| `location_name` | **Denormalized** - Location display name | `"New York Office"`, `"San Francisco HQ"` | TEXT |
| `manager_name` | **Denormalized** - Manager full name | `"Jane Doe"`, `"Bob Smith"` | TEXT |

> **Performance Note**: These denormalized fields allow employee directory queries with 0 joins (previously required 5 joins). Must be kept in sync with source tables via triggers/application logic.

#### Columns - Inline Compensation

| Column | Purpose | Sample Values | Type/Constraints |
|--------|---------|---------------|------------------|
| `compensation_type` | How employee is paid | `"salary"`, `"hourly"`, `"contract"` | TEXT, ENUM |
| `base_amount` | Annual salary or hourly rate | `120000.00` (salary), `75.00` (hourly) | REAL |
| `currency` | Compensation currency | `"USD"`, `"INR"`, `"GBP"` | TEXT, DEFAULT 'USD' |
| `pay_frequency` | Pay period frequency | `"bi-weekly"`, `"monthly"`, `"semi-monthly"` | TEXT, ENUM, DEFAULT 'bi-weekly' |
| `compensation_band` | Salary band/grade | `"L3"`, `"Band-4"`, `"Senior"` | TEXT |
| `overtime_eligible` | Eligible for overtime pay? | `1` (yes), `0` (no) | INTEGER, DEFAULT 0 |
| `default_hourly_rate` | Default hourly rate for time tracking | `75.00`, `125.00` | REAL |
| `default_billable_rate` | Default client billing rate | `150.00`, `200.00` | REAL |

#### Columns - JSONB Fields

| Column | Purpose | Sample Values | Reference |
|--------|---------|---------------|-----------|
| `pto_balances` | PTO/vacation/sick balances **(JSONB)** | `{"vacation": 15.5, "sick": 10.0}` | [JSONB Example #1](JSONB-FIELD-EXAMPLES.md#1-pto_balances---ptotime-off-balances) |
| `tax_withholding` | W-4 (US) or tax declarations (India) **(JSONB)** | See JSONB reference | [JSONB Example #2](JSONB-FIELD-EXAMPLES.md#2-tax_withholding---tax-withholding-information) |
| `salary_structure` | Detailed CTC breakdown (India) **(JSONB)** | See JSONB reference | [JSONB Example #3](JSONB-FIELD-EXAMPLES.md#3-salary_structure---detailed-salary-breakdown) |
| `variable_compensation` | Bonuses, commissions **(JSONB Array)** | See JSONB reference | [JSONB Example #4](JSONB-FIELD-EXAMPLES.md#4-variable_compensation---bonuses-commissions) |
| `benefits_elections` | Health insurance, 401k, etc. **(JSONB)** | See JSONB reference | [JSONB Example #5](JSONB-FIELD-EXAMPLES.md#5-benefits_elections---benefits-enrollment) |
| `custom_fields` | Organization-specific fields **(JSONB)** | `{"parking_spot": "A-42", "shirt_size": "L"}` | [JSONB Example #6](JSONB-FIELD-EXAMPLES.md#6-custom_fields---organization-specific-fields) |

#### Columns - Employee Engagement

| Column | Purpose | Sample Values | Type/Constraints |
|--------|---------|---------------|------------------|
| `social_media_links` | LinkedIn, Twitter, etc. **(JSONB)** | `{"linkedin": "...", "twitter": "..."}` | TEXT (JSONB), DEFAULT '{}' |
| `prior_employers` | Work history **(JSONB Array)** | `[{"company": "ACME", "title": "Dev", ...}]` | TEXT (JSONB), DEFAULT '[]' |
| `prior_education` | Education history **(JSONB Array)** | `[{"degree": "BS CS", "school": "MIT", ...}]` | TEXT (JSONB), DEFAULT '[]' |
| `hobbies` | Personal interests **(JSONB Array)** | `["hiking", "photography", "cooking"]` | TEXT (JSONB), DEFAULT '[]' |
| `affinity_groups` | Employee resource groups **(JSONB Array)** | `["women-in-tech", "lgbtq-allies"]` | TEXT (JSONB), DEFAULT '[]' |
| `introduction` | Bio/about me | `"Software engineer passionate about..."` | TEXT |
| `celebration_preferences` | Birthday, work anniversary prefs **(JSONB)** | `{"birthday_public": true, "cake_preference": "chocolate"}` | TEXT (JSONB), DEFAULT '{}' |

#### Columns - Audit & Status

| Column | Purpose | Sample Values | Type/Constraints |
|--------|---------|---------------|------------------|
| `is_active` | Currently active record? | `1` (active), `0` (inactive) | INTEGER, DEFAULT 1 |
| `created_at` | Creation timestamp (UTC) | `"2024-01-15T10:30:00Z"` | TEXT, NOT NULL |
| `updated_at` | Last update timestamp (UTC) | `"2024-03-20T14:45:00Z"` | TEXT, NOT NULL |
| `created_by` | Employee ID who created record | `"SYS-ADMIN"`, `"EMP-001"` | TEXT, NOT NULL |
| `version` | Optimistic locking version | `1`, `2`, `3` | INTEGER, DEFAULT 1 |

**Enumerations**:
- `employment_status`: See [enumerations.json - employment.employmentStatus](enumerations.json)
- `employment_type`: See [enumerations.json - employment.employmentType](enumerations.json)
- `pay_frequency`: See [enumerations.json - payroll.payFrequency](enumerations.json)
- `gender`, `marital_status`, `pronouns`: See [enumerations.json - demographics](enumerations.json)

**Indexes**:
- Index on `employment_status`
- Index on `department_code`
- Index on `manager_id`
- Index on `location_code`
- Index on `is_active`
- Index on `job_title`
- Composite index on `department_code, start_date DESC` WHERE `is_active = 1`

---

### Table 5: `employee_assets`

**Purpose**: Track equipment and assets assigned to employees (laptops, monitors, phones, etc.).

**Dependencies**:
- `employees` (asset assigned to employee)

**Key Features**:
- Asset assignment tracking
- Return date tracking
- Condition monitoring
- Serial number and asset tag management

#### Columns

| Column | Purpose | Sample Values | Type/Constraints |
|--------|---------|---------------|------------------|
| `asset_id` | **Primary Key** - Unique asset ID | `"ASSET-001"`, `"LAPTOP-042"` | TEXT |
| `employee_id` | Employee assigned to | `"EMP-001"`, `"EMP-042"` | TEXT, FK to employees, NOT NULL |
| `asset_type` | Type of asset | `"computer"`, `"monitor"`, `"phone"`, `"tablet"` | TEXT, ENUM, NOT NULL |
| `make_model` | Brand and model | `"Apple MacBook Pro 16-inch M3"`, `"Dell UltraSharp 27"` | TEXT, NOT NULL |
| `serial_number` | Manufacturer serial number | `"C02XJ0PHJG5H"`, `"SN123456789"` | TEXT |
| `asset_tag` | Internal asset tag/barcode | `"IT-LAPTOP-042"`, `"MON-123"` | TEXT |
| `assigned_date` | Date assigned to employee | `"2024-01-15"` | TEXT (ISO date), NOT NULL |
| `return_date` | Date returned (if returned) | `"2024-12-31"`, `NULL` (still assigned) | TEXT (ISO date) |
| `condition` | Physical condition | `"new"`, `"good"`, `"fair"`, `"poor"` | TEXT, ENUM, DEFAULT 'good' |
| `notes` | Additional notes | `"Needs new battery"`, `"Upgraded RAM to 32GB"` | TEXT |
| `created_at` | Creation timestamp (UTC) | `"2024-01-15T10:30:00Z"` | TEXT, NOT NULL |
| `updated_at` | Last update timestamp (UTC) | `"2024-03-20T14:45:00Z"` | TEXT, NOT NULL |

**Enumerations**:
- `asset_type`: See [enumerations.json - assets.assetType](enumerations.json)
- `condition`: See [enumerations.json - assets.assetCondition](enumerations.json)

**Indexes**:
- Index on `employee_id, assigned_date DESC`
- Index on `asset_type`
- Partial index on `employee_id` WHERE `return_date IS NULL` (currently assigned assets)

---

### Table 6: `employee_training_records`

**Purpose**: Track mandatory and optional training assigned to employees.

**Dependencies**:
- `employees` (training assigned to employee)

**Key Features**:
- Training assignment and completion tracking
- Expiration tracking for certifications
- Status progression (not started → in progress → completed)
- Credits/hours tracking for professional development

#### Columns

| Column | Purpose | Sample Values | Type/Constraints |
|--------|---------|---------------|------------------|
| `training_record_id` | **Primary Key** - Unique training record ID | `"TRN-2024-001"` | TEXT |
| `employee_id` | Employee assigned training | `"EMP-001"`, `"EMP-042"` | TEXT, FK to employees, NOT NULL |
| `training_name` | Training course name | `"Sexual Harassment Prevention"`, `"AWS Certified Solutions Architect"` | TEXT, NOT NULL |
| `training_type` | Type of training | `"compliance"`, `"professional_development"`, `"onboarding"`, `"safety"` | TEXT, ENUM, NOT NULL |
| `provider` | Training provider | `"Udemy"`, `"LinkedIn Learning"`, `"Internal"` | TEXT |
| `assigned_date` | Date training was assigned | `"2024-01-15"` | TEXT (ISO date), NOT NULL |
| `due_date` | Completion due date | `"2024-02-15"` | TEXT (ISO date), NOT NULL |
| `completion_date` | Date completed | `"2024-02-10"`, `NULL` (not completed) | TEXT (ISO date) |
| `status` | Training status | `"not_started"`, `"in_progress"`, `"completed"`, `"overdue"` | TEXT, ENUM, DEFAULT 'not_started' |
| `certificate_url` | Link to certificate | `"https://cert.example.com/abc123"` | TEXT |
| `expiration_date` | Certificate expiration date | `"2026-02-10"`, `NULL` (no expiration) | TEXT (ISO date) |
| `credits_hours` | CPE/PDH credits earned | `8.0`, `24.5` | REAL |
| `notes` | Additional notes | `"Passed exam with 92%"` | TEXT |
| `created_at` | Creation timestamp (UTC) | `"2024-01-15T10:30:00Z"` | TEXT, NOT NULL |
| `updated_at` | Last update timestamp (UTC) | `"2024-03-20T14:45:00Z"` | TEXT, NOT NULL |

**Enumerations**:
- `training_type`: See [enumerations.json - training.trainingType](enumerations.json)
- `status`: See [enumerations.json - training.trainingStatus](enumerations.json)

**Indexes**:
- Index on `employee_id, due_date`
- Index on `status`
- Partial index on `employee_id, due_date` WHERE `status IN ('not_started', 'in_progress', 'overdue')`

---

### Table 7: `employee_certifications`

**Purpose**: Track professional certifications, licenses, and credentials.

**Dependencies**:
- `employees` (certification belongs to employee)

**Key Features**:
- Certification tracking with expiration dates
- Status management (active, expired, pending renewal)
- Verification URL for digital credentials
- Industry-specific certifications (CPA, Bar License, AWS, PMP, etc.)

#### Columns

| Column | Purpose | Sample Values | Type/Constraints |
|--------|---------|---------------|------------------|
| `certification_id` | **Primary Key** - Unique certification ID | `"CERT-001"` | TEXT |
| `employee_id` | Employee who holds certification | `"EMP-001"`, `"EMP-042"` | TEXT, FK to employees, NOT NULL |
| `certification_name` | Name of certification | `"CPA"`, `"AWS Solutions Architect - Professional"`, `"Bar License - NY"` | TEXT, NOT NULL |
| `issuing_organization` | Organization that issued cert | `"AICPA"`, `"Amazon Web Services"`, `"New York State Bar"` | TEXT, NOT NULL |
| `certification_number` | Cert ID/license number | `"CPA-123456"`, `"AWS-CERT-789"` | TEXT |
| `issue_date` | Date certification was issued | `"2020-06-15"` | TEXT (ISO date), NOT NULL |
| `expiration_date` | Date certification expires | `"2023-06-15"`, `NULL` (no expiration) | TEXT (ISO date) |
| `status` | Certification status | `"active"`, `"expired"`, `"pending_renewal"`, `"revoked"` | TEXT, ENUM, DEFAULT 'active' |
| `verification_url` | URL to verify certification | `"https://verify.aws.com/abc123"` | TEXT |
| `notes` | Additional notes | `"Renewal in progress"` | TEXT |
| `created_at` | Creation timestamp (UTC) | `"2024-01-15T10:30:00Z"` | TEXT, NOT NULL |
| `updated_at` | Last update timestamp (UTC) | `"2024-03-20T14:45:00Z"` | TEXT, NOT NULL |

**Enumerations**:
- `status`: See [enumerations.json - certifications.certificationStatus](enumerations.json)

**Indexes**:
- Index on `employee_id`
- Index on `status`
- Partial index on `expiration_date` WHERE `expiration_date IS NOT NULL` (for expiration alerts)

---

## USER GROUPS MODULE

### Table 8: `employee_user_groups`

**Purpose**: Define user groups for organizing employees (teams, departments, project groups, approvers, etc.).

**Dependencies**:
- `firm_departments` (optional - for department-based groups)
- `firm_locations` (optional - for location-based groups)
- `employees` (for approver references)
- Self-referencing for nested groups

**Key Features**:
- Hierarchical groups (parent-child relationships)
- Automatic groups (department, location) vs. custom groups
- Dual approver system (primary + backup)
- Group types: department, team, project, functional, affinity, custom

#### Columns

| Column | Purpose | Sample Values | Type/Constraints |
|--------|---------|---------------|------------------|
| `group_name` | **Primary Key** - Unique group identifier | `"engineering-team"`, `"all-managers"` | TEXT |
| `display_name` | Human-readable group name | `"Engineering Team"`, `"All Managers"` | TEXT, NOT NULL |
| `description` | Group description/purpose | `"All engineering department employees"` | TEXT |
| `group_type` | Type of group | `"department"`, `"team"`, `"project"`, `"custom"` | TEXT, ENUM, DEFAULT 'custom' |
| `parent_group_name` | Parent group (for nested groups) | `"all-employees"`, `NULL` | TEXT, FK to self |
| `department_code` | Associated department | `"ENG"`, `"SALES"`, `NULL` | TEXT, FK to firm_departments |
| `location_code` | Associated location | `"NYC"`, `"SF"`, `NULL` | TEXT, FK to firm_locations |
| `approver_id` | Primary approver employee ID | `"EMP-010"` (manager) | TEXT, FK to employees, NOT NULL |
| `backup_approver_id` | Backup approver employee ID | `"EMP-020"` (senior manager) | TEXT, FK to employees, NOT NULL |
| `is_active` | Group currently active? | `1` (active), `0` (inactive) | INTEGER, DEFAULT 1 |
| `is_system_group` | Created by system? | `1` (system), `0` (user-created) | INTEGER, DEFAULT 0 |
| `created_at` | Creation timestamp (UTC) | `"2024-01-15T10:30:00Z"` | TEXT, NOT NULL |
| `updated_at` | Last update timestamp (UTC) | `"2024-03-20T14:45:00Z"` | TEXT, NOT NULL |
| `created_by` | Employee ID who created group | `"EMP-001"` | TEXT, NOT NULL |

**Enumerations**:
- `group_type`: See [enumerations.json - userGroups.groupType](enumerations.json)

**Indexes**:
- Index on `group_type`
- Index on `department_code`
- Index on `approver_id`
- Index on `backup_approver_id`
- Index on `is_active`

**Sample Groups**:
```sql
-- System-generated department group
("engineering", "Engineering Department", "All engineering employees",
 "department", NULL, "ENG", NULL, "EMP-010", "EMP-001", 1, 1, ...)

-- Custom project team
("project-phoenix", "Project Phoenix Team", "Phoenix redesign project team",
 "project", NULL, NULL, NULL, "EMP-025", "EMP-030", 1, 0, ...)

-- Affinity group
("women-in-tech", "Women in Tech", "Women in technology affinity group",
 "affinity", "all-employees", NULL, NULL, "EMP-042", "EMP-050", 1, 0, ...)
```

---

### Table 9: `employee_group_members`

**Purpose**: Track which employees belong to which groups (many-to-many relationship).

**Dependencies**:
- `employee_user_groups` (group definition)
- `employees` (group member)

**Key Features**:
- Many-to-many relationship (employee can be in multiple groups)
- Member roles within group (owner, admin, moderator, member)
- Membership expiration support
- Audit trail of who added member and when

#### Columns

| Column | Purpose | Sample Values | Type/Constraints |
|--------|---------|---------------|------------------|
| `group_name` | **Composite PK** - Group identifier | `"engineering-team"`, `"all-managers"` | TEXT, FK to employee_user_groups, NOT NULL |
| `employee_id` | **Composite PK** - Employee identifier | `"EMP-001"`, `"EMP-042"` | TEXT, FK to employees, NOT NULL |
| `role` | Member's role in group | `"owner"`, `"admin"`, `"moderator"`, `"member"` | TEXT, ENUM, DEFAULT 'member' |
| `joined_at` | Date added to group | `"2024-01-15T10:30:00Z"` | TEXT, NOT NULL |
| `joined_by` | Who added this member | `"EMP-010"` (manager), `"SYS-AUTO"` | TEXT, NOT NULL |
| `expires_at` | Membership expiration | `"2024-12-31T23:59:59Z"`, `NULL` (no expiration) | TEXT |

**Enumerations**:
- `role`: See [enumerations.json - userGroups.groupMemberRole](enumerations.json)

**Indexes**:
- Composite PRIMARY KEY on `(group_name, employee_id)`
- Index on `employee_id` (find all groups for an employee)
- Index on `group_name, role` (find admins of a group)
- Partial index on `expires_at` WHERE `expires_at IS NOT NULL` (expiring memberships)

**Sample Memberships**:
```sql
-- Engineering team members
("engineering", "EMP-001", "owner", "2024-01-01T00:00:00Z", "SYS-AUTO", NULL)
("engineering", "EMP-042", "admin", "2024-01-15T10:00:00Z", "EMP-001", NULL)
("engineering", "EMP-100", "member", "2024-02-01T10:00:00Z", "EMP-042", NULL)

-- Temporary project membership
("project-phoenix", "EMP-200", "member", "2024-01-01T00:00:00Z", "EMP-025", "2024-06-30T23:59:59Z")
```

---

### Table 10: `employee_group_roles`

**Purpose**: Grant role-based permissions to user groups (e.g., "all-managers" group has "approve_timesheet" role).

**Dependencies**:
- `employee_user_groups` (group definition)
- `firm_departments` (optional - role scoped to department)
- `firm_locations` (optional - role scoped to location)

**Key Features**:
- Assign permissions to groups (not individual users)
- Scope roles by department or location
- Temporary role assignments with expiration
- Audit trail of who granted role and when

#### Columns

| Column | Purpose | Sample Values | Type/Constraints |
|--------|---------|---------------|------------------|
| `group_role_id` | **Primary Key** - Unique role assignment ID | `"GR-001"` | TEXT |
| `group_name` | Group being granted role | `"all-managers"`, `"hr-team"` | TEXT, FK to employee_user_groups, NOT NULL |
| `role_name` | Role/permission being granted | `"approve_timesheet"`, `"manage_employees"`, `"view_payroll"` | TEXT, NOT NULL |
| `department_code` | Scope to specific department | `"ENG"`, `NULL` (all departments) | TEXT, FK to firm_departments |
| `location_code` | Scope to specific location | `"NYC"`, `NULL` (all locations) | TEXT, FK to firm_locations |
| `granted_at` | When role was granted | `"2024-01-15T10:30:00Z"` | TEXT, NOT NULL |
| `granted_by` | Who granted this role | `"EMP-001"` (admin) | TEXT, NOT NULL |
| `expires_at` | Role expiration | `"2024-12-31T23:59:59Z"`, `NULL` (no expiration) | TEXT |

**Indexes**:
- Index on `group_name`
- Index on `role_name`
- Index on `department_code`

**Sample Role Assignments**:
```sql
-- All managers can approve timesheets (global)
("GR-001", "all-managers", "approve_timesheet", NULL, NULL, "2024-01-01...", "EMP-001", NULL)

-- HR team can manage employees (global)
("GR-002", "hr-team", "manage_employees", NULL, NULL, "2024-01-01...", "EMP-001", NULL)

-- Engineering managers can approve expenses for ENG department only
("GR-003", "engineering-managers", "approve_expense", "ENG", NULL, "2024-01-01...", "EMP-001", NULL)

-- NYC office admins can manage NYC location settings only
("GR-004", "nyc-office-admins", "manage_location", NULL, "NYC", "2024-01-01...", "EMP-001", NULL)
```

---

## HR MODULE - CORE

### Table 11: `hr_time_off_policies`

**Purpose**: Define PTO policies with accrual rules, eligibility, and location applicability.

**Dependencies**: None (foundational configuration)

**Key Features**:
- Multiple policy types (vacation, sick, personal, bereavement, etc.)
- Accrual rules stored as JSONB
- Employment type and location eligibility
- Template-based policies for reuse

#### Columns

| Column | Purpose | Sample Values | Type/Constraints |
|--------|---------|---------------|------------------|
| `policy_code` | **Primary Key** - Unique policy identifier | `"PTO-US-STD"`, `"SICK-NYC"` | TEXT |
| `template_id` | Template this policy was created from | `"TEMPLATE-PTO-1"`, `NULL` | TEXT |
| `policy_name` | Policy display name | `"Standard PTO Policy"`, `"NYC Sick Leave"` | TEXT, NOT NULL |
| `time_off_type` | Type of time off | `"pto"`, `"vacation"`, `"sick"`, `"bereavement"` | TEXT, ENUM, NOT NULL |
| `accrual_rules` | How time accrues **(JSONB)** | See below | TEXT (JSONB), DEFAULT '{}' |
| `employment_types` | Eligible employment types **(JSONB Array)** | `["full_time", "part_time"]` | TEXT (JSONB), DEFAULT '["full_time"]' |
| `location_codes` | Applicable locations **(JSONB Array)** | `["NYC", "SF"]`, `[]` (all) | TEXT (JSONB), DEFAULT '[]' |
| `is_active` | Policy currently active? | `1` (active), `0` (inactive) | INTEGER, DEFAULT 1 |
| `created_at` | Creation timestamp (UTC) | `"2024-01-15T10:30:00Z"` | TEXT, NOT NULL |
| `updated_at` | Last update timestamp (UTC) | `"2024-03-20T14:45:00Z"` | TEXT, NOT NULL |
| `created_by` | Employee ID who created policy | `"EMP-001"` | TEXT, NOT NULL |

**JSONB Field: `accrual_rules`**
```json
{
  "accrual_method": "per_pay_period",
  "accrual_amount": 3.08,
  "accrual_frequency": "bi-weekly",
  "annual_accrual": 80.0,
  "max_balance": 200.0,
  "carryover_rule": "capped_carryover",
  "carryover_max": 40.0,
  "waiting_period_days": 90,
  "prorate_first_year": true
}
```

**Enumerations**:
- `time_off_type`: See [enumerations.json - timeOff.timeOffType](enumerations.json)

**Indexes**:
- Index on `time_off_type`
- Index on `is_active`
- Index on `template_id`

---

### Table 12: `hr_time_off_requests`

**Purpose**: Track employee time-off requests with approval workflow.

**Dependencies**:
- `employees` (employee requesting time off)
- `hr_time_off_policies` (policy being used)
- `employees` (approver)

**Key Features**:
- Multi-day time off requests
- Approval workflow (pending → approved/denied)
- Automatic balance deduction on approval
- Denial reason tracking

#### Columns

| Column | Purpose | Sample Values | Type/Constraints |
|--------|---------|---------------|------------------|
| `request_id` | **Primary Key** - Unique request ID | `"PTO-REQ-001"` | TEXT |
| `employee_id` | Employee requesting time off | `"EMP-001"` | TEXT, FK to employees, NOT NULL |
| `policy_code` | Policy being used | `"PTO-US-STD"`, `"SICK-NYC"` | TEXT, FK to hr_time_off_policies, NOT NULL |
| `start_date` | First day of time off | `"2024-07-01"` | TEXT (ISO date), NOT NULL |
| `end_date` | Last day of time off | `"2024-07-05"` | TEXT (ISO date), NOT NULL |
| `total_hours` | Total hours requested | `40.0` (5 days × 8 hours) | REAL, NOT NULL |
| `status` | Request status | `"pending"`, `"approved"`, `"denied"`, `"cancelled"` | TEXT, ENUM, DEFAULT 'pending' |
| `reason` | Employee's reason | `"Family vacation"`, `"Sick - flu"` | TEXT |
| `approver_id` | Manager who approved/denied | `"EMP-010"`, `NULL` (pending) | TEXT, FK to employees |
| `approved_at` | Approval timestamp | `"2024-06-15T14:30:00Z"`, `NULL` | TEXT |
| `denied_at` | Denial timestamp | `"2024-06-15T14:30:00Z"`, `NULL` | TEXT |
| `denial_reason` | Why request was denied | `"Insufficient PTO balance"`, `NULL` | TEXT |
| `submitted_at` | When request was submitted | `"2024-06-10T09:00:00Z"` | TEXT, NOT NULL |
| `updated_at` | Last update timestamp | `"2024-06-15T14:30:00Z"` | TEXT, NOT NULL |

**Enumerations**:
- `status`: See [enumerations.json - timeOff.timeOffRequestStatus](enumerations.json)

**Indexes**:
- Index on `employee_id, start_date DESC`
- Index on `approver_id, status`
- Index on `status`
- Index on `start_date, end_date` (for calendar views)
- Partial index on `approver_id, submitted_at` WHERE `status = 'pending'` (pending approvals)

---

### Table 13: `hr_attendance`

**Purpose**: Track daily employee attendance with clock in/out times.

**Dependencies**:
- `employees` (employee attendance record)
- `employees` (approver for submitted attendance)

**Key Features**:
- Clock in/out time tracking
- Break time deduction
- Regular vs. overtime hours calculation
- Location tracking (for remote/hybrid workers)
- Approval workflow for submitted attendance

#### Columns

| Column | Purpose | Sample Values | Type/Constraints |
|--------|---------|---------------|------------------|
| `attendance_id` | **Primary Key** - Unique attendance ID | `"ATT-2024-001"` | TEXT |
| `employee_id` | Employee | `"EMP-001"` | TEXT, FK to employees, NOT NULL |
| `attendance_date` | Date of attendance | `"2024-06-15"` | TEXT (ISO date), NOT NULL |
| `clock_in_time` | Clock in time | `"2024-06-15T09:00:00Z"` | TEXT |
| `clock_out_time` | Clock out time | `"2024-06-15T17:30:00Z"` | TEXT |
| `clock_in_location` | Clock in GPS/location | `"Office - NYC"`, `"Remote - Home"` | TEXT |
| `clock_out_location` | Clock out GPS/location | `"Office - NYC"` | TEXT |
| `break_minutes` | Total break time (unpaid) | `60` (1 hour lunch), `30` | INTEGER, DEFAULT 0 |
| `total_hours` | Total hours worked | `8.0`, `9.5` | REAL |
| `regular_hours` | Regular hours (up to 8/day) | `8.0` | REAL |
| `overtime_hours` | Overtime hours (over 8/day) | `1.5`, `0` | REAL |
| `status` | Attendance status | `"draft"`, `"submitted"`, `"approved"`, `"rejected"` | TEXT, ENUM, DEFAULT 'draft' |
| `approved_by` | Manager who approved | `"EMP-010"`, `NULL` | TEXT, FK to employees |
| `approved_at` | Approval timestamp | `"2024-06-16T10:00:00Z"`, `NULL` | TEXT |
| `notes` | Additional notes | `"Worked from home"`, `"Left early - sick"` | TEXT |
| `created_at` | Creation timestamp | `"2024-06-15T09:00:00Z"` | TEXT, NOT NULL |
| `updated_at` | Last update timestamp | `"2024-06-15T17:30:00Z"` | TEXT, NOT NULL |

**Enumerations**:
- `status`: See [enumerations.json - attendance.attendanceStatus](enumerations.json)

**Indexes**:
- Index on `employee_id, attendance_date DESC`
- Index on `attendance_date`
- Index on `status`
- Partial index on `approved_by, attendance_date` WHERE `status = 'submitted'` (pending approvals)

---

### Table 14: `hr_review_cycles`

**Purpose**: Define performance review cycles (annual, quarterly, etc.) with assessment deadlines.

**Dependencies**: None (foundational configuration)

**Key Features**:
- Multiple review types (annual, quarterly, probation, etc.)
- Multi-phase deadlines (self-assessment, manager review, meeting)
- Template configuration for review questions
- Status tracking through review lifecycle

#### Columns

| Column | Purpose | Sample Values | Type/Constraints |
|--------|---------|---------------|------------------|
| `cycle_code` | **Primary Key** - Unique cycle identifier | `"2024-ANNUAL"`, `"Q1-2024"` | TEXT |
| `cycle_name` | Cycle display name | `"2024 Annual Performance Review"` | TEXT, NOT NULL |
| `review_type` | Type of review | `"annual"`, `"semi-annual"`, `"quarterly"`, `"probation"` | TEXT, ENUM, NOT NULL |
| `start_date` | Cycle start date | `"2024-01-01"` | TEXT (ISO date), NOT NULL |
| `self_assessment_due` | Self-assessment due date | `"2024-01-31"` | TEXT (ISO date) |
| `manager_assessment_due` | Manager review due date | `"2024-02-15"` | TEXT (ISO date) |
| `review_meetings_due` | 1-on-1 meetings due date | `"2024-02-28"` | TEXT (ISO date) |
| `cycle_close_date` | Cycle end date | `"2024-03-15"` | TEXT (ISO date) |
| `status` | Cycle status | `"draft"`, `"active"`, `"completed"`, `"archived"` | TEXT, ENUM, DEFAULT 'draft' |
| `template` | Review template/questions **(JSONB)** | `{"questions": [...], "rating_scale": "1_to_5"}` | TEXT (JSONB), DEFAULT '{}' |
| `is_active` | Currently active cycle? | `1`, `0` | INTEGER, DEFAULT 1 |
| `created_at` | Creation timestamp | `"2023-12-01T00:00:00Z"` | TEXT, NOT NULL |
| `updated_at` | Last update timestamp | `"2024-01-15T10:00:00Z"` | TEXT, NOT NULL |
| `created_by` | Employee ID who created cycle | `"EMP-001"` (HR) | TEXT, NOT NULL |

**Enumerations**:
- `review_type`: See [enumerations.json - performance.reviewCycleType](enumerations.json)
- `status`: See [enumerations.json - performance.reviewCycleStatus](enumerations.json)

**Indexes**:
- Index on `start_date, cycle_close_date`
- Index on `status`

---

### Table 15: `hr_reviews`

**Purpose**: Individual performance reviews within a cycle.

**Dependencies**:
- `hr_review_cycles` (review cycle)
- `employees` (employee being reviewed)
- `employees` (reviewer/manager)

**Key Features**:
- Self-assessment and manager assessment stored as JSONB
- Goals for next review period stored as JSONB array
- Competency ratings stored as JSONB array
- Overall rating and status tracking
- Unique constraint: one review per employee per cycle

#### Columns

| Column | Purpose | Sample Values | Type/Constraints |
|--------|---------|---------------|------------------|
| `review_id` | **Primary Key** - Unique review ID | `"REV-2024-001"` | TEXT |
| `employee_id` | Employee being reviewed | `"EMP-042"` | TEXT, FK to employees, NOT NULL |
| `reviewer_id` | Manager conducting review | `"EMP-010"` | TEXT, FK to employees, NOT NULL |
| `cycle_code` | Review cycle | `"2024-ANNUAL"` | TEXT, FK to hr_review_cycles, NOT NULL |
| `review_type` | Type of review (can override cycle) | `"annual"`, `"probation"` | TEXT |
| `review_date` | Date review was conducted | `"2024-02-20"` | TEXT (ISO date) |
| `self_assessment` | Employee self-assessment **(JSONB)** | See reference | TEXT (JSONB), DEFAULT '{}' |
| `manager_assessment` | Manager assessment **(JSONB)** | See reference | TEXT (JSONB), DEFAULT '{}' |
| `goals` | Goals for next period **(JSONB Array)** | See reference | TEXT (JSONB), DEFAULT '[]' |
| `competencies` | Competency ratings **(JSONB Array)** | See reference | TEXT (JSONB), DEFAULT '[]' |
| `overall_rating` | Overall numeric rating | `4.5`, `3.8` (1-5 scale) | REAL |
| `status` | Review status | `"not_started"`, `"self_assessment"`, `"manager_review"`, `"completed"` | TEXT, ENUM, DEFAULT 'not_started' |
| `created_at` | Creation timestamp | `"2024-01-01T00:00:00Z"` | TEXT, NOT NULL |
| `updated_at` | Last update timestamp | `"2024-02-20T15:00:00Z"` | TEXT, NOT NULL |

**UNIQUE Constraint**: `(cycle_code, employee_id)` - one review per employee per cycle

**JSONB Fields**: See JSONB-FIELD-EXAMPLES.md:
- `self_assessment`: [Example #9](JSONB-FIELD-EXAMPLES.md#9-self_assessment---employee-self-assessment)
- `manager_assessment`: [Example #10](JSONB-FIELD-EXAMPLES.md#10-manager_assessment---manager-assessment)
- `goals`: [Example #11](JSONB-FIELD-EXAMPLES.md#11-goals---review-period-goals)
- `competencies`: [Example #12](JSONB-FIELD-EXAMPLES.md#12-competencies---skill-ratings)

**Enumerations**:
- `status`: See [enumerations.json - performance.reviewStatus](enumerations.json)

**Indexes**:
- Index on `cycle_code`
- Index on `employee_id`
- Index on `reviewer_id, status`
- Index on `status`
- Unique index on `(cycle_code, employee_id)`

---

### Table 16: `hr_change_requests`

**Purpose**: Employee self-service change requests with approval workflows (address changes, tax withholding updates, etc.).

**Dependencies**:
- `employees` (employee requesting change)
- `employees` (employee on whose behalf request is made - may be same)

**Key Features**:
- Self-service employee change requests
- Approval chain stored as JSONB
- Comments thread stored as JSONB
- Supporting documents stored as JSONB
- Change request types: personal info, compensation, benefits, etc.

#### Columns

| Column | Purpose | Sample Values | Type/Constraints |
|--------|---------|---------------|------------------|
| `request_id` | **Primary Key** - Unique request ID | `"CHG-2024-001"` | TEXT |
| `requested_by` | Employee submitting request | `"EMP-042"` | TEXT, FK to employees, NOT NULL |
| `requested_for` | Employee affected by change | `"EMP-042"` (usually same as requested_by) | TEXT, FK to employees, NOT NULL |
| `request_type` | Type of change | `"personal_info"`, `"address"`, `"tax_withholding"`, `"benefits"` | TEXT, ENUM, NOT NULL |
| `request_details` | Current and requested values **(JSONB)** | `{"field": "address", "currentValue": "...", "requestedValue": "...", "reason": "..."}` | TEXT (JSONB), NOT NULL |
| `approval_chain` | Approval workflow **(JSONB Array)** | `[{"approver_id": "EMP-010", "role": "manager", "status": "approved", ...}]` | TEXT (JSONB) |
| `status` | Request status | `"pending"`, `"approved"`, `"rejected"`, `"completed"`, `"cancelled"` | TEXT, ENUM, DEFAULT 'pending' |
| `comments` | Comment thread **(JSONB Array)** | `[{"user_id": "EMP-042", "comment": "...", "created_at": "..."}]` | TEXT (JSONB) |
| `attached_documents` | Supporting files **(JSONB Array)** | `[{"file_name": "marriage-cert.pdf", "file_url": "...", ...}]` | TEXT (JSONB) |
| `created_at` | Creation timestamp | `"2024-06-15T10:00:00Z"` | TEXT, NOT NULL |
| `updated_at` | Last update timestamp | `"2024-06-16T14:30:00Z"` | TEXT, NOT NULL |
| `resolved_at` | Resolution timestamp | `"2024-06-18T09:00:00Z"`, `NULL` | TEXT |
| `resolved_by` | Who resolved the request | `"EMP-010"`, `NULL` | TEXT |

**Enumerations**:
- `request_type`: See [enumerations.json - changeRequests.changeRequestType](enumerations.json)
- `status`: See [enumerations.json - changeRequests.changeRequestStatus](enumerations.json)

**Indexes**:
- Index on `requested_by`
- Index on `requested_for`
- Index on `status`
- Index on `request_type`
- Index on `created_at`

---

### Table 17: `hr_emergency_contacts`

**Purpose**: Store employee emergency contact information.

**Dependencies**:
- `employees` (employee)

**Key Features**:
- Multiple contacts per employee
- Primary contact designation
- Contact relationship tracking
- Multiple phone numbers (primary, secondary)

#### Columns

| Column | Purpose | Sample Values | Type/Constraints |
|--------|---------|---------------|------------------|
| `contact_id` | **Primary Key** - Unique contact ID | `"EC-001"` | TEXT |
| `employee_id` | Employee | `"EMP-001"` | TEXT, FK to employees, NOT NULL |
| `contact_name` | Emergency contact name | `"Jane Smith"`, `"John Doe"` | TEXT, NOT NULL |
| `relationship` | Relationship to employee | `"spouse"`, `"parent"`, `"sibling"`, `"partner"`, `"friend"` | TEXT, ENUM, NOT NULL |
| `phone_primary` | Primary phone number | `"+1-555-123-4567"` | TEXT, NOT NULL |
| `phone_secondary` | Secondary phone number | `"+1-555-987-6543"`, `NULL` | TEXT |
| `email` | Email address | `"jane.smith@email.com"` | TEXT |
| `address` | Contact address | `"123 Main St, Anytown, CA 12345"` | TEXT |
| `is_primary` | Primary emergency contact? | `1` (primary), `0` (secondary) | INTEGER, DEFAULT 0 |
| `notes` | Additional notes | `"Call during business hours only"` | TEXT |
| `created_at` | Creation timestamp | `"2024-01-15T10:00:00Z"` | TEXT, NOT NULL |
| `updated_at` | Last update timestamp | `"2024-03-20T14:00:00Z"` | TEXT, NOT NULL |

**Enumerations**:
- `relationship`: See [enumerations.json - communication.relationshipType](enumerations.json)

**Indexes**:
- Index on `employee_id`
- Partial index on `employee_id, is_primary` WHERE `is_primary = 1` (find primary contact)

---

[← Back to Index](SCHEMA-HELP-GUIDE.md) | [Part 2 →](SCHEMA-HELP-GUIDE-PART-2.md)
