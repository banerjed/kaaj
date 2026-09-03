-- =============================================================================
-- Kaaj — a review cycle's deadlines are dates, not text
-- =============================================================================
-- The three deadline columns were TEXT: accepted '2026-13-45' and '', and
-- only sorted correctly by ISO-8601 accident (L37).
-- =============================================================================

ALTER TABLE hr_review_cycles
    ALTER COLUMN self_assessment_due    TYPE DATE USING nullif(self_assessment_due, '')::date,
    ALTER COLUMN manager_assessment_due TYPE DATE USING nullif(manager_assessment_due, '')::date,
    ALTER COLUMN review_meetings_due    TYPE DATE USING nullif(review_meetings_due, '')::date;

-- NULLs pass (a cycle need not schedule every stage), but any two deadlines
-- that are set must be in sequence.
ALTER TABLE hr_review_cycles
    ADD CONSTRAINT hr_review_cycles_deadlines_are_ordered
    CHECK (
        (self_assessment_due    IS NULL OR self_assessment_due    >= start_date)
    AND (manager_assessment_due IS NULL OR self_assessment_due    IS NULL
         OR manager_assessment_due >= self_assessment_due)
    AND (review_meetings_due    IS NULL OR manager_assessment_due IS NULL
         OR review_meetings_due >= manager_assessment_due)
    AND (cycle_close_date       IS NULL OR review_meetings_due    IS NULL
         OR cycle_close_date >= review_meetings_due)
    AND (cycle_close_date       IS NULL OR cycle_close_date >= start_date)
    );
