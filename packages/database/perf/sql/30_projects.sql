-- Projects, tasks, comments and time: the delivery side of the firm. Big
-- customers get more projects and some projects are huge; delivery staff log
-- one or two entries every working day of their employment, against three
-- "home" projects, in weekly timesheets. Denormalised counters are
-- recomputed from the rows at the end (L58), never incremented.

CREATE TEMP TABLE _pm AS
SELECT row_number() OVER (ORDER BY id) AS i, id
  FROM employees
 WHERE tenant_id = _perf.tenant() AND is_active
   AND department_code IN ('DEL-PMO', 'DEL', 'DEL-ENG', 'DEL-DATA');
CREATE TEMP TABLE _pm_n AS SELECT count(*)::int AS n FROM _pm;

CREATE TEMP TABLE _clients AS
SELECT row_number() OVER (ORDER BY customer_number) AS i, id, currency,
       default_hourly_rate AS rate
  FROM customers
 WHERE tenant_id = _perf.tenant() AND relationship_status IN ('active', 'inactive', 'churned');
CREATE TEMP TABLE _clients_n AS SELECT count(*)::int AS n FROM _clients;

-- Projects, with their task counts decided up front so children can be
-- spread across them (never one parent, L86).
CREATE TEMP TABLE _proj AS
SELECT p,
       _perf.u('project', p) AS id,
       _perf.r('proj:client', p) < 0.85 AS client_project,
       _perf.skew('proj:c', p, (SELECT n FROM _clients_n), 2) AS ci,
       _perf.as_of() - _perf.ri('proj:start', p, 0, 760) AS started,
       4 + _perf.skew('proj:tasks', p, 200, 5) AS ntasks
  FROM generate_series(1, _perf.n(1500)) p;

INSERT INTO projects (id, tenant_id, project_id, project_number, project_name, description,
                      project_type, customer_id, project_manager_id, department_code,
                      start_date, target_end_date, actual_start_date, actual_end_date,
                      status, priority, health_status, budget_type, budget, estimated_hours,
                      currency, billing_method, hourly_rate, is_billable, created_by,
                      is_restricted, last_activity_at, created_at)
SELECT p.id, _perf.tenant(), 'PRJ-' || lpad(p.p::text, 5, '0'), 'PRJ-' || lpad(p.p::text, 5, '0'),
       CASE WHEN p.client_project
            THEN _perf.pick(ARRAY['Platform modernisation','Data warehouse','Mobile app','ERP rollout',
                                  'Security programme','Cloud migration','Analytics','Support retainer'], 'proj:n', p.p)
                 || ' ' || p.p
            ELSE 'Internal: ' || _perf.pick(ARRAY['Tooling','Training','Hiring drive','Office move',
                                                  'Knowledge base'], 'proj:in', p.p) || ' ' || p.p END,
       'Delivery project ' || p.p,
       CASE WHEN p.client_project THEN 'client_project' ELSE 'internal' END::project_type,
       CASE WHEN p.client_project THEN c.id END,
       (SELECT pm.id FROM _pm pm, _pm_n n WHERE pm.i = 1 + (p.p % greatest(n.n, 1))),
       _perf.pick(ARRAY['DEL-ENG','DEL-DATA','DEL-CLOUD','DEL-DES'], 'proj:dept', p.p),
       p.started, p.started + _perf.ri('proj:len', p.p, 60, 400),
       p.started,
       CASE WHEN p.started + _perf.ri('proj:len', p.p, 60, 400) < _perf.as_of() - 30
                 AND _perf.r('proj:done', p.p) < 0.8
            THEN p.started + _perf.ri('proj:len', p.p, 60, 400) END,
       CASE WHEN p.started > _perf.as_of() - 20 THEN _perf.pick(ARRAY['draft','planning'], 'proj:st', p.p)
            WHEN p.started + _perf.ri('proj:len', p.p, 60, 400) < _perf.as_of() - 30
                 AND _perf.r('proj:done', p.p) < 0.8 THEN 'completed'
            WHEN _perf.r('proj:hold', p.p) < 0.06 THEN 'on_hold'
            WHEN _perf.r('proj:hold', p.p) < 0.08 THEN 'cancelled'
            ELSE 'active' END,
       _perf.pick(ARRAY['low','medium','medium','high','urgent'], 'proj:pri', p.p),
       _perf.pick(ARRAY['on_track','on_track','on_track','at_risk','off_track'], 'proj:h', p.p),
       _perf.pick(ARRAY['time_and_materials','fixed_price','retainer','not_to_exceed']::budget_type[], 'proj:bt', p.p),
       (p.ntasks * _perf.ri('proj:bud', p.p, 2, 9) * 1000)::numeric(15,2),
       (p.ntasks * _perf.ri('proj:est', p.p, 8, 40))::numeric(18,4),
       coalesce(c.currency, 'USD'),
       _perf.pick(ARRAY['hourly','fixed','retainer','milestone']::billing_method[], 'proj:bm', p.p),
       coalesce(c.rate, 120)::numeric(18,4),
       p.client_project, 'perf-generator',
       _perf.r('proj:restricted', p.p) < 0.05,
       _perf.at(least(_perf.as_of(), p.started + 30), 'proj:la', p.p),
       p.started::timestamptz
  FROM _proj p
  LEFT JOIN _clients c ON c.i = p.ci AND p.client_project;

-- A restricted project is visible through a team's grant.
INSERT INTO project_group_grants (tenant_id, project_id, group_id, added_by)
SELECT _perf.tenant(), p.id, _perf.u('group', 100 + _perf.ri('grant', p.p, 1, 10)), 'perf-generator'
  FROM _proj p JOIN projects pr ON pr.id = p.id
 WHERE pr.is_restricted;

-- Tasks. Task 1 of every project is top level; about a tenth of the rest
-- are subtasks of task 1. Status follows the project's.
INSERT INTO tasks (id, tenant_id, task_id, task_number, project_id, parent_task_id, task_name,
                   position, depth_level, task_type, status, priority, assigned_to,
                   start_date, due_date, completed_date, estimated_hours, is_billable,
                   board_column, board_position, created_by, completed_at, created_at)
SELECT _perf.u('task', p.p * 1000 + j), _perf.tenant(),
       'T-' || p.p || '-' || j, 'T-' || p.p || '-' || j, p.id,
       CASE WHEN j > 1 AND _perf.r('task:sub', p.p * 1000 + j) < 0.1 THEN _perf.u('task', p.p * 1000 + 1) END,
       _perf.pick(ARRAY['Requirements workshop','Design review','Build API','Write tests','Data mapping',
                        'Deploy to staging','User acceptance','Fix defects','Documentation','Performance tuning',
                        'Stakeholder update','Migration dry run'], 'task:n', p.p * 1000 + j) || ' #' || j,
       j,
       CASE WHEN j > 1 AND _perf.r('task:sub', p.p * 1000 + j) < 0.1 THEN 1 ELSE 0 END,
       _perf.pick(ARRAY['task','task','task','feature','bug','deliverable','review']::task_type[], 'task:t', p.p * 1000 + j),
       s.status,
       _perf.pick(ARRAY['low','medium','medium','high','urgent'], 'task:pri', p.p * 1000 + j),
       (SELECT pm.id::text FROM _pm pm, _pm_n n WHERE pm.i = 1 + ((p.p * 31 + j) % greatest(n.n, 1))),
       p.started + (j % 60), p.started + (j % 60) + _perf.ri('task:len', p.p * 1000 + j, 3, 30),
       CASE WHEN s.status = 'done' THEN least(_perf.as_of(), p.started + (j % 60) + 10) END,
       _perf.ri('task:est', p.p * 1000 + j, 2, 40)::numeric(18,4),
       p.client_project, s.status, j, 'perf-generator',
       CASE WHEN s.status = 'done' THEN least(_perf.as_of(), p.started + (j % 60) + 10)::timestamptz END,
       p.started::timestamptz
  FROM _proj p
  JOIN projects pr ON pr.id = p.id
  CROSS JOIN LATERAL generate_series(1, p.ntasks) j
  CROSS JOIN LATERAL (
    SELECT CASE
      WHEN pr.status = 'completed' THEN 'done'
      WHEN pr.status IN ('draft', 'planning') THEN 'todo'
      ELSE _perf.pick(ARRAY['todo','in_progress','in_progress','review','blocked','done','done','done'],
                      'task:st', p.p * 1000 + j) END AS status
  ) s;

-- Comments on about half the tasks.
INSERT INTO pm_task_comments (tenant_id, comment_id, task_id, project_id, comment_text,
                              author_type, author_employee_id, is_internal, created_at)
SELECT _perf.tenant(), 'TC-' || p.p || '-' || j || '-' || k,
       _perf.u('task', p.p * 1000 + j), p.id,
       _perf.pick(ARRAY['Looks good to me.','Blocked on the client''s test data.','Pushed a fix, please re-test.',
                        'Can we move this to next sprint?','Estimate revised after the workshop.'], 'cm', p.p * 100000 + j * 10 + k),
       'employee',
       (SELECT pm.id FROM _pm pm, _pm_n n WHERE pm.i = 1 + ((p.p * 7 + j + k) % greatest(n.n, 1))),
       _perf.r('cm:int', p.p * 100000 + j * 10 + k) < 0.3,
       _perf.at(least(_perf.as_of(), p.started + (j % 60) + k), 'cm:at', p.p * 100000 + j * 10 + k)
  FROM _proj p
  CROSS JOIN LATERAL generate_series(1, p.ntasks) j
  CROSS JOIN LATERAL generate_series(1, _perf.skew('cm:n', p.p * 1000 + j, 4, 3) - 1) k;

-- Time. Delivery staff, every working day they were employed in the last two
-- years, against one of three home projects.
CREATE TEMP TABLE _billable AS
SELECT row_number() OVER (ORDER BY e.id) AS b, e.id, e.start_date, e.end_date, e.currency
  FROM employees e
 WHERE e.tenant_id = _perf.tenant() AND e.department_code LIKE 'DEL-%';

CREATE TEMP TABLE _home AS
SELECT b.b, h, _perf.ri('home', b.b * 10 + h, 1, (SELECT count(*)::int FROM _proj)) AS p
  FROM _billable b CROSS JOIN generate_series(1, 3) h;

CREATE TEMP TABLE _work AS
SELECT b.b, b.id AS employee_id, d::date AS day, k,
       CASE WHEN _perf.skew('te:n', b.b * 100000 + (d::date - date '2000-01-01'), 2, 1) = 2 THEN 2 ELSE 1 END AS per_day
  FROM _billable b
  CROSS JOIN LATERAL generate_series(greatest(b.start_date, _perf.as_of() - 730),
                                     least(coalesce(b.end_date, _perf.as_of()), _perf.as_of()),
                                     interval '1 day') d
  CROSS JOIN LATERAL generate_series(1, 2) k
 WHERE extract(isodow FROM d) < 6;
DELETE FROM _work WHERE k > per_day;

INSERT INTO time_tracking_timesheets (id, tenant_id, timesheet_number, employee_id, period_type,
                                      period_start, period_end, status, submitted_at, approved_at)
SELECT DISTINCT ON (w.b, date_trunc('week', w.day))
       _perf.u('timesheet', w.b * 1000 + (w.day - date '2000-01-03') / 7), _perf.tenant(),
       'TS-' || w.b || '-' || to_char(date_trunc('week', w.day), 'IYYY-IW'),
       w.employee_id, 'weekly',
       to_char(date_trunc('week', w.day), 'YYYY-MM-DD'),
       to_char(date_trunc('week', w.day) + interval '6 days', 'YYYY-MM-DD'),
       CASE WHEN w.day > _perf.as_of() - 7 THEN 'draft'
            WHEN w.day > _perf.as_of() - 14 THEN 'submitted' ELSE 'approved' END,
       CASE WHEN w.day <= _perf.as_of() - 7 THEN (date_trunc('week', w.day) + interval '5 days') END,
       CASE WHEN w.day <= _perf.as_of() - 14 THEN (date_trunc('week', w.day) + interval '8 days') END
  FROM _work w
 ORDER BY w.b, date_trunc('week', w.day), w.day;

INSERT INTO time_tracking_entries (id, tenant_id, entry_id, employee_id, timesheet_id, project_id,
                                   task_id, customer_id, entry_date, hours, duration_minutes,
                                   entry_type, description, is_billable, hourly_rate,
                                   billable_amount, amount, currency, status, submitted_at,
                                   approved_at, created_by, created_at)
SELECT _perf.u('time', x.seq), _perf.tenant(), 'TE-' || lpad(x.seq::text, 7, '0'),
       x.employee_id,
       _perf.u('timesheet', x.b * 1000 + (x.day - date '2000-01-03') / 7),
       pr.id, _perf.u('task', x.p * 1000 + 1 + floor(_perf.r('te:task', x.seq) * pj.ntasks)::int),
       pr.customer_id, x.day, x.hours, (x.hours * 60)::int, 'timer',
       _perf.pick(ARRAY['Development','Code review','Client meeting','Testing','Design','Analysis'], 'te:d', x.seq),
       pr.is_billable, pr.hourly_rate,
       CASE WHEN pr.is_billable THEN round(x.hours * pr.hourly_rate, 2) END,
       CASE WHEN pr.is_billable THEN round(x.hours * pr.hourly_rate, 2) END,
       pr.currency,
       CASE WHEN x.day > _perf.as_of() - 7 THEN 'draft'
            WHEN x.day > _perf.as_of() - 14 THEN 'submitted'
            WHEN _perf.r('te:rej', x.seq) < 0.02 THEN 'rejected' ELSE 'approved' END,
       CASE WHEN x.day <= _perf.as_of() - 7 THEN _perf.at(x.day + 4, 'te:sub', x.seq) END,
       CASE WHEN x.day <= _perf.as_of() - 14 THEN _perf.at(x.day + 8, 'te:app', x.seq) END,
       'perf-generator', _perf.at(x.day, 'te:at', x.seq)
  FROM (SELECT w.*, h.p,
               row_number() OVER (ORDER BY w.b, w.day, w.k) AS seq,
               CASE WHEN w.per_day = 1 THEN 7.5 ELSE 3.75 END::numeric(18,4) AS hours
          FROM _work w
          JOIN _home h ON h.b = w.b AND h.h = _perf.ri('te:home', w.b * 100000 + (w.day - date '2000-01-01') * 2 + w.k, 1, 3)) x
  JOIN _proj pj ON pj.p = x.p
  JOIN projects pr ON pr.id = pj.id;

-- Counters, recomputed from the rows (L58).
UPDATE tasks t SET actual_hours = s.total, billable_hours = s.billable,
                   non_billable_hours = s.total - s.billable
  FROM (SELECT task_id, sum(hours) AS total,
               sum(hours) FILTER (WHERE is_billable) AS billable
          FROM time_tracking_entries
         WHERE tenant_id = _perf.tenant() AND status <> 'rejected'
         GROUP BY task_id) s
 WHERE t.id = s.task_id;
UPDATE tasks SET billable_hours = coalesce(billable_hours, 0),
                 non_billable_hours = coalesce(non_billable_hours, 0)
 WHERE tenant_id = _perf.tenant() AND (billable_hours IS NULL OR non_billable_hours IS NULL);

UPDATE projects p SET
       actual_hours = coalesce(h.total, 0),
       actual_cost = coalesce(h.cost, 0),
       task_count = c.total,
       completed_task_count = c.done,
       progress_percentage = round(100.0 * c.done / greatest(c.total, 1), 2)
  FROM (SELECT project_id, count(*) AS total, count(*) FILTER (WHERE status = 'done') AS done
          FROM tasks WHERE tenant_id = _perf.tenant() GROUP BY project_id) c
  LEFT JOIN (SELECT project_id, sum(hours) AS total, sum(amount) AS cost
               FROM time_tracking_entries
              WHERE tenant_id = _perf.tenant() AND status <> 'rejected'
              GROUP BY project_id) h ON h.project_id = c.project_id
 WHERE p.id = c.project_id;

UPDATE time_tracking_timesheets ts SET
       total_hours = s.total, billable_hours = s.billable,
       non_billable_hours = s.total - s.billable, total_amount = s.amount,
       entry_count = s.n
  FROM (SELECT timesheet_id, sum(hours) AS total,
               coalesce(sum(hours) FILTER (WHERE is_billable), 0) AS billable,
               coalesce(sum(amount), 0) AS amount, count(*) AS n
          FROM time_tracking_entries WHERE tenant_id = _perf.tenant()
         GROUP BY timesheet_id) s
 WHERE ts.id = s.timesheet_id;

DROP TABLE _pm, _pm_n, _clients, _clients_n, _proj, _billable, _home, _work;
