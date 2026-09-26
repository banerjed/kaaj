-- =============================================================================
-- Kaaj — typed custom field values for projects and tasks
-- =============================================================================
-- docs/26-project-management-custom-fields.md. Extends the existing Tier 2
-- customization mechanism (docs/06-customization-model.md,
-- custom_field_definitions) to entity_type = 'project' | 'task' with a real
-- typed value store — NOT the polymorphic value JSONB the v2 spec's own
-- column-type engine describes (deferred: money/jsonb-is-text can't
-- register a runtime-typed column, and this design needs no eval surface).
--
-- Rejected alternative: one table per data type
-- (task_custom_money_field/task_custom_date_field/...). Genuinely gets
-- native typing too, but multiplies RLS/scale-classification/fixture/
-- constraint-registry maintenance by the number of types, and turns adding a
-- new TYPE back into a migration — exactly the tax Tier 2 exists to avoid.
-- One value table, several typed columns, gets the same typing win once.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. `custom_field_definitions` gains 'money' as a data_type. 'multiselect'
--    was already allowed; 'money' was not.
-- -----------------------------------------------------------------------------

ALTER TABLE custom_field_definitions
    DROP CONSTRAINT custom_field_definitions_data_type_check,
    ADD CONSTRAINT custom_field_definitions_data_type_check
        CHECK (data_type = ANY (ARRAY[
            'text'::text, 'number'::text, 'money'::text, 'date'::text,
            'boolean'::text, 'select'::text, 'multiselect'::text
        ]));

-- -----------------------------------------------------------------------------
-- 2. `custom_field_values` — one row per (field, entity), exactly one typed
--    column populated per row, matching the field definition's data_type.
-- -----------------------------------------------------------------------------

CREATE TABLE custom_field_values (
    id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id            UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    field_definition_id  UUID NOT NULL REFERENCES custom_field_definitions(id) ON DELETE CASCADE,

    -- Polymorphic owner, same shape as documents/document_folders —
    -- 'project' | 'task' here; ticketing/employee custom fields stay on
    -- their own existing *.custom_fields JSONB columns, untouched.
    entity_type          TEXT NOT NULL,
    entity_id            UUID NOT NULL,

    -- Exactly one of these is set, matching field_definition_id's data_type.
    -- value_number (rate/quantity scale) and value_money (money scale) are
    -- deliberately separate columns, never one merged NUMERIC — CLAUDE.md's
    -- money section treats numeric(15,2) and numeric(18,4) as two scales
    -- chosen deliberately, and a custom field is not an exception to that.
    value_text           TEXT,
    value_number         NUMERIC(18,4),
    value_money          NUMERIC(15,2),
    value_date            DATE,
    value_boolean         BOOLEAN,
    -- Array of option value-keys, for multiselect only.
    value_multi            JSONB,

    created_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_by            TEXT NOT NULL,

    -- At most one — not exactly one. `app_user` has no DELETE grant anywhere
    -- in this schema (20260830120000_append_only.sql: this app never
    -- hard-deletes, full stop), so clearing a field's value UPDATEs every
    -- typed column back to NULL rather than removing the row — the same
    -- "value row survives, its content goes empty" shape as everything else
    -- here, not a special case for this table.
    CONSTRAINT custom_field_values_one_typed_value CHECK (
        num_nonnulls(value_text, value_number, value_money, value_date,
                     value_boolean, value_multi) <= 1
    ),
    -- tenant_id leads, matching every other multi-tenant unique index here
    -- (index/tenant-leading) — field_definition_id alone can't repeat across
    -- tenants anyway (it's a per-tenant FK), but the invariant is uniform,
    -- not case-by-case.
    CONSTRAINT custom_field_values_unique UNIQUE (tenant_id, field_definition_id, entity_type, entity_id)
);

CREATE INDEX idx_custom_field_values_entity
    ON custom_field_values (tenant_id, entity_type, entity_id);
CREATE INDEX idx_custom_field_values_definition
    ON custom_field_values (tenant_id, field_definition_id);

ALTER TABLE custom_field_values ENABLE ROW LEVEL SECURITY;
ALTER TABLE custom_field_values FORCE ROW LEVEL SECURITY;

-- Bare tenant_isolation, matching projects/tasks' own "firm-wide, no row
-- policy" decision (Phase 1, docs/23-project-management-phase1.md) — a
-- custom field on a firm-wide-visible task is itself firm-wide-visible;
-- there is no narrower boundary to enforce here that isn't already decided
-- at the parent entity.
CREATE POLICY tenant_isolation ON custom_field_values
    USING (tenant_id = app.current_tenant_id())
    WITH CHECK (tenant_id = app.current_tenant_id());

CREATE TRIGGER trg_custom_field_values_updated_at
    BEFORE UPDATE ON custom_field_values
    FOR EACH ROW EXECUTE FUNCTION app.set_updated_at();
