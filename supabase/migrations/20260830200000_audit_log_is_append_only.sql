-- =============================================================================
-- Kaaj — the audit log can be written and read, never rewritten
-- =============================================================================
-- DELETE was revoked schema-wide (20260830120000); UPDATE is revoked here too
-- — an editable audit log answers "what happened?" with whatever the last
-- writer preferred. A correction is a new row.
-- =============================================================================

REVOKE UPDATE ON audit_log FROM app_user;

-- occurred_at must not be caller-chosen, or a row could claim a false time.
ALTER TABLE audit_log ALTER COLUMN occurred_at SET DEFAULT now();

COMMENT ON TABLE audit_log IS
    'Append-only. INSERT and SELECT only for app_user — a correction is a new '
    'row, never an edit. See 20260830200000_audit_log_is_append_only.sql.';
