-- The tables a page lists that the earlier steps left empty — objectives,
-- billing schedules, compensation, HR records, payroll and firm config — so
-- that measuring and the row-limit check see those pages full rather than
-- empty. An empty table renders an empty page, and an empty page is an
-- unmeasured page.

CREATE TEMP TABLE _pool AS
SELECT (SELECT array_agg(id ORDER BY id) FROM employees
         WHERE tenant_id = _perf.tenant() AND employment_status = 'active') AS employed,
       (SELECT array_agg(id ORDER BY id) FROM customers WHERE tenant_id = _perf.tenant()) AS customers,
       (SELECT array_agg(department_code ORDER BY department_code) FROM firm_departments
         WHERE tenant_id = _perf.tenant()) AS departments;

-- Objectives: about one per twelve projects, most projects linked to one.
INSERT INTO pm_objectives (id, tenant_id, objective_id, objective_number, objective_name, description,
                           objective_type, customer_id, department_code, owner_employee_id,
                           start_date, target_end_date, fiscal_year, quarter, status,
                           target_revenue, currency, created_by, created_at)
SELECT _perf.u('objective', n), _perf.tenant(), 'OBJ-' || _perf.pad(n, 3), 'OBJ-' || _perf.pad(n, 3),
       initcap(_perf.pick(ARRAY['grow','launch','modernise','expand','retain','streamline'], 'obj:v', n)) || ' '
         || _perf.pick(_perf.words(), 'obj:w1', n) || ' ' || _perf.pick(_perf.words(), 'obj:w2', n),
       'Objective ' || n || ' for the planning cycle.',
       t.type,
       CASE WHEN t.type = 'client' THEN _perf.pick(pl.customers, 'obj:c', n) END,
       _perf.pick(pl.departments, 'obj:d', n),
       _perf.pick(pl.employed, 'obj:o', n),
       s.start, s.start + 365, extract(year FROM s.start)::text,
       'Q' || extract(quarter FROM s.start)::int,
       CASE WHEN s.start + 365 < _perf.as_of() THEN 'completed'
            ELSE _perf.pick(ARRAY['planning','active','active','active','on_hold'], 'obj:s', n) END,
       (_perf.ri('obj:rev', n, 50, 5000) * 1000)::numeric(18,4), 'USD', 'perf-generator',
       _perf.at(s.start, 'obj:at', n)
  FROM _pool pl,
       generate_series(1, _perf.n(125)) n,
       LATERAL (SELECT _perf.pick(ARRAY['client','department','service_line','initiative','internal','revenue','general'],
                                  'obj:t', n) AS type) t,
       LATERAL (SELECT _perf.as_of() - _perf.ri('obj:start', n, 30, 700) AS start) s;

UPDATE projects p SET objective_id = _perf.u('objective', 1 + (abs(hashtext(p.id::text)) % _perf.n(125)))
 WHERE p.tenant_id = _perf.tenant() AND abs(hashtext(p.id::text || 'obj')) % 10 < 7;

-- Rollups, as objectives.repo.ts refreshRollup computes them.
ANALYZE projects;
ANALYZE pm_objectives;
UPDATE pm_objectives o
   SET progress_percentage = CASE WHEN r.total = 0 THEN 0 ELSE round(100.0 * r.completed / r.total, 4) END,
       health_status = CASE WHEN r.total > 0 AND r.off_track > 0 THEN 'off_track'
                            WHEN r.total > 0 AND r.at_risk::numeric / r.total > 0.3 THEN 'at_risk'
                            ELSE 'on_track' END,
       actual_revenue = r.revenue
  FROM (SELECT o2.id,
               count(p.id)::int AS total,
               count(p.id) FILTER (WHERE p.status = 'completed')::int AS completed,
               count(p.id) FILTER (WHERE p.health_status = 'off_track')::int AS off_track,
               count(p.id) FILTER (WHERE p.health_status = 'at_risk')::int AS at_risk,
               coalesce(sum(p.total_billed), 0) AS revenue
          FROM pm_objectives o2
          LEFT JOIN projects p ON p.objective_id = o2.id AND p.archived_at IS NULL
         WHERE o2.tenant_id = _perf.tenant()
         GROUP BY o2.id) r
 WHERE o.id = r.id;

-- Recurring invoices: retainers for about one active client in seven.
INSERT INTO recurring_schedules (id, tenant_id, customer_id, frequency, next_run_date, anchor_day,
                                 due_in_days, exchange_rate, payment_terms, notes, template_lines,
                                 is_active, created_at)
SELECT _perf.u('recurring', c.rn), _perf.tenant(), c.id, f.freq,
       (date_trunc('month', _perf.as_of()) + interval '1 month')::date + (f.anchor - 1),
       f.anchor, _perf.pick(ARRAY[15, 30, 30, 45], 'rec:due', c.rn), 1.0,
       _perf.pick(ARRAY['net_15','net_30','net_30','net_45'], 'rec:terms', c.rn),
       'Retainer per the signed SOW.',
       jsonb_build_array(jsonb_build_object(
         'description', _perf.pick(ARRAY['Support retainer','Managed service','Advisory retainer','Licence and support'], 'rec:d', c.rn),
         'quantity', '1.00',
         'unitPrice', (_perf.ri('rec:p', c.rn, 10, 200) * 100)::text || '.00',
         'discountPercent', '0.00',
         'taxAmount', '0.00')),
       _perf.r('rec:active', c.rn) < 0.9,
       _perf.at(_perf.as_of() - _perf.ri('rec:at', c.rn, 30, 700), 'rec:at', c.rn)
  FROM (SELECT id, row_number() OVER (ORDER BY id) AS rn
          FROM customers
         WHERE tenant_id = _perf.tenant() AND is_active
           AND abs(hashtext(id::text || 'rec')) % 7 = 0) c,
       LATERAL (SELECT _perf.pick(ARRAY['monthly','monthly','monthly','quarterly','annually'], 'rec:f', c.rn) AS freq,
                       _perf.pick(ARRAY[1, 1, 1, 15, 28], 'rec:a', c.rn) AS anchor) f;

-- Deferred revenue and prepaid expenses being released monthly.
INSERT INTO amortization_schedules (id, tenant_id, kind, balance_sheet_account_id,
                                    income_statement_account_id, total_amount, periods_total,
                                    next_run_date, anchor_day, description, reference, created_at)
SELECT _perf.u('amort', n), _perf.tenant(), k.kind,
       CASE k.kind WHEN 'deferred_revenue' THEN _perf.u('coa', 2300) ELSE _perf.u('coa', 1150) END,
       CASE k.kind WHEN 'deferred_revenue' THEN _perf.u('coa', 4000) ELSE _perf.u('coa', 5300) END,
       (_perf.ri('am:amt', n, 12, 600) * 100)::numeric(15,2),
       _perf.pick(ARRAY[3, 6, 12, 12, 12, 24, 36], 'am:p', n),
       (date_trunc('month', _perf.as_of()) + interval '1 month')::date,
       1,
       CASE k.kind WHEN 'deferred_revenue'
            THEN 'Annual support contract ' || n
            ELSE _perf.pick(ARRAY['Annual software licence','Insurance premium','Office lease deposit','Conference sponsorship'], 'am:d', n) || ' ' || n END,
       upper(left(k.kind, 4)) || '-' || _perf.pad(n, 4),
       _perf.at(_perf.as_of() - _perf.ri('am:at', n, 10, 400), 'am:at', n)
  FROM generate_series(1, _perf.n(150)) n,
       LATERAL (SELECT CASE WHEN _perf.r('am:k', n) < 0.6 THEN 'deferred_revenue' ELSE 'prepaid_expense' END AS kind) k;

-- Everyone's employment record, for the steps below.
CREATE TEMP TABLE _emp AS
SELECT e.id, row_number() OVER (ORDER BY e.employee_id) AS n, e.start_date, e.end_date,
       e.employment_type::employment_type AS employment_type, e.employment_status,
       e.compensation_type::compensation_type AS compensation_type, e.pay_frequency,
       e.base_amount_pvt AS amount, e.currency, coalesce(e.fte, 1) AS fte, e.department_code,
       l.country, l.timezone, l.location_code,
       -- The last annual review, for whoever was hired before it and still here after it.
       CASE WHEN e.start_date < rd.d - 60 AND (e.end_date IS NULL OR e.end_date > rd.d)
            THEN rd.d END AS review
  FROM employees e
  JOIN firm_locations l ON l.tenant_id = e.tenant_id AND l.location_code = e.location_code,
       LATERAL (SELECT make_date(extract(year FROM _perf.as_of() - 300)::int, 1, 1) AS d) rd
 WHERE e.tenant_id = _perf.tenant();

-- Pay history: a hire figure, then the current one from the last review. The
-- current row's amount is the employee's base_amount_pvt, which caches it.
INSERT INTO compensation_base (id, tenant_id, employee_id, effective_from, effective_to,
                               compensation_type, amount, currency, pay_frequency,
                               annual_equivalent, overtime_eligible, change_reason, created_at)
SELECT _perf.u('comp:hire', e.n), _perf.tenant(), e.id, e.start_date,
       CASE WHEN r.review IS NOT NULL THEN r.review - 1 ELSE e.end_date END,
       e.compensation_type,
       CASE WHEN r.review IS NOT NULL THEN round(e.amount * 0.95, 2) ELSE e.amount END,
       e.currency, e.pay_frequency,
       CASE WHEN r.review IS NOT NULL THEN round(e.amount * 0.95, 2) ELSE e.amount END,
       e.country <> 'US' OR e.amount < 100000, 'new_hire', e.start_date::timestamptz
  FROM _emp e,
       LATERAL (SELECT e.review) r
UNION ALL
SELECT _perf.u('comp:review', e.n), _perf.tenant(), e.id, r.review, e.end_date, e.compensation_type,
       e.amount, e.currency, e.pay_frequency, e.amount,
       e.country <> 'US' OR e.amount < 100000,
       _perf.pick(ARRAY['annual_review','annual_review','merit_increase','promotion','market_adjustment']::change_reason[], 'comp:why', e.n),
       r.review::timestamptz
  FROM _emp e,
       LATERAL (SELECT e.review) r
 WHERE r.review IS NOT NULL;

-- India's house-rent and transport allowances; a phone allowance for some
-- elsewhere.
INSERT INTO compensation_allowances (id, tenant_id, employee_id, allowance_type, allowance_name,
                                     effective_from, effective_to, amount, currency, frequency,
                                     is_taxable, status, allowance_id)
SELECT _perf.u('allow:' || a.kind, e.n), _perf.tenant(), e.id, a.kind::allowance_type, a.name,
       e.start_date, e.end_date, a.amount, e.currency, 'monthly', a.taxable,
       CASE WHEN e.end_date IS NULL THEN 'active' ELSE 'ended' END,
       'ALW-' || _perf.pad(e.n, 5) || '-' || upper(left(a.kind, 3))
  FROM _emp e,
       LATERAL (VALUES ('housing', 'House Rent Allowance', round(e.amount * 0.4 / 12, 2), true),
                       ('transportation', 'Transport Allowance', 3200.00, false)) a(kind, name, amount, taxable)
 WHERE e.country = 'IN'
UNION ALL
SELECT _perf.u('allow:phone', e.n), _perf.tenant(), e.id, 'phone', 'Phone allowance',
       e.start_date, e.end_date,
       CASE e.currency WHEN 'GBP' THEN 30 WHEN 'EUR' THEN 35 ELSE 50 END, e.currency, 'monthly', true,
       CASE WHEN e.end_date IS NULL THEN 'active' ELSE 'ended' END,
       'ALW-' || _perf.pad(e.n, 5) || '-PHO'
  FROM _emp e
 WHERE e.country <> 'IN' AND _perf.r('allow:phone', e.n) < 0.3;

-- Commission for sales, an annual bonus for a share of everyone else.
INSERT INTO compensation_variable (id, tenant_id, employee_id, component_type, comp_type, component_name,
                                   comp_name, effective_from, effective_to, target_amount, currency,
                                   payment_frequency, frequency, commission_structure, quota_structure,
                                   status, variable_comp_id)
SELECT _perf.u('variable', e.n), _perf.tenant(), e.id, v.kind::variable_comp_type, v.kind, v.name, v.name,
       make_date(extract(year FROM _perf.as_of())::int, 1, 1), e.end_date,
       round(e.amount * v.share, 2), e.currency, v.freq, v.freq,
       '{"tiers": [{"threshold_pct": 80, "payout_pct": 50}, {"threshold_pct": 100, "payout_pct": 100}, {"threshold_pct": 120, "payout_pct": 150}]}'::jsonb,
       jsonb_build_object('annual_quota', (round(e.amount * v.share * 8))::text, 'currency', e.currency),
       CASE WHEN e.end_date IS NULL THEN 'active' ELSE 'ended' END,
       'VAR-' || _perf.pad(e.n, 5)
  FROM _emp e,
       LATERAL (SELECT CASE WHEN e.department_code LIKE 'SALES%' THEN 'commission' ELSE 'performance_bonus' END AS kind,
                       CASE WHEN e.department_code LIKE 'SALES%' THEN 'Sales Commission' ELSE 'Annual Performance Bonus' END AS name,
                       CASE WHEN e.department_code LIKE 'SALES%' THEN 0.3 ELSE 0.1 END AS share,
                       CASE WHEN e.department_code LIKE 'SALES%' THEN 'quarterly' ELSE 'annual' END AS freq) v
 WHERE e.department_code LIKE 'SALES%' OR _perf.r('variable', e.n) < 0.25;

INSERT INTO compensation_work_schedules (id, tenant_id, employee_id, schedule_name, schedule_type,
                                         effective_from, effective_to, standard_hours_per_week, timezone,
                                         time_tracking_required, weekly_schedule, is_active, schedule_id)
SELECT _perf.u('schedule', e.n), _perf.tenant(), e.id,
       CASE WHEN e.employment_type = 'part_time' THEN 'Part-time flexible'
            ELSE 'Standard ' || e.location_code END,
       CASE WHEN e.employment_type = 'part_time' THEN 'flexible'
            ELSE _perf.pick(ARRAY['standard','standard','hybrid','remote']::work_arrangement[], 'sched:t', e.n) END,
       e.start_date, e.end_date, round(40 * e.fte, 2), e.timezone,
       CASE WHEN e.department_code LIKE 'DEL%' THEN 'hours_only' ELSE 'none' END::time_tracking_type,
       '{"monday": {"start": "09:00", "end": "17:30"}, "friday": {"start": "09:00", "end": "16:00"}}'::jsonb,
       e.end_date IS NULL, 'SCH-' || _perf.pad(e.n, 5)
  FROM _emp e;

-- One pay schedule per country, covering its offices.
INSERT INTO payroll_pay_schedules (id, tenant_id, name, name_i18n, frequency, anchor_date, timezone,
                                   currency, location_ids, pay_day_of_month, pay_day_of_week,
                                   is_active, is_default, description)
SELECT _perf.u('payschedule', c.n), _perf.tenant(), c.name, jsonb_build_object('en-US', c.name),
       c.freq, date_trunc('month', _perf.as_of())::date - 1, c.tz, c.currency,
       (SELECT array_agg(id ORDER BY location_code) FROM firm_locations
         WHERE tenant_id = _perf.tenant() AND country = c.country),
       CASE WHEN c.freq = 'monthly' THEN c.dom END,
       CASE WHEN c.freq = 'bi-weekly' THEN 'friday' END,
       true, c.country = 'US', c.name
  FROM (VALUES (1, 'US', 'US Bi-weekly Payroll', 'bi-weekly', 'America/New_York', 'USD', NULL::int),
               (2, 'GB', 'UK Monthly Payroll', 'monthly', 'Europe/London', 'GBP', 28),
               (3, 'IN', 'India Monthly Payroll', 'monthly', 'Asia/Kolkata', 'INR', -1),
               (4, 'DE', 'Germany Monthly Payroll', 'monthly', 'Europe/Berlin', 'EUR', -1))
       c(n, country, name, freq, tz, currency, dom);

-- Overtime and rounding per office; money-like thresholds stay strings (L41).
INSERT INTO firm_payroll_policies (id, tenant_id, location_id, overtime_rules, time_rounding,
                                   workweek_start_day, require_time_tracking, is_active)
SELECT _perf.u('paypolicy', l.n), _perf.tenant(), l.id,
       CASE l.country WHEN 'US'
            THEN '{"daily_threshold_hours": "8", "weekly_threshold_hours": "40", "multiplier": "1.5", "double_time_after_hours": "12"}'
            ELSE '{"weekly_threshold_hours": "48", "multiplier": "1.25"}' END::jsonb,
       'nearest_15', CASE l.country WHEN 'US' THEN 0 ELSE 1 END, l.country = 'US', true
  FROM (SELECT id, country, row_number() OVER (ORDER BY location_code) AS n
          FROM firm_locations WHERE tenant_id = _perf.tenant()) l;

-- Public holidays per office, for each year the data spans and the next.
INSERT INTO firm_holidays (id, tenant_id, holiday_id, location_id, location_code, name, name_i18n, date,
                           is_recurring, is_paid, is_mandatory)
SELECT _perf.u('holiday', l.n * 10000 + y.y * 100 + h.k), _perf.tenant(),
       l.location_code || '-' || y.y || '-' || h.k, l.id, l.location_code, h.name,
       jsonb_build_object('en-US', h.name), make_date(y.y, h.m, h.d), true, true, true
  FROM (SELECT id, location_code, country, row_number() OVER (ORDER BY location_code) AS n
          FROM firm_locations WHERE tenant_id = _perf.tenant()) l
  CROSS JOIN generate_series(extract(year FROM _perf.as_of())::int - 2,
                             extract(year FROM _perf.as_of())::int + 1) y(y)
  JOIN (VALUES ('US', 1, 'New Year''s Day', 1, 1), ('US', 2, 'Memorial Day', 5, 26),
               ('US', 3, 'Independence Day', 7, 4), ('US', 4, 'Labor Day', 9, 1),
               ('US', 5, 'Thanksgiving', 11, 27), ('US', 6, 'Christmas Day', 12, 25),
               ('GB', 1, 'New Year''s Day', 1, 1), ('GB', 2, 'Good Friday', 4, 3),
               ('GB', 3, 'Early May Bank Holiday', 5, 4), ('GB', 4, 'Spring Bank Holiday', 5, 25),
               ('GB', 5, 'Summer Bank Holiday', 8, 31), ('GB', 6, 'Christmas Day', 12, 25),
               ('GB', 7, 'Boxing Day', 12, 26),
               ('IN', 1, 'Republic Day', 1, 26), ('IN', 2, 'Holi', 3, 14), ('IN', 3, 'Independence Day', 8, 15),
               ('IN', 4, 'Gandhi Jayanti', 10, 2), ('IN', 5, 'Diwali', 10, 20), ('IN', 6, 'Christmas Day', 12, 25),
               ('DE', 1, 'Neujahr', 1, 1), ('DE', 2, 'Karfreitag', 4, 3), ('DE', 3, 'Tag der Arbeit', 5, 1),
               ('DE', 4, 'Tag der Deutschen Einheit', 10, 3), ('DE', 5, 'Erster Weihnachtstag', 12, 25),
               ('DE', 6, 'Zweiter Weihnachtstag', 12, 26))
       h(country, k, name, m, d) ON h.country = l.country;

-- Benefits: a package per country, each with its items. Costs are strings (L41).
INSERT INTO firm_benefits_packages (id, tenant_id, name, name_i18n, description, eligibility_rules, is_active)
SELECT _perf.u('benefits', p.n), _perf.tenant(), p.name, jsonb_build_object('en-US', p.name),
       'Medical, retirement and wellbeing for permanent staff in ' || p.country || '.',
       jsonb_build_object('countries', jsonb_build_array(p.country), 'min_fte', '0.5'), true
  FROM (VALUES (1, 'US', 'US Staff Package'), (2, 'GB', 'UK Staff Package'),
               (3, 'IN', 'India Staff Package'), (4, 'DE', 'Germany Staff Package')) p(n, country, name);

INSERT INTO firm_benefit_items (tenant_id, id, benefits_package_id, benefit_type, benefit_name, benefit_name_i18n,
                                carrier_name, carrier_varies_by_location, costs_by_currency, plan_details, is_active)
SELECT _perf.tenant(), _perf.u('benefit-item', p.n * 10 + i.k), _perf.u('benefits', p.n), i.type, i.name,
       jsonb_build_object('en-US', i.name), i.carrier, false,
       jsonb_build_object(p.currency, jsonb_build_object('employee', i.emp, 'employer', i.er)),
       '{"deductible": "1500.00", "out_of_pocket_max": "6000.00"}'::jsonb, true
  FROM (VALUES (1, 'USD'), (2, 'GBP'), (3, 'INR'), (4, 'EUR')) p(n, currency),
       (VALUES (1, 'medical', 'Medical cover', 'Aetna', '220.00', '540.00'),
               (2, 'dental', 'Dental cover', 'Delta Dental', '18.00', '42.00'),
               (3, 'retirement', 'Retirement plan', 'Fidelity', '0.00', '300.00'),
               (4, 'life', 'Life assurance', 'MetLife', '0.00', '25.00'),
               (5, 'wellness', 'Wellbeing allowance', 'Headspace', '0.00', '15.00')) i(k, type, name, carrier, emp, er);

-- Bank-feed rules: categorise the recurring payees.
INSERT INTO bank_reconciliation_rules (id, tenant_id, bank_account_id, rule_name, is_active, description_contains,
                                       amount_tolerance, transaction_type, action_type, category_account_id,
                                       auto_match, create_transaction, priority, times_applied)
SELECT _perf.u('bankrule', n), _perf.tenant(), _perf.u('bank', 1 + (n - 1) % 12),
       'Categorise ' || r.payee, true, r.payee, 5.00, 'debit', 'categorize', _perf.u('coa', r.code::int),
       true, true, n * 10, _perf.ri('rule:applied', n, 0, 200)
  FROM generate_series(1, _perf.n(30)) n,
       LATERAL (SELECT _perf.pick(ARRAY['JetBrains','GitHub','Slack','Zoom','Atlassian','AWS','Google Workspace',
                                         'WeWork','Uber','Delta Air','Marriott','Stripe fee'], 'rule:p', n) AS payee) p,
       LATERAL (SELECT p.payee,
                       CASE WHEN p.payee IN ('WeWork') THEN '5400'
                            WHEN p.payee IN ('Uber','Delta Air','Marriott') THEN '5200'
                            WHEN p.payee = 'Stripe fee' THEN '5600'
                            ELSE '5300' END AS code) r;

-- Project templates, top-level tasks only (templates.repo.ts TemplateTask).
INSERT INTO pm_project_templates (id, tenant_id, template_id, name, description, category, template_data,
                                  is_public, use_count, estimated_duration_days, estimated_hours,
                                  estimated_budget, created_by)
SELECT _perf.u('template', n), _perf.tenant(), 'TPL-' || _perf.pad(n, 3), t.name, t.name || ', in phases.',
       t.category,
       jsonb_build_object('tasks', (
         SELECT jsonb_agg(jsonb_build_object('task_name', ph, 'description', NULL, 'priority', 'medium',
                                             'estimated_hours', (40 * k)::text, 'due_offset_days', 10 * k)
                          ORDER BY k)
           FROM unnest(ARRAY['Discovery','Design','Build','Test','Handover']) WITH ORDINALITY u(ph, k))),
       false, _perf.ri('tpl:use', n, 0, 40), 75, 600, (_perf.ri('tpl:b', n, 50, 300) * 1000)::numeric(18,4),
       'perf-generator'
  FROM generate_series(1, 10) n,
       LATERAL (SELECT _perf.pick(ARRAY['Standard client delivery','Data migration','ERP integration','Mobile app build',
                                         'Cloud migration','Security review','Analytics platform','Support onboarding'],
                                  'tpl:n', n) || ' ' || n AS name,
                       _perf.pick(ARRAY['consulting','engineering','data','support'], 'tpl:c', n) AS category) t;

-- Related tickets linked in pairs, the lower id first as the app writes them.
INSERT INTO ticketing_ticket_links (tenant_id, ticket_id, linked_ticket_id, created_by)
SELECT DISTINCT _perf.tenant(), least(a, b), greatest(a, b), 'perf-generator'
  FROM (SELECT _perf.u('ticket', 1 + _perf.ri('link:a', n, 0, _perf.n(40000) - 1)) AS a,
               _perf.u('ticket', 1 + _perf.ri('link:b', n, 0, _perf.n(40000) - 1)) AS b
          FROM generate_series(1, _perf.n(3000)) n) x
 WHERE a <> b;

-- Folder shares: some folders shared with a colleague or a role.
INSERT INTO document_folder_shares (id, tenant_id, folder_id, shared_with_employee_id, shared_with_role,
                                    permission, granted_by, granted_at)
SELECT DISTINCT ON (f.id, s.who) _perf.u('share', f.n * 10 + s.k), _perf.tenant(), f.id,
       CASE WHEN s.k = 1 THEN _perf.pick(pl.employed, 'share:e', f.n) END,
       CASE WHEN s.k = 2 THEN _perf.pick(ARRAY['it_admin','hr_admin','finance_admin'], 'share:r', f.n) END,
       _perf.pick(ARRAY['view','view','edit'], 'share:p', f.n * 10 + s.k), f.owner_employee_id,
       f.created_at + interval '1 day'
  FROM _pool pl,
       (SELECT id, owner_employee_id, created_at, row_number() OVER (ORDER BY id) AS n
          FROM document_folders WHERE tenant_id = _perf.tenant() AND owner_employee_id IS NOT NULL) f,
       LATERAL (SELECT k, k::text AS who FROM generate_series(1, 2) k) s
 WHERE _perf.r('share', f.n * 10 + s.k) < 0.3;

-- Billing rates per delivery employee, the current and the previous year's.
INSERT INTO time_tracking_hourly_rates (id, tenant_id, employee_id, cost_rate, billable_rate, currency,
                                        effective_from, effective_to, change_reason, is_active)
SELECT _perf.u('rate:' || y.k, e.n), _perf.tenant(), e.id,
       round(r.cost * y.f, 4), round(r.bill * y.f, 4), e.currency, y.from_, y.to_, y.why, y.to_ IS NULL
  FROM _emp e,
       LATERAL (SELECT _perf.ri('rate:c', e.n, 40, 120)::numeric AS cost,
                       _perf.ri('rate:b', e.n, 120, 280)::numeric AS bill) r,
       LATERAL (VALUES (1, make_date(extract(year FROM _perf.as_of())::int - 1, 1, 1),
                           make_date(extract(year FROM _perf.as_of())::int - 1, 12, 31), 0.95, 'initial_rate_card'),
                       (2, make_date(extract(year FROM _perf.as_of())::int, 1, 1), NULL::date, 1.0, 'annual_rate_increase'))
               y(k, from_, to_, f, why)
 WHERE e.department_code LIKE 'DEL%' AND e.end_date IS NULL;

INSERT INTO tenant_settings (tenant_id, namespace, key, value) VALUES
  (_perf.tenant(), 'accounting', 'fiscal_year_start', '{"month": 1, "day": 1}'),
  (_perf.tenant(), 'expenses', 'approval_threshold', '{"amount": "5000", "currency": "USD"}'),
  (_perf.tenant(), 'ticketing', 'default_sla_hours', '{"standard": 24, "urgent": 4}'),
  (_perf.tenant(), 'payroll', 'approval_required', 'true');

-- The gateway's secret key is sealed by seal.mjs, like every _ct column.
INSERT INTO payment_gateway_settings (tenant_id, secret_key_last4, is_live_mode, verified_at)
VALUES (_perf.tenant(), '4242', false, _perf.as_of() - 90);

DROP TABLE _pool, _emp;
