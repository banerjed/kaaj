-- ============================================================================
-- Sensitive columns on `employees` carry a `_pvt` suffix.
--
-- employees is a staff directory readable by every colleague, so RLS can't
-- defend any single column on it — the root of L47, where base_amount sat
-- next to first_name looking equally ordinary. The suffix makes a restricted
-- column visible at the call site; `./check` enforces the name AGREES with
-- the disclosure matrix (source of truth), in both directions.
--
-- `_ct` = ciphertext (only $lib/server/pii opens it); `_pvt` = restricted
-- plaintext. A column with neither is directory data, by construction.
--
-- Scope: only employees. Elsewhere (compensation_*) a row policy already
-- defends the whole row, so per-column marking would add noise, not
-- information.
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
