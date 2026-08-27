# Module: Project & Task Management v2.0

**Version:** 2.0
**Last Updated:** 2025-12-28
**Module ID:** `project_management_v2`
**Dependencies:** `firm_profile`, `employee_profile`, `accounting`, `document_management`, `client_portal`
**Status:** Draft - Integrated Specification

---

## Overview

Comprehensive project and task management system designed for service providers, combining strategic objective planning with flexible project execution. Integrates proven Monday.com visualization patterns with service provider billing and workflows.

### Key Features

✅ **Strategic Hierarchy** - Objectives → Projects → Tasks → Subtasks (4-level hierarchy)
✅ **Typed Column System** - 30+ column types with validation and formulas
✅ **Multiple Views** - Kanban, List, Gantt, Calendar, Workload, Chart views
✅ **Cross-Project Dashboards** - Executive visibility with customizable widgets
✅ **Visual Automation** - No-code automation builder with AI assistance
✅ **Smart Assignment** - Workload balancing and capacity planning
✅ **Project Templates** - Reusable templates for common service types
✅ **Client Collaboration** - Client-visible updates and approval workflows
✅ **Time Integration** - Direct time tracking on tasks
✅ **Service Provider Billing** - Native invoicing, retainers, and contract management
✅ **Formula & Mirror Columns** - Cross-project calculations and references
✅ **Dependencies** - Task dependencies and critical path analysis

### What's New in v2.0

🆕 **Objectives Layer** - Strategic organization above projects (maps to Monday.com Workspaces)
🆕 **Typed Columns** - Replace generic JSONB with structured column types
🆕 **Dashboards** - Cross-project analytics and reporting
🆕 **Automation Engine** - Visual workflow builder
🆕 **Formula Columns** - Budget calculations, utilization rates
🆕 **Mirror Columns** - Reference data across projects
🆕 **Enhanced Views** - Calendar, Workload, Chart views
🆕 **AI Capabilities** - Automation suggestions, natural language queries

---

## Table of Contents

1. [Hierarchy & Architecture](#hierarchy--architecture)
2. [Database Schema](#database-schema)
3. [Column Type System](#column-type-system)
4. [API Endpoints](#api-endpoints)
5. [Automation Engine](#automation-engine)
6. [Dashboards & Widgets](#dashboards--widgets)
7. [Views & Visualizations](#views--visualizations)
8. [Business Logic](#business-logic)
9. [Integration Points](#integration-points)
10. [Permissions & Access Control](#permissions--access-control)

---

## Hierarchy & Architecture

### Four-Level Hierarchy

```
Tenant (Account)
  └── Objectives (Strategic workspace - NEW in v2.0)
      └── Projects (Execution unit)
          └── Tasks (Work items)
              └── Subtasks (Task breakdown)
```

### Mapping to Monday.com Concepts

| Our System | Monday.com | Purpose |
|------------|-----------|---------|
| **Tenant** | Account | Top-level organization |
| **Objective** | Workspace | Strategic grouping (clients, departments, initiatives) |
| **Project** | Board | Execution workspace with typed columns |
| **Task** | Item | Individual work item |
| **Subtask** | Subitem | Task breakdown |

### Use Cases for Objectives

**Agency with Multiple Clients:**
```
Tenant: Digital Agency
  ├── Objective: Client A (Acme Corp)
  │   ├── Project: Website Redesign
  │   ├── Project: SEO Campaign Q1
  │   └── Project: Content Marketing
  ├── Objective: Client B (TechStart Inc)
  │   ├── Project: Mobile App Development
  │   └── Project: Brand Strategy
  └── Objective: Internal Operations
      ├── Project: Team Onboarding
      └── Project: Marketing Website
```

**Consulting Firm by Department:**
```
Tenant: Professional Services LLC
  ├── Objective: Strategy Consulting
  │   ├── Project: Market Analysis - Company X
  │   └── Project: Business Plan - Startup Y
  ├── Objective: IT Consulting
  │   ├── Project: Cloud Migration - Corp Z
  │   └── Project: Security Audit - Bank A
  └── Objective: HR Consulting
      └── Project: Culture Assessment - Manufacturer B
```

**Service Provider by Service Line:**
```
Tenant: Full-Service Agency
  ├── Objective: Web Development
  │   ├── Project: E-commerce Platform
  │   └── Project: SaaS Dashboard
  ├── Objective: Digital Marketing
  │   ├── Project: PPC Campaign
  │   └── Project: Social Media Management
  └── Objective: Design Services
      ├── Project: Brand Identity
      └── Project: UI/UX Design
```

---

## Database Schema

### 1. Objectives Table (NEW in v2.0)

```sql
CREATE TABLE objectives (
    -- Identity
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    objective_number VARCHAR(50) NOT NULL,

    -- Core Information
    name VARCHAR(200) NOT NULL,
    description TEXT,
    vision_statement TEXT,

    -- Categorization
    objective_type VARCHAR(50) NOT NULL DEFAULT 'general',
    -- 'client', 'department', 'service_line', 'initiative', 'internal', 'general'

    -- Client Relationship (for client-focused objectives)
    client_id UUID REFERENCES clients(id) ON DELETE SET NULL,
    primary_contact_id UUID REFERENCES contacts(id),

    -- Department Assignment (for department objectives)
    department_id UUID REFERENCES departments(id),

    -- Ownership
    owner_id UUID REFERENCES employees(id),
    team_members UUID[], -- Array of employee IDs

    -- Strategic Planning
    start_date DATE,
    target_end_date DATE,
    fiscal_year VARCHAR(10),
    quarter VARCHAR(10), -- 'Q1', 'Q2', 'Q3', 'Q4'

    -- Status & Health
    status VARCHAR(50) NOT NULL DEFAULT 'planning',
    -- 'planning', 'active', 'on_hold', 'completed', 'cancelled', 'archived'
    health_status VARCHAR(20) DEFAULT 'on_track',
    -- 'on_track', 'at_risk', 'behind', 'blocked'
    completion_percentage DECIMAL(5,2) DEFAULT 0.00,

    -- Budget & Financial Targets
    target_revenue DECIMAL(15,2),
    actual_revenue DECIMAL(15,2) DEFAULT 0.00,
    target_profit_margin DECIMAL(5,2),
    actual_profit_margin DECIMAL(5,2),
    currency VARCHAR(3) DEFAULT 'USD',

    -- Key Performance Indicators
    kpis JSONB,
    -- Example: [
    --   {name: "Client Satisfaction", target: 4.5, actual: 4.2, unit: "score"},
    --   {name: "Projects Completed", target: 12, actual: 8, unit: "count"}
    -- ]

    -- Visualization
    color VARCHAR(7), -- Hex color for UI
    icon VARCHAR(50),

    -- Dashboard
    default_dashboard_id UUID REFERENCES dashboards(id),

    -- Visibility
    is_visible_to_clients BOOLEAN DEFAULT false,
    is_archived BOOLEAN DEFAULT false,

    -- Custom Fields
    custom_fields JSONB,

    -- Metadata
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    created_by UUID REFERENCES employees(id),
    updated_by UUID REFERENCES employees(id),
    archived_at TIMESTAMP WITH TIME ZONE,

    -- Constraints
    CONSTRAINT unique_objective_number_per_tenant UNIQUE(tenant_id, objective_number),
    CONSTRAINT valid_completion_percentage CHECK (completion_percentage >= 0 AND completion_percentage <= 100),
    CONSTRAINT valid_dates CHECK (target_end_date IS NULL OR start_date IS NULL OR target_end_date >= start_date)
);

-- Indexes
CREATE INDEX idx_objectives_tenant ON objectives(tenant_id);
CREATE INDEX idx_objectives_client ON objectives(client_id) WHERE client_id IS NOT NULL;
CREATE INDEX idx_objectives_department ON objectives(department_id) WHERE department_id IS NOT NULL;
CREATE INDEX idx_objectives_owner ON objectives(owner_id);
CREATE INDEX idx_objectives_status ON objectives(status);
CREATE INDEX idx_objectives_type ON objectives(objective_type);
CREATE INDEX idx_objectives_team ON objectives USING GIN(team_members);
CREATE INDEX idx_objectives_active ON objectives(status) WHERE status = 'active' AND is_archived = false;
```

### 2. Projects Table (Updated)

```sql
CREATE TABLE projects (
    -- Identity
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    project_number VARCHAR(50) NOT NULL,

    -- Hierarchy (NEW)
    objective_id UUID REFERENCES objectives(id) ON DELETE SET NULL,
    parent_project_id UUID REFERENCES projects(id), -- For sub-projects

    -- Core Information
    name VARCHAR(200) NOT NULL,
    description TEXT,
    project_type VARCHAR(50) NOT NULL DEFAULT 'client_project',
    -- 'client_project', 'internal', 'product_development', 'maintenance', 'support'

    -- Client Relationship
    client_id UUID REFERENCES clients(id) ON DELETE SET NULL,
    contact_person_id UUID REFERENCES contacts(id),

    -- Categorization
    service_type VARCHAR(100), -- 'consulting', 'development', 'design', 'marketing', etc.
    industry VARCHAR(100),
    tags VARCHAR(50)[],

    -- Ownership & Team
    project_manager_id UUID REFERENCES employees(id),
    team_members UUID[], -- Array of employee IDs
    department_id UUID REFERENCES departments(id),

    -- Scheduling
    start_date DATE,
    due_date DATE,
    actual_start_date DATE,
    actual_end_date DATE,

    -- Status & Progress
    status VARCHAR(50) NOT NULL DEFAULT 'draft',
    -- 'draft', 'planned', 'active', 'on_hold', 'completed', 'cancelled', 'archived'
    priority VARCHAR(20) DEFAULT 'medium',
    -- 'low', 'medium', 'high', 'critical'
    completion_percentage DECIMAL(5,2) DEFAULT 0.00,
    health_status VARCHAR(20) DEFAULT 'on_track',
    -- 'on_track', 'at_risk', 'behind', 'blocked'

    -- Budget & Estimates
    budget_type VARCHAR(50), -- 'fixed_price', 'time_and_materials', 'retainer', 'not_to_exceed'
    estimated_hours DECIMAL(10,2),
    actual_hours DECIMAL(10,2) DEFAULT 0.00,
    budgeted_amount DECIMAL(15,2),
    actual_cost DECIMAL(15,2) DEFAULT 0.00,
    currency VARCHAR(3) DEFAULT 'USD',

    -- Billing (Service Provider Features)
    billing_method VARCHAR(50), -- 'hourly', 'fixed', 'milestone', 'retainer'
    hourly_rate DECIMAL(10,2),
    is_billable BOOLEAN DEFAULT true,
    total_billed DECIMAL(15,2) DEFAULT 0.00,

    -- Source References
    proposal_id UUID REFERENCES proposals(id),
    contract_id UUID REFERENCES contracts(id),

    -- Template & Recurring
    is_template BOOLEAN DEFAULT false,
    template_id UUID REFERENCES projects(id), -- If created from template
    is_recurring BOOLEAN DEFAULT false,
    recurrence_rule JSONB, -- { frequency, interval, count, until }

    -- Client Visibility
    client_visible BOOLEAN DEFAULT false,
    client_can_comment BOOLEAN DEFAULT false,
    client_approval_required BOOLEAN DEFAULT false,

    -- Notifications
    notify_on_status_change BOOLEAN DEFAULT true,
    notify_on_task_completion BOOLEAN DEFAULT false,

    -- Visualization (NEW)
    color VARCHAR(7), -- Hex color
    icon VARCHAR(50),
    default_view VARCHAR(50) DEFAULT 'kanban', -- 'kanban', 'list', 'gantt', 'calendar', 'chart'

    -- Column Configuration (NEW - for typed columns)
    has_custom_columns BOOLEAN DEFAULT false,
    column_config_version INTEGER DEFAULT 1,

    -- Custom Fields
    custom_fields JSONB,

    -- Metadata
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    created_by UUID REFERENCES employees(id),
    updated_by UUID REFERENCES employees(id),
    archived_at TIMESTAMP WITH TIME ZONE,

    -- Constraints
    CONSTRAINT unique_project_number_per_tenant UNIQUE(tenant_id, project_number),
    CONSTRAINT valid_completion_percentage CHECK (completion_percentage >= 0 AND completion_percentage <= 100),
    CONSTRAINT valid_dates CHECK (due_date IS NULL OR start_date IS NULL OR due_date >= start_date)
);

-- Indexes
CREATE INDEX idx_projects_tenant ON projects(tenant_id);
CREATE INDEX idx_projects_objective ON projects(objective_id) WHERE objective_id IS NOT NULL;
CREATE INDEX idx_projects_client ON projects(client_id) WHERE client_id IS NOT NULL;
CREATE INDEX idx_projects_status ON projects(status);
CREATE INDEX idx_projects_pm ON projects(project_manager_id);
CREATE INDEX idx_projects_dates ON projects(start_date, due_date);
CREATE INDEX idx_projects_template ON projects(is_template) WHERE is_template = true;
CREATE INDEX idx_projects_team_members ON projects USING GIN(team_members);
CREATE INDEX idx_projects_tags ON projects USING GIN(tags);
CREATE INDEX idx_projects_active ON projects(tenant_id, status) WHERE status IN ('active', 'planned');
```

### 3. Column Definitions Table (NEW in v2.0)

```sql
CREATE TABLE column_definitions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,

    -- Scope (column can be defined at project or objective level)
    scope VARCHAR(20) NOT NULL, -- 'project', 'objective', 'tenant'
    project_id UUID REFERENCES projects(id) ON DELETE CASCADE,
    objective_id UUID REFERENCES objectives(id) ON DELETE CASCADE,

    -- Column Identity
    column_key VARCHAR(100) NOT NULL, -- Internal key (e.g., 'status', 'priority', 'budget')
    column_label VARCHAR(200) NOT NULL, -- Display name
    column_type VARCHAR(50) NOT NULL,
    -- Column Types:
    -- 'status', 'priority', 'person', 'people', 'date', 'timeline',
    -- 'number', 'currency', 'percentage', 'formula', 'mirror',
    -- 'text', 'long_text', 'email', 'phone', 'link', 'file',
    -- 'checkbox', 'rating', 'dropdown', 'tags', 'country',
    -- 'connect_boards', 'dependency', 'button', 'auto_number',
    -- 'creation_log', 'last_updated', 'time_tracking'

    -- Column Configuration (type-specific settings)
    config JSONB NOT NULL,
    -- Examples by type:
    -- Status: {
    --   labels: [
    --     {value: "todo", label: "To Do", color: "#c4c4c4"},
    --     {value: "in_progress", label: "In Progress", color: "#fdab3d"},
    --     {value: "done", label: "Done", color: "#00c875"}
    --   ],
    --   default: "todo"
    -- }
    -- Number: {format: "currency", currency: "USD", decimals: 2, prefix: "$"}
    -- Formula: {expression: "{Budget} - {Actual Cost}", result_type: "currency"}
    -- Mirror: {source_project_id: "uuid", source_column_id: "uuid", connect_column_id: "uuid"}
    -- People: {allow_multiple: true, restrict_to_team: false}
    -- Timeline: {show_duration: true, workdays_only: false}
    -- Dropdown: {options: [{value: "opt1", label: "Option 1", color: "#ff0000"}], allow_multiple: false}

    -- Display Settings
    width INTEGER DEFAULT 150,
    position INTEGER NOT NULL,
    is_visible BOOLEAN DEFAULT true,
    is_required BOOLEAN DEFAULT false,
    is_frozen BOOLEAN DEFAULT false, -- Freeze column in table view

    -- Permissions
    is_editable BOOLEAN DEFAULT true,
    edit_permission VARCHAR(50) DEFAULT 'everyone', -- 'everyone', 'owner', 'admins', 'pm_only'

    -- System vs Custom
    is_system_column BOOLEAN DEFAULT false, -- System columns can't be deleted

    -- Metadata
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    created_by UUID REFERENCES employees(id),

    -- Constraints
    CONSTRAINT one_scope CHECK (
        (scope = 'project' AND project_id IS NOT NULL AND objective_id IS NULL) OR
        (scope = 'objective' AND objective_id IS NOT NULL AND project_id IS NULL) OR
        (scope = 'tenant' AND project_id IS NULL AND objective_id IS NULL)
    )
);

-- Indexes
CREATE INDEX idx_column_definitions_project ON column_definitions(project_id) WHERE project_id IS NOT NULL;
CREATE INDEX idx_column_definitions_objective ON column_definitions(objective_id) WHERE objective_id IS NOT NULL;
CREATE INDEX idx_column_definitions_scope ON column_definitions(tenant_id, scope);
CREATE INDEX idx_column_definitions_type ON column_definitions(column_type);
CREATE UNIQUE INDEX idx_column_definitions_unique_key ON column_definitions(
    COALESCE(project_id::text, ''),
    COALESCE(objective_id::text, ''),
    scope,
    column_key
);
```

### 4. Tasks Table (Updated)

```sql
CREATE TABLE tasks (
    -- Identity
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    task_number VARCHAR(50) NOT NULL,

    -- Hierarchy
    parent_task_id UUID REFERENCES tasks(id) ON DELETE CASCADE,
    position INTEGER, -- For ordering within parent
    depth_level INTEGER DEFAULT 0, -- 0 = top-level task

    -- Core Information
    title VARCHAR(300) NOT NULL,
    description TEXT,
    task_type VARCHAR(50) DEFAULT 'task',
    -- 'task', 'milestone', 'deliverable', 'approval', 'review', 'meeting'

    -- Assignment
    assigned_to UUID REFERENCES employees(id),
    assigned_team_id UUID REFERENCES teams(id),
    role_required VARCHAR(100), -- 'developer', 'designer', 'qa', etc.

    -- Scheduling
    start_date DATE,
    due_date DATE,
    estimated_hours DECIMAL(8,2),
    actual_hours DECIMAL(8,2) DEFAULT 0.00,

    -- Status & Progress (can be overridden by custom status column)
    status VARCHAR(50) NOT NULL DEFAULT 'todo',
    -- 'todo', 'in_progress', 'in_review', 'blocked', 'completed', 'cancelled'
    priority VARCHAR(20) DEFAULT 'medium', -- 'low', 'medium', 'high', 'critical'
    completion_percentage DECIMAL(5,2) DEFAULT 0.00,

    -- Kanban Position
    board_column VARCHAR(50), -- For Kanban view
    board_position INTEGER, -- Position within column

    -- Time Tracking
    is_billable BOOLEAN DEFAULT true,
    billable_hours DECIMAL(8,2) DEFAULT 0.00,
    non_billable_hours DECIMAL(8,2) DEFAULT 0.00,
    hourly_rate DECIMAL(10,2), -- Override project rate if needed

    -- Dependencies
    depends_on_task_ids UUID[], -- Array of task IDs that must complete first
    blocks_task_ids UUID[], -- Tasks blocked by this task

    -- Deliverables
    has_deliverable BOOLEAN DEFAULT false,
    deliverable_type VARCHAR(50), -- 'document', 'code', 'design', 'report'
    deliverable_url TEXT,

    -- Client Interaction
    client_visible BOOLEAN DEFAULT false,
    requires_client_approval BOOLEAN DEFAULT false,
    client_approved_at TIMESTAMP WITH TIME ZONE,
    client_approved_by UUID REFERENCES contacts(id),

    -- Attachments
    attachment_count INTEGER DEFAULT 0,

    -- Checklist
    checklist_items JSONB,
    -- [{id: "uuid", text: "Item 1", completed: false, position: 0}]

    -- Recurrence
    is_recurring BOOLEAN DEFAULT false,
    recurrence_rule JSONB,
    recurrence_parent_id UUID REFERENCES tasks(id),

    -- Custom Fields (legacy - migrate to column_values)
    tags VARCHAR(50)[],
    labels VARCHAR(50)[],
    custom_fields JSONB,

    -- Metadata
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    completed_at TIMESTAMP WITH TIME ZONE,
    created_by UUID REFERENCES employees(id),
    updated_by UUID REFERENCES employees(id),

    -- Constraints
    CONSTRAINT unique_task_number_per_project UNIQUE(project_id, task_number),
    CONSTRAINT valid_completion_percentage CHECK (completion_percentage >= 0 AND completion_percentage <= 100),
    CONSTRAINT valid_dates CHECK (due_date IS NULL OR start_date IS NULL OR due_date >= start_date),
    CONSTRAINT no_self_dependency CHECK (id != ALL(depends_on_task_ids))
);

-- Indexes
CREATE INDEX idx_tasks_tenant ON tasks(tenant_id);
CREATE INDEX idx_tasks_project ON tasks(project_id);
CREATE INDEX idx_tasks_parent ON tasks(parent_task_id) WHERE parent_task_id IS NOT NULL;
CREATE INDEX idx_tasks_assigned ON tasks(assigned_to) WHERE assigned_to IS NOT NULL;
CREATE INDEX idx_tasks_status ON tasks(status);
CREATE INDEX idx_tasks_due_date ON tasks(due_date) WHERE due_date IS NOT NULL;
CREATE INDEX idx_tasks_kanban ON tasks(project_id, board_column, board_position);
CREATE INDEX idx_tasks_dependencies ON tasks USING GIN(depends_on_task_ids);
CREATE INDEX idx_tasks_tags ON tasks USING GIN(tags);
CREATE INDEX idx_tasks_completion ON tasks(project_id, status, completed_at);
```

### 5. Task Column Values Table (NEW in v2.0)

```sql
CREATE TABLE task_column_values (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    task_id UUID NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
    column_id UUID NOT NULL REFERENCES column_definitions(id) ON DELETE CASCADE,

    -- Value Storage (type-specific JSON)
    value JSONB NOT NULL,
    -- Examples by column type:
    -- Status: {"value": "in_progress", "label": "In Progress", "color": "#fdab3d"}
    -- Number: {"value": 150.50, "formatted": "$150.50"}
    -- Person: {"user_id": "uuid", "name": "John Doe", "email": "john@example.com"}
    -- People: [{"user_id": "uuid1", "name": "John"}, {"user_id": "uuid2", "name": "Jane"}]
    -- Date: {"date": "2025-01-15", "has_time": false}
    -- Timeline: {"start_date": "2025-01-15", "end_date": "2025-01-30", "duration_days": 15}
    -- Formula: {"computed_value": 45.5, "formatted": "$45.50", "last_calculated": "2025-01-15T10:30:00Z"}
    -- Checkbox: {"checked": true}
    -- Dropdown: {"value": "opt1", "label": "Option 1", "color": "#ff0000"}
    -- Tags: [{"value": "urgent", "label": "Urgent", "color": "#e44258"}]
    -- Link: {"url": "https://example.com", "text": "Example"}
    -- File: [{"file_id": "uuid", "filename": "doc.pdf", "size": 1024000}]

    -- Computed Column Cache (for formulas and mirrors)
    computed_from_task_ids UUID[], -- For tracking dependencies
    last_computed_at TIMESTAMP WITH TIME ZONE,
    needs_recompute BOOLEAN DEFAULT false,

    -- Metadata
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_by UUID REFERENCES employees(id),

    -- Constraints
    CONSTRAINT unique_task_column_value UNIQUE(task_id, column_id)
);

-- Indexes
CREATE INDEX idx_task_column_values_task ON task_column_values(task_id);
CREATE INDEX idx_task_column_values_column ON task_column_values(column_id);
CREATE INDEX idx_task_column_values_value ON task_column_values USING GIN(value);
CREATE INDEX idx_task_column_values_needs_recompute ON task_column_values(needs_recompute) WHERE needs_recompute = true;
CREATE INDEX idx_task_column_values_computed_deps ON task_column_values USING GIN(computed_from_task_ids) WHERE computed_from_task_ids IS NOT NULL;
```

### 6. Dashboards Table (NEW in v2.0)

```sql
CREATE TABLE dashboards (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,

    -- Scope
    scope VARCHAR(20) NOT NULL, -- 'objective', 'tenant', 'personal'
    objective_id UUID REFERENCES objectives(id) ON DELETE CASCADE,

    -- Dashboard Info
    name VARCHAR(200) NOT NULL,
    description TEXT,

    -- Layout Configuration
    layout_type VARCHAR(50) DEFAULT 'grid', -- 'grid', 'flex', 'custom'
    layout_config JSONB,
    -- { rows: 12, cols: 12, gap: 16, responsive_breakpoints: {...} }

    -- Widget Limit
    widget_count INTEGER DEFAULT 0,
    max_widgets INTEGER DEFAULT 30, -- Monday.com limit

    -- Access Control
    visibility VARCHAR(50) DEFAULT 'workspace', -- 'private', 'workspace', 'team', 'public'
    owner_id UUID REFERENCES employees(id),
    shared_with_users UUID[], -- Array of employee IDs
    shared_with_teams UUID[], -- Array of team IDs

    -- Dashboard Settings
    auto_refresh_enabled BOOLEAN DEFAULT true,
    refresh_interval_seconds INTEGER DEFAULT 300, -- 5 minutes

    -- Metadata
    is_default BOOLEAN DEFAULT false,
    is_template BOOLEAN DEFAULT false,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    created_by UUID REFERENCES employees(id),
    last_viewed_at TIMESTAMP WITH TIME ZONE,
    view_count INTEGER DEFAULT 0,

    -- Constraints
    CONSTRAINT valid_scope CHECK (
        (scope = 'objective' AND objective_id IS NOT NULL) OR
        (scope = 'tenant' AND objective_id IS NULL) OR
        (scope = 'personal' AND objective_id IS NULL)
    ),
    CONSTRAINT valid_widget_limit CHECK (widget_count <= max_widgets)
);

-- Indexes
CREATE INDEX idx_dashboards_tenant ON dashboards(tenant_id);
CREATE INDEX idx_dashboards_objective ON dashboards(objective_id) WHERE objective_id IS NOT NULL;
CREATE INDEX idx_dashboards_owner ON dashboards(owner_id);
CREATE INDEX idx_dashboards_visibility ON dashboards(tenant_id, visibility);
CREATE INDEX idx_dashboards_shared_users ON dashboards USING GIN(shared_with_users);
```

### 7. Dashboard Widgets Table (NEW in v2.0)

```sql
CREATE TABLE dashboard_widgets (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    dashboard_id UUID NOT NULL REFERENCES dashboards(id) ON DELETE CASCADE,
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,

    -- Widget Type
    widget_type VARCHAR(50) NOT NULL,
    -- Widget Types:
    -- 'chart' (bar, line, pie, area, column)
    -- 'number' (single metric with comparison)
    -- 'table' (data table)
    -- 'gantt' (timeline)
    -- 'calendar' (calendar view)
    -- 'battery' (progress indicator)
    -- 'workload' (team capacity)
    -- 'timeline' (project timeline)
    -- 'text' (free-form text, doesn't count toward limit)
    -- 'kpi_card' (key performance indicator)
    -- 'funnel' (conversion funnel)
    -- 'gauge' (gauge/speedometer)

    -- Data Sources
    data_sources JSONB NOT NULL,
    -- {
    --   type: "projects" | "tasks" | "time_entries" | "custom_query",
    --   project_ids: ["uuid1", "uuid2"],
    --   objective_ids: ["uuid3"],
    --   filters: {status: ["active", "planned"], ...},
    --   date_range: {type: "last_30_days" | "this_month" | "custom", start: "...", end: "..."}
    -- }

    -- Widget Configuration
    config JSONB NOT NULL,
    -- Examples by widget type:
    -- Chart: {
    --   chart_type: "bar" | "line" | "pie" | "area" | "column",
    --   group_by: "status" | "assigned_to" | "priority",
    --   aggregate: "count" | "sum" | "average" | "min" | "max",
    --   aggregate_column: "estimated_hours",
    --   colors: ["#00c875", "#fdab3d", "#e44258"],
    --   show_legend: true,
    --   show_data_labels: false
    -- }
    -- Number: {
    --   metric: "total_active_projects" | "budget_utilization" | "hours_logged",
    --   comparison_period: "last_week" | "last_month" | "last_year",
    --   show_trend: true,
    --   format: "number" | "currency" | "percentage",
    --   currency: "USD"
    -- }
    -- Table: {
    --   columns: ["name", "status", "due_date", "completion_percentage"],
    --   sort_by: "due_date",
    --   sort_order: "asc" | "desc",
    --   max_rows: 10
    -- }

    -- Layout
    position_x INTEGER NOT NULL,
    position_y INTEGER NOT NULL,
    width INTEGER NOT NULL DEFAULT 4, -- Grid columns
    height INTEGER NOT NULL DEFAULT 3, -- Grid rows

    -- Widget Settings
    title VARCHAR(200),
    show_title BOOLEAN DEFAULT true,
    is_text_widget BOOLEAN DEFAULT false, -- Text widgets don't count toward 30-widget limit

    -- Caching
    cache_enabled BOOLEAN DEFAULT true,
    cached_data JSONB,
    cached_at TIMESTAMP WITH TIME ZONE,
    cache_ttl_seconds INTEGER DEFAULT 300,

    -- Metadata
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    created_by UUID REFERENCES employees(id)
);

-- Indexes
CREATE INDEX idx_dashboard_widgets_dashboard ON dashboard_widgets(dashboard_id);
CREATE INDEX idx_dashboard_widgets_type ON dashboard_widgets(widget_type);
CREATE INDEX idx_dashboard_widgets_data_sources ON dashboard_widgets USING GIN(data_sources);
CREATE INDEX idx_dashboard_widgets_position ON dashboard_widgets(dashboard_id, position_x, position_y);
```

### 8. Automations Table (NEW in v2.0)

```sql
CREATE TABLE automations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,

    -- Scope
    scope VARCHAR(50) NOT NULL, -- 'project', 'objective', 'tenant'
    project_id UUID REFERENCES projects(id) ON DELETE CASCADE,
    objective_id UUID REFERENCES objectives(id) ON DELETE CASCADE,

    -- Automation Details
    name VARCHAR(200) NOT NULL,
    description TEXT,

    -- Trigger Definition
    trigger JSONB NOT NULL,
    -- Examples:
    -- {
    --   type: "column_change",
    --   column_id: "uuid",
    --   from_value: "in_progress",
    --   to_value: "done"
    -- }
    -- {
    --   type: "date_arrives",
    --   column_id: "uuid",
    --   offset_days: -1,
    --   time: "09:00"
    -- }
    -- {
    --   type: "task_created"
    -- }
    -- {
    --   type: "schedule",
    --   frequency: "daily" | "weekly" | "monthly",
    --   time: "09:00",
    --   day_of_week: "monday",
    --   day_of_month: 1
    -- }

    -- Conditions (AND logic)
    conditions JSONB,
    -- [
    --   {column_id: "uuid", operator: "equals", value: "high"},
    --   {column_id: "uuid2", operator: "greater_than", value: 100}
    -- ]

    -- Actions (executed in order)
    actions JSONB NOT NULL,
    -- [
    --   {
    --     type: "notify_person",
    --     user_id: "uuid",
    --     message: "Task completed: {task_name}"
    --   },
    --   {
    --     type: "update_column",
    --     column_id: "uuid",
    --     value: "approved"
    --   },
    --   {
    --     type: "move_to_group",
    --     group_id: "completed"
    --   },
    --   {
    --     type: "create_task",
    --     task_template: {...}
    --   },
    --   {
    --     type: "send_email",
    --     to: "client@example.com",
    --     subject: "Project Update",
    --     body: "..."
    --   }
    -- ]

    -- Action Delays
    action_delays JSONB,
    -- [{action_index: 1, delay_minutes: 60}]

    -- Status
    is_active BOOLEAN DEFAULT true,
    execution_count INTEGER DEFAULT 0,
    last_executed_at TIMESTAMP WITH TIME ZONE,
    last_error TEXT,

    -- AI Generation
    suggested_by_ai BOOLEAN DEFAULT false,
    ai_confidence DECIMAL(5,2),
    created_from_natural_language TEXT,

    -- Execution Limits (prevent runaway automations)
    max_executions_per_hour INTEGER DEFAULT 100,
    current_hour_executions INTEGER DEFAULT 0,
    current_hour_start TIMESTAMP WITH TIME ZONE,

    -- Metadata
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    created_by UUID REFERENCES employees(id),

    -- Constraints
    CONSTRAINT valid_scope CHECK (
        (scope = 'project' AND project_id IS NOT NULL AND objective_id IS NULL) OR
        (scope = 'objective' AND objective_id IS NOT NULL AND project_id IS NULL) OR
        (scope = 'tenant' AND project_id IS NULL AND objective_id IS NULL)
    )
);

-- Indexes
CREATE INDEX idx_automations_tenant ON automations(tenant_id);
CREATE INDEX idx_automations_project ON automations(project_id) WHERE project_id IS NOT NULL;
CREATE INDEX idx_automations_objective ON automations(objective_id) WHERE objective_id IS NOT NULL;
CREATE INDEX idx_automations_active ON automations(is_active, tenant_id) WHERE is_active = true;
CREATE INDEX idx_automations_trigger ON automations USING GIN(trigger);
```

### 9. Automation Execution Log Table (NEW in v2.0)

```sql
CREATE TABLE automation_executions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    automation_id UUID NOT NULL REFERENCES automations(id) ON DELETE CASCADE,
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,

    -- Execution Context
    triggered_by VARCHAR(50) NOT NULL, -- 'system', 'user', 'schedule', 'webhook'
    triggered_by_user_id UUID REFERENCES employees(id),
    entity_type VARCHAR(50) NOT NULL, -- 'task', 'project', 'objective'
    entity_id UUID NOT NULL,

    -- Trigger Data
    trigger_data JSONB,
    -- Snapshot of the data that triggered the automation

    -- Execution Results
    status VARCHAR(50) NOT NULL, -- 'success', 'failed', 'partial', 'skipped'
    actions_executed INTEGER DEFAULT 0,
    actions_failed INTEGER DEFAULT 0,
    error_message TEXT,
    error_stack TEXT,
    execution_time_ms INTEGER,

    -- Action Results
    action_results JSONB,
    -- [{action_index: 0, status: "success", result: {...}}, ...]

    -- Metadata
    executed_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    completed_at TIMESTAMP WITH TIME ZONE
);

-- Indexes
CREATE INDEX idx_automation_executions_automation ON automation_executions(automation_id);
CREATE INDEX idx_automation_executions_entity ON automation_executions(entity_type, entity_id);
CREATE INDEX idx_automation_executions_executed_at ON automation_executions(executed_at DESC);
CREATE INDEX idx_automation_executions_status ON automation_executions(status, automation_id);

-- Partition by month for performance
-- CREATE TABLE automation_executions_2025_01 PARTITION OF automation_executions
-- FOR VALUES FROM ('2025-01-01') TO ('2025-02-01');
```

### 10. Supporting Tables (from v1.0, unchanged)

```sql
-- Task Comments & Activity
CREATE TABLE task_comments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    task_id UUID NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
    project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,

    comment_type VARCHAR(50) DEFAULT 'comment',
    -- 'comment', 'status_change', 'assignment_change', 'file_upload', 'approval_request'
    content TEXT,

    author_type VARCHAR(20) NOT NULL, -- 'employee', 'client', 'system'
    author_employee_id UUID REFERENCES employees(id),
    author_client_id UUID REFERENCES contacts(id),

    mentioned_users UUID[],
    attachment_ids UUID[],
    parent_comment_id UUID REFERENCES task_comments(id),

    is_internal BOOLEAN DEFAULT false,
    is_pinned BOOLEAN DEFAULT false,

    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    edited_at TIMESTAMP WITH TIME ZONE,
    deleted_at TIMESTAMP WITH TIME ZONE
);

CREATE INDEX idx_task_comments_task ON task_comments(task_id);
CREATE INDEX idx_task_comments_project ON task_comments(project_id);

-- Project Templates
CREATE TABLE project_templates (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,

    name VARCHAR(200) NOT NULL,
    description TEXT,
    category VARCHAR(100),

    template_data JSONB NOT NULL,
    -- Stores: project settings, task list, column definitions, automations

    is_public BOOLEAN DEFAULT false,
    use_count INTEGER DEFAULT 0,

    estimated_duration_days INTEGER,
    estimated_hours DECIMAL(10,2),
    estimated_budget DECIMAL(15,2),

    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    created_by UUID REFERENCES employees(id)
);

CREATE INDEX idx_project_templates_tenant ON project_templates(tenant_id);
CREATE INDEX idx_project_templates_category ON project_templates(category);

-- Task Time Entries
CREATE TABLE task_time_entries (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    task_id UUID NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
    project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    employee_id UUID NOT NULL REFERENCES employees(id),

    start_time TIMESTAMP WITH TIME ZONE NOT NULL,
    end_time TIMESTAMP WITH TIME ZONE,
    duration_minutes INTEGER,

    is_manual_entry BOOLEAN DEFAULT false,
    entry_date DATE NOT NULL,
    hours DECIMAL(8,2),

    is_billable BOOLEAN DEFAULT true,
    hourly_rate DECIMAL(10,2),
    amount DECIMAL(10,2),

    notes TEXT,

    status VARCHAR(20) DEFAULT 'draft',
    -- 'draft', 'submitted', 'approved', 'rejected', 'billed'
    approved_by UUID REFERENCES employees(id),
    approved_at TIMESTAMP WITH TIME ZONE,

    invoice_id UUID REFERENCES invoices(id),
    invoice_line_item_id UUID,

    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_task_time_entries_task ON task_time_entries(task_id);
CREATE INDEX idx_task_time_entries_project ON task_time_entries(project_id);
CREATE INDEX idx_task_time_entries_employee ON task_time_entries(employee_id);
CREATE INDEX idx_task_time_entries_date ON task_time_entries(entry_date);

-- Task Attachments
CREATE TABLE task_attachments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    task_id UUID REFERENCES tasks(id) ON DELETE CASCADE,
    project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,

    file_name VARCHAR(500) NOT NULL,
    file_path TEXT NOT NULL,
    file_size_bytes BIGINT,
    file_type VARCHAR(100),
    file_extension VARCHAR(20),

    attachment_type VARCHAR(50),

    version_number INTEGER DEFAULT 1,
    parent_attachment_id UUID REFERENCES task_attachments(id),
    is_latest_version BOOLEAN DEFAULT true,

    client_visible BOOLEAN DEFAULT false,
    requires_approval BOOLEAN DEFAULT false,

    uploaded_by UUID REFERENCES employees(id),
    uploaded_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    description TEXT
);

CREATE INDEX idx_task_attachments_task ON task_attachments(task_id);
CREATE INDEX idx_task_attachments_project ON task_attachments(project_id);
```

---

## Column Type System

### Standard Column Types

#### 1. Status Column
**Purpose:** Visual workflow states with colors

**Configuration:**
```json
{
  "labels": [
    {"value": "todo", "label": "To Do", "color": "#c4c4c4"},
    {"value": "in_progress", "label": "In Progress", "color": "#fdab3d"},
    {"value": "in_review", "label": "In Review", "color": "#9cd326"},
    {"value": "blocked", "label": "Blocked", "color": "#e44258"},
    {"value": "done", "label": "Done", "color": "#00c875"}
  ],
  "default": "todo",
  "allow_custom": false
}
```

**Value Format:**
```json
{
  "value": "in_progress",
  "label": "In Progress",
  "color": "#fdab3d"
}
```

**Use Cases:**
- Task status tracking
- Priority levels (Low, Medium, High, Critical)
- Approval status (Pending, Approved, Rejected)
- Health indicators (On Track, At Risk, Blocked)

#### 2. Person/People Column
**Purpose:** Assign team members

**Configuration:**
```json
{
  "allow_multiple": false,
  "restrict_to_team": true,
  "restrict_to_department": null,
  "show_avatars": true,
  "notify_on_assignment": true
}
```

**Value Format (Single Person):**
```json
{
  "user_id": "uuid",
  "name": "John Doe",
  "email": "john@example.com",
  "avatar_url": "https://..."
}
```

**Value Format (Multiple People):**
```json
[
  {"user_id": "uuid1", "name": "John Doe"},
  {"user_id": "uuid2", "name": "Jane Smith"}
]
```

#### 3. Date Column
**Purpose:** Single date picker

**Configuration:**
```json
{
  "include_time": false,
  "allow_past_dates": true,
  "default_to_today": false,
  "reminder_enabled": true,
  "reminder_days_before": 1
}
```

**Value Format:**
```json
{
  "date": "2025-01-15",
  "has_time": false,
  "time": null,
  "timezone": null
}
```

#### 4. Timeline Column
**Purpose:** Date range with duration

**Configuration:**
```json
{
  "show_duration": true,
  "workdays_only": false,
  "auto_calculate_duration": true,
  "allow_overlap": true
}
```

**Value Format:**
```json
{
  "start_date": "2025-01-15",
  "end_date": "2025-01-30",
  "duration_days": 15,
  "workdays_count": 11
}
```

#### 5. Number Column
**Purpose:** Numeric values with formatting

**Configuration:**
```json
{
  "format": "number",  // 'number', 'currency', 'percentage', 'decimal'
  "currency": "USD",
  "decimals": 2,
  "prefix": "$",
  "suffix": "",
  "thousand_separator": ",",
  "min_value": null,
  "max_value": null,
  "allow_negative": false
}
```

**Value Format:**
```json
{
  "value": 1500.50,
  "formatted": "$1,500.50"
}
```

#### 6. Formula Column ⭐
**Purpose:** Calculate values from other columns

**Configuration:**
```json
{
  "expression": "{Budgeted Amount} - {Actual Cost}",
  "result_type": "currency",  // 'number', 'currency', 'percentage', 'text', 'date'
  "currency": "USD",
  "decimals": 2,
  "auto_recalculate": true,
  "dependent_column_ids": ["uuid1", "uuid2"]
}
```

**Supported Functions:**
- Math: `+`, `-`, `*`, `/`, `SUM()`, `AVERAGE()`, `MIN()`, `MAX()`, `ROUND()`, `ABS()`
- Logic: `IF()`, `AND()`, `OR()`, `NOT()`
- Text: `CONCATENATE()`, `TEXT()`, `UPPER()`, `LOWER()`, `LEN()`
- Date: `DAYS()`, `WORKDAYS()`, `TODAY()`, `DATEADD()`, `DATEDIFF()`

**Example Formulas for Service Providers:**
```javascript
// Budget Remaining
"{Budgeted Amount} - {Actual Cost}"

// Profit Margin %
"({Budgeted Amount} - {Actual Cost}) / {Budgeted Amount} * 100"

// Days Until Deadline
"DAYS({Due Date}, TODAY())"

// Budget Health Status
"IF({Actual Cost} > {Budgeted Amount} * 0.9, 'Over Budget', 'On Track')"

// Utilization Rate
"{Billable Hours} / {Total Hours} * 100"

// Hourly Rate Achieved
"{Actual Revenue} / {Billable Hours}"
```

**Value Format:**
```json
{
  "computed_value": 450.75,
  "formatted": "$450.75",
  "last_calculated": "2025-01-15T10:30:00Z",
  "expression": "{Budgeted Amount} - {Actual Cost}",
  "depends_on": ["uuid1", "uuid2"]
}
```

#### 7. Mirror Column ⭐
**Purpose:** Reference data from connected projects/tasks

**Configuration:**
```json
{
  "source_project_id": "uuid",
  "source_column_id": "uuid",
  "connect_column_id": "uuid",  // The "Connect Boards" column linking the items
  "aggregation": null  // null, 'sum', 'average', 'count', 'min', 'max'
}
```

**Use Cases for Service Providers:**
- Mirror client industry from Clients to Projects
- Mirror project budget to Tasks
- Mirror proposal scope to Project
- Mirror contract terms to Project

**Value Format:**
```json
{
  "mirrored_value": "Technology",
  "source_task_id": "uuid",
  "source_column_id": "uuid",
  "last_synced": "2025-01-15T10:30:00Z"
}
```

#### 8. Connect Boards Column ⭐
**Purpose:** Link items across projects

**Configuration:**
```json
{
  "target_project_ids": ["uuid1", "uuid2"],  // null = any project
  "allow_multiple": true,
  "bidirectional": false,
  "auto_create_backlink": true
}
```

**Value Format:**
```json
[
  {
    "task_id": "uuid1",
    "project_id": "uuid_proj",
    "task_title": "Related Task",
    "task_number": "PROJ-123"
  }
]
```

#### 9. Dropdown Column
**Purpose:** Select from predefined options

**Configuration:**
```json
{
  "options": [
    {"value": "consulting", "label": "Consulting", "color": "#0073ea"},
    {"value": "development", "label": "Development", "color": "#00c875"},
    {"value": "design", "label": "Design", "color": "#fdab3d"}
  ],
  "allow_multiple": false,
  "allow_custom": false,
  "default_value": null
}
```

#### 10. Other Column Types

**Text:** Short text entries (single line)
**Long Text:** Multi-line descriptions
**Email:** Email addresses with validation
**Phone:** Phone numbers with formatting
**Link:** URLs with clickable links
**File:** File attachments (handled separately via task_attachments)
**Checkbox:** Boolean yes/no
**Rating:** Star ratings (1-5)
**Tags:** Multi-select labels with colors
**Country:** Country selector with flags
**Button:** Action trigger (executes automation)
**Auto Number:** Sequential numbering (PROJ-001, PROJ-002)
**Creation Log:** Auto-filled creator and timestamp
**Last Updated:** Auto-filled last editor and timestamp
**Time Tracking:** Log hours worked (integrates with time entries)
**Dependency:** Task dependencies (uses depends_on_task_ids)

### System vs Custom Columns

**System Columns (cannot be deleted):**
- Task Name/Title
- Status
- Assigned To
- Due Date
- Priority

**Custom Columns:**
- Added per project or objective
- Can be reordered, hidden, or deleted
- Stored in column_definitions table

---

## API Endpoints

### Objectives

```
GET    /api/objectives                          # List all objectives
GET    /api/objectives/:id                      # Get objective details
POST   /api/objectives                          # Create objective
PUT    /api/objectives/:id                      # Update objective
DELETE /api/objectives/:id                      # Delete/archive objective
PATCH  /api/objectives/:id/status               # Update status

# Objective Projects
GET    /api/objectives/:id/projects             # List projects in objective
POST   /api/objectives/:id/projects             # Create project in objective

# Objective Metrics
GET    /api/objectives/:id/metrics              # KPI summary
GET    /api/objectives/:id/rollup               # Rollup from all projects

# Objective Team
POST   /api/objectives/:id/team-members         # Add team member
DELETE /api/objectives/:id/team-members/:userId # Remove team member
```

### Projects

```
GET    /api/projects                            # List all projects
GET    /api/projects/:id                        # Get project details
POST   /api/projects                            # Create project
PUT    /api/projects/:id                        # Update project
DELETE /api/projects/:id                        # Delete/archive project
PATCH  /api/projects/:id/status                 # Update project status
POST   /api/projects/from-template/:templateId  # Create from template
POST   /api/projects/:id/duplicate              # Duplicate project

# Project Views
GET    /api/projects/:id/views/kanban           # Kanban board data
GET    /api/projects/:id/views/gantt            # Gantt chart data
GET    /api/projects/:id/views/calendar         # Calendar view data
GET    /api/projects/:id/views/timeline         # Timeline view data
GET    /api/projects/:id/views/workload         # Workload view data
GET    /api/projects/:id/views/chart            # Chart view data

# Project Team
POST   /api/projects/:id/team-members           # Add team member
DELETE /api/projects/:id/team-members/:userId   # Remove team member

# Project Metrics
GET    /api/projects/:id/budget-summary         # Budget vs actual
GET    /api/projects/:id/time-summary           # Time tracking summary
GET    /api/projects/:id/progress               # Completion metrics
```

### Tasks

```
GET    /api/projects/:projectId/tasks           # List project tasks
GET    /api/tasks/:id                           # Get task details
POST   /api/projects/:projectId/tasks           # Create task
PUT    /api/tasks/:id                           # Update task
DELETE /api/tasks/:id                           # Delete task
PATCH  /api/tasks/:id/status                    # Update task status
PATCH  /api/tasks/:id/assign                    # Assign task
POST   /api/tasks/:id/move                      # Move to different project

# Subtasks
POST   /api/tasks/:id/subtasks                  # Create subtask
GET    /api/tasks/:id/subtasks                  # List subtasks

# Task Actions
POST   /api/tasks/:id/start-timer               # Start time tracking
POST   /api/tasks/:id/stop-timer                # Stop time tracking
POST   /api/tasks/:id/complete                  # Mark complete
POST   /api/tasks/:id/approve                   # Client approval

# Dependencies
POST   /api/tasks/:id/dependencies              # Add dependency
DELETE /api/tasks/:id/dependencies/:depId       # Remove dependency
GET    /api/tasks/:id/critical-path             # Get critical path

# Comments
GET    /api/tasks/:id/comments                  # Get comments
POST   /api/tasks/:id/comments                  # Add comment
PUT    /api/comments/:id                        # Edit comment
DELETE /api/comments/:id                        # Delete comment

# Bulk Operations
POST   /api/tasks/bulk-update                   # Update multiple tasks
POST   /api/tasks/bulk-delete                   # Delete multiple tasks
POST   /api/tasks/bulk-assign                   # Assign multiple tasks
```

### Column Definitions (NEW)

```
GET    /api/projects/:projectId/columns         # List project columns
GET    /api/objectives/:objectiveId/columns     # List objective columns
POST   /api/projects/:projectId/columns         # Create custom column
PUT    /api/columns/:id                         # Update column
DELETE /api/columns/:id                         # Delete column
PATCH  /api/columns/:id/reorder                 # Reorder columns
PATCH  /api/columns/:id/visibility              # Show/hide column

# Column Types
GET    /api/column-types                        # List available column types
GET    /api/column-types/:type/schema           # Get column type schema
```

### Task Column Values (NEW)

```
GET    /api/tasks/:taskId/column-values         # Get all column values
GET    /api/tasks/:taskId/columns/:columnId     # Get specific column value
PUT    /api/tasks/:taskId/columns/:columnId     # Update column value
POST   /api/tasks/bulk-update-column            # Bulk update column values

# Formula Columns
POST   /api/columns/:id/recalculate             # Force recalculation
GET    /api/columns/:id/dependencies            # Get formula dependencies
```

### Dashboards (NEW)

```
GET    /api/dashboards                          # List dashboards
GET    /api/dashboards/:id                      # Get dashboard
POST   /api/dashboards                          # Create dashboard
PUT    /api/dashboards/:id                      # Update dashboard
DELETE /api/dashboards/:id                      # Delete dashboard

# Dashboard Widgets
GET    /api/dashboards/:id/widgets              # List widgets
POST   /api/dashboards/:id/widgets              # Add widget
PUT    /api/widgets/:id                         # Update widget
DELETE /api/widgets/:id                         # Delete widget
PATCH  /api/widgets/:id/position                # Move widget
POST   /api/widgets/:id/refresh                 # Refresh widget data

# Dashboard Sharing
POST   /api/dashboards/:id/share                # Share dashboard
DELETE /api/dashboards/:id/share/:userId        # Unshare

# Widget Data
GET    /api/widgets/:id/data                    # Get widget data
POST   /api/widgets/:id/export                  # Export widget data (CSV, PDF)
```

### Automations (NEW)

```
GET    /api/automations                         # List automations
GET    /api/automations/:id                     # Get automation
POST   /api/automations                         # Create automation
PUT    /api/automations/:id                     # Update automation
DELETE /api/automations/:id                     # Delete automation
PATCH  /api/automations/:id/toggle              # Enable/disable

# Automation Testing
POST   /api/automations/:id/test                # Test automation
POST   /api/automations/:id/execute             # Manual execution

# Automation Execution Log
GET    /api/automations/:id/executions          # Execution history
GET    /api/automation-executions/:id           # Execution details

# AI Suggestions
GET    /api/projects/:projectId/automation-suggestions  # Get AI suggestions
POST   /api/automation-suggestions/:id/accept   # Accept suggestion
```

### Templates

```
GET    /api/project-templates                   # List templates
GET    /api/project-templates/:id               # Get template
POST   /api/project-templates                   # Create template
PUT    /api/project-templates/:id               # Update template
DELETE /api/project-templates/:id               # Delete template
POST   /api/projects/:id/save-as-template       # Save project as template
```

### Attachments

```
POST   /api/tasks/:id/attachments               # Upload file
GET    /api/tasks/:id/attachments               # List files
GET    /api/attachments/:id/download            # Download file
DELETE /api/attachments/:id                     # Delete file
POST   /api/attachments/:id/new-version         # Upload new version
```

---

## Automation Engine

### Trigger Types

#### Column-Based Triggers
```json
{
  "type": "column_change",
  "column_id": "uuid",
  "from_value": "in_progress",
  "to_value": "done"
}
```

#### Date-Based Triggers
```json
{
  "type": "date_arrives",
  "column_id": "uuid",  // Date or Timeline column
  "offset_days": -1,    // -1 = day before, 0 = on date, 1 = day after
  "time": "09:00"
}
```

#### Event-Based Triggers
```json
{
  "type": "task_created"
}
```
```json
{
  "type": "task_assigned",
  "assigned_to_column_id": "uuid"
}
```

#### Schedule-Based Triggers
```json
{
  "type": "schedule",
  "frequency": "weekly",
  "day_of_week": "monday",
  "time": "09:00"
}
```

### Action Types

#### Update Actions
```json
{
  "type": "update_column",
  "column_id": "uuid",
  "value": {"value": "approved", "label": "Approved", "color": "#00c875"}
}
```

#### Notification Actions
```json
{
  "type": "notify_person",
  "user_id": "uuid",
  "message": "Task '{task_name}' is now {status}"
}
```

```json
{
  "type": "send_email",
  "to": "{assigned_to.email}",
  "subject": "Task Assigned: {task_name}",
  "body": "You've been assigned to {task_name} due on {due_date}",
  "include_task_link": true
}
```

#### Task Creation Actions
```json
{
  "type": "create_task",
  "project_id": "uuid",
  "task_template": {
    "title": "Follow-up: {original_task_name}",
    "assigned_to": "{project_manager_id}",
    "due_date_offset_days": 7
  }
}
```

#### Movement Actions
```json
{
  "type": "move_to_project",
  "target_project_id": "uuid",
  "preserve_links": true
}
```

### Common Automation Recipes for Service Providers

#### 1. Late Task Escalation
```json
{
  "name": "Escalate Overdue Tasks",
  "trigger": {
    "type": "schedule",
    "frequency": "daily",
    "time": "09:00"
  },
  "conditions": [
    {"column": "status", "operator": "not_equals", "value": "done"},
    {"column": "due_date", "operator": "less_than", "value": "TODAY()"}
  ],
  "actions": [
    {
      "type": "update_column",
      "column_id": "priority_column_id",
      "value": "high"
    },
    {
      "type": "notify_person",
      "user_id": "{project_manager_id}",
      "message": "Task '{task_name}' is overdue"
    }
  ]
}
```

#### 2. Client Approval Notification
```json
{
  "name": "Request Client Approval",
  "trigger": {
    "type": "column_change",
    "column_id": "status_column_id",
    "to_value": "ready_for_review"
  },
  "actions": [
    {
      "type": "send_email",
      "to": "{client_email}",
      "subject": "Deliverable Ready for Review",
      "body": "Please review and approve: {task_name}"
    },
    {
      "type": "update_column",
      "column_id": "approval_status_column_id",
      "value": "pending"
    }
  ]
}
```

#### 3. Budget Alert
```json
{
  "name": "Budget Threshold Alert",
  "trigger": {
    "type": "column_change",
    "column_id": "actual_cost_column_id"
  },
  "conditions": [
    {
      "formula": "{Actual Cost} / {Budgeted Amount}",
      "operator": "greater_than",
      "value": 0.8
    }
  ],
  "actions": [
    {
      "type": "notify_person",
      "user_id": "{project_manager_id}",
      "message": "Project '{project_name}' has used 80% of budget"
    },
    {
      "type": "update_column",
      "column_id": "health_status_column_id",
      "value": "at_risk"
    }
  ]
}
```

#### 4. Weekly Time Entry Reminder
```json
{
  "name": "Weekly Timesheet Reminder",
  "trigger": {
    "type": "schedule",
    "frequency": "weekly",
    "day_of_week": "friday",
    "time": "16:00"
  },
  "actions": [
    {
      "type": "notify_team",
      "team_id": "{project_team}",
      "message": "Please submit your timesheets for this week"
    }
  ]
}
```

---

## Dashboards & Widgets

### Dashboard Layout System

**Grid System:**
- 12 columns x 12 rows
- Widgets can span multiple cells
- Responsive breakpoints for mobile/tablet
- Drag-and-drop repositioning

### Widget Types

#### 1. Chart Widget

**Configuration:**
```json
{
  "widget_type": "chart",
  "config": {
    "chart_type": "bar",  // 'bar', 'line', 'pie', 'area', 'column', 'donut'
    "data_source": {
      "type": "tasks",
      "project_ids": ["uuid1", "uuid2"],
      "filters": {"status": ["active", "in_progress"]}
    },
    "group_by": "status",
    "aggregate": "count",
    "colors": ["#00c875", "#fdab3d", "#e44258"],
    "show_legend": true,
    "show_data_labels": true
  }
}
```

**Examples for Service Providers:**
- Tasks by Status (bar chart)
- Budget vs Actual by Project (column chart)
- Time Distribution by Team Member (pie chart)
- Revenue Trend Over Time (line chart)

#### 2. Number Widget

**Configuration:**
```json
{
  "widget_type": "number",
  "config": {
    "metric": "total_active_projects",
    "data_source": {
      "type": "projects",
      "filters": {"status": "active"}
    },
    "comparison_period": "last_month",
    "show_trend": true,
    "format": "number",
    "icon": "📊"
  }
}
```

**Metrics for Service Providers:**
- Total Active Projects
- Budget Utilization %
- Hours Logged This Week
- Revenue This Month
- Client Satisfaction Score
- On-Time Delivery Rate

#### 3. Table Widget

**Configuration:**
```json
{
  "widget_type": "table",
  "config": {
    "data_source": {
      "type": "tasks",
      "project_ids": null,  // All projects
      "filters": {"status": "blocked"}
    },
    "columns": ["task_name", "project", "assigned_to", "blocked_reason", "due_date"],
    "sort_by": "due_date",
    "sort_order": "asc",
    "max_rows": 10,
    "show_pagination": true
  }
}
```

#### 4. Gantt Widget

Shows timeline visualization across multiple projects.

#### 5. Workload Widget

**Configuration:**
```json
{
  "widget_type": "workload",
  "config": {
    "data_source": {
      "type": "time_entries",
      "date_range": "this_week",
      "team_members": ["uuid1", "uuid2"]
    },
    "group_by": "employee",
    "capacity_hours_per_week": 40,
    "show_capacity_line": true,
    "highlight_overallocation": true
  }
}
```

#### 6. KPI Card Widget

**Configuration:**
```json
{
  "widget_type": "kpi_card",
  "config": {
    "kpi_name": "Profit Margin",
    "formula": "({Total Revenue} - {Total Cost}) / {Total Revenue} * 100",
    "target_value": 30,
    "actual_value": 28.5,
    "format": "percentage",
    "trend": "up",
    "trend_value": 2.3
  }
}
```

### Pre-built Dashboard Templates

#### Executive Dashboard
- Total Active Projects (number widget)
- Revenue This Quarter (number widget)
- Project Health Overview (pie chart)
- Top 10 Projects by Budget (table widget)
- Team Workload (workload widget)
- Profit Margin Trend (line chart)

#### Project Manager Dashboard
- My Projects Status (bar chart)
- Tasks Due This Week (table widget)
- Budget Utilization by Project (column chart)
- Blocked Tasks (table widget)
- Team Capacity (workload widget)

#### Client Dashboard
- Project Progress (battery widget)
- Upcoming Milestones (timeline widget)
- Recent Deliverables (table widget)
- Hours Logged This Month (number widget)

---

## Views & Visualizations

### 1. Kanban View

**Features:**
- Drag-and-drop between columns
- Customizable columns (based on Status column)
- Swimlanes (group by assignee, priority, etc.)
- WIP limits per column
- Card customization (show specific columns)

**Configuration:**
```json
{
  "view_type": "kanban",
  "group_by_column_id": "status_column_id",
  "swimlanes": {
    "enabled": true,
    "group_by": "assigned_to"
  },
  "card_fields": ["task_number", "due_date", "assigned_to", "priority"],
  "wip_limits": {
    "in_progress": 5,
    "in_review": 3
  }
}
```

### 2. List View

**Features:**
- Spreadsheet-like table
- Inline editing
- Multi-column sorting
- Advanced filtering
- Grouping and collapsing
- Column reordering and resizing

**Configuration:**
```json
{
  "view_type": "list",
  "visible_columns": ["task_name", "status", "assigned_to", "due_date", "priority"],
  "sort_by": [
    {"column_id": "priority_column_id", "order": "desc"},
    {"column_id": "due_date_column_id", "order": "asc"}
  ],
  "group_by": "status",
  "filters": {
    "status": {"operator": "in", "values": ["todo", "in_progress"]},
    "assigned_to": {"operator": "is_empty", "value": false}
  }
}
```

### 3. Gantt/Timeline View

**Features:**
- Timeline bars with dependencies
- Critical path highlighting
- Baseline comparison
- Drag to adjust dates
- Milestone markers
- Resource loading indicators

**Configuration:**
```json
{
  "view_type": "gantt",
  "timeline_column_id": "uuid",  // Timeline column
  "show_dependencies": true,
  "show_critical_path": true,
  "show_baselines": false,
  "time_scale": "day",  // 'day', 'week', 'month', 'quarter'
  "color_by": "status"
}
```

### 4. Calendar View (NEW)

**Features:**
- Month, week, day views
- Color-coded by status or column
- Drag to reschedule
- Multiple calendar layers (tasks, milestones, meetings)

**Configuration:**
```json
{
  "view_type": "calendar",
  "date_column_id": "due_date_column_id",
  "default_view": "month",  // 'day', 'week', 'month'
  "color_by": "status",
  "show_weekends": true,
  "calendar_layers": [
    {"type": "tasks", "enabled": true},
    {"type": "milestones", "enabled": true}
  ]
}
```

### 5. Workload View (NEW)

**Features:**
- Team capacity planning
- Task distribution by assignee
- Overallocation warnings
- Drag tasks between team members
- Capacity vs allocation bars

**Configuration:**
```json
{
  "view_type": "workload",
  "time_period": "week",  // 'week', 'month', 'quarter'
  "capacity_calculation": "estimated_hours",
  "default_capacity_hours_per_week": 40,
  "show_overallocation_warning": true,
  "color_by": "project"
}
```

### 6. Chart View (NEW)

**Features:**
- In-board analytics
- Multiple chart types
- Group and aggregate data
- Real-time updates

**Configuration:**
```json
{
  "view_type": "chart",
  "chart_type": "bar",
  "group_by": "status",
  "aggregate": "count",
  "filters": {"status": ["active", "in_progress", "blocked"]}
}
```

---

## Business Logic

### Objective Status Calculation

```javascript
async function updateObjectiveStatus(objectiveId) {
  const objective = await getObjective(objectiveId);
  const projects = await getObjectiveProjects(objectiveId);

  if (projects.length === 0) {
    return 'planning';
  }

  const totalProjects = projects.length;
  const activeProjects = projects.filter(p => p.status === 'active').length;
  const completedProjects = projects.filter(p => p.status === 'completed').length;
  const blockedProjects = projects.filter(p => p.health_status === 'blocked').length;

  // Calculate completion percentage
  const completionPercentage = (completedProjects / totalProjects) * 100;

  // Determine status
  let status = objective.status;
  if (completedProjects === totalProjects) {
    status = 'completed';
  } else if (activeProjects > 0) {
    status = 'active';
  }

  // Determine health
  let healthStatus = 'on_track';
  if (blockedProjects > 0) {
    healthStatus = 'blocked';
  } else if (blockedProjects / totalProjects > 0.3) {
    healthStatus = 'at_risk';
  }

  await updateObjective(objectiveId, {
    completion_percentage: completionPercentage,
    status,
    health_status: healthStatus
  });
}
```

### Project Metrics Rollup

```javascript
async function recalculateProjectMetrics(projectId) {
  const project = await getProject(projectId);
  const tasks = await getProjectTasks(projectId);

  // Calculate hours
  const totalEstimated = tasks.reduce((sum, t) => sum + (t.estimated_hours || 0), 0);
  const totalActual = tasks.reduce((sum, t) => sum + (t.actual_hours || 0), 0);

  // Calculate completion
  const completedTasks = tasks.filter(t => t.status === 'completed').length;
  const completionPercentage = tasks.length > 0
    ? (completedTasks / tasks.length) * 100
    : 0;

  // Calculate cost from time entries
  const timeEntries = await getProjectTimeEntries(projectId);
  const totalCost = timeEntries.reduce((sum, entry) =>
    sum + (entry.hours * entry.hourly_rate), 0
  );

  // Calculate actual revenue
  const invoices = await getProjectInvoices(projectId);
  const actualRevenue = invoices
    .filter(inv => inv.status === 'paid')
    .reduce((sum, inv) => sum + inv.total_amount, 0);

  // Determine health status
  let healthStatus = 'on_track';
  if (totalCost > project.budgeted_amount * 0.9) {
    healthStatus = 'at_risk';
  } else if (totalCost > project.budgeted_amount) {
    healthStatus = 'over_budget';
  }

  const blockedTasks = tasks.filter(t => t.status === 'blocked').length;
  if (blockedTasks > 0) {
    healthStatus = 'blocked';
  }

  await updateProject(projectId, {
    estimated_hours: totalEstimated,
    actual_hours: totalActual,
    actual_cost: totalCost,
    actual_revenue: actualRevenue,
    completion_percentage: completionPercentage,
    health_status: healthStatus,
    updated_at: new Date()
  });

  // Rollup to objective
  if (project.objective_id) {
    await updateObjectiveStatus(project.objective_id);
  }
}
```

### Formula Column Calculation

```javascript
class FormulaEngine {
  async calculateFormula(taskId, columnId) {
    const column = await getColumnDefinition(columnId);
    const task = await getTask(taskId);
    const expression = column.config.expression;

    // Parse expression to find referenced columns
    const referencedColumns = this.parseColumnReferences(expression);

    // Get column values
    const columnValues = await getTaskColumnValues(taskId, referencedColumns);

    // Replace column references with actual values
    let evaluableExpression = expression;
    for (const [colKey, colValue] of Object.entries(columnValues)) {
      evaluableExpression = evaluableExpression.replace(
        `{${colKey}}`,
        colValue.value
      );
    }

    // Evaluate expression
    const result = this.evaluateExpression(evaluableExpression);

    // Format result based on result_type
    const formatted = this.formatResult(result, column.config);

    return {
      computed_value: result,
      formatted: formatted,
      last_calculated: new Date().toISOString(),
      expression: expression,
      depends_on: referencedColumns.map(c => c.id)
    };
  }

  parseColumnReferences(expression) {
    // Extract {Column Name} references
    const regex = /\{([^}]+)\}/g;
    const matches = [...expression.matchAll(regex)];
    return matches.map(m => m[1]);
  }

  evaluateExpression(expr) {
    // Safely evaluate mathematical expression
    // Use a sandboxed evaluator like math.js
    const math = require('mathjs');

    try {
      return math.evaluate(expr);
    } catch (error) {
      throw new Error(`Formula evaluation error: ${error.message}`);
    }
  }

  formatResult(value, config) {
    if (config.result_type === 'currency') {
      return new Intl.NumberFormat('en-US', {
        style: 'currency',
        currency: config.currency || 'USD',
        minimumFractionDigits: config.decimals || 2
      }).format(value);
    } else if (config.result_type === 'percentage') {
      return `${value.toFixed(config.decimals || 2)}%`;
    }
    return value.toString();
  }
}
```

### Mirror Column Synchronization

```javascript
async function syncMirrorColumn(taskId, mirrorColumnId) {
  const mirrorColumn = await getColumnDefinition(mirrorColumnId);
  const task = await getTask(taskId);

  const config = mirrorColumn.config;
  const connectColumnId = config.connect_column_id;

  // Get the connected task ID from the Connect Boards column
  const connectValue = await getTaskColumnValue(taskId, connectColumnId);
  if (!connectValue || !connectValue.value || connectValue.value.length === 0) {
    return null;  // No connected task
  }

  const connectedTaskId = connectValue.value[0].task_id;

  // Get the source column value from the connected task
  const sourceValue = await getTaskColumnValue(
    connectedTaskId,
    config.source_column_id
  );

  // If aggregation is specified, aggregate multiple connected tasks
  let mirroredValue = sourceValue.value;
  if (config.aggregation && connectValue.value.length > 1) {
    const values = await Promise.all(
      connectValue.value.map(ct =>
        getTaskColumnValue(ct.task_id, config.source_column_id)
      )
    );

    mirroredValue = this.aggregateValues(
      values.map(v => v.value),
      config.aggregation
    );
  }

  return {
    mirrored_value: mirroredValue,
    source_task_id: connectedTaskId,
    source_column_id: config.source_column_id,
    last_synced: new Date().toISOString()
  };
}

function aggregateValues(values, aggregationType) {
  switch (aggregationType) {
    case 'sum':
      return values.reduce((sum, v) => sum + parseFloat(v || 0), 0);
    case 'average':
      return values.reduce((sum, v) => sum + parseFloat(v || 0), 0) / values.length;
    case 'count':
      return values.length;
    case 'min':
      return Math.min(...values.map(v => parseFloat(v || 0)));
    case 'max':
      return Math.max(...values.map(v => parseFloat(v || 0)));
    default:
      return values[0];  // First value
  }
}
```

### Template Application with Columns

```javascript
async function createProjectFromTemplate(templateId, projectData) {
  const template = await getTemplate(templateId);
  const templateConfig = template.template_data;

  // Create project
  const project = await createProject({
    ...templateConfig.projectSettings,
    ...projectData,
    template_id: templateId,
    has_custom_columns: true
  });

  // Create column definitions from template
  const columnMap = new Map();  // old column ID -> new column ID
  for (const templateColumn of templateConfig.columnDefinitions) {
    const newColumn = await createColumnDefinition({
      project_id: project.id,
      column_key: templateColumn.column_key,
      column_label: templateColumn.column_label,
      column_type: templateColumn.column_type,
      config: templateColumn.config,
      position: templateColumn.position,
      is_system_column: false
    });

    columnMap.set(templateColumn.id, newColumn.id);
  }

  // Create tasks from template
  const taskMap = new Map();  // old task ID -> new task ID
  for (const templateTask of templateConfig.tasks) {
    const newTask = await createTask({
      project_id: project.id,
      title: templateTask.title,
      description: templateTask.description,
      estimated_hours: templateTask.estimated_hours,
      parent_task_id: taskMap.get(templateTask.parent_task_id),
      start_date: addDays(project.start_date, templateTask.start_offset_days),
      due_date: addDays(project.start_date, templateTask.due_offset_days)
    });

    taskMap.set(templateTask.id, newTask.id);

    // Create column values for this task
    for (const [oldColumnId, columnValue] of Object.entries(templateTask.columnValues || {})) {
      const newColumnId = columnMap.get(oldColumnId);
      if (newColumnId) {
        await createTaskColumnValue({
          task_id: newTask.id,
          column_id: newColumnId,
          value: columnValue
        });
      }
    }
  }

  // Create automations from template
  for (const templateAutomation of templateConfig.automations || []) {
    await createAutomation({
      project_id: project.id,
      name: templateAutomation.name,
      description: templateAutomation.description,
      trigger: templateAutomation.trigger,
      actions: templateAutomation.actions,
      is_active: true
    });
  }

  return project;
}
```

---

## Integration Points

### With Time Tracking Module
- Start/stop timers directly from tasks
- Auto-associate time entries with tasks
- Roll up task hours to project and objective totals
- **NEW**: Time Tracking column type for inline time entry
- **NEW**: Workload view shows team capacity and allocation

### With Accounting Module
- Convert project budgets to invoices
- Track billable vs non-billable time via column values
- Apply hourly rates from project or task columns
- **NEW**: Formula columns calculate revenue, costs, profit margins
- **NEW**: Mirror billing rates from client records

### With Client Portal
- Display objective and project progress to clients
- Allow client comments on tasks (filtered by client_visible flag)
- Request approvals for deliverables via Button columns
- **NEW**: Client dashboards with filtered widgets
- **NEW**: Automations can send client emails

### With Document Management
- Store task attachments in document library
- Version control for deliverables
- Share files with clients via client_visible flag
- **NEW**: File column type for inline attachment management

### With Proposals Module
- Convert approved proposals to projects with objectives
- Import scope and deliverables as tasks with column values
- Link project budget to proposal estimate via Mirror columns
- **NEW**: Automated project creation from proposal approval

### With CRM Module
- Link objectives to client accounts
- Link projects to deals in pipeline
- Track deal → proposal → objective → project lifecycle
- **NEW**: Mirror client data to objective/project columns
- **NEW**: Dashboards show sales pipeline metrics

---

## Permissions & Access Control

### Permission Levels

**Objectives:**
- **Owner**: Full access, can delete objective
- **Team Member**: Can view and edit projects within objective
- **Viewer**: Read-only access

**Projects:**
- **Project Manager**: Full access to project and all tasks
- **Team Member**: Can view project, edit assigned tasks, log time
- **Client**: View-only access if `client_visible = true`
- **Admin**: Full access to all projects

**Column Permissions:**
- **Everyone**: All team members can edit
- **Owner**: Only task assignee can edit
- **Admins**: Only admins and PM can edit
- **PM Only**: Only project manager can edit

### Row-Level Security (RLS)

```sql
-- Example RLS policies for Projects table

-- Users can see projects they're assigned to or manage
CREATE POLICY project_access_policy ON projects
FOR SELECT
USING (
    tenant_id = current_user_tenant_id() AND
    (
        project_manager_id = current_user_id() OR
        current_user_id() = ANY(team_members) OR
        current_user_is_admin()
    )
);

-- Only PM and admins can update projects
CREATE POLICY project_update_policy ON projects
FOR UPDATE
USING (
    tenant_id = current_user_tenant_id() AND
    (
        project_manager_id = current_user_id() OR
        current_user_is_admin()
    )
);
```

---

## Migration from v1.0 to v2.0

### Migration Steps

1. **Add Objectives Layer**
   - Create objectives table
   - Add objective_id column to projects table
   - Optionally create default objectives from existing project groups

2. **Migrate to Typed Columns**
   - Create column_definitions for standard fields (status, priority, etc.)
   - Migrate custom_fields JSONB to task_column_values
   - Update UI to use typed column rendering

3. **Create Dashboards**
   - Create default tenant dashboard
   - Create objective dashboards
   - Add standard widgets (active projects, budget summary, etc.)

4. **Set Up Automations**
   - Create automation templates for common workflows
   - Migrate existing notification rules to automations
   - Enable AI automation suggestions

5. **Update Views**
   - Add calendar view configuration
   - Add workload view
   - Update Gantt view to support new features

### Backward Compatibility

- **Legacy custom_fields:** Continue to work alongside new column system
- **Existing APIs:** v1 endpoints remain functional
- **Gradual Migration:** Projects can opt-in to typed columns

---

## Performance Considerations

### Indexing Strategy

- **GIN indexes** for JSONB columns (config, value, data_sources)
- **Partial indexes** for active/visible records
- **Composite indexes** for common query patterns
- **Covering indexes** for dashboard widgets

### Caching Strategy

- **Widget Data**: Cache for 5 minutes (configurable)
- **Formula Calculations**: Cache until dependencies change
- **Dashboard Layouts**: Cache per user
- **Column Definitions**: Cache per project/objective

### Query Optimization

- **Materialized Views**: For complex dashboard queries
- **Database Functions**: For formula evaluation
- **Bulk Operations**: Batch updates for multiple tasks
- **Connection Pooling**: For high concurrency

---

## Conclusion

This v2.0 specification integrates:

✅ **Strategic Planning** via Objectives layer
✅ **Flexible Execution** via Monday.com-inspired column system
✅ **Service Provider Focus** via native billing and contracts
✅ **Visual Insights** via cross-project dashboards
✅ **Workflow Automation** via visual automation builder
✅ **Team Efficiency** via workload and calendar views

The design maintains all v1.0 capabilities while adding powerful new features for modern service provider operations.

---

**Next Steps:**
1. Review and approve this specification
2. Create detailed API documentation
3. Design UI/UX mockups for new features
4. Plan phased implementation (Objectives → Columns → Dashboards → Automations)
5. Build migration tools for existing v1.0 customers

---

**Document Version:** 2.0
**Last Updated:** 2025-12-28
**Status:** Draft - Ready for Review
