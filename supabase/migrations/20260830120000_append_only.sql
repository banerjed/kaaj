-- =============================================================================
-- Kaaj — the application cannot DELETE
-- =============================================================================
-- Records are retained, never destroyed, for payroll history, statutory
-- retention and audit. Previously DELETE was possible on all tables by
-- convention alone. This migration: (1) gives the four tables that could only
-- be hard-deleted an `is_active` column, and (2) REVOKEs DELETE from app_user
-- except on a named allow-list, so a stray DELETE fails with 42501 instead of
-- destroying a row. Remaining ON DELETE CASCADE FKs only fire from an owner
-- connection, not the application.
-- =============================================================================


-- -----------------------------------------------------------------------------
-- 1. The four tables that had no way to archive
-- -----------------------------------------------------------------------------

ALTER TABLE firm_job_levels       ADD COLUMN is_active BOOLEAN NOT NULL DEFAULT TRUE;
ALTER TABLE firm_holidays         ADD COLUMN is_active BOOLEAN NOT NULL DEFAULT TRUE;
ALTER TABLE firm_benefit_items    ADD COLUMN is_active BOOLEAN NOT NULL DEFAULT TRUE;
ALTER TABLE firm_payroll_policies ADD COLUMN is_active BOOLEAN NOT NULL DEFAULT TRUE;

COMMENT ON COLUMN firm_job_levels.is_active IS
    'FALSE = archived. Rows are never deleted — see 20260830120000_append_only.sql.';
COMMENT ON COLUMN firm_holidays.is_active IS
    'FALSE = archived. Rows are never deleted — see 20260830120000_append_only.sql.';
COMMENT ON COLUMN firm_benefit_items.is_active IS
    'FALSE = archived. Rows are never deleted — see 20260830120000_append_only.sql.';
COMMENT ON COLUMN firm_payroll_policies.is_active IS
    'FALSE = archived. Rows are never deleted — see 20260830120000_append_only.sql.';


-- -----------------------------------------------------------------------------
-- 2. Revoke DELETE, then grant it back only where destruction is the point
-- -----------------------------------------------------------------------------

REVOKE DELETE ON ALL TABLES IN SCHEMA public FROM app_user;

-- Future tables inherit the same shape: SELECT/INSERT/UPDATE, never DELETE.
-- 20260827000002 set a default of all four; this narrows it.
ALTER DEFAULT PRIVILEGES IN SCHEMA public
    REVOKE DELETE ON TABLES FROM app_user;

-- pii_keys: destroying the key IS the GDPR Art. 17 erasure — the one table
-- where a row must genuinely cease to exist.
GRANT DELETE ON pii_keys TO app_user;

-- jobs: a work queue; completed jobs aren't business records.
GRANT DELETE ON jobs TO app_user;

-- pii_erasures deliberately absent: the record that an erasure happened must
-- outlive the data and the person it describes.
