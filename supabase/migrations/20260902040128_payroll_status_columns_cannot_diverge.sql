-- payroll_runs carries TWO status columns.
--
--   run_status  varchar(50), default 'draft' — authoritative. Carries all
--               three CHECKs: a closed vocabulary, the stage/timestamp rule,
--               and separation of duties.
--   status      text,        default 'draft' — a duplicate, unused, and
--               constrained by nothing. 20260831140000 said as much in a
--               COMMENT and left it in place because dropping it needs the
--               API surface checked first.
--
-- A COMMENT is prose, and prose is applied unevenly (L54). Until now nothing
-- could write either column, so the two agreed by construction. The payroll
-- lifecycle writes — approve, finalize, cancel — make them writable, and a
-- statement that moves `run_status` alone leaves `status` behind: no error, no
-- failing CHECK (they constrain run_status only), and an index on
-- (tenant_id, status) that now points at a value nothing else believes.
--
-- This makes the divergence impossible rather than discouraged. The lifecycle
-- writes set both, and this refuses the write that forgets.
--
-- Deliberately NOT a DROP. Dropping is still the right end state and still
-- needs the API-surface check that 20260831140000 deferred; this closes the
-- hole in the meantime, and a DROP later removes the constraint with the
-- column.
ALTER TABLE payroll_runs
    ADD CONSTRAINT payroll_runs_status_columns_agree
    CHECK (status = run_status);

COMMENT ON COLUMN payroll_runs.status IS
    'DUPLICATE of run_status and unused. run_status is authoritative — see '
    '20260831140000. payroll_runs_status_columns_agree (20260902040128) now '
    'refuses a write that moves one without the other. Dropping this column '
    'is still the end state and still needs the API surface checked first.';
