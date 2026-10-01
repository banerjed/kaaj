-- The people measured (docs/32-perf-tenant.md "Who is measured"): real
-- employees of the firm given the roles that decide what they can see.
-- Owner-only timings miss the slowest paths — a plain employee pays for every
-- row policy the owner short-circuits — so each kind of user is here.
--
-- _perf.actors records who they are, for the measurement step to sign in as.

CREATE TABLE IF NOT EXISTS _perf.actors (
    actor        text PRIMARY KEY,
    employee_id  uuid NOT NULL,
    user_id      uuid NOT NULL,
    email        text NOT NULL,
    why          text NOT NULL
);
TRUNCATE _perf.actors;

WITH reports AS (
    SELECT manager_id, count(*) AS n FROM employees
     WHERE tenant_id = _perf.tenant() AND is_active AND manager_id IS NOT NULL
     GROUP BY manager_id),
-- Within a department family (FIN, PPL, IT, SALES, DEL), the n-th most
-- recent hire who manages nobody — so no actor's view is widened by reports,
-- and at a small scale an empty sub-team never leaves an actor out.
fam AS (
    SELECT e.id, split_part(e.department_code, '-', 1) AS family,
           row_number() OVER (PARTITION BY split_part(e.department_code, '-', 1)
                              ORDER BY e.employee_id DESC) AS rk
      FROM employees e
     WHERE e.tenant_id = _perf.tenant() AND e.is_active AND e.employee_id <> 'BL-00001'
       AND NOT EXISTS (SELECT 1 FROM reports r WHERE r.manager_id = e.id))
INSERT INTO _perf.actors (actor, employee_id, user_id, email, why)
SELECT a.actor, a.employee_id, tu.user_id, 'perf.' || a.actor || '@brightline.example', a.why
  FROM (
    SELECT 'owner' AS actor, _perf.u('employee', 1) AS employee_id,
           'the fast path, as a baseline' AS why
    UNION ALL SELECT 'finance', (SELECT id FROM fam WHERE family = 'FIN' AND rk = 1),
           'accounting at volume'
    UNION ALL SELECT 'hr', (SELECT id FROM fam WHERE family = 'PPL' AND rk = 1),
           'employees, attendance and time off'
    UNION ALL SELECT 'it', (SELECT id FROM fam WHERE family = 'IT' AND rk = 1),
           'reads every ticket by role'
    UNION ALL SELECT 'auditor', (SELECT id FROM fam WHERE family = 'FIN' AND rk = 2),
           'reads everything, writes nothing'
    UNION ALL SELECT 'sales', (SELECT id FROM fam WHERE family = 'SALES' AND rk = 1),
           'CRM at volume'
    UNION ALL SELECT 'manager', (SELECT manager_id FROM reports WHERE manager_id <> _perf.u('employee', 1)
                                  ORDER BY n DESC, manager_id LIMIT 1),
           'the line manager with the most reports'
    UNION ALL SELECT 'employee', (SELECT id FROM fam WHERE family = 'DEL' AND rk = 1),
           'a plain employee, who pays for every row policy'
  ) a
  JOIN tenant_users tu ON tu.employee_id = a.employee_id AND tu.tenant_id = _perf.tenant()
 WHERE a.employee_id IS NOT NULL;

UPDATE tenant_users tu SET functional_roles = r.roles
  FROM (SELECT a.employee_id, CASE a.actor
                 WHEN 'finance' THEN ARRAY['finance_admin']
                 WHEN 'hr'      THEN ARRAY['hr_admin']
                 WHEN 'it'      THEN ARRAY['it_admin']
                 WHEN 'auditor' THEN ARRAY['auditor']
                 WHEN 'sales'   THEN ARRAY['sales_admin']
                 ELSE '{}'::text[] END AS roles
          FROM _perf.actors a) r
 WHERE tu.tenant_id = _perf.tenant() AND tu.employee_id = r.employee_id;
