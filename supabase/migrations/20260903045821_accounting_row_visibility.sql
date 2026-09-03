-- Accounting is no longer readable by everyone in the tenant.
--
-- Fifteen accounting tables carried `tenant_isolation` and nothing else, so
-- every authenticated member of a firm — an employee, a contractor, an
-- it_admin — could read every invoice, payment, bank account and journal entry
-- the firm holds, and write them, if any query path reached those tables. The
-- application already refuses: `accounting.read` and `accounting.write` are
-- granted to `finance_admin` alone (packages/authz), and the routes call
-- `requireCan`. RLS was not saying the same thing.
--
-- That gap is the shape CLAUDE.md § Security describes: protection applied per
-- MECHANISM (a `can()` on an action) while disclosure happens per VALUE. One
-- missed guard on a new endpoint, one join from an unguarded page, one
-- repository helper reused in a different context, and the database says yes.
--
-- `docs/15-row-level-visibility.md` previously listed these as "Tier 3 —
-- tenant-only, and should stay that way", on the reasoning that they are
-- "business records that everyone in a function reads". That reasoning does
-- not hold: a plain employee is not in the finance function, and the
-- permission bundles already say so. The document is corrected in the same
-- commit.
--
-- WHAT THIS DOES NOT CHANGE: tenant isolation. `tenant_isolation` is
-- PERMISSIVE and stays exactly as it was. These policies are RESTRICTIVE, so
-- they AND with it rather than offering an alternative route to the row
-- (L63) — which is also why every modifier is spelled out on every statement
-- below rather than left to a default.

-- ---------------------------------------------------------------------------
-- Who may read, and who may write
-- ---------------------------------------------------------------------------
-- Two predicates, not one, because `auditor` reads everything and writes
-- nothing — that bundle exists to be safe to grant, and a single `FOR ALL`
-- policy would either lock auditors out of reading or let them write.
--
-- Both fail CLOSED on a malformed claim, and both are plpgsql with an
-- EXCEPTION handler for the reason in 20260902041935: a `::jsonb` cast that
-- raises inside a policy expression is a 500 rather than an empty page, and
-- whether it raises at all depends on the query plan. `verify-invariants.sql`
-- calls every `app.*` claim parser with `not-json` and fails if any raises.

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
-- Generated from one template over a committed literal list, deliberately.
-- Sixty hand-written policies is sixty chances to drop an `AS RESTRICTIVE` or
-- a `WITH CHECK`, which is exactly the omission L63 records — and that one
-- produced a 12-row cross-tenant leak only `./check` caught. One template
-- applied fifteen times can be read once and verified once.
--
-- The list is a committed literal, like every other register here: a new
-- accounting table has to be added by hand, and `./check` fails until it is.
--
-- SELECT, INSERT, UPDATE and DELETE are separate policies because Postgres
-- takes `USING` for read paths and `WITH CHECK` for write paths, and a
-- `FOR ALL` policy cannot express "auditor may read but not write".

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
        -- `(SELECT app.…())` rather than a bare call: the subquery is an
        -- InitPlan, evaluated once per statement instead of once per row.
        -- docs/15 measures the difference; it is why this is affordable.
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
