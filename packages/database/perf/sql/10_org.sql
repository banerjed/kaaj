-- The firm: Brightline Consulting, a professional-services firm in four
-- countries. Offices, departments, titles and levels are bounded by the
-- organisation; employees are 1,000 active plus 60 who left, at scale 1.

INSERT INTO tenants (id, subdomain, company_name, legal_entity_name, region,
                     default_locale, supported_locales, default_currency,
                     supported_currencies, default_timezone, plan_tier,
                     max_employees, company_size, industry, is_active,
                     fiscal_year_start, created_by)
VALUES (_perf.tenant(), 'brightline-perf', 'Brightline Consulting',
        'Brightline Consulting Ltd', 'us-east-1', 'en-US',
        ARRAY['en-US','en-GB','en-IN','de-DE'], 'USD',
        ARRAY['USD','GBP','INR','EUR'], 'America/New_York', 'enterprise',
        5000, '501+', 'Professional services', true, '01-01', 'perf-generator');

-- Offices: code, name, city, country, zone, locale, currency, share of staff.
CREATE TEMP TABLE _offices (n int, code text, name text, city text, country text,
                            tz text, locale text, currency text, share numeric);
INSERT INTO _offices VALUES
 (1,'NYC','New York','New York','US','America/New_York','en-US','USD',0.10),
 (2,'SFO','San Francisco','San Francisco','US','America/Los_Angeles','en-US','USD',0.07),
 (3,'AUS','Austin','Austin','US','America/Chicago','en-US','USD',0.07),
 (4,'CHI','Chicago','Chicago','US','America/Chicago','en-US','USD',0.06),
 (5,'LON','London','London','GB','Europe/London','en-GB','GBP',0.10),
 (6,'MAN','Manchester','Manchester','GB','Europe/London','en-GB','GBP',0.05),
 (7,'BLR','Bengaluru','Bengaluru','IN','Asia/Kolkata','en-IN','INR',0.18),
 (8,'PNQ','Pune','Pune','IN','Asia/Kolkata','en-IN','INR',0.12),
 (9,'HYD','Hyderabad','Hyderabad','IN','Asia/Kolkata','en-IN','INR',0.10),
 (10,'BER','Berlin','Berlin','DE','Europe/Berlin','de-DE','EUR',0.07),
 (11,'MUC','Munich','Munich','DE','Europe/Berlin','de-DE','EUR',0.05),
 (12,'FRA','Frankfurt','Frankfurt','DE','Europe/Berlin','de-DE','EUR',0.03);

INSERT INTO firm_locations (id, tenant_id, name, city, country, timezone, locale,
                            currency, is_headquarters, is_active, location_code,
                            address_line1, postal_code, capacity)
SELECT _perf.u('location', n), _perf.tenant(), name, city, country, tz, locale,
       currency, code = 'NYC', true, code, n || ' Commerce Street',
       lpad((10000 + n * 137)::text, 5, '0'), 400
  FROM _offices;

-- Departments: six functions, each with sub-teams.
CREATE TEMP TABLE _depts (n int, code text, name text, parent text, share numeric);
INSERT INTO _depts VALUES
 (1,'EXEC','Executive',NULL,0.01),
 (2,'DEL','Delivery',NULL,0.02),
 (3,'DEL-ENG','Engineering','DEL',0.22),
 (4,'DEL-DATA','Data & Analytics','DEL',0.12),
 (5,'DEL-CLOUD','Cloud & Infrastructure','DEL',0.09),
 (6,'DEL-QA','Quality Assurance','DEL',0.06),
 (7,'DEL-DES','Design','DEL',0.05),
 (8,'DEL-PMO','Project Management','DEL',0.06),
 (9,'SALES','Sales',NULL,0.01),
 (10,'SALES-NA','Sales — North America','SALES',0.03),
 (11,'SALES-EU','Sales — Europe','SALES',0.02),
 (12,'SALES-APAC','Sales — APAC','SALES',0.02),
 (13,'SALES-AM','Account Management','SALES',0.03),
 (14,'MKT','Marketing',NULL,0.02),
 (15,'FIN','Finance',NULL,0.01),
 (16,'FIN-AR','Receivables','FIN',0.01),
 (17,'FIN-AP','Payables','FIN',0.01),
 (18,'FIN-FPA','Planning & Analysis','FIN',0.01),
 (19,'PPL','People',NULL,0.01),
 (20,'PPL-TA','Talent Acquisition','PPL',0.02),
 (21,'PPL-HR','HR Operations','PPL',0.01),
 (22,'IT','IT',NULL,0.01),
 (23,'IT-SUP','IT Support','IT',0.02),
 (24,'IT-SEC','Security','IT',0.01),
 (25,'LEGAL','Legal',NULL,0.01);

INSERT INTO firm_departments (id, tenant_id, name, code, department_code,
                              parent_department_code, cost_center, is_active,
                              description)
SELECT _perf.u('department', n), _perf.tenant(), name, code, code, parent,
       'CC-' || lpad(n::text, 3, '0'), true, name || ' department'
  FROM _depts;
UPDATE firm_departments d SET parent_department_id = p.id
  FROM firm_departments p
 WHERE d.tenant_id = _perf.tenant() AND p.tenant_id = d.tenant_id
   AND p.department_code = d.parent_department_code;

-- Job titles: one family per department, four levels each.
INSERT INTO firm_job_titles (id, tenant_id, title, description, is_exempt, is_active)
SELECT _perf.u('title', d.n * 10 + t), _perf.tenant(),
       d.name || ' ' || (ARRAY['Associate','Specialist','Lead','Manager'])[t],
       'Works in ' || d.name, t >= 3, true
  FROM _depts d CROSS JOIN generate_series(1, 4) t
 WHERE d.n NOT IN (1, 2, 9, 15, 19, 22);   -- function heads use the parent's family

INSERT INTO firm_job_levels (id, tenant_id, job_title_id, level_name, salary_ranges, sort_order)
SELECT _perf.u('level', jt.n * 10 + l), _perf.tenant(), _perf.u('title', jt.n), 'L' || l,
       jsonb_build_object('USD', jsonb_build_object('min', (60000 + l * 20000)::text,
                                                    'max', (90000 + l * 25000)::text)),
       l
  FROM (SELECT d.n * 10 + t AS n FROM _depts d CROSS JOIN generate_series(1, 4) t
         WHERE d.n NOT IN (1, 2, 9, 15, 19, 22)) jt
  CROSS JOIN generate_series(1, 2) l;

-- Employees. k = 1 is the CEO; the first tenth are managers. Leavers come last.
CREATE TEMP TABLE _emp AS
WITH params AS (SELECT _perf.n(1000) AS active, _perf.n(60, 0) AS leavers),
     staff AS (SELECT k, k > active AS left_firm, active
                 FROM params, generate_series(1, active + leavers) k),
     cum_office AS (SELECT *, sum(share) OVER (ORDER BY n) AS upto FROM _offices),
     cum_dept AS (SELECT *, sum(share) OVER (ORDER BY n) AS upto FROM _depts)
SELECT s.k, s.left_firm, s.active,
       (SELECT o.code FROM cum_office o
         WHERE o.upto >= _perf.r('emp:office', s.k) * (SELECT sum(share) FROM _offices)
         ORDER BY o.n LIMIT 1) AS office_code,
       CASE WHEN s.k = 1 THEN 'EXEC'
            ELSE (SELECT d.code FROM cum_dept d
                   WHERE d.upto >= _perf.r('emp:dept', s.k) * (SELECT sum(share) FROM _depts)
                   ORDER BY d.n LIMIT 1)
       END AS dept_code
  FROM staff s;

INSERT INTO employees (id, tenant_id, employee_id, employee_number, first_name, last_name,
                       email, phone, gender, timezone, employment_status, employment_type,
                       start_date, end_date, department_code, job_title, job_level,
                       manager_id, location_code, pay_frequency, compensation_type,
                       base_amount_pvt, currency, birth_date, is_active, created_by, fte)
SELECT _perf.u('employee', e.k), _perf.tenant(),
       'BL-' || _perf.pad(e.k, 5), _perf.pad(e.k, 6),
       _perf.pick(_perf.first_names(), 'emp:f', e.k),
       _perf.pick(_perf.last_names(), 'emp:l', e.k),
       lower(_perf.pick(_perf.first_names(), 'emp:f', e.k) || '.'
             || _perf.pick(_perf.last_names(), 'emp:l', e.k)) || e.k || '@brightline.example',
       '+1-555-' || lpad((e.k % 10000)::text, 4, '0'),
       _perf.pick(ARRAY['female','male','female','male','non_binary','prefer_not_to_say']::gender[], 'emp:g', e.k),
       o.tz,
       CASE WHEN e.left_firm THEN 'terminated'
            WHEN _perf.r('emp:leave', e.k) < 0.02 THEN 'on_leave'
            ELSE 'active' END::employment_status,
       CASE WHEN _perf.r('emp:type', e.k) < 0.9 THEN 'full_time'
            WHEN _perf.r('emp:type', e.k) < 0.95 THEN 'contractor' ELSE 'part_time' END,
       _perf.as_of() - (60 + floor(power(_perf.r('emp:start', e.k), 1.6) * 2900))::int,
       CASE WHEN e.left_firm THEN _perf.as_of() - _perf.ri('emp:end', e.k, 10, 700) END,
       d.code,
       d.name || ' ' || CASE WHEN e.k <= e.active / 10 THEN 'Manager'
                                    ELSE _perf.pick(ARRAY['Associate','Specialist','Lead'], 'emp:t', e.k) END,
       'L' || _perf.ri('emp:lvl', e.k, 1, 2),
       CASE WHEN e.k = 1 THEN NULL
            WHEN e.k <= e.active / 10 THEN _perf.u('employee', _perf.ri('emp:mgr', e.k, 1, greatest(1, e.k / 5)))
            ELSE _perf.u('employee', _perf.skew('emp:mgr', e.k, greatest(1, e.active / 10), 1.6)) END,
       o.code,
       CASE WHEN o.country = 'US' THEN 'bi-weekly' ELSE 'monthly' END::pay_frequency,
       'salary',
       round((CASE o.currency WHEN 'USD' THEN 85000 WHEN 'GBP' THEN 55000
                                       WHEN 'EUR' THEN 62000 ELSE 1800000 END)
             * (0.7 + _perf.r('emp:pay', e.k)::numeric * 1.2), 2),
       o.currency,
       date '1965-01-01' + _perf.ri('emp:dob', e.k, 0, 14000),
       NOT e.left_firm, 'perf-generator', 1.00
  FROM _emp e
  JOIN _offices o ON o.code = e.office_code
  JOIN _depts d ON d.code = e.dept_code;

UPDATE firm_departments d SET head_employee_id = h.id
  FROM (SELECT DISTINCT ON (department_code) department_code, id
          FROM employees WHERE tenant_id = _perf.tenant() AND is_active
         ORDER BY department_code, employee_id) h
 WHERE d.tenant_id = _perf.tenant() AND d.department_code = h.department_code;

-- Logins: every current employee has one. Actors (the measured users) are
-- given roles in 15_actors.sql; everyone here starts as a plain employee.
INSERT INTO tenant_users (id, tenant_id, user_id, employee_id, role, is_active,
                          is_default_tenant, accepted_at, last_active_at)
SELECT _perf.u('tenant_user', e.k), _perf.tenant(), _perf.u('user', e.k),
       _perf.u('employee', e.k), CASE WHEN e.k = 1 THEN 'owner' ELSE 'employee' END,
       NOT e.left_firm, true, _perf.as_of() - 400,
       _perf.as_of() - make_interval(hours => _perf.ri('tu:last', e.k, 1, 500))
  FROM _emp e;

-- Groups: one per department, plus project teams and affinity groups.
INSERT INTO employee_user_groups (id, tenant_id, group_name, display_name, description,
                                  group_type, department_code, is_active, created_by)
SELECT _perf.u('group', n), _perf.tenant(), 'dept-' || lower(code), name,
       'Everyone in ' || name, 'department'::group_type, code, true, 'perf-generator'
  FROM _depts
UNION ALL
SELECT _perf.u('group', 100 + g), _perf.tenant(), 'team-' || g,
       _perf.pick(_perf.words(), 'grp', g) || ' team', 'A delivery team',
       'team'::group_type, NULL, true, 'perf-generator'
  FROM generate_series(1, 10) g
UNION ALL
SELECT _perf.u('group', 200 + g), _perf.tenant(), 'affinity-' || g,
       (ARRAY['Women in Tech','Parents','Pride','Veterans','Wellbeing'])[g],
       'An employee network', 'affinity'::group_type, NULL, true, 'perf-generator'
  FROM generate_series(1, 5) g;

INSERT INTO employee_group_members (tenant_id, group_id, employee_id, role, joined_at, joined_by)
SELECT _perf.tenant(), _perf.u('group', d.n), e.id, 'member', e.start_date::timestamptz,
       'perf-generator'
  FROM employees e JOIN _depts d ON d.code = e.department_code
 WHERE e.tenant_id = _perf.tenant() AND e.is_active
UNION ALL
SELECT _perf.tenant(),
       _perf.u('group', CASE WHEN g <= 10 THEN 100 + g ELSE 190 + g END), e.id, 'member',
       e.start_date::timestamptz, 'perf-generator'
  FROM employees e CROSS JOIN generate_series(1, 15) g
 WHERE e.tenant_id = _perf.tenant() AND e.is_active
   AND _perf.r('grp:m' || g, hashtext(e.id::text)) < CASE WHEN g <= 10 THEN 0.08 ELSE 0.05 END;

DROP TABLE _offices, _depts, _emp;
