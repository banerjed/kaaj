-- =============================================================================
-- Kaaj — a review's status is a one-way sequence
-- =============================================================================
-- status had no constraint. hr_reviews.repo.ts withholds the manager's
-- assessment until status is submitted/acknowledged, so a typo'd value
-- ('sumbitted') would silently hide a finished review forever. Ordering
-- itself stays application-enforced — a CHECK can't see the row's prior
-- value — but the database can guarantee the value is one of the three.
-- =============================================================================

ALTER TABLE hr_reviews
    ADD CONSTRAINT hr_reviews_status_is_known
    CHECK (status IN ('draft', 'submitted', 'acknowledged'));

-- An acknowledged review must have a manager's assessment to acknowledge.
ALTER TABLE hr_reviews
    ADD CONSTRAINT hr_reviews_acknowledged_has_an_assessment
    CHECK (status <> 'acknowledged' OR manager_assessment IS NOT NULL);
