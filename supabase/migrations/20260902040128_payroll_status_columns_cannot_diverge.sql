-- payroll_runs carries two status columns: run_status (authoritative, holds
-- all the CHECKs) and status (a duplicate, unused, unconstrained —
-- see 20260831140000). Now that the payroll lifecycle writes make both
-- columns writable, a statement moving one without the other would pass
-- silently (L54: a COMMENT is prose, applied unevenly). This CHECK makes that
-- divergence impossible instead of just discouraged.
--
-- Deliberately not a DROP — dropping `status` is still the end state, but
-- needs the API surface checked first.
ALTER TABLE payroll_runs
    ADD CONSTRAINT payroll_runs_status_columns_agree
    CHECK (status = run_status);

COMMENT ON COLUMN payroll_runs.status IS
    'DUPLICATE of run_status and unused. run_status is authoritative — see '
    '20260831140000. payroll_runs_status_columns_agree (20260902040128) now '
    'refuses a write that moves one without the other. Dropping this column '
    'is still the end state and still needs the API surface checked first.';
