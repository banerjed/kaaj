-- Accounting tables carried only tenant_isolation, so any tenant member could
-- read/write them via RLS even though the app already gates this to
-- finance_admin. These RESTRICTIVE policies close that gap without changing
-- tenant_isolation itself (still PERMISSIVE); docs/15-row-level-visibility.md
-- is corrected in the same commit.

-- ---------------------------------------------------------------------------
-- Who may read, and who may write
-- ---------------------------------------------------------------------------
-- Two predicates: auditor reads everything but writes nothing, which a single
-- FOR ALL policy can't express. Both fail closed on a malformed claim (L62,
-- see 20260902041935).

CREATE OR REPLACE FUNCTION app.reads_all_accounting()
RETURNS boolean
LANGUAGE plpgsql
STABLE
SET search_path TO ''
AS $function$
DECLARE claims jsonb;
BEGIN
    claims := nullif(current_setting('request.jwt.claims', true), '')::jsonb;
    RETURN coalesce(
        (claims #>> '{app_metadata,role}') IN ('owner', 'firm_admin')
        OR (claims #> '{app_metadata,functional_roles}') ?| ARRAY[
              'finance_admin', 'auditor'
           ],
        false);
EXCEPTION WHEN OTHERS THEN
    -- A malformed claim means "reads no accounting", never "reads all of it".
    RETURN false;
END $function$;

CREATE OR REPLACE FUNCTION app.writes_accounting()
RETURNS boolean
LANGUAGE plpgsql
STABLE
SET search_path TO ''
AS $function$
DECLARE claims jsonb;
BEGIN
    claims := nullif(current_setting('request.jwt.claims', true), '')::jsonb;
    RETURN coalesce(
        (claims #>> '{app_metadata,role}') IN ('owner', 'firm_admin')
        -- Deliberately NOT auditor: reads everything, writes nothing.
        OR (claims #> '{app_metadata,functional_roles}') ?| ARRAY[
              'finance_admin'
           ],
        false);
EXCEPTION WHEN OTHERS THEN
    RETURN false;
END $function$;

-- ---------------------------------------------------------------------------
-- The policies
-- ---------------------------------------------------------------------------
-- Generated from one template over a committed literal list — sixty
-- hand-written policies is sixty chances to drop AS RESTRICTIVE or WITH CHECK
-- (L63). A new accounting table must be added to the list by hand; `./check`
-- fails until it is.

DO $$
DECLARE
    t text;
    accounting_tables text[] := ARRAY[
        'accounting_periods',
        'bank_accounts',
        'bank_reconciliation_rules',
        'bank_transactions',
        'bill_lines',
        'bills',
        'chart_of_accounts',
        'expenses',
        'invoice_lines',
        'invoices',
        'journal_entries',
        'journal_entry_lines',
        'payment_allocations',
        'payments',
        'vendors'
    ];
BEGIN
    FOREACH t IN ARRAY accounting_tables LOOP
        -- (SELECT app.…()) rather than a bare call: evaluated once as an
        -- InitPlan, not once per row.
        EXECUTE format(
            'CREATE POLICY accounting_read ON public.%I AS RESTRICTIVE '
            'FOR SELECT TO public USING ((SELECT app.reads_all_accounting()))',
            t);

        EXECUTE format(
            'CREATE POLICY accounting_insert ON public.%I AS RESTRICTIVE '
            'FOR INSERT TO public WITH CHECK ((SELECT app.writes_accounting()))',
            t);

        EXECUTE format(
            'CREATE POLICY accounting_update ON public.%I AS RESTRICTIVE '
            'FOR UPDATE TO public USING ((SELECT app.writes_accounting())) '
            'WITH CHECK ((SELECT app.writes_accounting()))',
            t);

        EXECUTE format(
            'CREATE POLICY accounting_delete ON public.%I AS RESTRICTIVE '
            'FOR DELETE TO public USING ((SELECT app.writes_accounting()))',
            t);
    END LOOP;
END $$;
