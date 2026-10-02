-- DB-003 every monetary column on an accounting table is NUMERIC, never a float.
SELECT table_name, column_name, data_type
  FROM information_schema.columns
 WHERE table_schema = 'public'
   AND table_name IN ('journal_entries','journal_entry_lines','invoices','invoice_lines','invoice_credits',
                      'bills','bill_lines','payments','payment_allocations','bank_transactions',
                      'bank_accounts','chart_of_accounts','gl_daily_balances','amortization_schedules','tax_rates','exchange_rates')
   AND (column_name ~ '(amount|total|balance|subtotal|rate|price|debit|credit)' )
   AND data_type IN ('real', 'double precision')
