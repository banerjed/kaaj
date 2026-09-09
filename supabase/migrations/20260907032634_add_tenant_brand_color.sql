-- =============================================================================
-- Kaaj — per-tenant brand colour for the topbar (docs/06-customization-model.md)
-- =============================================================================
-- Same shape as tenants.company_size: a closed vocabulary on plain text, not
-- a Postgres enum, so this constraint IS the source of truth (mirrored in
-- apps/web/src/lib/firm-profile/regional.ts's BRAND_COLORS, which the form
-- reads against via FormReader.choice()). A curated palette rather than a
-- free hex picker — each option is pre-checked for contrast against white
-- text, so there is no runtime contrast computation and no second stored
-- value for the topbar's content colour.
-- =============================================================================

ALTER TABLE tenants
  ADD COLUMN brand_color TEXT NOT NULL DEFAULT 'default'
    CONSTRAINT tenants_brand_color_check
    CHECK (brand_color IN ('default', 'slate', 'emerald', 'amber', 'rose', 'violet', 'cyan', 'charcoal'));
