-- One person's time entries, newest first — the time-tracking list for
-- anyone who may see only their own. Without it the planner walks the
-- firm-wide date index looking for twenty of theirs, which for someone with
-- few or no entries is every entry in the firm (107ms at 418,000 entries in
-- the perf tenant, docs/32-perf-tenant.md; 0.1ms with it).
CREATE INDEX idx_time_tracking_entries_employee_date
    ON time_tracking_entries (tenant_id, employee_id, entry_date DESC, created_at DESC);
