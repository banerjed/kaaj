-- Posted base-currency activity per account per day, kept in step with the
-- ledger by triggers, so a report sums days instead of every line ever
-- posted (docs/32-perf-tenant.md: 120-530ms per report at 200,000 lines).
-- A day is the finest unit any report filters by, so `<= as_of` and
-- `BETWEEN from AND to` over this table are exact.
--
-- Every row is RECOMPUTED from the lines, never incremented (L58), by
-- triggers on every write that can move a posted figure — the app, the
-- fixture and the perf generator alike. The recompute runs as the table
-- owner, so it sums every line, not the lines the writer's row policy shows
-- (L106). Concurrent posts serialise on an advisory lock per TENANT, held to
-- commit, and each recompute statement runs after the lock is held — under
-- READ COMMITTED it then sees every earlier writer's committed lines. One
-- lock rather than one per account: a transaction posting several journals
-- (recurring invoices, amortisations, a vendor payment batch) would take
-- per-account locks statement by statement, in no single order, and two of
-- them could deadlock. Posting is not frequent enough per tenant for the
-- coarser lock to matter.
--
-- `line_count` keeps "has activity" (a trial balance lists an account with
-- any posted line, even if it nets to zero); a day whose count falls to
-- zero is deleted.

CREATE TABLE gl_daily_balances (
    tenant_id     UUID          NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    account_id    UUID          NOT NULL REFERENCES chart_of_accounts(id),
    balance_date  DATE          NOT NULL,
    base_debit    NUMERIC(15,2) NOT NULL,
    base_credit   NUMERIC(15,2) NOT NULL,
    line_count    INTEGER       NOT NULL CHECK (line_count > 0),
    PRIMARY KEY (tenant_id, account_id, balance_date)
);

CREATE INDEX idx_gl_daily_balances_date ON gl_daily_balances (tenant_id, balance_date);

ALTER TABLE gl_daily_balances ENABLE ROW LEVEL SECURITY;
ALTER TABLE gl_daily_balances FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON gl_daily_balances
    USING (tenant_id = app.current_tenant_id())
    WITH CHECK (tenant_id = app.current_tenant_id());
-- The same figures as journal_entry_lines, so the same audience.
CREATE POLICY accounting_read ON public.gl_daily_balances AS RESTRICTIVE
    FOR SELECT TO public USING ((SELECT app.reads_all_accounting()));

-- Written only by the triggers below.
REVOKE INSERT, UPDATE, DELETE ON gl_daily_balances FROM app_user;


-- Recompute the given (tenant, account, day) keys from the posted lines.
CREATE OR REPLACE FUNCTION app.gl_daily_recompute(
    p_tenant UUID[], p_account UUID[], p_day DATE[]
) RETURNS VOID
LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
AS $$
BEGIN
    PERFORM pg_advisory_xact_lock(k)
       FROM (SELECT DISTINCT hashtextextended('gl_daily_balances|' || t::text, 0) AS k
               FROM unnest(p_tenant) AS u(t)
              WHERE t IS NOT NULL
              ORDER BY 1) s;

    INSERT INTO public.gl_daily_balances
           (tenant_id, account_id, balance_date, base_debit, base_credit, line_count)
    SELECT k.t, k.a, k.d,
           coalesce(sum(l.base_debit_amount), 0),
           coalesce(sum(l.base_credit_amount), 0),
           count(l.id)
      FROM (SELECT DISTINCT t, a, d FROM unnest(p_tenant, p_account, p_day) AS u(t, a, d)
             WHERE t IS NOT NULL AND a IS NOT NULL AND d IS NOT NULL) k
      JOIN public.journal_entries je
        ON je.tenant_id = k.t AND je.entry_date = k.d AND je.status = 'posted'
      JOIN public.journal_entry_lines l
        ON l.entry_id = je.id AND l.account_id = k.a
     GROUP BY k.t, k.a, k.d
    ON CONFLICT (tenant_id, account_id, balance_date) DO UPDATE
       SET base_debit  = EXCLUDED.base_debit,
           base_credit = EXCLUDED.base_credit,
           line_count  = EXCLUDED.line_count;

    -- Keys with no posted line left.
    DELETE FROM public.gl_daily_balances b
     USING (SELECT DISTINCT t, a, d FROM unnest(p_tenant, p_account, p_day) AS u(t, a, d)) k
     WHERE b.tenant_id = k.t AND b.account_id = k.a AND b.balance_date = k.d
       AND NOT EXISTS (
             SELECT 1
               FROM public.journal_entries je
               JOIN public.journal_entry_lines l
                 ON l.entry_id = je.id AND l.account_id = k.a
              WHERE je.tenant_id = k.t AND je.entry_date = k.d AND je.status = 'posted');
END $$;

REVOKE ALL ON FUNCTION app.gl_daily_recompute(UUID[], UUID[], DATE[]) FROM PUBLIC;


-- Lines inserted: their own (account, entry day).
CREATE OR REPLACE FUNCTION app.gl_daily_lines_inserted() RETURNS TRIGGER
LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
AS $$
DECLARE t UUID[]; a UUID[]; d DATE[];
BEGIN
    SELECT array_agg(n.tenant_id), array_agg(n.account_id), array_agg(je.entry_date)
      INTO t, a, d
      FROM new_rows n JOIN public.journal_entries je ON je.id = n.entry_id;
    PERFORM app.gl_daily_recompute(t, a, d);
    RETURN NULL;
END $$;

-- Lines changed: the old and the new (account, entry day).
CREATE OR REPLACE FUNCTION app.gl_daily_lines_updated() RETURNS TRIGGER
LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
AS $$
DECLARE t UUID[]; a UUID[]; d DATE[];
BEGIN
    SELECT array_agg(x.tenant_id), array_agg(x.account_id), array_agg(je.entry_date)
      INTO t, a, d
      FROM (SELECT tenant_id, account_id, entry_id FROM old_rows
            UNION SELECT tenant_id, account_id, entry_id FROM new_rows) x
      JOIN public.journal_entries je ON je.id = x.entry_id;
    PERFORM app.gl_daily_recompute(t, a, d);
    RETURN NULL;
END $$;

-- Lines deleted: their (account, entry day) — or, when the entry went with
-- them (a cascade), every day that account has, since the day is gone.
CREATE OR REPLACE FUNCTION app.gl_daily_lines_deleted() RETURNS TRIGGER
LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
AS $$
DECLARE t UUID[]; a UUID[]; d DATE[];
BEGIN
    SELECT array_agg(k.tenant_id), array_agg(k.account_id), array_agg(k.day)
      INTO t, a, d
      FROM (
        SELECT o.tenant_id, o.account_id, je.entry_date AS day
          FROM old_rows o JOIN public.journal_entries je ON je.id = o.entry_id
        UNION
        SELECT b.tenant_id, b.account_id, b.balance_date
          FROM (SELECT DISTINCT o.tenant_id, o.account_id
                  FROM old_rows o
                 WHERE NOT EXISTS (SELECT 1 FROM public.journal_entries je
                                    WHERE je.id = o.entry_id)) gone
          JOIN public.gl_daily_balances b
            ON b.tenant_id = gone.tenant_id AND b.account_id = gone.account_id
      ) k;
    PERFORM app.gl_daily_recompute(t, a, d);
    RETURN NULL;
END $$;

-- An entry's status or date changed: every account on it, old and new day.
CREATE OR REPLACE FUNCTION app.gl_daily_entries_updated() RETURNS TRIGGER
LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
AS $$
DECLARE t UUID[]; a UUID[]; d DATE[];
BEGIN
    SELECT array_agg(k.tenant_id), array_agg(k.account_id), array_agg(k.day)
      INTO t, a, d
      FROM (
        SELECT DISTINCT l.tenant_id, l.account_id, x.day
          FROM (SELECT o.id, o.entry_date AS day FROM old_rows o
                  JOIN new_rows n ON n.id = o.id
                 WHERE o.status IS DISTINCT FROM n.status
                    OR o.entry_date IS DISTINCT FROM n.entry_date
                UNION
                SELECT n.id, n.entry_date FROM old_rows o
                  JOIN new_rows n ON n.id = o.id
                 WHERE o.status IS DISTINCT FROM n.status
                    OR o.entry_date IS DISTINCT FROM n.entry_date) x
          JOIN public.journal_entry_lines l ON l.entry_id = x.id
      ) k;
    IF t IS NOT NULL THEN
        PERFORM app.gl_daily_recompute(t, a, d);
    END IF;
    RETURN NULL;
END $$;

-- One trigger per event: a trigger with transition tables may name only one.
CREATE TRIGGER trg_gl_daily_lines_inserted
    AFTER INSERT ON journal_entry_lines
    REFERENCING NEW TABLE AS new_rows
    FOR EACH STATEMENT EXECUTE FUNCTION app.gl_daily_lines_inserted();
CREATE TRIGGER trg_gl_daily_lines_updated
    AFTER UPDATE ON journal_entry_lines
    REFERENCING OLD TABLE AS old_rows NEW TABLE AS new_rows
    FOR EACH STATEMENT EXECUTE FUNCTION app.gl_daily_lines_updated();
CREATE TRIGGER trg_gl_daily_lines_deleted
    AFTER DELETE ON journal_entry_lines
    REFERENCING OLD TABLE AS old_rows
    FOR EACH STATEMENT EXECUTE FUNCTION app.gl_daily_lines_deleted();
CREATE TRIGGER trg_gl_daily_entries_updated
    AFTER UPDATE ON journal_entries
    REFERENCING OLD TABLE AS old_rows NEW TABLE AS new_rows
    FOR EACH STATEMENT EXECUTE FUNCTION app.gl_daily_entries_updated();


-- What is already posted. The fixture is seeded after migrations, so for a
-- fresh database the insert trigger does this instead.
DO $$
BEGIN
    INSERT INTO gl_daily_balances
           (tenant_id, account_id, balance_date, base_debit, base_credit, line_count)
    SELECT je.tenant_id, l.account_id, je.entry_date,
           coalesce(sum(l.base_debit_amount), 0),
           coalesce(sum(l.base_credit_amount), 0),
           count(*)
      FROM journal_entry_lines l
      JOIN journal_entries je ON je.id = l.entry_id AND je.status = 'posted'
     GROUP BY je.tenant_id, l.account_id, je.entry_date;
END $$;
