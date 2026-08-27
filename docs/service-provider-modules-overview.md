# Service Provider Modules - Complete Overview

**Version:** 1.0
**Last Updated:** 2025-12-06

---

## Overview

This document provides a comprehensive overview of the 7 specialized modules designed for service providers to manage their business operations end-to-end, from lead capture through project delivery and billing.

---

## Module Summary

### 1. Project & Task Management ✅ COMPLETED
**File:** `module-project-management.md`

**Key Features:**
- Multiple views: Kanban boards, List view, Gantt charts
- Task hierarchy with unlimited subtask nesting
- Project templates for repeatable service types
- Task dependencies and critical path analysis
- Time tracking integration on tasks
- Client-visible project updates
- File attachments per task
- Resource allocation and workload balancing

**Core Tables:**
- `projects` - Project master data
- `tasks` - Task hierarchy with dependencies
- `task_comments` - Activity stream
- `project_templates` - Reusable templates
- `task_attachments` - File management

---

### 2. Time Tracking & Timesheet Billing ✅ COMPLETED
**File:** `module-time-tracking.md`

**Key Features:**
- Start/stop timers with real-time tracking
- Manual time entry for retrospective logging
- Billable vs non-billable hour distinction
- Multi-level approval workflows (manager + client)
- Automatic invoice generation from approved hours
- Hourly rate management (employee, project, client, task levels)
- Timesheet views (daily, weekly, monthly)
- Billable expense tracking

**Core Tables:**
- `time_entries` - Individual time logs
- `timesheets` - Period-based timesheet containers
- `hourly_rates` - Rate configuration with priority cascade
- `billable_expenses` - Expense tracking

---

### 3. Proposals, Estimates & Contract Management
**Status:** Schema defined below

**Key Features:**
- Drag-and-drop proposal builder
- Service catalog with pre-defined offerings
- Electronic signature integration (DocuSign, Adobe Sign)
- Version control for proposals
- Approval workflows
- Convert proposal → project → invoice
- Contract templates
- Renewal reminders

**Core Tables:**
```sql
CREATE TABLE proposals (
    id UUID PRIMARY KEY,
    tenant_id UUID NOT NULL,
    proposal_number VARCHAR(50) UNIQUE,
    client_id UUID REFERENCES clients(id),
    opportunity_id UUID REFERENCES opportunities(id),

    title VARCHAR(300),
    description TEXT,
    status VARCHAR(50), -- 'draft', 'sent', 'viewed', 'accepted', 'rejected', 'expired'

    -- Pricing
    subtotal DECIMAL(15,2),
    discount_amount DECIMAL(15,2),
    tax_amount DECIMAL(15,2),
    total_amount DECIMAL(15,2),
    currency VARCHAR(3),

    -- Validity
    valid_until DATE,
    accepted_at TIMESTAMP,
    accepted_by UUID,

    -- E-signature
    signature_required BOOLEAN DEFAULT true,
    signature_provider VARCHAR(50), -- 'docusign', 'adobe_sign', 'internal'
    signature_envelope_id VARCHAR(200),
    signed_document_url TEXT,

    -- Conversion
    converted_to_project BOOLEAN DEFAULT false,
    project_id UUID REFERENCES projects(id),

    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE proposal_line_items (
    id UUID PRIMARY KEY,
    proposal_id UUID REFERENCES proposals(id) ON DELETE CASCADE,

    item_type VARCHAR(50), -- 'service', 'product', 'discount', 'tax'
    service_catalog_id UUID REFERENCES service_catalog(id),

    description TEXT,
    quantity DECIMAL(10,2),
    unit_price DECIMAL(10,2),
    amount DECIMAL(15,2),

    is_optional BOOLEAN DEFAULT false,
    position INTEGER
);

CREATE TABLE service_catalog (
    id UUID PRIMARY KEY,
    tenant_id UUID NOT NULL,

    name VARCHAR(200),
    description TEXT,
    category VARCHAR(100),

    pricing_model VARCHAR(50), -- 'fixed', 'hourly', 'daily', 'per_unit'
    default_price DECIMAL(10,2),
    estimated_hours DECIMAL(10,2),

    is_active BOOLEAN DEFAULT true,
    is_taxable BOOLEAN DEFAULT true
);

CREATE TABLE contracts (
    id UUID PRIMARY KEY,
    tenant_id UUID NOT NULL,
    contract_number VARCHAR(50) UNIQUE,

    client_id UUID REFERENCES clients(id),
    proposal_id UUID REFERENCES proposals(id),

    contract_type VARCHAR(50), -- 'msa', 'sow', 'nda', 'service_agreement'
    status VARCHAR(50), -- 'draft', 'active', 'expired', 'terminated', 'renewed'

    start_date DATE,
    end_date DATE,
    auto_renew BOOLEAN DEFAULT false,
    renewal_notice_days INTEGER DEFAULT 30,

    contract_value DECIMAL(15,2),
    currency VARCHAR(3),

    signed_document_url TEXT,

    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
```

---

### 4. CRM (Sales Pipeline)
**Status:** Schema defined below

**Key Features:**
- Lead capture from web forms, email, manual entry
- Lead scoring and qualification
- Visual pipeline with drag-and-drop stages
- Activity tracking (calls, emails, meetings)
- Notes and reminders
- Deal forecast and probability
- Link deals → proposals → projects
- Email integration
- Reporting and analytics

**Core Tables:**
```sql
CREATE TABLE leads (
    id UUID PRIMARY KEY,
    tenant_id UUID NOT NULL,

    -- Contact Info
    company_name VARCHAR(200),
    contact_name VARCHAR(200),
    email VARCHAR(254),
    phone VARCHAR(50),
    website VARCHAR(500),

    -- Lead Details
    lead_source VARCHAR(100), -- 'website', 'referral', 'cold_call', 'social_media'
    status VARCHAR(50), -- 'new', 'contacted', 'qualified', 'unqualified', 'converted'

    -- Qualification
    lead_score INTEGER DEFAULT 0,
    industry VARCHAR(100),
    company_size VARCHAR(50),
    budget_range VARCHAR(50),

    -- Assignment
    assigned_to UUID REFERENCES employees(id),

    -- Conversion
    converted_to_opportunity BOOLEAN DEFAULT false,
    opportunity_id UUID REFERENCES opportunities(id),
    converted_at TIMESTAMP,

    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE opportunities (
    id UUID PRIMARY KEY,
    tenant_id UUID NOT NULL,
    opportunity_number VARCHAR(50) UNIQUE,

    -- Client
    client_id UUID REFERENCES clients(id),
    contact_id UUID REFERENCES contacts(id),
    lead_id UUID REFERENCES leads(id),

    -- Opportunity Details
    name VARCHAR(300),
    description TEXT,

    -- Pipeline
    pipeline_stage VARCHAR(100), -- 'prospecting', 'qualification', 'proposal', 'negotiation', 'closed_won', 'closed_lost'
    probability INTEGER, -- 0-100%

    -- Value
    estimated_value DECIMAL(15,2),
    currency VARCHAR(3),

    -- Dates
    expected_close_date DATE,
    actual_close_date DATE,

    -- Assignment
    owner_id UUID REFERENCES employees(id),

    -- Status
    status VARCHAR(50), -- 'open', 'won', 'lost', 'abandoned'
    lost_reason TEXT,

    -- Conversion
    proposal_id UUID REFERENCES proposals(id),
    project_id UUID REFERENCES projects(id),

    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE activities (
    id UUID PRIMARY KEY,
    tenant_id UUID NOT NULL,

    -- Subject
    activity_type VARCHAR(50), -- 'call', 'email', 'meeting', 'task', 'note'
    subject VARCHAR(300),
    description TEXT,

    -- Related To
    lead_id UUID REFERENCES leads(id),
    opportunity_id UUID REFERENCES opportunities(id),
    client_id UUID REFERENCES clients(id),

    -- Scheduling
    activity_date TIMESTAMP,
    duration_minutes INTEGER,

    -- Status
    status VARCHAR(50), -- 'planned', 'completed', 'cancelled'
    outcome TEXT,

    -- Assignment
    assigned_to UUID REFERENCES employees(id),
    completed_by UUID REFERENCES employees(id),

    -- Reminders
    reminder_enabled BOOLEAN DEFAULT false,
    reminder_datetime TIMESTAMP,

    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE pipeline_stages (
    id UUID PRIMARY KEY,
    tenant_id UUID NOT NULL,

    stage_name VARCHAR(100),
    stage_order INTEGER,
    default_probability INTEGER,
    is_active BOOLEAN DEFAULT true,
    color VARCHAR(20)
);
```

---

### 5. Client Portal
**Status:** Schema defined below

**Key Features:**
- Secure client login
- View project progress and milestones
- Download/upload documents
- Submit support tickets
- View and pay invoices online
- Access contracts and proposals
- Communication center
- Mobile-responsive design

**Core Tables:**
```sql
CREATE TABLE client_portal_users (
    id UUID PRIMARY KEY,
    tenant_id UUID NOT NULL,

    client_id UUID REFERENCES clients(id),
    contact_id UUID REFERENCES contacts(id),

    email VARCHAR(254) UNIQUE,
    password_hash VARCHAR(255),

    -- Access Control
    is_active BOOLEAN DEFAULT true,
    is_primary_contact BOOLEAN DEFAULT false,

    -- Permissions
    can_view_projects BOOLEAN DEFAULT true,
    can_view_invoices BOOLEAN DEFAULT true,
    can_view_documents BOOLEAN DEFAULT true,
    can_submit_tickets BOOLEAN DEFAULT true,
    can_make_payments BOOLEAN DEFAULT false,

    -- Security
    last_login_at TIMESTAMP,
    password_reset_token VARCHAR(100),
    password_reset_expires TIMESTAMP,

    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE client_portal_access_log (
    id UUID PRIMARY KEY,
    tenant_id UUID NOT NULL,

    portal_user_id UUID REFERENCES client_portal_users(id),

    action_type VARCHAR(50), -- 'login', 'logout', 'view_project', 'download_file', 'submit_ticket'
    resource_type VARCHAR(50),
    resource_id UUID,

    ip_address INET,
    user_agent TEXT,

    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE client_notifications (
    id UUID PRIMARY KEY,
    tenant_id UUID NOT NULL,

    client_id UUID REFERENCES clients(id),
    portal_user_id UUID REFERENCES client_portal_users(id),

    notification_type VARCHAR(50), -- 'project_update', 'invoice_ready', 'payment_received', 'document_shared'
    title VARCHAR(300),
    message TEXT,

    link_url TEXT,

    is_read BOOLEAN DEFAULT false,
    read_at TIMESTAMP,

    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
```

---

### 6. Document Management
**Status:** Schema defined below

**Key Features:**
- Centralized file storage
- Organize by client/project/category
- Version history with rollback
- Full-text search
- Permission control (internal, client-visible, public)
- File preview for common formats
- Expiration dates for sensitive documents
- Audit trail

**Core Tables:**
```sql
CREATE TABLE document_storage (
    id UUID PRIMARY KEY,
    tenant_id UUID NOT NULL,

    -- File Details
    file_name VARCHAR(500),
    file_path TEXT, -- S3/cloud storage path
    file_size_bytes BIGINT,
    mime_type VARCHAR(100),
    file_extension VARCHAR(20),

    -- Categorization
    category VARCHAR(100), -- 'contract', 'proposal', 'deliverable', 'invoice', 'receipt', 'other'
    folder_id UUID REFERENCES document_folders(id),

    -- Relationships
    client_id UUID REFERENCES clients(id),
    project_id UUID REFERENCES projects(id),
    task_id UUID REFERENCES tasks(id),

    -- Version Control
    version_number INTEGER DEFAULT 1,
    parent_document_id UUID REFERENCES document_storage(id),
    is_latest_version BOOLEAN DEFAULT true,

    -- Access Control
    visibility VARCHAR(50) DEFAULT 'internal', -- 'internal', 'client', 'public'
    password_protected BOOLEAN DEFAULT false,
    password_hash VARCHAR(255),

    -- Expiration
    expires_at TIMESTAMP,

    -- Metadata
    description TEXT,
    tags VARCHAR(50)[],
    custom_metadata JSONB,

    -- Search
    search_content TEXT, -- Extracted text for search

    -- Upload Info
    uploaded_by UUID REFERENCES employees(id),
    uploaded_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

    -- Download Tracking
    download_count INTEGER DEFAULT 0,
    last_downloaded_at TIMESTAMP,

    -- Status
    is_archived BOOLEAN DEFAULT false,
    archived_at TIMESTAMP
);

CREATE TABLE document_folders (
    id UUID PRIMARY KEY,
    tenant_id UUID NOT NULL,

    folder_name VARCHAR(200),
    parent_folder_id UUID REFERENCES document_folders(id),

    client_id UUID REFERENCES clients(id),
    project_id UUID REFERENCES projects(id),

    visibility VARCHAR(50) DEFAULT 'internal',

    created_by UUID REFERENCES employees(id),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE document_access_log (
    id UUID PRIMARY KEY,
    tenant_id UUID NOT NULL,

    document_id UUID REFERENCES document_storage(id),

    action_type VARCHAR(50), -- 'view', 'download', 'edit', 'delete', 'share'

    accessed_by_employee_id UUID REFERENCES employees(id),
    accessed_by_client_id UUID REFERENCES client_portal_users(id),

    ip_address INET,

    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Full-text search index
CREATE INDEX idx_document_search ON document_storage USING GIN(to_tsvector('english', search_content));
```

---

### 7. Retainer / Recurring Project Management
**Status:** Schema defined below

**Key Features:**
- Monthly/quarterly retainer templates
- Track usage vs allocated hours
- Rollover unused hours (configurable)
- Auto-generate recurring invoices
- Auto-generate recurring tasks
- Usage alerts and notifications
- Retainer balance tracking
- Prepaid hour bank

**Core Tables:**
```sql
CREATE TABLE retainers (
    id UUID PRIMARY KEY,
    tenant_id UUID NOT NULL,
    retainer_number VARCHAR(50) UNIQUE,

    -- Client
    client_id UUID REFERENCES clients(id),
    contract_id UUID REFERENCES contracts(id),

    -- Retainer Details
    name VARCHAR(200),
    description TEXT,
    retainer_type VARCHAR(50), -- 'hours_based', 'deliverables_based', 'value_based'

    -- Period
    period_type VARCHAR(50), -- 'monthly', 'quarterly', 'annually'
    start_date DATE,
    end_date DATE,

    -- Hours Allocation (for hours-based retainers)
    allocated_hours_per_period DECIMAL(10,2),
    rollover_allowed BOOLEAN DEFAULT false,
    max_rollover_hours DECIMAL(10,2),

    -- Pricing
    retainer_fee DECIMAL(15,2),
    currency VARCHAR(3),
    billing_day_of_month INTEGER DEFAULT 1,

    -- Overage
    allow_overage BOOLEAN DEFAULT false,
    overage_rate DECIMAL(10,2),

    -- Status
    status VARCHAR(50), -- 'draft', 'active', 'paused', 'expired', 'cancelled'
    auto_renew BOOLEAN DEFAULT false,

    -- Notifications
    alert_threshold_percentage INTEGER DEFAULT 80, -- Alert at 80% usage

    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE retainer_periods (
    id UUID PRIMARY KEY,
    tenant_id UUID NOT NULL,

    retainer_id UUID REFERENCES retainers(id) ON DELETE CASCADE,

    -- Period
    period_start DATE,
    period_end DATE,

    -- Allocation
    allocated_hours DECIMAL(10,2),
    rollover_hours DECIMAL(10,2) DEFAULT 0.00,
    total_available_hours DECIMAL(10,2),

    -- Usage
    used_hours DECIMAL(10,2) DEFAULT 0.00,
    remaining_hours DECIMAL(10,2),
    overage_hours DECIMAL(10,2) DEFAULT 0.00,

    -- Billing
    base_fee DECIMAL(15,2),
    overage_charges DECIMAL(15,2) DEFAULT 0.00,
    total_charges DECIMAL(15,2),

    invoice_id UUID REFERENCES invoices(id),
    invoiced_at TIMESTAMP,

    -- Status
    status VARCHAR(50), -- 'active', 'completed', 'invoiced'

    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE retainer_tasks (
    id UUID PRIMARY KEY,
    tenant_id UUID NOT NULL,

    retainer_id UUID REFERENCES retainers(id) ON DELETE CASCADE,

    -- Task Template
    task_template_name VARCHAR(200),
    task_description TEXT,
    assigned_to UUID REFERENCES employees(id),

    -- Recurrence
    recurrence_rule VARCHAR(50), -- 'monthly', 'quarterly', 'weekly'
    day_of_month INTEGER,
    day_of_week INTEGER,

    estimated_hours DECIMAL(8,2),

    is_active BOOLEAN DEFAULT true,

    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE retainer_usage_log (
    id UUID PRIMARY KEY,
    tenant_id UUID NOT NULL,

    retainer_period_id UUID REFERENCES retainer_periods(id),
    time_entry_id UUID REFERENCES time_entries(id),

    hours_used DECIMAL(8,2),
    is_overage BOOLEAN DEFAULT false,

    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
```

---

## Module Integration Map

```
┌─────────────────────────────────────────────────────────────┐
│                          CRM (Sales)                         │
│  ┌──────────┐    ┌──────────────┐    ┌──────────────┐      │
│  │  Leads   │───→│Opportunities │───→│  Proposals   │      │
│  └──────────┘    └──────────────┘    └──────────────┘      │
└─────────────────────────────┬───────────────────────────────┘
                              │
                              ↓
┌─────────────────────────────────────────────────────────────┐
│                   Proposals & Contracts                      │
│  ┌──────────────┐    ┌──────────────┐    ┌──────────────┐  │
│  │  Proposals   │───→│  E-Signature │───→│  Contracts   │  │
│  └──────────────┘    └──────────────┘    └──────────────┘  │
└─────────────────────────────┬───────────────────────────────┘
                              │
                              ↓
┌─────────────────────────────────────────────────────────────┐
│                   Project Management                         │
│  ┌──────────────┐    ┌──────────────┐    ┌──────────────┐  │
│  │   Projects   │───→│    Tasks     │───→│ Deliverables │  │
│  └──────────────┘    └──────────────┘    └──────────────┘  │
└───────┬───────────────────────┬─────────────────────────────┘
        │                       │
        ↓                       ↓
┌───────────────────┐  ┌────────────────────────────────────┐
│  Time Tracking    │  │      Document Management           │
│  ┌─────────────┐  │  │  ┌──────────────┐  ┌────────────┐ │
│  │ Timesheets  │  │  │  │    Files     │  │  Versions  │ │
│  └─────────────┘  │  │  └──────────────┘  └────────────┘ │
└────────┬──────────┘  └────────────────┬───────────────────┘
         │                              │
         ↓                              ↓
┌─────────────────────────────────────────────────────────────┐
│                      Client Portal                           │
│  ┌──────────────┐    ┌──────────────┐    ┌──────────────┐  │
│  │   Projects   │    │   Invoices   │    │  Documents   │  │
│  └──────────────┘    └──────────────┘    └──────────────┘  │
└─────────────────────────────────────────────────────────────┘
         │
         ↓
┌─────────────────────────────────────────────────────────────┐
│                      Accounting                              │
│  ┌──────────────┐    ┌──────────────┐    ┌──────────────┐  │
│  │   Invoices   │───→│   Payments   │───→│  Reports     │  │
│  └──────────────┘    └──────────────┘    └──────────────┘  │
└─────────────────────────────────────────────────────────────┘
         ↑
         │
┌─────────────────────────────────────────────────────────────┐
│               Retainer Management                            │
│  ┌──────────────┐    ┌──────────────┐    ┌──────────────┐  │
│  │  Retainers   │───→│Usage Tracking│───→│Auto-Invoice  │  │
│  └──────────────┘    └──────────────┘    └──────────────┘  │
└─────────────────────────────────────────────────────────────┘
```

---

## Implementation Priority

### Phase 1: Foundation (Months 1-2)
1. **Project & Task Management** ✅
2. **Time Tracking & Billing** ✅
3. **Document Management**

### Phase 2: Sales & Client (Months 3-4)
4. **CRM Sales Pipeline**
5. **Proposals & Contracts**
6. **Client Portal**

### Phase 3: Advanced (Month 5-6)
7. **Retainer Management**
8. **Advanced Reporting**
9. **Mobile Apps**

---

## Key Business Flows

### New Client Acquisition Flow
1. **Lead captured** in CRM
2. **Lead qualified** and converted to Opportunity
3. **Proposal created** and sent
4. **E-signature** obtained
5. **Contract** generated
6. **Project created** from proposal
7. **Tasks generated** from project template

### Project Delivery Flow
1. **Project started** with tasks assigned
2. **Team logs time** on tasks
3. **Files uploaded** as deliverables
4. **Client reviews** via portal
5. **Time submitted** for approval
6. **Timesheet approved**
7. **Invoice auto-generated** from hours

### Retainer Management Flow
1. **Retainer** contract signed
2. **Monthly period** auto-created
3. **Recurring tasks** generated
4. **Time logged** against retainer
5. **Usage tracked** vs allocation
6. **Alert sent** at 80% usage
7. **Invoice auto-generated** monthly

---

## Related Documentation

- [Project Management Module](./module-project-management-v2.md) ✅
- [Time Tracking Module](./module-time-tracking.md) ✅
- [Accounting Module](./module-accounting.md)
- [HR Module](./module-hr.md)
- [Data Models](./data-models/schema.sql)
- [API Endpoints](./api-endpoints.md)

---

**Status Legend:**
- ✅ = Fully documented
- 🔄 = Schema defined, detailed docs pending
- ⏳ = Planned for next phase
