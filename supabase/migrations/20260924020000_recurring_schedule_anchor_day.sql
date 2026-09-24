-- `recurring_schedules.next_run_date` and `amortization_schedules.next_run_date`
-- are the only state a monthly/quarterly/annual advance reads AND writes —
-- `next_run_date + interval '1 month'` (accounting.repo.ts) clamps to the
-- target month's last day when the current day doesn't exist there (Jan 31
-- -> Feb 28), and every SUBSEQUENT advance then compounds from that already
-- -clamped day, never recovering to 31 even in a month that has one.
-- Confirmed empirically: '2026-01-31'::date + interval '1 month' three times
-- running gives Feb 28, Mar 28, Apr 28 — not Mar 31, Apr 30.
--
-- `anchor_day` is the day-of-month the advance should always aim for,
-- independent of whatever `next_run_date` currently holds. It is set once
-- at creation from the caller's own chosen first-run date and never
-- written again — the advance always computes from `anchor_day`, never
-- from the previous `next_run_date`'s day, so a clamp in one short month
-- doesn't propagate into the next.
--
-- Existing rows backfill anchor_day from their CURRENT next_run_date. Any
-- schedule that already drifted under the old formula keeps its drifted
-- day as its anchor going forward — the day it was ORIGINALLY created with
-- isn't recoverable from stored state, and re-guessing it would be a
-- fabrication, not a fix.

ALTER TABLE recurring_schedules ADD COLUMN anchor_day SMALLINT;
UPDATE recurring_schedules SET anchor_day = extract(day FROM next_run_date)::smallint;
ALTER TABLE recurring_schedules
  ALTER COLUMN anchor_day SET NOT NULL,
  ADD CONSTRAINT recurring_schedules_anchor_day_check CHECK (anchor_day BETWEEN 1 AND 31);

ALTER TABLE amortization_schedules ADD COLUMN anchor_day SMALLINT;
UPDATE amortization_schedules SET anchor_day = extract(day FROM next_run_date)::smallint;
ALTER TABLE amortization_schedules
  ALTER COLUMN anchor_day SET NOT NULL,
  ADD CONSTRAINT amortization_schedules_anchor_day_check CHECK (anchor_day BETWEEN 1 AND 31);
