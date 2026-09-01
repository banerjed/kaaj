-- ============================================================================
-- Sensitive columns on `employees` carry a `_pvt` suffix.
--
-- `employees` is a staff directory: every colleague can read the row, so
-- row-level security cannot defend any column on it. That asymmetry is the
-- root of L47 — `base_amount` sat next to `first_name` and looked equally
-- ordinary, and a COALESCE onto it disclosed every salary in the firm.
--
-- The suffix makes the distinction visible at every call site. A reviewer
-- reading `COALESCE(cp.amount, e.base_amount_pvt)` sees the problem in the
-- diff; with `e.base_amount` there was nothing to see.
--
-- WHY A NAME, WHEN NAMES ARE A BAD ORACLE
--
-- `verify-matrix-complete.mjs` deliberately does NOT infer sensitivity from
-- column names: a regex misses a renamed column, anything inside a JSONB
-- document, and PII with an innocuous name. This is the inverse operation.
-- The disclosure matrix remains the source of truth and the name is made to
-- AGREE with it — enforced in both directions, so a restricted column without
-- the suffix and a suffixed column that is not restricted both fail the build.
-- The name is then provable rather than a convention people drift from.
--
-- Two suffixes now partition the sensitive columns on this table:
--
--   _ct   ciphertext at rest; only $lib/server/pii opens it
--   _pvt  plaintext, restricted; must never reach a projection
--
-- and a column on `employees` carrying NEITHER is directory data, by
-- construction. That property is the point.
--
-- SCOPE. Only `employees`. On `compensation_*` the row policy defends every
-- column at once and the table name already says what it holds; suffixing
-- fifty columns there would add noise without adding information. Per-column
-- marking belongs exactly where per-column defense does — on a row that must
-- be broadly visible.
--
-- Forward-only, like every migration here: a mistake is corrected by another
-- migration, never by rolling back.
-- ============================================================================

ALTER TABLE employees RENAME COLUMN base_amount           TO base_amount_pvt;
ALTER TABLE employees RENAME COLUMN salary_structure      TO salary_structure_pvt;
ALTER TABLE employees RENAME COLUMN variable_compensation TO variable_compensation_pvt;
ALTER TABLE employees RENAME COLUMN compensation_band     TO compensation_band_pvt;
ALTER TABLE employees RENAME COLUMN default_hourly_rate   TO default_hourly_rate_pvt;
ALTER TABLE employees RENAME COLUMN default_billable_rate TO default_billable_rate_pvt;
ALTER TABLE employees RENAME COLUMN tax_withholding       TO tax_withholding_pvt;
ALTER TABLE employees RENAME COLUMN benefits_elections    TO benefits_elections_pvt;

COMMENT ON COLUMN employees.base_amount_pvt IS
  'Restricted. A cache of compensation_base.amount, which is row-policy scoped; '
  'reading this instead bypasses that policy (L47). Written by syncCache, read by nothing.';
COMMENT ON COLUMN employees.salary_structure_pvt IS
  'Restricted. Compensation. Money inside JSONB is stored as a STRING (L41).';
COMMENT ON COLUMN employees.variable_compensation_pvt IS
  'Restricted. Compensation. Money inside JSONB is stored as a STRING (L41).';
COMMENT ON COLUMN employees.compensation_band_pvt IS
  'Restricted. The person''s own band, distinct from the published range for their level.';
COMMENT ON COLUMN employees.default_hourly_rate_pvt IS
  'Restricted. An internal cost rate divides out to an annual salary.';
COMMENT ON COLUMN employees.default_billable_rate_pvt IS
  'Restricted. What the firm charges for this person; commercially sensitive.';
COMMENT ON COLUMN employees.tax_withholding_pvt IS
  'Restricted. Withholding elections disclose marital status and dependants.';
COMMENT ON COLUMN employees.benefits_elections_pvt IS
  'Restricted. Health and insurance elections: GDPR Art. 9 special category data.';
