-- =============================================================================
-- Kaaj — payroll money out of JSON numbers, and a run's state made coherent
-- =============================================================================
-- Two fixes:
--
-- 1. earnings/taxes/deductions/taxable_wages held JSON numbers, in violation
--    of CLAUDE.md § Money (money inside JSONB is a string) — the loss happens
--    on read, as a float64. money/numeric-not-float can't catch this since it
--    only reads information_schema.columns; see money/jsonb-is-text instead.
--
-- 2. run_status had no constraint despite gating whether money moves, and two
--    finalized runs had a NULL finalized_at.
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

-- run_status gates whether money moves; an unrecognised value silently falls
-- through every branch.
ALTER TABLE payroll_runs
    ADD CONSTRAINT payroll_runs_status_is_known
    CHECK (run_status IN ('draft', 'calculating', 'calculated', 'approved',
                          'finalized', 'paid', 'cancelled'));

-- A status claiming a stage must carry the timestamp for it.
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

-- Separation of duties at the row level: the calculator cannot also approve.
ALTER TABLE payroll_runs
    ADD CONSTRAINT payroll_runs_calculator_is_not_approver
    CHECK (calculated_by IS NULL OR approved_by IS NULL
           OR calculated_by <> approved_by);

COMMENT ON COLUMN payroll_runs.status IS
    'DUPLICATE of run_status and unused. run_status is authoritative — see '
    '20260831140000. Left in place because dropping it needs the API surface '
    'checked first.';
