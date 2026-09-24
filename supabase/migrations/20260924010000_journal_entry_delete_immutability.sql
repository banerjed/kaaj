-- accounting_delete (20260903045821_accounting_row_visibility.sql) grants
-- DELETE to anyone app.writes_accounting() allows, with no predicate on
-- status — the same gap 20260912060000_journal_entry_immutability.sql
-- closed for accounting_update on these same two tables, but never
-- extended to DELETE. No role app_user/service_role/authenticated holds a
-- DELETE grant on journal_entries today (checked: only the table owner
-- does), so this was unreachable rather than exploited — same shape as the
-- UPDATE gap's own comment. Closing it anyway: a grants change elsewhere
-- that ever added DELETE for a real role would otherwise silently permit
-- erasing a posted entry.
--
-- L63: a DROP/CREATE pair is not a diff — restate every modifier.

DROP POLICY IF EXISTS accounting_delete ON public.journal_entries;
CREATE POLICY accounting_delete ON public.journal_entries AS RESTRICTIVE
    FOR DELETE TO public
    USING ((SELECT app.writes_accounting()) AND status <> 'posted');

-- Same fail-closed EXISTS shape as accounting_update on this table
-- (20260912060000_journal_entry_immutability.sql's own comment explains
-- why NOT EXISTS would fail open for an invisible parent row).
DROP POLICY IF EXISTS accounting_delete ON public.journal_entry_lines;
CREATE POLICY accounting_delete ON public.journal_entry_lines AS RESTRICTIVE
    FOR DELETE TO public
    USING (
        (SELECT app.writes_accounting())
        AND EXISTS (
            SELECT 1 FROM journal_entries e
             WHERE e.id = journal_entry_lines.entry_id AND e.status <> 'posted'
        )
    );
