-- CRM: companies, contacts, the pipeline, deals and logged activity, plus
-- custom fields on companies, contacts and deals. Big customers get more of
-- everything (skewed, not uniform), and deal stages follow age: old deals
-- are mostly won or lost, recent ones mostly open.

-- The sales team: deal owners and account managers.
CREATE TEMP TABLE _sales AS
SELECT row_number() OVER (ORDER BY id) AS i, id
  FROM employees
 WHERE tenant_id = _perf.tenant() AND is_active AND department_code LIKE 'SALES%';
INSERT INTO _sales
SELECT 1, id FROM employees
 WHERE tenant_id = _perf.tenant() AND employee_id = 'BL-00001'
   AND NOT EXISTS (SELECT 1 FROM _sales);
CREATE TEMP TABLE _sales_n AS SELECT count(*)::int AS n FROM _sales;

-- Companies. Currency follows the customer's market.
CREATE TEMP TABLE _cust AS
SELECT c,
       _perf.u('customer', c) AS id,
       _perf.company(c) AS name,
       CASE WHEN _perf.r('cust:cur', c) < 0.5 THEN 'USD'
            WHEN _perf.r('cust:cur', c) < 0.7 THEN 'GBP'
            WHEN _perf.r('cust:cur', c) < 0.85 THEN 'EUR' ELSE 'INR' END AS currency,
       CASE WHEN _perf.r('cust:st', c) < 0.60 THEN 'active'
            WHEN _perf.r('cust:st', c) < 0.85 THEN 'prospect'
            WHEN _perf.r('cust:st', c) < 0.95 THEN 'inactive' ELSE 'churned' END AS status
  FROM generate_series(1, _perf.n(3000)) c;

INSERT INTO customers (id, tenant_id, customer_number, customer_name, display_name, email,
                       phone, website, billing_address, currency, payment_terms,
                       credit_limit, is_active, notes, customer_type, relationship_status,
                       industry, company_size, account_manager_id, acquisition_date,
                       acquisition_source, legal_entity_name, default_hourly_rate)
SELECT c.id, _perf.tenant(), 'C-' || _perf.pad(c.c, 6), c.name, c.name,
       'accounts@' || lower(replace(c.name, ' ', '')) || '.example',
       '+1-555-' || lpad((c.c % 10000)::text, 4, '0'),
       'https://' || lower(replace(c.name, ' ', '')) || '.example',
       jsonb_build_object('line1', c.c || ' Market Street', 'city',
                          _perf.pick(ARRAY['New York','London','Berlin','Mumbai','Austin','Leeds','Munich','Pune'], 'cust:city', c.c)),
       c.currency, _perf.pick(ARRAY['Net 15','Net 30','Net 30','Net 45','Net 60'], 'cust:terms', c.c),
       (round(_perf.r('cust:credit', c.c)::numeric * 20) * 25000)::numeric(15,2),
       c.status IN ('active', 'prospect'),
       CASE WHEN _perf.r('cust:notes', c.c) < 0.3 THEN 'Key account; quarterly business review.' END,
       _perf.pick(ARRAY['small_business','corporate','corporate','enterprise','government','nonprofit'], 'cust:type', c.c),
       c.status,
       _perf.pick(ARRAY['Healthcare','Retail','Manufacturing','Financial services','Energy','Media','Logistics','Public sector'], 'cust:ind', c.c),
       _perf.pick(ARRAY['11-50','51-200','201-500','501+'], 'cust:size', c.c),
       (SELECT s.id FROM _sales s, _sales_n sn WHERE s.i = 1 + (c.c % sn.n)),
       _perf.as_of() - _perf.ri('cust:acq', c.c, 30, 2200),
       _perf.pick(ARRAY['referral','website','event','outbound','partner'], 'cust:src', c.c),
       c.name || ' Ltd',
       (100 + _perf.ri('cust:rate', c.c, 0, 150))::numeric(18,4)
  FROM _cust c;

-- Contacts: one to eight per company, the first of them primary.
CREATE TEMP TABLE _contact AS
SELECT c.c, j, _perf.u('contact', c.c * 100 + j) AS id, c.id AS customer_id, c.name
  FROM _cust c
  CROSS JOIN LATERAL generate_series(1, _perf.skew('cc:n', c.c, 8, 2)) j;

INSERT INTO customer_contacts (id, tenant_id, customer_id, first_name, last_name, email,
                               phone, title, is_primary, is_active, department)
SELECT k.id, _perf.tenant(), k.customer_id,
       _perf.pick(_perf.first_names(), 'cc:f', k.c * 100 + k.j),
       _perf.pick(_perf.last_names(), 'cc:l', k.c * 100 + k.j),
       'contact' || k.j || '.c' || k.c || '@' || lower(replace(k.name, ' ', '')) || '.example',
       '+1-555-' || lpad(((k.c * 7 + k.j) % 10000)::text, 4, '0'),
       _perf.pick(ARRAY['CTO','Head of IT','Procurement Manager','Finance Director','Operations Lead','Project Sponsor'], 'cc:t', k.c * 100 + k.j),
       k.j = 1, true,
       _perf.pick(ARRAY['IT','Finance','Operations','Procurement','Engineering'], 'cc:d', k.c * 100 + k.j)
  FROM _contact k;

INSERT INTO crm_pipeline_stages (id, tenant_id, name, sort_order, stage_type)
SELECT _perf.u('stage', n), _perf.tenant(), name, n, stage_type
  FROM (VALUES (1,'New Inquiry','open'), (2,'Qualified','open'), (3,'Proposal Sent','open'),
               (4,'Negotiation','open'), (5,'Won','won'), (6,'Lost','lost')) s(n, name, stage_type);

-- Deals over two years. Bigger customers (low numbers, by the skew) carry more.
CREATE TEMP TABLE _deal AS
SELECT d,
       _perf.u('deal', d) AS id,
       _perf.skew('deal:c', d, (SELECT count(*)::int FROM _cust), 2) AS c,
       _perf.as_of() - floor(_perf.r('deal:age', d) * 730)::int AS opened
  FROM generate_series(1, _perf.n(12000)) d;

INSERT INTO crm_deals (id, tenant_id, customer_id, customer_contact_id, stage_id, name,
                       value_amount, currency, probability_percent, expected_close_date,
                       owner_id, created_at, updated_at)
SELECT d.id, _perf.tenant(), c.id,
       CASE WHEN _perf.r('deal:ct', d.d) < 0.75 THEN _perf.u('contact', d.c * 100 + 1) END,
       _perf.u('stage', s.stage),
       c.name || ' — ' || _perf.pick(ARRAY['platform rollout','data migration','support renewal',
           'cloud assessment','analytics programme','security review','integration','managed service'], 'deal:n', d.d),
       (round(power(_perf.r('deal:v', d.d), 3)::numeric * 400 + 5) * 1000)::numeric(15,2),
       c.currency,
       CASE s.stage WHEN 1 THEN 10 WHEN 2 THEN 25 WHEN 3 THEN 50 WHEN 4 THEN 75
                    WHEN 5 THEN 100 ELSE 0 END,
       d.opened + _perf.ri('deal:close', d.d, 21, 150),
       (SELECT sl.id FROM _sales sl, _sales_n sn WHERE sl.i = 1 + (d.d % sn.n)),
       d.opened::timestamptz, (d.opened + 7)::timestamptz
  FROM _deal d
  JOIN _cust c ON c.c = d.c
  CROSS JOIN LATERAL (
    SELECT CASE
      WHEN _perf.as_of() - d.opened > 150 THEN CASE WHEN _perf.r('deal:won', d.d) < 0.45 THEN 5 ELSE 6 END
      WHEN _perf.as_of() - d.opened > 90 THEN _perf.pick(ARRAY[4,5,6,6], 'deal:st', d.d)
      ELSE _perf.pick(ARRAY[1,1,2,2,3,4], 'deal:st', d.d) END AS stage
  ) s;

-- Activity: a few to a dozen per deal, plus account notes with no deal.
INSERT INTO crm_activities (id, tenant_id, customer_id, customer_contact_id, deal_id,
                            activity_type, subject, body, occurred_at, created_by, created_at)
SELECT _perf.u('activity', d.d * 100 + k), _perf.tenant(), c.id,
       _perf.u('contact', d.c * 100 + 1), d.id,
       _perf.pick(ARRAY['call','email','email','meeting','note'], 'act:t', d.d * 100 + k),
       _perf.pick(ARRAY['Intro call','Sent proposal','Pricing discussion','Technical deep-dive',
                        'Follow-up','Contract questions','Kick-off planning'], 'act:s', d.d * 100 + k),
       'Discussed scope, timeline and next steps with the buyer.',
       _perf.at(least(_perf.as_of(), d.opened + k * _perf.ri('act:gap', d.d, 2, 12)), 'act:at', d.d * 100 + k),
       (SELECT sl.id FROM _sales sl, _sales_n sn WHERE sl.i = 1 + (d.d % sn.n)),
       _perf.at(least(_perf.as_of(), d.opened + k * _perf.ri('act:gap', d.d, 2, 12)), 'act:at', d.d * 100 + k)
  FROM _deal d
  JOIN _cust c ON c.c = d.c
  CROSS JOIN LATERAL generate_series(1, _perf.skew('act:n', d.d, 9, 1.5)) k;

INSERT INTO crm_activities (id, tenant_id, customer_id, activity_type, subject, body,
                            occurred_at, created_by, created_at)
SELECT _perf.u('activity', 100000000 + c.c * 10 + k), _perf.tenant(), c.id, 'note',
       'Account note', 'Quarterly check-in on the relationship.',
       _perf.at(_perf.day_within('note:at', c.c * 10 + k, 700), 'note:t', c.c * 10 + k),
       (SELECT sl.id FROM _sales sl, _sales_n sn WHERE sl.i = 1 + (c.c % sn.n)),
       _perf.at(_perf.day_within('note:at', c.c * 10 + k, 700), 'note:t', c.c * 10 + k)
  FROM _cust c CROSS JOIN LATERAL generate_series(1, _perf.skew('note:n', c.c, 4, 2)) k
 WHERE c.status IN ('active', 'inactive');

-- Custom fields: company, contact and deal definitions in categories.
INSERT INTO custom_field_definitions (id, tenant_id, entity_type, category, field_key, label,
                                      help_text, data_type, options, is_required, display_order)
SELECT _perf.u('cfd', n), _perf.tenant(), entity_type, category, field_key, label, help,
       data_type, options::jsonb, false, ord
  FROM (VALUES
   (1,'company','Account','account_tier','Account tier','How much attention it gets','select','[{"value":"strategic","label":"Strategic","tone":"primary"},{"value":"growth","label":"Growth","tone":"info"},{"value":"standard","label":"Standard","tone":"neutral"}]',1),
   (2,'company','Account','annual_it_budget','Annual IT budget','Their estimate','money',NULL,2),
   (3,'company','Account','renewal_month','Renewal month','When their contract renews','date',NULL,3),
   (4,'company','Compliance','dpa_signed','DPA signed','A signed DPA is on file','boolean',NULL,1),
   (5,'company','Compliance','dpa_expiry','DPA expiry','When it must be renewed','date',NULL,2),
   (6,'company','Compliance','data_region','Data region','Where their data must live','select','[{"value":"us","label":"US"},{"value":"eu","label":"EU"},{"value":"in","label":"India"}]',3),
   (7,'customer_contact','General','alternate_phone','Alternate phone',NULL,'text',NULL,1),
   (8,'customer_contact','General','linkedin','LinkedIn',NULL,'text',NULL,2),
   (9,'customer_contact','Preferences','preferred_channel','Preferred channel',NULL,'select','[{"value":"email","label":"Email"},{"value":"phone","label":"Phone"},{"value":"chat","label":"Chat"}]',1),
   (10,'deal','Qualification','budget_confirmed','Budget confirmed',NULL,'boolean',NULL,1),
   (11,'deal','Qualification','decision_date','Decision date',NULL,'date',NULL,2),
   (12,'deal','Qualification','seats','Seats','Licences in scope','number',NULL,3),
   (13,'deal','Competition','competitors','Competitors','Who else is bidding','multiselect','[{"value":"rival_a","label":"Rival A","tone":"warning"},{"value":"rival_b","label":"Rival B","tone":"error"},{"value":"in_house","label":"In-house build","tone":"neutral"}]',1),
   (14,'deal','Competition','procurement_portal','Procurement portal',NULL,'text',NULL,2)
  ) f(n, entity_type, category, field_key, label, help, data_type, options, ord);

-- Values: most records carry most of their fields.
INSERT INTO custom_field_values (tenant_id, field_definition_id, company_id, deal_id,
                                 customer_contact_id, updated_by, value_text, value_number,
                                 value_money, value_date, value_boolean, value_multi)
SELECT _perf.tenant(), d.id,
       CASE WHEN d.entity_type = 'company' THEN r.rid END,
       CASE WHEN d.entity_type = 'deal' THEN r.rid END,
       CASE WHEN d.entity_type = 'customer_contact' THEN r.rid END,
       'perf-generator',
       CASE d.field_key
         WHEN 'account_tier' THEN _perf.pick(ARRAY['strategic','growth','standard','standard'], 'cfv', r.h)
         WHEN 'data_region' THEN _perf.pick(ARRAY['us','eu','in'], 'cfv', r.h)
         WHEN 'alternate_phone' THEN '+44-20-' || lpad((r.h % 100000000)::text, 8, '0')
         WHEN 'linkedin' THEN 'https://linkedin.example/in/' || r.h
         WHEN 'preferred_channel' THEN _perf.pick(ARRAY['email','phone','chat'], 'cfv', r.h)
         WHEN 'procurement_portal' THEN _perf.pick(ARRAY['Ariba','Coupa','Jaggaer','Direct'], 'cfv', r.h)
       END,
       CASE WHEN d.field_key = 'seats' THEN _perf.ri('cfv:n', r.h, 10, 2000)::numeric(18,4) END,
       CASE WHEN d.field_key = 'annual_it_budget' THEN (_perf.ri('cfv:m', r.h, 50, 5000) * 1000)::numeric(15,2) END,
       CASE WHEN d.data_type = 'date' THEN _perf.as_of() + _perf.ri('cfv:d', r.h, -300, 400) END,
       CASE WHEN d.data_type = 'boolean' THEN _perf.r('cfv:b', r.h) < 0.6 END,
       CASE WHEN d.field_key = 'competitors' THEN
         (SELECT jsonb_agg(v) FROM unnest(ARRAY['rival_a','rival_b','in_house']) v
           WHERE _perf.r('cfv:' || v, r.h) < 0.4) END
  FROM custom_field_definitions d
  JOIN LATERAL (
    SELECT id AS rid, hashtext(id::text || d.field_key)::bigint AS h FROM customers
     WHERE d.entity_type = 'company' AND tenant_id = _perf.tenant()
    UNION ALL
    SELECT id, hashtext(id::text || d.field_key)::bigint FROM crm_deals
     WHERE d.entity_type = 'deal' AND tenant_id = _perf.tenant()
    UNION ALL
    SELECT id, hashtext(id::text || d.field_key)::bigint FROM customer_contacts
     WHERE d.entity_type = 'customer_contact' AND tenant_id = _perf.tenant()
  ) r ON true
 WHERE d.tenant_id = _perf.tenant()
   AND d.entity_type IN ('company', 'deal', 'customer_contact')
   AND _perf.r('cfv:has', r.h) < CASE d.entity_type WHEN 'company' THEN 0.75
                                                    WHEN 'deal' THEN 0.6 ELSE 0.4 END
   -- A multiselect with nothing chosen stores no row, as the app does.
   AND NOT (d.field_key = 'competitors' AND NOT EXISTS (
         SELECT 1 FROM unnest(ARRAY['rival_a','rival_b','in_house']) v
          WHERE _perf.r('cfv:' || v, r.h) < 0.4));

DROP TABLE _sales, _sales_n, _cust, _contact, _deal;
