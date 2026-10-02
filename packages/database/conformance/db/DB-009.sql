-- DB-009 required uniqueness per tenant: invoice number, bill number per vendor, journal entry number, payment number.
SELECT missing AS problem FROM (VALUES
  ('invoices (tenant_id, invoice_number)',  EXISTS (SELECT 1 FROM pg_indexes WHERE schemaname='public' AND tablename='invoices' AND indexdef ILIKE 'CREATE UNIQUE%' AND indexdef ILIKE '%tenant_id%' AND indexdef ILIKE '%invoice_number%')),
  ('bills (tenant_id, vendor_id, bill_number)', EXISTS (SELECT 1 FROM pg_indexes WHERE schemaname='public' AND tablename='bills' AND indexdef ILIKE 'CREATE UNIQUE%' AND indexdef ILIKE '%bill_number%')),
  ('journal_entries (tenant_id, entry_number)', EXISTS (SELECT 1 FROM pg_indexes WHERE schemaname='public' AND tablename='journal_entries' AND indexdef ILIKE 'CREATE UNIQUE%' AND indexdef ILIKE '%entry_number%')),
  ('payments (tenant_id, payment_number)',  EXISTS (SELECT 1 FROM pg_indexes WHERE schemaname='public' AND tablename='payments' AND indexdef ILIKE 'CREATE UNIQUE%' AND indexdef ILIKE '%payment_number%'))
) v(missing, present) WHERE NOT present
