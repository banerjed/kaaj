-- The rest of daily work: document folders and documents, team chat,
-- task attachments, project automations and their runs, ticket reference
-- links, background jobs and the error log.

CREATE TEMP TABLE _people AS
SELECT row_number() OVER (ORDER BY id) AS p, id FROM employees
 WHERE tenant_id = _perf.tenant() AND is_active;
CREATE TEMP TABLE _people_n AS SELECT count(*)::int AS n FROM _people;

-- ---------------------------------------------------------------- folders
INSERT INTO document_folders (id, tenant_id, parent_folder_id, path_ids, name, owner_employee_id,
                              visibility, created_at)
SELECT _perf.u('folder', r), _perf.tenant(), NULL, '{}', name, _perf.u('employee', 1), 'company',
       (_perf.as_of() - 700)::timestamptz
  FROM (VALUES (1,'Company Handbook'), (2,'Policies'), (3,'Templates'), (4,'Finance'),
               (5,'Sales'), (6,'Delivery')) f(r, name);

INSERT INTO document_folders (id, tenant_id, parent_folder_id, path_ids, name, owner_employee_id,
                              visibility, created_at)
SELECT _perf.u('folder', 100 + r * 10 + c), _perf.tenant(), _perf.u('folder', r),
       ARRAY[_perf.u('folder', r)], (ARRAY['Current','Archive'])[c], _perf.u('employee', 1),
       'company', (_perf.as_of() - 690)::timestamptz
  FROM generate_series(1, 6) r CROSS JOIN generate_series(1, 2) c;

INSERT INTO document_folders (id, tenant_id, parent_folder_id, path_ids, name, owner_employee_id,
                              visibility, entity_type, entity_id, created_at)
SELECT _perf.u('folder', 10000 + pr.rn), _perf.tenant(), NULL, '{}', p.project_name || ' — Files',
       coalesce(p.project_manager_id, _perf.u('employee', 1)), 'company', 'project', p.id,
       p.created_at
  FROM (SELECT id, row_number() OVER (ORDER BY id) AS rn FROM projects WHERE tenant_id = _perf.tenant()) pr
  JOIN projects p ON p.id = pr.id
 WHERE _perf.r('fold:p', pr.rn) < 0.4;

INSERT INTO document_folders (id, tenant_id, parent_folder_id, path_ids, name, owner_employee_id,
                              visibility, created_at)
SELECT _perf.u('folder', 100000 + pp.p), _perf.tenant(), NULL, '{}', 'My files', pp.id,
       CASE WHEN _perf.r('fold:v', pp.p) < 0.8 THEN 'private' ELSE 'shared' END,
       (_perf.as_of() - 500)::timestamptz
  FROM _people pp WHERE _perf.r('fold:e', pp.p) < 0.2;

CREATE TEMP TABLE _folders AS
SELECT row_number() OVER (ORDER BY id) AS f, id, entity_type, entity_id, owner_employee_id
  FROM document_folders WHERE tenant_id = _perf.tenant();

-- ---------------------------------------------------------------- documents
INSERT INTO documents (id, tenant_id, entity_type, entity_id, customer_id, file_name, storage_key,
                       mime_type, file_size_bytes, visibility, uploaded_by_employee_id, folder_id,
                       created_at)
SELECT _perf.u('document', d), _perf.tenant(),
       CASE WHEN k.kind = 'customer' THEN 'customer' ELSE fo.entity_type END,
       CASE WHEN k.kind = 'customer' THEN c.id ELSE fo.entity_id END,
       CASE WHEN k.kind = 'customer' THEN c.id END,
       _perf.pick(ARRAY['proposal','contract','sow','report','invoice','notes','design'], 'doc:n', d)
         || '-' || d || '.' || k.ext,
       'perf/documents/' || d, k.mime, _perf.ri('doc:sz', d, 20000, 8000000), 'internal',
       coalesce(fo.owner_employee_id, _perf.u('employee', 1)),
       CASE WHEN k.kind = 'customer' THEN NULL ELSE fo.id END,
       _perf.at(_perf.day_within('doc:d', d, 700), 'doc:at', d)
  FROM generate_series(1, _perf.n(20000)) d
  CROSS JOIN LATERAL (SELECT
      CASE WHEN _perf.r('doc:k', d) < 0.25 THEN 'customer' ELSE 'folder' END AS kind,
      _perf.pick(ARRAY['pdf','pdf','docx','xlsx','png'], 'doc:e', d) AS ext,
      _perf.pick(ARRAY['application/pdf','application/pdf',
                       'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
                       'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet','image/png'], 'doc:e', d) AS mime) k
  LEFT JOIN _folders fo ON fo.f = 1 + (d * 7) % (SELECT count(*) FROM _folders)
  LEFT JOIN customers c ON c.id = _perf.u('customer', _perf.skew('doc:c', d, _perf.n(3000), 2));

-- ---------------------------------------------------------------- chat
CREATE TEMP TABLE _conv AS
SELECT c, _perf.u('conversation', c) AS id,
       CASE WHEN c <= _perf.n(60, 3) THEN 'public'
            WHEN c <= _perf.n(60, 3) + _perf.n(20, 1) THEN 'private' ELSE 'dm' END AS kind
  FROM generate_series(1, _perf.n(60, 3) + _perf.n(20, 1) + _perf.n(300, 5)) c;

INSERT INTO team_chat_conversations (id, tenant_id, kind, name, topic, visibility, dm_key,
                                     created_by_employee_id, created_at)
SELECT v.id, _perf.tenant(), CASE WHEN v.kind = 'dm' THEN 'dm' ELSE 'channel' END,
       CASE WHEN v.kind <> 'dm' THEN lower(_perf.pick(_perf.words(), 'ch:n', v.c)) || '-' || v.c END,
       CASE WHEN v.kind <> 'dm' THEN 'Team discussion' END,
       CASE WHEN v.kind <> 'dm' THEN v.kind END,
       CASE WHEN v.kind = 'dm' THEN least(a.id::text, b.id::text) || ',' || greatest(a.id::text, b.id::text) END,
       a.id, (_perf.as_of() - 700)::timestamptz
  FROM _conv v
  JOIN _people a ON a.p = 1 + (v.c * 37) % (SELECT n FROM _people_n)
  JOIN _people b ON b.p = 1 + (v.c * 101 + 7) % (SELECT n FROM _people_n)
 WHERE v.kind <> 'dm' OR a.id <> b.id;

-- Members: owners first; public channels are large, private ones small.
INSERT INTO team_chat_members (tenant_id, conversation_id, employee_id, role, joined_at, last_read_at)
SELECT DISTINCT ON (c.id, m.id) _perf.tenant(), c.id, m.id,
       CASE WHEN m.id = c.created_by_employee_id THEN 'owner' ELSE 'member' END,
       c.created_at, _perf.as_of() - _perf.ri('ch:r', hashtext(c.id::text || m.id::text), 0, 30)
  FROM team_chat_conversations c
  JOIN LATERAL (
    SELECT p.id FROM _people p
     WHERE c.kind = 'channel'
       AND _perf.r('ch:m', hashtext(c.id::text || p.id::text))
           < CASE c.visibility WHEN 'public' THEN 0.08 ELSE 0.01 END
    UNION ALL SELECT c.created_by_employee_id
    UNION ALL SELECT split_part(c.dm_key, ',', 1)::uuid WHERE c.kind = 'dm'
    UNION ALL SELECT split_part(c.dm_key, ',', 2)::uuid WHERE c.kind = 'dm'
  ) m ON true
 WHERE c.tenant_id = _perf.tenant()
 ORDER BY c.id, m.id;

CREATE TEMP TABLE _cm AS
SELECT row_number() OVER (PARTITION BY conversation_id ORDER BY employee_id) AS i,
       count(*) OVER (PARTITION BY conversation_id) AS n, conversation_id, employee_id
  FROM team_chat_members WHERE tenant_id = _perf.tenant();

-- Messages: notifications are for a live listener, and there is none during a
-- build, so triggers are off for this one statement (member_ids above was
-- kept by its trigger, one member at a time).
SET LOCAL session_replication_role = replica;
INSERT INTO team_chat_messages (id, tenant_id, conversation_id, author_employee_id, body, created_at)
SELECT _perf.u('message', v.c * 100000 + k), _perf.tenant(), v.id, m.employee_id,
       _perf.pick(ARRAY['Morning all!','Can someone review my PR?','Client call moved to 3pm.',
                        'Shipped it.','Who has the latest deck?','Thanks, that fixed it.',
                        'Lunch?','Notes from the standup are in the doc.'], 'msg', v.c * 100000 + k),
       _perf.at(_perf.as_of() - floor(power(_perf.r('msg:d', v.c * 100000 + k), 1.5) * 700)::int,
                'msg:t', v.c * 100000 + k)
  FROM _conv v
  CROSS JOIN LATERAL generate_series(1, CASE WHEN v.kind = 'dm' THEN _perf.skew('msg:n', v.c, 200, 2)
                                             ELSE _perf.skew('msg:n', v.c, 6000, 1.5) END) k
  JOIN _cm m ON m.conversation_id = v.id AND m.i = 1 + (k * 7 + v.c) % m.n;
SET LOCAL session_replication_role = origin;

-- ---------------------------------------------------------------- project extras
INSERT INTO pm_task_attachments (id, tenant_id, attachment_id, task_id, project_id, file_name, file_url,
                                 file_size_bytes, mime_type, file_type, file_extension, attachment_type,
                                 uploaded_by, uploaded_at)
SELECT _perf.u('task_att', a), _perf.tenant(), 'PA-' || _perf.pad(a, 6), t.id, t.project_id,
       'deliverable-' || a || '.pdf', 'perf/tasks/' || a || '.pdf',
       _perf.ri('ta:sz', a, 20000, 5000000), 'application/pdf', 'deliverable', 'pdf', 'deliverable',
       t.created_by, t.created_at + interval '2 days'
  FROM generate_series(1, _perf.n(15000)) a
  JOIN (SELECT row_number() OVER (ORDER BY id) AS i, count(*) OVER () AS n, id, project_id,
               created_by, created_at
          FROM tasks WHERE tenant_id = _perf.tenant()) t
    ON t.i = 1 + (a * 7919) % t.n;

INSERT INTO pm_automations (id, tenant_id, automation_id, scope, project_id, automation_name, description,
                            trigger, actions, is_active, created_by)
SELECT _perf.u('automation', a), _perf.tenant(), 'AU-' || a, 'project', _perf.u('project', a * 7),
       'Notify the PM when a task changes', 'Keeps the project manager informed',
       '{"event":"task.status_changed"}'::jsonb, '[{"type":"notify","target":"project_manager"}]'::jsonb,
       true, 'perf-generator'
  FROM generate_series(1, least(40, _perf.n(1500) / 7)) a;

INSERT INTO pm_automation_executions (id, tenant_id, execution_id, automation_id, triggered_at,
                                      execution_time_ms, triggered_by, entity_type, entity_id,
                                      execution_status, actions_executed, actions_failed, executed_at,
                                      completed_at, created_at)
SELECT _perf.u('execution', x), _perf.tenant(), 'AX-' || _perf.pad(x, 6), au.id, t.ts, _perf.ri('ax:ms', x, 5, 900),
       'system', 'task', _perf.u('task', (au.n * 7) * 1000 + 1), st.status,
       CASE WHEN st.status = 'succeeded' THEN 1 ELSE 0 END, CASE WHEN st.status = 'failed' THEN 1 ELSE 0 END,
       t.ts, t.ts + interval '1 second', t.ts
  FROM generate_series(1, _perf.n(20000)) x
  JOIN LATERAL (SELECT a AS n, _perf.u('automation', a) AS id
                  FROM generate_series(1, least(40, _perf.n(1500) / 7)) a
                 WHERE a = 1 + x % least(40, _perf.n(1500) / 7)) au ON true
  CROSS JOIN LATERAL (SELECT _perf.at(_perf.day_within('ax:d', x, 700), 'ax:t', x) AS ts) t
  CROSS JOIN LATERAL (SELECT CASE WHEN _perf.r('ax:s', x) < 0.97 THEN 'succeeded' ELSE 'failed' END AS status) st;

-- ---------------------------------------------------------------- ticket links
INSERT INTO ticketing_ticket_reference_links (tenant_id, ticket_id, label, url, display_order, created_at, created_by)
SELECT _perf.tenant(), t.id, l.label, l.url || t.ticket_number, k, t.logged_at + interval '1 hour', 'perf-generator'
  FROM ticketing_tickets t
  CROSS JOIN LATERAL generate_series(1, _perf.skew('rl:n', hashtext(t.id::text), 3, 3) - 1) k
  CROSS JOIN LATERAL (SELECT (ARRAY['Runbook','Vendor case','Design doc'])[k] AS label,
                             (ARRAY['https://wiki.example/runbook/','https://vendor.example/case/',
                                    'https://docs.example/design/'])[k] AS url) l
 WHERE t.tenant_id = _perf.tenant();

-- ---------------------------------------------------------------- jobs and errors
INSERT INTO jobs (id, tenant_id, job_type, payload, status, priority, attempts, run_after,
                  started_at, completed_at, last_error, created_at)
SELECT _perf.u('job', j), _perf.tenant(), k.type, k.payload, st.status, 100, st.attempts, ts,
       CASE WHEN st.status <> 'pending' THEN ts + interval '5 seconds' END,
       CASE WHEN st.status IN ('succeeded', 'failed') THEN ts + interval '30 seconds' END,
       CASE WHEN st.status = 'failed' THEN 'Timed out after 30s' END, ts
  FROM generate_series(1, _perf.n(20000)) j
  CROSS JOIN LATERAL (SELECT _perf.at(_perf.day_within('job:d', j, 700), 'job:t', j) AS ts) t
  CROSS JOIN LATERAL (SELECT
      _perf.pick(ARRAY['invoice_pdf','export','timeoff_accrual','payroll_run'], 'job:k', j) AS type,
      jsonb_build_object('ref', 'R-' || j) AS payload) k
  CROSS JOIN LATERAL (SELECT
      CASE WHEN t.ts > _perf.as_of() - 1 AND _perf.r('job:p', j) < 0.5 THEN 'pending'
           WHEN _perf.r('job:f', j) < 0.03 THEN 'failed' ELSE 'succeeded' END AS status,
      CASE WHEN _perf.r('job:f', j) < 0.03 THEN 3 ELSE 1 END AS attempts) st;

INSERT INTO app_error_log (tenant_id, error_id, request_id, scope, route, status, name, message, code, created_at)
SELECT _perf.tenant(), _perf.u('error', e), _perf.u('request', e),
       CASE WHEN _perf.r('err:s', e) < 0.7 THEN 'server' ELSE 'client' END,
       _perf.pick(ARRAY['/employees','/ticketing','/accounting/invoices','/projects','/crm/companies'], 'err:r', e),
       CASE WHEN _perf.r('err:s', e) < 0.7 THEN 500 END,
       _perf.pick(ARRAY['PostgresError','TypeError','Error'], 'err:n', e),
       'Internal Error', _perf.pick(ARRAY['57P01','40001',NULL], 'err:c', e),
       _perf.at(_perf.day_within('err:d', e, 700), 'err:t', e)
  FROM generate_series(1, _perf.n(5000)) e;

DROP TABLE _people, _people_n, _folders, _conv, _cm;
