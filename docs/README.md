# Business Management SaaS Platform - Specification Documents

**Version:** 2.0
**Last Updated:** December 3, 2025
**Architecture:** Multi-Tenant SaaS with Full Internationalization

---

## 📚 Documentation Index

### Core Architecture Documents

1. **[product-specification.md](./product-specification.md)** - Top-level product specification
   - Executive summary and product vision
   - Multi-tenant SaaS architecture overview
   - Complete system design with i18n support
   - Module overview (all modules)
   - User roles, permissions, security
   - Technical requirements and deployment
   - Success metrics and roadmap

2. **[architecture-technical.md](./architecture-technical.md)** - Technical architecture deep-dive (v2.0)
   - Multi-tenancy design patterns
   - Internationalization (i18n) implementation
   - Database architecture with tenant isolation
   - Application layer architecture
   - Authentication & authorization
   - Performance, scalability, deployment
   - Code examples and best practices

### Module Specifications

#### ✅ Phase 1 Modules (Complete)

3. **[module-firm-profile.md](./module-firm-profile.md)** - Firm Profile Module Specification (v2.0)
   - **Status:** ✅ Fully aligned with multi-tenant & i18n architecture
   - Company configuration and branding
   - Multi-location management with timezones
   - Multilingual departments and organizational hierarchy
   - Job titles with multi-currency salary ranges
   - Timezone-aware payroll schedules
   - Multi-currency benefits packages
   - Location-specific holiday calendars
   - **Contains:** 39 user stories, 7 functional requirements, 12 database tables, 30+ API endpoints

4. **[module-hr.md](./module-hr.md)** - Human Resources Module Specification (v1.0)
   - **Status:** 🔄 Original version (needs i18n updates)
   - Employee profile management
   - Employment history tracking
   - Time off management
   - Attendance tracking
   - Payroll management
   - Benefits enrollment
   - Performance reviews
   - Onboarding workflows
   - Employee feedback and surveys
   - **Contains:** 60 user stories, 9 functional requirements, 30+ database tables, 50+ API endpoints
   - **Note:** This version works but lacks full i18n/multi-currency integration. Will be updated in next iteration.

5. **[module-accounting.md](./module-accounting.md)** - Accounting Module Specification (v2.0)
   - **Status:** ✅ Complete specification based on Xero.com features
   - Invoice management with online payments (Stripe, PayPal, GoCardless)
   - Expense management with OCR receipt capture
   - Accounts Receivable (AR) with aging reports
   - Accounts Payable (AP) with automated bill entry
   - Bank reconciliation with automated matching
   - General ledger and chart of accounts
   - Financial reporting (P&L, Balance Sheet, Cash Flow)
   - Multi-currency support (160+ currencies)
   - Tax management (Sales Tax, VAT, GST)
   - **Contains:** 55 user stories, 9 functional requirements, 20+ database tables, 50+ API endpoints

#### 📝 Phase 2 Modules (Planned)

6. **Recruiting Module** (Not yet created)
   - Job requisitions and postings
   - Applicant tracking system
   - Interview scheduling
   - Offer management
   - Integration with HR for onboarding

7. **HelpDesk Module** (Not yet created)
   - IT/facilities ticketing
   - Knowledge base
   - Asset management
   - SLA tracking

### Frontend & Design Documents

**Frontend framework:** Svelte / SvelteKit (https://svelte.dev)

8. **[02-ux-design-specification.md](./02-ux-design-specification.md)** - UX & Design Specification
   - Design system (colors, typography, spacing)
   - Component library and page layouts
   - Navigation, screens and user flows
   - Accessibility and implementation guidelines

9. **[03-perf_guide.md](./03-perf_guide.md)** - High-Performance SvelteKit Application Guide
   - SvelteKit built-in optimizations
   - Data loading, streaming and caching patterns
   - State management with context and runes
   - Code splitting and bundle size management

10. **[04-mobile_guide.md](./04-mobile_guide.md)** - Mobile-First Development Guide for SvelteKit
    - Responsive layouts and touch targets
    - Mobile navigation and form patterns
    - Performance on constrained devices
    - Progressive Web App (PWA) setup

### Architecture Decision Records

11. **[05-architecture-decisions.md](./05-architecture-decisions.md)** - Architecture Decisions (ADRs)
    - Modular monolith, not microservices — and why
    - PostgreSQL as the only datastore
    - Shared-schema multi-tenancy with row-level security
    - SvelteKit as the full stack; Node LTS as the runtime
    - Boring infrastructure; on-premise deferred
    - **Supersedes** several positions still recorded in older documents

12. **[06-customization-model.md](./06-customization-model.md)** - Customization Model
    - Three tiers: configuration data, custom fields, behaviour settings
    - `custom_field_definitions` and `tenant_settings` schemas
    - What we refuse to support (per-tenant DDL, EAV, per-tenant code)
    - The financial-calculation boundary

### Application

13. **[08-development-setup.md](./08-development-setup.md)** - Development setup
    - Running against local Supabase and against the hosted project
    - The database test harnesses and what each one proves
    - Troubleshooting: port conflicts, PG16 role membership, FORCE RLS

14. **[07-app-provenance.md](./07-app-provenance.md)** - `app/` provenance & planned modifications
    - Where the code came from (CMSaasStarter, MIT) and the attribution we keep
    - The planned modifications list — doubles as the first work list

### API Surface

14. **[api-surface.md](./api-surface.md)** - **Authoritative interface contract** (generated)
    - Four surfaces: Data API, server data layer, Auth, Storage — and which ADR-008 rejected
    - 98 tables, 261 declared operations, plus two coverage reconciliations
    - Generated by `scripts/gen-api-surface.mjs`; re-run it, do not hand-edit
    - Supersedes [api-endpoints.md](./api-endpoints.md), kept as a requirements source

### Data Model

15. **[data-models/schema.sql](./data-models/schema.sql)** - **Authoritative database schema**
    - 98 tables + 1 view, Supabase PostgreSQL, validated against PostgreSQL 17
    - Shared-schema multi-tenancy with row-level security on every table
    - Supersedes the former `data-models.md` and all `d1-*` sources (now deleted)

16. **[data-models/mock-data.sql](./data-models/mock-data.sql)** - Test organization
    - Northwind Consulting: 12 employees, 3 countries, 3 currencies
    - 265 rows across 48 tables, with self-verifying consistency checks

17. **[data-models/SCHEMA-RECONCILIATION.md](./data-models/SCHEMA-RECONCILIATION.md)** - Schema Reconciliation
    - How the two legacy schemas were merged
    - Every capability the D1 pass dropped, and which were restored
    - Verification results and post-merge corrections

---

## 🏗️ Architecture Highlights

### Application
- **Shape:** Modular monolith — modules are code boundaries in one deployable,
  sharing one database and one transaction scope ([ADR-001](./05-architecture-decisions.md#adr-001-modular-monolith-not-microservices))
- **Stack:** SvelteKit on Node, Supabase (PostgreSQL + Auth + Storage)
- **Datastore:** PostgreSQL only — search, jobs and cache included. No Redis.

### Multi-Tenancy
- **Approach:** Shared database, shared schema with `tenant_id` column
- **Isolation:** PostgreSQL row-level security, `ENABLE`d and **`FORCE`d** on
  every tenant-owned table, with the application connecting as a non-owner role.
  Application-level filtering is defence in depth, not the primary mechanism.
- **Routing:** Subdomain-based (e.g., `acme.platform.com`, `globex.platform.com`)
- **Benefits:** Cost-effective, **one atomic migration for all tenants**, scales
  to 1000s of tenants
- **Cost:** Shared blast radius — one bad migration affects everyone

### Internationalization (i18n)

#### Supported Locales (Phase 1)
- 🇺🇸 English (US) - `en-US` (default)
- 🇬🇧 English (UK) - `en-GB`
- 🇪🇸 Spanish (Spain) - `es-ES`
- 🇲🇽 Spanish (Mexico) - `es-MX`
- 🇫🇷 French (France) - `fr-FR`
- 🇩🇪 German (Germany) - `de-DE`

#### Supported Currencies (Phase 1)
- USD ($), EUR (€), GBP (£), CAD (C$), AUD (A$), CHF, JPY (¥), CNY (¥), INR (₹), MXN ($)

#### i18n Features
- **Multilingual Content:** JSONB fields for translations (e.g., `name_i18n`, `description_i18n`)
- **Date/Time:** UTC storage, timezone-aware display, locale-specific formats
- **Currency:** Multi-currency storage, locale-aware formatting
- **Numbers:** Locale-specific thousand/decimal separators
- **Addresses:** Country-specific formatting templates
- **Fallback Logic:** User locale → Tenant default → en-US

### Database Design

#### Every Table Includes
```sql
CREATE TABLE example (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,  -- ✅ Multi-tenant

    name VARCHAR(255) NOT NULL,
    name_i18n JSONB,  -- ✅ Multilingual support

    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,  -- ✅ UTC timezone
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    created_by UUID,
    updated_by UUID
);

-- ✅ tenant_id LEADS every index — the single biggest determinant of query
--    performance on a shared instance. Never (status, created_at); always
--    (tenant_id, status, created_at).
CREATE INDEX idx_example_tenant ON example (tenant_id);
CREATE INDEX idx_example_name_i18n ON example USING GIN (tenant_id, name_i18n);

-- ✅ Isolation enforced by the database, not by remembering to filter
ALTER TABLE example ENABLE ROW LEVEL SECURITY;
ALTER TABLE example FORCE  ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON example
    USING (tenant_id = app.current_tenant_id())
    WITH CHECK (tenant_id = app.current_tenant_id());
```

> The authoritative schema is [`data-models/schema.sql`](./data-models/schema.sql).
> The example above is the pattern every one of its 93 tables follows.

#### Multi-Currency Pattern
```sql
-- Multi-currency salary ranges
salary_ranges JSONB
/*
{
  "USD": {"min": 120000, "max": 180000},
  "EUR": {"min": 100000, "max": 150000},
  "GBP": {"min": 90000, "max": 130000}
}
*/
```

#### Timezone Pattern
```sql
-- Location with timezone
timezone VARCHAR(100) NOT NULL DEFAULT 'America/New_York',  -- IANA timezone

-- Timezone-aware timestamp
event_date TIMESTAMP WITH TIME ZONE,  -- Always UTC, converted for display
```

---

## 🎯 Key Design Principles

1. **Tenant Isolation First**
   - Every query filtered by `tenant_id`
   - No cross-tenant data access possible
   - Audit logs include tenant context

2. **Global by Design**
   - i18n support built-in from day one
   - Locales, currencies, timezones throughout
   - Translation management system

3. **UTC for Storage, Local for Display**
   - All timestamps stored in UTC
   - Convert to user's timezone only for display
   - Never do date arithmetic in local time

4. **Multilingual Content Management**
   - JSONB for flexible translation storage
   - Fallback chain for missing translations
   - Admin UI for managing translations

5. **Multi-Currency Support**
   - Store amounts with currency code
   - Support multiple currencies per tenant
   - Display in user's preferred currency

6. **Security in Depth**
   - Row-level security policies
   - Application-level filtering
   - Encrypted sensitive fields
   - Comprehensive audit logging

---

## 📊 Data Model Summary

### Firm Profile Module
- `tenants` - Organization configuration
- `locations` - Office locations with timezones
- `departments` - Organizational hierarchy (multilingual)
- `job_titles` - Job title library (multilingual)
- `job_levels` - Career levels with multi-currency ranges
- `pay_schedules` - Timezone-aware payroll schedules
- `payroll_policies` - Region-specific policies
- `benefits_packages` - Benefits templates (multilingual)
- `benefit_items` - Individual benefits (multi-currency)
- `holidays` - Location-specific holidays (multilingual)

### HR Module
- `employees` - Employee profiles
- `employment_history` - Job changes and promotions
- `time_off_policies` - PTO policies
- `time_off_balances` - Current balances
- `time_off_requests` - PTO requests
- `time_entries` - Clock in/out records
- `timesheets` - Pay period timesheets
- `payroll_records` - Pay history (multi-currency)
- `benefits_enrollments` - Employee benefits
- `performance_reviews` - Annual reviews
- `goals` - Employee goals
- `onboarding_tasks` - New hire checklists
- `surveys` - Employee surveys

**Total Tables:** 40+ tables across both modules

---

## 🚀 Implementation Roadmap

### Phase 1: Foundation (Weeks 1-4)
- ✅ Multi-tenant database schema
- ✅ Tenant context middleware
- ✅ i18n translation service
- ✅ Authentication with tenant scoping
- ✅ Basic CRUD for tenants

### Phase 2: i18n Infrastructure (Weeks 5-6)
- ✅ Translation database and caching
- ✅ Date/time formatting services
- ✅ Currency formatting services
- ✅ Locale resolution logic
- ✅ Multilingual content UI components

### Phase 3: Firm Profile Module (Weeks 7-10)
- 🔄 Location management
- 🔄 Department hierarchy
- 🔄 Job titles and levels
- 🔄 Payroll schedules
- 🔄 Benefits packages
- 🔄 Holiday calendars

### Phase 4: HR Module (Weeks 11-16)
- 📝 Employee management
- 📝 Time off system
- 📝 Attendance tracking
- 📝 Payroll integration
- 📝 Performance reviews
- 📝 Onboarding

### Phase 5: Additional Modules (Weeks 17+)
- 📝 Recruiting
- 📝 Accounting
- 📝 Expense Management
- 📝 HelpDesk
- 📝 Accounts Payable

---

## 🧪 Testing Strategy

### Unit Tests
- ✅ Tenant isolation (cross-tenant access prevented)
- ✅ i18n fallback chain
- ✅ Date timezone conversion
- ✅ Currency formatting
- ✅ Multilingual content validation

### Integration Tests
- ✅ API locale negotiation
- ✅ Multi-tenant data isolation
- ✅ Timezone-aware queries
- ✅ Multi-currency calculations

### E2E Tests
- ✅ User switches locale, UI updates
- ✅ Dates displayed in user's timezone
- ✅ Currency formatted per locale
- ✅ Tenant A cannot access Tenant B data

---

## 📖 API Standards

### Request Headers
```http
Authorization: Bearer <JWT>
Accept-Language: es-ES,en-US;q=0.9
X-Tenant-ID: <tenant-uuid>  # Optional, extracted from JWT
```

### Response Format
```json
{
  "success": true,
  "data": {
    "id": "uuid",
    "name": "Ingeniería",  // Localized to user's language
    "name_i18n": {
      "en-US": "Engineering",
      "es-ES": "Ingeniería",
      "fr-FR": "Ingénierie"
    }
  },
  "meta": {
    "user_locale": "es-ES",
    "user_timezone": "Europe/Madrid",
    "user_currency": "EUR",
    "tenant_id": "uuid",
    "timestamp": "2025-12-01T10:30:00Z"
  }
}
```

### Error Response (Localized)
```json
{
  "success": false,
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "El correo electrónico es requerido",
    "message_key": "validation.email.required",
    "details": [...]
  },
  "meta": {
    "user_locale": "es-ES",
    "request_id": "uuid"
  }
}
```

---

## 🔐 Security & Compliance

### Multi-Tenant Security
- Row-level security (RLS) policies in PostgreSQL
- Application-level tenant filtering
- Audit logging with tenant context
- No cross-tenant queries possible

### Data Protection
- TLS 1.3 for data in transit
- AES-256 encryption for data at rest
- Field-level encryption (SSN, bank accounts)
- Encrypted database backups

### Compliance
- GDPR-ready (data residency, right to be forgotten)
- CCPA compliance
- SOC 2 Type II (roadmap)
- Regional data residency (EU data in EU region)

---

## 📞 Contact & Support

**Product Owner:** Product Management Team
**Technical Lead:** Engineering Team
**Documentation:** This repository

---

## 📝 Document History

| Version | Date | Changes |
|---------|------|---------|
| 2.0 | 2025-12-01 | Complete multi-tenant & i18n architecture |
| | | Updated Firm Profile module specification |
| | | Created technical architecture document |
| | | Updated product specification |
| 1.0 | 2025-12-01 | Initial module specifications |
| | | Firm Profile and HR modules |

---

## 🎓 Learning Resources

### Understanding Multi-Tenancy
- See `architecture-technical.md` section "Multi-Tenancy Design"
- Database isolation patterns
- Tenant resolution strategies

### Implementing i18n
- See `architecture-technical.md` section "Internationalization Architecture"
- Translation management
- Date/timezone handling
- Currency formatting

### Code Examples
- See `module-firm-profile.md` for reference implementation
- Database schemas with i18n
- API endpoints with locale support
- UI components for multilingual content

---

**Next Steps:**
1. Review architecture documents
2. Set up development environment
3. Implement multi-tenant database
4. Build i18n infrastructure
5. Develop Firm Profile module
6. Proceed with HR module

---

*For questions or clarifications, please refer to the detailed specifications in each module document.*
