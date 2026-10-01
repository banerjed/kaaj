# Custom Fields — One Mechanism for Every Record

**Status:** steps 1 and 2 done (2026-09-30); step 3 not started. Supersedes the per-module
arrangements in [docs/26](./26-project-management-custom-fields.md) and
the ticketing custom-field notes in
[06-customization-model.md](./06-customization-model.md) Tier 2.

**Goal:** a tenant defines, per kind of record, a set of fields grouped
under categories — its own for companies, another for contacts, another
for the pipeline — and every module stores, validates, shows and edits
them through the same code. Tenant-2's definitions are entirely separate
from tenant-1's.

---

## What was there before

- One definitions table, but two value stores: the typed
  `custom_field_values` table (projects, tasks, contacts) and a JSONB
  column on `ticketing_tickets`, keyed by field name, holding numbers as
  JSON numbers (the [L41](./10-lessons-learned.md) float hazard), with
  number fields read as integers and no money or multiselect support.
- Two repositories (`custom-fields.repo.ts` and a copy inside
  `ticketing.repo.ts`) and three settings pages whose server code was
  ~95% the same, line for line.
- In the schema: field keys were not unique outside ticketing (the unique
  key included the nullable `business_area_id`); `entity_type` was free
  text; a value's record had no foreign key, so nothing guaranteed it
  existed or was the same tenant's; `field_group` was "Field Group 1"
  everywhere; `label_i18n`, `validation` and `default_value` were read by
  nothing.

## The design

```
custom_field_definitions   per tenant, per entity type (and per business area, for tickets)
   category                a heading: "General", "Billing profile" …
   display_order           position WITHIN the category
        │
custom_field_values        one row per field per record, one typed value column
   project_id | task_id | customer_contact_id | ticket_id   exactly one set
```

**Categories are headings, not rows.** Every record of an entity type
shows every category defined for that type ("design A"). A category is
the `category` text on its fields: NOT NULL, default `General`. Renaming
one updates all its fields in one statement.

- Fields are ordered by `display_order` within their category.
- Categories are ordered: `General` first, then by when the category was
  first used (its earliest field's `created_at`). No configuration. If
  admins later need to drag categories into their own order, that is the
  signal to give categories a table of their own.

**Category and scope are separate.** The category says where a field
shows; the scope says which records get it. Tickets are scoped by
business area (`business_area_id`); nothing else is scoped today. Folding
the area into the category was considered and rejected: renaming an area
would silently drop its fields from every ticket, two areas with the same
name would share fields, and a ticket area could not group its own
fields.

**Entity type is text**, constrained by a CHECK listing the kinds of
record that carry fields, and indexed after `tenant_id`. Adding a kind of
record is a migration anyway (it needs a value column and a policy arm),
which updates the CHECK too.

## What the schema guarantees

| Rule | How |
|---|---|
| a field key is unique per tenant, entity type and area | `UNIQUE NULLS NOT DISTINCT (tenant_id, entity_type, business_area_id, field_key)` |
| an entity type is one we know | CHECK |
| a ticket field names an area; nothing else does | CHECK `(entity_type = 'ticket') = (business_area_id IS NOT NULL)` |
| that area is the same tenant's | FK `(tenant_id, business_area_id)` |
| a value's record exists and is the same tenant's | one FK column per entity, each `(tenant_id, x_id)` |
| a value belongs to exactly one record | CHECK `num_nonnulls(...) = 1` |
| a value's field is for that kind of record | generated `entity_type` + FK `(tenant_id, field_definition_id, entity_type)` |
| at most one typed value per row | CHECK (unchanged) |
| one value per field per record | `UNIQUE NULLS NOT DISTINCT` over the record columns |

A value is readable by whoever can read its record — the RESTRICTIVE
policy has one arm per record column.

## Code

- `$lib/server/custom-fields/` is the only code that touches either
  table: definitions (list, create, archive, rename category, reorder),
  values (read in one query for a page of records; validate and save in
  one statement), and the settings actions every settings page mounts.
- `$lib/components/`: one settings editor (fields grouped by category,
  reorder within a category, rename a category), one form section, one
  read-only display. Every page uses the same three.
- Custom fields still never feed payroll or accounting.

## Adding a kind of record

1. Migration: add it to the entity-type CHECK, add its `x_id` column with
   a composite FK and a partial index, add it to the generated
   `entity_type`, the uniqueness key and the policy.
2. Add it to `CUSTOM_FIELD_ENTITY_TYPES` and the record-column map.
3. Mount the settings actions and the components on its pages.

## Plan

1. ✅ **Consolidate**: the schema above; ticket values move
   from JSONB into `custom_field_values` and the column is dropped;
   ticketing's copy of the code is deleted; one settings editor and one
   set of display/form components across tickets, projects, tasks and
   contacts.
2. ✅ **CRM:** fields on companies and deals; Settings → CRM gets a tab each
   for Companies, Contacts and Pipeline. Company, contact and deal values are
   closed to portal contacts, as the CRM tables are (20260930110000).
3. **Employees**, once it is decided who may read which employee field.
   The inert `custom_fields` JSONB columns on employees, customers,
   projects, tasks, vendors and objectives are removed then; employees'
   holds fixture values and a story check.
