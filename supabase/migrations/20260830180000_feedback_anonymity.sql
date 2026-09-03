-- =============================================================================
-- Kaaj — feedback: an anonymity promise the schema can keep
-- =============================================================================
-- hr_feedback stores from_employee_id alongside is_anonymous, so the promise
-- is only as good as every read path (see hr_feedback.repo.ts, which must
-- never SELECT the author for an anonymous note — no constraint can express
-- that). Two things enforced here: `visibility` must be a known value (an
-- unrecognised one is a disclosure bug, not a display bug), and an anonymous
-- note cannot be `manager_only` — an audience of one person is not anonymity.
-- =============================================================================

ALTER TABLE hr_feedback
    ADD CONSTRAINT hr_feedback_visibility_is_known
    CHECK (visibility IN ('private', 'manager_only', 'public'));

ALTER TABLE hr_feedback
    ADD CONSTRAINT hr_feedback_anonymous_is_not_manager_only
    CHECK (NOT (is_anonymous AND visibility = 'manager_only'));
