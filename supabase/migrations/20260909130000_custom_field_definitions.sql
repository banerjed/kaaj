-- =============================================================================
-- Kaaj — custom field definitions gain a business-area scope
-- =============================================================================
-- custom_field_definitions already exists (20260827000001_initial_schema.sql)
-- for exactly this purpose (docs/06-customization-model.md Tier 2) — 'employee'
-- and 'task' rows are already seeded and unique on (tenant_id, entity_type,
-- field_key). It has no consumer in the app yet; this migration makes
-- ticketing the first one.
--
-- Ticketing needs a SECOND scope dimension the original table didn't
-- anticipate: not just "which entity type" but "which business area" — IT
-- and Client Support tickets legitimately want different fields. NULL for
-- every other entity_type, so nothing already seeded is affected.
-- =============================================================================

ALTER TABLE custom_field_definitions
    ADD COLUMN business_area_id UUID REFERENCES ticketing_business_areas(id);

ALTER TABLE custom_field_definitions
    DROP CONSTRAINT custom_field_definitions_tenant_id_entity_type_field_key_key,
    ADD CONSTRAINT custom_field_definitions_tenant_id_entity_type_field_key_key
        UNIQUE (tenant_id, entity_type, business_area_id, field_key);

CREATE INDEX idx_custom_field_definitions_business_area_id
    ON custom_field_definitions (tenant_id, business_area_id)
    WHERE business_area_id IS NOT NULL;

-- ticketing_business_areas.custom_fields (JSONB) predates this table, was
-- read by nothing in the app (a grep across apps/web/src turned up zero
-- matches), and held the IDENTICAL value on every business area regardless —
-- not a working per-area mechanism, just an inert blob. Superseded by the
-- table above, which is the real one. ticketing_tickets.custom_fields is NOT
-- touched: that column becomes the actual values store, keyed by field_key,
-- exactly as the customization doc describes.
ALTER TABLE ticketing_business_areas DROP COLUMN custom_fields;
