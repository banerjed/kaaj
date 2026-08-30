-- =============================================================================
-- Kaaj — payroll money out of JSON numbers, and a run's state made coherent
-- =============================================================================
-- Four defects, all found by asking the fixture rather than reading the schema.
--
-- 1. MONEY IN JSONB AS JSON NUMBERS, on the largest money surface in the
--    product. `earnings`, `taxes`, `employer_taxes`, `pretax_deductions`,
--    `posttax_deductions` and `taxable_wages` all hold JSON numbers.
--
--    Postgres stores a jsonb number exactly, as `numeric`. Every driver then
--    hands it to JavaScript as a float64 — so the loss happens on READ, where
--    nothing looks wrong. CLAUDE.md § Money already says money inside JSONB is
--    a string; this is the rule being broken where it matters most.
--
--    And `earnings.base` EQUALS `gross_pay` on every row: the same money in two
--    places, one exact and one not. That makes it a live precision bug rather
--    than only a rule violation.
--
-- 2. `money/numeric-not-float` could never have caught it. It reads
--    `information_schema.columns`, so a JSONB column is invisible to it by
--    construction. A new invariant walks the registered paths instead —
--    verify-invariants.sql, `money/jsonb-is-text`.
--
-- 3. A RUN THAT PAID NOBODY. PR-2026-01-BONUS-US says employee_count = 1 and
--    total_gross_pay = 2500.00, is marked calculated AND approved, and has zero
--    line rows. Not a mid-creation state — the timestamps are set. The fixture
--    is corrected and an identity added.
--
-- 4. `run_status = 'finalized'` on two runs whose `finalized_at` is NULL. The
--    same shape as onboarding's completed-with-no-date: the status says the
--    money went out and nothing records when.
-- =============================================================================


-- -----------------------------------------------------------------------------
-- 1. Money inside JSONB becomes text
-- -----------------------------------------------------------------------------
-- `::numeric::text` rather than a plain cast, so 15416.67 becomes '15416.67'
-- and not '15416.670000'. Values already stored as text are left alone.

CREATE OR REPLACE FUNCTION app.jsonb_money_to_text(doc jsonb) RETURNS jsonb
LANGUAGE sql IMMUTABLE AS $$
  SELECT CASE
    WHEN doc IS NULL THEN NULL
    WHEN jsonb_typeof(doc) = 'number' THEN to_jsonb((doc #>> '{}')::numeric::text)
    WHEN jsonb_typeof(doc) = 'object' THEN coalesce(
      (SELECT jsonb_object_agg(k, app.jsonb_money_to_text(v))
         FROM jsonb_each(doc) AS e(k, v)), '{}'::jsonb)
    ELSE doc
  END
$$;

UPDATE payroll_run_employees SET
    earnings            = app.jsonb_money_to_text(earnings),
    taxes               = app.jsonb_money_to_text(taxes),
    employer_taxes      = app.jsonb_money_to_text(employer_taxes),
    pretax_deductions   = app.jsonb_money_to_text(pretax_deductions),
    posttax_deductions  = app.jsonb_money_to_text(posttax_deductions),
    taxable_wages       = app.jsonb_money_to_text(taxable_wages);

UPDATE payroll_tax_deposits
   SET tax_breakdown = app.jsonb_money_to_text(tax_breakdown)
 WHERE tax_breakdown IS NOT NULL;

UPDATE payroll_india_salary_structure
   SET other_allowances = app.jsonb_money_to_text(other_allowances)
 WHERE other_allowances IS NOT NULL;


-- -----------------------------------------------------------------------------
-- 2. A run's state must be coherent
-- -----------------------------------------------------------------------------

-- `run_status` had no constraint while gating whether money moves. An
-- unrecognised value falls through every branch — and the safe-looking default
-- (do nothing) silently skips a payroll.
ALTER TABLE payroll_runs
    ADD CONSTRAINT payroll_runs_status_is_known
    CHECK (run_status IN ('draft', 'calculating', 'calculated', 'approved',
                          'finalized', 'paid', 'cancelled'));

-- A status that claims a stage must carry the timestamp for it. Two runs said
-- `finalized` with a NULL finalized_at: the status says the money went out and
-- nothing records when — which is the question an auditor asks first.
UPDATE payroll_runs SET finalized_at = approved_at
 WHERE run_status IN ('finalized', 'paid') AND finalized_at IS NULL;

ALTER TABLE payroll_runs
    ADD CONSTRAINT payroll_runs_stages_have_timestamps
    CHECK (
        (run_status <> 'calculated' OR calculated_at IS NOT NULL)
    AND (run_status NOT IN ('approved','finalized','paid')
         OR (calculated_at IS NOT NULL AND approved_at IS NOT NULL))
    AND (run_status NOT IN ('finalized','paid') OR finalized_at IS NOT NULL)
    );

-- Separation of duties, at the row rather than the grant. tenant_users already
-- refuses one person holding both hr_admin and payroll_admin; this refuses the
-- other route to the same place — the person who calculated a run approving it.
ALTER TABLE payroll_runs
    ADD CONSTRAINT payroll_runs_calculator_is_not_approver
    CHECK (calculated_by IS NULL OR approved_by IS NULL
           OR calculated_by <> approved_by);

COMMENT ON COLUMN payroll_runs.status IS
    'DUPLICATE of run_status and unused. run_status is authoritative — see '
    '20260831140000. Left in place because dropping it needs the API surface '
    'checked first.';
