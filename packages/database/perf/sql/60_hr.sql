-- HR: time off (policies, requests, and balances computed from them),
-- attendance on every working day not on leave, review cycles and reviews,
-- goals, feedback, change requests, onboarding for recent hires, surveys and
-- employee documents.

CREATE TEMP TABLE _staff AS
SELECT row_number() OVER (ORDER BY e.id) AS s, e.id, e.start_date, e.end_date, e.manager_id,
       e.location_code, l.country, l.timezone
  FROM employees e
  JOIN firm_locations l ON l.tenant_id = e.tenant_id AND l.location_code = e.location_code
 WHERE e.tenant_id = _perf.tenant();

-- ---------------------------------------------------------------- time off
INSERT INTO hr_time_off_policies (id, tenant_id, policy_code, policy_name, time_off_type,
                                  accrual_rules, employment_types, location_codes, created_by)
SELECT _perf.u('policy', n), _perf.tenant(), code, name, type,
       jsonb_build_object('rate', rate, 'unit', 'days', 'period', 'monthly', 'max_carryover', carry),
       '["full_time","part_time"]'::jsonb, '[]'::jsonb, 'perf-generator'
  FROM (VALUES (1,'US-PTO','US paid time off','pto',1.67,5,'US'),
               (2,'UK-ANNUAL','UK annual leave','annual',2.33,5,'GB'),
               (3,'IN-EARNED','India earned leave','annual',1.75,30,'IN'),
               (4,'DE-ANNUAL','Germany annual leave','annual',2.5,5,'DE'),
               (5,'GLOBAL-SICK','Sick leave','sick',0.83,0,NULL)) p(n, code, name, type, rate, carry, country);

CREATE TEMP TABLE _pol (n int, code text, rate numeric, carry numeric, country text);
INSERT INTO _pol VALUES (1,'US-PTO',1.67,5,'US'), (2,'UK-ANNUAL',2.33,5,'GB'),
                        (3,'IN-EARNED',1.75,30,'IN'), (4,'DE-ANNUAL',2.5,5,'DE'),
                        (5,'GLOBAL-SICK',0.83,0,NULL);

CREATE TEMP TABLE _req AS
SELECT s.s, s.id AS employee_id, s.manager_id, k,
       CASE WHEN _perf.r('tor:sick', s.s * 100 + k) < 0.2 THEN 5
            ELSE (SELECT n FROM _pol WHERE country = s.country) END AS pol,
       greatest(s.start_date, _perf.as_of() - 700)
         + floor(_perf.r('tor:d', s.s * 100 + k)
                 * (least(coalesce(s.end_date, _perf.as_of() + 60), _perf.as_of() + 60)
                    - greatest(s.start_date, _perf.as_of() - 700)))::int AS start_d,
       _perf.skew('tor:len', s.s * 100 + k, 10, 2) AS days
  FROM _staff s
  CROSS JOIN LATERAL generate_series(1, _perf.ri('tor:n', s.s, 4, 16)) k
 WHERE coalesce(s.end_date, _perf.as_of()) > greatest(s.start_date, _perf.as_of() - 700);

INSERT INTO hr_time_off_requests (id, tenant_id, request_id, employee_id, policy_code, start_date,
                                  end_date, total_hours, status, reason, approver_id, approved_at,
                                  denied_at, denial_reason, submitted_at)
SELECT _perf.u('tor', row_number() OVER (ORDER BY r.start_d, r.s, r.k)), _perf.tenant(),
       'TOR-' || _perf.pad(row_number() OVER (ORDER BY r.start_d, r.s, r.k), 6),
       r.employee_id, p.code, r.start_d, r.start_d + r.days - 1, r.days * 8, st.status,
       _perf.pick(ARRAY['Family holiday','Personal','Medical appointment','Wedding','Rest'], 'tor:why', r.s * 100 + r.k),
       r.manager_id,
       CASE WHEN st.status = 'approved' THEN (r.start_d - 10)::timestamptz END,
       CASE WHEN st.status = 'denied' THEN (r.start_d - 10)::timestamptz END,
       CASE WHEN st.status = 'denied' THEN 'Team coverage that week' END,
       (r.start_d - 14)::timestamptz
  FROM _req r
  JOIN _pol p ON p.n = r.pol
  CROSS JOIN LATERAL (SELECT CASE
      WHEN r.start_d > _perf.as_of() - 7 AND _perf.r('tor:p', r.s * 100 + r.k) < 0.6 THEN 'pending'
      WHEN _perf.r('tor:deny', r.s * 100 + r.k) < 0.08 THEN 'denied'
      ELSE 'approved' END AS status) st;

-- Balances per person, policy and year, computed from the requests with the
-- repository's own formula (hr_time_off_balances.repo.ts):
--   current = opening + accrued + adjusted - used - pending - forfeited
CREATE TEMP TABLE _bal AS
SELECT s.id AS employee_id, p.n AS pol, p.code, p.rate, p.carry, y.yr,
       round(p.rate * CASE WHEN y.yr < extract(year FROM _perf.as_of())::int THEN 12
                           ELSE extract(month FROM _perf.as_of()) END, 2) AS accrued,
       coalesce((SELECT sum(r.total_hours) / 8 FROM hr_time_off_requests r
                  WHERE r.employee_id = s.id AND r.policy_code = p.code AND r.status = 'approved'
                    AND extract(year FROM r.start_date) = y.yr), 0) AS used,
       coalesce((SELECT sum(r.total_hours) / 8 FROM hr_time_off_requests r
                  WHERE r.employee_id = s.id AND r.policy_code = p.code AND r.status = 'pending'
                    AND extract(year FROM r.start_date) = y.yr), 0) AS pending
  FROM _staff s
  JOIN _pol p ON p.country = s.country OR p.country IS NULL
  CROSS JOIN (VALUES (extract(year FROM _perf.as_of())::int - 1),
                     (extract(year FROM _perf.as_of())::int)) y(yr)
 WHERE s.end_date IS NULL;

INSERT INTO hr_time_off_balances (id, tenant_id, employee_id, policy_id, accrual_year,
                                  opening_balance, accrued, used, pending, adjusted,
                                  carried_over, forfeited, current_balance, unit, last_accrual_at)
SELECT _perf.u('balance', row_number() OVER (ORDER BY b.employee_id, b.pol, b.yr)), _perf.tenant(),
       b.employee_id, _perf.u('policy', b.pol), b.yr, o.opening, b.accrued, b.used, b.pending,
       0, o.opening, 0, o.opening + b.accrued - b.used - b.pending, 'days',
       (date_trunc('month', _perf.as_of()))::timestamptz
  FROM _bal b
  CROSS JOIN LATERAL (
    SELECT CASE WHEN b.yr = extract(year FROM _perf.as_of())::int
                THEN least(b.carry, greatest(0, coalesce((SELECT pb.accrued - pb.used FROM _bal pb
                     WHERE pb.employee_id = b.employee_id AND pb.pol = b.pol AND pb.yr = b.yr - 1), 0)))
                ELSE 0 END AS opening) o;

-- ---------------------------------------------------------------- attendance
-- Every working day of employment in the last two years, except approved leave.
CREATE TEMP TABLE _leave AS
SELECT DISTINCT r.employee_id, d::date AS day
  FROM hr_time_off_requests r
  CROSS JOIN LATERAL generate_series(r.start_date, r.end_date, interval '1 day') d
 WHERE r.tenant_id = _perf.tenant() AND r.status = 'approved';

CREATE TEMP TABLE _att AS
SELECT s.s, s.id AS employee_id, s.timezone, d::date AS day
  FROM _staff s
  CROSS JOIN LATERAL generate_series(greatest(s.start_date, _perf.as_of() - 730),
                                     least(coalesce(s.end_date, _perf.as_of()), _perf.as_of()),
                                     interval '1 day') d
 WHERE extract(isodow FROM d) < 6;
DELETE FROM _att a USING _leave l WHERE l.employee_id = a.employee_id AND l.day = a.day;

INSERT INTO hr_attendance (id, tenant_id, attendance_id, employee_id, attendance_date,
                           clock_in_time, clock_out_time, clock_in_location, break_minutes,
                           total_hours, regular_hours, overtime_hours, status, approved_at, created_at)
SELECT _perf.u('attendance', x.seq), _perf.tenant(), 'AT-' || _perf.pad(x.seq, 7), x.employee_id,
       x.day, x.clock_in, x.clock_out, CASE WHEN x.clock_in IS NOT NULL THEN 'Office' END,
       CASE WHEN x.clock_in IS NOT NULL THEN 45 END,
       x.worked, least(x.worked, 8), greatest(x.worked - 8, 0), x.status,
       CASE WHEN x.day < _perf.as_of() - 7 THEN (x.day + 7)::timestamptz END,
       coalesce(x.clock_in, x.day::timestamptz)
  FROM (SELECT a.*, st.status, row_number() OVER (ORDER BY a.day, a.s) AS seq,
               CASE WHEN st.status = 'absent' THEN NULL
                    ELSE ((a.day + time '09:00' + make_interval(mins => st.late)) AT TIME ZONE a.timezone) END AS clock_in,
               CASE WHEN st.status = 'absent' THEN NULL
                    ELSE ((a.day + time '09:00' + make_interval(mins => st.late + st.span)) AT TIME ZONE a.timezone) END AS clock_out,
               CASE WHEN st.status = 'absent' THEN NULL
                    ELSE round((st.span - 45) / 60.0, 2) END AS worked
          FROM _att a
          CROSS JOIN LATERAL (SELECT
              CASE WHEN _perf.r('att:s', a.s * 100000 + (a.day - date '2000-01-01')) < 0.90 THEN 'present'
                   WHEN _perf.r('att:s', a.s * 100000 + (a.day - date '2000-01-01')) < 0.96 THEN 'late'
                   WHEN _perf.r('att:s', a.s * 100000 + (a.day - date '2000-01-01')) < 0.98 THEN 'early_departure'
                   ELSE 'absent' END AS status,
              _perf.ri('att:l', a.s * 100000 + (a.day - date '2000-01-01'), -20, 20) AS late0,
              _perf.ri('att:sp', a.s * 100000 + (a.day - date '2000-01-01'), 480, 600) AS span0) r0
          CROSS JOIN LATERAL (SELECT r0.status,
              CASE r0.status WHEN 'late' THEN 30 + abs(r0.late0) ELSE r0.late0 END AS late,
              CASE r0.status WHEN 'early_departure' THEN r0.span0 - 150 ELSE r0.span0 END AS span) st) x;

-- ---------------------------------------------------------------- reviews
INSERT INTO hr_review_cycles (id, tenant_id, cycle_code, cycle_name, review_type, start_date,
                              self_assessment_due, manager_assessment_due, review_meetings_due,
                              cycle_close_date, status, created_by)
SELECT _perf.u('cycle', c), _perf.tenant(), 'RC-' || to_char(st, 'YYYY') || '-H' || (1 + (extract(month FROM st)::int > 6)::int),
       'H' || (1 + (extract(month FROM st)::int > 6)::int) || ' ' || to_char(st, 'YYYY') || ' review',
       'semi_annual', st, st + 14, st + 28, st + 42, st + 56,
       CASE WHEN st + 56 < _perf.as_of() THEN 'closed' ELSE 'open' END, 'perf-generator'
  FROM generate_series(0, 3) c,
       LATERAL (SELECT (date_trunc('month', _perf.as_of()) - (c * 6 + 1) * interval '1 month')::date AS st) x;

INSERT INTO hr_reviews (id, tenant_id, review_id, employee_id, reviewer_id, cycle_code, review_type,
                        review_date, self_assessment, manager_assessment, overall_rating, status, created_at)
SELECT _perf.u('review', c.n * 100000 + s.s), _perf.tenant(), 'RV-' || c.n || '-' || _perf.pad(s.s, 5),
       s.id, s.manager_id, cy.cycle_code, 'semi_annual', cy.start_date + 40,
       jsonb_build_object('strengths', 'Strong delivery focus', 'development', 'Broader stakeholder reach'),
       CASE WHEN st.status <> 'draft' THEN jsonb_build_object('summary', 'Meets or exceeds expectations') END,
       CASE WHEN st.status <> 'draft' THEN (2 + round(_perf.r('rv:r', c.n * 100000 + s.s)::numeric * 3, 1)) END,
       st.status, cy.start_date::timestamptz
  FROM generate_series(0, 3) c(n)
  JOIN hr_review_cycles cy ON cy.id = _perf.u('cycle', c.n)
  JOIN _staff s ON s.manager_id IS NOT NULL AND s.start_date < cy.start_date
              AND (s.end_date IS NULL OR s.end_date > cy.cycle_close_date)
  CROSS JOIN LATERAL (SELECT CASE
      WHEN cy.status = 'closed' THEN 'acknowledged'
      WHEN _perf.r('rv:s', c.n * 100000 + s.s) < 0.5 THEN 'submitted' ELSE 'draft' END AS status) st;

INSERT INTO hr_goals (id, tenant_id, employee_id, goal_title, description, category,
                      measurement_type, target_value, current_value, unit, weight, status,
                      progress_percentage, start_date, target_date, completed_at)
SELECT _perf.u('goal', s.s * 10 + g), _perf.tenant(), s.id,
       _perf.pick(ARRAY['Ship the platform migration','Improve customer NPS','Mentor two juniors',
                        'Reduce defect rate','Grow account revenue','Complete certification'], 'goal:t', s.s * 10 + g),
       'Agreed with my manager', _perf.pick(ARRAY['delivery','development','performance','revenue'], 'goal:c', s.s * 10 + g),
       'percentage', 100, p.pct, '%', 0.25, p.status, p.pct,
       _perf.as_of() - 300, _perf.as_of() + _perf.ri('goal:d', s.s * 10 + g, -100, 200),
       CASE WHEN p.status = 'achieved' THEN (_perf.as_of() - 20)::timestamptz END
  FROM _staff s CROSS JOIN generate_series(1, 5) g
  CROSS JOIN LATERAL (SELECT round(_perf.r('goal:p', s.s * 10 + g)::numeric * 100) AS pct) p0
  CROSS JOIN LATERAL (SELECT p0.pct,
      CASE WHEN p0.pct = 100 THEN 'achieved' WHEN p0.pct < 10 THEN 'draft' ELSE 'active' END AS status) p
 WHERE s.end_date IS NULL;

INSERT INTO hr_feedback (id, tenant_id, feedback_id, from_employee_id, to_employee_id, feedback_type,
                         feedback_date, content, is_anonymous, visibility, status, created_at)
SELECT _perf.u('feedback', f), _perf.tenant(), 'FB-' || _perf.pad(f, 6), a.id, b.id,
       v.type, v.d, v.content, v.anon, v.vis, 'published', v.d::timestamptz
  FROM generate_series(1, _perf.n(10000)) f
  JOIN _staff a ON a.s = 1 + (f * 7919) % (SELECT count(*) FROM _staff)
  JOIN _staff b ON b.s = 1 + (f * 104729 + 13) % (SELECT count(*) FROM _staff)
  CROSS JOIN LATERAL (SELECT
      _perf.pick(ARRAY['praise','praise','constructive'], 'fb:t', f) AS type,
      _perf.day_within('fb:d', f, 700) AS d,
      _perf.pick(ARRAY['Great work on the client demo.','Thanks for covering the release.',
                       'Could share status updates earlier.','Excellent analysis this sprint.'], 'fb:c', f) AS content,
      _perf.r('fb:a', f) < 0.1 AS anon,
      _perf.pick(ARRAY['private','manager_only','public'], 'fb:v', f) AS vis0) v0
  CROSS JOIN LATERAL (SELECT v0.type, v0.d, v0.content, v0.anon,
      CASE WHEN v0.anon AND v0.vis0 = 'manager_only' THEN 'private' ELSE v0.vis0 END AS vis) v
 WHERE a.id <> b.id;

-- ---------------------------------------------------------------- change requests
INSERT INTO hr_change_requests (id, tenant_id, request_id, requested_by, requested_for, request_type,
                                request_details, status, resolved_at, resolved_by, created_at)
SELECT _perf.u('change', c), _perf.tenant(), 'CR-' || _perf.pad(c, 5), s.id::text, s.id::text, t.type,
       jsonb_build_object('field', t.field, 'reason', 'Updated details', 'currentValue', 'old',
                          'requestedValue', 'new'),
       st.status,
       CASE WHEN st.status <> 'pending' THEN (t.d + 3)::timestamptz END,
       CASE WHEN st.status <> 'pending' THEN (SELECT employee_id::text FROM _perf.actors WHERE actor = 'hr') END,
       t.d::timestamptz
  FROM generate_series(1, _perf.n(2000)) c
  JOIN _staff s ON s.s = 1 + (c * 31) % (SELECT count(*) FROM _staff)
  CROSS JOIN LATERAL (SELECT _perf.pick(ARRAY['address_change','name_change','bank_details'], 'cr:t', c) AS type,
                             _perf.pick(ARRAY['address_line1','last_name','bank_account'], 'cr:t', c) AS field,
                             _perf.day_within('cr:d', c, 700) AS d) t
  CROSS JOIN LATERAL (SELECT CASE WHEN t.d > _perf.as_of() - 10 THEN 'pending'
                                  WHEN _perf.r('cr:s', c) < 0.9 THEN 'approved' ELSE 'rejected' END AS status) st;

-- ---------------------------------------------------------------- onboarding
INSERT INTO hr_onboarding_templates (id, tenant_id, template_code, template_name, description,
                                     applies_to_employment_types, is_default)
SELECT _perf.u('ob_template', n), _perf.tenant(), code, name, name, '["full_time"]'::jsonb, n = 1
  FROM (VALUES (1,'OB-STD','Standard onboarding'), (2,'OB-ENG','Engineering onboarding'),
               (3,'OB-SALES','Sales onboarding')) t(n, code, name);

INSERT INTO hr_onboarding_template_tasks (tenant_id, template_id, task_name, task_type, phase,
                                          assignee_role, due_offset_days, sort_order)
SELECT _perf.tenant(), _perf.u('ob_template', t), k.name, k.type, k.phase, k.role, k.offs, k.ord
  FROM generate_series(1, 3) t
  CROSS JOIN (VALUES ('Sign contract','e_signature','pre_boarding','employee',-7,1),
                     ('Laptop setup','equipment_request','pre_boarding','it',-3,2),
                     ('Welcome meeting','meeting','first_day','manager',0,3),
                     ('Security training','training','first_week','employee',5,4),
                     ('Policy acknowledgement','policy_acknowledgment','first_week','employee',5,5)) k(name, type, phase, role, offs, ord);

INSERT INTO hr_onboarding_tasks (id, tenant_id, task_id, employee_id, task_name, description, task_type,
                                 assigned_to_employee_id, due_date, completion_date, status, priority, created_at)
SELECT _perf.u('ob_task', s.s * 10 + k.n), _perf.tenant(), 'OT-' || s.s || '-' || k.n, s.id, k.name,
       k.name || ' for a new starter', 'task', s.manager_id, s.start_date + k.offs,
       CASE WHEN s.start_date + k.offs < _perf.as_of() - 5 THEN s.start_date + k.offs END,
       CASE WHEN s.start_date + k.offs < _perf.as_of() - 5 THEN 'completed' ELSE 'pending' END,
       _perf.pick(ARRAY['medium','high'], 'ob:p', s.s * 10 + k.n), (s.start_date - 14)::timestamptz
  FROM _staff s
  CROSS JOIN (VALUES (1,'Sign contract',-7), (2,'Laptop setup',-3), (3,'Welcome meeting',0),
                     (4,'Security training',5), (5,'Policy acknowledgement',5), (6,'Meet the team',2),
                     (7,'Set up payroll',3), (8,'Benefits enrolment',10), (9,'30-day check-in',30),
                     (10,'90-day review',90)) k(n, name, offs)
 WHERE s.start_date > _perf.as_of() - 730;

-- ---------------------------------------------------------------- surveys
INSERT INTO hr_surveys (id, tenant_id, survey_id, survey_name, survey_type, description, questions,
                        target_audience, is_anonymous, start_date, end_date, status, created_by)
SELECT _perf.u('survey', q), _perf.tenant(), 'SV-' || q, 'Pulse ' || to_char(st, 'Mon YYYY'), 'pulse',
       'Quarterly pulse', '[{"id":"q1","text":"How supported do you feel?","type":"scale","scale":5},{"id":"q2","text":"What should we change?","type":"text"}]'::jsonb,
       'All staff', true, st, st + 14,
       CASE WHEN st + 14 < _perf.as_of() THEN 'closed' ELSE 'active' END, 'perf-generator'
  FROM generate_series(0, 7) q,
       LATERAL (SELECT (date_trunc('quarter', _perf.as_of()) - q * interval '3 months')::date AS st) x;

INSERT INTO hr_survey_responses (id, tenant_id, response_id, survey_id, respondent_id, responses,
                                 is_complete, submitted_at)
SELECT _perf.u('response', q * 100000 + s.s), _perf.tenant(), 'SR-' || q || '-' || s.s,
       _perf.u('survey', q), NULL,
       json_build_object('q1', _perf.ri('sr', q * 100000 + s.s, 1, 5))::text, true,
       sv.start_date::timestamptz + make_interval(days => _perf.ri('sr:d', q * 100000 + s.s, 0, 13))
  FROM generate_series(0, 7) q
  JOIN hr_surveys sv ON sv.id = _perf.u('survey', q)
  JOIN _staff s ON s.start_date < sv.start_date AND (s.end_date IS NULL OR s.end_date > sv.end_date)
 WHERE _perf.r('sr:in', q * 100000 + s.s) < 0.6 AND sv.start_date <= _perf.as_of();

UPDATE hr_surveys sv SET response_count = c.n,
       response_rate = round(100.0 * c.n / greatest((SELECT count(*) FROM employees WHERE tenant_id = _perf.tenant() AND is_active), 1), 2)
  FROM (SELECT survey_id, count(*) AS n FROM hr_survey_responses WHERE tenant_id = _perf.tenant() GROUP BY 1) c
 WHERE sv.id = c.survey_id;

-- ---------------------------------------------------------------- employee documents
INSERT INTO hr_employee_documents (id, tenant_id, document_id, employee_id, document_type,
                                   document_name, file_url, file_size_bytes, mime_type, uploaded_by,
                                   upload_date, expiration_date, status)
SELECT _perf.u('emp_doc', s.s * 10 + k), _perf.tenant(), 'ED-' || s.s || '-' || k, s.id, d.type,
       d.name || '.pdf', 'perf/employees/' || s.s || '/' || k || '.pdf',
       _perf.ri('ed:sz', s.s * 10 + k, 40000, 900000), 'application/pdf', 'perf-generator',
       s.start_date + k, CASE WHEN d.type = 'id_proof' THEN s.start_date + 3650 END, d.status
  FROM _staff s
  CROSS JOIN LATERAL generate_series(1, _perf.ri('ed:n', s.s, 3, 6)) k
  CROSS JOIN LATERAL (SELECT (ARRAY['contract','i9','policy_acknowledgment','id_proof','tax_form','offer_letter'])[k] AS type,
                             (ARRAY['Employment contract','I-9','Code of conduct','Passport','Tax form','Offer letter'])[k] AS name,
                             (ARRAY['signed','verified','signed','verified','received','signed'])[k] AS status) d;

DROP TABLE _staff, _pol, _req, _bal, _leave, _att;
