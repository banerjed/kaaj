# Product Specification: Business Management SaaS Platform

**Version:** 1.4
**Last Updated:** September 23, 2026
**Status:** Draft — implementation in progress (see [Implementation Status](#implementation-status))

---

## Table of Contents

1. [Executive Summary](#executive-summary)
2. [Product Vision](#product-vision)
3. [Target Market](#target-market)
4. [Core Objectives](#core-objectives)
5. [System Architecture Overview](#system-architecture-overview)
6. [Module Overview](#module-overview)
   - [Implementation Status](#implementation-status)
7. [User Roles & Permissions](#user-roles--permissions)
8. [Cross-Cutting Concerns](#cross-cutting-concerns)
9. [Technical Requirements](#technical-requirements)
10. [Security & Compliance](#security--compliance)
11. [Integration Requirements](#integration-requirements)
12. [Deployment & Infrastructure](#deployment--infrastructure)
13. [Success Metrics](#success-metrics)
14. [Future Roadmap](#future-roadmap)

---

## Executive Summary

This document outlines the specifications for a comprehensive, web-based SaaS platform designed to help small and medium-sized businesses (SMBs) manage their core operations. The platform provides an integrated suite of modules that eliminate the need for multiple disconnected systems, reducing operational complexity and improving data consistency.

### Key Features
- Multi-tenant architecture supporting businesses of 10-500 employees
- Modular design allowing businesses to adopt features as needed
- Role-based access control (RBAC) for security and compliance
- Real-time data synchronization across modules
- Mobile-responsive web interface
- RESTful API for third-party integrations

---

## Product Vision

To empower small and medium-sized businesses with enterprise-grade business management tools that are affordable, easy to use, and scalable,
enabling them to compete effectively in their markets while reducing administrative overhead.

### Problem Statement
SMBs currently face several challenges:
- **Fragmented Systems**: Using multiple disconnected tools for HR, accounting, and operations
- **High Costs**: Enterprise solutions are too expensive; consumer tools lack necessary features
- **Data Silos**: Information scattered across platforms, making reporting difficult
- **Steep Learning Curves**: Complex enterprise software requires extensive training
- **Limited Integration**: Tools don't communicate, leading to manual data entry and errors

### Solution
A unified, modular SaaS platform that:
- Centralizes business data in a single system of record
- Provides intuitive, role-specific interfaces
- Scales with business growth
- Offers transparent, per-user pricing
- Ensures data security and compliance with regulations

---

## Target Market

### Primary Audience
- **Business Size**: 10-500 employees
- **Industry Focus**: Professional services, consulting, agencies, tech companies, manufacturing SMBs
- **Geographic Markets**: Initially North America, expanding to Europe and Asia-Pacific
- **Annual Revenue**: $1M - $100M

### User Personas

#### 1. Business Owner / C-Suite Executive
- Needs: High-level dashboards, financial oversight, strategic planning tools
- Pain Points: Lack of real-time visibility into business operations
- Goals: Make data-driven decisions, reduce operational costs

#### 2. HR Manager / People Operations
- Needs: Employee management, benefits administration, compliance tracking
- Pain Points: Manual processes, scattered employee data, compliance risks
- Goals: Streamline HR processes, improve employee experience, ensure compliance

#### 3. Finance Manager / Controller
- Needs: Accounting, budgeting, expense management, AP/AR
- Pain Points: Manual data entry, reconciliation errors, delayed reporting
- Goals: Accurate financial reporting, cash flow management, audit readiness

#### 4. Department Manager
- Needs: Team oversight, time tracking, project management
- Pain Points: Limited visibility into team productivity and resource allocation
- Goals: Optimize team performance, manage budgets, meet deadlines

#### 5. Employee (End User)
- Needs: Self-service access to personal information, time off requests, expense submission
- Pain Points: Bureaucratic processes, lack of transparency
- Goals: Easy access to information, quick approvals, minimal administrative burden

---

## Core Objectives

### Business Objectives
1. **Market Penetration**: Acquire 1,000 paying customers within 18 months
2. **Customer Retention**: Achieve 90%+ annual retention rate
3. **Revenue Growth**: Reach $5M ARR by end of Year 2
4. **Customer Satisfaction**: Maintain NPS score above 50

### Product Objectives
1. **Unified Experience**: Single sign-on, consistent UI/UX across all modules
2. **Data Integrity**: Real-time data synchronization, single source of truth
3. **Scalability**: Support businesses from 10 to 500 employees without performance degradation
4. **Reliability**: 99.9% uptime SLA
5. **Security**: SOC 2 Type II compliance within 12 months
6. **Extensibility**: Well-documented API for custom integrations
7. **AI First**: AI first. Aim to complete each business workflow within 5 minutes. Aim to answer any query within a minute
8. **Customizable**: Have some levels of custom fields per client
9. **Easy onboarding**: Make onboarding a new client within a day. Requires migrating their data from legacy systems to new systems, and requires
     strong ability to import legacy data, transform/clean the data, and import to the new system.
10. **Mobile enabled**: Simple mobile access.
---

## System Architecture Overview

### High-Level Architecture

This is a **multi-tenant SaaS platform** designed to serve multiple organizations globally with complete data isolation and comprehensive internationalization support.

```
┌────────────────────────────────────────────────────────────────────┐
│                          EDGE LAYER                                │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐              │
│  │  CDN / Cache │  │     DNS      │  │     WAF      │              │
│  └──────────────┘  └──────────────┘  └──────────────┘              │
│  (Static assets, DDoS protection, TLS termination)                 │
└────────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────────┐
│              APPLICATION (single deployable unit)                   │
│                                                                     │
│  SvelteKit server — request pipeline                                │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐               │
│  │   Tenant     │  │     Auth     │  │     i18n     │               │
│  │   Context    │→ │   Session    │→ │   Resolver   │               │
│  │ (hooks.server)│  │              │  │             │               │
│  └──────────────┘  └──────────────┘  └──────────────┘               │
│                              │                                      │
│                              ▼                                      │
│  Modules (code boundaries, one process, one transaction scope)      │
│  ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────┐                │
│  │   Firm   │ │    HR    │ │ Payroll  │ │  Compen- │                │
│  │  Profile │ │          │ │          │ │  sation  │                │
│  └──────────┘ └──────────┘ └──────────┘ └──────────┘                │
│  ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────┐                │
│  │Ticketing │ │ Projects │ │   Time   │ │Accounting│                │
│  │          │ │  & Tasks │ │ Tracking │ │          │                │
│  └──────────┘ └──────────┘ └──────────┘ └──────────┘                │
│  ┌──────────┐ ┌──────────┐ ┌──────────┐                             │
│  │ Employee │ │  Change  │ │    AI    │                             │
│  │  Profile │ │ Requests │ │Assistant │                             │
│  └──────────┘ └──────────┘ └──────────┘                             │
│                                                                     │
│  Modules share one database and one transaction scope. Cross-module │
│  workflows are ordinary transactions, not distributed sagas.        │
└─────────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────────┐
│                        DATA LAYER                                   │
│  ┌────────────────────────────────────────────────────────────-─┐   │
│  │  PostgreSQL (Multi-Tenant Database)                          │   │
│  │  • Shared schema with tenant_id isolation                    │   │
│  │  • Row-level security policies (FORCE RLS, non-owner role)   │   │
│  │  • Every table includes tenant_id; indexes lead with it      │   │
│  │  • Full-text search via tsvector + GIN                       │   │
│  │  • Background jobs via SKIP LOCKED queue table               │   │
│  │  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐        │   │
│  │  │   Primary    │  │  Read        │  │   Backup     │        │   │
│  │  │   (Write)    │  │  Replicas    │  │   + PITR     │        │   │
│  │  └──────────────┘  └──────────────┘  └──────────────┘        │   │
│  └────────────────────────────────────────────────────────────-─┘   │
│                                                                     │
│  ┌────────────────────────────────────────────────────────────-──┐  │
│  │  Object Storage (S3-compatible)                               │  │
│  │  • Documents  • Attachments  • Images  • Exports              │  │
│  └────────────────────────────────────────────────────────────-──┘  │
└─────────────────────────────────────────────────────────────────────┘

Worker process (same image, --worker): payroll runs, exports, scheduled jobs.
```

### Architecture Principles

1. **Multi-Tenancy First**:
   - Shared database, shared schema approach with `tenant_id` in every table
   - Subdomain-based tenant routing (e.g., `acme.platform.com`)
   - Complete data isolation enforced at database and application layers
   - Per-tenant configuration and settings

2. **Global by Design**:
   - Full internationalization (i18n) support from day one
   - Support for multiple locales, currencies, timezones, date formats
   - Translation management system with caching
   - User and organization-level locale preferences

3. **Modular Monolith**:
   - Modules are code boundaries within one deployable application
   - Cross-module workflows run as ordinary database transactions
   - All modules share one database, so referential integrity across
     modules is enforced by the database
   - Rationale: the product's value proposition is that the customer does
     no integration work. Splitting modules into services would reproduce
     that integration problem inside our own architecture. See
     [Architecture Decisions](./05-architecture-decisions.md).

4. **API-First**:
   - All functionality accessible via RESTful APIs
   - Versioned APIs with deprecation policies
   - Comprehensive OpenAPI documentation

5. **Stateless Application Servers**:
   - Application servers don't store session state
   - Sessions are database-backed; no separate session store
   - Tenant context resolved once per request in `hooks.server.ts`

6. **Boring Infrastructure**:
   - Containerized deployment (Docker), run on managed hosting
   - Vertical scaling first; horizontal scaling when measurements demand it
   - No orchestration platform, service mesh, or message broker until a
     measured problem requires one
   - Rationale: engineering time spent on infrastructure is time not spent
     on module breadth, which is what wins this market

7. **Security in Depth**:
   - Multiple layers of tenant isolation
   - Encryption at rest and in transit
   - Comprehensive audit logging
   - Role-based access control (RBAC)

8. **Customization is Data, Never Code**:
   - Customers customize through rows, custom-field definitions, and
     settings — never through per-tenant schema changes or per-tenant code
   - Preserves the single atomic migration that shared-schema tenancy buys
   - See [Customization Model](./06-customization-model.md)

### Technology Stack

**Application** (one deployable unit)
- Svelte / SvelteKit (https://svelte.dev) on Node LTS, `@sveltejs/adapter-node`

**Backend platform: Supabase** (see [ADR-008](./05-architecture-decisions.md#adr-008-supabase-as-the-backend-platform))
- Database: Supabase PostgreSQL — the only datastore
- Authentication: Supabase Auth (signup, login, MFA, OAuth/SSO, sessions)
- File Storage: Supabase Storage (documents, images, exports)
- Search: PostgreSQL full-text search (`tsvector` + GIN)
- Queues and cache: PostgreSQL
- Schema: [`data-models/schema.sql`](../packages/database/reference/schema.sql) — authoritative
- Not used: PostgREST as the primary API, Edge Functions, Supabase Realtime (team chat uses Postgres `LISTEN`/`NOTIFY` relayed over SSE instead)

**Infrastructure**
- Containerization: Docker, deployed to managed hosting **in the same region as
  the Supabase project** — every request makes several database round trips
- CDN / WAF / DNS in front of the application
- CI/CD: GitHub Actions
- Logging: Structured JSON to stdout; `pg_stat_statements` enabled

---

## Module Overview

## Implementation Status

*Verified 2026-09-23 against `apps/web/src` (routes, `lib/server` repositories, `export const actions`) and `supabase/migrations`. The finer-grained, per-phase account is [11-module-roadmap.md](./11-module-roadmap.md); when they disagree, the code wins.*

| Marker | Meaning |
|---|---|
| ✅ Built | Read and write paths exist, writes classified in the audit register |
| 🟡 Partial | Some pages or writes exist; gaps listed |
| 📖 Read-only | Pages render real rows; nothing can be changed |
| ⬜ Not started | No repository, no route |

### Platform foundations — ✅ built

- **Tenancy and isolation**: shared schema, `tenant_id` on every table, FORCE RLS with a non-owner role, RESTRICTIVE row-visibility policies (HR, payroll, accounting, audit log), a third RLS pattern for customer contacts. `./check` runs tenant-isolation, specification and invariant suites.
- **Authorization**: `@kaaj/authz` permission strings, `requireCan` on every action and `load()`; separation-of-duties enforced by CHECK constraints and repositories.
- **Audit**: same-transaction audit entries, a committed register classifying every write, row-level visibility on `audit_log` itself.
- **PII**: application-side envelope encryption (`sealField`/`openField`), per-employee keys, erasure by key destruction.
- **Forms, money, time, i18n**: `FormReader` validation, `NUMERIC` money as strings, office-timezone rendering, locale-aware formatting via `$lib/format.ts`, 33 country validators (`@kaaj/validation`).
- **Customer portal identity**: `customer_contacts`, `customer` base role, `/portal` shell and login.
- **Realtime**: `LISTEN`/`NOTIFY` over SSE for chat (shared-tier tenants only; dedicated tenants fall back to polling).

### Modules

| Module | Status | What exists | What is missing |
|---|---|---|---|
| Firm Profile | ✅ Built | `/settings/{company,locations,departments,job-titles,holidays,benefits,payroll/policies,payroll/schedules}`, all with write actions | Job-level management page (repository exists); org-chart diagram |
| Employee Profile | ✅ Built | `/employees` list, detail, create, edit; encrypted PII fields | Subject-access export; custom-field management UI |
| HR — Time off | ✅ Built | `/time-off` requests, ledger-derived balances, approve/refuse | — |
| HR — Performance & feedback | ✅ Built | `/performance` reviews (draft → submitted → acknowledged), goals, anonymous feedback | — |
| HR — Attendance | 📖 Read-only | `/attendance` timesheet in office timezone | Clock in/out, corrections, overtime computation, holiday tie-in |
| HR — Onboarding | 📖 Read-only | `/onboarding` task list, deterministic template selection | Generating a plan for a hire |
| HR — Surveys, benefits enrollment, offboarding | ⬜ Not started | — | Everything |
| Compensation | ✅ Built | `/compensation`, `/compensation/[employeeId]`: audited raises, allowances, variable, equity, work schedules; effective dating | Premiums (shift differentials, on-call) |
| Payroll | 🟡 Partial | `/payroll/runs`, `/payroll/runs/[id]`, `/payroll/payslips`; run lifecycle (draft → calculate → approve → finalize → cancel), audited, totals recomputed | **Per-person gross/tax/net calculation** (no tax tables), US/India tax engines, deduction and garnishment handling, tax forms, off-cycle runs, payment file generation |
| Ticketing | ✅ Built (core) | `/ticketing` list/detail/new, `/settings/ticketing` business-area configuration, customer-facing `/portal/tickets` | SLA management and escalation, subscriber notifications |
| Change Requests | ⬜ Not started | — | Everything |
| User Groups | ⬜ Not started | Roles and permissions exist; no group management | Group model and UI |
| AI Assistant | ⬜ Not started | — | Everything |
| Project & Task Management | 🟡 Partial | `/projects`, `/projects/[id]`: create/edit projects, tasks, status moves, counters; objectives with rollup (`/objectives`); subtasks and same-project task dependencies with cycle detection; List/Kanban/Gantt/Calendar/Workload views; task comments; task files (via Document Management, not a separate attachments table); project templates (task list only — no columns or automations, since neither exists); typed custom fields on projects and tasks (`/settings/project-management`, [26-project-management-custom-fields.md](./26-project-management-custom-fields.md)) | Dashboards, automation engine, formula/mirror columns, cross-entity relations ("Connect Boards"), row-level (PM/team-member) visibility — still firm-wide by design, real drag-and-drop, resource allocation beyond single-project Workload, client-visible updates. Full gap inventory: [27-project-management-gap-tracking.md](./27-project-management-gap-tracking.md) |
| Time Tracking | 🟡 Partial | `/time-tracking`: manual entries, submit/approve/reject, effective-dated rates, rounding at approval | Timesheets, billable expenses, real-time timers, prepaid hour banks, timesheet-to-invoice billing |
| Document Management | 🟡 Partial | `/documents` (folders, sharing, archive, search, upload) — staff side | Client-facing document pages in `/portal`; version control |
| Client Portal | 🟡 Partial | Identity, `/portal` shell, tickets | Documents, chat, project views, invoices |
| Team Chat (internal) | ✅ Built | `/chat` DMs, channels, browse public channels, SSE relay | — |
| Prospect / customer chat | ⬜ Not started | Specified in [21-prospect-chat.md](./21-prospect-chat.md) | Everything |
| Accounting (GL, AR, AP) | ✅ Built for the slice implemented | Invoices, receive payment, recurring invoices, bills and vendor payments, journal entries, ledger, trial balance, balance sheet, P&L, cash flow, AR aging, tax rates/summary, exchange rates, FX revaluation, accruals, periods and year-end close, equity, banking with manual match and rules, payment gateway (Stripe) | Bank-feed integration and statement reconciliation, budgets, multi-entity consolidation ([accounting-gap-analysis.md](./accounting-gap-analysis.md)) |
| Proposals, Estimates & Contracts | ⬜ Not started | — | Everything |
| CRM (Sales Pipeline) | ⬜ Not started | — | Everything |
| Retainer / Recurring Projects | ⬜ Not started | — | Everything |
| Marketing platform (Phase 1C) | ⬜ Not started | Only the CMSaasStarter marketing *website* under `(marketing)`, which is not this module | Everything |
| Recruiting, Expense Management | ⬜ Not started | — | Everything |
| Accounts Payable (vendor bills, payments) | ✅ Built | Delivered inside the Accounting module above | OCR capture, three-way matching, 1099 |

### Cross-cutting concerns

| Concern | Status |
|---|---|
| Authentication (Supabase Auth, email/password, sessions) | ✅ Built |
| SSO (SAML 2.0, OAuth/OIDC), MFA enforcement | ⬜ Not started |
| Audit logging | ✅ Built |
| Notifications (email, in-app, SMS, Slack/Teams) | ⬜ Not started (mail is captured locally in dev only; topbar bell is template chrome) |
| Search | 🟡 Partial — document search only; no global search or command palette |
| Data import/export | 🟡 Partial — trial-balance CSV export, invoice PDF; no bulk import |
| Per-user locale | ⬜ Deferred (office/market locale is used) |
| Required third-party integrations (Gusto/Paychex, Twilio, Plaid, Stripe, Claude gateway, email) | ⬜ Pending — see [Required Integrations](#required-integrations-pending); only Stripe is partly wired |
| Public API / OpenAPI / webhooks | ⬜ Not started (app is server-rendered; no public API) |
| Background worker (jobs queue) | ⬜ Not started |
| Disclosure verification (taint check, [16](./16-disclosure-verification.md)) | 📋 Specified, not implemented |
| Dedicated-tenant tiers B/C (ADR-009) | ⬜ Deliberately deferred until a customer pays |
| Mobile apps | ⬜ Not started (responsive web only) |

---

### Phase 1 Modules (Current Specification)

#### 1. Firm Profile Module — ✅ Built
**Purpose**: Centralized company information and organizational structure

**Key Features**:
- Company branding (name, logo, URLs)
- Multi-location office management
- Department and organizational hierarchy
- Employee titles and role definitions
- Payroll policies configuration
- Benefits package templates
- Location-specific holiday calendars

**See**: [Firm Profile Module Specification](./module-firm-profile.md)

#### 2. Human Resources Module — 🟡 Partial
**Purpose**: Complete employee lifecycle management

**Key Features**:
- Employee profiles and personal information
- Employment history and job changes
- Time off management (PTO, sick leave, etc.)
- Attendance tracking
- Payroll integration
- Benefits enrollment and management
- Performance reviews and feedback
- Onboarding workflows
- Offboarding processes

**See**: [HR Module Specification](./module-hr.md)

#### 3. Employee Profile Module — ✅ Built
**Purpose**: Extendable employee profile system with encrypted PII protection

**Key Features**:
- Core identity fields (name, email, phone, employee ID)
- Core employment fields (status, type, department, job title, manager, location)
- Extended profile (pronouns, picture, hobbies, affinity groups, introduction)
- Prior employment and education history
- Emergency contacts
- Organization-specific custom fields
- Field-level encryption for PII
- Comprehensive access control (RBAC)
- Ticketing module integration
- GDPR compliance features

**See**: [Employee Profile Specification](./module-employee-profile.md)

#### 4. Ticketing Module — ✅ Built (core; SLA and notifications pending)
**Purpose**: Comprehensive internal support and request management system

**Key Features**:
- Multi-business area support (IT, HR, Facilities, etc.)
- Ticket lifecycle management (Pending, Assigned, Active, Closed, Suspended)
- Severity levels (low, medium, high, critical)
- Request types (feature, bug_fix, qa_testing, support, other)
- SLA management with automated escalation
- Hierarchical ticket relationships (parent-child, linked tickets)
- Rich updates with attachments and rich text
- Private vs public ticket visibility
- Business area administrators and analysts roles
- Customizable categories and custom fields
- Task checklists within tickets
- Internal and external summaries
- Subscriber notifications
- Comprehensive audit trail

**See**: [Ticketing Module Specification](./module-ticketing.md)

#### 5. AI Assistant Module — ⬜ Not started
**Purpose**: Always-available intelligent chatbot to help users navigate, learn, and execute tasks through natural language

**Key Features**:
- Natural language interface for all platform functionality
- Contextual help and documentation search (with permissions to prevent unauthorized access to sensitive info)
- Direct action execution through conversation
- Multi-turn conversations with context preservation
- Smart suggestions based on user context
- Multi-lingual support (all platform locales)
- Proactive assistance and reminders
- Knowledge base (needs to honor file & content permissions; we don't want to allow users querying for sensitive info)
- Integration with all platform modules
- Voice input support (future)
- File attachment handling (future)

**See**: [AI Assistant Module Specification](./module-ai-assistant.md)

#### 6. Compensation Module — ✅ Built (premiums pending)
**Purpose**: Comprehensive employee compensation structure supporting diverse employment types and pay models

**Key Features**:
- **Employment Types**: Full-time, part-time, contractor, intern, temporary, consultant, freelance
- **Work Arrangements**: Standard, flexible, shift-based, on-call, project-based, remote, hybrid
- **Work Schedules**: Configurable weekly schedules, core hours for flexible arrangements, shift patterns, break policies
- **Base Compensation**: Salary, hourly, daily, weekly, monthly, piece rate, commission-only
- **Overtime Management**: Configurable overtime rules, multiple rate multipliers, daily/weekly thresholds
- **Variable Compensation**: Commission structures (tiered, flat, accelerator, draw), bonuses, quota-based incentives, profit sharing
- **Equity Compensation**: Stock options, RSUs, SARs, phantom stock, ESPP, performance shares with vesting schedules
- **Allowances & Stipends**: Housing, transportation, mobile phone, internet, equipment, meal, education, wellness, childcare, remote work
- **Shift Differentials & Premiums**: Evening/night shift, weekend, holiday, on-call, hazard pay, certification, bilingual, lead premiums
- **Multi-Currency Support**: All compensation components support multiple currencies
- **Temporal Tracking**: Complete history of compensation changes with effective dates
- **FTE Calculation**: Automatic calculation of full-time equivalent based on hours

**See**: [Compensation Framework](./module-compensation.md)

#### 7. Payroll Module — 🟡 Partial (lifecycle only; no pay calculation)
**Purpose**: Process employee compensation, calculate taxes and deductions, generate pay stubs, and ensure compliance with US and India regulations

**Key Features**:
- **Geographic Coverage**:
  - US: Federal + all 50 states + DC (FICA, Medicare, state income tax, SDI, local taxes)
  - India: TDS, Professional Tax, EPF, ESI, PAN compliance
- **Tax Calculation Engine**:
  - Real-time multi-jurisdiction tax calculations
  - W-4 processing (US), Form 12BB (India)
  - Progressive tax brackets, flat tax states, no-tax states
  - Multi-state tax allocation for employees working across states
- **Deduction Management**:
  - Pre-tax deductions (401k, HSA, health insurance)
  - Post-tax deductions (Roth, garnishments, loans)
  - Statutory deductions (FICA, EPF, ESI)
  - Garnishment processing with priority rules
- **Pay Period Management**: Weekly, bi-weekly, semi-monthly, monthly frequencies
- **Payment Methods**: Direct deposit (ACH, NEFT/RTGS), checks, cash, paycards
- **Pay Stub Generation**: Detailed earnings, deductions, taxes, YTD totals
- **Tax Form Generation**:
  - US: W-2, 1099-NEC, Form 941 (quarterly), Form 940 (annual)
  - India: Form 16, Form 24Q, EPF returns, ESI returns
- **Compliance Reporting**: Quarterly and annual tax filings, deposit tracking
- **Off-Cycle Payroll**: Bonuses, corrections, terminations
- **Audit Trail**: Complete payroll history, immutable transaction logs

**See**: [Payroll Module Specification](./module-payroll.md)

#### 8. Change Requests Module — ⬜ Not started
**Purpose**: Employee self-service system for requesting changes to personal information, benefits, and employment records with approval workflows

**Key Features**:
- **Request Types**:
  - Personal information changes (name, contact, emergency contacts, marital status)
  - Tax & payroll changes (W-4, direct deposit, payment allocation)
  - Benefits changes (health insurance, retirement, beneficiaries, FSA/HSA)
  - Work arrangement changes (remote work, flexible schedule, location, hours)
  - Profile & social changes (picture, pronouns, bio, hobbies, affinity groups)
  - Asset & equipment requests (new equipment, upgrades, returns)
  - Training & development requests (courses, certifications, conferences)
- **Approval Workflows**:
  - Single approver, multi-level, parallel, and conditional approval patterns
  - Configurable approval chains per request type
  - Auto-routing based on request details and organizational hierarchy
  - Revision requests with employee resubmission
- **Status Management**: Submitted, pending, needs revision, approved, applying, completed, rejected, cancelled
- **Document Management**: Secure upload of supporting documents (marriage certificates, voided checks, etc.)
- **Notifications**: Email, in-app, SMS, Slack/Teams integration for all workflow events
- **Field-Level Encryption**: PII and sensitive data encrypted at rest
- **Audit Trail**: Complete history of requests, approvals, rejections, and modifications
- **Compliance**: GDPR, SOX, HIPAA support with data retention policies

**See**: [Change Requests Module Specification](./module-change-requests.md)

### Phase 1B Modules (Service Provider Suite)

#### 6. Project & Task Management Module — 🟡 Partial
**Purpose**: Comprehensive project delivery and task tracking for service providers

**Key Features**:
- Multiple visualization modes (Kanban, List, Gantt charts)
- Task hierarchy with unlimited subtask nesting
- Task dependencies and critical path analysis
- Project templates for repeatable service types
- Time tracking integration directly on tasks
- Client-visible project updates and collaboration
- File attachments and deliverable management
- Resource allocation and workload balancing
- Budget tracking (estimated vs actual hours and costs)
- Recurring projects for retainer clients

**See**: [Project Management Module Specification](./module-project-management-v2.md)

#### 7. Time Tracking & Timesheet Billing Module — 🟡 Partial
**Purpose**: Track billable and non-billable time with automated invoicing

**Key Features**:
- Start/stop timers with real-time tracking
- Manual time entry for retrospective logging
- Billable vs non-billable hour distinction
- Multi-level approval workflows (manager and client)
- Automatic invoice generation from approved hours
- Sophisticated hourly rate management (employee, project, client, task levels)
- Timesheet views (daily, weekly, monthly calendars)
- Billable expense tracking with markup
- Integration with project budgets
- Time entry locking after invoicing

**See**: [Time Tracking Module Specification](./module-time-tracking.md)

#### 8. Proposals, Estimates & Contract Management Module — ⬜ Not started
**Purpose**: Create professional proposals and manage client contracts

**Key Features**:
- Drag-and-drop proposal builder
- Service catalog with pre-defined offerings
- Electronic signature integration (DocuSign, Adobe Sign, HelloSign)
- Version control and revision tracking
- Approval workflows for proposals
- Convert proposal → project → invoice workflow
- Contract templates and clause library
- Renewal reminders and auto-renewal
- Proposal analytics (view tracking, acceptance rates)
- Multi-currency support

**See**: [Service Provider Modules Overview](./service-provider-modules-overview.md)

#### 9. CRM (Sales Pipeline) Module — ⬜ Not started
**Purpose**: Manage leads, opportunities, and sales pipeline

**Key Features**:
- Lead capture from web forms, email, manual entry
- Lead scoring and qualification
- Visual pipeline with drag-and-drop stages
- Activity tracking (calls, emails, meetings, demos)
- Notes, reminders, and follow-up tasks
- Deal forecast and win probability
- Link deals → proposals → projects → invoices
- Email integration and tracking
- Pipeline analytics and reporting
- Customizable pipeline stages

**See**: [Service Provider Modules Overview](./service-provider-modules-overview.md)

#### 10. Client Portal Module — 🟡 Partial (tickets only)
**Purpose**: Secure self-service portal for clients

**Key Features**:
- Secure client login with SSO options
- View project progress and milestones
- Download and upload project documents
- Submit support tickets
- View and pay invoices online
- Access contracts and proposals
- Communication center for messages
- Mobile-responsive design
- Activity audit trail
- Customizable branding per tenant

**See**: [Service Provider Modules Overview](./service-provider-modules-overview.md)

#### 11. Document Management Module — 🟡 Partial (staff side)
**Purpose**: Centralized file storage with version control

**Key Features**:
- Organize files by client, project, category
- Version history with rollback capability
- Full-text search across documents
- Permission control (internal, client-visible, public)
- File preview for common formats
- Expiration dates for sensitive documents
- Folder structure and tagging
- Audit trail for all access
- Storage quota management
- Integration with projects and tasks

**See**: [Service Provider Modules Overview](./service-provider-modules-overview.md)

#### 12. Retainer / Recurring Project Management Module — ⬜ Not started
**Purpose**: Manage recurring revenue and retainer agreements

**Key Features**:
- Monthly/quarterly/annual retainer templates
- Track usage vs allocated hours
- Rollover unused hours (configurable)
- Auto-generate recurring invoices
- Auto-generate recurring tasks
- Usage alerts and notifications
- Retainer balance tracking
- Prepaid hour bank management
- Overage billing with custom rates
- Retainer performance analytics

**See**: [Service Provider Modules Overview](./service-provider-modules-overview.md)

### Phase 2 Modules (Future Development)

#### 13. Recruiting Module — ⬜ Not started
**Purpose**: Streamline hiring process from job posting to offer acceptance

**Planned Features**:
- Job requisition creation and approval
- Career page and job board integrations
- Applicant tracking system (ATS)
- Resume parsing and candidate profiles
- Interview scheduling and feedback
- Offer letter generation
- Integration with HR module for new hire onboarding

#### 14. Accounting Module — ✅ Built (GL, AR, AP, reporting; bank feeds and budgets pending)
**Purpose**: Financial management and reporting

**Planned Features**:
- Chart of accounts
- General ledger
- Accounts receivable (AR)
- Financial reporting (P&L, balance sheet, cash flow)
- Multi-entity and multi-currency support
- Budget creation and tracking
- Tax preparation support

#### 15. Expense Management Module — ⬜ Not started
**Purpose**: Employee expense submission, approval, and reimbursement

**Planned Features**:
- Mobile expense capture (receipt photos)
- Expense report creation
- Multi-level approval workflows
- Policy compliance checking
- Integration with accounting for reimbursement
- Corporate card reconciliation
- Mileage tracking

#### 16. Accounts Payable Module — ✅ Built within Accounting (OCR, 3-way match pending)
**Purpose**: Vendor invoice management and payment processing

**Planned Features**:
- Vendor management
- Invoice capture (OCR)
- Three-way matching (PO, receipt, invoice)
- Approval workflows
- Payment scheduling and processing
- 1099 vendor management
- Integration with accounting module

---

## User Roles & Permissions

### Global Roles

#### Super Administrator
- **Scope**: Platform-wide access
- **Permissions**: All CRUD operations, system configuration, user management
- **Typical Users**: Platform administrators (for SaaS provider)

#### Firm Administrator
- **Scope**: Entire organization within a tenant
- **Permissions**: Manage firm profile, create/deactivate users, configure modules, view all data
- **Typical Users**: Business owners, COO, IT administrators

#### HR Administrator
- **Scope**: HR module and employee data
- **Permissions**: Manage all employee records, configure HR policies, run reports, manage benefits
- **Typical Users**: HR managers, HR directors

#### Finance Administrator
- **Scope**: Accounting and financial modules
- **Permissions**: Manage accounting data, approve expenses, run financial reports, manage vendors
- **Typical Users**: CFO, controllers, finance managers

#### Payroll Administrator
- **Scope**: Payroll processing and compensation data
- **Permissions**: Process payroll, manage tax withholdings, configure deductions, generate tax forms, view all compensation data
- **Typical Users**: Payroll managers, payroll specialists, HR managers with payroll responsibility

#### Benefits Administrator
- **Scope**: Benefits enrollment and administration
- **Permissions**: Manage benefits plans, process enrollments, handle qualifying life events, manage carrier integrations
- **Typical Users**: Benefits specialists, HR benefits managers

#### Marketing Administrator
- **Scope**: Marketing automation platform
- **Permissions**: Manage campaigns, email marketing, lead generation, CRM data, marketing analytics, social media
- **Typical Users**: Marketing managers, marketing directors, growth team leads

#### Sales Manager
- **Scope**: CRM, sales pipeline, proposals, and client interactions
- **Permissions**: Manage leads, opportunities, proposals, client portal, sales analytics, team performance
- **Typical Users**: Sales directors, account managers, business development managers

#### Project Manager
- **Scope**: Project management and time tracking for service delivery
- **Permissions**: Create/manage projects, assign tasks, track time, manage retainers, view project financials
- **Typical Users**: Project managers, delivery managers, account managers

#### Department Manager
- **Scope**: Specific department(s)
- **Permissions**: View team members, approve time off, conduct reviews, view department reports
- **Typical Users**: Team leads, department heads

#### Employee (Standard User)
- **Scope**: Own profile and related data
- **Permissions**: View/edit own profile, submit time off, submit change requests, view pay stubs, enroll in benefits
- **Typical Users**: All employees

### Permission Model

Permissions follow a hierarchical model:
- **Module-Level**: Enable/disable access to entire modules
- **Feature-Level**: Enable/disable specific features within modules
- **Data-Level**: Row-level security based on organizational hierarchy
- **Field-Level**: Restrict visibility of sensitive fields (e.g., salary, SSN)

### Permission Syntax (Example)

```
module:feature:action:scope

Examples:
- hr:employees:read:all (Read all employee data)
- hr:employees:read:department (Read department employee data only)
- hr:employees:update:self (Update own employee record)
- hr:payroll:read:none (No access to payroll data)
- firm:locations:create:all (Create office locations)
- finance:reports:read:group:findata-analysts-group@acme.org (Read financial reports if in the group)
```

### User Groups

**Overview**:
User groups provide a way to organize users into named collections that function as aliases for lists of individual users. Groups simplify permission management and access control by allowing administrators to grant permissions to a group rather than individual users.

**Key Features**:
- **Email-like naming**: Groups use email-like identifiers (e.g., `findata-analysts-group@acme.org`)
- **Aliased resolution**: Specifying a group automatically includes all member users
- **Permission inheritance**: Users inherit permissions from all groups they belong to
- **Hierarchical structure**: Groups can be nested within parent groups
- **Organizational alignment**: Groups can be linked to departments, locations, or teams

**Group Types**:
1. **Department Groups**: Aligned with organizational departments (e.g., `engineering@acme.org`)
2. **Functional Groups**: Cross-departmental functional teams (e.g., `findata-analysts-group@acme.org`)
3. **Team Groups**: Project or initiative-based teams (e.g., `project-phoenix@acme.org`)
4. **Affinity Groups**: Social or interest-based groups (e.g., `women-in-tech@acme.org`)
5. **Custom Groups**: User-defined groups for specific purposes

**Use Cases**:
- **Permission Management**: Grant permissions to entire teams at once
- **Access Control**: Use groups in ACLs for documents, reports, or resources
- **Communication**: Email distribution lists for team communications
- **Reporting**: Generate reports filtered by group membership
- **Organizational Visibility**: Track team composition and membership

**Group Management Permissions**:
- `groups:create:all` - Create new user groups
- `groups:read:all` - View all groups in the organization
- `groups:update:all` - Modify group settings and membership
- `groups:delete:all` - Delete user groups
- `groups:members:add:all` - Add members to any group
- `groups:members:remove:all` - Remove members from any group
- `groups:members:manage:owned` - Manage only groups the user owns

**Example Groups**:
```
Financial Data Teams:
- findata-analysts-group@acme.org (Read access to financial reports)
- findata-managers-group@acme.org (Read/write access + approval permissions)

HR Administration:
- hr-admins@acme.org (Full HR module access)
- hr-reviewers@acme.org (Performance review access)
- hr-recruiters@acme.org (Recruitment and hiring access)

Department Teams:
- engineering-team@acme.org (Engineering department members)
- sales-team@acme.org (Sales department members)
- operations-team@acme.org (Operations department members)
```

---

## Cross-Cutting Concerns

### Authentication & Authorization

**Authentication Methods**:
1. Email/Password with 2FA (TOTP)
2. SSO via SAML 2.0 (enterprise customers)
3. OAuth2/OIDC (Google, Microsoft)
4. Magic link email authentication

**Session Management**:
- JWT-based authentication tokens
- Refresh token rotation
- Session timeout: 8 hours (configurable)
- Remember me: 30 days (optional)

**Password Requirements**:
- Minimum 12 characters
- Must include uppercase, lowercase, number, special character
- Password history: prevent reuse of last 5 passwords
- Password expiration: optional (configurable per firm)

### Audit Logging

All user actions must be logged for compliance and security:

**Logged Events**:
- User authentication (login, logout, failed attempts)
- Data modifications (create, update, delete)
- Permission changes
- Configuration changes
- Report generation
- File uploads/downloads
- API access

**Audit Log Format**:
```json
{
  "timestamp": "2025-12-01T10:30:45.123Z",
  "tenant_id": "uuid",
  "user_id": "uuid",
  "action": "employee.update",
  "resource_type": "employee",
  "resource_id": "uuid",
  "changes": {
    "field": "salary",
    "old_value": "[REDACTED]",
    "new_value": "[REDACTED]"
  },
  "ip_address": "192.168.1.1",
  "user_agent": "Mozilla/5.0...",
  "result": "success"
}
```

**Retention**: Audit logs retained for 7 years (configurable, minimum 1 year)

### Notifications

**Notification Channels**:
1. In-app notifications (real-time)
2. Email notifications
3. SMS (for critical alerts, optional)
4. Slack/Teams integration (future)

**Notification Types**:
- Action required (pending approvals, tasks)
- Informational (status updates, confirmations)
- Alerts (policy violations, system issues)
- Reminders (upcoming deadlines, reviews)

**User Preferences**:
- Users can configure notification preferences per type
- Quiet hours support
- Digest mode (daily/weekly summaries)

### Search Functionality

**Global Search**:
- Full-text search across modules
- Faceted search with filters
- Type-ahead suggestions
- Recent searches
- Saved searches

**Search Scope**:
- Respects user permissions (only search accessible data)
- Module-specific search
- Advanced search with boolean operators

**Implementation**:
- PostgreSQL full-text search (`tsvector` columns with GIN indexes)
- Indexes maintained by trigger on write, so results are never stale
- `tenant_id` is part of every search predicate
- Relevance ranking via `ts_rank`, weighted by user context

### Data Import/Export

**Import**:
- CSV/Excel file upload
- Field mapping wizard
- Validation and error reporting
- Dry-run mode (preview before import)
- Bulk import API

**Export**:
- CSV/Excel export
- PDF reports
- Scheduled exports
- API data extraction
- GDPR data portability support

### Internationalization (i18n)

**Core i18n Architecture**:
- **Multi-Layer Strategy**: Database, application, API, and UI layer internationalization
- **Tenant-Level Defaults**: Each organization sets default locale, currency, timezone
- **User-Level Overrides**: Individual users can override organization defaults
- **Translation Management**: Database-backed translation system with in-process caching
- **RTL Support**: Future support for right-to-left languages (Arabic, Hebrew)

**Phase 1 - Supported Locales** (Initial Launch):
- `en-US` - English (United States) - **Default**
- `en-GB` - English (United Kingdom)
- `es-ES` - Spanish (Spain)
- `es-MX` - Spanish (Mexico)
- `fr-FR` - French (France)
- `de-DE` - German (Germany)

**Supported Currencies**:
- USD, EUR, GBP, CAD, AUD, CHF, JPY, CNY, INR, MXN
- Multi-currency support with daily exchange rate updates
- Per-tenant default currency configuration
- Currency formatting based on locale (symbols, decimal separators)

**Date & Time Handling**:
- All dates stored in UTC in database (`TIMESTAMP WITH TIME ZONE`)
- Conversion to user's timezone for display
- Locale-specific date formats:
  - `en-US`: MM/DD/YYYY
  - `en-GB`, `es-ES`, `fr-FR`: DD/MM/YYYY
  - `de-DE`: DD.MM.YYYY
  - `ja-JP`: YYYY/MM/DD
- Support for both 12-hour and 24-hour time formats
- Relative time formatting ("2 hours ago", "in 3 days")

**Number & Currency Formatting**:
- Using Intl.NumberFormat for locale-aware formatting
- Examples:
  - 1,234.56 (en-US) vs 1.234,56 (de-DE) vs 1 234,56 (fr-FR)
  - $1,234.56 (USD, en-US) vs 1.234,56 € (EUR, de-DE)

**Address Formatting**:
- Country-specific address templates
- Postal code validation by country
- Phone number formatting with international support

**Phase 2** (6-12 months):
- Additional locales: Portuguese (Brazil), Japanese, Chinese (Simplified), Italian, Dutch
- Advanced translation features (context-aware, pluralization rules)
- Machine translation integration for initial translations
- Tenant-specific translation overrides
- SEO-friendly localized URLs

---

## Technical Requirements

### Performance Requirements

**Response Times**:
- Page load: < 2 seconds (p95)
- API response: < 500ms (p95)
- Search results: < 1 second (p95)
- Report generation: < 10 seconds for standard reports

**Scalability**:
- Support up to 10,000 concurrent users
- Handle 1,000 requests per second
- Database: up to 100M employee records across all tenants
- File storage: 10TB per tenant maximum

**Availability**:
- Uptime SLA: 99.9% (excluding planned maintenance)
- Planned maintenance windows: announced 7 days in advance
- Maximum unplanned downtime: 4 hours per month

### Browser Support

**Supported Browsers**:
- Chrome 90+ (recommended)
- Firefox 88+
- Safari 14+
- Edge 90+

**Mobile Support**:
- Responsive design for tablets (iPad, Android tablets)
- Mobile-optimized views for smartphones
- Progressive Web App (PWA) for offline capability (future)

### API Requirements

**API Standards**:
- RESTful design principles
- JSON request/response format
- API versioning (v1, v2, etc.)
- OpenAPI 3.0 specification
- Rate limiting: 1,000 requests per hour per API key

**API Documentation**:
- Interactive API documentation (Swagger UI)
- Code examples in multiple languages
- Webhook documentation
- Changelog for API updates

### Data Retention

**Active Data**:
- All current employee and firm data retained indefinitely while account is active

**Deleted Data**:
- Soft delete with 90-day recovery period
- Hard delete after 90 days or on customer request

**Terminated Employees**:
- Data retained for 7 years for compliance
- Marked as "inactive" but searchable

**Account Cancellation**:
- Data retained for 30 days after cancellation
- Customer can request immediate deletion
- Automatic permanent deletion after 30 days

---

## Security & Compliance

### Security Requirements

**Data Encryption**:
- TLS 1.3 for data in transit
- AES-256 encryption for data at rest
- Database-level encryption
- Encrypted backups

**Infrastructure Security**:
- Web Application Firewall (WAF)
- DDoS protection
- Regular vulnerability scanning
- Penetration testing (annual)
- Dependency vulnerability monitoring

**Application Security**:
- Input validation and sanitization
- SQL injection prevention (parameterized queries)
- XSS prevention (output encoding)
- CSRF protection
- Content Security Policy (CSP) headers
- Secure session management

**Access Control**:
- Principle of least privilege
- Role-based access control (RBAC)
- Multi-factor authentication (2FA/MFA)
- IP whitelisting (optional for enterprise)
- Device management (future)

### Compliance Requirements

**Data Privacy**:
- GDPR compliance (EU customers)
- CCPA compliance (California customers)
- Data processing agreements (DPAs)
- Privacy policy and terms of service
- Cookie consent management
- Right to be forgotten (data deletion)
- Data portability

**Employment Regulations**:
- FLSA compliance (overtime, minimum wage)
- FMLA tracking
- ACA reporting (Affordable Care Act)
- EEO reporting
- I-9 verification support
- State labor law compliance (all 50 US states)
- India labor law compliance (Shops and Establishments Act, Payment of Wages Act)

**Payroll & Tax Compliance**:
- IRS regulations (W-2, 1099, Form 941, Form 940)
- State and local tax compliance (all US jurisdictions)
- India tax compliance (TDS, Professional Tax, EPF, ESI)
- Multi-state tax allocation for remote workers
- Tax deposit tracking and filing

**Financial Compliance**:
- SOX compliance support (for public companies)
- GAAP accounting standards
- Sarbanes-Oxley audit trails
- PCI DSS compliance (for payment processing and direct deposit)
- ACH transaction security standards

**Marketing & Data Privacy**:
- CAN-SPAM Act compliance (email marketing)
- CASL compliance (Canadian anti-spam)
- TCPA compliance (SMS/phone marketing)
- Cookie consent and tracking disclosure
- Unsubscribe management
- Do Not Call registry compliance

**Security Certifications** (Roadmap):
- SOC 2 Type II (within 12 months)
- ISO 27001 (within 24 months)
- HIPAA compliance (for benefits and medical data)
- PCI DSS Level 1 certification (for payment processing)

### Disaster Recovery & Business Continuity

**Backup Strategy**:
- Automated daily backups
- Point-in-time recovery (7 days)
- Geo-redundant backup storage
- Backup testing (quarterly)

**Disaster Recovery**:
- Recovery Time Objective (RTO): 4 hours
- Recovery Point Objective (RPO): 1 hour
- Documented DR procedures
- Annual DR drills

---

## Integration Requirements

### Required Integrations (Pending)

The product is not viable for its target customer without these six. They are ordered by how directly each one blocks a core promise (pay people, get paid, reach people). None is complete today. Each integration is a per-tenant connection whose credentials are sealed through `$lib/server/pii` and never returned to a page, follows the service-role quarantine rule, and records every outbound write in the audit register.

| # | Integration | Purpose | Modules unblocked | Current state |
|---|---|---|---|---|
| 1 | **Gusto or Paychex** (payroll processing) | Compute and file payroll, taxes and forms; disburse pay | Payroll, Compensation, HR | ⬜ Not started. The run lifecycle exists but per-person gross, tax and net do not. Decision needed: **integrate a provider** (sync employees, compensation and time in; pull calculated runs, payslips and tax forms back) **or** build the tax engine in-house. Integrating is the recommended default, since inventing tax tables risks a correct-looking wrong payslip. |
| 2 | **Twilio** (SMS, optionally voice) | Send and receive text messages; voice calls later | Ticketing, Client Portal, Prospect Chat, HR notifications, MFA | ⬜ Not started. Needs inbound webhooks with signature verification, per-tenant sender numbers, opt-out/STOP handling and consent records (TCPA), and message logging as a disclosure-classified table. |
| 3 | **Plaid** (bank connection) | Import bank accounts and transactions for reconciliation | Accounting (banking, matching rules) | ⬜ Not started. `/accounting/banking` matches imported lines manually; the import feed itself, incremental sync, and statement reconciliation against a running balance are missing. Plaid access tokens are secrets and must be sealed. |
| 4 | **Stripe** (payments gateway) | Let customers pay invoices online and get paid | Accounting (receivables), Client Portal, SaaS subscription billing | 🟡 Partial. A tenant can store and validate its own Stripe key (`/accounting/payment-gateway`), and invoice issuance can attach a payment link. Missing: an inbound webhook that records the payment and posts the journal, refunds and disputes, payouts reconciled to the bank, and Kaaj's own subscription billing (the `(admin)/account` template flow) tested end to end. |
| 5 | **Claude gateway** (GenAI) | Natural-language assistant, drafting, summarisation, search over permitted content | AI Assistant, Ticketing, Project Management, Documents | ⬜ Not started. A single server-side gateway module is required, not per-feature API calls: it must run every request as the asking actor so the model can only see what that actor's RLS allows, redact fields classified in the disclosure matrix before prompting, enforce per-tenant usage limits and cost attribution, and log prompts and responses without storing protected values. Custom fields and payroll calculations must never be delegated to the model. |
| 6 | **Transactional email** (Vercel or Cloudflare hosting; provider to be chosen) | Invitations, password resets, invoices, approvals, notifications | Every module; notifications | ⬜ Not started. Local dev captures mail at :54324 only. Requires a provider decision (Cloudflare Email Service or a provider reachable from Vercel or Cloudflare such as Resend, Postmark or SES, since neither host is itself an SMTP relay), SPF/DKIM/DMARC per sending domain, a Postgres-backed outbound queue (ADR-002), bounce and complaint webhooks, and per-tenant sender identity. |

**Cross-integration requirements**
- **Notification service first.** Email (#6) and SMS (#2) should sit behind one internal notification abstraction with per-user channel preferences, so modules emit an event rather than calling a provider.
- **Webhook ingress.** #1, #2, #3, #4 and #6 all need signed inbound webhooks. Build one verified, idempotent ingress route pattern (signature check, replay window, dedupe key, tenant resolution, audited) instead of five.
- **Secrets.** All provider credentials are per tenant, sealed, and readable only through the quarantined service-role path.
- **Background worker.** Syncs (Plaid, payroll provider), retries and the email queue need the `--worker` process, which is also not yet built.
- **Hosting.** Proposed: long-running `adapter-node` containers in the same US East region as Supabase, with Cloudflare as the edge only (not compute), because chat's `LISTEN`/`NOTIFY`, the worker and the 20–50 ms target favour a colocated, pooled container. Premium tenants get a dedicated Supabase project; smaller tenants share one database with RLS. See [24-deployment-and-pooling.md](./24-deployment-and-pooling.md); to be recorded as an ADR once measured.

### Other Planned Integrations

The lists below are longer-horizon and unprioritised; where they overlap the six above, the section above governs.

**Phase 1 Integrations**:
1. **Email Services**: SendGrid, AWS SES, Mailgun
2. **File Storage**: AWS S3, Azure Blob Storage, Google Cloud Storage
3. **Payment Processing**: Stripe, PayPal (for subscription billing and invoicing)
4. **SSO Providers**: Google Workspace, Microsoft 365, Okta
5. **Tax Calculation**: Avalara, TaxJar (sales tax)
6. **Bank Feeds**: Plaid, Yodlee (for bank reconciliation)

**Phase 1B & 1C Integrations**:
1. **Marketing Platforms**:
   - Email: Gmail, Outlook integration
   - Calendar: Google Calendar, Office 365, iCal
   - Social Media: Facebook, Instagram, LinkedIn, Twitter/X, YouTube
   - Video: Zoom, Google Meet, Microsoft Teams
   - Analytics: Google Analytics, Google Search Console
2. **Payment Gateways**: Stripe, PayPal, GoCardless (for online invoice payments)
3. **E-Signature**: DocuSign, Adobe Sign, HelloSign
4. **CRM & Sales**: Salesforce (data import), Pipedrive (migration)
5. **Communication**: Slack, Microsoft Teams, Discord

**Phase 2 Integrations**:
1. **Payroll Providers**: ADP, Gusto, Paychex, QuickBooks Payroll (if outsourcing payroll)
2. **Benefits Providers**: Various carriers (medical, dental, vision, 401k providers)
3. **Accounting Software**: QuickBooks Online, Xero, NetSuite, FreshBooks
4. **E-Commerce**: Shopify, WooCommerce, BigCommerce, Magento
5. **Background Checks**: Checkr, Sterling, HireRight
6. **Learning Platforms**: LinkedIn Learning, Udemy, Coursera
7. **Recruitment**: LinkedIn Recruiter, Indeed, ZipRecruiter
8. **Project Management**: Jira, Asana, Monday.com (for integration)

### Webhook Support

**Outbound Webhooks**:
- Customers can register webhook URLs
- Events: employee.created, employee.updated, time_off.submitted, etc.
- Retry logic: exponential backoff (3 attempts)
- Webhook signature verification (HMAC)

**Inbound Webhooks**:
- Accept notifications from integrated services
- Verification of webhook authenticity
- Asynchronous processing via queue

### API Versioning Strategy

- URL-based versioning: `/api/v1/`, `/api/v2/`
- Deprecated versions supported for 12 months minimum
- Deprecation notices sent 6 months in advance
- Migration guides provided for version upgrades

---

## Deployment & Infrastructure

### Deployment Model

**One shared application deployment; the database is resolved per request.**

The application is deployed once. Which database a customer's requests reach is
determined by their subdomain, which allows three tiers from a single codebase
and a single deployment — see
[ADR-009](./05-architecture-decisions.md#adr-009-subdomain-routed-database-targets).

| Tier | Database | For |
|---|---|---|
| **Shared** (default) | Shared Postgres, `tenant_id` + RLS | Most customers |
| **Dedicated** | Their own Postgres, hosted by us, same region | Customers who need physical isolation |
| **Customer-hosted** | Postgres in their own infrastructure | Designed, not built; see the caveats below |

All three run the same schema and the same code — a dedicated database is the
schema with one tenant row in it.

**Customer-hosted has a caveat that must be stated during the sale:** their data
at rest is theirs, but queries still pass through our shared application, so
data in transit and in memory remains in our infrastructure. That does not
satisfy a data-sovereignty requirement. A customer who needs genuine custody
needs a self-hosted appliance, which remains deliberately unbuilt.

### Hosting Environment

**Backend platform**: Supabase (PostgreSQL, Auth, Storage).
**Application hosting**: Supabase does not host applications, so the SvelteKit
container runs on a separate platform (Fly.io / Render / Railway), colocated in
the same region. The application is a standard Node container.
**Regions**:
- Primary: US-East (Virginia)
- Secondary: US-West (Oregon)
- Future: EU-West (Ireland), Asia-Pacific (Singapore)

### Infrastructure Components

**Compute**:
- Long-running application containers on managed hosting
- A separate worker container from the same image for background jobs
- Vertical scaling first; add instances when measurements require it

**Database**:
- Managed PostgreSQL with automated backups and point-in-time recovery
- Read replicas for reporting queries when reporting load justifies them

**Storage**:
- S3-compatible object storage for documents, attachments and exports
- CDN for static asset delivery

**Networking**:
- CDN / WAF / DNS in front of the application
- TLS termination at the edge

### CI/CD Pipeline

**Source Control**: Git (GitHub, GitLab, or Bitbucket)
**Branching Strategy**: Gitflow or trunk-based development
**Environments**:
- Development (feature branches)
- Staging (release candidates)
- Production (stable releases)

**Deployment Process**:
1. Code commit triggers automated tests
2. Pull request review and approval
3. Merge to main branch
4. Automated build and test
5. Deploy to staging environment
6. Automated integration tests
7. Manual QA approval
8. Deploy to production (blue-green or canary)

**Rollback Strategy**:
- Automated rollback on health check failures
- Manual rollback capability
- Database migration rollback plans

---

## Success Metrics

### Product Metrics

**Adoption Metrics**:
- Monthly Active Users (MAU)
- Daily Active Users (DAU)
- Feature adoption rate by module
- User onboarding completion rate

**Engagement Metrics**:
- Session duration
- Pages per session
- Feature usage frequency
- Return user rate

**Performance Metrics**:
- Page load times (p50, p95, p99)
- API response times
- Error rates
- Uptime percentage

**Business Metrics**:
- Customer acquisition cost (CAC)
- Customer lifetime value (LTV)
- Monthly recurring revenue (MRR)
- Churn rate
- Net Promoter Score (NPS)
- Customer Satisfaction Score (CSAT)

### Key Performance Indicators (KPIs)

**Year 1 Targets**:
- 1,000 paying customers
- 10,000 total users across all tenants
- 99.5% uptime
- NPS > 40
- < 5% monthly churn

**Year 2 Targets**:
- 5,000 paying customers
- 50,000 total users
- 99.9% uptime
- NPS > 50
- < 3% monthly churn

---

## Future Roadmap

### Short-Term (3-6 months) - Phase 1 Completion
- Complete Firm Profile, HR, and Employee Profile modules
- Finalize Compensation and Payroll modules (US + India coverage)
- Complete Change Requests workflow and approval system
- Complete Ticketing module notification and SLA systems
- Finalize AI Assistant integration with all Phase 1 modules
- Mobile-responsive design for all Phase 1 modules
- Basic reporting and analytics dashboards
- SSO integration (SAML 2.0, OAuth2/OIDC)
- API v1 release with comprehensive documentation

### Medium-Term (6-12 months) - Phase 1B & 1C
- **Service Provider Suite (Phase 1B)**:
  - Complete Project & Task Management module
  - Complete Time Tracking & Timesheet Billing
  - Complete Proposals, Estimates & Contract Management
  - Complete CRM (Sales Pipeline) module
  - Complete Client Portal
  - Complete Document Management with version control
  - Complete Retainer / Recurring Project Management
- **Marketing Platform (Phase 1C)**:
  - Launch Marketing Automation Platform with email marketing
  - Launch Lead Generation tools (forms, landing pages, CTAs)
  - Launch Content Management & SEO tools
  - Launch Social Media Management
  - Deploy Breeze AI agents (Customer, Data, Social Media, Content)
  - Complete App Marketplace with initial integrations
- **Infrastructure**:
  - Mobile app (iOS/Android) for core modules
  - SOC 2 Type II certification
  - Advanced reporting with custom dashboards
  - Webhook framework for third-party integrations

### Long-Term (12-24 months) - Phase 2
- **New Modules**:
  - Recruiting & Applicant Tracking System
  - Benefits Administration with carrier integrations
  - Learning & Development / LMS
  - Advanced Accounting features (multi-entity consolidation)
- **Platform Enhancements**:
  - Advanced workflow automation across all modules
  - Enhanced AI-powered insights and predictive analytics
  - International expansion (EU, APAC regulatory compliance)
  - White-label option for partners
  - Advanced compliance features (SOX, HIPAA)
  - Enterprise features (sandboxes, partitioning, custom objects)
- **Marketing Platform Expansion**:
  - Account-Based Marketing (ABM) tools
  - Revenue Operations (RevOps) features
  - Advanced attribution modeling
  - Predictive lead scoring
  - Mobile marketing automation

---

## Appendices

### Glossary

**General Terms:**
- **SMB**: Small and Medium-sized Business
- **SaaS**: Software as a Service
- **RBAC**: Role-Based Access Control
- **API**: Application Programming Interface
- **REST**: Representational State Transfer
- **JWT**: JSON Web Token
- **SSO**: Single Sign-On
- **2FA/MFA**: Two-Factor/Multi-Factor Authentication

**Privacy & Security:**
- **GDPR**: General Data Protection Regulation
- **CCPA**: California Consumer Privacy Act
- **SOC 2**: Service Organization Control 2
- **PCI DSS**: Payment Card Industry Data Security Standard
- **HIPAA**: Health Insurance Portability and Accountability Act

**Employment & Labor:**
- **FLSA**: Fair Labor Standards Act
- **FMLA**: Family and Medical Leave Act
- **ACA**: Affordable Care Act
- **EEO**: Equal Employment Opportunity
- **FTE**: Full-Time Equivalent

**Payroll & Tax:**
- **FICA**: Federal Insurance Contributions Act (Social Security and Medicare taxes)
- **W-2**: Wage and Tax Statement (US)
- **W-4**: Employee's Withholding Certificate (US)
- **1099-NEC**: Nonemployee Compensation (US)
- **TDS**: Tax Deducted at Source (India)
- **EPF**: Employees' Provident Fund (India)
- **ESI**: Employees' State Insurance (India)
- **PAN**: Permanent Account Number (India)
- **ACH**: Automated Clearing House (electronic payments)
- **NEFT/RTGS**: Electronic payment systems (India)

**Compensation & Benefits:**
- **RSU**: Restricted Stock Unit
- **ESPP**: Employee Stock Purchase Plan
- **SAR**: Stock Appreciation Right
- **HSA**: Health Savings Account
- **FSA**: Flexible Spending Account
- **401k**: Employer-sponsored retirement plan (US)

**Marketing & Sales:**
- **CRM**: Customer Relationship Management
- **CTA**: Call-to-Action
- **MQL**: Marketing Qualified Lead
- **SQL**: Sales Qualified Lead
- **SEO**: Search Engine Optimization
- **NPS**: Net Promoter Score
- **CSAT**: Customer Satisfaction Score
- **ABM**: Account-Based Marketing
- **RevOps**: Revenue Operations

**Accounting:**
- **GAAP**: Generally Accepted Accounting Principles
- **SOX**: Sarbanes-Oxley Act
- **AR**: Accounts Receivable
- **AP**: Accounts Payable
- **P&L**: Profit and Loss Statement
- **VAT**: Value-Added Tax
- **MTD**: Making Tax Digital (UK)

### Document Change Log

| Version | Date | Author | Changes |
|---------|------|--------|---------|
| 1.0 | 2025-12-01 | Initial | Initial draft covering Firm Profile and HR modules |
| 1.1 | 2025-12-03 | Update | Added Employee Profile and Ticketing modules to Phase 1; updated architecture diagram; renumbered Phase 2 modules |
| 1.2 | 2025-12-03 | Update | Added AI Assistant module to Phase 1; updated Phase 2 module numbering |
| 1.4 | 2026-09-23 | Update | Added Implementation Status section and per-module status markers, verified against `apps/web/src`; recorded team chat and document management modules |
| 1.5 | 2026-09-23 | Update | Added Required Integrations (Pending): payroll provider, Twilio, Plaid, Stripe, Claude gateway, transactional email |
| 1.6 | 2026-09-26 | Update | Corrected Project & Task Management Implementation Status row — Phase 2 (comments, files, templates, Gantt/Calendar/Workload) and typed custom fields were built since 1.4 and the row still described only Phase 1 |

### References

**Phase 1 Module Specifications:**
  - [Firm Profile Module](./module-firm-profile.md)
  - [HR Module](./module-hr.md)
  - [Employee Profile Module](./module-employee-profile.md)
  - [Ticketing Module](./module-ticketing.md)
  - [AI Assistant Module](./module-ai-assistant.md)
  - [Compensation Module](./module-compensation.md)
  - [Payroll Module](./module-payroll.md)
  - [Change Requests Module](./module-change-requests.md)

**Phase 1B Module Specifications (Service Provider Suite):**
  - [Project & Task Management](./module-project-management-v2.md)
  - [Time Tracking & Timesheet Billing](./module-time-tracking.md)
  - [Service Provider Modules Overview](./service-provider-modules-overview.md)

**Phase 1C Module Specifications (Marketing & Growth):**
  - [Marketing Automation Platform](./module-marketing.md)

**Phase 2 Module Specifications:**
  - [Accounting Module](./module-accounting.md)

---

**Document Owner**: Product Management
**Review Cycle**: Quarterly
**Next Review Date**: 2025-03-01
