# Technical Architecture: Multi-Tenant SaaS Platform

**Version:** 2.0
**Last Updated:** August 27, 2026
**Status:** Current
**Parent Document:** [Product Specification](./product-specification.md)
**Decisions:** [Architecture Decisions](./05-architecture-decisions.md) — this
document describes *how*; the ADRs record *why* and what was rejected.
**Schema:** [`data-models/schema.sql`](./data-models/schema.sql) — authoritative

> **v2.0 revision.** This document was written against a microservices,
> Redis/Elasticsearch, Kubernetes/Terraform design that has since been replaced.
> It now describes the architecture actually being built: a **modular monolith**
> on **SvelteKit + Node**, backed by **Supabase PostgreSQL** as the only
> datastore, with isolation enforced by **row-level security**. The
> multi-tenancy and internationalization material is substantially unchanged —
> it was correct then and remains correct.

---

## Table of Contents

1. [Architecture Overview](#architecture-overview)
2. [Multi-Tenancy Design](#multi-tenancy-design)
3. [Internationalization (i18n) Architecture](#internationalization-i18n-architecture)
4. [Database Architecture](#database-architecture)
5. [Application Layer Architecture](#application-layer-architecture)
6. [Authentication & Authorization](#authentication--authorization)
7. [Data Isolation & Security](#data-isolation--security)
8. [Performance & Scalability](#performance--scalability)
9. [Deployment Architecture](#deployment-architecture)
10. [Monitoring & Observability](#monitoring--observability)

---

## Architecture Overview

### System Design Principles

1. **Multi-Tenancy First**: Every component designed for multiple organizations sharing infrastructure
2. **Data Isolation**: Enforced by PostgreSQL row-level security, not by remembering to filter
3. **Modular Monolith**: Modules are code boundaries inside one deployable, sharing one
   database and one transaction scope — not independently deployable services
4. **Global by Design**: Full internationalization support from day one
5. **Boring Infrastructure**: Vertical scaling first; no orchestration platform, message
   broker, or additional datastore until a measured problem requires one
6. **Secure**: Defense in depth with multiple security layers
7. **Observable**: Structured logging, `pg_stat_statements`, health checks

> These principles are the summary. The reasoning, alternatives considered, and
> what each decision costs are recorded in
> [Architecture Decisions](./05-architecture-decisions.md).

### High-Level Architecture Diagram

```
┌─────────────────────────────────────────────────────────────────────┐
│                            EDGE                                      │
│         CDN  ·  WAF  ·  DNS  ·  TLS termination                     │
│         (*.platform.com wildcard → application host)                │
└─────────────────────────────────────────────────────────────────────┘
                                │
                                ▼
┌─────────────────────────────────────────────────────────────────────┐
│         APPLICATION — SvelteKit on Node (single deployable)         │
│                                                                       │
│   hooks.server.ts                                                    │
│   ┌───────────────┐   ┌──────────────┐   ┌──────────────┐          │
│   │ Tenant        │ → │ Auth /       │ → │ Locale       │          │
│   │ resolution    │   │ JWT verify   │   │ resolution   │          │
│   │ (subdomain)   │   │ (Supabase)   │   │              │          │
│   └───────────────┘   └──────────────┘   └──────────────┘          │
│              └──────────► event.locals { tenantId, user, locale }   │
│                                │                                      │
│   Routes                       ▼                                      │
│   +page.server.ts (load, form actions)   ·   +server.ts (REST API)  │
│                                │                                      │
│   $lib/server/  ── build-enforced server-only boundary ──           │
│   ┌──────────────────────────────────────────────────────────────┐ │
│   │  Modules: firm · hr · payroll · compensation · ticketing ·   │ │
│   │           projects · time-tracking · accounting · ai         │ │
│   │  One process, one database, one transaction scope.           │ │
│   │  Cross-module workflows are ordinary transactions.           │ │
│   └──────────────────────────────────────────────────────────────┘ │
│   ┌──────────────────────────────────────────────────────────────┐ │
│   │  Repository layer — owns the per-request transaction:        │ │
│   │  BEGIN; SET LOCAL request.jwt.claims = '…'; …; COMMIT;       │ │
│   └──────────────────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────────────────┘
        │                                              │
        │ direct connection :5432                      │ same image, --worker
        ▼                                              ▼
┌───────────────────────────────────┐    ┌─────────────────────────────┐
│  SUPABASE                          │    │  WORKER PROCESS             │
│  ┌──────────────────────────────┐ │    │  Claims jobs with           │
│  │ PostgreSQL                    │ │◄───┤  SELECT … FOR UPDATE        │
│  │  • shared schema, tenant_id   │ │    │  SKIP LOCKED                │
│  │  • RLS FORCED on every table  │ │    │  · payroll runs             │
│  │  • tsvector + GIN search      │ │    │  · CSV/PDF exports          │
│  │  • jobs queue table           │ │    │  · scheduled accruals       │
│  └──────────────────────────────┘ │    └─────────────────────────────┘
│  ┌──────────────┐  ┌────────────┐ │
│  │ Auth (GoTrue)│  │  Storage   │ │
│  │ sessions,MFA │  │  documents │ │
│  │ OAuth/SSO    │  │  exports   │ │
│  └──────────────┘  └────────────┘ │
└───────────────────────────────────┘

Region colocation is a hard constraint: every request makes several database
round trips, so the application host's region must match the Supabase project's.
```

## Multi-Tenancy Design

### Tenancy Model: Shared Database, Shared Schema

We use a **shared database, shared schema** approach with tenant isolation via `tenant_id` column.

**Why This Approach?**
- ✅ **Cost-Effective**: Single database for all tenants reduces infrastructure costs
- ✅ **Easy Maintenance**: Schema changes applied once across all tenants
- ✅ **Resource Efficiency**: Better resource utilization than database-per-tenant
- ✅ **Scalability**: Can support thousands of tenants in single database
- ❌ **Complexity**: Requires strict tenant isolation in application code
- ❌ **Noisy Neighbor**: One tenant's load can affect others (mitigated with proper indexing)

**Alternative Considered**: Database-per-tenant — the model Odoo uses (one
application process, many databases, routed by hostname). It offers better
isolation and makes private deployment trivial, but per-tenant overhead
(connections, memory, per-database backup, and a migration loop across every
tenant) does not amortize, and it shows up in per-seat pricing. Rejected on cost
structure. Full reasoning in
[ADR-003](./05-architecture-decisions.md#adr-003-shared-schema-multi-tenancy-with-row-level-security).

**Isolation mechanism**: `tenant_id` on every tenant-owned table, PostgreSQL
row-level security `ENABLE`d and `FORCE`d on all 93 tables, and an application
role that is *not* the table owner. `FORCE` matters: without it RLS is silently
bypassed by the owner, which is how a system that "has RLS" turns out not to.

### Database Routing (ADR-009)

The application is deployed **once**. Which database a request reaches is
resolved per request from the subdomain, so customers can sit on the shared
multi-tenant database, on a dedicated database we host, or on a database in
their own infrastructure — with no separate deployment for any of them.

```
                    ONE shared SvelteKit deployment
                                 │
                    control plane: subdomain → target
                                 │
        ┌────────────────────────┼────────────────────────┐
        ▼                        ▼                        ▼
   Tier A: shared          Tier B: dedicated       Tier C: customer-hosted
   many tenants,           one tenant, we host,    one tenant, their infra,
   tenant_id + RLS         same region             reached over a tunnel
        │                        │                        │
        └────────── same schema, same code ───────────────┘
```

**The tenant registry cannot live in a tenant's own database** — routing happens
before we know which database that is. It lives in a small central control
plane, holding `subdomain`, `tier`, a *reference* to the connection secret
(never the DSN itself), and the `schema_version` that target is on.

The connection router keeps a bounded, LRU-evicted map of pools. Dedicated pools
stay small (2–4) because connections, not CPU, are the scarce resource once
there are many targets.

Two consequences worth stating here, with the full reasoning in
[ADR-009](./05-architecture-decisions.md#adr-009-subdomain-routed-database-targets):

- **Expand/contract migrations become mandatory.** One application version now
  faces databases at different schema versions, and a customer-hosted target
  migrates on the customer's timetable, not ours.
- **Tier C does not satisfy a data-sovereignty requirement.** Data at rest is
  theirs; data in transit and in memory still passes through our infrastructure.
  A customer who needs genuine custody needs the self-hosted appliance, not
  this.

### Tenant Identification

#### 1. Subdomain-Based Routing

Each organization gets a unique subdomain:
- `acme.platform.com` → Acme Corporation (tenant_id: uuid-1)
- `globex.platform.com` → Globex Inc (tenant_id: uuid-2)
- `initech.platform.com` → Initech LLC (tenant_id: uuid-3)

**DNS Configuration**:
```
*.platform.com  →  CDN / WAF (wildcard certificate)
                →  application host (SvelteKit container)
```

#### 2. Tenant Resolution Flow

```
1. User visits: https://acme.platform.com/login
   ↓
2. DNS resolves to the CDN, which forwards to the single shared application
   ↓
3. hooks.server.ts extracts the subdomain: "acme"
   ↓
4. CONTROL PLANE lookup (cached in process, short TTL):
   SELECT tenant_id, tier, connection_secret_ref, schema_version
     FROM tenant_registry WHERE subdomain = 'acme'
   ↓
5. Connection router returns a pool for that tenant's TARGET DATABASE —
   the shared instance, a dedicated instance we host, or the customer's own
   (ADR-009). The rest of the request does not know or care which.
   ↓
6. event.locals = { tenantId, tier, sql }
   ↓
7. The repository layer opens a transaction on that connection and sets the
   tenant for RLS:
   BEGIN; SET LOCAL request.jwt.claims = '{"app_metadata":{"tenant_id":"..."}}';
   ↓
8. Every query is filtered by the database itself. On a dedicated database the
   filter is trivially satisfied (one tenant), which is why the same code runs
   unchanged against every tier.
```

> **Why the tenant is set on the connection, not just in application code.**
> Under ADR-003 isolation is enforced by PostgreSQL row-level security. The
> application still passes `tenantId` explicitly to repository functions (so a
> missing filter is a type error), but RLS is the backstop that makes a mistake
> non-fatal. See [ADR-003](./05-architecture-decisions.md#adr-003-shared-schema-multi-tenancy-with-row-level-security).

#### 3. Tenant Context Middleware (Node.js Example)

```typescript
// middleware/tenant-context.ts
import { Request, Response, NextFunction } from 'express';
import { getRepository } from 'typeorm';
import { Tenant } from '../entities/Tenant';

export async function tenantContext(
  req: Request,
  res: Response,
  next: NextFunction
) {
  try {
    // Extract subdomain from host header
    const host = req.hostname; // e.g., "acme.platform.com"
    const subdomain = host.split('.')[0];

    // Special case for main domain or API
    if (subdomain === 'platform' || subdomain === 'api' || subdomain === 'www') {
      return next(); // No tenant context needed
    }

    // Resolve tenant from cache or database
    let tenant = await getTenantFromCache(subdomain);

    if (!tenant) {
      const tenantRepo = getRepository(Tenant);
      tenant = await tenantRepo.findOne({
        where: { subdomain, is_active: true },
        cache: true // Cache for 5 minutes
      });

      if (!tenant) {
        return res.status(404).json({
          error: 'TENANT_NOT_FOUND',
          message: 'Organization not found'
        });
      }

      await cacheTenant(subdomain, tenant);
    }

    // Attach to request context
    req.tenant = tenant;
    req.tenantId = tenant.id;

    // Set tenant context for database queries
    req.queryContext = { tenant_id: tenant.id };

    next();
  } catch (error) {
    console.error('Tenant resolution error:', error);
    res.status(500).json({
      error: 'TENANT_RESOLUTION_FAILED',
      message: 'Unable to resolve organization'
    });
  }
}

// Cache implementation — in-process, no cache server (ADR-002)
const tenantCache = new Map<string, { tenant: Tenant; expires: number }>();
const TENANT_TTL_MS = 5 * 60 * 1000;

function getTenantFromCache(subdomain: string): Tenant | null {
  const hit = tenantCache.get(subdomain);
  if (!hit || hit.expires <= Date.now()) return null;
  return hit.tenant;
}

function cacheTenant(subdomain: string, tenant: Tenant): void {
  tenantCache.set(subdomain, { tenant, expires: Date.now() + TENANT_TTL_MS });
}
```

### Tenant Data Model

#### Core Tenants Table

```sql
CREATE TABLE tenants (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    -- Identity
    subdomain VARCHAR(100) UNIQUE NOT NULL,
    company_name VARCHAR(255) NOT NULL,

    -- Regional settings
    region VARCHAR(50) NOT NULL DEFAULT 'us-east-1', -- AWS region for data residency
    timezone VARCHAR(100) NOT NULL DEFAULT 'America/New_York',
    locale VARCHAR(10) NOT NULL DEFAULT 'en-US', -- Default locale for organization

    -- Internationalization settings
    supported_locales VARCHAR(10)[] DEFAULT ARRAY['en-US'], -- ['en-US', 'es-ES', 'fr-FR']
    default_currency VARCHAR(3) NOT NULL DEFAULT 'USD',
    supported_currencies VARCHAR(3)[] DEFAULT ARRAY['USD'],
    date_format VARCHAR(50) DEFAULT 'MM/DD/YYYY', -- Can be overridden per user
    time_format VARCHAR(10) DEFAULT '12h', -- '12h' or '24h'
    number_format VARCHAR(50) DEFAULT 'en-US', -- Locale for number formatting

    -- Subscription & limits
    plan_tier VARCHAR(50) NOT NULL DEFAULT 'starter', -- starter, professional, enterprise
    max_employees INT DEFAULT 50,
    max_storage_gb INT DEFAULT 10,
    features JSONB DEFAULT '{}', -- {recruiting: true, accounting: false, ...}

    -- Billing
    billing_email VARCHAR(255),
    billing_status VARCHAR(50) DEFAULT 'active', -- active, suspended, cancelled
    subscription_start_date TIMESTAMP WITH TIME ZONE,
    subscription_end_date TIMESTAMP WITH TIME ZONE,

    -- Status
    is_active BOOLEAN DEFAULT TRUE,
    is_suspended BOOLEAN DEFAULT FALSE,
    suspension_reason TEXT,

    -- Data residency & compliance
    data_residency_country VARCHAR(2), -- ISO 3166-1 alpha-2
    gdpr_applicable BOOLEAN DEFAULT FALSE,

    -- Metadata
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,

    -- Indexes
    CONSTRAINT check_subdomain_format CHECK (subdomain ~* '^[a-z0-9-]{3,50}$')
);

CREATE INDEX idx_tenants_subdomain ON tenants(subdomain) WHERE is_active = TRUE;
CREATE INDEX idx_tenants_region ON tenants(region);
CREATE INDEX idx_tenants_billing_status ON tenants(billing_status);
```

#### Tenant Settings Table (Extended Configuration)

```sql
CREATE TABLE tenant_settings (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,

    -- Setting category
    category VARCHAR(100) NOT NULL, -- 'i18n', 'security', 'features', 'integrations'
    setting_key VARCHAR(100) NOT NULL,
    setting_value JSONB NOT NULL,

    -- Metadata
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_by UUID,

    UNIQUE(tenant_id, category, setting_key)
);

CREATE INDEX idx_tenant_settings_tenant ON tenant_settings(tenant_id);
CREATE INDEX idx_tenant_settings_category ON tenant_settings(category);

-- Example settings:
-- category: 'i18n', key: 'date_formats', value: {"short": "MM/DD/YY", "long": "MMMM DD, YYYY"}
-- category: 'i18n', key: 'currency_display', value: {"symbol_position": "before", "decimal_separator": "."}
-- category: 'security', key: 'password_policy', value: {"min_length": 12, "require_special": true}
```

---

## Internationalization (i18n) Architecture

### i18n Strategy Overview

**Multi-Layer Internationalization**:
1. **Database Layer**: Store locale-specific data
2. **Application Layer**: Runtime translation and formatting
3. **API Layer**: Accept/return locale-specific responses
4. **UI Layer**: Client-side rendering with i18n libraries

### Supported Locales (Launch)

**Phase 1** (Initial Launch):
- `en-US` - English (United States) - **Default**
- `en-GB` - English (United Kingdom)
- `es-ES` - Spanish (Spain)
- `es-MX` - Spanish (Mexico)
- `fr-FR` - French (France)
- `de-DE` - German (Germany)

**Phase 2** (6 months):
- `pt-BR` - Portuguese (Brazil)
- `ja-JP` - Japanese (Japan)
- `zh-CN` - Chinese (Simplified)
- `it-IT` - Italian (Italy)
- `nl-NL` - Dutch (Netherlands)

### Locale Resolution Strategy

**Priority Order**:
1. User's explicit locale preference (from user profile)
2. Request header: `Accept-Language`
3. Organization's default locale (from tenant settings)
4. System default: `en-US`

```typescript
// services/i18n/locale-resolver.ts
export function resolveLocale(req: Request): string {
  // 1. User preference (if authenticated)
  if (req.user?.locale) {
    return req.user.locale;
  }

  // 2. Accept-Language header
  const acceptLanguage = req.headers['accept-language'];
  if (acceptLanguage) {
    const preferred = parseAcceptLanguage(acceptLanguage);
    const supported = req.tenant.supported_locales;

    for (const locale of preferred) {
      if (supported.includes(locale)) {
        return locale;
      }
    }
  }

  // 3. Tenant default
  if (req.tenant?.locale) {
    return req.tenant.locale;
  }

  // 4. System default
  return 'en-US';
}
```

### Translation Management

#### 1. Translation Keys Structure

Hierarchical namespace approach:

```
module.feature.component.key

Examples:
- common.buttons.save → "Save"
- common.buttons.cancel → "Cancel"
- hr.employees.form.first_name → "First Name"
- hr.employees.form.hire_date → "Hire Date"
- hr.timeoff.types.pto → "Paid Time Off"
- hr.timeoff.types.sick → "Sick Leave"
- accounting.invoices.status.paid → "Paid"
```

#### 2. Translation Storage

**Option A: Database Storage** (Recommended for SaaS)

```sql
CREATE TABLE translations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    -- Translation key
    translation_key VARCHAR(255) NOT NULL, -- e.g., "hr.employees.form.first_name"
    locale VARCHAR(10) NOT NULL, -- e.g., "en-US", "es-ES"

    -- Translation value
    translation_value TEXT NOT NULL, -- Translated text

    -- Context
    module VARCHAR(50), -- hr, accounting, recruiting
    description TEXT, -- Help text for translators

    -- Pluralization support
    plural_forms JSONB, -- {zero: "...", one: "...", many: "..."}

    -- Variables/placeholders
    has_variables BOOLEAN DEFAULT FALSE, -- Contains {{variable}} placeholders

    -- Status
    is_verified BOOLEAN DEFAULT FALSE, -- Reviewed by native speaker
    is_machine_translated BOOLEAN DEFAULT FALSE,

    -- Metadata
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_by UUID,

    UNIQUE(translation_key, locale)
);

CREATE INDEX idx_translations_key ON translations(translation_key);
CREATE INDEX idx_translations_locale ON translations(locale);
CREATE INDEX idx_translations_module ON translations(module);

-- Example data:
INSERT INTO translations (translation_key, locale, translation_value, module) VALUES
('hr.employees.form.first_name', 'en-US', 'First Name', 'hr'),
('hr.employees.form.first_name', 'es-ES', 'Nombre', 'hr'),
('hr.employees.form.first_name', 'fr-FR', 'Prénom', 'hr'),
('hr.employees.form.first_name', 'de-DE', 'Vorname', 'hr');
```

**Caching Strategy**:
- Load all translations for a locale into an in-process cache on first use
- Cache TTL: 1 hour, or until a translation is written
- No Redis: a single shared instance means the cache is per-container and small
  (a few hundred KB per locale), and a stale entry costs at most one hour of a
  changed label. See [ADR-002](./05-architecture-decisions.md#adr-002-postgresql-as-the-only-datastore).

```typescript
// $lib/i18n/translations.ts
import { sql } from '$lib/server/db/client';

type Bundle = Record<string, string>;

const cache = new Map<string, { bundle: Bundle; expires: number }>();
const TTL_MS = 60 * 60 * 1000;

// Platform-supplied rows have tenant_id IS NULL; a tenant may override any key.
export async function getTranslations(
  tenantId: string,
  locale: string,
): Promise<Bundle> {
  const key = `${tenantId}:${locale}`;
  const hit = cache.get(key);
  if (hit && hit.expires > Date.now()) return hit.bundle;

  const rows = await sql<{ key: string; value: string; tenant_id: string | null }[]>`
    SELECT key, value, tenant_id
      FROM translations
     WHERE locale = ${locale}
       AND (tenant_id IS NULL OR tenant_id = ${tenantId})
     ORDER BY tenant_id NULLS FIRST   -- tenant rows overwrite platform rows
  `;

  const bundle: Bundle = {};
  for (const r of rows) bundle[r.key] = r.value;

  cache.set(key, { bundle, expires: Date.now() + TTL_MS });
  return bundle;
}

export function invalidateTranslations(tenantId: string, locale?: string): void {
  if (locale) cache.delete(`${tenantId}:${locale}`);
  else for (const k of cache.keys()) if (k.startsWith(`${tenantId}:`)) cache.delete(k);
}
```

**Why per-container caching is acceptable here.** With a handful of containers,
an invalidation on one does not reach the others — so a label edit can take up to
the TTL to appear everywhere. That is the right trade for removing an entire
service from the stack. If translation edits ever need to be instant across
containers, `LISTEN`/`NOTIFY` on a Postgres channel is the next step, not Redis.

### Date & Time Formatting

#### User Timezone Handling

```sql
-- Add to users table
ALTER TABLE users ADD COLUMN timezone VARCHAR(100) DEFAULT NULL;
ALTER TABLE users ADD COLUMN date_format VARCHAR(50) DEFAULT NULL;
ALTER TABLE users ADD COLUMN time_format VARCHAR(10) DEFAULT NULL;

-- If NULL, inherit from tenant settings
```

#### Date Formatting Service

```typescript
// services/i18n/date-formatter.ts
import { format, utcToZonedTime } from 'date-fns-tz';
import { enUS, es, fr, de } from 'date-fns/locale';

export class DateFormatter {
  private locales = {
    'en-US': enUS,
    'es-ES': es,
    'fr-FR': fr,
    'de-DE': de,
  };

  /**
   * Format date for display to user
   * Always store dates in UTC, convert for display
   */
  formatDate(
    date: Date,
    locale: string,
    timezone: string,
    formatString?: string
  ): string {
    // Convert UTC to user's timezone
    const zonedDate = utcToZonedTime(date, timezone);

    // Get format string from user/tenant preferences
    const fmt = formatString || this.getDateFormat(locale);

    // Format with locale
    return format(zonedDate, fmt, {
      locale: this.locales[locale] || enUS,
      timeZone: timezone
    });
  }

  private getDateFormat(locale: string): string {
    // Date format patterns by locale
    const formats = {
      'en-US': 'MM/dd/yyyy',
      'en-GB': 'dd/MM/yyyy',
      'es-ES': 'dd/MM/yyyy',
      'fr-FR': 'dd/MM/yyyy',
      'de-DE': 'dd.MM.yyyy',
      'ja-JP': 'yyyy/MM/dd',
    };

    return formats[locale] || formats['en-US'];
  }

  /**
   * Format date and time
   */
  formatDateTime(
    date: Date,
    locale: string,
    timezone: string,
    timeFormat: '12h' | '24h' = '12h'
  ): string {
    const zonedDate = utcToZonedTime(date, timezone);

    const dateFormat = this.getDateFormat(locale);
    const timePattern = timeFormat === '24h' ? 'HH:mm' : 'h:mm a';

    return format(zonedDate, `${dateFormat} ${timePattern}`, {
      locale: this.locales[locale] || enUS,
      timeZone: timezone
    });
  }

  /**
   * Relative time: "2 hours ago", "in 3 days"
   */
  formatRelative(date: Date, locale: string): string {
    // Implementation using date-fns formatDistanceToNow
  }
}
```

#### Database Best Practices

**Storage**: Always store dates/times as `TIMESTAMP WITH TIME ZONE` in UTC

```sql
-- GOOD: Stores in UTC
created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP

-- BAD: No timezone info
created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
```

**Queries**: Convert to user timezone for display only

```sql
-- Store in UTC
INSERT INTO time_tracking_entries (employee_id, clock_in)
VALUES ('uuid', '2025-12-01 14:00:00+00');

-- Retrieve and convert to user's timezone (done in app layer)
SELECT clock_in AT TIME ZONE 'America/Los_Angeles' as clock_in_local
FROM time_tracking_entries
WHERE employee_id = 'uuid';
```

### Currency & Number Formatting

#### Multi-Currency Support

```sql
-- Currencies table (ISO 4217 codes)
CREATE TABLE currencies (
    code VARCHAR(3) PRIMARY KEY, -- USD, EUR, GBP, JPY, etc.
    name VARCHAR(100) NOT NULL,
    symbol VARCHAR(10),
    decimal_places INT DEFAULT 2,
    is_active BOOLEAN DEFAULT TRUE
);

INSERT INTO currencies (code, name, symbol, decimal_places) VALUES
('USD', 'US Dollar', '$', 2),
('EUR', 'Euro', '€', 2),
('GBP', 'British Pound', '£', 2),
('JPY', 'Japanese Yen', '¥', 0),
('CAD', 'Canadian Dollar', 'C$', 2),
('AUD', 'Australian Dollar', 'A$', 2),
('CHF', 'Swiss Franc', 'CHF', 2),
('CNY', 'Chinese Yuan', '¥', 2),
('INR', 'Indian Rupee', '₹', 2),
('MXN', 'Mexican Peso', '$', 2);

-- Exchange rates (updated daily)
CREATE TABLE exchange_rates (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    base_currency VARCHAR(3) NOT NULL REFERENCES currencies(code),
    target_currency VARCHAR(3) NOT NULL REFERENCES currencies(code),
    rate DECIMAL(20, 10) NOT NULL,
    effective_date DATE NOT NULL,

    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,

    UNIQUE(base_currency, target_currency, effective_date)
);

CREATE INDEX idx_exchange_rates_date ON exchange_rates(effective_date);
CREATE INDEX idx_exchange_rates_currencies ON exchange_rates(base_currency, target_currency);
```

#### Currency Formatting Service

```typescript
// services/i18n/currency-formatter.ts
export class CurrencyFormatter {
  /**
   * Format currency amount for display
   */
  formatCurrency(
    amount: number,
    currency: string,
    locale: string
  ): string {
    return new Intl.NumberFormat(locale, {
      style: 'currency',
      currency: currency,
    }).format(amount);
  }

  /**
   * Examples:
   * formatCurrency(1234.56, 'USD', 'en-US') → "$1,234.56"
   * formatCurrency(1234.56, 'EUR', 'de-DE') → "1.234,56 €"
   * formatCurrency(1234.56, 'JPY', 'ja-JP') → "¥1,235" (no decimals)
   * formatCurrency(1234.56, 'GBP', 'en-GB') → "£1,234.56"
   */

  /**
   * Format number (not currency)
   */
  formatNumber(
    value: number,
    locale: string,
    options?: Intl.NumberFormatOptions
  ): string {
    return new Intl.NumberFormat(locale, options).format(value);
  }

  /**
   * Examples:
   * formatNumber(1234567.89, 'en-US') → "1,234,567.89"
   * formatNumber(1234567.89, 'de-DE') → "1.234.567,89"
   * formatNumber(1234567.89, 'fr-FR') → "1 234 567,89"
   * formatNumber(0.85, 'en-US', {style: 'percent'}) → "85%"
   */

  /**
   * Convert between currencies
   */
  async convertCurrency(
    amount: number,
    fromCurrency: string,
    toCurrency: string,
    date?: Date
  ): Promise<number> {
    // Get exchange rate from database or cache
    const rate = await this.getExchangeRate(fromCurrency, toCurrency, date);
    return amount * rate;
  }
}
```

#### Storing Monetary Values

```sql
-- Always store amount AND currency
CREATE TABLE invoices (
    id UUID PRIMARY KEY,
    amount DECIMAL(12, 2) NOT NULL,
    currency VARCHAR(3) NOT NULL REFERENCES currencies(code),
    -- ...
);

-- For multi-currency reporting
CREATE TABLE payroll_records (
    id UUID PRIMARY KEY,

    -- Store in employee's local currency
    gross_pay DECIMAL(12, 2) NOT NULL,
    currency VARCHAR(3) NOT NULL,

    -- Optional: Store converted amount in company's base currency
    gross_pay_base_currency DECIMAL(12, 2),
    base_currency VARCHAR(3),
    exchange_rate DECIMAL(20, 10),

    -- ...
);
```

### Language-Specific Content

#### Database Schema for Multilingual Fields

For fields that need to support multiple languages (e.g., job descriptions):

**Option 1: JSONB Column** (Recommended)

```sql
CREATE TABLE firm_job_titles (
    id UUID PRIMARY KEY,
    tenant_id UUID NOT NULL,

    -- Default title (fallback)
    title VARCHAR(255) NOT NULL,

    -- Multilingual titles
    title_i18n JSONB, -- {"en-US": "Software Engineer", "es-ES": "Ingeniero de Software", "fr-FR": "Ingénieur Logiciel"}

    -- Default description (fallback)
    description TEXT,

    -- Multilingual descriptions
    description_i18n JSONB,

    -- ...
);

-- Query for user's locale
SELECT
    id,
    COALESCE(title_i18n->>'es-ES', title) as title,
    COALESCE(description_i18n->>'es-ES', description) as description
FROM firm_job_titles
WHERE tenant_id = 'uuid';
```

**Helper Function**:

```typescript
// utils/i18n-helpers.ts
export function getLocalizedField(
  obj: any,
  fieldName: string,
  locale: string,
  fallbackLocale: string = 'en-US'
): string {
  const i18nField = `${fieldName}_i18n`;

  if (obj[i18nField]) {
    return obj[i18nField][locale]
        || obj[i18nField][fallbackLocale]
        || obj[fieldName];
  }

  return obj[fieldName];
}

// Usage:
const title = getLocalizedField(jobTitle, 'title', userLocale);
const description = getLocalizedField(jobTitle, 'description', userLocale);
```

### Address Formatting

Different countries have different address formats:

```typescript
// services/i18n/address-formatter.ts
export class AddressFormatter {
  private templates = {
    'US': '{line1}\n{line2}\n{city}, {state} {postal_code}\n{country}',
    'GB': '{line1}\n{line2}\n{city}\n{state}\n{postal_code}\n{country}',
    'DE': '{line1}\n{line2}\n{postal_code} {city}\n{country}',
    'JP': '{postal_code}\n{state}{city}\n{line1}\n{line2}\n{country}',
  };

  formatAddress(address: Address, country: string): string {
    const template = this.templates[country] || this.templates['US'];

    return template
      .replace('{line1}', address.line1 || '')
      .replace('{line2}', address.line2 || '')
      .replace('{city}', address.city || '')
      .replace('{state}', address.state || '')
      .replace('{postal_code}', address.postal_code || '')
      .replace('{country}', this.getCountryName(country, address.locale))
      .split('\n')
      .filter(line => line.trim())
      .join('\n');
  }
}
```

### Phone Number Formatting

```typescript
// services/i18n/phone-formatter.ts
import { parsePhoneNumber } from 'libphonenumber-js';

export class PhoneFormatter {
  formatPhone(phone: string, country: string): string {
    try {
      const parsed = parsePhoneNumber(phone, country);
      return parsed.formatInternational();
    } catch {
      return phone; // Return as-is if parsing fails
    }
  }

  /**
   * Examples:
   * formatPhone('+14155551234', 'US') → "+1 415 555 1234"
   * formatPhone('+442012345678', 'GB') → "+44 20 1234 5678"
   * formatPhone('+81312345678', 'JP') → "+81 3-1234-5678"
   */
}
```

---

## Database Architecture

### Multi-Tenant Database Design Patterns

#### Pattern 1: Tenant ID in Every Table (Our Approach)

```sql
-- Every table includes tenant_id
CREATE TABLE employees (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(id), -- REQUIRED on every table

    -- Employee fields
    first_name VARCHAR(100) NOT NULL,
    last_name VARCHAR(100) NOT NULL,
    email VARCHAR(255) NOT NULL,
    -- ...

    -- Composite unique constraints include tenant_id
    UNIQUE(tenant_id, email)
);

-- Indexes MUST include tenant_id as first column for query efficiency
CREATE INDEX idx_employees_tenant ON employees(tenant_id);
CREATE INDEX idx_employees_tenant_status ON employees(tenant_id, employment_status);
CREATE INDEX idx_employees_tenant_department ON employees(tenant_id, current_department_id);
```

**Critical Rule**: Every query MUST include `WHERE tenant_id = ?`

```typescript
// GOOD: Includes tenant filter
const employees = await db.employees.find({
  where: {
    tenant_id: req.tenantId,
    employment_status: 'active'
  }
});

// BAD: Missing tenant filter - SECURITY VULNERABILITY!
const employees = await db.employees.find({
  where: {
    employment_status: 'active'
  }
});
```

#### Enforcing Tenant Isolation

**Option A: Database Triggers** (Additional safety layer)

```sql
-- Example trigger to prevent cross-tenant data access
CREATE OR REPLACE FUNCTION check_tenant_access()
RETURNS TRIGGER AS $$
BEGIN
    -- Get current tenant_id from session variable
    IF current_setting('app.current_tenant_id', true) IS NULL THEN
        RAISE EXCEPTION 'No tenant context set';
    END IF;

    IF NEW.tenant_id != current_setting('app.current_tenant_id', true)::UUID THEN
        RAISE EXCEPTION 'Cross-tenant data access denied';
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Apply to all tenant-scoped tables
CREATE TRIGGER enforce_tenant_employees
    BEFORE INSERT OR UPDATE ON employees
    FOR EACH ROW
    EXECUTE FUNCTION check_tenant_access();
```

**Option B: Row-Level Security (RLS)** (PostgreSQL 9.5+)

```sql
-- Enable RLS on table
ALTER TABLE employees ENABLE ROW LEVEL SECURITY;

-- Policy: Users can only access their tenant's data
CREATE POLICY tenant_isolation_policy ON employees
    USING (tenant_id = current_setting('app.current_tenant_id', true)::UUID);

-- Set tenant context in application
-- Before each request
SET LOCAL app.current_tenant_id = 'uuid-of-tenant';
```

**Option C: Repository-Layer Enforcement** (what we use, alongside RLS)

There is no ORM ([ADR-004](./05-architecture-decisions.md#adr-004-sveltekit-as-the-full-stack):
hand-written SQL for anything with a join). Instead, tenant scoping is enforced
by the *shape of the code*: every repository function takes `tenantId` as a
required first parameter, so omitting it is a compile error rather than a silent
cross-tenant read.

```typescript
// $lib/server/modules/hr/employees.repo.ts
import type { TransactionSql } from 'postgres';

// tenantId is required and first — this signature is the convention across
// every repository in every module.
export async function listEmployees(
  tx: TransactionSql,
  tenantId: string,
  opts: { departmentCode?: string; limit?: number } = {},
) {
  return tx`
    SELECT e.id, e.employee_id, e.first_name, e.last_name, e.email,
           d.name AS department_name
      FROM employees e
      LEFT JOIN firm_departments d
             ON d.tenant_id = e.tenant_id           -- join is tenant-scoped too
            AND d.department_code = e.department_code
     WHERE e.tenant_id = ${tenantId}
       AND e.is_active
       ${opts.departmentCode ? tx`AND e.department_code = ${opts.departmentCode}` : tx``}
     ORDER BY e.last_name, e.first_name
     LIMIT ${opts.limit ?? 100}
  `;
}
```

**Defence in depth.** Three independent mechanisms must all fail before a leak:

| Layer | Mechanism | Fails when |
|---|---|---|
| 1 | `tenantId` required in every repository signature | Someone writes raw SQL outside a repository |
| 2 | Explicit `WHERE tenant_id = …` in the query | A predicate is forgotten |
| 3 | **PostgreSQL RLS**, `FORCE`d, non-owner role | Only if RLS is misconfigured |

Layers 1 and 2 are conventions and will occasionally be broken by a hurried
change. Layer 3 is the database refusing to return the rows, and it is why the
first two being imperfect is survivable.

**Notably absent:** an ORM global filter or query interceptor. Those work until
someone writes a raw query, which on the accounting and payroll reporting paths
is routine — exactly where a leak would be most damaging.

### Database Indexing Strategy

```sql
-- Indexes for multi-tenant queries

-- 1. Always include tenant_id as first column in composite indexes
CREATE INDEX idx_employees_tenant_email ON employees(tenant_id, email);
CREATE INDEX idx_employees_tenant_dept_status ON employees(tenant_id, department_id, employment_status);

-- 2. Partial indexes for common queries
CREATE INDEX idx_employees_active ON employees(tenant_id, id)
    WHERE employment_status = 'active';

-- 3. GIN indexes for JSONB i18n fields
CREATE INDEX idx_job_titles_i18n ON job_titles USING GIN (title_i18n);
CREATE INDEX idx_job_titles_description_i18n ON job_titles USING GIN (description_i18n);

-- 4. Full-text search — PostgreSQL FTS is the only search engine (ADR-002).
--    tenant_id leads the index via btree_gin so isolation and search compose.
CREATE INDEX idx_employees_fulltext ON employees
    USING GIN (tenant_id, to_tsvector('simple',
        coalesce(first_name,'') || ' ' || coalesce(last_name,'') || ' ' || coalesce(email,'')));
```

### Database Connection Pooling

We run long-lived containers, so we connect **directly on port 5432** and keep
our own pool. Supabase's transaction-mode pooler (port 6543) is designed for
serverless and does not support prepared statements; use session-mode Supavisor
(also 5432) only if the host is IPv4-only.

```typescript
// $lib/server/db/client.ts
import postgres from 'postgres';

export const sql = postgres(process.env.DATABASE_URL!, {
  max: 20,                    // per container; size against Supabase's limit
  idle_timeout: 30,
  connect_timeout: 5,
  prepare: true,              // safe on a direct/session connection
  connection: {
    statement_timeout: 10_000,   // no single query may exceed 10s
    application_name: 'kaaj-web',
  },
});
```

#### The per-request transaction

Every request runs inside one transaction that sets the tenant for RLS. The
repository layer owns this, so no call site can forget it:

```typescript
// $lib/server/db/tx.ts
export async function withTenant<T>(
  tenantId: string,
  userId: string,
  fn: (tx: postgres.TransactionSql) => Promise<T>,
): Promise<T> {
  return sql.begin(async (tx) => {
    const claims = JSON.stringify({
      sub: userId,
      app_metadata: { tenant_id: tenantId },
    });
    await tx`SELECT set_config('request.jwt.claims', ${claims}, true)`;
    return fn(tx);
  });
}
```

`set_config(..., true)` is the function form of `SET LOCAL` — scoped to the
transaction and reset when it ends, so a pooled connection never carries one
tenant's context into another's request. `auth.jwt()` reads exactly this setting,
which is why policies written in the Supabase idiom work identically whether a
query arrives via PostgREST or through our own connection.

**Sizing.** Connections are the scarcest resource on a shared Postgres. Keep
`max` low per container and scale containers rather than pool size; a payroll
run should be in the worker process, not holding a web connection.

### Data Partitioning (Future Optimization)

For very large deployments, consider table partitioning by tenant:

```sql
-- Partition employees table by tenant_id (hash partitioning)
CREATE TABLE employees (
    id UUID NOT NULL,
    tenant_id UUID NOT NULL,
    -- ... other columns
) PARTITION BY HASH (tenant_id);

-- Create partitions
CREATE TABLE employees_p0 PARTITION OF employees FOR VALUES WITH (MODULUS 4, REMAINDER 0);
CREATE TABLE employees_p1 PARTITION OF employees FOR VALUES WITH (MODULUS 4, REMAINDER 1);
CREATE TABLE employees_p2 PARTITION OF employees FOR VALUES WITH (MODULUS 4, REMAINDER 2);
CREATE TABLE employees_p3 PARTITION OF employees FOR VALUES WITH (MODULUS 4, REMAINDER 3);
```

---

## Application Layer Architecture

### Application Structure

SvelteKit is both the frontend and the backend ([ADR-004](./05-architecture-decisions.md#adr-004-sveltekit-as-the-full-stack));
there is no separate API service. Modules are directories, not deployables.

```
src/
├── hooks.server.ts            # Tenant + auth + locale resolution (one choke point)
├── lib/
│   ├── server/                # ── build-enforced server-only boundary ──
│   │   │                      #    SvelteKit fails the build if client code
│   │   │                      #    imports anything under here.
│   │   ├── db/
│   │   │   ├── client.ts      # postgres.js pool
│   │   │   ├── tx.ts          # per-request transaction + SET LOCAL claims
│   │   │   └── migrations/
│   │   ├── modules/           # Business logic — one directory per module
│   │   │   ├── hr/
│   │   │   │   ├── employees.repo.ts     # every fn takes tenantId first
│   │   │   │   ├── timeoff.repo.ts
│   │   │   │   └── onboarding.service.ts # cross-module workflows (UC-1.1)
│   │   │   ├── payroll/
│   │   │   ├── compensation/
│   │   │   ├── accounting/
│   │   │   ├── ticketing/
│   │   │   ├── projects/
│   │   │   ├── time-tracking/
│   │   │   └── ai-assistant/
│   │   ├── auth/              # Supabase JWT verification, claims
│   │   └── jobs/              # SKIP LOCKED queue producer/consumer
│   ├── i18n/                  # Shared: runs on client and server
│   │   ├── locale.ts
│   │   ├── dates.ts
│   │   ├── currency.ts
│   │   └── translations.ts
│   ├── validation/            # validation-utils.js — 33 country-specific
│   │   └── index.ts           # validators, shared client + server
│   └── components/
├── routes/
│   ├── +layout.server.ts      # tenant + user into the page graph
│   ├── (app)/
│   │   ├── employees/
│   │   │   ├── +page.server.ts   # load() + form actions
│   │   │   └── +page.svelte
│   │   ├── payroll/
│   │   └── …
│   └── api/                   # +server.ts — the public REST surface
│       └── v1/
└── worker.ts                  # Same image, --worker: payroll runs, exports
```

**Module boundary rule.** A module may import another module's *service*
functions, never its repositories or tables directly. This keeps boundaries
reviewable without turning them into network calls. Cross-module workflows run
in one transaction — see
[ADR-001](./05-architecture-decisions.md#adr-001-modular-monolith-not-microservices).

### Request Context Management

Using AsyncLocalStorage for tenant/user context:

```typescript
// utils/async-context.ts
import { AsyncLocalStorage } from 'async_hooks';

interface RequestContext {
  tenantId: string;
  tenant: Tenant;
  userId?: string;
  user?: User;
  locale: string;
  timezone: string;
  currency: string;
}

export const asyncLocalStorage = new AsyncLocalStorage<RequestContext>();

export function getContext(): RequestContext {
  const context = asyncLocalStorage.getStore();
  if (!context) {
    throw new Error('No request context available');
  }
  return context;
}

export function getTenantId(): string {
  return getContext().tenantId;
}

export function getLocale(): string {
  return getContext().locale;
}

export function getTimezone(): string {
  return getContext().timezone;
}

// middleware/context.ts
export function contextMiddleware(req: Request, res: Response, next: NextFunction) {
  const context: RequestContext = {
    tenantId: req.tenantId,
    tenant: req.tenant,
    userId: req.user?.id,
    user: req.user,
    locale: resolveLocale(req),
    timezone: resolveTimezone(req),
    currency: resolveCurrency(req),
  };

  asyncLocalStorage.run(context, () => {
    next();
  });
}
```

### Base Repository Pattern

```typescript
// repositories/BaseRepository.ts
import { Repository, FindConditions, FindManyOptions } from 'typeorm';
import { getTenantId } from '../utils/async-context';

export class TenantScopedRepository<Entity> extends Repository<Entity> {

  /**
   * Override find to always include tenant filter
   */
  async find(options?: FindManyOptions<Entity>): Promise<Entity[]> {
    const tenantId = getTenantId();

    return super.find({
      ...options,
      where: {
        tenant_id: tenantId,
        ...(options?.where || {})
      }
    });
  }

  /**
   * Override findOne to always include tenant filter
   */
  async findOne(
    conditions?: FindConditions<Entity>,
    options?: FindOneOptions<Entity>
  ): Promise<Entity | undefined> {
    const tenantId = getTenantId();

    return super.findOne({
      tenant_id: tenantId,
      ...conditions
    }, options);
  }

  /**
   * Override save to auto-inject tenant_id
   */
  async save<T extends DeepPartial<Entity>>(entity: T): Promise<T> {
    const tenantId = getTenantId();

    if (!entity['tenant_id']) {
      entity['tenant_id'] = tenantId;
    } else if (entity['tenant_id'] !== tenantId) {
      throw new Error('Cannot save entity for different tenant');
    }

    return super.save(entity);
  }
}
```

---

## Authentication & Authorization

### Multi-Tenant Authentication Flow

Authentication is provided by **Supabase Auth (GoTrue)**
([ADR-008](./05-architecture-decisions.md#adr-008-supabase-as-the-backend-platform)).
We do not store password hashes, issue tokens, or manage sessions — that is the
main thing choosing Supabase buys.

What we *do* own is **which tenants a user belongs to**, in `tenant_users`.

```
1. User visits https://acme.platform.com/login
   ↓
2. Browser authenticates against Supabase Auth (password, OAuth, or SSO).
   Supabase verifies credentials and issues a JWT.
   ↓
3. At token-issue time, the custom_access_token_hook Postgres function runs.
   It reads tenant_users and stamps the active tenant into the token:
      app_metadata: { tenant_id: "...", role: "hr_admin" }
   ↓
4. Requests carry the JWT. hooks.server.ts verifies it and populates
      event.locals = { user, tenantId, role, locale, timezone }
   ↓
5. The repository layer opens a transaction and sets the claims for RLS:
      BEGIN; SET LOCAL request.jwt.claims = '<the verified claims>'; …
   ↓
6. PostgreSQL enforces isolation. No application WHERE clause is load-bearing.
```

**Subdomain and token must agree.** A user holding a valid token for tenant A who
visits `tenantb.platform.com` must be rejected — the subdomain is a *request* for
a tenant, the token is the *authority*. Verify they match in `hooks.server.ts`
and fail closed if they do not.

### Stamping the tenant into the token

```sql
-- Runs at token issue. Registered as Supabase's custom access token hook.
CREATE OR REPLACE FUNCTION public.custom_access_token_hook(event jsonb)
RETURNS jsonb
LANGUAGE plpgsql STABLE
AS $$
DECLARE
    claims     jsonb := event->'claims';
    membership RECORD;
BEGIN
    SELECT tu.tenant_id, tu.role
      INTO membership
      FROM tenant_users tu
     WHERE tu.user_id = (event->>'user_id')::uuid
       AND tu.is_active
     ORDER BY tu.is_default_tenant DESC, tu.last_active_at DESC NULLS LAST
     LIMIT 1;

    IF membership.tenant_id IS NOT NULL THEN
        claims := jsonb_set(claims, '{app_metadata,tenant_id}',
                            to_jsonb(membership.tenant_id::text));
        claims := jsonb_set(claims, '{app_metadata,role}',
                            to_jsonb(membership.role));
    END IF;

    RETURN jsonb_set(event, '{claims}', claims);
END;
$$;
```

Putting the tenant in the token avoids a membership lookup on every request, and
means the value RLS reads is one the auth system signed rather than something the
application computed.

### Enterprise SSO for dedicated tenants

A dedicated tenant can authenticate against its own corporate identity provider
(Okta, Entra/Azure AD, Google Workspace, Ping) using SAML 2.0. Supabase Auth is
multi-tenant here: many IdPs on one project, each with an `sso_provider_id`.

**Resolve the tenant from the subdomain first, then sign in against that
tenant's provider.** Supabase routes SSO by *email domain*; we route tenants by
*subdomain*. They usually agree, but not always — a contractor on a personal
address, a group with several subsidiaries on one domain — so the subdomain is
the authority and the domain is a convenience:

```typescript
// src/routes/(marketing)/login/+page.server.ts
const tenant = await controlPlane.resolveBySubdomain(event.url.hostname);

if (tenant.sso_provider_id) {
    // Sign in against THIS tenant's IdP, not whichever one matches the domain
    const { data } = await supabase.auth.signInWithSSO({
        providerId: tenant.sso_provider_id,
    });
    redirect(303, data.url);
}
// otherwise fall through to password / OTP
```

**Enforce SSO in the server, not the UI.** Where a tenant requires SSO, check the
authentication method on every request rather than merely hiding the password
field:

```typescript
// hooks.server.ts
const method = jwt.amr?.[0]?.method;          // 'sso/saml' for SSO sign-ins
if (tenant.sso_required && method !== 'sso/saml') {
    throw error(403, 'This organization requires single sign-on');
}
```

**No SCIM.** There is no directory sync, so a user disabled in the customer's IdP
is not automatically deprovisioned here. They cannot sign in again — SSO fails at
the IdP — but an existing session survives until it expires. Keep session
lifetimes short for SSO tenants and reconcile periodically. Full reasoning in
[ADR-010](./05-architecture-decisions.md#adr-010-enterprise-sso-for-dedicated-tenants).

### Users belonging to multiple tenants

A consultant may work for two client organizations. Membership is many-to-many in
`tenant_users`; the token carries exactly one **active** tenant. Switching tenants
re-issues the token:

```typescript
// $lib/server/auth/switch-tenant.ts
export async function switchTenant(userId: string, tenantId: string) {
  const [ok] = await sql`
    SELECT 1 FROM tenant_users
     WHERE user_id = ${userId} AND tenant_id = ${tenantId} AND is_active
  `;
  if (!ok) throw error(403, 'Not a member of that organization');

  await sql`
    UPDATE tenant_users SET is_default_tenant = (tenant_id = ${tenantId}),
                            last_active_at = now()
     WHERE user_id = ${userId}
  `;
  // Refresh the session so the hook re-runs and re-stamps app_metadata.
  return supabase.auth.refreshSession();
}
```

This is unpleasant to retrofit — every table and policy assumes a single active
tenant per request — which is why `tenant_users` is in the schema from the start
even though most users will only ever belong to one organization.

### JWT Structure

```typescript
interface AppJWT {
  // Issued and signed by Supabase Auth
  sub: string;              // auth.users.id
  iss: string;              // Supabase project URL
  aud: string;              // 'authenticated'
  exp: number;
  iat: number;
  email: string;
  role: string;             // Postgres role: 'authenticated'

  // Added by custom_access_token_hook
  app_metadata: {
    tenant_id: string;      // read by RLS via auth.jwt()
    role: string;           // 'employee' | 'manager' | 'hr_admin' | 'owner'
    provider?: string;
  };

  // User-editable; never trusted for authorization
  user_metadata: {
    locale?: string;
    timezone?: string;
    preferred_currency?: string;
  };
}
```

> **`app_metadata` versus `user_metadata`.** `user_metadata` is writable by the
> user via the Supabase client. Never make an authorization decision from it.
> Anything security-relevant — tenant, role, permissions — belongs in
> `app_metadata`, which only the hook and the service role can write.

### Identity versus profile

Two tables, deliberately separate:

| Concern | Owner | Holds |
|---|---|---|
| Identity | Supabase `auth.users` | Email, password hash, MFA factors, OAuth links, sessions |
| Membership | `tenant_users` (ours) | Which tenants, which role, active tenant |
| Person | `employees` (ours) | Name, department, manager, compensation, everything HR |

Not every user is an employee (a client-portal contact is not), and not every
employee has a login (a warehouse worker may not). `tenant_users.employee_id`
links the two when both exist, and is nullable in both directions.

Because Supabase owns `auth.users`, the `users` table this document previously
specified — with `password_hash`, `email_verified`, and its own session handling —
**no longer exists**. Locale and timezone preferences moved to `user_metadata`
and, for employees, to the `employees` row.

### User Groups

User groups provide a way to organize users into named collections that can be referenced as a single unit. Groups function as aliases for lists of users, making it easier to manage permissions and access control for teams, departments, or functional units within an organization.

Group names follow an email-like format (e.g., `findata-analysts-group@acme.org`) where the suffix matches the organization's domain. This format makes groups easily identifiable and integrable with existing email-based permission systems.

#### User Groups Table Schema

```sql
CREATE TABLE employee_user_groups (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,

    -- Identity
    name VARCHAR(255) NOT NULL, -- Email-like format: groupname@domain.com
    display_name VARCHAR(255), -- Human-readable name
    display_name_i18n JSONB, -- {"en-US": "Financial Analysts", "es-ES": "Analistas Financieros"}
    description TEXT,
    description_i18n JSONB,

    -- Group type classification
    group_type VARCHAR(50) NOT NULL DEFAULT 'custom',
    -- Types: 'department', 'team', 'project', 'functional', 'affinity', 'custom'

    -- Optional hierarchical structure
    parent_group_id UUID REFERENCES user_groups(id) ON DELETE SET NULL,

    -- Optional associations to organizational structure
    department_id UUID REFERENCES departments(id) ON DELETE SET NULL,
    location_id UUID REFERENCES locations(id) ON DELETE SET NULL,

    -- Ownership & management
    owner_user_id UUID REFERENCES users(id) ON DELETE SET NULL,

    -- Status
    is_active BOOLEAN DEFAULT TRUE,
    is_system_group BOOLEAN DEFAULT FALSE, -- System-managed vs user-created

    -- Metadata
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    created_by UUID REFERENCES users(id),
    updated_by UUID REFERENCES users(id),

    -- Constraints
    UNIQUE(tenant_id, name),

    -- Check email-like format: groupname@domain.tld
    CONSTRAINT check_group_name_format CHECK (name ~* '^[A-Za-z0-9._+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$'),
    CONSTRAINT check_group_type CHECK (group_type IN ('department', 'team', 'project', 'functional', 'affinity', 'custom'))
);

CREATE INDEX idx_user_groups_tenant ON user_groups(tenant_id);
CREATE INDEX idx_user_groups_tenant_active ON user_groups(tenant_id, is_active);
CREATE INDEX idx_user_groups_parent ON user_groups(parent_group_id);
CREATE INDEX idx_user_groups_department ON user_groups(department_id);
CREATE INDEX idx_user_groups_name ON user_groups(tenant_id, name);
CREATE INDEX idx_user_groups_owner ON user_groups(owner_user_id);
```

#### Group Membership Table Schema

```sql
CREATE TABLE employee_group_members (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    group_id UUID NOT NULL REFERENCES user_groups(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,

    -- Membership role within the group
    role_in_group VARCHAR(50) DEFAULT 'member',
    -- Roles: 'owner', 'admin', 'moderator', 'member'

    -- Membership tracking
    joined_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    joined_by UUID REFERENCES users(id), -- Who added this member

    -- Optional expiration for temporary membership
    expires_at TIMESTAMP WITH TIME ZONE,

    -- Metadata
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,

    UNIQUE(group_id, user_id),
    CONSTRAINT check_member_role CHECK (role_in_group IN ('owner', 'admin', 'moderator', 'member'))
);

CREATE INDEX idx_group_members_group ON group_members(group_id);
CREATE INDEX idx_group_members_user ON group_members(user_id);
CREATE INDEX idx_group_members_role ON group_members(group_id, role_in_group);
CREATE INDEX idx_group_members_expires ON group_members(expires_at) WHERE expires_at IS NOT NULL;
```

#### Group Email Alias Resolution

When a group name is used in a permission or access control context, the system automatically resolves it to the list of member users. This resolution happens at query time:

```sql
-- Function to resolve group to user IDs
CREATE OR REPLACE FUNCTION resolve_group_members(group_name VARCHAR, tenant_uuid UUID)
RETURNS TABLE(user_id UUID) AS $$
BEGIN
    RETURN QUERY
    SELECT gm.user_id
    FROM employee_user_groups ug
    JOIN employee_group_members gm ON ug.id = gm.group_id
    WHERE ug.tenant_id = tenant_uuid
      AND ug.name = group_name
      AND ug.is_active = TRUE
      AND (gm.expires_at IS NULL OR gm.expires_at > CURRENT_TIMESTAMP);
END;
$$ LANGUAGE plpgsql STABLE;

-- Example usage: Get everyone in a group
SELECT e.id, e.employee_id, e.first_name, e.last_name, e.email
FROM employees e
WHERE e.tenant_id = 'acme-tenant-uuid'
  AND e.id IN (
    SELECT employee_id
      FROM resolve_group_members('findata-analysts-group@acme.org', 'acme-tenant-uuid')
  );
```

#### Recursive Group Resolution (for nested groups)

```sql
-- Recursive function to resolve groups including nested groups
CREATE OR REPLACE FUNCTION resolve_group_members_recursive(group_name VARCHAR, tenant_uuid UUID)
RETURNS TABLE(user_id UUID) AS $$
WITH RECURSIVE group_hierarchy AS (
    -- Base case: find the starting group
    SELECT id, parent_group_id
    FROM employee_user_groups
    WHERE tenant_id = tenant_uuid
      AND name = group_name
      AND is_active = TRUE

    UNION ALL

    -- Recursive case: find child groups
    SELECT ug.id, ug.parent_group_id
    FROM employee_user_groups ug
    INNER JOIN group_hierarchy gh ON ug.parent_group_id = gh.id
    WHERE ug.tenant_id = tenant_uuid
      AND ug.is_active = TRUE
)
SELECT DISTINCT gm.user_id
FROM group_hierarchy gh
JOIN employee_group_members gm ON gh.id = gm.group_id
WHERE gm.expires_at IS NULL OR gm.expires_at > CURRENT_TIMESTAMP;
$$ LANGUAGE sql STABLE;
```

#### Example Group Usage

```sql
-- Create example groups for Acme Corp
INSERT INTO employee_user_groups (tenant_id, name, display_name, group_type, department_id) VALUES
('acme-uuid', 'findata-analysts-group@acme.org', 'Financial Data Analysts', 'functional', 'finance-dept-uuid'),
('acme-uuid', 'findata-managers-group@acme.org', 'Financial Data Managers', 'functional', 'finance-dept-uuid'),
('acme-uuid', 'engineering-team@acme.org', 'Engineering Team', 'department', 'engineering-dept-uuid'),
('acme-uuid', 'hr-admins@acme.org', 'HR Administrators', 'functional', 'hr-dept-uuid');

-- Add members to groups
INSERT INTO employee_group_members (group_id, user_id, role_in_group) VALUES
((SELECT id FROM employee_user_groups WHERE name = 'findata-analysts-group@acme.org'), 'user-1-uuid', 'member'),
((SELECT id FROM employee_user_groups WHERE name = 'findata-analysts-group@acme.org'), 'user-2-uuid', 'member'),
((SELECT id FROM employee_user_groups WHERE name = 'findata-managers-group@acme.org'), 'user-3-uuid', 'owner');

-- Query: Get all members of a group
-- Identity lives in Supabase auth.users; the person lives in employees.
SELECT e.id, e.email, e.first_name, e.last_name, gm.role_in_group
FROM employee_user_groups ug
JOIN employee_group_members gm ON gm.group_id = ug.id
JOIN employees e             ON e.id = gm.employee_id
                            AND e.tenant_id = ug.tenant_id
WHERE ug.tenant_id = 'acme-uuid'
  AND ug.group_name = 'findata-analysts-group@acme.org'
  AND ug.is_active
  AND (gm.expires_at IS NULL OR gm.expires_at > now());
```

### Role-Based Access Control (RBAC)

```sql
-- Roles table
CREATE TABLE roles (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID REFERENCES tenants(id), -- NULL for system roles

    name VARCHAR(100) NOT NULL,
    description TEXT,

    -- System roles vs. custom tenant roles
    is_system_role BOOLEAN DEFAULT FALSE,

    -- Permissions (array of permission strings)
    permissions TEXT[] DEFAULT ARRAY[]::TEXT[],

    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,

    UNIQUE(tenant_id, name)
);

-- System roles (tenant_id = NULL)
INSERT INTO roles (name, is_system_role, permissions, tenant_id) VALUES
('super_admin', true, ARRAY['*'], NULL),
('platform_admin', true, ARRAY['platform:*'], NULL);

-- Tenant-specific roles (created per tenant)
INSERT INTO roles (tenant_id, name, permissions) VALUES
('acme-uuid', 'firm_admin', ARRAY[
    'firm:*',
    'hr:*',
    'users:*'
]),
('acme-uuid', 'hr_admin', ARRAY[
    'hr:employees:*',
    'hr:timeoff:*',
    'hr:benefits:*',
    'hr:payroll:read'
]),
('acme-uuid', 'manager', ARRAY[
    'hr:employees:read:team',
    'hr:timeoff:approve:team',
    'hr:reviews:*:team'
]),
('acme-uuid', 'employee', ARRAY[
    'hr:employees:read:self',
    'hr:employees:update:self',
    'hr:timeoff:*:self',
    'hr:payroll:read:self'
]);

-- User-Role assignment (many-to-many)
CREATE TABLE user_roles (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    role_id UUID NOT NULL REFERENCES roles(id) ON DELETE CASCADE,

    assigned_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    assigned_by UUID REFERENCES users(id),

    UNIQUE(user_id, role_id)
);

CREATE INDEX idx_user_roles_user ON user_roles(user_id);
CREATE INDEX idx_user_roles_role ON user_roles(role_id);

-- Group-Role assignment (many-to-many)
-- Allows assigning roles to entire groups at once
CREATE TABLE employee_group_roles (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    group_id UUID NOT NULL REFERENCES user_groups(id) ON DELETE CASCADE,
    role_id UUID NOT NULL REFERENCES roles(id) ON DELETE CASCADE,

    -- Scope limitation for this role assignment
    scope_type VARCHAR(50), -- 'all', 'department', 'location', 'custom'
    scope_department_id UUID REFERENCES departments(id),
    scope_location_id UUID REFERENCES locations(id),

    assigned_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    assigned_by UUID REFERENCES users(id),

    UNIQUE(group_id, role_id)
);

CREATE INDEX idx_group_roles_group ON group_roles(group_id);
CREATE INDEX idx_group_roles_role ON group_roles(role_id);
CREATE INDEX idx_group_roles_scope ON group_roles(scope_type, scope_department_id, scope_location_id);
```

#### Permission Inheritance

Users inherit permissions from three sources:
1. **Direct role assignments** via `user_roles` table
2. **Group role assignments** via `group_roles` table (user inherits from all groups they belong to)
3. **Hierarchical group inheritance** if nested groups are used

The effective permission set for a user is the union of all permissions from these sources.

> **Schema note.** The normalized `roles` / `user_roles` model sketched above is
> *not* what is built. [`schema.sql`](./data-models/schema.sql) carries the role
> on `tenant_users.role` with a `permissions` JSONB override, plus grants through
> `employee_user_groups` / `employee_group_roles`. Role *definitions* live in
> code, not in a table — they are system-defined and not customer-editable, which
> is the Tier 1 rule in
> [Customization Model](./06-customization-model.md#tier-1-configuration-data)
> working in reverse. If customers ever need to define their own roles, that
> becomes a reference table; until then a table of five fixed rows is overhead.

```sql
-- Effective permissions, against the schema as built.
CREATE OR REPLACE VIEW user_effective_permissions AS
SELECT DISTINCT
    tu.user_id,
    tu.tenant_id,
    perm
FROM tenant_users tu
LEFT JOIN employees e ON e.id = tu.employee_id
CROSS JOIN LATERAL (
    -- 1. Explicit per-user overrides on the membership row
    SELECT jsonb_array_elements_text(
             coalesce(tu.permissions -> 'grants', '[]'::jsonb)) AS perm

    UNION

    -- 2. Permissions granted through group membership
    SELECT jsonb_array_elements_text(
             coalesce(gr.permissions, '[]'::jsonb)) AS perm
      FROM employee_group_members gm
      JOIN employee_group_roles  gr ON gr.group_id = gm.group_id
     WHERE gm.employee_id = e.id
       AND gm.tenant_id   = tu.tenant_id
       AND (gm.expires_at IS NULL OR gm.expires_at > now())
) AS granted
WHERE tu.is_active;
```

The base role (`tu.role`) expands to its permission set **in application code**,
where the mapping is version-controlled and reviewable; the view above covers only
the additive grants that are data. Checking a permission is therefore:

```typescript
// $lib/server/auth/permissions.ts
const ROLE_PERMISSIONS: Record<string, readonly string[]> = {
  owner:    ['*'],
  hr_admin: ['hr:*', 'payroll:read', 'employees:*'],
  manager:  ['hr:timeoff:approve', 'employees:read', 'projects:*'],
  employee: ['employees:read:self', 'hr:timeoff:request'],
};

export async function can(
  tx: TransactionSql, tenantId: string, userId: string, permission: string,
): Promise<boolean> {
  const [m] = await tx<{ role: string }[]>`
    SELECT role FROM tenant_users
     WHERE tenant_id = ${tenantId} AND user_id = ${userId} AND is_active
  `;
  if (!m) return false;
  if (matches(ROLE_PERMISSIONS[m.role] ?? [], permission)) return true;

  const granted = await tx<{ perm: string }[]>`
    SELECT perm FROM user_effective_permissions
     WHERE tenant_id = ${tenantId} AND user_id = ${userId}
  `;
  return matches(granted.map((g) => g.perm), permission);
}
```

**Permission checks always hit the database.** They are per-user and
security-relevant, so they are explicitly excluded from the caching strategy
above.

### Permission Checking

```typescript
// middleware/permissions.ts
export function requirePermission(permission: string) {
  return (req: Request, res: Response, next: NextFunction) => {
    const user = req.user;

    if (!user) {
      return res.status(401).json({ error: 'UNAUTHORIZED' });
    }

    // Check if user has permission
    if (!hasPermission(user, permission, req)) {
      return res.status(403).json({
        error: 'FORBIDDEN',
        message: `Missing required permission: ${permission}`
      });
    }

    next();
  };
}

function hasPermission(user: User, required: string, req: Request): boolean {
  // Super admin has all permissions
  if (user.permissions.includes('*')) {
    return true;
  }

  // Exact match
  if (user.permissions.includes(required)) {
    return true;
  }

  // Wildcard match: hr:employees:* matches hr:employees:read
  const parts = required.split(':');
  for (let i = parts.length; i > 0; i--) {
    const pattern = parts.slice(0, i).join(':') + ':*';
    if (user.permissions.includes(pattern)) {
      return true;
    }
  }

  // Scope-based permissions: hr:employees:read:team
  // Check if user is requesting their own data or their team's data
  if (required.endsWith(':self')) {
    const resourceId = req.params.id || req.body.employee_id;
    return resourceId === user.employee_id;
  }

  if (required.endsWith(':team')) {
    // Check if requested employee reports to this user
    const employeeId = req.params.id || req.body.employee_id;
    return isInUserTeam(employeeId, user.employee_id);
  }

  return false;
}

// Usage in routes
router.get('/employees/:id',
  requirePermission('hr:employees:read'),
  EmployeesController.getEmployee
);

router.post('/timeoff/requests/:id/approve',
  requirePermission('hr:timeoff:approve'),
  TimeOffController.approveRequest
);
```

#### Group-Based Permission Checking

In addition to standard scope checks (`:self`, `:team`, `:department`, `:all`), the system supports a `:group` scope that restricts access based on group membership.

**Permission Format with Group Scope:**
```
module:feature:action:group:<group-name>
```

**Examples:**
- `finance:reports:read:group:findata-analysts-group@acme.org` - Read financial reports if user is in the analysts group
- `hr:employees:update:group:hr-admins@acme.org` - Update employee records if user is in HR admins group
- `accounting:ledger:write:group:accounting-team@acme.org` - Write to ledger if user is in accounting team

**Implementation:**

```typescript
// Extended permission checking with group support
function hasPermission(user: User, required: string, req: Request): boolean {
  // Super admin has all permissions
  if (user.permissions.includes('*')) {
    return true;
  }

  // Exact match
  if (user.permissions.includes(required)) {
    return true;
  }

  // Wildcard match: hr:employees:* matches hr:employees:read
  const parts = required.split(':');
  for (let i = parts.length; i > 0; i--) {
    const pattern = parts.slice(0, i).join(':') + ':*';
    if (user.permissions.includes(pattern)) {
      return true;
    }
  }

  // Group-based permission: module:feature:action:group:<group-name>
  if (required.includes(':group:')) {
    const groupNameMatch = required.match(/:group:([^:]+)$/);
    if (groupNameMatch) {
      const groupName = groupNameMatch[1];
      return isUserInGroup(user.id, groupName, user.tenant_id);
    }
  }

  // Standard scope-based permissions
  if (required.endsWith(':self')) {
    const resourceId = req.params.id || req.body.employee_id;
    return resourceId === user.employee_id;
  }

  if (required.endsWith(':team')) {
    const employeeId = req.params.id || req.body.employee_id;
    return isInUserTeam(employeeId, user.employee_id);
  }

  if (required.endsWith(':department')) {
    const departmentId = req.params.departmentId || req.body.department_id;
    return user.department_id === departmentId;
  }

  return false;
}

// Check if user is member of a group
async function isUserInGroup(
  userId: string,
  groupName: string,
  tenantId: string
): Promise<boolean> {
  const result = await db.query(`
    SELECT EXISTS(
      SELECT 1
      FROM employee_user_groups ug
      JOIN employee_group_members gm ON ug.id = gm.group_id
      WHERE ug.tenant_id = $1
        AND ug.name = $2
        AND ug.is_active = TRUE
        AND gm.user_id = $3
        AND (gm.expires_at IS NULL OR gm.expires_at > CURRENT_TIMESTAMP)
    ) AS is_member
  `, [tenantId, groupName, userId]);

  return result.rows[0].is_member;
}

// Example usage with group-scoped permissions
router.get('/finance/reports/quarterly',
  requirePermission('finance:reports:read:group:findata-analysts-group@acme.org'),
  FinanceController.getQuarterlyReports
);

// Alternative: Check if user is in ANY of the allowed groups
function requireGroupMembership(...groupNames: string[]) {
  return async (req: Request, res: Response, next: NextFunction) => {
    const user = req.user;

    if (!user) {
      return res.status(401).json({ error: 'UNAUTHORIZED' });
    }

    // Check if user is member of any allowed group
    for (const groupName of groupNames) {
      if (await isUserInGroup(user.id, groupName, user.tenant_id)) {
        return next();
      }
    }

    return res.status(403).json({
      error: 'FORBIDDEN',
      message: 'User must be member of one of the allowed groups'
    });
  };
}

// Example: Allow access to multiple groups
router.get('/finance/reports/sensitive',
  requireGroupMembership(
    'findata-managers-group@acme.org',
    'finance-executives@acme.org',
    'audit-team@acme.org'
  ),
  FinanceController.getSensitiveReports
);
```

#### Using Groups in Access Control Lists (ACLs)

Groups can be used directly in resource-level ACLs alongside individual users:

```sql
-- Example: Document access control with groups
-- PROPOSED — not yet in data-models/schema.sql. Document-level ACLs are a
-- planned addition; add this table in the same migration as the feature.
CREATE TABLE document_access (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    document_id UUID NOT NULL REFERENCES documents(id) ON DELETE CASCADE,

    -- Either a user or a group (exactly one must be set)
    user_id UUID REFERENCES users(id) ON DELETE CASCADE,
    group_name VARCHAR(255), -- Group email alias

    access_level VARCHAR(20) NOT NULL, -- 'read', 'write', 'admin'

    granted_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    granted_by UUID REFERENCES users(id),

    -- Ensure either user_id or group_name is set, not both
    CONSTRAINT check_user_or_group CHECK (
        (user_id IS NOT NULL AND group_name IS NULL) OR
        (user_id IS NULL AND group_name IS NOT NULL)
    )
);

CREATE INDEX idx_document_access_document ON document_access(document_id);
CREATE INDEX idx_document_access_user ON document_access(user_id);
CREATE INDEX idx_document_access_group ON document_access(group_name);

-- Grant access to a group
INSERT INTO document_access (document_id, group_name, access_level, granted_by)
VALUES ('doc-uuid', 'findata-analysts-group@acme.org', 'read', 'admin-user-uuid');

-- Check if user has access to a document (considering both direct and group access)
SELECT EXISTS(
    SELECT 1 FROM document_access da
    WHERE da.document_id = 'doc-uuid'
      AND (
        -- Direct user access
        da.user_id = 'user-uuid'
        OR
        -- Group-based access
        da.group_name IN (
          SELECT ug.name
          FROM employee_user_groups ug
          JOIN employee_group_members gm ON ug.id = gm.group_id
          WHERE gm.user_id = 'user-uuid'
            AND ug.is_active = TRUE
            AND (gm.expires_at IS NULL OR gm.expires_at > CURRENT_TIMESTAMP)
        )
      )
) AS has_access;
```

---

## Data Isolation & Security

### Security Layers

**Layer 1: Network Security**
- Database reachable only over TLS with credentials held as platform secrets
- Security groups restricting database access to application servers only
- No direct database access from internet

**Layer 2: Application Security**
- Tenant context middleware (every request)
- Automatic tenant_id injection in queries
- Permission-based access control

**Layer 3: Database Security**
- Row-level security policies
- Tenant ID in all queries
- Database triggers for additional enforcement

**Layer 4: Encryption**
- TLS 1.3 for data in transit
- AES-256 for data at rest
- Field-level encryption for sensitive fields (SSN, bank account numbers)

### Sensitive Data Encryption

```sql
-- Use pgcrypto extension
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- Encrypted columns
CREATE TABLE employees (
    id UUID PRIMARY KEY,
    tenant_id UUID NOT NULL,

    -- Regular fields
    first_name VARCHAR(100),
    last_name VARCHAR(100),

    -- Encrypted fields
    ssn_encrypted BYTEA, -- Encrypted SSN

    -- ...
);

-- Encrypt on insert
INSERT INTO employees (tenant_id, first_name, ssn_encrypted)
VALUES (
    'tenant-uuid',
    'John',
    pgp_sym_encrypt('123-45-6789', 'encryption-key')
);

-- Decrypt on select (in application layer)
SELECT
    id,
    first_name,
    pgp_sym_decrypt(ssn_encrypted, 'encryption-key') as ssn
FROM employees
WHERE tenant_id = 'tenant-uuid';
```

**Better Approach**: Application-level encryption

```typescript
// utils/encryption.ts
import crypto from 'crypto';

const ALGORITHM = 'aes-256-gcm';
const KEY = Buffer.from(process.env.ENCRYPTION_KEY, 'hex'); // 32 bytes

export function encrypt(text: string): string {
  const iv = crypto.randomBytes(16);
  const cipher = crypto.createCipheriv(ALGORITHM, KEY, iv);

  let encrypted = cipher.update(text, 'utf8', 'hex');
  encrypted += cipher.final('hex');

  const authTag = cipher.getAuthTag();

  // Return: iv:authTag:encrypted
  return `${iv.toString('hex')}:${authTag.toString('hex')}:${encrypted}`;
}

export function decrypt(encrypted: string): string {
  const [ivHex, authTagHex, encryptedData] = encrypted.split(':');

  const iv = Buffer.from(ivHex, 'hex');
  const authTag = Buffer.from(authTagHex, 'hex');
  const decipher = crypto.createDecipheriv(ALGORITHM, KEY, iv);

  decipher.setAuthTag(authTag);

  let decrypted = decipher.update(encryptedData, 'hex', 'utf8');
  decrypted += decipher.final('utf8');

  return decrypted;
}

// Usage in entity
class Employee {
  private _ssn: string;

  @Column({ type: 'text', name: 'ssn_encrypted' })
  private ssnEncrypted: string;

  get ssn(): string {
    if (!this._ssn && this.ssnEncrypted) {
      this._ssn = decrypt(this.ssnEncrypted);
    }
    return this._ssn;
  }

  set ssn(value: string) {
    this._ssn = value;
    this.ssnEncrypted = encrypt(value);
  }
}
```

### Audit Logging

```sql
CREATE TABLE audit_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(id),

    -- Who
    user_id UUID REFERENCES users(id),
    user_email VARCHAR(255),

    -- What
    action VARCHAR(100) NOT NULL, -- employee.create, employee.update, timeoff.approve
    resource_type VARCHAR(100) NOT NULL, -- employee, timeoff_request, payroll_record
    resource_id UUID,

    -- Changes (for updates)
    old_values JSONB,
    new_values JSONB,

    -- When & Where
    timestamp TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    ip_address INET,
    user_agent TEXT,

    -- Result
    status VARCHAR(50), -- success, failure
    error_message TEXT,

    -- Additional context
    metadata JSONB
);

CREATE INDEX idx_audit_logs_tenant ON audit_logs(tenant_id);
CREATE INDEX idx_audit_logs_user ON audit_logs(user_id);
CREATE INDEX idx_audit_logs_resource ON audit_logs(resource_type, resource_id);
CREATE INDEX idx_audit_logs_timestamp ON audit_logs(timestamp DESC);
CREATE INDEX idx_audit_logs_action ON audit_logs(action);

-- Partition by month for performance
CREATE TABLE audit_logs (
    -- columns as above
) PARTITION BY RANGE (timestamp);

CREATE TABLE audit_logs_2025_12 PARTITION OF audit_logs
    FOR VALUES FROM ('2025-12-01') TO ('2026-01-01');
```

---

## Performance & Scalability

### Caching Strategy

There is no cache server. Under
[ADR-002](./05-architecture-decisions.md#adr-002-postgresql-as-the-only-datastore)
PostgreSQL is the only datastore, and caching happens in one of three places:

| Layer | Where | Lifetime | Used for |
|---|---|---|---|
| In-process | `Map` in the container | minutes–1h | Tenant config, translations, custom-field definitions |
| HTTP | `Cache-Control` on responses | seconds | Static assets, rarely-changing reference data |
| Database | PostgreSQL shared buffers | — | The hot working set, which is what actually matters |

**The observation that removes most caching pressure:** in a SvelteKit `load`
function the database client is in the same process, so a page's data is one
round trip over a warm connection. Most "we need a cache" instincts inherited
from a separate-API-service architecture do not apply — the network hop that made
caching necessary is gone.

#### 1. Tenant configuration

Read on every request, changes rarely — the ideal in-process cache.

```typescript
// $lib/server/tenant.ts
const tenants = new Map<string, { tenant: Tenant; expires: number }>();
const TTL_MS = 5 * 60 * 1000;

export async function getTenantBySubdomain(subdomain: string): Promise<Tenant | null> {
  const hit = tenants.get(subdomain);
  if (hit && hit.expires > Date.now()) return hit.tenant;

  const [tenant] = await sql<Tenant[]>`
    SELECT * FROM tenants WHERE subdomain = ${subdomain} AND is_active
  `;
  if (tenant) tenants.set(subdomain, { tenant, expires: Date.now() + TTL_MS });
  return tenant ?? null;
}
```

#### 2. Tenant settings and custom-field definitions

Same pattern, same reasoning — both are read on nearly every page render and
written only from an admin screen. Invalidate on write within the container that
performed it; other containers expire naturally.

#### 3. What must never be cached

- Anything scoped to a *user* rather than a tenant — permission checks run against
  the database on each request.
- Anything feeding payroll or accounting calculations. A stale exchange rate or
  tax rate produces a wrong filing, and the saved milliseconds are worthless
  against that.

#### When to add a cache server

Add one when `pg_stat_statements` shows a specific query dominating load and the
in-process cache cannot help because the data is per-user or must be shared
across containers. Add it for that query, with measurements — not pre-emptively.

### Database Query Optimization

**1. Use Database Views for Common Queries**

```sql
-- View for employee list with current position
CREATE VIEW v_employees_current AS
SELECT
    e.id,
    e.tenant_id,
    e.employee_number,
    e.first_name,
    e.last_name,
    e.email,
    e.hire_date,
    e.employment_status,
    jt.title as job_title,
    jl.level_name as job_level,
    d.name as department_name,
    l.name as location_name,
    m.first_name || ' ' || m.last_name as manager_name
FROM employees e
LEFT JOIN firm_job_titles jt ON e.current_job_title_id = jt.id
LEFT JOIN firm_job_levels jl ON e.current_job_level_id = jl.id
LEFT JOIN firm_departments d ON e.current_department_id = d.id
LEFT JOIN firm_locations l ON e.current_location_id = l.id
LEFT JOIN employees m ON e.current_manager_id = m.id;

-- Query the view
SELECT * FROM v_employees_current
WHERE tenant_id = 'uuid'
AND employment_status = 'active'
ORDER BY last_name, first_name;
```

**2. Use Materialized Views for Complex Aggregations**

```sql
-- Materialized view for employee statistics by department
CREATE MATERIALIZED VIEW mv_department_stats AS
SELECT
    tenant_id,
    current_department_id as department_id,
    COUNT(*) as total_employees,
    COUNT(*) FILTER (WHERE employment_status = 'active') as active_employees,
    AVG(EXTRACT(YEAR FROM AGE(CURRENT_DATE, hire_date))) as avg_tenure_years,
    COUNT(*) FILTER (WHERE gender = 'Female') as female_count,
    COUNT(*) FILTER (WHERE gender = 'Male') as male_count
FROM employees
GROUP BY tenant_id, current_department_id;

CREATE UNIQUE INDEX idx_mv_department_stats ON mv_department_stats(tenant_id, department_id);

-- Refresh periodically (e.g., daily via cron job)
REFRESH MATERIALIZED VIEW CONCURRENTLY mv_department_stats;
```

**3. Database Connection Pooling**

```typescript
// Separate read and write pools
export const writePool = new Pool({
  host: process.env.DB_WRITE_HOST,
  database: process.env.DB_NAME,
  max: 20, // max connections
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 5000,
});

export const readPool = new Pool({
  host: process.env.DB_READ_REPLICA_HOST,
  database: process.env.DB_NAME,
  max: 50, // more connections for reads
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 5000,
});

// Use read replicas for heavy queries
async function getEmployeeReports(tenantId: string) {
  return readPool.query(
    'SELECT * FROM v_employees_current WHERE tenant_id = $1',
    [tenantId]
  );
}
```

### Scaling

**Vertical first.** The shared-schema model means one database holds every
tenant, so the first and cheapest lever is a larger Supabase compute tier. Scale
out only when measurement says a single instance is the constraint.

**Application containers**:
- Stateless — no in-memory session state, so any container can serve any request
  (sessions live in Supabase Auth, not in process)
- In-process caches are per-container and expire on a TTL; they are an
  optimization, never a source of truth
- Add containers behind the load balancer as request concurrency demands
- Keep the connection pool small per container — connections, not CPU, are the
  scarce resource on a shared Postgres

**Worker process** scales independently of the web tier. A long payroll run
should never occupy a web container's connection.

**Database**:
- Read replicas for reporting queries once reporting load justifies them
- `tenant_id` leads every index, which is the single biggest determinant of
  query time on a shared instance
- `pg_stat_statements` enabled from day one — in a shared database it is the only
  way to find which tenant's query is hurting everyone

### Rate Limiting

Rate limiting state lives in PostgreSQL, consistent with
[ADR-002](./05-architecture-decisions.md#adr-002-postgresql-as-the-only-datastore).
At this scale a small table with a periodic sweep is sufficient, and it keeps
limits correct across containers — which a per-container counter would not.

```sql
CREATE TABLE rate_limit_buckets (
    tenant_id   UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    bucket_key  TEXT NOT NULL,          -- 'api' | 'export' | 'login'
    identifier  TEXT NOT NULL,          -- ip, user id, or tenant-wide
    window_start TIMESTAMPTZ NOT NULL,
    request_count INT NOT NULL DEFAULT 0,
    PRIMARY KEY (tenant_id, bucket_key, identifier, window_start)
);
```

```typescript
// $lib/server/rate-limit.ts
export async function consume(
  tenantId: string,
  bucket: 'api' | 'export' | 'login',
  identifier: string,
  limit: number,
  windowMs: number,
): Promise<{ allowed: boolean; remaining: number }> {
  const windowStart = new Date(Math.floor(Date.now() / windowMs) * windowMs);

  const [row] = await sql<{ request_count: number }[]>`
    INSERT INTO rate_limit_buckets
                (tenant_id, bucket_key, identifier, window_start, request_count)
         VALUES (${tenantId}, ${bucket}, ${identifier}, ${windowStart}, 1)
    ON CONFLICT (tenant_id, bucket_key, identifier, window_start)
      DO UPDATE SET request_count = rate_limit_buckets.request_count + 1
      RETURNING request_count
  `;

  return { allowed: row.request_count <= limit,
           remaining: Math.max(0, limit - row.request_count) };
}
```

Applied in `hooks.server.ts` for the API surface, and directly in the form
actions or `+server.ts` handlers for expensive operations:

| Bucket | Limit | Window | Keyed by |
|---|---|---|---|
| `api` | 100 | 1 minute | tenant + IP |
| `export` | 10 | 1 hour | tenant |
| `login` | 5 | 15 minutes | IP |

Expired rows are swept by a scheduled job (the same `SKIP LOCKED` worker), not
by a TTL — which is the one thing a cache server would have given for free, and
is worth a nightly `DELETE` instead of an extra service.

## Deployment Architecture

Per [ADR-006](./05-architecture-decisions.md#adr-006-boring-infrastructure) and
[ADR-008](./05-architecture-decisions.md#adr-008-supabase-as-the-backend-platform):
Supabase provides PostgreSQL, Auth and Storage; the application runs as a
container on a separate host. There is no orchestration platform, no
infrastructure-as-code stack, and no service mesh.

```
              CDN / WAF / DNS  (wildcard *.platform.com)
                          │
                          ▼
        ┌─────────────────────────────────────────┐
        │  Application host (Fly / Render / etc.) │
        │  ┌───────────────┐  ┌────────────────┐  │
        │  │ web container │  │ worker         │  │
        │  │ (SvelteKit)   │  │ (--worker)     │  │
        │  └───────────────┘  └────────────────┘  │
        │         same image, different entrypoint │
        └─────────────────────────────────────────┘
                          │  direct connection :5432
                          ▼
        ┌─────────────────────────────────────────┐
        │  Supabase project (SAME REGION)         │
        │  PostgreSQL · Auth · Storage            │
        └─────────────────────────────────────────┘
```

### Region colocation

**This is a hard constraint, not a preference.** Every request makes several
database round trips. App and database in different regions adds 50–100ms to
each one, which compounds across a page load. The application host's region must
match the Supabase project's region; pick the Supabase region first and let it
determine where the containers run.

### Data residency

`tenants.region` and `tenants.data_residency_country` exist in the schema for
customers with residency requirements. Serving those customers means a **second
Supabase project plus a second application deployment in that region**, with the
subdomain routed accordingly — not a second database inside one project. Treat it
as a distinct deployment of the same artifact, and note that it reintroduces the
N-way migration problem ADR-003 was chosen to avoid. Price it accordingly.

### Container configuration

```dockerfile
# Multi-stage: build with dev dependencies, ship without them
FROM node:22-alpine AS builder
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build && npm prune --omit=dev

FROM node:22-alpine
WORKDIR /app
ENV NODE_ENV=production
RUN addgroup -S app && adduser -S app -G app
COPY --from=builder --chown=app:app /app/build ./build
COPY --from=builder --chown=app:app /app/node_modules ./node_modules
COPY --from=builder --chown=app:app /app/package.json ./
USER app
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s \
  CMD node -e "fetch('http://localhost:3000/health/live').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["node", "build/index.js"]
```

The worker runs the **same image** with a different command
(`node build/worker.js`), which guarantees the two can never drift apart in
dependencies or schema expectations.

### Environment configuration

| Variable | Purpose |
|---|---|
| `DATABASE_URL` | Supabase direct connection, port 5432 |
| `PUBLIC_SUPABASE_URL` | Supabase project URL (client-visible) |
| `PUBLIC_SUPABASE_ANON_KEY` | Anon key for the browser auth client |
| `SUPABASE_SERVICE_ROLE_KEY` | Server only — never exposed to the client |
| `SUPABASE_JWT_SECRET` | Verifying JWTs on the server |
| `ORIGIN` | Required by `adapter-node` for form action origin checks |

`SUPABASE_SERVICE_ROLE_KEY` bypasses RLS entirely. It belongs only in the worker
and in administrative paths, never in code reachable from a request handler.

### Migrations

Forward-only and applied through the Supabase CLI, in a step that runs **before**
the new image receives traffic:

```bash
supabase db push                       # apply pending migrations
# then roll the containers
```

Because the shared-schema model means one database for all tenants, a migration
is **single and atomic** — that is the main operational benefit ADR-003 buys, and
the reason the deployment story is this short. Use expand/contract for any change
that is not backwards compatible with the running version, since old and new
containers overlap briefly during a rolling deploy.

### Rollback

- **Application**: redeploy the previous image tag. Stateless containers make
  this immediate.
- **Schema**: migrations are forward-only. A bad migration is corrected by a new
  migration, not by reversing one. This is why expand/contract matters — it keeps
  every intermediate state runnable by both versions.
- **Data**: Supabase point-in-time recovery. Note that restoring is
  *instance-wide*, so recovering a single tenant means extracting their rows,
  not rolling back the database. A per-tenant export/restore path must exist
  before the first customer needs it.

## Monitoring & Observability

### Metrics and Instrumentation

[ADR-006](./05-architecture-decisions.md#adr-006-boring-infrastructure) does not
introduce a metrics platform before there is a measured need. For a single
shared database serving SMB tenants, three sources answer nearly every question:

**1. `pg_stat_statements` — the highest-value instrumentation available.**

In a shared-schema system this is the only practical way to answer "which query
is hurting everyone?" Enable it from day one:

```sql
-- Slowest statements by total time
SELECT substring(query, 1, 90) AS query,
       calls,
       round(total_exec_time::numeric, 1)  AS total_ms,
       round(mean_exec_time::numeric, 2)   AS mean_ms,
       rows
  FROM pg_stat_statements
 ORDER BY total_exec_time DESC
 LIMIT 20;

-- Sequential scans on large tables: usually a missing tenant-leading index
SELECT relname, seq_scan, seq_tup_read, idx_scan
  FROM pg_stat_user_tables
 WHERE seq_scan > 0 AND n_live_tup > 10000
 ORDER BY seq_tup_read DESC;
```

**2. Structured request logs** carrying `tenant_id`, route, duration and status —
enough to reconstruct a slow page or attribute load to a tenant. See the logging
strategy below.

**3. Supabase's built-in dashboards** for connection counts, cache hit ratio,
disk and CPU.

#### If and when a metrics platform is added

Record request duration, database time and job queue depth. One warning that is
easy to get wrong and expensive to undo:

> **Never label metrics with `tenant_id`.** Every tenant multiplies the series
> count for every metric, and a few hundred tenants will exhaust a metrics
> backend. Keep tenant attribution in **logs**, which are queried by field, and
> keep metrics aggregate.

The queue is a table, so its depth is a query rather than a metric to export:

```sql
SELECT status, count(*), min(run_after) AS oldest_waiting
  FROM jobs GROUP BY status;
```

Alert on the age of the oldest pending job rather than on queue length — a long
queue that is draining is fine; a short queue that is stuck is not.

### Logging Strategy

```typescript
// utils/logger.ts
import winston from 'winston';

export const logger = winston.createLogger({
  level: process.env.LOG_LEVEL || 'info',
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.errors({ stack: true }),
    winston.format.json()
  ),
  defaultMeta: {
    service: 'platform-api',
    environment: process.env.NODE_ENV
  },
  transports: [
    new winston.transports.Console(),
    new winston.transports.File({ filename: 'logs/error.log', level: 'error' }),
    new winston.transports.File({ filename: 'logs/combined.log' })
  ]
});

// Request logging middleware
export function requestLogger(req, res, next) {
  logger.info('Incoming request', {
    tenant_id: req.tenantId,
    user_id: req.user?.id,
    method: req.method,
    path: req.path,
    ip: req.ip,
    user_agent: req.get('user-agent')
  });

  next();
}

// Error logging
export function errorLogger(err, req, res, next) {
  logger.error('Request error', {
    tenant_id: req.tenantId,
    user_id: req.user?.id,
    method: req.method,
    path: req.path,
    error: err.message,
    stack: err.stack
  });

  next(err);
}
```

### Health Checks

Two endpoints, with different meanings. Confusing them causes a rolling deploy to
either drop traffic or never complete.

```typescript
// src/routes/health/live/+server.ts
// LIVENESS — "is this process alive?" No dependency checks: if the database is
// down, restarting the container does not help and a restart loop makes it worse.
export function GET() {
  return new Response(JSON.stringify({ status: 'ok' }), {
    headers: { 'content-type': 'application/json' },
  });
}
```

```typescript
// src/routes/health/ready/+server.ts
// READINESS — "should this container receive traffic?" Checks dependencies.
import { sql } from '$lib/server/db/client';

export async function GET() {
  const checks: Record<string, string> = { database: 'unknown', migrations: 'unknown' };
  let healthy = true;

  try {
    await sql`SELECT 1`;
    checks.database = 'ok';
  } catch {
    checks.database = 'error';
    healthy = false;
  }

  try {
    const [row] = await sql<{ pending: number }[]>`
      SELECT count(*)::int AS pending FROM supabase_migrations.schema_migrations
       WHERE version > ${process.env.EXPECTED_SCHEMA_VERSION ?? '0'}
    `;
    checks.migrations = row.pending === 0 ? 'ok' : 'pending';
  } catch {
    checks.migrations = 'error';
  }

  return new Response(JSON.stringify({ status: healthy ? 'ok' : 'degraded', checks }), {
    status: healthy ? 200 : 503,
    headers: { 'content-type': 'application/json' },
  });
}
```

There is no cache or queue service to probe — the job queue is a table in the
same database the readiness check already covers.

**Worker health.** The worker has no HTTP surface, so it reports liveness by
touching a heartbeat row. A worker that has not checked in within a few minutes
has stalled, and alerting on that is more useful than a process-alive check:

```sql
CREATE TABLE worker_heartbeats (
    worker_id   TEXT PRIMARY KEY,
    last_seen   TIMESTAMPTZ NOT NULL DEFAULT now(),
    jobs_run    BIGINT NOT NULL DEFAULT 0
);
```

## Conclusion

What this architecture provides:

- **True multi-tenancy** — shared infrastructure, isolation enforced by the
  database rather than by application discipline
- **Global i18n** — 19 locales, multi-currency, timezone-aware, from day one
- **Atomic migrations** — one database for all tenants means one migration, not
  a fleet operation. This is the largest operational benefit of ADR-003.
- **A small surface** — PostgreSQL and object storage. No cache server, message
  broker, search cluster, or orchestration platform to operate, monitor, upgrade
  or install on a customer's hardware.
- **Cross-module features that are cheap to build** — one process, one
  transaction scope, which is the whole product proposition against Zoho and Odoo

### What it deliberately does not provide

Stated plainly, because each is a real limitation someone will eventually hit:

- **Shared blast radius.** One bad migration or one runaway query affects every
  tenant. This is what the atomic migration is bought with. Mitigations: staged
  rollout, statement timeouts, `pg_stat_statements`.
- **Per-tenant restore is manual.** Point-in-time recovery is instance-wide, so
  recovering one tenant means extracting rows. Build the export/restore path
  before a customer needs it.
- **Horizontal database scaling is not addressed.** Vertical first, read replicas
  next. Sharding by tenant is a re-architecture, not a tuning step — but the
  target market reaches neither before other things break.
- **No on-premise story.** ADR-007 defers it deliberately. Supabase Auth is the
  piece that would need a plan if that reverses.

### Next steps

1. Provision the Supabase project and apply
   [`schema.sql`](./data-models/schema.sql)
2. Load [`mock-data.sql`](./data-models/mock-data.sql) and confirm RLS isolation
   with a non-owner role
3. Scaffold the SvelteKit application: `hooks.server.ts`, `$lib/server/db/tx.ts`,
   the repository convention
4. Wire Supabase Auth, including `custom_access_token_hook` and tenant switching
5. Build Firm Profile end to end as the reference module
6. Refresh `SCHEMA-HELP-GUIDE-*` against the current schema

---

**Document Version**: 2.0
**Last Updated**: August 27, 2026
**Owner**: Engineering & Product Teams
