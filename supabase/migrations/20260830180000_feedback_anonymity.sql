-- =============================================================================
-- Kaaj — feedback: an anonymity promise the schema can keep
-- =============================================================================
-- hr_feedback stores `from_employee_id` AND `is_anonymous` in the same row.
-- That is the shape where a promise is broken silently: the source is right
-- there, correctly recorded, and any page that renders the author column
-- un-anonymises every anonymous note without erroring, without failing a test,
-- and without anyone noticing until the person who wrote it finds out.
--
-- Two things are added.
--
-- 1. `visibility` had no constraint at all, while carrying three values that
--    decide WHO MAY READ a note. An unrecognised value there is not a display
--    bug — `visibility = 'pubic'` would fall through every branch, and the
--    safe-looking default (show nothing) hides real feedback while the unsafe
--    one (show everything) publishes a private note.
--
-- 2. An anonymous note may not also be `manager_only`. Anonymity plus an
--    audience of exactly one person is not anonymity: if a manager receives an
--    anonymous note about one of their four reports, the sender is one of a
--    handful of people, and everyone involved knows it. Anonymous feedback is
--    for the recipient or for the firm, never for a single reader.
--
-- The application-side rule — that `from_employee_id` is never returned for an
-- anonymous note — lives in hr_feedback.repo.ts, because no constraint can
-- express "do not SELECT this column".
-- =============================================================================

ALTER TABLE hr_feedback
    ADD CONSTRAINT hr_feedback_visibility_is_known
    CHECK (visibility IN ('private', 'manager_only', 'public'));

ALTER TABLE hr_feedback
    ADD CONSTRAINT hr_feedback_anonymous_is_not_manager_only
    CHECK (NOT (is_anonymous AND visibility = 'manager_only'));
