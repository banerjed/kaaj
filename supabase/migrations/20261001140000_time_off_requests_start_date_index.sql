-- The time-off list, newest first, a page at a time: in this order, a page
-- reads twenty rows instead of sorting every request in the firm. `id` is
-- the list's tiebreaker, so a page boundary never splits requests that share
-- a start date.
CREATE INDEX idx_hr_time_off_requests_start_date
    ON hr_time_off_requests (tenant_id, start_date DESC, id DESC);
