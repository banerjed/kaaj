-- A fingerprint of the generated data: two builds at the same scale and
-- as-of date must print the same line. Ciphertext and wall-clock columns are
-- left out (each envelope has a random IV; created timestamps are not).
SELECT md5(string_agg(h, '' ORDER BY t)) AS fingerprint FROM (
  SELECT 'employees' AS t, md5(string_agg(concat_ws('|', id, first_name, department_code, manager_id), ',' ORDER BY id)) AS h FROM employees
  UNION ALL SELECT 'deals', md5(string_agg(concat_ws('|', id, customer_id, stage_id, value_amount), ',' ORDER BY id)) FROM crm_deals
  UNION ALL SELECT 'tasks', md5(string_agg(concat_ws('|', id, status, assigned_to), ',' ORDER BY id)) FROM tasks
  UNION ALL SELECT 'time', md5(string_agg(concat_ws('|', entry_id, hours, task_id), ',' ORDER BY entry_id)) FROM time_tracking_entries
  UNION ALL SELECT 'tickets', md5(string_agg(concat_ws('|', ticket_number, status, category_id), ',' ORDER BY ticket_number)) FROM ticketing_tickets
  UNION ALL SELECT 'invoices', md5(string_agg(concat_ws('|', invoice_number, total, status), ',' ORDER BY invoice_number)) FROM invoices
  UNION ALL SELECT 'journal', md5(string_agg(concat_ws('|', entry_id, account_id, debit_amount, credit_amount, base_debit_amount), ',' ORDER BY id)) FROM journal_entry_lines
  UNION ALL SELECT 'cfv', md5(string_agg(concat_ws('|', field_definition_id, value_text, value_number, value_date, value_boolean), ',' ORDER BY field_definition_id, coalesce(project_id, task_id, company_id, deal_id, customer_contact_id, ticket_id))) FROM custom_field_values
) x;
