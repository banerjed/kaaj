# Enumeration Types - Implementation Guide

**Version:** 1.0
**Last Updated:** December 5, 2025
**Related Files:** [enumerations.json](./enumerations.json), [schema.sql](./data-models/schema.sql)

---

## Overview

This document provides guidance on implementing and using the enumerated types defined in `enumerations.json`. These enumerations ensure data consistency, improve data quality, and simplify validation across all modules of the business management platform.

## File Organization

The enumerations are organized into 20 logical groups:

### 1. **Tenant** (3 enums)
- Platform-level subscription and billing configurations
- Examples: `planTier`, `billingStatus`, `region`

### 2. **Localization** (6 enums)
- Internationalization and formatting preferences
- Examples: `locale`, `currency`, `timezone`, `dateFormat`, `timeFormat`, `numberFormat`

### 3. **Employment** (8 enums)
- Employment relationship and status types
- Examples: `employmentType`, `employmentStatus`, `workArrangement`, `timeTrackingType`

### 4. **Compensation** (7 enums)
- Pay structures and compensation components
- Examples: `compensationType`, `variableCompType`, `equityType`, `allowanceType`

### 5. **Payroll** (6 enums)
- Payroll processing and payment types
- Examples: `payFrequency`, `payrollRunStatus`, `paymentMethod`, `deductionCategory`

### 6. **Benefits** (4 enums)
- Employee benefits and enrollment
- Examples: `benefitType`, `coverageLevel`, `enrollmentStatus`, `lifeEventType`

### 7. **Time Off** (4 enums)
- Leave management and accruals
- Examples: `timeOffType`, `timeOffStatus`, `accrualMethod`, `carryoverRule`

### 8. **Performance** (5 enums)
- Performance management and reviews
- Examples: `reviewCycleType`, `reviewStatus`, `ratingScale`, `goalStatus`

### 9. **Onboarding** (3 enums)
- New hire workflows
- Examples: `onboardingTaskStatus`, `onboardingTaskType`, `taskAssigneeType`

### 10. **Documents** (2 enums)
- Employee document management
- Examples: `documentCategory`, `documentStatus`

### 11. **Ticketing** (6 enums)
- Internal ticketing and support
- Examples: `ticketStatus`, `ticketSeverity`, `ticketRequestType`, `ticketCategory`

### 12. **Change Requests** (3 enums)
- Employee self-service change requests
- Examples: `changeRequestType`, `changeRequestStatus`, `changeRequestCategory`

### 13. **Accounting** (10 enums)
- Financial management and bookkeeping
- Examples: `accountType`, `journalEntryStatus`, `invoiceStatus`, `taxType`

### 14. **Marketing** (6 enums)
- CRM and marketing automation (Phase 2)
- Examples: `contactLifecycleStage`, `leadStatus`, `dealStage`, `campaignType`

### 15. **System** (7 enums)
- Platform administration and security
- Examples: `userRole`, `permissionAction`, `auditEventType`, `notificationChannel`

### 16. **Geography** (5 enums)
- Location and address data
- Examples: `country`, `usState`, `indiaState`, `canadaProvince`, `swissCanton`

### 17. **Communication** (4 enums)
- Contact information types
- Examples: `phoneType`, `emailType`, `addressType`, `relationshipType`

### 18. **Demographics** (6 enums)
- Personal and EEO information
- Examples: `gender`, `maritalStatus`, `ethnicity`, `veteranStatus`

### 19. **Work Location** (1 enum)
- Primary work location types
- Example: `workLocationType`

### 20. **Integrations** (3 enums)
- Third-party service integrations
- Examples: `integrationProvider`, `integrationStatus`, `webhookStatus`

### 21. **Reporting** (3 enums)
- Report generation and formatting
- Examples: `reportFormat`, `reportFrequency`, `chartType`

### 22. **Compliance** (3 enums)
- Regulatory compliance requirements
- Examples: `eeocCategory`, `flsaClassification`, `i9Status`

---

## Implementation Patterns

### PostgreSQL Implementation

#### Option 1: Native ENUM Types (Recommended for stable enums)

```sql
-- Create enum type
CREATE TYPE employment_type AS ENUM (
    'full_time',
    'part_time',
    'contractor',
    'intern',
    'temporary',
    'consultant',
    'freelance'
);

-- Use in table
CREATE TABLE employees (
    id UUID PRIMARY KEY,
    employment_type employment_type NOT NULL DEFAULT 'full_time'
);
```

**Pros:**
- Database-level validation
- Better performance
- Type safety

**Cons:**
- Harder to modify (requires migration)
- Can't add values without ALTER TYPE

#### Option 2: VARCHAR with CHECK Constraint (Flexible)

```sql
CREATE TABLE employees (
    id UUID PRIMARY KEY,
    employment_type VARCHAR(50) NOT NULL DEFAULT 'full_time',
    CONSTRAINT valid_employment_type CHECK (
        employment_type IN (
            'full_time',
            'part_time',
            'contractor',
            'intern',
            'temporary',
            'consultant',
            'freelance'
        )
    )
);
```

**Pros:**
- Easier to modify
- Can add new values with simple migration

**Cons:**
- String storage (slightly more space)
- Validation at constraint level

#### Option 3: Reference Table (Most Flexible)

```sql
CREATE TABLE enum_employment_types (
    code VARCHAR(50) PRIMARY KEY,
    display_name VARCHAR(100) NOT NULL,
    display_name_i18n JSONB,
    sort_order INT,
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE employees (
    id UUID PRIMARY KEY,
    employment_type VARCHAR(50) NOT NULL DEFAULT 'full_time'
        REFERENCES enum_employment_types(code)
);

-- Seed data
INSERT INTO enum_employment_types (code, display_name, sort_order) VALUES
    ('full_time', 'Full Time', 1),
    ('part_time', 'Part Time', 2),
    ('contractor', 'Contractor', 3),
    ('intern', 'Intern', 4),
    ('temporary', 'Temporary', 5),
    ('consultant', 'Consultant', 6),
    ('freelance', 'Freelance', 7);
```

**Pros:**
- Can add/remove values without migration
- Supports localization (display_name_i18n)
- Can soft-delete values (is_active flag)
- Can add metadata (descriptions, icons, colors)

**Cons:**
- More complex
- Requires join for display values
- Slightly slower

### Recommended Approach

Use **Option 1 (Native ENUM)** for:
- Stable, rarely-changing enums (e.g., `gender`, `accountType`)
- Core system enums

Use **Option 3 (Reference Table)** for:
- Tenant-customizable enums (e.g., `ticketCategory`)
- Enums that need localization
- Enums that may expand frequently

---

## Application Layer Implementation

### TypeScript/JavaScript

```typescript
// Generate from enumerations.json
export enum EmploymentType {
  FULL_TIME = 'full_time',
  PART_TIME = 'part_time',
  CONTRACTOR = 'contractor',
  INTERN = 'intern',
  TEMPORARY = 'temporary',
  CONSULTANT = 'consultant',
  FREELANCE = 'freelance'
}

// With display values
export const EmploymentTypeLabels: Record<EmploymentType, string> = {
  [EmploymentType.FULL_TIME]: 'Full Time',
  [EmploymentType.PART_TIME]: 'Part Time',
  [EmploymentType.CONTRACTOR]: 'Contractor',
  [EmploymentType.INTERN]: 'Intern',
  [EmploymentType.TEMPORARY]: 'Temporary',
  [EmploymentType.CONSULTANT]: 'Consultant',
  [EmploymentType.FREELANCE]: 'Freelance'
};

// Validation helper
export function isValidEmploymentType(value: string): value is EmploymentType {
  return Object.values(EmploymentType).includes(value as EmploymentType);
}
```

### API Validation (Express.js example)

```javascript
import { body, validationResult } from 'express-validator';

// Validation middleware
const validateEmployeeCreation = [
  body('employment_type')
    .isIn(['full_time', 'part_time', 'contractor', 'intern', 'temporary', 'consultant', 'freelance'])
    .withMessage('Invalid employment type'),

  body('employment_status')
    .optional()
    .isIn(['active', 'on_leave', 'suspended', 'terminated', 'retired', 'deceased'])
    .withMessage('Invalid employment status'),

  (req, res, next) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }
    next();
  }
];
```

---

## Localization Strategy

### Database Storage

Store enum keys in English (as defined in `enumerations.json`):

```sql
INSERT INTO employees (employment_type) VALUES ('full_time');
```

### Display Translation

Use translation keys based on enum values:

```json
{
  "en-US": {
    "employment_type.full_time": "Full Time",
    "employment_type.part_time": "Part Time",
    "employment_type.contractor": "Contractor"
  },
  "es-ES": {
    "employment_type.full_time": "Tiempo Completo",
    "employment_type.part_time": "Tiempo Parcial",
    "employment_type.contractor": "Contratista"
  },
  "fr-FR": {
    "employment_type.full_time": "Temps Plein",
    "employment_type.part_time": "Temps Partiel",
    "employment_type.contractor": "Entrepreneur"
  }
}
```

### Frontend Component

```svelte
<!-- EmploymentTypeSelect.svelte -->
<script>
  let { value, onChange, locale } = $props();

  let options = $derived([
    { value: 'full_time', label: t('employment_type.full_time', locale) },
    { value: 'part_time', label: t('employment_type.part_time', locale) },
    { value: 'contractor', label: t('employment_type.contractor', locale) },
    // ... etc
  ]);
</script>

<select {value} onchange={onChange}>
  {#each options as opt (opt.value)}
    <option value={opt.value}>{opt.label}</option>
  {/each}
</select>
```

---

## International Support

### Supported Locales

The platform supports 19 locales across 10+ countries:

#### English Variants
- `en-US` - United States (default)
- `en-GB` - United Kingdom
- `en-CA` - Canada

#### European Languages
- `fr-FR` - France
- `fr-BE` - Belgium (French)
- `fr-CH` - Switzerland (French)
- `de-DE` - Germany
- `de-CH` - Switzerland (German)
- `it-IT` - Italy
- `it-CH` - Switzerland (Italian)
- `nl-NL` - Netherlands
- `nl-BE` - Belgium (Dutch)
- `sv-SE` - Sweden
- `es-ES` - Spain
- `pt-BR` - Brazil

#### Asian Languages
- `ja-JP` - Japan
- `zh-CN` - China
- `hi-IN` - India

### Supported Currencies

```javascript
const currencies = [
  'USD', // United States Dollar
  'EUR', // Euro
  'GBP', // British Pound
  'CAD', // Canadian Dollar
  'AUD', // Australian Dollar
  'CHF', // Swiss Franc
  'JPY', // Japanese Yen
  'CNY', // Chinese Yuan
  'INR', // Indian Rupee
  'MXN', // Mexican Peso
  'BRL', // Brazilian Real
  'SEK'  // Swedish Krona
];
```

### Geography Enumerations

#### Countries
Supported countries include: US, CA, MX, GB, FR, DE, IT, ES, NL, BE, SE, CH, IN, CN, JP, AU, BR, SG

#### Regional Subdivisions

**United States**
```javascript
// 50 states + DC
usState: ['AL', 'AK', 'AZ', ..., 'WY', 'DC']
```

**India**
```javascript
// 28 states + 8 union territories
indiaState: ['AN', 'AP', 'AR', ..., 'WB']
```

**Canada**
```javascript
// 10 provinces + 3 territories
canadaProvince: ['AB', 'BC', 'MB', 'NB', 'NL', 'NS', 'NT', 'NU', 'ON', 'PE', 'QC', 'SK', 'YT']

// AB - Alberta
// BC - British Columbia
// MB - Manitoba
// NB - New Brunswick
// NL - Newfoundland and Labrador
// NS - Nova Scotia
// NT - Northwest Territories
// NU - Nunavut
// ON - Ontario
// PE - Prince Edward Island
// QC - Quebec
// SK - Saskatchewan
// YT - Yukon
```

**Switzerland**
```javascript
// 26 cantons
swissCanton: ['AG', 'AI', 'AR', ..., 'ZH']

// AG - Aargau         | NW - Nidwalden
// AI - Appenzell I.   | OW - Obwalden
// AR - Appenzell A.   | SG - St. Gallen
// BE - Bern           | SH - Schaffhausen
// BL - Basel-Land     | SO - Solothurn
// BS - Basel-Stadt    | SZ - Schwyz
// FR - Fribourg       | TG - Thurgau
// GE - Geneva         | TI - Ticino
// GL - Glarus         | UR - Uri
// GR - Graubünden     | VD - Vaud
// JU - Jura           | VS - Valais
// LU - Lucerne        | ZG - Zug
// NE - Neuchâtel      | ZH - Zurich
```

### Date and Number Formatting

```javascript
// Date formats by region
const dateFormats = {
  'en-US': 'MM/DD/YYYY',    // 12/25/2025
  'en-GB': 'DD/MM/YYYY',    // 25/12/2025
  'de-DE': 'DD.MM.YYYY',    // 25.12.2025
  'fr-FR': 'DD/MM/YYYY',    // 25/12/2025
  'ja-JP': 'YYYY/MM/DD',    // 2025/12/25
  'sv-SE': 'YYYY-MM-DD'     // 2025-12-25
};

// Number formats
const numberFormats = {
  'en-US': '1,234.56',      // Comma thousands, dot decimal
  'de-DE': '1.234,56',      // Dot thousands, comma decimal
  'fr-FR': '1 234,56',      // Space thousands, comma decimal
  'sv-SE': '1 234,56',      // Space thousands, comma decimal
  'ja-JP': '1,234.56'       // Comma thousands, dot decimal
};

// Time formats
const timeFormats = {
  '12h': '3:45 PM',
  '24h': '15:45'
};
```

### Multi-Currency Implementation

```sql
-- Salary ranges supporting multiple currencies
CREATE TABLE job_positions (
    id UUID PRIMARY KEY,
    tenant_id UUID NOT NULL,
    title VARCHAR(200) NOT NULL,
    salary_ranges JSONB,  -- Multi-currency storage
    -- Example:
    -- {
    --   "USD": {"min": 120000, "max": 180000},
    --   "EUR": {"min": 100000, "max": 150000},
    --   "GBP": {"min": 90000, "max": 130000},
    --   "CHF": {"min": 110000, "max": 165000}
    -- }
);
```

### Timezone Support

Common timezones for supported countries:

```javascript
const timezonesByCountry = {
  'US': [
    'America/New_York',      // EST/EDT
    'America/Chicago',       // CST/CDT
    'America/Denver',        // MST/MDT
    'America/Los_Angeles',   // PST/PDT
    'America/Phoenix',       // MST (no DST)
    'America/Anchorage',     // AKST/AKDT
    'America/Honolulu'       // HST
  ],
  'CA': [
    'America/Toronto',       // Eastern
    'America/Winnipeg',      // Central
    'America/Edmonton',      // Mountain
    'America/Vancouver',     // Pacific
    'America/Halifax',       // Atlantic
    'America/St_Johns'       // Newfoundland
  ],
  'GB': ['Europe/London'],
  'FR': ['Europe/Paris'],
  'DE': ['Europe/Berlin'],
  'IT': ['Europe/Rome'],
  'NL': ['Europe/Amsterdam'],
  'BE': ['Europe/Brussels'],
  'SE': ['Europe/Stockholm'],
  'CH': ['Europe/Zurich'],
  'JP': ['Asia/Tokyo'],
  'IN': ['Asia/Kolkata']
};
```

### Country-Specific Validation

Different countries require different validation rules:

```javascript
// Phone number validation
const phoneValidation = {
  'US': { format: '(XXX) XXX-XXXX', digits: 10 },
  'CA': { format: '+1 (XXX) XXX-XXXX', digits: 10 },
  'GB': { format: '+44 XXXX XXXXXX', digits: 10-11 },
  'FR': { format: '+33 X XX XX XX XX', digits: 10 },
  'DE': { format: '+49 XXX XXXXXXXX', digits: 10-11 },
  'IT': { format: '+39 XXX XXX XXXX', digits: 10 },
  'NL': { format: '+31 XX XXX XXXX', digits: 10 },
  'BE': { format: '+32 XXX XX XX XX', digits: 9-10 },
  'SE': { format: '+46 XX XXX XX XX', digits: 10 },
  'CH': { format: '+41 XX XXX XX XX', digits: 10 },
  'JP': { format: '+81 XX XXXX XXXX', digits: 10-11 }
};

// Postal code formats
const postalCodeFormats = {
  'US': { pattern: /^\d{5}(-\d{4})?$/, example: '12345' },
  'CA': { pattern: /^[A-Z]\d[A-Z] \d[A-Z]\d$/, example: 'K1A 0B1' },
  'GB': { pattern: /^[A-Z]{1,2}\d{1,2}[A-Z]? \d[A-Z]{2}$/, example: 'SW1A 1AA' },
  'FR': { pattern: /^\d{5}$/, example: '75001' },
  'DE': { pattern: /^\d{5}$/, example: '10115' },
  'IT': { pattern: /^\d{5}$/, example: '00100' },
  'NL': { pattern: /^\d{4} [A-Z]{2}$/, example: '1012 AB' },
  'BE': { pattern: /^\d{4}$/, example: '1000' },
  'SE': { pattern: /^\d{3} \d{2}$/, example: '114 55' },
  'CH': { pattern: /^\d{4}$/, example: '8001' },
  'JP': { pattern: /^\d{3}-\d{4}$/, example: '100-0001' }
};

// Tax ID formats
const taxIDFormats = {
  'US': 'SSN: XXX-XX-XXXX (9 digits)',
  'CA': 'SIN: XXX-XXX-XXX (9 digits)',
  'GB': 'NIN: AB 123456 C (2 letters + 6 digits + 1 letter)',
  'FR': 'INSEE: 15 digits',
  'DE': 'Tax ID: 11 digits',
  'IT': 'Codice Fiscale: 16 alphanumeric',
  'NL': 'BSN: 8-9 digits',
  'SE': 'Personnummer: YYMMDD-XXXX',
  'CH': 'AVS: 756.XXXX.XXXX.XX'
};
```

### Conditional Field Requirements

Some fields are country-specific:

```sql
-- Employee table with conditional fields
CREATE TABLE employees (
    -- ... other fields ...

    -- US-specific
    ssn VARCHAR(11),                    -- Only for US
    ein VARCHAR(10),                    -- Only for US employers

    -- India-specific
    pan VARCHAR(10),                    -- Only for India
    aadhaar VARCHAR(14),                -- Only for India
    india_tax_regime VARCHAR(20),       -- Only for India

    -- UK-specific
    nin VARCHAR(13),                    -- Only for UK

    -- Canada-specific
    sin VARCHAR(11),                    -- Only for Canada

    -- France-specific
    insee VARCHAR(18),                  -- Only for France

    -- Germany-specific
    steuer_id VARCHAR(11),              -- Only for Germany

    -- Italy-specific
    codice_fiscale VARCHAR(16),         -- Only for Italy

    -- Netherlands-specific
    bsn VARCHAR(9),                     -- Only for Netherlands

    -- Sweden-specific
    personnummer VARCHAR(13),           -- Only for Sweden

    -- Switzerland-specific
    avs_number VARCHAR(17),             -- Only for Switzerland

    -- Validation constraints
    CONSTRAINT check_country_specific_fields CHECK (
        (country = 'US' AND ssn IS NOT NULL) OR
        (country = 'IN' AND pan IS NOT NULL) OR
        (country = 'GB' AND nin IS NOT NULL) OR
        (country = 'CA' AND sin IS NOT NULL) OR
        -- ... etc
        TRUE
    )
);
```

---

## API Response Format

### REST API Enum Responses

```json
{
  "id": "emp-12345",
  "first_name": "Jane",
  "last_name": "Doe",
  "employment_type": "full_time",
  "employment_status": "active",

  "_metadata": {
    "employment_type_display": "Full Time",
    "employment_status_display": "Active"
  }
}
```

### OpenAPI/Swagger Documentation

```yaml
components:
  schemas:
    EmploymentType:
      type: string
      enum:
        - full_time
        - part_time
        - contractor
        - intern
        - temporary
        - consultant
        - freelance
      default: full_time
      description: Type of employment relationship

    Employee:
      type: object
      properties:
        id:
          type: string
          format: uuid
        employment_type:
          $ref: '#/components/schemas/EmploymentType'
        employment_status:
          type: string
          enum:
            - active
            - on_leave
            - suspended
            - terminated
            - retired
            - deceased
          default: active
```

---

## Adding New Enum Values

### Process

1. **Update enumerations.json**
   ```json
   "employmentType": {
     "description": "Type of employment relationship",
     "values": [
       "full_time",
       "part_time",
       "contractor",
       "intern",
       "temporary",
       "consultant",
       "freelance",
       "seasonal"  // NEW VALUE
     ],
     "default": "full_time"
   }
   ```

2. **Update Database**

   For Native ENUM:
   ```sql
   ALTER TYPE employment_type ADD VALUE 'seasonal';
   ```

   For CHECK Constraint:
   ```sql
   ALTER TABLE employees DROP CONSTRAINT valid_employment_type;
   ALTER TABLE employees ADD CONSTRAINT valid_employment_type CHECK (
       employment_type IN (
           'full_time', 'part_time', 'contractor', 'intern',
           'temporary', 'consultant', 'freelance', 'seasonal'
       )
   );
   ```

3. **Update Application Types**
   - Regenerate TypeScript enums
   - Update validation schemas
   - Update API documentation

4. **Add Translations**
   ```json
   {
     "employment_type.seasonal": {
       "en-US": "Seasonal",
       "es-ES": "Temporal",
       "fr-FR": "Saisonnier"
     }
   }
   ```

5. **Test**
   - Unit tests for validation
   - Integration tests for API
   - UI tests for dropdowns

---

## Best Practices

### 1. **Naming Conventions**
- Use snake_case for enum values: `full_time`, not `fullTime` or `FullTime`
- Use descriptive names: `employment_type`, not `emp_type`
- Keep values concise but clear

### 2. **Backward Compatibility**
- Never remove enum values that are in use
- Instead, add `is_active: false` or `deprecated: true`
- Provide migration path before removing

### 3. **Defaults**
- Always specify a default value
- Choose the most common or safest option
- Document why a particular default was chosen

### 4. **Extensibility**
- For tenant-specific values, use separate custom fields:
  ```json
  {
    "employment_type": "full_time",
    "custom_employment_classifications": ["remote_eligible", "bonus_eligible"]
  }
  ```

### 5. **Documentation**
- Keep descriptions up to date in `enumerations.json`
- Document business rules tied to specific enum values
- Note compliance requirements (e.g., FLSA classification)

### 6. **Validation**
- Validate at API layer AND database layer
- Return clear error messages
- Log validation failures for monitoring

### 7. **Monitoring**
- Track enum value distribution in analytics
- Monitor for invalid values (indicates integration issues)
- Alert on unexpected changes

---

## Code Generation

### Generate TypeScript from JSON

```javascript
const fs = require('fs');
const enums = JSON.parse(fs.readFileSync('enumerations.json'));

function generateTypeScript(enums) {
  let output = '// Auto-generated from enumerations.json\n\n';

  for (const [category, enumMap] of Object.entries(enums.enumerations)) {
    for (const [enumName, enumDef] of Object.entries(enumMap)) {
      const typeName = toPascalCase(enumName);

      output += `/** ${enumDef.description} */\n`;
      output += `export enum ${typeName} {\n`;

      for (const value of enumDef.values) {
        const key = value.toUpperCase();
        output += `  ${key} = '${value}',\n`;
      }

      output += '}\n\n';
    }
  }

  return output;
}

function toPascalCase(str) {
  return str.replace(/(^\w|_\w)/g, m => m.replace('_', '').toUpperCase());
}
```

---

## Common Patterns

### Multi-Select Enums

For fields that accept multiple values:

```sql
CREATE TABLE employees (
    id UUID PRIMARY KEY,
    languages_spoken VARCHAR(50)[], -- Array of enum values
    CHECK (languages_spoken <@ ARRAY['english', 'spanish', 'french', 'german', 'chinese'])
);
```

### Conditional Enums

Some enums only apply in certain contexts:

```sql
-- India-specific fields only for Indian employees
CREATE TABLE employees (
    id UUID PRIMARY KEY,
    country VARCHAR(2) NOT NULL,
    india_tax_regime VARCHAR(20), -- Only for country='IN'
    CHECK (
        (country = 'IN' AND india_tax_regime IN ('old_regime', 'new_regime'))
        OR (country != 'IN' AND india_tax_regime IS NULL)
    )
);
```

### Hierarchical Enums

For nested categories:

```json
{
  "benefitType": "health_insurance",
  "benefitSubtype": "medical_ppo",
  "coverageLevel": "employee_family"
}
```

---

## Migration Strategy

### Adding to Existing Systems

1. **Phase 1: Documentation**
   - Create `enumerations.json`
   - Document all current enum values in use
   - Identify inconsistencies across modules

2. **Phase 2: Standardization**
   - Normalize enum values to snake_case
   - Consolidate duplicate enums
   - Create mapping for legacy values

3. **Phase 3: Implementation**
   - Add database constraints
   - Update application validation
   - Deploy with backward compatibility

4. **Phase 4: Migration**
   - Run data migration scripts
   - Update API clients
   - Deprecate old values

5. **Phase 5: Cleanup**
   - Remove legacy code
   - Update documentation
   - Monitor for issues

---

## Related Resources

- [Data Models Specification](./data-models/schema.sql)
- [API Specification](./api-endpoints.md)
- [Internationalization Guide](./product-specification.md#internationalization-i18n)
- [Database Schema](./data-models/schema.sql)

---

**Maintainer:** Product & Engineering Teams
**Review Frequency:** Quarterly or when adding new modules
**Last Review:** December 5, 2025
