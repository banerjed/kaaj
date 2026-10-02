-- DB-011 every accounting table has row-level security enabled and forced, with a tenant_isolation policy.
SELECT c.relname AS table_name,
       CASE WHEN NOT c.relrowsecurity THEN 'RLS not enabled'
            WHEN NOT c.relforcerowsecurity THEN 'RLS not forced'
            ELSE 'no tenant_isolation policy' END AS problem
  FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
 WHERE n.nspname = 'public' AND c.relkind = 'r'
   AND c.relname IN ('journal_entries','journal_entry_lines','invoices','invoice_lines','invoice_credits',
                     'bills','bill_lines','payments','payment_allocations','bank_transactions','bank_accounts',
                     'chart_of_accounts','gl_daily_balances','amortization_schedules','tax_rates','accounting_periods',
                     'bank_statement_imports','bank_reconciliation_rules')
   AND (NOT c.relrowsecurity OR NOT c.relforcerowsecurity
        OR NOT EXISTS (SELECT 1 FROM pg_policies p WHERE p.schemaname = 'public' AND p.tablename = c.relname AND p.policyname = 'tenant_isolation'))
