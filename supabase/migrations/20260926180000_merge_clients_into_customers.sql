-- `clients` and `customers` held the same companies: projects, objectives and
-- time tracking pointed at one, accounting, ticketing, documents and the
-- portal at the other, with nothing joining a client row to its customer row.
-- Billed time could never have reached an invoice, and the same tax identifier
-- was encrypted in one table and plaintext in the other (L103).
--
-- `customers` survives: it is the one with real foreign keys into it. Every
-- `clients` column with no `customers` equivalent is added rather than
-- dropped, because a DROP here is permanent on every environment it reaches.
-- Where both tables hold a value, the customer's wins — it is the billing
-- record — and the client's is used only to fill a blank.

-- One statement, so the merge is all-or-nothing however it is applied: the
-- Supabase CLI and ci-database.sh do not agree on wrapping a file in a
-- transaction, and a half-applied merge would have dropped nothing yet
-- repointed some references.
DO $merge$
DECLARE
  n bigint;
BEGIN
-- Errors instead of silently filtering if this ever runs as a role RLS
-- applies to: every table here is FORCE ROW LEVEL SECURITY, and a filtered
-- read would "merge" nothing and then drop the source.
PERFORM set_config('row_security', 'off', true);

-- 1. Refuse what cannot be carried --------------------------------------------

  -- Ciphertext is bound to tenant|table|column|row (sealField), so SQL cannot
  -- move it to another table, and a migration must never hold the key to
  -- re-seal it. Re-seal through $lib/server/pii before applying this.
  SELECT count(*) INTO n FROM clients WHERE tax_id_ct IS NOT NULL;
  IF n > 0 THEN
    RAISE EXCEPTION '% client(s) carry an encrypted tax_id_ct, which SQL cannot move to customers. Re-seal them onto customers first; nothing has been changed.', n;
  END IF;

  SELECT count(*) INTO n FROM clients cl
   WHERE (SELECT count(*) FROM customers cu
           WHERE cu.tenant_id = cl.tenant_id
             AND lower(btrim(cu.customer_name)) = lower(btrim(cl.client_name))) > 1;
  IF n > 0 THEN
    RAISE EXCEPTION '% client(s) match more than one customer by name; merge those customers first.', n;
  END IF;

  SELECT count(*) INTO n FROM (
    SELECT cu.id FROM clients cl
      JOIN customers cu ON cu.tenant_id = cl.tenant_id
                       AND lower(btrim(cu.customer_name)) = lower(btrim(cl.client_name))
     GROUP BY cu.id HAVING count(*) > 1) x;
  IF n > 0 THEN
    RAISE EXCEPTION '% customer(s) match more than one client by name; merge those clients first.', n;
  END IF;

  SELECT count(*) INTO n FROM clients
   WHERE (primary_contact_name IS NOT NULL AND primary_contact_email IS NULL)
      OR (billing_contact_name IS NOT NULL AND billing_contact_email IS NULL);
  IF n > 0 THEN
    RAISE EXCEPTION '% client(s) have a named contact with no email, which customer_contacts requires.', n;
  END IF;

  -- None of these columns had a foreign key, so a value may point at nothing.
  SELECT count(*) INTO n FROM (
              SELECT client_id FROM projects
    UNION ALL SELECT client_id FROM pm_objectives
    UNION ALL SELECT client_id FROM time_tracking_entries
    UNION ALL SELECT client_id FROM time_tracking_hourly_rates
    UNION ALL SELECT client_id FROM time_tracking_billable_expenses
    UNION ALL SELECT author_client_id FROM pm_task_comments) r
   WHERE client_id IS NOT NULL
     AND client_id NOT IN (SELECT id FROM clients);
  IF n > 0 THEN
    RAISE EXCEPTION '% row(s) reference a client that does not exist; resolve them before merging.', n;
  END IF;

-- 2. Give customers a home for every client attribute -------------------------

ALTER TABLE customers
  ADD COLUMN legal_entity_name   text,
  ADD COLUMN customer_type       text
    CONSTRAINT customers_customer_type_check CHECK (customer_type IN
      ('individual', 'small_business', 'corporate', 'enterprise', 'government', 'nonprofit')),
  ADD COLUMN relationship_status text NOT NULL DEFAULT 'active'
    CONSTRAINT customers_relationship_status_check CHECK (relationship_status IN
      ('prospect', 'active', 'inactive', 'churned')),
  ADD COLUMN industry            text,
  ADD COLUMN company_size        text,
  ADD COLUMN default_hourly_rate numeric(18,4),
  ADD COLUMN account_manager_id  uuid
    CONSTRAINT fk_customers_account_manager_id REFERENCES employees(id),
  ADD COLUMN acquisition_date    date,
  ADD COLUMN acquisition_source  text;

-- 3. Map every client to a customer -------------------------------------------

CREATE TEMP TABLE _client_map (client_id uuid PRIMARY KEY, customer_id uuid NOT NULL) ON COMMIT DROP;

INSERT INTO _client_map
SELECT cl.id, cu.id
  FROM clients cl
  JOIN customers cu ON cu.tenant_id = cl.tenant_id
                   AND lower(btrim(cu.customer_name)) = lower(btrim(cl.client_name));

-- A client with no customer becomes one, keeping its id so nothing that
-- points at it has to be remapped.
INSERT INTO customers (
  id, tenant_id, customer_number, customer_name, display_name, email, phone,
  website, billing_address, currency, payment_terms, is_active, portal_enabled,
  notes, custom_fields, created_at, updated_at)
SELECT cl.id, cl.tenant_id, cl.client_code, cl.client_name, cl.client_name,
       cl.primary_contact_email, cl.primary_contact_phone, cl.website,
       NULLIF(jsonb_strip_nulls(jsonb_build_object(
         'line1', cl.address_line1, 'line2', cl.address_line2, 'city', cl.city,
         'state', cl.state_province, 'postal_code', cl.postal_code,
         'country', cl.country)), '{}'::jsonb),
       -- `customers.currency` is NOT NULL; a client never given one was
       -- implicitly in the firm's currency.
       COALESCE(cl.currency, t.default_currency), cl.payment_terms,
       COALESCE(cl.is_active, true),
       -- `clients.portal_access_enabled` was never read by the portal, so
       -- honouring it now would grant access nobody saw being granted.
       false,
       cl.notes, COALESCE(cl.custom_fields, '{}'::jsonb),
       cl.created_at, cl.updated_at
  FROM clients cl
  JOIN tenants t ON t.id = cl.tenant_id
 WHERE cl.id NOT IN (SELECT client_id FROM _client_map);

INSERT INTO _client_map
SELECT id, id FROM clients WHERE id NOT IN (SELECT client_id FROM _client_map);

UPDATE customers cu SET
  legal_entity_name   = cl.legal_entity_name,
  customer_type       = cl.client_type,
  relationship_status = COALESCE(cl.status, 'active'),
  industry            = cl.industry,
  company_size        = cl.company_size,
  default_hourly_rate = cl.default_hourly_rate,
  account_manager_id  = cl.account_manager_id,
  acquisition_date    = cl.acquisition_date,
  acquisition_source  = cl.acquisition_source,
  website  = COALESCE(NULLIF(cu.website, ''), cl.website),
  phone    = COALESCE(NULLIF(cu.phone, ''), cl.primary_contact_phone),
  email    = COALESCE(NULLIF(cu.email, ''), cl.primary_contact_email),
  payment_terms = COALESCE(NULLIF(cu.payment_terms, ''), cl.payment_terms),
  billing_address = CASE
    WHEN cu.billing_address IS NULL OR cu.billing_address = '{}'::jsonb THEN
      NULLIF(jsonb_strip_nulls(jsonb_build_object(
        'line1', cl.address_line1, 'line2', cl.address_line2, 'city', cl.city,
        'state', cl.state_province, 'postal_code', cl.postal_code,
        'country', cl.country)), '{}'::jsonb)
    ELSE cu.billing_address END,
  notes = CASE
    WHEN NULLIF(cl.notes, '') IS NULL OR cl.notes = cu.notes THEN cu.notes
    WHEN NULLIF(cu.notes, '') IS NULL THEN cl.notes
    ELSE cu.notes || E'\n\n' || cl.notes END,
  -- Keys a custom field definition does not name are ignored on read, so a
  -- conflicting client value is kept under its own key rather than lost.
  custom_fields = CASE
    WHEN cl.custom_fields IS NULL OR cl.custom_fields IN ('{}'::jsonb, '[]'::jsonb, 'null'::jsonb)
      OR cl.custom_fields = cu.custom_fields THEN cu.custom_fields
    WHEN cu.custom_fields IS NULL OR cu.custom_fields = '{}'::jsonb THEN cl.custom_fields
    ELSE cu.custom_fields || jsonb_build_object('client_custom_fields', cl.custom_fields) END
  FROM _client_map m
  JOIN clients cl ON cl.id = m.client_id
 WHERE cu.id = m.customer_id;

-- 4. Inline contacts become customer_contacts rows ----------------------------

CREATE TEMP TABLE _client_contacts ON COMMIT DROP AS
SELECT cl.tenant_id, m.customer_id, 'primary' AS kind,
       btrim(cl.primary_contact_name) AS name, cl.primary_contact_email AS email,
       cl.primary_contact_phone AS phone, cl.primary_contact_title AS title
  FROM clients cl JOIN _client_map m ON m.client_id = cl.id
 WHERE NULLIF(btrim(cl.primary_contact_name), '') IS NOT NULL
UNION ALL
SELECT cl.tenant_id, m.customer_id, 'billing',
       btrim(cl.billing_contact_name), cl.billing_contact_email,
       cl.billing_contact_phone, 'Billing contact'
  FROM clients cl JOIN _client_map m ON m.client_id = cl.id
 WHERE NULLIF(btrim(cl.billing_contact_name), '') IS NOT NULL
   AND lower(cl.billing_contact_email) IS DISTINCT FROM lower(cl.primary_contact_email);

-- A contact is a portal sign-in identity, unique per tenant by email, so one
-- address cannot belong to two customers. Refuse rather than drop a contact.
  SELECT count(*) INTO n FROM (
    SELECT c.tenant_id, lower(c.email) FROM _client_contacts c
     GROUP BY 1, 2 HAVING count(DISTINCT c.customer_id) > 1
    UNION ALL
    SELECT c.tenant_id, lower(c.email) FROM _client_contacts c
      JOIN customer_contacts x ON x.tenant_id = c.tenant_id
                              AND lower(x.email) = lower(c.email)
                              AND x.customer_id <> c.customer_id) d;
  IF n > 0 THEN
    RAISE EXCEPTION '% client contact email(s) already belong to a different customer. customer_contacts allows one customer per email; resolve them first.', n;
  END IF;

INSERT INTO customer_contacts (tenant_id, customer_id, first_name, last_name, email, phone, title, is_primary, is_active)
SELECT c.tenant_id, c.customer_id,
       CASE WHEN c.name ~ '\s' THEN regexp_replace(c.name, '\s+\S+$', '') ELSE c.name END,
       CASE WHEN c.name ~ '\s' THEN substring(c.name FROM '\S+$') ELSE '' END,
       c.email, c.phone, c.title,
       c.kind = 'primary' AND NOT EXISTS (
         SELECT 1 FROM customer_contacts x WHERE x.customer_id = c.customer_id AND x.is_primary),
       true
  FROM _client_contacts c
 WHERE NOT EXISTS (
   SELECT 1 FROM customer_contacts x
    WHERE x.customer_id = c.customer_id AND lower(x.email) = lower(c.email));

-- 5. Repoint every reference, and make it a real foreign key ------------------

UPDATE projects                        t SET client_id        = m.customer_id FROM _client_map m WHERE t.client_id        = m.client_id;
UPDATE pm_objectives                   t SET client_id        = m.customer_id FROM _client_map m WHERE t.client_id        = m.client_id;
UPDATE time_tracking_entries           t SET client_id        = m.customer_id FROM _client_map m WHERE t.client_id        = m.client_id;
UPDATE time_tracking_hourly_rates      t SET client_id        = m.customer_id FROM _client_map m WHERE t.client_id        = m.client_id;
UPDATE time_tracking_billable_expenses t SET client_id        = m.customer_id FROM _client_map m WHERE t.client_id        = m.client_id;
UPDATE pm_task_comments                t SET author_client_id = m.customer_id FROM _client_map m WHERE t.author_client_id = m.client_id;

ALTER TABLE projects                        RENAME COLUMN client_id        TO customer_id;
ALTER TABLE pm_objectives                   RENAME COLUMN client_id        TO customer_id;
ALTER TABLE time_tracking_entries           RENAME COLUMN client_id        TO customer_id;
ALTER TABLE time_tracking_hourly_rates      RENAME COLUMN client_id        TO customer_id;
ALTER TABLE time_tracking_billable_expenses RENAME COLUMN client_id        TO customer_id;
ALTER TABLE pm_task_comments                RENAME COLUMN author_client_id TO author_customer_id;

ALTER INDEX idx_projects_client_id                        RENAME TO idx_projects_customer_id;
ALTER INDEX idx_pm_objectives_client_id                   RENAME TO idx_pm_objectives_customer_id;
ALTER INDEX idx_time_tracking_hourly_rates_client_id      RENAME TO idx_time_tracking_hourly_rates_customer_id;
ALTER INDEX idx_time_tracking_billable_expenses_client_id RENAME TO idx_time_tracking_billable_expenses_customer_id;

ALTER TABLE projects
  ADD CONSTRAINT fk_projects_customer_id FOREIGN KEY (customer_id) REFERENCES customers(id);
ALTER TABLE pm_objectives
  ADD CONSTRAINT fk_pm_objectives_customer_id FOREIGN KEY (customer_id) REFERENCES customers(id);
ALTER TABLE time_tracking_entries
  ADD CONSTRAINT fk_time_tracking_entries_customer_id FOREIGN KEY (customer_id) REFERENCES customers(id);
ALTER TABLE time_tracking_hourly_rates
  ADD CONSTRAINT fk_time_tracking_hourly_rates_customer_id FOREIGN KEY (customer_id) REFERENCES customers(id);
ALTER TABLE time_tracking_billable_expenses
  ADD CONSTRAINT fk_time_tracking_billable_expenses_customer_id FOREIGN KEY (customer_id) REFERENCES customers(id);
ALTER TABLE pm_task_comments
  ADD CONSTRAINT fk_pm_task_comments_author_customer_id FOREIGN KEY (author_customer_id) REFERENCES customers(id);

DROP TABLE clients;

END $merge$;
