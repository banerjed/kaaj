-- Ticketing: eight business areas with categories, members and custom
-- fields; tickets skewed toward IT and client support, numbered per area
-- with each area's counter left matching; updates, attachments, checklists,
-- assignees and subscribers around them. The search triggers fire normally.

CREATE TEMP TABLE _areas (n int, prefix text, name text, share numeric, depts text[]);
INSERT INTO _areas VALUES
 (1,'IT','IT Support',0.33,ARRAY['IT','IT-SUP','IT-SEC']),
 (2,'CS','Client Support',0.27,ARRAY['SALES-AM','DEL-QA']),
 (3,'FAC','Facilities',0.08,ARRAY['PPL-HR']),
 (4,'PPL','People Ops',0.10,ARRAY['PPL','PPL-HR','PPL-TA']),
 (5,'FIN','Finance Ops',0.08,ARRAY['FIN','FIN-AR','FIN-AP','FIN-FPA']),
 (6,'SEC','Security',0.05,ARRAY['IT-SEC']),
 (7,'ENG','Engineering Requests',0.07,ARRAY['DEL-ENG','DEL-CLOUD']),
 (8,'LEG','Legal',0.02,ARRAY['LEGAL']);

INSERT INTO ticketing_business_areas (id, tenant_id, prefix, name, description, settings, created_by)
SELECT _perf.u('area', n), _perf.tenant(), prefix, name, name || ' requests', '{}'::jsonb, 'perf-generator'
  FROM _areas;

INSERT INTO ticketing_categories (id, tenant_id, business_area_id, name, created_by)
SELECT _perf.u('category', a.n * 10 + c), _perf.tenant(), _perf.u('area', a.n),
       (CASE a.n
          WHEN 1 THEN ARRAY['Hardware','Software','Access','Network','Email']
          WHEN 2 THEN ARRAY['Question','Problem','Billing','Feature request','Outage']
          WHEN 3 THEN ARRAY['Desk & seating','Building','Catering','Parking','Repairs']
          WHEN 4 THEN ARRAY['Leave','Payroll query','Benefits','Onboarding','Policy']
          WHEN 5 THEN ARRAY['Invoices','Expenses','Payments','Purchase request','Budget']
          WHEN 6 THEN ARRAY['Phishing','Incident','Access review','Vulnerability','Policy exception']
          WHEN 7 THEN ARRAY['Environment','Pipeline','Code review','Tooling','Data request']
          ELSE ARRAY['Contract review','NDA','Compliance','Dispute','Advice'] END)[c],
       'perf-generator'
  FROM _areas a CROSS JOIN generate_series(1, 5) c;

INSERT INTO ticketing_subcategories (id, tenant_id, category_id, name, created_by)
SELECT _perf.u('subcategory', (a.n * 10 + c) * 10 + s), _perf.tenant(), _perf.u('category', a.n * 10 + c),
       (ARRAY['Urgent','Standard','Follow-up'])[s], 'perf-generator'
  FROM _areas a CROSS JOIN generate_series(1, 2) c CROSS JOIN generate_series(1, 3) s;

-- Members: the departments that work each area.
INSERT INTO ticketing_business_area_members (tenant_id, business_area_id, employee_id, added_by)
SELECT DISTINCT _perf.tenant(), _perf.u('area', a.n), e.id, 'perf-generator'
  FROM _areas a JOIN employees e ON e.department_code = ANY (a.depts)
 WHERE e.tenant_id = _perf.tenant() AND e.is_active;

INSERT INTO ticketing_business_area_group_grants (tenant_id, business_area_id, group_id, added_by)
SELECT _perf.tenant(), _perf.u('area', 7), _perf.u('group', 101), 'perf-generator';

-- Custom fields per area.
INSERT INTO custom_field_definitions (id, tenant_id, entity_type, business_area_id, category,
                                      field_key, label, data_type, options, is_required, display_order)
SELECT _perf.u('cfd', 100 + n), _perf.tenant(), 'ticket', _perf.u('area', area), category,
       field_key, label, data_type, options::jsonb, false, ord
  FROM (VALUES
    (1,1,'Device','asset_tag','Asset tag','text',NULL,1),
    (2,1,'Device','os','Operating system','select','[{"value":"macos","label":"macOS"},{"value":"windows","label":"Windows"},{"value":"linux","label":"Linux"}]',2),
    (3,1,'Approval','requires_manager_approval','Requires manager approval','boolean',NULL,1),
    (4,2,'General','account_tier','Account tier','select','[{"value":"standard","label":"Standard"},{"value":"premium","label":"Premium"},{"value":"enterprise","label":"Enterprise"}]',1),
    (5,2,'General','escalated','Escalated to account manager','boolean',NULL,2),
    (6,2,'Impact','users_affected','Users affected','number',NULL,1),
    (7,3,'General','location','Room / location','text',NULL,1),
    (8,4,'General','effective_date','Effective date','date',NULL,1),
    (9,5,'General','amount','Amount in question','money',NULL,1),
    (10,6,'General','severity_score','CVSS score','number',NULL,1),
    (11,7,'General','repository','Repository','text',NULL,1),
    (12,8,'General','counterparty','Counterparty','text',NULL,1)
  ) f(n, area, category, field_key, label, data_type, options, ord);

-- Tickets.
CREATE TEMP TABLE _tix AS
WITH cum AS (SELECT *, sum(share) OVER (ORDER BY n) AS upto FROM _areas),
     t AS (SELECT t, _perf.as_of() - floor(power(_perf.r('tix:age', t), 0.8) * 730)::int AS logged
             FROM generate_series(1, _perf.n(40000)) t)
SELECT t.t, t.logged,
       (SELECT c.n FROM cum c WHERE c.upto >= _perf.r('tix:area', t.t) * (SELECT sum(share) FROM _areas)
         ORDER BY c.n LIMIT 1) AS area
  FROM t;

CREATE TEMP TABLE _tixn AS
SELECT x.*, row_number() OVER (PARTITION BY x.area ORDER BY x.logged, x.t) AS seq,
       1 + floor(_perf.r('tix:cat', x.t) * 5)::int AS cat,
       (SELECT count(*)::int FROM employees WHERE tenant_id = _perf.tenant() AND is_active) AS staff
  FROM _tix x;

CREATE TEMP TABLE _active AS
SELECT row_number() OVER (ORDER BY id) AS i, id FROM employees
 WHERE tenant_id = _perf.tenant() AND is_active;

INSERT INTO ticketing_tickets (id, tenant_id, business_area_id, ticket_number, title, description,
                               category_id, subcategory_id, status, severity, request_type,
                               private, due_date, logged_at, updated_at, resolved_at, closed_at,
                               logger_employee_id, customer_id, last_updated_by,
                               external_summary, created_at, sla_due_at, first_response_at)
SELECT _perf.u('ticket', x.t), _perf.tenant(), _perf.u('area', x.area),
       a.prefix || '-' || lpad(x.seq::text, 5, '0'),
       _perf.pick(ARRAY['Cannot sign in','Laptop running slowly','Request for access','Invoice looks wrong',
                        'Report generation is slow','Need a new monitor','Question about leave balance',
                        'VPN keeps dropping','Please review this contract','Build pipeline failing'], 'tix:title', x.t)
         || ' (' || x.t || ')',
       '<p>' || _perf.pick(ARRAY['Started this morning.','Blocking the team.','Not urgent, when you can.',
                                 'Affects the whole office.','Customer escalated this.'], 'tix:desc', x.t) || '</p>',
       _perf.u('category', x.area * 10 + x.cat),
       CASE WHEN x.cat <= 2 AND _perf.r('tix:sub', x.t) < 0.5
            THEN _perf.u('subcategory', (x.area * 10 + x.cat) * 10 + _perf.ri('tix:subn', x.t, 1, 3)) END,
       s.status,
       _perf.pick(ARRAY['low','medium','medium','medium','high','urgent'], 'tix:sev', x.t),
       _perf.pick(ARRAY['support','support','support','bug_fix','feature_request'], 'tix:rt', x.t),
       _perf.r('tix:priv', x.t) < 0.05,
       x.logged + _perf.ri('tix:due', x.t, 2, 30),
       _perf.at(x.logged, 'tix:at', x.t),
       _perf.at(least(_perf.as_of(), x.logged + 3), 'tix:up', x.t),
       CASE WHEN s.status = 'closed' THEN _perf.at(least(_perf.as_of(), x.logged + _perf.ri('tix:res', x.t, 1, 20)), 'tix:r', x.t) END,
       CASE WHEN s.status = 'closed' THEN _perf.at(least(_perf.as_of(), x.logged + _perf.ri('tix:res', x.t, 1, 20)), 'tix:r', x.t) END,
       (SELECT ac.id FROM _active ac WHERE ac.i = 1 + (x.t * 13 % x.staff)),
       CASE WHEN x.area = 2 THEN _perf.u('customer', _perf.skew('tix:cust', x.t, _perf.n(3000), 2)) END,
       'perf-generator',
       CASE WHEN s.status = 'closed' THEN 'Resolved.' END,
       _perf.at(x.logged, 'tix:at', x.t),
       _perf.at(x.logged + 3, 'tix:sla', x.t),
       CASE WHEN s.status <> 'open' THEN _perf.at(x.logged, 'tix:fr', x.t) + interval '2 hours' END
  FROM _tixn x
  JOIN _areas a ON a.n = x.area
  CROSS JOIN LATERAL (
    SELECT CASE
      WHEN _perf.as_of() - x.logged > 45 THEN CASE WHEN _perf.r('tix:dup', x.t) < 0.03 THEN 'duplicate' ELSE 'closed' END
      ELSE _perf.pick(ARRAY['open','active','active','awaiting_response','suspended','closed'], 'tix:st', x.t) END AS status
  ) s;

UPDATE ticketing_business_areas b SET current_sequence = s.n
  FROM (SELECT business_area_id, count(*) AS n FROM ticketing_tickets
         WHERE tenant_id = _perf.tenant() GROUP BY 1) s
 WHERE b.id = s.business_area_id;

-- Updates: a handful per ticket, some internal.
INSERT INTO ticketing_updates (id, tenant_id, ticket_id, ticket_number, update_type,
                               author_employee_id, author_name, content_text, visibility, created_at)
SELECT _perf.u('update', x.t * 100 + k), _perf.tenant(), _perf.u('ticket', x.t),
       a.prefix || '-' || lpad(x.seq::text, 5, '0'), 'comment',
       ac.id, 'Staff member',
       _perf.pick(ARRAY['Looking into this now.','Can you share a screenshot?','Escalated to the second line.',
                        'A fix is being deployed tonight.','Confirmed resolved on our side.',
                        'Waiting on the vendor.','Reassigned to the right team.'], 'upd', x.t * 100 + k),
       CASE WHEN _perf.r('upd:vis', x.t * 100 + k) < 0.4 THEN 'internal' ELSE 'external' END,
       _perf.at(least(_perf.as_of(), x.logged + k), 'upd:at', x.t * 100 + k)
  FROM _tixn x
  JOIN _areas a ON a.n = x.area
  CROSS JOIN LATERAL generate_series(1, _perf.skew('upd:n', x.t, 12, 2)) k
  JOIN _active ac ON ac.i = 1 + ((x.t * 7 + k) % x.staff);

INSERT INTO ticketing_attachments (tenant_id, attachment_id, ticket_id, ticket_number, file_name,
                                   file_url, file_size_bytes, file_size, mime_type, storage_key,
                                   uploaded_by, uploaded_at)
SELECT _perf.tenant(), 'ATT-' || x.t, _perf.u('ticket', x.t),
       a.prefix || '-' || lpad(x.seq::text, 5, '0'),
       'screenshot-' || x.t || '.png', 'perf/attachments/' || x.t || '.png',
       _perf.ri('att:sz', x.t, 20000, 2000000), _perf.ri('att:sz', x.t, 20000, 2000000),
       'image/png', 'perf/attachments/' || x.t || '.png', 'perf-generator',
       _perf.at(x.logged, 'att:at', x.t)
  FROM _tixn x JOIN _areas a ON a.n = x.area
 WHERE _perf.r('att', x.t) < 0.5;

INSERT INTO ticketing_ticket_tasks (tenant_id, ticket_id, title, is_done, display_order, done_at, created_by)
SELECT _perf.tenant(), _perf.u('ticket', x.t),
       _perf.pick(ARRAY['Reproduce','Check logs','Contact user','Apply fix','Verify'], 'tt', x.t * 10 + k),
       _perf.r('tt:done', x.t * 10 + k) < 0.6, k,
       CASE WHEN _perf.r('tt:done', x.t * 10 + k) < 0.6 THEN _perf.at(least(_perf.as_of(), x.logged + k), 'tt:at', x.t) END,
       'perf-generator'
  FROM _tixn x CROSS JOIN LATERAL generate_series(1, _perf.skew('tt:n', x.t, 4, 2) - 1) k;

INSERT INTO ticketing_ticket_assignees (tenant_id, ticket_id, employee_id, added_by)
SELECT DISTINCT _perf.tenant(), _perf.u('ticket', x.t), ac.id, 'perf-generator'
  FROM _tixn x
  CROSS JOIN LATERAL generate_series(1, CASE WHEN _perf.r('as:two', x.t) < 0.2 THEN 2 ELSE 1 END) k
  JOIN _active ac ON ac.i = 1 + ((x.t * 17 + k * 101) % x.staff)
 WHERE _perf.r('as:none', x.t) > 0.1;

INSERT INTO ticketing_ticket_subscribers (tenant_id, ticket_id, employee_id, added_by)
SELECT _perf.tenant(), _perf.u('ticket', x.t), ac.id, 'perf-generator'
  FROM _tixn x JOIN _active ac ON ac.i = 1 + ((x.t * 29 + 3) % x.staff)
 WHERE _perf.r('sub', x.t) < 0.4
ON CONFLICT DO NOTHING;

-- Custom field values on most tickets.
INSERT INTO custom_field_values (tenant_id, field_definition_id, ticket_id, updated_by,
                                 value_text, value_number, value_money, value_date, value_boolean)
SELECT _perf.tenant(), d.id, t.id, 'perf-generator',
       CASE d.field_key
         WHEN 'asset_tag' THEN 'LT-' || lpad((abs(hashtext(t.id::text)) % 10000)::text, 4, '0')
         WHEN 'os' THEN _perf.pick(ARRAY['macos','windows','linux'], 'tcf', hashtext(t.id::text))
         WHEN 'account_tier' THEN _perf.pick(ARRAY['standard','premium','enterprise'], 'tcf', hashtext(t.id::text))
         WHEN 'location' THEN 'Floor ' || _perf.ri('tcf:fl', hashtext(t.id::text), 1, 12)
         WHEN 'repository' THEN 'brightline/' || _perf.pick(_perf.words(), 'tcf:r', hashtext(t.id::text))
         WHEN 'counterparty' THEN _perf.company(abs(hashtext(t.id::text)) % 3000)
       END,
       CASE WHEN d.field_key = 'users_affected' THEN _perf.ri('tcf:n', hashtext(t.id::text), 1, 500)::numeric(18,4)
            WHEN d.field_key = 'severity_score' THEN round(_perf.r('tcf:n', hashtext(t.id::text))::numeric * 10, 1)::numeric(18,4) END,
       CASE WHEN d.field_key = 'amount' THEN (_perf.ri('tcf:m', hashtext(t.id::text), 10, 50000))::numeric(15,2) END,
       CASE WHEN d.data_type = 'date' THEN t.logged_at::date + 14 END,
       CASE WHEN d.data_type = 'boolean' THEN _perf.r('tcf:b', hashtext(t.id::text || d.field_key)) < 0.3 END
  FROM ticketing_tickets t
  JOIN custom_field_definitions d ON d.business_area_id = t.business_area_id AND d.entity_type = 'ticket'
 WHERE t.tenant_id = _perf.tenant()
   AND _perf.r('tcf:has', hashtext(t.id::text || d.field_key)) < 0.7;

DROP TABLE _areas, _tix, _tixn, _active;
