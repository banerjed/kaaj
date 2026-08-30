-- =============================================================================
-- Kaaj — the application cannot DELETE
-- =============================================================================
-- Records are retained, never destroyed. Payroll history, statutory retention
-- and any later audit all depend on the row still being there, and a deleted
-- row cannot be un-deleted by a support call.
--
-- Before this migration the policy was accidental: four config tables hard
-- DELETEd, five archived with `is_active = FALSE`, and the choice was made
-- per-file as each repository was written. `app_user` held DELETE on all 104
-- tables, so nothing but the absence of a written statement prevented one.
--
-- Two things are made true here:
--
--   1. The four tables that could only be hard-deleted gain `is_active`, so
--      archiving them is now possible at all.
--   2. DELETE is REVOKED from app_user everywhere except a named allow-list.
--      A privilege is not a convention: revoking it means a DELETE that slips
--      past review fails with 42501 rather than destroying a row.
--
-- 86 ON DELETE CASCADE foreign keys remain, and they are not the application's
-- to fire — app_user cannot delete a parent, so they can only trigger from an
-- owner connection doing deliberate maintenance.
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

-- pii_keys — GDPR Article 17. Destroying the key IS the erasure: it renders
-- every ciphertext for that person unrecoverable everywhere, including in
-- backups already taken, which no UPDATE achieves. The one table where a row
-- must genuinely cease to exist.
GRANT DELETE ON pii_keys TO app_user;

-- jobs — a work queue. A claimed, completed job is not a business record, and
-- a queue that only ever grows is a queue that eventually stops working.
GRANT DELETE ON jobs TO app_user;

-- pii_erasures is deliberately ABSENT from this list: the record that an
-- erasure happened must outlive the data it describes, and outlive the person
-- who requested it. It is the evidence that Article 17 was honoured.
