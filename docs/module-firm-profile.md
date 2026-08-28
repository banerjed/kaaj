# Module Specification: Firm Profile (Multi-Tenant & i18n)

**Version:** 2.0
**Last Updated:** December 1, 2025
**Status:** Draft - Updated for Multi-Tenant SaaS & Internationalization
**Parent Documents:**
- [Product Specification](./product-specification.md)
- [Technical Architecture](./architecture-technical.md)

---

## Table of Contents

1. [Module Overview](#module-overview)
2. [Multi-Tenant & i18n Considerations](#multi-tenant--i18n-considerations)
3. [User Stories](#user-stories)
4. [Functional Requirements](#functional-requirements)
5. [Data Model](#data-model)
6. [API Specifications](#api-specifications)
7. [User Interface Specifications](#user-interface-specifications)
8. [Business Logic & Rules](#business-logic--rules)
9. [Validation Rules](#validation-rules)
10. [Security Considerations](#security-considerations)
11. [Integration Points](#integration-points)
12. [Reporting Requirements](#reporting-requirements)
13. [Testing Requirements](#testing-requirements)

---

## Module Overview

### Purpose
The Firm Profile module serves as the foundational configuration layer for the entire platform. It manages **tenant-scoped** company-wide information, organizational structure, and policies that other modules reference and utilize. This module is fully internationalized to support global organizations.

### Scope
This module handles:
- **Tenant Configuration**: Company branding, regional settings, i18n preferences
- **Office/Location Management**: Multi-location support with timezone and locale settings
- **Department Hierarchy**: Organizational structure with multilingual names
- **Employee Titles**: Job title library with translations
- **Payroll Policies**: Timezone-aware schedules, multi-currency compensation
- **Benefits Packages**: Multi-currency benefits with localized descriptions
- **Holiday Calendars**: Location-specific, timezone-aware holiday management

### Module Dependencies
- **Consumed by**: HR Module, Accounting Module, Recruiting Module, all other modules
- **Consumes**:
  - Tenant Context Service (from platform)
  - i18n Service (translation, formatting)
  - Authentication Service

### Key Benefits
1. **Multi-Tenant Isolation**: Complete data isolation per organization
2. **Global Support**: Full i18n with locale, currency, timezone support
3. **Single Source of Truth**: Centralized company configuration
4. **Flexibility**: Supports multi-location, multi-currency businesses
5. **Scalability**: Handles organizational growth and restructuring

---

## Multi-Tenant & i18n Considerations

### Multi-Tenant Architecture

**Tenant Scoping**:
- All data in this module is scoped to a single tenant (organization)
- Every database table includes `tenant_id` column
- All API requests automatically filtered by authenticated tenant
- No cross-tenant data access possible

**Tenant Context**:
```typescript
// Every request has tenant context automatically injected
interface RequestContext {
  tenantId: string;           // UUID of current tenant
  tenant: Tenant;             // Full tenant object with settings
  locale: string;             // Resolved locale (user > tenant > system)
  timezone: string;           // User's timezone
  currency: string;           // User's preferred currency
}
```

**Database Isolation**:
- Row-level security policies enforce tenant isolation
- All queries automatically include `WHERE tenant_id = ?`
- Indexes optimized for tenant-scoped queries

### Internationalization Support

**Locale Management**:
- Tenant-level default locale (e.g., `en-US`, `fr-FR`, `de-DE`)
- Supported locales array (tenant can enable multiple locales)
- User-level locale override capability

**Multilingual Content**:
Fields that support multiple languages use JSONB storage:
```json
{
  "title": "Software Engineer",
  "title_i18n": {
    "en-US": "Software Engineer",
    "es-ES": "Ingeniero de Software",
    "fr-FR": "Ingénieur Logiciel",
    "de-DE": "Software-Ingenieur"
  }
}
```

**Timezone Handling**:
- All dates/times stored in UTC
- Location-specific timezones for working hours
- Display times converted to user's timezone
- Holiday dates stored with timezone context

**Currency Support**:
- Salary ranges support multiple currencies
- Benefits costs in tenant's default currency
- Exchange rate tracking for reporting
- Locale-aware currency formatting

**Date/Time Formatting**:
- Locale-specific date formats (MM/DD/YYYY vs DD/MM/YYYY)
- 12h vs 24h time format based on locale
- Timezone-aware date display

---

## User Stories

### Tenant Setup & Configuration

**US-FP-001**: As a Platform Administrator, I want to create a new tenant organization with subdomain, so that new customers can be onboarded.

**US-FP-002**: As a Firm Administrator, I want to configure my organization's default locale, currency, and timezone, so that all users have appropriate defaults.

**US-FP-003**: As a Firm Administrator, I want to enable multiple locales for my organization, so that employees in different countries can use the platform in their language.

**US-FP-004**: As a Firm Administrator, I want to set my company profile with name, logo, and website, so that the platform reflects my brand identity.

**US-FP-005**: As a Firm Administrator, I want to set a custom subdomain for my company (e.g., acme.platform.com), so that employees have a branded login experience.

### Office Location Management (i18n-aware)

**US-FP-006**: As a Firm Administrator, I want to add multiple office locations with full addresses and timezones, so that I can track where employees work globally.

**US-FP-007**: As a Firm Administrator, I want to set timezone and working hours for each office location, so that scheduling respects local business hours.

**US-FP-008**: As a Firm Administrator, I want to configure location names in multiple languages, so that employees see location names in their preferred language.

**US-FP-009**: As a Firm Administrator, I want to designate one office as the headquarters, so that it's clear which is the main location.

**US-FP-010**: As an Employee in France, I want to see office addresses formatted according to French conventions, so that addresses are readable.

**US-FP-011**: As an Employee, I want to see working hours displayed in my local timezone, so that I know when colleagues are available.

### Department Management (Multilingual)

**US-FP-012**: As a Firm Administrator, I want to create a hierarchical department structure with multilingual names, so that the organization chart displays in each user's language.

**US-FP-013**: As a Firm Administrator, I want to assign a department head to each department, so that it's clear who manages each team.

**US-FP-014**: As an Employee in Spain, I want to view the organizational chart with department names in Spanish, so that I can understand the structure.

**US-FP-015**: As a Firm Administrator, I want to define cost centers for each department with multi-currency budgets, so that expenses can be properly allocated globally.

### Employee Titles and Roles (i18n)

**US-FP-016**: As a Firm Administrator, I want to create a library of job titles with translations, so that titles are consistent and localized across the organization.

**US-FP-017**: As a Firm Administrator, I want to define job levels (Junior, Senior, etc.) in multiple languages, so that career progression is clear to all employees.

**US-FP-018**: As a Firm Administrator, I want to assign salary ranges in multiple currencies to each job title, so that compensation is standardized globally.

**US-FP-019**: As a Firm Administrator, I want to create job descriptions in multiple languages, so that expectations are documented for global teams.

**US-FP-020**: As an Employee in Germany, I want to see job titles in German, so that role names are meaningful to me.

### Payroll Policies (Multi-Currency, Timezone-Aware)

**US-FP-021**: As a Firm Administrator, I want to define pay schedules with timezone-aware pay dates, so that employees in different regions are paid on the correct local date.

**US-FP-022**: As a Firm Administrator, I want to set different pay schedules for different regions/currencies, so that each location follows local payroll practices.

**US-FP-023**: As a Firm Administrator, I want to define overtime policies that respect local labor laws, so that calculations are compliant per region.

**US-FP-024**: As a Finance Manager, I want to view upcoming payroll run dates in my timezone, so that I can ensure sufficient cash flow.

### Benefits Package Management (Multi-Currency, i18n)

**US-FP-025**: As a Firm Administrator, I want to create benefits package templates with multilingual names and descriptions, so that employees understand their options.

**US-FP-026**: As a Firm Administrator, I want to define benefit costs in different currencies, so that employees in each region see accurate costs.

**US-FP-027**: As a Firm Administrator, I want to set employer contribution percentages that vary by location, so that I can comply with local requirements.

**US-FP-028**: As an Employee in France, I want to see my benefits package in French with costs in Euros, so that I can make informed decisions.

### Holiday Calendar Management (Timezone, Locale-Aware)

**US-FP-029**: As a Firm Administrator, I want to create holiday calendars for each office location with local holidays, so that different regions observe appropriate holidays.

**US-FP-030**: As a Firm Administrator, I want to add holidays with names in multiple languages, so that employees see holiday names in their language.

**US-FP-031**: As a Firm Administrator, I want to import standard holiday sets for different countries, so that I don't have to manually enter all holidays.

**US-FP-032**: As a Firm Administrator, I want holidays to be timezone-aware, so that a December 25th holiday is observed on the correct day in each timezone.

**US-FP-033**: As an Employee in Tokyo, I want to view the holiday calendar with Japanese holiday names and dates in JST, so that I know when the office is closed.

---

## Functional Requirements

### FR-FP-001: Tenant Configuration Management

**Description**: System shall manage tenant-level configuration including regional and i18n settings.

**Features**:
1. Configure tenant subdomain (immutable after creation)
2. Set organization name (multilingual support)
3. Configure default locale, currency, timezone
4. Enable/disable additional locales
5. Configure supported currencies
6. Set date/time format preferences
7. Upload tenant-specific branding (logo, colors)
8. Configure data residency region
9. Set GDPR applicability flag

**Acceptance Criteria**:
- Subdomain must be globally unique across platform
- Default locale must be one of platform-supported locales
- Timezone must be valid IANA timezone identifier
- Currency must be ISO 4217 code
- Changes to locale settings logged in audit trail
- Locale changes apply to new sessions immediately

**i18n Considerations**:
- Organization name can have translations for each enabled locale
- Date format can be overridden from locale default
- Number format follows locale conventions

### FR-FP-002: Office Location Management (i18n-aware)

**Description**: System shall support multiple office locations with full internationalization support.

**Features**:
1. Add/edit/deactivate office locations
2. Store complete address with country code
3. Set location timezone (IANA format)
4. Configure working hours with timezone
5. Set location as headquarters (only one allowed)
6. Add location contact information
7. Support multilingual location names
8. Configure location-specific locale (overrides tenant default)
9. Set regional currency for location
10. Upload location photos

**Acceptance Criteria**:
- Address validated against country-specific format
- Timezone validated against IANA database
- Working hours stored in UTC, displayed in local timezone
- Location name supports all enabled tenant locales
- Only one headquarters allowed per tenant
- Deactivated locations retained for historical data
- Cannot delete location with active employees

**i18n Specific**:
```json
{
  "id": "uuid",
  "tenant_id": "uuid",
  "name": "San Francisco Office",
  "name_i18n": {
    "en-US": "San Francisco Office",
    "es-ES": "Oficina de San Francisco",
    "fr-FR": "Bureau de San Francisco"
  },
  "timezone": "America/Los_Angeles",
  "locale": "en-US",
  "currency": "USD",
  "address": {
    "line1": "123 Market St",
    "city": "San Francisco",
    "state": "CA",
    "postal_code": "94105",
    "country": "US"
  },
  "working_hours": {
    "monday": {"start": "09:00", "end": "17:00"},
    "tuesday": {"start": "09:00", "end": "17:00"}
  }
}
```

### FR-FP-003: Department Management (Multilingual)

**Description**: System shall support hierarchical department structure with multilingual support.

**Features**:
1. Create/edit/delete departments
2. Create parent-child department relationships
3. Support multilingual department names
4. Assign department head (employee)
5. Assign department to office location(s)
6. Set department code (unique within tenant)
7. Set cost center with budget currency
8. Add department description (multilingual)
9. View organization chart with user's locale

**Acceptance Criteria**:
- Department names unique within parent scope (per locale)
- Department code globally unique within tenant
- Support unlimited nesting levels (recommend max 10)
- Department head must be active employee within tenant
- Multilingual names required for all enabled tenant locales
- Organization chart renders in user's locale
- Cannot delete department with employees

**i18n Specific**:
```json
{
  "id": "uuid",
  "tenant_id": "uuid",
  "name": "Engineering",
  "name_i18n": {
    "en-US": "Engineering",
    "es-ES": "Ingeniería",
    "fr-FR": "Ingénierie",
    "de-DE": "Entwicklung"
  },
  "code": "ENG",
  "description_i18n": {
    "en-US": "Product development and engineering",
    "es-ES": "Desarrollo de productos e ingeniería",
    "fr-FR": "Développement de produits et ingénierie"
  },
  "cost_center": "ENG-001",
  "budget_currency": "USD"
}
```

### FR-FP-004: Job Title & Level Management (i18n)

**Description**: System shall maintain a library of standardized job titles with multilingual support and multi-currency salary ranges.

**Features**:
1. Create/edit/archive job titles
2. Support multilingual job titles
3. Define job levels with translations
4. Assign salary ranges in multiple currencies
5. Add job descriptions (multilingual, rich text)
6. Map titles to EEOC/ISCO job categories
7. Set FLSA exempt status
8. Define required skills and qualifications (multilingual)

**Acceptance Criteria**:
- Job title translations required for all enabled tenant locales
- Salary ranges support tenant's enabled currencies
- Salary min < max validation per currency
- Job descriptions support rich text formatting
- Cannot delete title if employees currently hold it (archive instead)
- Archived titles hidden from selection but visible in reports

**i18n Specific**:
```json
{
  "id": "uuid",
  "tenant_id": "uuid",
  "title": "Software Engineer",
  "title_i18n": {
    "en-US": "Software Engineer",
    "es-ES": "Ingeniero de Software",
    "fr-FR": "Ingénieur Logiciel",
    "de-DE": "Software-Ingenieur"
  },
  "description_i18n": {
    "en-US": "Develops and maintains software applications...",
    "es-ES": "Desarrolla y mantiene aplicaciones de software...",
    "fr-FR": "Développe et maintient des applications logicielles..."
  },
  "levels": [
    {
      "level_name": "Senior",
      "level_name_i18n": {
        "en-US": "Senior",
        "es-ES": "Senior",
        "fr-FR": "Senior",
        "de-DE": "Senior"
      },
      "salary_ranges": {
        "USD": {"min": 120000, "max": 180000},
        "EUR": {"min": 100000, "max": 150000},
        "GBP": {"min": 90000, "max": 130000}
      }
    }
  ]
}
```

### FR-FP-005: Payroll Policy Configuration (Multi-Currency, Timezone-Aware)

**Description**: System shall allow configuration of payroll schedules and policies with timezone and currency support.

**Features**:
1. Create pay schedules (weekly, bi-weekly, semi-monthly, monthly)
2. Assign pay schedules to locations/currencies
3. Configure timezone for pay date calculations
4. Define overtime rules (location-specific for compliance)
5. Set time-tracking requirements by location
6. Configure time-rounding rules
7. Define workweek start day (per location)
8. Support multiple currencies in same tenant

**Acceptance Criteria**:
- Pay dates calculated in location's timezone
- Different locations can have different pay schedules
- Overtime rules configurable per location for legal compliance
- Pay schedule includes currency designation
- System calculates next 12 pay periods automatically
- Timezone changes don't affect historical pay dates

**Timezone Handling Example**:
```typescript
// Pay schedule with timezone
{
  "id": "uuid",
  "tenant_id": "uuid",
  "name": "US Bi-weekly",
  "frequency": "bi-weekly",
  "timezone": "America/New_York",
  "anchor_date": "2025-01-03", // First Friday
  "currency": "USD",
  "locations": ["us-hq-uuid", "us-austin-uuid"]
}

// Next pay date calculation respects timezone
calculateNextPayDate("2025-01-03", "bi-weekly", "America/New_York")
// Returns: 2025-01-17 (in ET timezone)
```

### FR-FP-006: Benefits Package Management (Multi-Currency, i18n)

**Description**: System shall support benefits packages with multilingual content and multi-currency costs.

**Features**:
1. Create/edit/delete benefits packages
2. Support multilingual package names and descriptions
3. Add benefits with multilingual details
4. Set costs in multiple currencies
5. Configure employer/employee contribution splits
6. Define eligibility rules
7. Set enrollment periods (timezone-aware)
8. Add carrier/provider information (per country)
9. Support location-specific benefit variations

**Acceptance Criteria**:
- Package names translated to all enabled locales
- Benefit costs support all tenant currencies
- Contribution percentages validate (sum to 100%)
- Enrollment periods respect timezone
- Cannot deactivate package with active enrollments
- Benefits can vary by location (e.g., different medical carriers)

**i18n Example**:
```json
{
  "id": "uuid",
  "tenant_id": "uuid",
  "name": "Full-time Standard",
  "name_i18n": {
    "en-US": "Full-time Standard Benefits",
    "es-ES": "Beneficios Estándar de Tiempo Completo",
    "fr-FR": "Avantages Standards à Temps Plein"
  },
  "benefits": [
    {
      "benefit_type": "medical",
      "benefit_name_i18n": {
        "en-US": "PPO Health Plan",
        "es-ES": "Plan de Salud PPO",
        "fr-FR": "Plan de Santé PPO"
      },
      "carrier_name": "Blue Cross",
      "costs_by_currency": {
        "USD": {
          "employee_monthly": 200,
          "employer_monthly": 800
        },
        "EUR": {
          "employee_monthly": 180,
          "employer_monthly": 720
        }
      }
    }
  ]
}
```

### FR-FP-007: Holiday Calendar Management (Timezone, i18n)

**Description**: System shall support location-specific holiday calendars with timezone awareness and multilingual names.

**Features**:
1. Create holiday calendar per location
2. Add holidays with multilingual names
3. Support recurring holidays (annual patterns)
4. Import standard holiday sets by country
5. Mark holidays as paid/unpaid
6. Set holidays as mandatory/optional
7. Define floating holidays
8. Export calendar to iCal format
9. Timezone-aware holiday observance

**Acceptance Criteria**:
- Holiday names translated to all enabled locales
- Holiday date respects location timezone
- Recurring holidays generate automatically for 5 years
- Cannot delete past holidays
- Import supports 50+ country holiday sets
- Calendar export includes localized holiday names

**Timezone Handling**:
```typescript
// Holiday in multiple timezones
{
  "name": "New Year's Day",
  "name_i18n": {
    "en-US": "New Year's Day",
    "es-ES": "Año Nuevo",
    "fr-FR": "Jour de l'An",
    "de-DE": "Neujahr"
  },
  "date": "2025-01-01",
  "is_recurring": true,
  "locations": [
    {
      "location_id": "nyc-uuid",
      "timezone": "America/New_York",
      "observed_at": "2025-01-01T00:00:00-05:00"
    },
    {
      "location_id": "tokyo-uuid",
      "timezone": "Asia/Tokyo",
      "observed_at": "2025-01-01T00:00:00+09:00"
    }
  ]
}
```

---

## Data Model

**Note:** Data model specifications have been moved to the centralized data models specification.

See [schema.sql](../packages/database/reference/schema.sql) for complete database schemas including:
- Tenants (platform-level with i18n configuration)
- Locations (with timezone and working hours)
- Departments (hierarchical structure with multilingual support)
- Job Titles and Job Levels (with salary ranges)
- Pay Schedules (frequency and currency settings)
- Payroll Policies (overtime rules by jurisdiction)
- Benefits Packages and Benefit Items (multi-currency costs)
- Holidays (with timezone-aware observance)

All tables include comprehensive i18n support via JSONB fields and multi-currency capabilities.

---

## API Specifications

### Base URL
```
https://api.platform.com/v1/firm-profile
```

### Request Headers

**Required Headers**:
```
Authorization: Bearer <JWT>
X-Tenant-ID: <tenant-uuid>  (optional, extracted from JWT)
Accept-Language: en-US,es-ES;q=0.9  (for locale negotiation)
```

**Response Headers**:
```
Content-Language: en-US
X-Currency: USD
X-Timezone: America/New_York
```

### API Endpoints (i18n-aware)

#### Tenant Configuration Endpoints

**GET /tenant/settings**
- Description: Get tenant configuration and i18n settings
- Permissions: Any authenticated user in tenant
- Response:
```json
{
  "success": true,
  "data": {
    "id": "uuid",
    "subdomain": "acme",
    "company_name": "Acme Corporation",
    "company_name_i18n": {
      "en-US": "Acme Corporation",
      "es-ES": "Corporación Acme"
    },
    "default_locale": "en-US",
    "supported_locales": ["en-US", "es-ES", "fr-FR"],
    "default_currency": "USD",
    "supported_currencies": ["USD", "EUR", "GBP"],
    "default_timezone": "America/New_York",
    "date_format": "MM/DD/YYYY",
    "time_format": "12h"
  }
}
```

**PUT /tenant/settings**
- Description: Update tenant settings
- Permissions: `firm:tenant:update`
- Request Body:
```json
{
  "default_locale": "en-US",
  "supported_locales": ["en-US", "es-ES", "fr-FR", "de-DE"],
  "default_currency": "USD",
  "supported_currencies": ["USD", "EUR", "GBP", "CAD"],
  "company_name_i18n": {
    "en-US": "Acme Corporation",
    "es-ES": "Corporación Acme",
    "fr-FR": "Société Acme",
    "de-DE": "Acme Gesellschaft"
  }
}
```
- Response: Updated tenant settings

#### Location Endpoints (i18n)

**GET /locations**
- Description: List all locations with localized names
- Permissions: Any authenticated user
- Query Parameters:
  - `locale` (string): Override request locale
  - `is_active` (boolean): Filter by active status
- Response:
```json
{
  "success": true,
  "data": [
    {
      "id": "uuid",
      "name": "Oficina de San Francisco",
      "name_i18n": {
        "en-US": "San Francisco Office",
        "es-ES": "Oficina de San Francisco",
        "fr-FR": "Bureau de San Francisco"
      },
      "address": {
        "line1": "123 Market St",
        "city": "San Francisco",
        "state": "CA",
        "postal_code": "94105",
        "country": "US",
        "formatted": "123 Market St\nSan Francisco, CA 94105\nUnited States"
      },
      "timezone": "America/Los_Angeles",
      "locale": "en-US",
      "currency": "USD",
      "working_hours": {
        "monday": {"start": "09:00", "end": "17:00"},
        "display": "9:00 AM - 5:00 PM PST"
      },
      "is_headquarters": true,
      "current_time": "2025-12-01T14:30:00-08:00"
    }
  ],
  "meta": {
    "total": 5,
    "user_locale": "es-ES",
    "user_timezone": "America/Los_Angeles"
  }
}
```

**POST /locations**
- Description: Create new location
- Permissions: `firm:locations:create`
- Request Body:
```json
{
  "name": "Paris Office",
  "name_i18n": {
    "en-US": "Paris Office",
    "fr-FR": "Bureau de Paris",
    "es-ES": "Oficina de París"
  },
  "address": {
    "line1": "10 Rue de Rivoli",
    "city": "Paris",
    "postal_code": "75001",
    "country": "FR"
  },
  "timezone": "Europe/Paris",
  "locale": "fr-FR",
  "currency": "EUR",
  "working_hours": {
    "monday": {"start": "09:00", "end": "18:00"},
    "tuesday": {"start": "09:00", "end": "18:00"},
    "wednesday": {"start": "09:00", "end": "18:00"},
    "thursday": {"start": "09:00", "end": "18:00"},
    "friday": {"start": "09:00", "end": "17:00"}
  }
}
```
- Response: Created location with localized fields

#### Department Endpoints (Multilingual)

**GET /departments**
- Description: List departments with localized names
- Permissions: Any authenticated user
- Query Parameters:
  - `locale` (string): Override request locale
  - `flat` (boolean): Return flat list vs tree
- Response:
```json
{
  "success": true,
  "data": [
    {
      "id": "uuid",
      "name": "Ingeniería",
      "name_i18n": {
        "en-US": "Engineering",
        "es-ES": "Ingeniería",
        "fr-FR": "Ingénierie"
      },
      "code": "ENG",
      "description": "Desarrollo de productos e ingeniería",
      "children": [
        {
          "id": "uuid",
          "name": "Desarrollo Frontend",
          "name_i18n": {
            "en-US": "Frontend Development",
            "es-ES": "Desarrollo Frontend"
          }
        }
      ]
    }
  ],
  "meta": {
    "user_locale": "es-ES"
  }
}
```

**POST /departments**
- Description: Create department with multilingual names
- Permissions: `firm:departments:create`
- Request Body:
```json
{
  "name": "Engineering",
  "name_i18n": {
    "en-US": "Engineering",
    "es-ES": "Ingeniería",
    "fr-FR": "Ingénierie",
    "de-DE": "Entwicklung"
  },
  "code": "ENG",
  "description_i18n": {
    "en-US": "Product development and engineering",
    "es-ES": "Desarrollo de productos e ingeniería",
    "fr-FR": "Développement de produits et ingénierie"
  },
  "parent_department_id": null,
  "location_id": "uuid",
  "cost_center": "ENG-001"
}
```
- Validation:
  - `name_i18n` must include all enabled tenant locales
  - Falls back to `name` if locale missing
- Response: Created department

#### Job Title Endpoints (i18n, Multi-Currency)

**GET /job-titles**
- Description: List job titles with localized names and salary ranges
- Permissions: Any authenticated user
- Query Parameters:
  - `locale` (string): Override request locale
  - `currency` (string): Preferred currency for salary ranges
- Response:
```json
{
  "success": true,
  "data": [
    {
      "id": "uuid",
      "title": "Ingeniero de Software",
      "title_i18n": {
        "en-US": "Software Engineer",
        "es-ES": "Ingeniero de Software",
        "fr-FR": "Ingénieur Logiciel"
      },
      "description": "Desarrolla y mantiene aplicaciones de software",
      "levels": [
        {
          "id": "uuid",
          "level_name": "Senior",
          "level_name_i18n": {
            "en-US": "Senior",
            "es-ES": "Senior"
          },
          "salary_range": {
            "min": 100000,
            "max": 150000,
            "currency": "EUR",
            "formatted": {
              "min": "€100.000",
              "max": "€150.000"
            }
          },
          "salary_ranges_all_currencies": {
            "USD": {"min": 120000, "max": 180000},
            "EUR": {"min": 100000, "max": 150000},
            "GBP": {"min": 90000, "max": 130000}
          }
        }
      ]
    }
  ],
  "meta": {
    "user_locale": "es-ES",
    "display_currency": "EUR"
  }
}
```

**POST /job-titles**
- Description: Create job title with translations
- Permissions: `firm:job-titles:create`
- Request Body:
```json
{
  "title": "Software Engineer",
  "title_i18n": {
    "en-US": "Software Engineer",
    "es-ES": "Ingeniero de Software",
    "fr-FR": "Ingénieur Logiciel",
    "de-DE": "Software-Ingenieur"
  },
  "description_i18n": {
    "en-US": "Develops and maintains software applications...",
    "es-ES": "Desarrolla y mantiene aplicaciones de software...",
    "fr-FR": "Développe et maintient des applications logicielles..."
  },
  "is_exempt": true,
  "eeoc_category": "Professionals"
}
```
- Validation:
  - Must provide translations for all enabled tenant locales
  - Can provide partial translations (falls back to default)
- Response: Created job title

**POST /job-titles/:id/levels**
- Description: Add job level with multi-currency salary ranges
- Permissions: `firm:job-titles:update`
- Request Body:
```json
{
  "level_name": "Senior",
  "level_name_i18n": {
    "en-US": "Senior",
    "es-ES": "Senior",
    "fr-FR": "Senior",
    "de-DE": "Senior"
  },
  "salary_ranges": {
    "USD": {"min": 120000, "max": 180000},
    "EUR": {"min": 100000, "max": 150000},
    "GBP": {"min": 90000, "max": 130000},
    "CAD": {"min": 140000, "max": 210000}
  }
}
```
- Validation:
  - Min < max for each currency
  - At least one currency from tenant's supported currencies
- Response: Created job level

#### Pay Schedule Endpoints (Timezone-Aware)

**GET /pay-schedules**
- Description: List pay schedules with timezone-aware dates
- Permissions: `firm:pay-schedules:read`
- Query Parameters:
  - `timezone` (string): Display dates in specified timezone
- Response:
```json
{
  "success": true,
  "data": [
    {
      "id": "uuid",
      "name": "US Bi-weekly",
      "frequency": "bi-weekly",
      "timezone": "America/New_York",
      "currency": "USD",
      "anchor_date": "2025-01-03",
      "next_pay_dates": [
        {
          "date": "2025-01-17",
          "date_local": "2025-01-17T00:00:00-05:00",
          "formatted": "Friday, January 17, 2025"
        },
        {
          "date": "2025-01-31",
          "date_local": "2025-01-31T00:00:00-05:00",
          "formatted": "Friday, January 31, 2025"
        }
      ],
      "locations": ["nyc-uuid", "boston-uuid"]
    }
  ],
  "meta": {
    "user_timezone": "America/Los_Angeles"
  }
}
```

**POST /pay-schedules**
- Description: Create pay schedule
- Permissions: `firm:pay-schedules:create`
- Request Body:
```json
{
  "name": "EU Monthly",
  "name_i18n": {
    "en-US": "European Monthly",
    "fr-FR": "Mensuel Européen",
    "de-DE": "Europäisch Monatlich"
  },
  "frequency": "monthly",
  "anchor_date": "2025-01-31",
  "timezone": "Europe/Paris",
  "currency": "EUR",
  "location_ids": ["paris-uuid", "berlin-uuid"]
}
```
- Response: Created pay schedule with calculated next 12 pay dates in specified timezone

#### Benefits Package Endpoints (Multi-Currency, i18n)

**GET /benefits-packages**
- Description: List benefits packages with localized content
- Permissions: `firm:benefits:read`
- Query Parameters:
  - `locale` (string): Override request locale
  - `currency` (string): Display costs in specified currency
- Response:
```json
{
  "success": true,
  "data": [
    {
      "id": "uuid",
      "name": "Avantages Standards à Temps Plein",
      "name_i18n": {
        "en-US": "Full-time Standard Benefits",
        "fr-FR": "Avantages Standards à Temps Plein",
        "es-ES": "Beneficios Estándar de Tiempo Completo"
      },
      "description": "Forfait d'avantages standard pour les employés à temps plein",
      "benefits": [
        {
          "id": "uuid",
          "benefit_type": "medical",
          "benefit_name": "Plan de Santé PPO",
          "benefit_name_i18n": {
            "en-US": "PPO Health Plan",
            "fr-FR": "Plan de Santé PPO"
          },
          "carrier_name": "Blue Cross",
          "costs": {
            "employee_monthly": 180,
            "employer_monthly": 720,
            "currency": "EUR",
            "formatted": {
              "employee": "€180,00",
              "employer": "€720,00",
              "total": "€900,00"
            }
          }
        }
      ]
    }
  ],
  "meta": {
    "user_locale": "fr-FR",
    "display_currency": "EUR"
  }
}
```

**POST /benefits-packages**
- Description: Create benefits package
- Permissions: `firm:benefits:create`
- Request Body:
```json
{
  "name": "Executive Package",
  "name_i18n": {
    "en-US": "Executive Benefits Package",
    "es-ES": "Paquete de Beneficios para Ejecutivos",
    "fr-FR": "Forfait Avantages Cadres"
  },
  "description_i18n": {
    "en-US": "Enhanced benefits for executive-level employees",
    "es-ES": "Beneficios mejorados para empleados de nivel ejecutivo",
    "fr-FR": "Avantages améliorés pour les cadres"
  },
  "eligibility_rules": {
    "employment_types": ["full-time"],
    "waiting_period_days": 0,
    "min_job_level": 5
  }
}
```
- Response: Created package

**POST /benefits-packages/:id/benefits**
- Description: Add benefit item to package
- Permissions: `firm:benefits:update`
- Request Body:
```json
{
  "benefit_type": "medical",
  "benefit_name": "Premium PPO",
  "benefit_name_i18n": {
    "en-US": "Premium PPO Health Plan",
    "es-ES": "Plan de Salud PPO Premium",
    "fr-FR": "Plan de Santé PPO Premium"
  },
  "carrier_name": "Blue Cross",
  "costs_by_currency": {
    "USD": {
      "employee_contribution": {"type": "percentage", "value": 10},
      "employer_contribution": {"type": "percentage", "value": 90}
    },
    "EUR": {
      "employee_contribution": {"type": "fixed", "value": 100},
      "employer_contribution": {"type": "fixed", "value": 900}
    }
  },
  "plan_details_i18n": {
    "en-US": {
      "deductible": 500,
      "out_of_pocket_max": 3000,
      "coverage": "Comprehensive medical, dental, vision"
    },
    "fr-FR": {
      "deductible": 500,
      "out_of_pocket_max": 3000,
      "coverage": "Couverture médicale, dentaire, vision complète"
    }
  }
}
```
- Response: Created benefit item

#### Holiday Endpoints (Timezone, i18n)

**GET /locations/:location_id/holidays**
- Description: Get holidays for location with timezone-aware dates
- Permissions: Any authenticated user
- Query Parameters:
  - `year` (int): Filter by year
  - `locale` (string): Override request locale
  - `timezone` (string): Display times in timezone
- Response:
```json
{
  "success": true,
  "data": [
    {
      "id": "uuid",
      "name": "Jour de l'An",
      "name_i18n": {
        "en-US": "New Year's Day",
        "fr-FR": "Jour de l'An",
        "es-ES": "Año Nuevo",
        "de-DE": "Neujahr"
      },
      "date": "2025-01-01",
      "observed_at": "2025-01-01T00:00:00+01:00",
      "observed_at_formatted": "mercredi 1 janvier 2025",
      "is_recurring": true,
      "is_paid": true,
      "is_mandatory": true,
      "location_timezone": "Europe/Paris"
    }
  ],
  "meta": {
    "location_id": "paris-uuid",
    "location_name": "Bureau de Paris",
    "location_timezone": "Europe/Paris",
    "user_locale": "fr-FR",
    "year": 2025
  }
}
```

**POST /locations/:location_id/holidays**
- Description: Add holiday to location
- Permissions: `firm:holidays:create`
- Request Body:
```json
{
  "name": "Bastille Day",
  "name_i18n": {
    "en-US": "Bastille Day",
    "fr-FR": "Fête Nationale",
    "es-ES": "Día de la Bastilla",
    "de-DE": "Nationalfeiertag"
  },
  "date": "2025-07-14",
  "is_recurring": true,
  "recurrence_rule": "annual",
  "is_paid": true,
  "is_mandatory": true
}
```
- Note: `observed_at` timestamp automatically calculated based on location timezone
- Response: Created holiday

**POST /locations/:location_id/holidays/import**
- Description: Import standard holiday set for country
- Permissions: `firm:holidays:create`
- Request Body:
```json
{
  "country_code": "FR",
  "year": 2025,
  "holiday_set": "national",
  "locale": "fr-FR"
}
```
- Response: List of imported holidays with i18n names

### API Response Formatting

All API responses include i18n metadata:

```json
{
  "success": true,
  "data": { /* ... */ },
  "meta": {
    "user_locale": "es-ES",
    "user_timezone": "Europe/Madrid",
    "user_currency": "EUR",
    "tenant_default_locale": "en-US",
    "tenant_supported_locales": ["en-US", "es-ES", "fr-FR"],
    "request_id": "uuid",
    "timestamp": "2025-12-01T10:30:00Z"
  }
}
```

### Error Responses (Localized)

Error messages returned in user's locale:

```json
{
  "success": false,
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "El nombre del departamento es obligatorio",
    "message_key": "validation.department.name.required",
    "details": [
      {
        "field": "name",
        "message": "Este campo es obligatorio",
        "message_key": "validation.field.required"
      }
    ]
  },
  "meta": {
    "user_locale": "es-ES",
    "request_id": "uuid",
    "timestamp": "2025-12-01T10:30:00Z"
  }
}
```

Translation keys allow frontend to override if needed.

---

## User Interface Specifications

### UI i18n Requirements

**Language Selector**:
- Displayed in user dropdown menu
- Shows enabled tenant locales
- Persists selection to user profile
- Immediate UI update on change

**Currency Display**:
- All monetary values formatted per user's locale
- Currency symbol positioned per locale (before/after)
- Decimal separator based on locale (. vs ,)
- Thousand separator based on locale

**Date/Time Display**:
- All dates formatted per user's locale
- Times displayed in user's timezone
- Relative times localized ("hace 2 horas" vs "2 hours ago")
- Calendar widgets respect locale (week start day, month names)

**Number Formatting**:
- Percentages formatted per locale (85% vs 85 %)
- Large numbers with locale separators (1,000,000 vs 1.000.000)

### Page Specifications (i18n-Enhanced)

#### Company Profile Page

**URL**: `/settings/company`

**Sections**:

**Tenant Information**:
- Subdomain (read-only after creation)
- Company Name (with translations)
  - EN: [Text input]
  - ES: [Text input]
  - FR: [Text input]
- Logo Upload
- Website

**Regional Settings**:
- Default Locale (dropdown: en-US, es-ES, fr-FR, etc.)
- Enabled Locales (multi-select)
- Default Currency (dropdown with symbols: $ USD, € EUR, £ GBP)
- Supported Currencies (multi-select)
- Default Timezone (searchable dropdown grouped by region)
- Date Format (dropdown: MM/DD/YYYY, DD/MM/YYYY, YYYY-MM-DD, etc.)
- Time Format (radio: 12-hour, 24-hour)

**Preview Section**:
Shows examples of formatting with current settings:
- Date: "December 1, 2025" (formatted per locale)
- Currency: "$1,234.56" (formatted per locale + currency)
- Number: "1,234.56" (formatted per locale)

#### Locations Page (i18n)

**URL**: `/settings/locations`

**Add/Edit Location Modal**:

**Tab 1: Basic Information**:
- Location Name
  - Default: [Text input]
  - Translations:
    - EN: [Text input]
    - ES: [Text input]
    - FR: [Text input]
    - (Shows all enabled tenant locales)
- Address Fields (validated per country)
- Country (dropdown, flags + names)
- Is Headquarters (checkbox)

**Tab 2: Regional Settings**:
- Timezone (searchable dropdown with current time preview)
  - Shows: "Europe/Paris (CET, UTC+1) - Currently 3:45 PM"
- Locale Override (dropdown, optional)
  - Default: Use tenant default (en-US)
  - Override: fr-FR
- Currency Override (dropdown, optional)
  - Default: Use tenant default (USD)
  - Override: EUR
- Working Hours
  - Displayed in location's timezone
  - Monday: 09:00 - 18:00 CET
  - Tuesday: 09:00 - 18:00 CET

**Tab 3: Contact**:
- Phone (with country code selector)
- Email

**Preview**:
- Current time at this location: "3:45 PM CET (15:45)"
- Formatted address (country-specific format)

#### Departments Page (Multilingual)

**URL**: `/settings/departments`

**Add/Edit Department Modal**:
- Department Name (Multilingual)
  - Primary Language (en-US): [Text input]
  - Spanish (es-ES): [Text input]
  - French (fr-FR): [Text input]
  - German (de-DE): [Text input]
- Department Code: [Text input] (unique, uppercase)
- Parent Department: [Dropdown]
- Description (Multilingual, rich text)
  - Tabs for each locale with rich text editor
- Location: [Dropdown]
- Cost Center: [Text input]
- Budget Currency: [Dropdown] (defaults to tenant currency)

**Organization Chart View**:
- Toggle language selector at top
- Updates all department names to selected language
- Breadcrumb trail in selected language

#### Job Titles Page (i18n + Multi-Currency)

**URL**: `/settings/job-titles`

**Add/Edit Job Title Modal**:

**Tab 1: Title & Description**:
- Job Title (Multilingual)
  - Required for all enabled locales
  - Primary (en-US): "Software Engineer"
  - Spanish (es-ES): "Ingeniero de Software"
  - French (fr-FR): "Ingénieur Logiciel"
- Description (Multilingual rich text)
  - Tabs for each locale
- FLSA Classification: [Radio buttons]
- EEOC Category: [Dropdown]

**Tab 2: Job Levels**:
Table with columns:
- Level Name (click to edit translations)
- Salary Range (shows in user's preferred currency)
  - Toggle to view all currencies
- Actions (Edit, Delete)

**Add/Edit Job Level Modal**:
- Level Name (Multilingual)
  - EN: "Senior"
  - ES: "Senior"
  - FR: "Senior"
- Salary Ranges (Multi-Currency)
  - USD: Min $120,000 - Max $180,000
  - EUR: Min €100,000 - Max €150,000
  - GBP: Min £90,000 - Max £130,000
  - (Shows all enabled tenant currencies)
  - "Add Currency" button to add more ranges

**Currency Conversion Helper**:
- Base amount in one currency
- Auto-suggests ranges in other currencies using current exchange rates
- User can override suggestions

#### Pay Schedules Page (Timezone-Aware)

**URL**: `/settings/payroll/schedules`

**Add Pay Schedule Modal**:
- Schedule Name (Multilingual optional)
  - Primary: "US Bi-weekly"
  - ES: "Quincenal de EE.UU."
- Frequency: [Dropdown]
  - Weekly
  - Bi-weekly
  - Semi-monthly
  - Monthly
- First Pay Date: [Date picker]
- Timezone: [Dropdown with preview]
  - America/New_York (EST, UTC-5)
  - Current time: 10:30 AM EST
- Currency: [Dropdown]
- Applicable Locations: [Multi-select]

**Pay Date Preview**:
Shows next 12 pay dates in:
- Schedule timezone (default)
- User's timezone (with conversion note)

Example:
```
Next Pay Dates (America/New_York):
1. Friday, Jan 17, 2025
2. Friday, Jan 31, 2025
...

Your timezone (Europe/Paris): Dates will occur on Saturday (due to time difference)
```

#### Benefits Packages Page (Multi-Currency, i18n)

**URL**: `/settings/benefits`

**Add/Edit Package Modal**:

**Tab 1: Package Details**:
- Package Name (Multilingual)
  - EN: "Full-time Standard"
  - ES: "Estándar de Tiempo Completo"
  - FR: "Standard à Temps Plein"
- Description (Multilingual)
  - Rich text tabs for each locale

**Tab 2: Eligibility**:
- Employment Types: [Checkboxes]
- Waiting Period: [Number input] days
- Minimum Job Level: [Dropdown]
- Applicable Locations: [Multi-select] (optional)

**Tab 3: Benefits**:
Table of benefits with "+ Add Benefit" button

**Add/Edit Benefit Modal**:
- Benefit Type: [Dropdown] (Medical, Dental, Vision, 401k, etc.)
- Benefit Name (Multilingual)
  - EN: "PPO Health Plan"
  - ES: "Plan de Salud PPO"
- Carrier Name: [Text input]
- Costs (Multi-Currency)
  - Currency: USD [Dropdown]
  - Employee Contribution: [Radio: Percentage / Fixed amount]
    - If percentage: 20 %
    - If fixed: $200 /month
  - Employer Contribution: [Calculated or input]
  - "+ Add Another Currency" button
- Plan Details (Multilingual rich text)

**Cost Display**:
Shows in user's preferred currency:
- Employee cost: €180/month
- Employer cost: €720/month
- Total cost: €900/month

Toggle to view all currencies.

#### Holiday Calendar Page (Timezone, i18n)

**URL**: `/settings/holidays`

**Layout**:
- Location Selector: [Dropdown]
  - Shows location name in user's locale
  - Displays location timezone
- Year Selector: [Dropdown]
- "Import Holidays" button
- "Add Holiday" button

**Calendar View**:
- Month names in user's locale
- Holiday names displayed in user's locale
- Dates respect location timezone
- Color coding: Paid (green), Unpaid (orange), Floating (blue)

**Add/Edit Holiday Modal**:
- Holiday Name (Multilingual)
  - EN: "Independence Day"
  - ES: "Día de la Independencia"
  - FR: "Fête de l'Indépendance"
- Date: [Date picker]
  - Note: "This date will be observed in {location timezone}"
- Recurring: [Checkbox]
  - If checked: Recurrence Rule [Dropdown]
    - Annual (same date each year)
    - Custom (4th Thursday in November, etc.)
- Paid Holiday: [Checkbox]
- Mandatory/Optional: [Radio buttons]

**Import Holidays Dialog**:
- Country: [Dropdown with flags]
- Year: [Number input]
- Holiday Set: [Radio]
  - National holidays
  - Regional holidays
  - Religious holidays
- Language for names: [Dropdown]
  - Defaults to location's locale
- Preview: [Table showing holidays to import]
  - Checkboxes to select/deselect
  - Shows holiday names in selected language
- Import button

**Timezone Indicator**:
Each holiday shows:
```
New Year's Day
January 1, 2025
Observed at: 12:00 AM CET (Europe/Paris)
In your timezone: January 1, 2025 12:00 AM CET
```

---

## Business Logic & Rules

### BR-FP-001: Tenant Locale Configuration
- **Rule**: Default locale must be in supported locales array
- **Enforcement**: Database constraint + application validation
- **Behavior**: Changing default locale doesn't affect existing user preferences

### BR-FP-002: Multilingual Required Fields
- **Rule**: For fields marked as multilingual-required, translations must be provided for all enabled tenant locales
- **Enforcement**: Application validation on create/update
- **Fallback**: If translation missing, use default language value
- **Example**: Department name required in en-US, es-ES, fr-FR if those locales are enabled

### BR-FP-003: Currency Support
- **Rule**: All monetary amounts must include currency code
- **Enforcement**: Database schema + application validation
- **Behavior**: When displaying, format amount according to user's locale and currency preference
- **Conversion**: Real-time conversion for display only; always store in original currency

### BR-FP-004: Timezone-Aware Dates
- **Rule**: All dates with time component stored in UTC
- **Enforcement**: Database type (`TIMESTAMP WITH TIME ZONE`)
- **Behavior**: Convert to user's timezone for display
- **Example**: Pay date stored as `2025-01-17 00:00:00+00`, displayed as "January 17, 2025" in user's timezone

### BR-FP-005: Location Headquarters
- **Rule**: Only one location per tenant can be headquarters
- **Enforcement**: Unique partial index on database
- **Behavior**: Setting new HQ automatically unsets previous

### BR-FP-006: Salary Range Multi-Currency
- **Rule**: Salary ranges can be defined in multiple currencies
- **Enforcement**: JSONB validation
- **Behavior**: Display in user's preferred currency; show all if requested
- **Validation**: Min < max for each currency independently

### BR-FP-007: Holiday Timezone Observance
- **Rule**: Holidays observed based on location's timezone
- **Enforcement**: Automatic trigger calculates `observed_at` timestamp
- **Example**: Dec 25 in NYC (EST) and Tokyo (JST) are different UTC moments

### BR-FP-008: Working Hours Display
- **Rule**: Working hours stored as time-only, interpreted in location's timezone
- **Enforcement**: Application layer conversion
- **Example**: "9:00 AM - 5:00 PM" stored as "09:00-17:00", displayed as "9:00 AM PST" or "18:00 CET"

### BR-FP-009: Locale Fallback Chain
- **Rule**: If content not available in user's locale, fallback: user locale → tenant default locale → en-US
- **Enforcement**: Application helper function
- **Example**: User wants fr-FR, content only in en-US and es-ES → shows en-US (tenant default)

### BR-FP-010: Department Code Uniqueness
- **Rule**: Department codes unique within tenant (across all locales)
- **Enforcement**: Database unique constraint
- **Example**: Can't have "ENG" in both English and French departments

### BR-FP-011: Benefits Cost Currency
- **Rule**: Benefits costs can vary by currency for same package
- **Enforcement**: JSONB structure validation
- **Behavior**: Show cost in employee's location currency or preference
- **Example**: Same benefit costs $200/mo in USD, €180/mo in EUR

### BR-FP-012: Pay Schedule Timezone
- **Rule**: Pay dates calculated in pay schedule's designated timezone
- **Enforcement**: Application calculation logic
- **Example**: Bi-weekly schedule in EST: every other Friday at midnight EST

### BR-FP-013: Holiday Import Deduplication
- **Rule**: When importing holidays, check for duplicates (same date + location)
- **Enforcement**: Application logic
- **Behavior**: Skip or update existing, don't create duplicate

### BR-FP-014: Translation Updates
- **Rule**: Updating translations doesn't require re-approval or version change
- **Enforcement**: Separate update path
- **Behavior**: Allow updates to i18n fields without affecting core data

---

## Validation Rules

### Tenant Configuration

| Field | Required | Validation | Notes |
|-------|----------|------------|-------|
| subdomain | Yes | `^[a-z0-9-]{3,50}$` | Globally unique, immutable |
| default_locale | Yes | Must be in `supported_locales` | Must be platform-supported |
| supported_locales | Yes | Array of valid locale codes | At least one (default) |
| default_currency | Yes | ISO 4217 code | Must be in `supported_currencies` |
| supported_currencies | Yes | Array of ISO 4217 codes | At least one |
| default_timezone | Yes | IANA timezone identifier | E.g., "America/New_York" |

### Location (i18n fields)

| Field | Required | Validation | Notes |
|-------|----------|------------|-------|
| name | Yes | 2-255 chars | Fallback if i18n missing |
| name_i18n | Recommended | Object with locale keys | Should cover enabled locales |
| timezone | Yes | Valid IANA timezone | Used for working hours |
| country | Yes | ISO 3166-1 alpha-2 | Two-letter code |
| locale | No | Valid locale code | Overrides tenant default |
| currency | No | ISO 4217 code | Overrides tenant default |

### Department (Multilingual)

| Field | Required | Validation | Notes |
|-------|----------|------------|-------|
| name | Yes | 2-255 chars | Required for default locale |
| name_i18n | Recommended | Translations for enabled locales | Fallback to `name` |
| code | Yes | 2-50 chars, uppercase | Unique within tenant |
| description_i18n | No | Translations optional | Rich text supported |

### Job Title (i18n + Multi-Currency)

| Field | Required | Validation | Notes |
|-------|----------|------------|-------|
| title | Yes | 2-255 chars | Fallback value |
| title_i18n | Recommended | All enabled locales | Used for display |
| salary_ranges | No | JSONB with currency keys | Each: {min: number, max: number} |
| | | | Validation: min < max per currency |

### Pay Schedule (Timezone-Aware)

| Field | Required | Validation | Notes |
|-------|----------|------------|-------|
| name | Yes | 2-255 chars | Can be multilingual |
| frequency | Yes | Enum | weekly, bi-weekly, semi-monthly, monthly |
| anchor_date | Yes | Valid date | First pay date |
| timezone | Yes | IANA timezone | For date calculations |
| currency | Yes | ISO 4217 | For this schedule |

### Benefits Package (Multi-Currency, i18n)

| Field | Required | Validation | Notes |
|-------|----------|------------|-------|
| name | Yes | 2-255 chars | Fallback |
| name_i18n | Recommended | Translations | All enabled locales |
| benefit_name_i18n | Recommended | Per benefit item | Localized benefit names |
| costs_by_currency | Yes | JSONB | At least tenant's default currency |
| | | | contribution types: percentage or fixed |

### Holiday (Timezone, i18n)

| Field | Required | Validation | Notes |
|-------|----------|------------|-------|
| name | Yes | 2-255 chars | Fallback |
| name_i18n | Recommended | Translations | Holiday name in all locales |
| date | Yes | Valid date | In YYYY-MM-DD format |
| observed_at | Auto | Calculated | Based on location timezone |

---

## Security Considerations

### Multi-Tenant Isolation

**Database Level**:
- Row-level security policies enforce `tenant_id` filtering
- All queries automatically scoped to tenant
- Triggers prevent cross-tenant references

**Application Level**:
- Middleware injects tenant context from JWT
- Base repository pattern auto-filters by tenant
- API responses never expose `tenant_id` to client

**Audit Trail**:
- All changes logged with tenant context
- Cannot delete audit logs (retention: 7 years)
- Tenant admins can view own audit logs only

### i18n Security

**Translation Injection Prevention**:
- All user-provided translations sanitized
- HTML stripped from plain text fields
- Rich text fields use allowlist-based sanitizer
- Prevent XSS via malicious translations

**Locale Validation**:
- Only accept platform-supported locales
- Validate locale codes against whitelist
- Prevent directory traversal via locale parameter

**Currency Validation**:
- Only accept ISO 4217 currency codes
- Validate against supported currencies list
- Prevent injection via currency formatting

### Sensitive Data

**Field-Level Permissions**:
- Salary ranges visible only to: HR Admin, hiring managers, employee (own data)
- Department budgets visible only to: Finance team, department heads
- Benefits costs: Configurable visibility by role

**Data Encryption**:
- Sensitive fields encrypted at rest (if required)
- TLS 1.3 for data in transit
- Encryption keys rotated quarterly

### API Security

**Rate Limiting** (per tenant):
- Read endpoints: 100 req/min
- Write endpoints: 20 req/min
- Translation updates: 10 req/min

**Input Validation**:
- Sanitize all i18n content
- Validate JSONB structure
- Prevent oversized payloads (max 1MB for i18n fields)

---

## Integration Points

### Platform Services (Consumed)

**Tenant Context Service**:
- Provides tenant resolution
- Injects tenant context into requests
- Manages tenant settings cache

**i18n Service**:
- Translation lookup and caching
- Date/time formatting
- Currency formatting
- Number formatting
- Address formatting

**Authentication Service**:
- JWT validation
- User locale/timezone/currency preferences
- Permission checking

### Module Services (Provides To)

**HR Module**:
- Job titles with translations
- Department structure with i18n names
- Location data with timezones
- Payroll schedules
- Benefits packages
- Holiday calendars

**Recruiting Module**:
- Job titles and descriptions (multilingual)
- Locations for job postings
- Salary ranges in multiple currencies

**Accounting Module**:
- Department cost centers
- Multi-currency configuration
- Fiscal calendar

**All Modules**:
- Tenant configuration
- Enabled locales
- Supported currencies
- Default timezone

### External Integrations

**Exchange Rate Provider** (for currency conversion):
- Daily exchange rate updates
- Historical rates for reporting
- API: xe.com, fixer.io, or similar

**Address Validation**:
- Country-specific address validation
- API: Google Maps, SmartyStreets

**Holiday Data Provider**:
- Standard holiday sets by country
- API: calendarific.com, holiday-api.com

**Translation Services** (future):
- Machine translation for initial content
- API: Google Translate, DeepL

---

## Reporting Requirements

### Standard Reports (i18n-Aware)

#### R-FP-001: Organization Chart
- **Description**: Visual hierarchy with multilingual names
- **Filters**: Department, location, locale
- **Output**: PDF, PNG, interactive web view
- **i18n**: Department names in selected locale
- **Data**: Departments, employees, reporting relationships

#### R-FP-002: Location Directory
- **Description**: List of locations with contact info
- **Filters**: Active status, country
- **Output**: PDF, Excel
- **i18n**: Location names, addresses formatted per country
- **Columns**: Name (localized), Address (formatted), Timezone, Contact, Employees

#### R-FP-003: Job Title Compensation Analysis
- **Description**: Salary ranges across titles and levels
- **Filters**: Department, location, currency
- **Output**: Excel, PDF
- **i18n**: Titles in selected locale, amounts in selected currency
- **Columns**: Title (localized), Level, Min, Max, Avg, Currency, # Employees

#### R-FP-004: Benefits Enrollment Summary
- **Description**: Enrollment stats by package and benefit
- **Filters**: Package, location, currency
- **Output**: Excel, PDF
- **i18n**: Package and benefit names localized, costs in selected currency
- **Columns**: Package, Benefit, Enrolled, Eligible, Enrollment Rate, Cost

#### R-FP-005: Holiday Calendar Export
- **Description**: Annual holiday calendar per location
- **Filters**: Location, year
- **Output**: PDF, iCal, Excel
- **i18n**: Holiday names in selected locale, dates in location timezone
- **Format**: Calendar grid or list view

#### R-FP-006: Multi-Currency Compensation Report
- **Description**: Total compensation across all currencies
- **Filters**: Department, location
- **Output**: Excel (with pivot tables)
- **i18n**: Amounts shown in original currency + converted to base currency
- **Columns**: Employee, Title, Salary, Currency, Converted Amount (Base Currency), Exchange Rate

#### R-FP-007: Global Workforce Distribution
- **Description**: Headcount by location, currency, locale
- **Filters**: Employment status, date range
- **Output**: Dashboard, PDF
- **i18n**: Location names localized
- **Visualizations**:
  - World map with pins
  - Bar charts by currency
  - Pie charts by locale

### Report Localization

All reports support:
- **Header/Footer**: Translated to user's locale
- **Column Names**: Localized
- **Data Formatting**:
  - Dates: User's locale format
  - Numbers: User's locale separators
  - Currency: Appropriate symbol and formatting
- **Export Filename**: Includes locale and timestamp in locale's date format

**Example**:
- English: `Organization_Chart_2025-12-01.pdf`
- Spanish: `Organigrama_01-12-2025.pdf`
- German: `Organigramm_01.12.2025.pdf`

---

## Testing Requirements

### Unit Tests

**Multi-Tenant Isolation**:
- ✓ Verify tenant_id automatically injected on create
- ✓ Verify queries filtered by tenant_id
- ✓ Verify cross-tenant access prevented
- ✓ Verify tenant context in audit logs

**i18n Functionality**:
- ✓ Verify locale fallback chain (user → tenant → en-US)
- ✓ Verify translation lookup from cache and database
- ✓ Verify missing translation handling
- ✓ Verify JSONB i18n field structure validation

**Date/Time Handling**:
- ✓ Verify UTC storage
- ✓ Verify timezone conversion for display
- ✓ Verify date formatting per locale
- ✓ Verify holiday date calculation in location timezone
- ✓ Verify pay date calculation in schedule timezone

**Currency Handling**:
- ✓ Verify multi-currency storage in JSONB
- ✓ Verify currency formatting per locale
- ✓ Verify salary range validation (min < max per currency)
- ✓ Verify benefits cost calculation in multiple currencies

**Business Logic**:
- ✓ One headquarters per tenant
- ✓ Department code uniqueness within tenant
- ✓ Default locale in supported locales
- ✓ Multilingual required field validation

### Integration Tests

**API Tests**:
- ✓ Locale negotiation from Accept-Language header
- ✓ i18n content returned in requested locale
- ✓ Currency amounts formatted per locale
- ✓ Dates formatted per locale
- ✓ Timezone conversion in responses
- ✓ Multilingual create/update operations
- ✓ Error messages localized

**Database Tests**:
- ✓ Row-level security policies enforce tenant isolation
- ✓ Triggers calculate timezone-aware timestamps
- ✓ GIN indexes on JSONB i18n fields performant
- ✓ Unique constraints per tenant work correctly

### End-to-End Tests

**Multi-Tenant Scenarios**:
- ✓ User from Tenant A cannot see Tenant B's data
- ✓ Creating location in Tenant A doesn't affect Tenant B
- ✓ Searching across modules respects tenant boundary

**i18n User Flows**:
- ✓ User sets locale to Spanish, sees Spanish UI and content
- ✓ User in France sees dates in DD/MM/YYYY format
- ✓ User in Germany sees currency as 1.234,56 € format
- ✓ User switches locale, UI updates immediately
- ✓ Admin creates department with multilingual names, all locales work
- ✓ Report generated in user's locale with correct formatting

**Timezone Scenarios**:
- ✓ User in Tokyo sees holiday calendar in JST
- ✓ User in NYC sees same holiday different local time
- ✓ Pay schedule dates displayed correctly in all timezones
- ✓ Working hours respect location timezone

**Currency Scenarios**:
- ✓ Job posting shows salary in local currency
- ✓ Benefits cost displayed in employee's currency
- ✓ Currency conversion in reports accurate
- ✓ Multi-currency compensation report totals correct

### Performance Tests

**Scalability**:
- ✓ 1000 tenants, 100 locations each: query < 500ms
- ✓ Translation lookup from cache < 10ms
- ✓ i18n JSONB field retrieval < 50ms
- ✓ Organization chart for 500 departments < 2s

**Load Tests**:
- ✓ 100 concurrent users across 10 tenants
- ✓ API response times < 500ms (p95)
- ✓ Translation cache hit rate > 95%

### Localization Tests

**Translation Quality**:
- ✓ All UI strings have translations for supported locales
- ✓ Translations grammatically correct (native speaker review)
- ✓ Translations fit in UI (no text overflow)
- ✓ Placeholder variables replaced correctly
- ✓ Pluralization rules work per locale

**Formatting Tests**:
- ✓ Dates formatted correctly for each locale
- ✓ Numbers formatted correctly for each locale
- ✓ Currency symbols and positions correct
- ✓ Address formatting per country standards
- ✓ Phone number formatting per country

---

## Future Enhancements

### Phase 2 Features (6-12 months)

1. **Additional Locales**:
   - Portuguese (Brazil) - pt-BR
   - Japanese - ja-JP
   - Chinese (Simplified) - zh-CN
   - Italian - it-IT
   - Dutch - nl-NL

2. **Advanced i18n**:
   - Right-to-left (RTL) language support (Arabic, Hebrew)
   - Context-aware translations (formal vs informal)
   - Pluralization rules per locale
   - Gender-specific translations
   - Machine translation integration for initial content

3. **Enhanced Currency Features**:
   - Historical exchange rate tracking
   - Custom exchange rate overrides
   - Multi-currency budget planning
   - Currency risk reporting

4. **Timezone Enhancements**:
   - Daylight saving time transition handling
   - Meeting scheduler with timezone awareness
   - "Business hours" calculator across timezones
   - Timezone change notifications

5. **Tenant Customization**:
   - Custom translation overrides per tenant
   - Tenant-specific terminology (PTO vs Annual Leave)
   - Custom date/number format patterns
   - Branded subdomain with custom domain (acme.com instead of acme.platform.com)

### Phase 3 Features (12-24 months)

1. **AI-Powered Translation**:
   - Automatic translation suggestions
   - Translation memory
   - Translation quality scoring
   - Bulk translation workflows

2. **Advanced Reporting**:
   - Cross-currency analytics
   - Global workforce dashboards
   - Locale adoption metrics
   - Translation coverage reports

3. **Compliance & Legal**:
   - Region-specific labor law compliance
   - Multi-jurisdiction payroll rules
   - Data residency enforcement per country
   - Local holiday auto-updates

4. **Performance Optimization**:
   - Edge caching for translations
   - Locale-specific CDN deployment
   - Progressive loading of i18n content

---

## Appendix

### Supported Locales (Full List)

**Phase 1** (Launch):
- `en-US` - English (United States)
- `en-GB` - English (United Kingdom)
- `es-ES` - Spanish (Spain)
- `es-MX` - Spanish (Mexico)
- `fr-FR` - French (France)
- `de-DE` - German (Germany)

**Phase 2** (6 months):
- `pt-BR` - Portuguese (Brazil)
- `ja-JP` - Japanese (Japan)
- `zh-CN` - Chinese (Simplified, China)
- `it-IT` - Italian (Italy)
- `nl-NL` - Dutch (Netherlands)

**Phase 3** (12 months):
- `ar-SA` - Arabic (Saudi Arabia) - RTL
- `he-IL` - Hebrew (Israel) - RTL
- `ko-KR` - Korean (South Korea)
- `ru-RU` - Russian (Russia)
- `pl-PL` - Polish (Poland)

### Supported Currencies

**Launch Currencies**:
- USD - US Dollar ($)
- EUR - Euro (€)
- GBP - British Pound (£)
- CAD - Canadian Dollar (C$)
- AUD - Australian Dollar (A$)
- CHF - Swiss Franc (CHF)
- JPY - Japanese Yen (¥)
- CNY - Chinese Yuan (¥)
- INR - Indian Rupee (₹)
- MXN - Mexican Peso ($)

**Additional Currencies** (on request):
- BRL - Brazilian Real
- KRW - South Korean Won
- SEK - Swedish Krona
- NOK - Norwegian Krone
- DKK - Danish Krone
- And 100+ more via ISO 4217

### Date Format Examples by Locale

| Locale | Format | Example |
|--------|--------|---------|
| en-US | MM/DD/YYYY | 12/01/2025 |
| en-GB | DD/MM/YYYY | 01/12/2025 |
| es-ES | DD/MM/YYYY | 01/12/2025 |
| fr-FR | DD/MM/YYYY | 01/12/2025 |
| de-DE | DD.MM.YYYY | 01.12.2025 |
| ja-JP | YYYY/MM/DD | 2025/12/01 |
| zh-CN | YYYY年MM月DD日 | 2025年12月01日 |

### Number Format Examples by Locale

| Locale | Number | Currency |
|--------|--------|----------|
| en-US | 1,234.56 | $1,234.56 |
| en-GB | 1,234.56 | £1,234.56 |
| es-ES | 1.234,56 | 1.234,56 € |
| fr-FR | 1 234,56 | 1 234,56 € |
| de-DE | 1.234,56 | 1.234,56 € |
| ja-JP | 1,234.56 | ¥1,235 |

### Address Format Templates

**United States**:
```
{line1}
{line2}
{city}, {state} {postal_code}
{country}
```

**United Kingdom**:
```
{line1}
{line2}
{city}
{state}
{postal_code}
{country}
```

**Germany**:
```
{line1}
{line2}
{postal_code} {city}
{country}
```

**Japan**:
```
〒{postal_code}
{state}{city}
{line1}
{line2}
{country}
```

---

**Document Version**: 2.0
**Last Updated**: December 1, 2025
**Next Review**: March 1, 2025
**Owner**: Product Management & Engineering
**Changes from v1.0**:
- Complete multi-tenant architecture integration
- Comprehensive i18n support throughout
- Multi-currency salary and benefits
- Timezone-aware date handling
- Multilingual content management
- Updated data models with i18n fields
- Enhanced API specifications with locale/currency support
- UI updates for i18n/multi-currency
- Expanded testing requirements for i18n
