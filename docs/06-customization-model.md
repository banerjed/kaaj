# Customization Model

**Version:** 1.0
**Last Updated:** August 26, 2026
**Status:** Accepted

How customers customize the platform without per-tenant schema changes or
per-tenant code.

The governing principle, from
[Architecture Decisions](./05-architecture-decisions.md#adr-003-shared-schema-multi-tenancy-with-row-level-security):

> **Customization is data, never code.**

Shared-schema tenancy buys one atomic migration across all customers. Per-tenant
DDL or per-tenant code destroys that property, which is the main reason the
tenancy model was chosen. Everything below preserves it.

---

## Table of Contents

1. [Three tiers of customization](#three-tiers-of-customization)
2. [Tier 1: Configuration data](#tier-1-configuration-data)
3. [Tier 2: Custom fields](#tier-2-custom-fields)
4. [Tier 3: Behaviour settings](#tier-3-behaviour-settings)
5. [What we refuse to support](#what-we-refuse-to-support)
6. [Choosing a tier](#choosing-a-tier)
7. [The financial-calculation boundary](#the-financial-calculation-boundary)
8. [Implementation checklist](#implementation-checklist)

---

## Three tiers of customization

"Customization" describes three different problems with three different answers.
Assigning a request to the wrong tier is the most common way this goes wrong.

| Tier | What it is | Mechanism | Example |
|---|---|---|---|
| 1 | Data the customer defines | Rows in tenant-scoped tables | Chart of accounts, departments, leave policies |
| 2 | Extra attributes on our entities | `custom_fields` JSONB + definitions table | Shirt size, parking spot, legacy employee ID |
| 3 | Changed system behaviour | Settings rows | Approval thresholds, numbering formats, fiscal year |

---

## Tier 1: Configuration data

**Most customization requests are already solved and need no mechanism at all.**

A customer asking for "our own accounting categories" is asking to insert rows.
`chart_of_accounts` in [`schema.sql`](../packages/database/reference/schema.sql) is already tenant-scoped, with
`account_code`, `account_name`, `account_type`, `account_subtype`, and hierarchy
via `parent_account_id`. There is nothing to build.

The same is true of departments, locations, job titles, job levels, time-off
policies, ticket categories, business areas, benefit packages, and project
templates.

### The design rule

> **Anything a customer would reasonably want to name themselves is a table,
> not an enum in code.**

`enumerations-guide.md` already draws this line correctly:

- **Native enum** — stable, system-defined values that customers cannot change
  (`gender`, `account_type`, `employment_status`)
- **Reference table** — tenant-customizable values (`ticket_category`),
  anything needing localization, anything expected to expand

The failure mode is a developer hardcoding an enum that a customer later needs
to change, which then requires a migration and a release to alter one row of
someone's configuration. When adding any new module, check every enum against
this rule before it ships.

### Seeding

The second half of Tier 1 is **defaults**. At onboarding, provision each tenant a
sensible starting set:

- A standard SMB chart of accounts, by country where relevant
- Common departments and job titles
- Typical leave policies for the tenant's jurisdiction
- Default ticket categories and priorities

Then let them edit. This is what Zoho and Odoo do, and it accounts for most of
the *perceived* flexibility of those products while requiring no mechanism.
Seed data lives in version control and is applied at tenant creation, not
retroactively.

---

## Tier 2: Custom fields

### Current state

`custom_fields` JSONB already exists on `employees`, `tasks`, `projects`,
`ticketing_*` and several other tables. `JSONB-FIELD-EXAMPLES.md` documents the
intended shape:

```json
{
  "employee_id_legacy": "12345",
  "shirt_size": "L",
  "parking_spot": "A-42",
  "security_clearance": "Secret"
}
```

**What is missing is the metadata.** There is no field-definition table in
either schema. Storage without definitions means we cannot render a form,
validate a value, assign a type, mark a field required, populate a dropdown, or
offer the field as a report column.

### The definitions table

```sql
CREATE TABLE custom_field_definitions (
    id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id     UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,

    -- What this field is attached to
    entity_type   TEXT NOT NULL,   -- 'employee' | 'task' | 'project' | 'ticket' | ...
    field_key     TEXT NOT NULL,   -- 'shirt_size' — the JSONB key

    -- Presentation
    label         TEXT NOT NULL,
    label_i18n    JSONB,
    help_text     TEXT,
    display_order INT NOT NULL DEFAULT 0,
    field_group   TEXT,            -- optional form section

    -- Type and validation
    data_type     TEXT NOT NULL,   -- text|number|date|boolean|select|multiselect
    options       JSONB,           -- [{value, label, label_i18n}] for select types
    is_required   BOOLEAN NOT NULL DEFAULT FALSE,
    validation    JSONB,           -- {min, max, minLength, maxLength, pattern}
    default_value JSONB,

    -- Lifecycle
    is_active     BOOLEAN NOT NULL DEFAULT TRUE,
    created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at    TIMESTAMPTZ NOT NULL DEFAULT now(),

    UNIQUE (tenant_id, entity_type, field_key)
);

CREATE INDEX idx_cfd_tenant_entity
    ON custom_field_definitions (tenant_id, entity_type, display_order)
    WHERE is_active;
```

Values continue to live in the entity's own `custom_fields` JSONB, keyed by
`field_key`. Definitions and values are deliberately separate: definitions are
small, cacheable, and read on every form render; values travel with the row.

### What the definitions drive

**Form rendering.** The `load` function fetches active definitions for the
entity type; one generic `CustomFieldInput.svelte` switches on `data_type`.
Adding a field for a customer becomes a row insert, not a deployment.

```svelte
<!-- CustomFieldInput.svelte -->
<script>
  let { definition, value = $bindable() } = $props();
</script>

{#if definition.data_type === 'select'}
  <select bind:value>
    {#each definition.options as opt (opt.value)}
      <option value={opt.value}>{opt.label}</option>
    {/each}
  </select>
{:else if definition.data_type === 'boolean'}
  <input type="checkbox" bind:checked={value} />
{:else if definition.data_type === 'date'}
  <input type="date" bind:value />
{:else if definition.data_type === 'number'}
  <input type="number" bind:value />
{:else}
  <input type="text" bind:value />
{/if}
```

**Server-side validation.** `validation-utils.js` already exports
`validateFields` and `validateEnum`. Definitions feed those same validators, so
custom fields validate through the identical path as core fields — in the form
action, never only in the browser.

**Reporting.** Definitions become the column picker for exports and report
builders.

### Indexing

Add a GIN index for containment queries:

```sql
CREATE INDEX idx_employees_custom_fields
    ON employees USING GIN (custom_fields jsonb_path_ops);
```

If a specific custom field becomes a hot filter for a large tenant, add an
expression index for that key. Do this in response to a measurement, not in
anticipation.

### Consistency fix required

`ticketing_business_areas.custom_fields` currently defaults to `'[]'` (an array)
while every other table defaults to `'{}'` (an object). Normalize to object
during the schema reconciliation — see
[ADR open question 1](./05-architecture-decisions.md#open-questions).

### Limits

Custom fields are per-tenant, per-entity-type, and deliberately capped. A
suggested starting limit is 50 active definitions per entity type per tenant.
A customer who needs more is describing a Tier 1 modelling gap.

---

## Tier 3: Behaviour settings

Settings change what the system *does*, rather than what it stores.

Examples: expense approval thresholds, approval chain composition, invoice and
ticket numbering formats, fiscal year start, week start day, default currency
rounding, module enablement, branding.

The `tenants` table already carries subscription and feature fields, and
`hr_change_requests.approval_chain` already stores an approval chain as JSONB.
Extend that pattern with a namespaced settings table:

```sql
CREATE TABLE tenant_settings (
    tenant_id   UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    namespace   TEXT NOT NULL,   -- 'accounting' | 'expenses' | 'ticketing' | ...
    key         TEXT NOT NULL,   -- 'fiscal_year_start' | 'approval_threshold'
    value       JSONB NOT NULL,
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_by  UUID,

    PRIMARY KEY (tenant_id, namespace, key)
);
```

Read once per request and cache per tenant in process. Defaults live in code;
the table stores only deviations from default, so a new setting ships with a
sensible value for every existing tenant without a data migration.

---

## What we refuse to support

### Per-tenant DDL

No `ALTER TABLE` for a customer. No per-tenant schemas. No per-tenant tables.

This destroys the single atomic migration that shared-schema tenancy exists to
provide, and turns every release into an N-way operation with partial-failure
states.

### Entity–Attribute–Value

We tried this and correctly removed it. `data-models/d1-schema-clean.sql`
records the decision:

> `-- Removed custom_table_definitions and custom_table_data tables (use custom_fields JSON instead)`

EAV wrecks query performance, makes reporting miserable, and defeats the query
planner. It should not come back. If it is proposed again, the answer is Tier 1
or a product change.

### Per-tenant code

No customer-specific branches, no customer-specific modules, no conditional
logic keyed to a tenant ID. If behaviour must vary, it varies on a **setting**
that any tenant could in principle set.

---

## Choosing a tier

Ask what the field or value *does*:

- Participates in **calculations, ledgers, or foreign-key relationships**
  → **Tier 1**: a real table or a real column
- **Descriptive** information the customer wants to record, display and filter on
  → **Tier 2**: a custom field
- Changes **system behaviour**
  → **Tier 3**: a setting

Worked examples:

| Request | Tier | Why |
|---|---|---|
| "We need our own expense categories" | 1 | Hits the general ledger; `chart_of_accounts` already supports it |
| "Track each employee's shirt size" | 2 | Descriptive only |
| "Require two approvers above $5,000" | 3 | Changes workflow behaviour |
| "Add a housing allowance to payslips" | 1 | Financial calculation — model it properly |
| "Record which badge number each employee has" | 2 | Descriptive only |
| "Our fiscal year starts in April" | 3 | Changes period calculations |

---

## The financial-calculation boundary

**Custom fields must never feed payroll or accounting calculations.**

This is the single hardest rule in this document. If a customer needs a custom
allowance that lands on a payslip, or a category that posts to the general
ledger, that is a **Tier 1 modelling gap to fix in the product** — not a custom
field.

The reason is that Tier 2 data is untyped, loosely validated, and not covered by
the test suite. Nothing in a JSONB blob should reach a computation that produces
a tax filing, a payslip, or a journal entry. The audit will not go well.

Enforce it in code review: any read of `custom_fields` inside the payroll or
accounting modules is a defect.

### The useful side effect

This boundary doubles as a **product roadmap signal**. When several customers
push the same concept into custom fields, that is the market telling you what to
build properly. Instrument custom field definitions by `field_key` and review
the common ones quarterly — a frequently recurring custom field is a feature
request with usage data already attached.

---

## Implementation checklist

- [ ] Add `custom_field_definitions` to the reconciled Postgres schema
- [ ] Add `tenant_settings` to the reconciled Postgres schema
- [ ] Normalize `ticketing_business_areas.custom_fields` from `'[]'` to `'{}'`
- [ ] Add GIN indexes on `custom_fields` for entities that expose them
- [ ] Confirm `tenant_id` is present and RLS policies cover both new tables
- [ ] Build `CustomFieldInput.svelte` and the definitions admin screen
- [ ] Wire definitions into `validateFields` for server-side validation
- [ ] Audit every enum in `enumerations.json` against the Tier 1 design rule
- [ ] Write per-country seed data for chart of accounts and leave policies
- [ ] Add a review-time check: no `custom_fields` reads in payroll or accounting

---

## Related documents

- [Architecture Decisions](./05-architecture-decisions.md)
- [Product Specification](./product-specification.md)
- [Enumerations Guide](./enumerations-guide.md) — enum vs reference table
- [Validation Utilities Guide](./validation-utils-guide.md) — the validators
  that custom field definitions feed
- [JSONB Field Examples](./data-models/JSONB-FIELD-EXAMPLES.md) — existing
  `custom_fields` usage
