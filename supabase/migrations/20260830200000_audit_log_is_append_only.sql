-- =============================================================================
-- Kaaj — the audit log can be written and read, never rewritten
-- =============================================================================
-- 20260830120000 revoked DELETE across the schema, so nothing can remove an
-- audit row. UPDATE was left in place, and for this table that is the same
-- hole: an audit log whose entries can be edited answers "what happened?" with
-- whatever the last writer preferred. The value of the record is precisely that
-- nobody could have changed it afterwards.
--
-- INSERT and SELECT only. A correction is a NEW row describing the correction,
-- which is also how the migrations themselves work (forward-only, never rolled
-- back) and how a ledger works.
-- =============================================================================

REVOKE UPDATE ON audit_log FROM app_user;

-- occurred_at is what an auditor sorts and filters by, so it must not be a
-- value the caller chooses. A row inserted claiming to have happened last year
-- would sit quietly in the middle of the history.
ALTER TABLE audit_log ALTER COLUMN occurred_at SET DEFAULT now();

COMMENT ON TABLE audit_log IS
    'Append-only. INSERT and SELECT only for app_user — a correction is a new '
    'row, never an edit. See 20260830200000_audit_log_is_append_only.sql.';
