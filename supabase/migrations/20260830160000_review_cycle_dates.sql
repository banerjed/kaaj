-- =============================================================================
-- Kaaj — a review cycle's deadlines are dates, not text
-- =============================================================================
-- hr_review_cycles.start_date and cycle_close_date are DATE. The three
-- deadlines between them — self_assessment_due, manager_assessment_due,
-- review_meetings_due — are TEXT.
--
-- They happen to sort correctly today because ISO-8601 strings sort lexically,
-- which is exactly the kind of accident that holds until someone writes
-- '15/06/2026' or '2026-6-5'. As text the column accepts '2026-13-45', accepts
-- an empty string, and needs a ::date cast at every comparison — the cast this
-- codebase has now been bitten by twice (L37).
--
-- One row exists, so this is cheap now and expensive later.
-- =============================================================================

ALTER TABLE hr_review_cycles
    ALTER COLUMN self_assessment_due    TYPE DATE USING nullif(self_assessment_due, '')::date,
    ALTER COLUMN manager_assessment_due TYPE DATE USING nullif(manager_assessment_due, '')::date,
    ALTER COLUMN review_meetings_due    TYPE DATE USING nullif(review_meetings_due, '')::date;

-- A cycle whose manager deadline precedes its self-assessment deadline is
-- nonsense, and nothing else would catch it: the dates are entered by hand and
-- read by humans who assume they are ordered. NULLs pass — a cycle need not
-- schedule every stage — but any two that ARE set must be in sequence.
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
