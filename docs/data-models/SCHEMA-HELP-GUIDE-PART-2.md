# D1 Schema Help Guide - Part 2

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


**Tables 18-34: Ticketing & Project Management**

[← Back to Index](SCHEMA-HELP-GUIDE.md) | [← Part 1](SCHEMA-HELP-GUIDE-PART-1.md) | [Part 3 →](SCHEMA-HELP-GUIDE-PART-3.md)

---

## TICKETING MODULE

### Table 18: `ticketing_business_areas`

**Purpose**: Define business areas (categories) for tickets with unique prefixes (e.g., "IT#", "HR#", "FIN#").

**Dependencies**: None (foundational table)

**Key Features**:
- Unique prefix per business area (IT, HR, FIN, etc.)
- Automatic ticket numbering sequence per area
- Customizable categories, custom fields, roles, and statuses per area
- Settings stored as JSONB for flexibility

#### Columns

| Column | Purpose | Sample Values | Type/Constraints |
|--------|---------|---------------|------------------|
| `business_area_id` | Business area UUID | `"ba_01234567-89ab-cdef"` | TEXT |
| `prefix` | **Primary Key** - Ticket prefix | `"IT"`, `"HR"`, `"FIN"` | TEXT, 2-20 chars, A-Z |
| `name` | Business area name | `"IT Support"`, `"HR Services"` | TEXT, NOT NULL |
| `description` | Description | `"Information technology support requests"` | TEXT |
| `active` | Currently active? | `1` (active), `0` (inactive) | INTEGER, DEFAULT 1 |
| `current_sequence` | Last ticket number issued | `142`, `1050` | INTEGER, DEFAULT 0 |
| `categories` | Available categories **(JSONB Array)** | `[{"id":"cat_001","name":"General","color":"#808080","active":true}]` | TEXT (JSONB) |
| `custom_fields` | Business area custom fields **(JSONB Array)** | `[{"id":"cf_1","name":"Priority","type":"select","options":[...]}]` | TEXT (JSONB), DEFAULT '[]' |
| `roles` | Administrator and analyst roles **(JSONB)** | `{"administrators":["EMP-001"],"analysts":["EMP-010","EMP-020"]}` | TEXT (JSONB) |
| `settings` | Status options, defaults **(JSONB)** | See below | TEXT (JSONB) |
| `is_active` | Active status | `1`, `0` | INTEGER, DEFAULT 1 |
| `created_at` | Creation timestamp | `"2024-01-15T10:00:00Z"` | TEXT, NOT NULL |
| `created_by` | Creator employee ID | `"EMP-001"` | TEXT, NOT NULL |
| `updated_at` | Last update timestamp | `"2024-03-20T14:00:00Z"` | TEXT, NOT NULL |

**JSONB Field: `settings`**
```json
{
  "statuses": {
    "available": ["Pending", "Assigned", "Active", "Closed", "Suspended"],
    "default": "Pending"
  },
  "defaultDueDateDays": 7,
  "maxAttachmentSizeMB": 10
}
```

**Indexes**:
- PRIMARY KEY on `prefix`
- Index on `active`

**Sample Business Areas**:
```sql
-- IT Support
("ba_it", "IT", "IT Support", "Technical support and infrastructure", 1, 142,
 '[{"id":"cat_001","name":"Hardware","color":"#FF5733"},...]', '[]',
 '{"administrators":["EMP-001"],"analysts":["EMP-010"]}', '{...}', ...)

-- HR Services
("ba_hr", "HR", "HR Services", "Human resources inquiries", 1, 67,
 '[{"id":"cat_001","name":"Payroll","color":"#33FF57"},...]', '[]',
 '{"administrators":["EMP-002"],"analysts":["EMP-011"]}', '{...}', ...)
```

---

### Table 19: `ticketing_tickets`

**Purpose**: Core ticketing system for support requests, issues, and service desk.

**Dependencies**:
- `ticketing_business_areas` (via prefix)
- Self-referencing for parent tickets

**Key Features**:
- Unique ticket numbers with business area prefix (e.g., "IT#142", "HR#67")
- Full-text search via FTS5 virtual table
- Parent-child ticket relationships
- Assignees, subscribers, and tasks stored as JSONB arrays
- Public/private tickets with internal/external summaries
- Linked tickets and custom fields support

#### Columns

| Column | Purpose | Sample Values | Type/Constraints |
|--------|---------|---------------|------------------|
| `ticket_id` | Ticket UUID | `"tkt_01234567-89ab-cdef"` | TEXT |
| `business_area_id` | Business area UUID | `"ba_it"` | TEXT |
| `ticket_number` | **Primary Key** - Unique ticket number | `"IT#142"`, `"HR#67"` | TEXT, format: `{prefix}#{seq}` |
| `prefix` | Business area prefix | `"IT"`, `"HR"`, `"FIN"` | TEXT, FK to ticketing_business_areas, NOT NULL |
| `sequence_number` | Sequence within business area | `142`, `67` | INTEGER, NOT NULL |
| `title` | Brief ticket title | `"Laptop not powering on"`, `"PTO balance inquiry"` | TEXT, NOT NULL |
| `description` | Detailed description | `"My laptop stopped working this morning..."` | TEXT |
| `subject` | Subject line | `"Laptop Issue - Employee #042"` | TEXT, NOT NULL |
| `category` | Ticket category | `"Hardware"`, `"Payroll"`, `"Network"` | TEXT, NOT NULL |
| `status` | Current status | `"Pending"`, `"Assigned"`, `"Active"`, `"Closed"`, `"Suspended"` | TEXT, ENUM, DEFAULT 'Pending' |
| `priority` | Priority level | `"low"`, `"medium"`, `"high"`, `"critical"` | TEXT |
| `severity` | Severity level | `"low"`, `"medium"`, `"high"`, `"critical"` | TEXT, ENUM, DEFAULT 'medium' |
| `request_type` | Type of request | `"support"`, `"feature"`, `"bug_fix"`, `"qa_testing"`, `"other"` | TEXT, ENUM, DEFAULT 'support' |
| `private` | Private ticket? | `1` (private), `0` (public) | INTEGER, DEFAULT 0 |
| `due_date` | Due date | `"2024-06-22"` | TEXT (ISO date), NOT NULL |
| `logged_at` | Ticket creation time | `"2024-06-15T10:00:00Z"` | TEXT, NOT NULL |
| `updated_at` | Last update time | `"2024-06-16T14:30:00Z"` | TEXT, NOT NULL |
| `resolved_at` | Resolution time | `"2024-06-18T16:00:00Z"`, `NULL` | TEXT |
| `closed_at` | Closure time | `"2024-06-19T09:00:00Z"`, `NULL` | TEXT |
| `reported_by` | External reporter (non-employee) | `"John Client"`, `NULL` | TEXT |
| `reported_by_name` | Reporter name | `"John Client"` | TEXT |
| `reported_by_email` | Reporter email | `"john@client.com"` | TEXT |
| `logger_id` | Employee who created ticket | `"EMP-042"` | TEXT, NOT NULL |
| `last_updated_by` | Last person to update | `"EMP-010"` | TEXT, NOT NULL |
| `closed_by` | Person who closed ticket | `"EMP-010"`, `NULL` | TEXT |
| `assignees` | Assigned employees **(JSONB Array)** | `["EMP-010", "EMP-020"]` | TEXT (JSONB), DEFAULT '[]' |
| `subscribers` | Notification subscribers **(JSONB Array)** | `["EMP-042", "EMP-030"]` | TEXT (JSONB), DEFAULT '[]' |
| `resolution_notes` | How ticket was resolved | `"Replaced power adapter, issue resolved"` | TEXT |
| `is_public` | Visible to external users? | `1`, `0` | INTEGER |
| `internal_summary` | Internal notes | `"User error - provided training"` | TEXT |
| `external_summary` | Client-facing summary | `"Resolved hardware issue with replacement"` | TEXT |
| `custom_fields` | Custom field values **(JSONB)** | `{"impact":"high","affected_users":5}` | TEXT (JSONB), DEFAULT '{}' |
| `parent_ticket_number` | Parent ticket (for sub-tickets) | `"IT#140"`, `NULL` | TEXT, FK to self |
| `linked_tickets` | Related tickets **(JSONB Array)** | `["IT#141", "IT#139"]` | TEXT (JSONB), DEFAULT '[]' |
| `tasks` | Checklist tasks **(JSONB Array)** | `[{"id":"t1","task":"Verify backup","status":"completed"}]` | TEXT (JSONB), DEFAULT '[]' |
| `version` | Optimistic locking version | `1`, `2`, `3` | INTEGER, DEFAULT 1 |
| `tags` | Tags **(JSONB Array)** | `["urgent", "hardware", "laptop"]` | TEXT (JSONB), DEFAULT '[]' |
| `created_at` | Creation timestamp | `"2024-06-15T10:00:00Z"` | TEXT, NOT NULL |

**Enumerations**:
- `status`: See [enumerations.json - ticketing.ticketStatus](enumerations.json)
- `severity`: See [enumerations.json - ticketing.ticketSeverity](enumerations.json)
- `request_type`: See [enumerations.json - ticketing.ticketRequestType](enumerations.json)

**Indexes**:
- PRIMARY KEY on `ticket_number`
- Index on `prefix, status`
- Index on `prefix, category`
- Index on `logger_id`
- Index on `prefix, severity`
- Index on `logged_at DESC, updated_at DESC`
- Partial index on `closed_at` WHERE `closed_at IS NOT NULL`
- Partial index on `prefix, updated_at DESC` WHERE `status != 'Closed'` (open tickets)
- Partial index on `parent_ticket_number` WHERE `parent_ticket_number IS NOT NULL`

**Full-Text Search**: Virtual table `tickets_fts` indexes `subject`, `internal_summary`, `external_summary` for fast text search.

---

### Table 20: `ticketing_updates`

**Purpose**: Comments, status changes, and activity updates on tickets.

**Dependencies**:
- `ticketing_tickets` (parent ticket)

**Key Features**:
- Full comment history with timestamps
- Status change tracking
- Internal vs. external visibility
- Edit history tracking
- Attachments referenced via JSONB
- Full-text search on comments

#### Columns

| Column | Purpose | Sample Values | Type/Constraints |
|--------|---------|---------------|------------------|
| `update_id` | **Primary Key** - Unique update ID | `"upd_01234567-89ab"` | TEXT |
| `ticket_id` | Ticket UUID | `"tkt_01234567-89ab"` | TEXT |
| `ticket_number` | Ticket number | `"IT#142"`, `"HR#67"` | TEXT, FK to ticketing_tickets, NOT NULL |
| `update_type` | Type of update | `"comment"`, `"status_change"`, `"assignment"` | TEXT |
| `author_employee_id` | Employee author | `"EMP-010"`, `NULL` | TEXT |
| `author_name` | Author display name | `"John Smith"`, `"Jane Doe"` | TEXT |
| `author_id` | Author ID (employee or external) | `"EMP-010"`, `"client_123"` | TEXT, NOT NULL |
| `comment_text` | Plain text comment | `"Working on this now, will update in 1 hour"` | TEXT |
| `content_html` | HTML formatted content | `"<p>Working on this now...</p>"` | TEXT |
| `content_text` | Plain text content | `"Working on this now, will update in 1 hour"` | TEXT |
| `visibility` | Who can see this update? | `"internal"`, `"external"` | TEXT, ENUM, DEFAULT 'external' |
| `created_at` | Creation timestamp | `"2024-06-15T11:30:00Z"` | TEXT, NOT NULL |
| `edited_at` | Last edit timestamp | `"2024-06-15T11:45:00Z"`, `NULL` | TEXT |
| `edited_by` | Who edited | `"EMP-010"`, `NULL` | TEXT |
| `changes` | Field changes **(JSONB)** | `{"status":{"from":"Pending","to":"Active"}}` | TEXT (JSONB), DEFAULT '{}' |
| `attachments` | Attached files **(JSONB Array)** | `["att_123", "att_456"]` | TEXT (JSONB) |
| `is_internal` | Internal only? | `1` (internal), `0` (external) | INTEGER, DEFAULT 0 |

**Enumerations**:
- `visibility`: See [enumerations.json - ticketing.updateVisibility](enumerations.json)

**Indexes**:
- PRIMARY KEY on `update_id`
- Index on `ticket_number, created_at ASC` (chronological order)

**Full-Text Search**: Virtual table `updates_fts` indexes `content_text` for fast comment search.

---

### Table 21: `ticketing_attachments`

**Purpose**: File attachments for tickets and ticket updates.

**Dependencies**:
- `ticketing_tickets` (parent ticket)
- `ticketing_updates` (optional - attached to specific update)

**Key Features**:
- File storage references (URLs, storage keys)
- File metadata (size, MIME type)
- Link to specific ticket update or general ticket attachment
- Uploader tracking

#### Columns

| Column | Purpose | Sample Values | Type/Constraints |
|--------|---------|---------------|------------------|
| `attachment_id` | **Primary Key** - Unique attachment ID | `"att_01234567-89ab"` | TEXT |
| `ticket_id` | Ticket UUID | `"tkt_01234567-89ab"` | TEXT |
| `ticket_number` | Ticket number | `"IT#142"` | TEXT, FK to ticketing_tickets, NOT NULL |
| `update_id` | Update this is attached to | `"upd_01234567-89ab"`, `NULL` | TEXT, FK to ticketing_updates |
| `file_name` | Original filename | `"screenshot.png"`, `"error-log.txt"` | TEXT, NOT NULL |
| `file_url` | Public URL | `"https://cdn.example.com/att_123.png"` | TEXT, NOT NULL |
| `file_size_bytes` | File size in bytes | `1048576` (1 MB) | INTEGER |
| `file_size` | File size (may be duplicate) | `1048576` | INTEGER, NOT NULL |
| `mime_type` | MIME type | `"image/png"`, `"text/plain"`, `"application/pdf"` | TEXT, NOT NULL |
| `storage_key` | Storage backend key | `"s3://bucket/path/att_123.png"` | TEXT, NOT NULL |
| `storage_url` | Storage URL | `"https://s3.../att_123.png"` | TEXT |
| `uploaded_by` | Uploader employee ID | `"EMP-042"` | TEXT, NOT NULL |
| `uploaded_by_name` | Uploader name | `"John Smith"` | TEXT |
| `uploaded_at` | Upload timestamp | `"2024-06-15T10:15:00Z"` | TEXT, NOT NULL |
| `description` | File description | `"Screenshot showing error message"` | TEXT |

**Indexes**:
- PRIMARY KEY on `attachment_id`
- Index on `ticket_number, uploaded_at DESC`
- Index on `update_id`

---

## PROJECT MANAGEMENT MODULE v2.0

### Table 22: `pm_objectives`

**Purpose**: Strategic objectives (top-level) - organizational goals that contain multiple projects.

**Dependencies**:
- `firm_departments` (optional)
- `employees` (owner)

**Key Features**:
- Strategic planning layer above projects
- KPIs and success criteria tracking
- Revenue and profit margin targets
- Health status and progress tracking
- Team members and fiscal year association
- Custom fields support

#### Columns

| Column | Purpose | Sample Values | Type/Constraints |
|--------|---------|---------------|------------------|
| `objective_id` | **Primary Key** - Unique objective ID | `"OBJ-2024-001"` | TEXT |
| `objective_number` | Display number | `"OBJ-2024-Q1-001"` | TEXT, NOT NULL, UNIQUE |
| `objective_name` | Objective name | `"Increase Market Share by 20%"` | TEXT, NOT NULL |
| `description` | Detailed description | `"Expand into new markets and improve customer acquisition"` | TEXT |
| `vision_statement` | Vision/mission statement | `"Become the leading provider in our industry"` | TEXT |
| `objective_type` | Type of objective | `"general"`, `"okr"`, `"strategic_initiative"` | TEXT, ENUM, DEFAULT 'general' |
| `client_id` | Associated client | `"CLIENT-001"`, `NULL` | TEXT |
| `primary_contact_id` | Primary contact | `"CONTACT-042"`, `NULL` | TEXT |
| `department_code` | Owning department | `"SALES"`, `"PRODUCT"`, `NULL` | TEXT, FK to firm_departments |
| `owner_employee_id` | Objective owner | `"EMP-010"` | TEXT, FK to employees |
| `team_members` | Team members **(JSONB Array)** | `["EMP-010", "EMP-020", "EMP-030"]` | TEXT (JSONB), DEFAULT '[]' |
| `start_date` | Start date | `"2024-01-01"` | TEXT (ISO date) |
| `target_end_date` | Target end date | `"2024-12-31"` | TEXT (ISO date) |
| `fiscal_year` | Fiscal year | `"FY2024"`, `"2024"` | TEXT |
| `quarter` | Quarter | `"Q1"`, `"Q2"`, `"Q3"`, `"Q4"` | TEXT |
| `status` | Current status | `"planning"`, `"active"`, `"on_hold"`, `"completed"`, `"cancelled"` | TEXT, ENUM, DEFAULT 'planning' |
| `health_status` | Health indicator | `"on_track"`, `"at_risk"`, `"behind"`, `"blocked"` | TEXT, ENUM, DEFAULT 'on_track' |
| `progress_percentage` | Progress % | `65.5` (0-100) | REAL, DEFAULT 0.00 |
| `target_revenue` | Revenue goal | `5000000.00` | REAL |
| `actual_revenue` | Actual revenue | `3250000.00` | REAL, DEFAULT 0.00 |
| `target_profit_margin` | Profit margin goal % | `35.0` | REAL |
| `actual_profit_margin` | Actual profit margin % | `32.5` | REAL |
| `currency` | Currency | `"USD"`, `"EUR"` | TEXT, DEFAULT 'USD' |
| `kpis` | Key performance indicators **(JSONB Array)** | `[{"name":"Market Share","target":20,"actual":15,"unit":"%"}]` | TEXT (JSONB), DEFAULT '[]' |
| `success_criteria` | Success criteria | `"Achieve 20% market share increase in target regions"` | TEXT |
| `color` | Display color | `"#3498db"`, `"#e74c3c"` | TEXT |
| `icon` | Icon identifier | `"target"`, `"rocket"`, `"chart-line"` | TEXT |
| `default_dashboard_id` | Default dashboard | `"DASH-001"`, `NULL` | TEXT |
| `is_visible_to_clients` | Client visible? | `1`, `0` | INTEGER, DEFAULT 0 |
| `is_archived` | Archived? | `1`, `0` | INTEGER, DEFAULT 0 |
| `custom_fields` | Custom fields **(JSONB)** | `{"sponsor":"CEO","initiative_type":"growth"}` | TEXT (JSONB), DEFAULT '{}' |
| `created_at` | Creation timestamp | `"2024-01-01T00:00:00Z"` | TEXT, NOT NULL |
| `updated_at` | Last update | `"2024-06-15T14:00:00Z"` | TEXT, NOT NULL |
| `created_by` | Creator | `"EMP-001"` | TEXT, NOT NULL |
| `updated_by` | Last updater | `"EMP-010"` | TEXT |
| `archived_at` | Archive timestamp | `"2025-01-15T00:00:00Z"`, `NULL` | TEXT |

**Enumerations**:
- `objective_type`: See [enumerations.json - projects.objectiveType](enumerations.json)
- `status`: See [enumerations.json - projects.objectiveStatus](enumerations.json)
- `health_status`: See [enumerations.json - projects.healthStatus](enumerations.json)

**Indexes**:
- UNIQUE index on `objective_number`
- Index on `objective_type`
- Index on `status`
- Index on `owner_employee_id`
- Index on `department_code`
- Partial index on `client_id` WHERE `client_id IS NOT NULL`
- Partial index on `status` WHERE `status = 'active' AND is_archived = 0`

---

### Table 23: `projects`

**Purpose**: Projects within objectives - client work, internal projects, product development.

**Dependencies**:
- `pm_objectives` (optional parent objective)
- Self-referencing for parent projects
- `employees` (project manager)
- `firm_departments` (owning department)

**Key Features**:
- Hierarchical projects (parent-child)
- Budget and time tracking
- Client project vs. internal project
- Billing configuration
- Custom columns and fields
- Template support
- Cached aggregate metrics for performance

#### Columns

| Column | Purpose | Sample Values | Type/Constraints |
|--------|---------|---------------|------------------|
| `project_id` | **Primary Key** | `"PROJ-2024-001"` | TEXT |
| `project_number` | Display number | `"PROJ-2024-CLIENT-001"` | TEXT, NOT NULL, UNIQUE |
| `project_name` | Project name | `"Website Redesign - ACME Corp"` | TEXT, NOT NULL |
| `objective_id` | Parent objective | `"OBJ-2024-001"`, `NULL` | TEXT, FK to pm_objectives |
| `parent_project_id` | Parent project | `"PROJ-2024-001"`, `NULL` | TEXT, FK to self |
| `description` | Description | `"Complete website redesign with modern tech stack"` | TEXT |
| `project_type` | Type | `"client_project"`, `"internal"`, `"product_development"` | TEXT, ENUM, DEFAULT 'client_project' |
| `client_id` | Client | `"CLIENT-001"`, `NULL` | TEXT |
| `contact_person_id` | Client contact | `"CONTACT-042"`, `NULL` | TEXT |
| `service_type` | Service type | `"web_development"`, `"consulting"` | TEXT |
| `industry` | Industry | `"technology"`, `"healthcare"` | TEXT |
| `tags` | Tags **(JSONB Array)** | `["web", "react", "high-priority"]` | TEXT (JSONB), DEFAULT '[]' |
| `project_manager_id` | PM | `"EMP-025"` | TEXT, FK to employees |
| `team_members` | Team **(JSONB Array)** | `["EMP-025", "EMP-030", "EMP-042"]` | TEXT (JSONB), DEFAULT '[]' |
| `department_code` | Department | `"ENG"`, `"CONSULTING"` | TEXT, FK to firm_departments |
| `location_code` | Location | `"NYC"`, `"SF"` | TEXT |
| `start_date` | Start | `"2024-01-15"` | TEXT (ISO date) |
| `target_end_date` | Target end | `"2024-06-30"` | TEXT (ISO date) |
| `actual_start_date` | Actual start | `"2024-01-20"` | TEXT (ISO date) |
| `actual_end_date` | Actual end | `"2024-07-05"`, `NULL` | TEXT (ISO date) |
| `status` | Status | `"draft"`, `"planned"`, `"active"`, `"completed"`, `"cancelled"` | TEXT, ENUM, DEFAULT 'draft' |
| `priority` | Priority | `"low"`, `"medium"`, `"high"`, `"critical"` | TEXT, ENUM, DEFAULT 'medium' |
| `progress_percentage` | Progress % | `45.5` (0-100) | REAL, DEFAULT 0.00 |
| `health_status` | Health | `"on_track"`, `"at_risk"`, `"behind"` | TEXT, ENUM, DEFAULT 'on_track' |
| `budget_type` | Budget type | `"fixed_price"`, `"time_and_materials"`, `"retainer"` | TEXT, ENUM |
| `budget` | Total budget | `150000.00` | REAL |
| `estimated_hours` | Est. hours | `1200.0` | REAL |
| `actual_hours` | Actual hours | `850.5` | REAL, DEFAULT 0.00 |
| `actual_cost` | Actual cost | `95000.00` | REAL, DEFAULT 0.00 |
| `currency` | Currency | `"USD"`, `"EUR"` | TEXT, DEFAULT 'USD' |
| `billing_method` | How billed | `"hourly"`, `"fixed"`, `"milestone"`, `"retainer"` | TEXT, ENUM |
| `hourly_rate` | Hourly rate | `150.00`, `200.00` | REAL |
| `is_billable` | Billable? | `1` (yes), `0` (no) | INTEGER, DEFAULT 1 |
| `total_billed` | Total billed | `75000.00` | REAL, DEFAULT 0.00 |
| `proposal_id` | Linked proposal | `"PROP-001"`, `NULL` | TEXT |
| `contract_id` | Linked contract | `"CONTRACT-001"`, `NULL` | TEXT |
| `is_template` | Is template? | `1`, `0` | INTEGER, DEFAULT 0 |
| `template_id` | Created from template | `"PROJ-TEMPLATE-001"`, `NULL` | TEXT, FK to self |
| `is_recurring` | Recurring? | `1`, `0` | INTEGER, DEFAULT 0 |
| `recurrence_rule` | Recurrence **(JSONB)** | `{"frequency":"monthly","interval":1}` | TEXT (JSONB), DEFAULT '{}' |
| `client_visible` | Client visible? | `1`, `0` | INTEGER, DEFAULT 0 |
| `client_can_comment` | Client can comment? | `1`, `0` | INTEGER, DEFAULT 0 |
| `client_approval_required` | Needs approval? | `1`, `0` | INTEGER, DEFAULT 0 |
| `notify_on_status_change` | Notify on status? | `1`, `0` | INTEGER, DEFAULT 1 |
| `notify_on_task_completion` | Notify on task? | `1`, `0` | INTEGER, DEFAULT 0 |
| `color` | Display color | `"#3498db"` | TEXT |
| `icon` | Icon | `"project-diagram"` | TEXT |
| `default_view` | Default view | `"kanban"`, `"list"`, `"gantt"`, `"calendar"` | TEXT, ENUM, DEFAULT 'kanban' |
| `has_custom_columns` | Custom columns? | `1`, `0` | INTEGER, DEFAULT 0 |
| `column_config_version` | Column config version | `1`, `2` | INTEGER, DEFAULT 1 |
| `custom_fields` | Custom fields **(JSONB)** | See JSONB examples | TEXT (JSONB), DEFAULT '{}' |
| `hourly_rate_override` | Rate override | `175.00`, `NULL` | REAL |
| `task_count` | **Cached** - Total tasks | `42` | INTEGER, DEFAULT 0 |
| `completed_task_count` | **Cached** - Completed | `28` | INTEGER, DEFAULT 0 |
| `last_activity_at` | **Cached** - Last activity | `"2024-06-15T14:30:00Z"` | TEXT |
| `created_at` | Creation | `"2024-01-01T00:00:00Z"` | TEXT, NOT NULL |
| `updated_at` | Last update | `"2024-06-15T14:00:00Z"` | TEXT, NOT NULL |
| `created_by` | Creator | `"EMP-001"` | TEXT, NOT NULL |
| `updated_by` | Last updater | `"EMP-025"` | TEXT |
| `archived_at` | Archive timestamp | `NULL` | TEXT |

**JSONB Field: `custom_fields`** - See [JSONB Example #8](JSONB-FIELD-EXAMPLES.md#8-custom_fields---project-custom-fields)

**Enumerations**:
- `project_type`: See [enumerations.json - projects.projectType](enumerations.json)
- `status`: See [enumerations.json - projects.projectStatus](enumerations.json)
- `priority`: See [enumerations.json - projects.priority](enumerations.json)
- `health_status`: See [enumerations.json - projects.healthStatus](enumerations.json)
- `budget_type`: See [enumerations.json - projects.budgetType](enumerations.json)
- `billing_method`: See [enumerations.json - projects.billingMethod](enumerations.json)
- `default_view`: See [enumerations.json - projects.defaultView](enumerations.json)

**Indexes**:
- UNIQUE on `project_number`
- Partial index on `objective_id` WHERE `objective_id IS NOT NULL`
- Index on `status`
- Index on `project_manager_id`
- Index on `department_code`
- Partial index on `client_id` WHERE `client_id IS NOT NULL`
- Index on `start_date, due_date`
- Partial index on `is_template` WHERE `is_template = 1`
- Partial index on `status` WHERE `status IN ('active', 'planned')`

---

### Table 24: `tasks`

**Purpose**: Tasks within projects - actionable work items.

**Dependencies**:
- `projects` (parent project)
- Self-referencing for parent tasks (subtasks)
- `employees` (assignee)

**Key Features**:
- Hierarchical tasks (parent-child via `parent_task_id`)
- Kanban board support (board_column, board_position)
- Time and budget tracking
- Dependencies (depends_on, blocks)
- Client approval workflow
- Deliverables and checklists
- Recurring tasks
- Custom fields

#### Columns

| Column | Purpose | Sample Values | Type/Constraints |
|--------|---------|---------------|------------------|
| `task_id` | **Primary Key** | `"TASK-001"` | TEXT |
| `task_number` | Task number within project | `"T-42"`, `"T-100"` | TEXT, NOT NULL |
| `project_id` | Parent project | `"PROJ-2024-001"` | TEXT, FK to projects, NOT NULL |
| `parent_task_id` | Parent task (for subtasks) | `"TASK-001"`, `NULL` | TEXT, FK to self |
| `task_name` | Task name | `"Design homepage mockup"` | TEXT, NOT NULL |
| `position` | Sort position | `1`, `2`, `10` | INTEGER |
| `depth_level` | Nesting level | `0` (top), `1` (subtask), `2` (sub-subtask) | INTEGER, DEFAULT 0 |
| `description` | Description | `"Create mockups for homepage redesign using Figma"` | TEXT |
| `task_type` | Type | `"task"`, `"milestone"`, `"deliverable"`, `"bug"`, `"feature"` | TEXT, ENUM, DEFAULT 'task' |
| `status` | Status | `"todo"`, `"in_progress"`, `"in_review"`, `"completed"`, `"blocked"` | TEXT, ENUM, DEFAULT 'todo' |
| `priority` | Priority | `"low"`, `"medium"`, `"high"`, `"critical"` | TEXT, ENUM, DEFAULT 'medium' |
| `assigned_to` | Assignee | `"EMP-042"`, `NULL` | TEXT, FK to employees |
| `assigned_team_id` | Assigned team | `"TEAM-001"`, `NULL` | TEXT |
| `role_required` | Required role | `"frontend_developer"`, `"designer"` | TEXT |
| `start_date` | Start date | `"2024-01-15"` | TEXT (ISO date) |
| `due_date` | Due date | `"2024-01-22"` | TEXT (ISO date) |
| `completed_date` | Completed date | `"2024-01-20"`, `NULL` | TEXT (ISO date) |
| `estimated_hours` | Estimated hours | `16.0`, `40.0` | REAL |
| `actual_hours` | Actual hours | `18.5` | REAL, DEFAULT 0.00 |
| `progress_percentage` | Progress % | `75.0` (0-100) | REAL, DEFAULT 0.00 |
| `budget` | Task budget | `2000.00` | REAL |
| `actual_cost` | Actual cost | `1850.00` | REAL |
| `board_column` | Kanban column | `"todo"`, `"in-progress"`, `"done"` | TEXT |
| `board_position` | Position in column | `0`, `1`, `5` | INTEGER |
| `is_billable` | Billable? | `1`, `0` | INTEGER, DEFAULT 1 |
| `billable_hours` | Billable hours | `18.0` | REAL, DEFAULT 0.00 |
| `non_billable_hours` | Non-billable hours | `0.5` | REAL, DEFAULT 0.00 |
| `hourly_rate` | Hourly rate | `150.00` | REAL |
| `depends_on_task_ids` | Dependencies **(JSONB Array)** | `["TASK-040", "TASK-041"]` | TEXT (JSONB), DEFAULT '[]' |
| `blocks_task_ids` | Blocks **(JSONB Array)** | `["TASK-045"]` | TEXT (JSONB), DEFAULT '[]' |
| `has_deliverable` | Has deliverable? | `1`, `0` | INTEGER, DEFAULT 0 |
| `deliverable_type` | Deliverable type | `"design"`, `"document"`, `"code"` | TEXT |
| `deliverable_url` | Deliverable URL | `"https://files.../mockup-v3.pdf"` | TEXT |
| `client_visible` | Client visible? | `1`, `0` | INTEGER, DEFAULT 0 |
| `requires_client_approval` | Needs approval? | `1`, `0` | INTEGER, DEFAULT 0 |
| `client_approved_at` | Approved timestamp | `"2024-01-21T10:00:00Z"`, `NULL` | TEXT |
| `client_approved_by` | Approver | `"CLIENT-CONTACT-001"`, `NULL` | TEXT |
| `attachment_count` | Attachment count | `3` | INTEGER, DEFAULT 0 |
| `checklist_items` | Checklist **(JSONB Array)** | `[{"id":"c1","task":"Review design","done":true}]` | TEXT (JSONB), DEFAULT '[]' |
| `is_recurring` | Recurring? | `1`, `0` | INTEGER, DEFAULT 0 |
| `recurrence_rule` | Recurrence **(JSONB)** | `{"frequency":"weekly","interval":1}` | TEXT (JSONB), DEFAULT '{}' |
| `recurrence_parent_id` | Recurrence parent | `"TASK-001"`, `NULL` | TEXT, FK to self |
| `tags` | Tags **(JSONB Array)** | `["design", "urgent", "client-facing"]` | TEXT (JSONB), DEFAULT '[]' |
| `labels` | Labels **(JSONB Array)** | `["high-priority", "needs-review"]` | TEXT (JSONB), DEFAULT '[]' |
| `custom_fields` | Custom fields **(JSONB)** | See JSONB examples | TEXT (JSONB), DEFAULT '{}' |
| `created_at` | Creation | `"2024-01-15T09:00:00Z"` | TEXT, NOT NULL |
| `updated_at` | Last update | `"2024-01-20T15:30:00Z"` | TEXT, NOT NULL |
| `completed_at` | Completed timestamp | `"2024-01-20T15:30:00Z"`, `NULL` | TEXT |
| `created_by` | Creator | `"EMP-025"` | TEXT, NOT NULL |
| `updated_by` | Last updater | `"EMP-042"` | TEXT |

**JSONB Field: `custom_fields`** - See [JSONB Example #7](JSONB-FIELD-EXAMPLES.md#7-custom_fields---task-custom-fields)

**Enumerations**:
- `task_type`: See [enumerations.json - projects.taskType](enumerations.json)
- `status`: See [enumerations.json - projects.taskStatus](enumerations.json)
- `priority`: See [enumerations.json - projects.priority](enumerations.json)

**Indexes**:
- UNIQUE on `(project_id, task_number)`
- Index on `project_id`
- Partial index on `parent_task_id` WHERE `parent_task_id IS NOT NULL`
- Partial index on `assigned_to` WHERE `assigned_to IS NOT NULL`
- Index on `status`
- Partial index on `due_date` WHERE `due_date IS NOT NULL`
- Index on `project_id, board_column, board_position` (Kanban)
- Index on `project_id, status, completed_at`

---

### Table 25: `pm_dashboards`

**Purpose**: Custom dashboards for visualizing project/objective data.

**Dependencies**:
- `pm_objectives` (optional - for objective-scoped dashboards)
- `employees` (dashboard owner)

**Key Features**:
- Scope: tenant-wide, objective-specific, or personal
- Multiple layout types
- Widget configuration
- Sharing with users/teams
- Auto-refresh settings

#### Columns

| Column | Purpose | Sample Values | Type/Constraints |
|--------|---------|---------------|------------------|
| `dashboard_id` | **Primary Key** | `"DASH-001"` | TEXT |
| `scope` | Dashboard scope | `"tenant"`, `"objective"`, `"personal"` | TEXT, ENUM, NOT NULL |
| `objective_id` | Objective (if scope=objective) | `"OBJ-2024-001"`, `NULL` | TEXT, FK to pm_objectives |
| `dashboard_name` | Dashboard name | `"Q1 2024 Executive Dashboard"` | TEXT, NOT NULL |
| `description` | Description | `"High-level metrics for Q1 objectives"` | TEXT |
| `layout_type` | Layout | `"grid"`, `"flex"`, `"custom"` | TEXT, DEFAULT 'grid' |
| `layout_config` | Layout configuration **(JSONB)** | `{"columns":3,"gap":16}` | TEXT (JSONB), DEFAULT '{}' |
| `widget_count` | Current widget count | `8`, `12` | INTEGER, DEFAULT 0 |
| `max_widgets` | Maximum widgets allowed | `30`, `50` | INTEGER, DEFAULT 30 |
| `visibility` | Who can see | `"workspace"`, `"private"`, `"shared"` | TEXT, ENUM, DEFAULT 'workspace' |
| `owner_employee_id` | Owner | `"EMP-001"` | TEXT, FK to employees |
| `is_public` | Public? | `1`, `0` | INTEGER, DEFAULT 0 |
| `shared_with_users` | Shared users **(JSONB Array)** | `["EMP-010", "EMP-020"]` | TEXT (JSONB), DEFAULT '[]' |
| `shared_with_teams` | Shared teams **(JSONB Array)** | `["TEAM-EXE", "TEAM-PM"]` | TEXT (JSONB), DEFAULT '[]' |
| `auto_refresh_enabled` | Auto-refresh? | `1`, `0` | INTEGER, DEFAULT 1 |
| `refresh_interval_seconds` | Refresh interval | `300` (5 min), `60` | INTEGER, DEFAULT 300 |
| `is_default` | Default dashboard? | `1`, `0` | INTEGER, DEFAULT 0 |
| `is_template` | Is template? | `1`, `0` | INTEGER, DEFAULT 0 |
| `created_at` | Creation | `"2024-01-01T00:00:00Z"` | TEXT, NOT NULL |
| `updated_at` | Last update | `"2024-06-15T10:00:00Z"` | TEXT, NOT NULL |
| `created_by` | Creator | `"EMP-001"` | TEXT, NOT NULL |
| `last_viewed_at` | Last viewed | `"2024-06-15T14:30:00Z"` | TEXT |
| `view_count` | Total views | `142` | INTEGER, DEFAULT 0 |

**Enumerations**:
- `scope`: See [enumerations.json - projects.dashboardScope](enumerations.json)
- `visibility`: See [enumerations.json - projects.dashboardVisibility](enumerations.json)

**Indexes**:
- Partial index on `objective_id` WHERE `objective_id IS NOT NULL`
- Index on `owner_employee_id`
- Index on `visibility`

---

### Table 26: `pm_dashboard_widgets`

**Purpose**: Individual widgets/charts within dashboards.

**Dependencies**:
- `pm_dashboards` (parent dashboard)

**Key Features**:
- Multiple widget types (charts, metrics, tables, text)
- Grid positioning
- Data source configuration
- Caching support

#### Columns

| Column | Purpose | Sample Values | Type/Constraints |
|--------|---------|---------------|------------------|
| `widget_id` | **Primary Key** | `"WDG-001"` | TEXT |
| `dashboard_id` | Parent dashboard | `"DASH-001"` | TEXT, FK to pm_dashboards, NOT NULL |
| `widget_type` | Type of widget | `"chart_line"`, `"chart_bar"`, `"metric"`, `"table"`, `"text"` | TEXT, ENUM, NOT NULL |
| `position_x` | Grid X position | `0`, `1`, `2` | INTEGER, NOT NULL |
| `position_y` | Grid Y position | `0`, `1`, `2` | INTEGER, NOT NULL |
| `width` | Widget width (grid units) | `4`, `6`, `12` | INTEGER, NOT NULL, DEFAULT 4 |
| `height` | Widget height (grid units) | `3`, `4`, `6` | INTEGER, NOT NULL, DEFAULT 3 |
| `widget_title` | Widget title | `"Revenue by Month"`, `"Task Completion Rate"` | TEXT |
| `data_sources` | Data sources **(JSONB)** | `{"type":"projects","filters":{"status":"active"}}` | TEXT (JSONB), DEFAULT '{}' |
| `config` | Widget config **(JSONB)** | `{"chartType":"line","xAxis":"month","yAxis":"revenue"}` | TEXT (JSONB), DEFAULT '{}' |
| `display_order` | Display order | `0`, `1`, `5` | INTEGER, DEFAULT 0 |
| `cache_updated_at` | Cache timestamp | `"2024-06-15T14:00:00Z"` | TEXT |
| `show_title` | Show title? | `1`, `0` | INTEGER, DEFAULT 1 |
| `is_text_widget` | Is text widget? | `1`, `0` | INTEGER, DEFAULT 0 |
| `cache_enabled` | Caching enabled? | `1`, `0` | INTEGER, DEFAULT 1 |
| `cached_data` | Cached data **(JSONB)** | `{"data":[...]}` | TEXT (JSONB) |
| `cached_at` | Cache time | `"2024-06-15T14:00:00Z"` | TEXT |
| `cache_ttl_seconds` | Cache TTL | `300` (5 min) | INTEGER, DEFAULT 300 |
| `created_at` | Creation | `"2024-01-01T00:00:00Z"` | TEXT, NOT NULL |
| `updated_at` | Last update | `"2024-06-15T10:00:00Z"` | TEXT, NOT NULL |
| `created_by` | Creator | `"EMP-001"` | TEXT, NOT NULL |

**Enumerations**:
- `widget_type`: See [enumerations.json - projects.widgetType](enumerations.json)

**Indexes**:
- Index on `dashboard_id`
- Index on `widget_type`
- Index on `dashboard_id, position_x, position_y`

---

### Table 27: `pm_automations`

**Purpose**: Workflow automations (triggers, conditions, actions).

**Dependencies**:
- `projects` (optional - for project-scoped automations)
- `pm_objectives` (optional - for objective-scoped automations)
- `employees` (creator)

**Key Features**:
- Scope: project, objective, or tenant-wide
- Event-based triggers
- Conditional logic
- Multiple actions
- AI-suggested automations
- Rate limiting

#### Columns

| Column | Purpose | Sample Values | Type/Constraints |
|--------|---------|---------------|------------------|
| `automation_id` | **Primary Key** | `"AUTO-001"` | TEXT |
| `scope` | Scope | `"project"`, `"objective"`, `"tenant"` | TEXT, ENUM, NOT NULL |
| `project_id` | Project (if scope=project) | `"PROJ-2024-001"`, `NULL` | TEXT, FK to projects |
| `objective_id` | Objective (if scope=objective) | `"OBJ-2024-001"`, `NULL` | TEXT, FK to pm_objectives |
| `automation_name` | Name | `"Auto-assign tasks to PM"` | TEXT, NOT NULL |
| `description` | Description | `"Automatically assign new tasks to project manager"` | TEXT |
| `trigger` | Trigger event **(JSONB)** | `{"event":"task.created","filters":{}}` | TEXT (JSONB), NOT NULL, DEFAULT '{}' |
| `conditions` | Conditions **(JSONB Array)** | `[{"field":"priority","operator":"equals","value":"high"}]` | TEXT (JSONB), DEFAULT '[]' |
| `actions` | Actions **(JSONB Array)** | `[{"type":"assign_task","assignee":"${project.manager_id}"}]` | TEXT (JSONB), NOT NULL, DEFAULT '[]' |
| `action_delays` | Action delays **(JSONB Array)** | `[{"action_index":0,"delay_seconds":0}]` | TEXT (JSONB), DEFAULT '[]' |
| `is_active` | Active? | `1`, `0` | INTEGER, DEFAULT 1 |
| `execution_count` | Total executions | `142` | INTEGER, DEFAULT 0 |
| `last_executed_at` | Last execution | `"2024-06-15T14:30:00Z"` | TEXT |
| `last_error` | Last error message | `"Assignee not found"`, `NULL` | TEXT |
| `suggested_by_ai` | AI suggested? | `1`, `0` | INTEGER, DEFAULT 0 |
| `ai_confidence` | AI confidence score | `0.95` (0-1) | REAL |
| `created_from_natural_language` | NL description | `"When a task is created, assign it to the PM"` | TEXT |
| `max_executions_per_hour` | Rate limit | `100`, `1000` | INTEGER, DEFAULT 100 |
| `current_hour_executions` | Current hour count | `15` | INTEGER, DEFAULT 0 |
| `current_hour_start` | Hour start time | `"2024-06-15T14:00:00Z"` | TEXT |
| `created_at` | Creation | `"2024-01-01T00:00:00Z"` | TEXT, NOT NULL |
| `updated_at` | Last update | `"2024-06-15T10:00:00Z"` | TEXT, NOT NULL |
| `created_by` | Creator | `"EMP-001"` | TEXT, FK to employees, NOT NULL |

**Enumerations**:
- `scope`: See [enumerations.json - projects.automationScope](enumerations.json)

**Indexes**:
- Partial index on `project_id` WHERE `project_id IS NOT NULL`
- Partial index on `objective_id` WHERE `objective_id IS NOT NULL`
- Partial index on `is_active` WHERE `is_active = 1`

---

### Table 28: `pm_automation_executions`

**Purpose**: Automation execution history and logs.

**Dependencies**:
- `pm_automations` (automation definition)
- `employees` (optional - user who triggered)

**Key Features**:
- Execution tracking
- Success/failure status
- Error logging
- Performance metrics
- Action-level results

#### Columns

| Column | Purpose | Sample Values | Type/Constraints |
|--------|---------|---------------|------------------|
| `execution_id` | **Primary Key** | `"EXEC-001"` | TEXT |
| `automation_id` | Automation | `"AUTO-001"` | TEXT, FK to pm_automations, NOT NULL |
| `triggered_at` | Trigger time | `"2024-06-15T14:30:00Z"` | TEXT |
| `execution_time_ms` | Execution time (ms) | `145`, `2301` | INTEGER |
| `triggered_by` | Trigger source | `"task.created"`, `"user"`, `"schedule"` | TEXT, ENUM, NOT NULL |
| `triggered_by_user_id` | User (if manual) | `"EMP-042"`, `NULL` | TEXT, FK to employees |
| `entity_type` | Entity type | `"task"`, `"project"`, `"objective"` | TEXT, NOT NULL |
| `entity_id` | Entity ID | `"TASK-142"`, `"PROJ-001"` | TEXT, NOT NULL |
| `trigger_data` | Trigger data **(JSONB)** | `{"task_id":"TASK-142","priority":"high"}` | TEXT (JSONB), DEFAULT '{}' |
| `execution_status` | Status | `"success"`, `"partial_success"`, `"failed"` | TEXT, ENUM, NOT NULL |
| `actions_executed` | Actions run | `3` | INTEGER, DEFAULT 0 |
| `actions_failed` | Actions failed | `0`, `1` | INTEGER, DEFAULT 0 |
| `error_message` | Error summary | `"Assignee not found"`, `NULL` | TEXT |
| `error_stack` | Error stack trace | `"Error: User not found\n at ..."` | TEXT |
| `action_results` | Results **(JSONB Array)** | `[{"action":0,"status":"success","result":{}}]` | TEXT (JSONB), DEFAULT '[]' |
| `executed_at` | Execution time | `"2024-06-15T14:30:00Z"` | TEXT, NOT NULL |
| `completed_at` | Completion time | `"2024-06-15T14:30:02Z"` | TEXT |
| `created_at` | Creation | `"2024-06-15T14:30:00Z"` | TEXT, NOT NULL |

**Enumerations**:
- `triggered_by`: See [enumerations.json - projects.automationTriggerType](enumerations.json)
- `execution_status`: See [enumerations.json - projects.automationExecutionStatus](enumerations.json)

**Indexes**:
- Index on `automation_id`
- Index on `entity_type, entity_id`
- Index on `executed_at DESC`
- Index on `execution_status, automation_id`

---

### Table 29: `pm_task_comments`

**Purpose**: Comments and discussions on tasks.

**Dependencies**:
- `tasks` (parent task)
- `projects` (parent project)
- `employees` (author)

**Key Features**:
- Threaded comments (parent-child)
- Internal vs. external visibility
- @mentions support
- Attachments
- Pinned comments

#### Columns

| Column | Purpose | Sample Values | Type/Constraints |
|--------|---------|---------------|------------------|
| `comment_id` | **Primary Key** | `"CMT-001"` | TEXT |
| `task_id` | Task | `"TASK-142"` | TEXT, FK to tasks, NOT NULL |
| `project_id` | Project | `"PROJ-2024-001"` | TEXT, FK to projects, NOT NULL |
| `comment_type` | Type | `"comment"`, `"status_change"`, `"mention"` | TEXT, ENUM, DEFAULT 'comment' |
| `comment_text` | Comment text | `"Working on this now, @john for review"` | TEXT |
| `author_type` | Author type | `"employee"`, `"client"`, `"system"` | TEXT, ENUM, NOT NULL |
| `author_employee_id` | Author (if employee) | `"EMP-042"`, `NULL` | TEXT, FK to employees |
| `author_client_id` | Author (if client) | `"CLIENT-CONTACT-001"`, `NULL` | TEXT |
| `mentioned_users` | @mentions **(JSONB Array)** | `["EMP-010", "EMP-020"]` | TEXT (JSONB), DEFAULT '[]' |
| `attachment_ids` | Attachments **(JSONB Array)** | `["ATT-001", "ATT-002"]` | TEXT (JSONB), DEFAULT '[]' |
| `parent_comment_id` | Parent (for threads) | `"CMT-100"`, `NULL` | TEXT, FK to self |
| `is_internal` | Internal only? | `1`, `0` | INTEGER, DEFAULT 0 |
| `is_pinned` | Pinned? | `1`, `0` | INTEGER, DEFAULT 0 |
| `created_at` | Creation | `"2024-06-15T10:00:00Z"` | TEXT, NOT NULL |
| `updated_at` | Last update | `"2024-06-15T10:05:00Z"` | TEXT, NOT NULL |
| `edited_at` | Last edit | `"2024-06-15T10:05:00Z"`, `NULL` | TEXT |
| `deleted_at` | Deletion time | `NULL` | TEXT |

**Enumerations**:
- `comment_type`: See [enumerations.json - projects.commentType](enumerations.json)
- `author_type`: See [enumerations.json - projects.authorType](enumerations.json)

**Indexes**:
- Index on `task_id`
- Index on `project_id`
- Index on `author_employee_id`

---

### Table 30: `pm_project_templates`

**Purpose**: Reusable project templates for quick project creation.

**Dependencies**:
- `employees` (creator)

**Key Features**:
- Template metadata (category, estimates)
- Template data stored as JSONB (tasks, milestones, etc.)
- Public vs. private templates
- Usage tracking

#### Columns

| Column | Purpose | Sample Values | Type/Constraints |
|--------|---------|---------------|------------------|
| `template_id` | **Primary Key** | `"TMPL-001"` | TEXT |
| `name` | Template name | `"Website Development Standard"` | TEXT, NOT NULL |
| `description` | Description | `"Standard template for client website projects"` | TEXT |
| `category` | Category | `"web_development"`, `"consulting"`, `"product"` | TEXT |
| `template_data` | Template structure **(JSONB)** | `{"tasks":[...],"milestones":[...],"phases":[...]}` | TEXT (JSONB), NOT NULL, DEFAULT '{}' |
| `is_public` | Public template? | `1`, `0` | INTEGER, DEFAULT 0 |
| `use_count` | Times used | `42` | INTEGER, DEFAULT 0 |
| `estimated_duration_days` | Est. duration | `90`, `180` | INTEGER |
| `estimated_hours` | Est. hours | `800.0`, `1200.0` | REAL |
| `estimated_budget` | Est. budget | `120000.00` | REAL |
| `created_at` | Creation | `"2024-01-01T00:00:00Z"` | TEXT, NOT NULL |
| `updated_at` | Last update | `"2024-06-15T10:00:00Z"` | TEXT, NOT NULL |
| `created_by` | Creator | `"EMP-001"` | TEXT, FK to employees, NOT NULL |

**Indexes**:
- Index on `category`
- Partial index on `is_public` WHERE `is_public = 1`

---

### Table 31: `pm_task_time_entries`

**Purpose**: Time tracking entries at task level (project management).

**Dependencies**:
- `tasks` (parent task)
- `projects` (parent project)
- `employees` (who worked)

**Key Features**:
- Timer-based or manual entry
- Billable vs. non-billable hours
- Approval workflow
- Invoice linking

#### Columns

| Column | Purpose | Sample Values | Type/Constraints |
|--------|---------|---------------|------------------|
| `time_entry_id` | **Primary Key** | `"TE-001"` | TEXT |
| `task_id` | Task | `"TASK-142"` | TEXT, FK to tasks, NOT NULL |
| `project_id` | Project | `"PROJ-2024-001"` | TEXT, FK to projects, NOT NULL |
| `employee_id` | Employee | `"EMP-042"` | TEXT, FK to employees, NOT NULL |
| `start_time` | Start time | `"2024-06-15T09:00:00Z"` | TEXT, NOT NULL |
| `end_time` | End time | `"2024-06-15T11:30:00Z"`, `NULL` (running) | TEXT |
| `duration_minutes` | Duration (min) | `150` (2.5 hours) | INTEGER |
| `is_manual_entry` | Manual entry? | `1`, `0` | INTEGER, DEFAULT 0 |
| `entry_date` | Entry date | `"2024-06-15"` | TEXT (ISO date), NOT NULL |
| `hours` | Hours worked | `2.5`, `8.0` | REAL |
| `is_billable` | Billable? | `1`, `0` | INTEGER, DEFAULT 1 |
| `hourly_rate` | Hourly rate | `150.00`, `200.00` | REAL |
| `amount` | Amount (hours × rate) | `375.00` | REAL |
| `notes` | Notes | `"Worked on homepage redesign"` | TEXT |
| `status` | Status | `"draft"`, `"submitted"`, `"approved"`, `"invoiced"` | TEXT, ENUM, DEFAULT 'draft' |
| `approved_by` | Approver | `"EMP-010"`, `NULL` | TEXT, FK to employees |
| `approved_at` | Approval time | `"2024-06-16T10:00:00Z"`, `NULL` | TEXT |
| `invoice_id` | Invoice | `"INV-001"`, `NULL` | TEXT |
| `invoice_line_item_id` | Invoice line | `"INV-001-LINE-5"`, `NULL` | TEXT |
| `created_at` | Creation | `"2024-06-15T09:00:00Z"` | TEXT, NOT NULL |
| `updated_at` | Last update | `"2024-06-15T11:30:00Z"` | TEXT, NOT NULL |

**Enumerations**:
- `status`: See [enumerations.json - projects.timeEntryStatus](enumerations.json)

**Indexes**:
- Index on `task_id`
- Index on `project_id`
- Index on `employee_id`
- Index on `entry_date`
- Index on `status`

---

### Table 32: `pm_task_attachments`

**Purpose**: File attachments for tasks.

**Dependencies**:
- `tasks` (optional - can be project-level)
- `projects` (parent project)
- `employees` (uploader)

**Key Features**:
- Versioning support
- Client visibility control
- Approval workflow for deliverables

#### Columns

| Column | Purpose | Sample Values | Type/Constraints |
|--------|---------|---------------|------------------|
| `attachment_id` | **Primary Key** | `"ATT-001"` | TEXT |
| `task_id` | Task | `"TASK-142"`, `NULL` (project-level) | TEXT, FK to tasks |
| `project_id` | Project | `"PROJ-2024-001"` | TEXT, FK to projects, NOT NULL |
| `file_name` | Filename | `"mockup-v3.pdf"`, `"homepage-design.fig"` | TEXT, NOT NULL |
| `file_url` | Public URL | `"https://cdn.../mockup-v3.pdf"` | TEXT, NOT NULL |
| `file_size_bytes` | Size (bytes) | `2048576` (2 MB) | INTEGER |
| `mime_type` | MIME type | `"application/pdf"`, `"image/png"` | TEXT |
| `file_type` | File type | `"document"`, `"image"`, `"design"` | TEXT |
| `file_extension` | Extension | `"pdf"`, `"png"`, `"fig"` | TEXT |
| `attachment_type` | Attachment type | `"deliverable"`, `"reference"`, `"screenshot"` | TEXT |
| `version_number` | Version | `1`, `2`, `3` | INTEGER, DEFAULT 1 |
| `parent_attachment_id` | Previous version | `"ATT-100"`, `NULL` | TEXT, FK to self |
| `is_latest_version` | Is latest? | `1`, `0` | INTEGER, DEFAULT 1 |
| `client_visible` | Client visible? | `1`, `0` | INTEGER, DEFAULT 0 |
| `requires_approval` | Needs approval? | `1`, `0` | INTEGER, DEFAULT 0 |
| `uploaded_by` | Uploader | `"EMP-042"` | TEXT, FK to employees, NOT NULL |
| `uploaded_at` | Upload time | `"2024-06-15T10:00:00Z"` | TEXT, NOT NULL |
| `description` | Description | `"Homepage mockup - final version"` | TEXT |

**Indexes**:
- Partial index on `task_id` WHERE `task_id IS NOT NULL`
- Index on `project_id`
- Partial index on `parent_attachment_id, version_number` WHERE `parent_attachment_id IS NOT NULL`

---

[← Back to Index](SCHEMA-HELP-GUIDE.md) | [← Part 1](SCHEMA-HELP-GUIDE-PART-1.md) | [Part 3 →](SCHEMA-HELP-GUIDE-PART-3.md)
