-- =============================================================================
-- Kaaj — a review's status is a one-way sequence
-- =============================================================================
-- hr_reviews.status carried draft / submitted / acknowledged with no constraint
-- at all. Both halves of what that column governs matter:
--
--   * It decides VISIBILITY. hr_reviews.repo.ts withholds a manager's
--     assessment from its subject until the status is submitted or
--     acknowledged, so an unrecognised value — 'Submitted', 'sumbitted' —
--     falls to the withheld branch and hides a finished review forever, with
--     no error anywhere.
--
--   * It records that a person SAW their review. `acknowledged` is the only
--     evidence of that, and it is the fact that matters in a dispute about a
--     performance process.
--
-- The forward-only ordering is enforced in the application rather than here: a
-- CHECK constraint cannot see the previous value of a row. What the database
-- can guarantee is that the value is one of the three, which is what stops the
-- silent-hiding failure.
-- =============================================================================

ALTER TABLE hr_reviews
    ADD CONSTRAINT hr_reviews_status_is_known
    CHECK (status IN ('draft', 'submitted', 'acknowledged'));

-- An acknowledged review must have a manager's half to have been acknowledged
-- ABOUT. Without this, an empty review can be marched to the terminal state
-- and the record says the person saw something that was never written.
ALTER TABLE hr_reviews
    ADD CONSTRAINT hr_reviews_acknowledged_has_an_assessment
    CHECK (status <> 'acknowledged' OR manager_assessment IS NOT NULL);
