-- The audit trail, derived from what the earlier steps generated: each entry
-- is an event that really happened in this data — an invoice sent, a payment
-- recorded, a leave request decided — at its own time, by the person who
-- would have done it, with the closed set of actions audit.repo.ts allows.
-- `changes` carries string values only, as the app writes them.

CREATE TEMP TABLE _who AS
SELECT actor, employee_id, user_id FROM _perf.actors;

INSERT INTO audit_log (tenant_id, actor_user_id, actor_employee_id, action, entity_type, entity_id,
                       module, changes, occurred_at)
-- invoices: created, then sent
SELECT _perf.tenant(), w.user_id, w.employee_id, 'create', 'invoices', i.id, 'accounting',
       jsonb_build_object('total', jsonb_build_object('from', '', 'to', i.total::text)), i.created_at
  FROM invoices i, _who w WHERE i.tenant_id = _perf.tenant() AND w.actor = 'finance'
UNION ALL
SELECT _perf.tenant(), w.user_id, w.employee_id, 'send', 'invoices', i.id, 'accounting',
       jsonb_build_object('status', jsonb_build_object('from', 'draft', 'to', 'sent')), i.sent_at
  FROM invoices i, _who w
 WHERE i.tenant_id = _perf.tenant() AND w.actor = 'finance' AND i.sent_at IS NOT NULL
-- payments, credits and write-offs
UNION ALL
SELECT _perf.tenant(), w.user_id, w.employee_id, 'record_payment', 'payments', p.id, 'accounting',
       jsonb_build_object('amount', jsonb_build_object('from', '', 'to', p.amount::text)), p.created_at
  FROM payments p, _who w WHERE p.tenant_id = _perf.tenant() AND w.actor = 'finance'
UNION ALL
SELECT _perf.tenant(), w.user_id, w.employee_id,
       CASE c.credit_type WHEN 'credit_memo' THEN 'record_credit' ELSE 'record_writeoff' END,
       'invoice_credits', c.id, 'accounting',
       jsonb_build_object('amount', jsonb_build_object('from', '', 'to', c.amount::text)), c.created_at
  FROM invoice_credits c, _who w WHERE c.tenant_id = _perf.tenant() AND w.actor = 'finance'
-- bills approved
UNION ALL
SELECT _perf.tenant(), w.user_id, w.employee_id, 'approve', 'bills', b.id, 'accounting',
       jsonb_build_object('status', jsonb_build_object('from', 'draft', 'to', 'approved')), b.approved_at
  FROM bills b, _who w
 WHERE b.tenant_id = _perf.tenant() AND w.actor = 'finance' AND b.approved_at IS NOT NULL
-- periods closed
UNION ALL
SELECT _perf.tenant(), w.user_id, w.employee_id, 'close_period', 'accounting_periods', a.id, 'accounting',
       jsonb_build_object('status', jsonb_build_object('from', 'open', 'to', 'closed')), a.closed_at
  FROM accounting_periods a, _who w
 WHERE a.tenant_id = _perf.tenant() AND w.actor = 'finance' AND a.closed_at IS NOT NULL
-- leave decided by the approver
UNION ALL
SELECT _perf.tenant(), tu.user_id, r.approver_id,
       CASE r.status WHEN 'approved' THEN 'approve' ELSE 'deny' END, 'hr_time_off_requests', r.id, 'hr',
       jsonb_build_object('status', jsonb_build_object('from', 'pending', 'to', r.status)),
       coalesce(r.approved_at, r.denied_at)
  FROM hr_time_off_requests r
  JOIN tenant_users tu ON tu.employee_id = r.approver_id AND tu.tenant_id = r.tenant_id
 WHERE r.tenant_id = _perf.tenant() AND r.status IN ('approved', 'denied')
-- tickets raised
UNION ALL
SELECT _perf.tenant(), tu.user_id, t.logger_employee_id, 'create', 'ticketing_tickets', t.id, 'ticketing',
       jsonb_build_object('status', jsonb_build_object('from', '', 'to', 'open')), t.logged_at
  FROM ticketing_tickets t
  JOIN tenant_users tu ON tu.employee_id = t.logger_employee_id AND tu.tenant_id = t.tenant_id
 WHERE t.tenant_id = _perf.tenant()
-- payroll runs approved
UNION ALL
SELECT _perf.tenant(), w.user_id, w.employee_id, 'approve', 'payroll_runs', p.id, 'payroll',
       jsonb_build_object('status', jsonb_build_object('from', 'calculated', 'to', 'approved')), p.approved_at
  FROM payroll_runs p, _who w
 WHERE p.tenant_id = _perf.tenant() AND w.actor = 'finance' AND p.approved_at IS NOT NULL
-- people joining
UNION ALL
SELECT _perf.tenant(), w.user_id, w.employee_id, 'create', 'employees', e.id, 'hr',
       jsonb_build_object('employee_id', jsonb_build_object('from', '', 'to', e.employee_id)),
       e.start_date::timestamptz - interval '14 days'
  FROM employees e, _who w WHERE e.tenant_id = _perf.tenant() AND w.actor = 'hr';

DROP TABLE _who;
