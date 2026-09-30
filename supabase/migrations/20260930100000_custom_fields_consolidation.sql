-- Custom fields: one mechanism for every record (docs/31-custom-fields.md).
--
-- Definitions gain a category (a heading, NOT NULL, default 'General') and
-- lose three columns nothing read. Values point at their record through one
-- foreign key per kind of record instead of an unchecked (entity_type,
-- entity_id) pair, and ticket values move out of ticketing_tickets.custom_fields
-- into custom_field_values.

-- -----------------------------------------------------------------------------
-- 1. Refuse to start if existing rows break a rule this migration adds.
-- -----------------------------------------------------------------------------
DO $$
DECLARE
    bad_type int; bad_area int; dup_key int; orphan int;
BEGIN
    SELECT count(*) INTO bad_type FROM custom_field_definitions
     WHERE entity_type NOT IN ('customer_contact', 'employee', 'project', 'task', 'ticket');

    SELECT count(*) INTO bad_area FROM custom_field_definitions
     WHERE (entity_type = 'ticket') <> (business_area_id IS NOT NULL);

    SELECT count(*) INTO dup_key FROM (
        SELECT 1 FROM custom_field_definitions
         GROUP BY tenant_id, entity_type, business_area_id, field_key
        HAVING count(*) > 1) d;

    SELECT count(*) INTO orphan FROM custom_field_values v
     WHERE NOT CASE v.entity_type
        WHEN 'project' THEN EXISTS (SELECT 1 FROM projects x WHERE x.id = v.entity_id AND x.tenant_id = v.tenant_id)
        WHEN 'task' THEN EXISTS (SELECT 1 FROM tasks x WHERE x.id = v.entity_id AND x.tenant_id = v.tenant_id)
        WHEN 'customer_contact' THEN EXISTS (SELECT 1 FROM customer_contacts x WHERE x.id = v.entity_id AND x.tenant_id = v.tenant_id)
        ELSE false END
        OR NOT EXISTS (SELECT 1 FROM custom_field_definitions d
                        WHERE d.id = v.field_definition_id AND d.entity_type = v.entity_type);

    IF bad_type + bad_area + dup_key + orphan > 0 THEN
        RAISE EXCEPTION 'custom fields: % definitions with an unknown entity type, % with a business area that does not match, % duplicate field keys, % values whose record or field does not match — correct these first',
            bad_type, bad_area, dup_key, orphan;
    END IF;
END $$;

-- -----------------------------------------------------------------------------
-- 2. Definitions.
-- -----------------------------------------------------------------------------
UPDATE custom_field_definitions SET field_group = 'General'
 WHERE field_group IS NULL OR btrim(field_group) = '';

ALTER TABLE custom_field_definitions RENAME COLUMN field_group TO category;
ALTER TABLE custom_field_definitions
    ALTER COLUMN category SET DEFAULT 'General',
    ALTER COLUMN category SET NOT NULL,
    ADD CONSTRAINT ck_custom_field_definitions_category
        CHECK (btrim(category) <> '' AND char_length(category) <= 100),
    DROP COLUMN label_i18n,
    DROP COLUMN validation,
    DROP COLUMN default_value,
    ADD CONSTRAINT ck_custom_field_definitions_entity_type
        CHECK (entity_type IN ('customer_contact', 'employee', 'project', 'task', 'ticket')),
    ADD CONSTRAINT ck_custom_field_definitions_ticket_area
        CHECK ((entity_type = 'ticket') = (business_area_id IS NOT NULL));

ALTER TABLE ticketing_business_areas
    ADD CONSTRAINT uq_ticketing_business_areas_tenant_id_id UNIQUE (tenant_id, id);

ALTER TABLE custom_field_definitions
    DROP CONSTRAINT custom_field_definitions_business_area_id_fkey,
    ADD CONSTRAINT fk_custom_field_definitions_business_area
        FOREIGN KEY (tenant_id, business_area_id)
        REFERENCES ticketing_business_areas (tenant_id, id),
    DROP CONSTRAINT custom_field_definitions_tenant_id_entity_type_field_key_key,
    ADD CONSTRAINT uq_custom_field_definitions_key
        UNIQUE NULLS NOT DISTINCT (tenant_id, entity_type, business_area_id, field_key),
    ADD CONSTRAINT uq_custom_field_definitions_tenant_id_id_entity_type
        UNIQUE (tenant_id, id, entity_type);

-- -----------------------------------------------------------------------------
-- 3. Values: one foreign key per kind of record.
-- -----------------------------------------------------------------------------
ALTER TABLE projects          ADD CONSTRAINT uq_projects_tenant_id_id          UNIQUE (tenant_id, id);
ALTER TABLE tasks             ADD CONSTRAINT uq_tasks_tenant_id_id             UNIQUE (tenant_id, id);
ALTER TABLE customer_contacts ADD CONSTRAINT uq_customer_contacts_tenant_id_id UNIQUE (tenant_id, id);
ALTER TABLE ticketing_tickets ADD CONSTRAINT uq_ticketing_tickets_tenant_id_id UNIQUE (tenant_id, id);

ALTER TABLE custom_field_values
    ADD COLUMN project_id          UUID,
    ADD COLUMN task_id             UUID,
    ADD COLUMN customer_contact_id UUID,
    ADD COLUMN ticket_id           UUID;

UPDATE custom_field_values SET
    project_id          = CASE WHEN entity_type = 'project'          THEN entity_id END,
    task_id             = CASE WHEN entity_type = 'task'             THEN entity_id END,
    customer_contact_id = CASE WHEN entity_type = 'customer_contact' THEN entity_id END;

-- The policy and the unique key name the old columns.
DROP POLICY custom_field_value_visibility ON custom_field_values;

ALTER TABLE custom_field_values
    DROP CONSTRAINT custom_field_values_unique,
    DROP CONSTRAINT custom_field_values_field_definition_id_fkey,
    DROP COLUMN entity_type,
    DROP COLUMN entity_id;

ALTER TABLE custom_field_values
    ADD COLUMN entity_type TEXT GENERATED ALWAYS AS (
        CASE
            WHEN project_id          IS NOT NULL THEN 'project'
            WHEN task_id             IS NOT NULL THEN 'task'
            WHEN customer_contact_id IS NOT NULL THEN 'customer_contact'
            WHEN ticket_id           IS NOT NULL THEN 'ticket'
        END) STORED;

ALTER TABLE custom_field_values
    ADD CONSTRAINT ck_custom_field_values_one_record
        CHECK (num_nonnulls(project_id, task_id, customer_contact_id, ticket_id) = 1),
    ADD CONSTRAINT fk_custom_field_values_project
        FOREIGN KEY (tenant_id, project_id) REFERENCES projects (tenant_id, id),
    ADD CONSTRAINT fk_custom_field_values_task
        FOREIGN KEY (tenant_id, task_id) REFERENCES tasks (tenant_id, id),
    ADD CONSTRAINT fk_custom_field_values_customer_contact
        FOREIGN KEY (tenant_id, customer_contact_id) REFERENCES customer_contacts (tenant_id, id),
    ADD CONSTRAINT fk_custom_field_values_ticket
        FOREIGN KEY (tenant_id, ticket_id) REFERENCES ticketing_tickets (tenant_id, id),
    ADD CONSTRAINT fk_custom_field_values_definition
        FOREIGN KEY (tenant_id, field_definition_id, entity_type)
        REFERENCES custom_field_definitions (tenant_id, id, entity_type),
    ADD CONSTRAINT custom_field_values_unique
        UNIQUE NULLS NOT DISTINCT (tenant_id, field_definition_id,
                                   project_id, task_id, customer_contact_id, ticket_id);

CREATE INDEX idx_custom_field_values_project
    ON custom_field_values (tenant_id, project_id) WHERE project_id IS NOT NULL;
CREATE INDEX idx_custom_field_values_task
    ON custom_field_values (tenant_id, task_id) WHERE task_id IS NOT NULL;
CREATE INDEX idx_custom_field_values_customer_contact
    ON custom_field_values (tenant_id, customer_contact_id) WHERE customer_contact_id IS NOT NULL;
CREATE INDEX idx_custom_field_values_ticket
    ON custom_field_values (tenant_id, ticket_id) WHERE ticket_id IS NOT NULL;

-- A value is readable by whoever can read its record.
CREATE POLICY custom_field_value_visibility ON custom_field_values AS RESTRICTIVE FOR SELECT
USING (
       (project_id IS NOT NULL
        AND EXISTS (SELECT 1 FROM projects p WHERE p.id = custom_field_values.project_id))
    OR (task_id IS NOT NULL
        AND EXISTS (SELECT 1 FROM tasks t WHERE t.id = custom_field_values.task_id))
    OR (customer_contact_id IS NOT NULL
        AND EXISTS (SELECT 1 FROM customer_contacts cc WHERE cc.id = custom_field_values.customer_contact_id))
    OR (ticket_id IS NOT NULL
        AND EXISTS (SELECT 1 FROM ticketing_tickets tt WHERE tt.id = custom_field_values.ticket_id))
);

-- -----------------------------------------------------------------------------
-- 4. Ticket values move out of ticketing_tickets.custom_fields.
--    Every key must match a field of the ticket's own area, and every value
--    must have that field's JSON shape; anything else is refused rather than
--    guessed at or dropped.
-- -----------------------------------------------------------------------------
DO $$
DECLARE
    unmatched int; misshapen int;
BEGIN
    CREATE TEMP TABLE _ticket_values AS
    SELECT t.tenant_id, t.id AS ticket_id, t.last_updated_by, kv.key, kv.value,
           d.id AS definition_id, d.data_type
      FROM ticketing_tickets t
      CROSS JOIN LATERAL jsonb_each(coalesce(t.custom_fields, '{}'::jsonb)) kv
      LEFT JOIN custom_field_definitions d
        ON d.tenant_id = t.tenant_id AND d.entity_type = 'ticket'
       AND d.business_area_id = t.business_area_id AND d.field_key = kv.key
     WHERE jsonb_typeof(kv.value) <> 'null';

    SELECT count(*) INTO unmatched FROM _ticket_values WHERE definition_id IS NULL;
    SELECT count(*) INTO misshapen FROM _ticket_values
     WHERE definition_id IS NOT NULL AND NOT CASE data_type
        WHEN 'boolean'     THEN jsonb_typeof(value) = 'boolean'
        WHEN 'multiselect' THEN jsonb_typeof(value) = 'array'
        WHEN 'number'      THEN jsonb_typeof(value) IN ('number', 'string')
        WHEN 'money'       THEN jsonb_typeof(value) IN ('number', 'string')
        ELSE jsonb_typeof(value) = 'string' END;

    IF unmatched + misshapen > 0 THEN
        RAISE EXCEPTION 'ticket custom fields: % values with no matching field in their area, % of the wrong shape — correct these first',
            unmatched, misshapen;
    END IF;

    INSERT INTO custom_field_values (
        tenant_id, field_definition_id, ticket_id, updated_by,
        value_text, value_number, value_money, value_date, value_boolean, value_multi)
    SELECT tenant_id, definition_id, ticket_id, last_updated_by,
           CASE WHEN data_type IN ('text', 'select') THEN value #>> '{}' END,
           CASE WHEN data_type = 'number' THEN (value #>> '{}')::numeric(18,4) END,
           CASE WHEN data_type = 'money'  THEN (value #>> '{}')::numeric(15,2) END,
           CASE WHEN data_type = 'date'   THEN (value #>> '{}')::date END,
           CASE WHEN data_type = 'boolean' THEN (value)::boolean END,
           CASE WHEN data_type = 'multiselect' THEN value END
      FROM _ticket_values;

    DROP TABLE _ticket_values;
END $$;

ALTER TABLE ticketing_tickets DROP COLUMN custom_fields;
