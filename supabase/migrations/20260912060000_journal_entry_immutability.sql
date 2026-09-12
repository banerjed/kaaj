-- A posted journal entry is immutable (docs/19-accounting-test-plan.md §1.3,
-- "editing a posted entry is disallowed"). `accounting_update`
-- (20260903045821_accounting_row_visibility.sql) grants UPDATE to anyone
-- app.writes_accounting() allows, with no predicate on status — every
-- journal_entries row is inserted 'posted' by postJournal and nothing today
-- issues an UPDATE against these two tables, so this was unreachable rather
-- than exploited, but nothing stopped a future route from reaching it.
--
-- L63: a DROP/CREATE pair is not a diff — restate every modifier
-- (AS RESTRICTIVE, FOR, TO, WITH CHECK), or omission silently drops one.
-- Only these two tables' accounting_update changes; the other thirteen keep
-- the policy from the original migration untouched.

DROP POLICY IF EXISTS accounting_update ON public.journal_entries;
CREATE POLICY accounting_update ON public.journal_entries AS RESTRICTIVE
    FOR UPDATE TO public
    USING ((SELECT app.writes_accounting()) AND status <> 'posted')
    WITH CHECK ((SELECT app.writes_accounting()) AND status <> 'posted');

-- journal_entry_lines carries no status of its own — immutability follows
-- its parent entry's, found by an EXISTS the actor's OWN RLS on
-- journal_entries still governs.
--
-- Phrased as a positive EXISTS(status <> 'posted'), not NOT EXISTS(status =
-- 'posted') — the subquery is itself subject to journal_entries' RLS, so if
-- the parent row is invisible to this actor (a different tenant, or a role
-- reads_all_accounting() would refuse), NOT EXISTS(...) is vacuously TRUE
-- and would silently PERMIT the update. EXISTS(...) is vacuously FALSE in
-- that same case and DENIES — fail-closed rather than fail-open, same shape
-- as L47/L62's "a guard that fails open looks identical to one that works,
-- until the case that would have said no."
DROP POLICY IF EXISTS accounting_update ON public.journal_entry_lines;
CREATE POLICY accounting_update ON public.journal_entry_lines AS RESTRICTIVE
    FOR UPDATE TO public
    USING (
        (SELECT app.writes_accounting())
        AND EXISTS (
            SELECT 1 FROM journal_entries e
             WHERE e.id = journal_entry_lines.entry_id AND e.status <> 'posted'
        )
    )
    WITH CHECK (
        (SELECT app.writes_accounting())
        AND EXISTS (
            SELECT 1 FROM journal_entries e
             WHERE e.id = journal_entry_lines.entry_id AND e.status <> 'posted'
        )
    );
