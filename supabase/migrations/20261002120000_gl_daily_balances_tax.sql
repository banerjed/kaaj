-- gl_daily_balances by tax rate too, with native amounts, so the tax
-- liability summary reads days instead of every tax line (it grouped by
-- tax_rate_id over native credit/debit amounts and was the one ledger report
-- still at 100-260ms in the perf tenant, docs/32-perf-tenant.md).
--
-- A row is now (tenant, account, day, tax rate). Every other report sums an
-- account's rows across rates, so their figures are unchanged; the tax rate
-- is NULL on most lines, and NULLs compare equal in the key.
--
-- The recompute is unchanged in shape — same keys, same triggers, same lock
-- per tenant — except that it now replaces a (tenant, account, day)'s rows
-- outright: delete, then insert one row per rate still present, so a rate
-- that left the day takes its row with it.

ALTER TABLE gl_daily_balances
    ADD COLUMN tax_rate_id UUID REFERENCES tax_rates(id),
    ADD COLUMN debit  NUMERIC(15,2) NOT NULL DEFAULT 0,
    ADD COLUMN credit NUMERIC(15,2) NOT NULL DEFAULT 0;
ALTER TABLE gl_daily_balances ALTER COLUMN debit DROP DEFAULT;
ALTER TABLE gl_daily_balances ALTER COLUMN credit DROP DEFAULT;

ALTER TABLE gl_daily_balances DROP CONSTRAINT gl_daily_balances_pkey;
ALTER TABLE gl_daily_balances
    ADD CONSTRAINT gl_daily_balances_key
    UNIQUE NULLS NOT DISTINCT (tenant_id, account_id, balance_date, tax_rate_id);


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

    DELETE FROM public.gl_daily_balances b
     USING (SELECT DISTINCT t, a, d FROM unnest(p_tenant, p_account, p_day) AS u(t, a, d)) k
     WHERE b.tenant_id = k.t AND b.account_id = k.a AND b.balance_date = k.d;

    INSERT INTO public.gl_daily_balances
           (tenant_id, account_id, balance_date, tax_rate_id,
            base_debit, base_credit, debit, credit, line_count)
    SELECT k.t, k.a, k.d, l.tax_rate_id,
           coalesce(sum(l.base_debit_amount), 0),
           coalesce(sum(l.base_credit_amount), 0),
           coalesce(sum(l.debit_amount), 0),
           coalesce(sum(l.credit_amount), 0),
           count(l.id)
      FROM (SELECT DISTINCT t, a, d FROM unnest(p_tenant, p_account, p_day) AS u(t, a, d)
             WHERE t IS NOT NULL AND a IS NOT NULL AND d IS NOT NULL) k
      JOIN public.journal_entries je
        ON je.tenant_id = k.t AND je.entry_date = k.d AND je.status = 'posted'
      JOIN public.journal_entry_lines l
        ON l.entry_id = je.id AND l.account_id = k.a
     GROUP BY k.t, k.a, k.d, l.tax_rate_id;
END $$;


DO $$
BEGIN
    DELETE FROM gl_daily_balances;
    INSERT INTO gl_daily_balances
           (tenant_id, account_id, balance_date, tax_rate_id,
            base_debit, base_credit, debit, credit, line_count)
    SELECT je.tenant_id, l.account_id, je.entry_date, l.tax_rate_id,
           coalesce(sum(l.base_debit_amount), 0),
           coalesce(sum(l.base_credit_amount), 0),
           coalesce(sum(l.debit_amount), 0),
           coalesce(sum(l.credit_amount), 0),
           count(*)
      FROM journal_entry_lines l
      JOIN journal_entries je ON je.id = l.entry_id AND je.status = 'posted'
     GROUP BY je.tenant_id, l.account_id, je.entry_date, l.tax_rate_id;
END $$;
