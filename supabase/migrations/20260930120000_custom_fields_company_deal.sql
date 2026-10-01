-- Custom fields on companies (customers) and deals (crm_deals) —
-- docs/31-custom-fields.md step 2. Each kind of record gets its value column,
-- composite foreign key, partial index, a place in the generated entity_type,
-- the one-record CHECK and the uniqueness key, and a policy arm.

ALTER TABLE custom_field_definitions
    DROP CONSTRAINT ck_custom_field_definitions_entity_type,
    ADD CONSTRAINT ck_custom_field_definitions_entity_type
        CHECK (entity_type IN ('company', 'customer_contact', 'deal', 'employee',
                               'project', 'task', 'ticket'));

ALTER TABLE customers ADD CONSTRAINT uq_customers_tenant_id_id UNIQUE (tenant_id, id);
ALTER TABLE crm_deals ADD CONSTRAINT uq_crm_deals_tenant_id_id UNIQUE (tenant_id, id);

ALTER TABLE custom_field_values
    ADD COLUMN company_id UUID,
    ADD COLUMN deal_id    UUID;

-- The generated column cannot be re-expressed in place on every Postgres this
-- runs on, so it is dropped and re-added; the FK that uses it goes with it.
ALTER TABLE custom_field_values
    DROP CONSTRAINT fk_custom_field_values_definition,
    DROP CONSTRAINT ck_custom_field_values_one_record,
    DROP CONSTRAINT custom_field_values_unique,
    DROP COLUMN entity_type;

ALTER TABLE custom_field_values
    ADD COLUMN entity_type TEXT GENERATED ALWAYS AS (
        CASE
            WHEN project_id          IS NOT NULL THEN 'project'
            WHEN task_id             IS NOT NULL THEN 'task'
            WHEN customer_contact_id IS NOT NULL THEN 'customer_contact'
            WHEN ticket_id           IS NOT NULL THEN 'ticket'
            WHEN company_id          IS NOT NULL THEN 'company'
            WHEN deal_id             IS NOT NULL THEN 'deal'
        END) STORED;

ALTER TABLE custom_field_values
    ADD CONSTRAINT ck_custom_field_values_one_record
        CHECK (num_nonnulls(project_id, task_id, customer_contact_id, ticket_id,
                            company_id, deal_id) = 1),
    ADD CONSTRAINT fk_custom_field_values_company
        FOREIGN KEY (tenant_id, company_id) REFERENCES customers (tenant_id, id),
    ADD CONSTRAINT fk_custom_field_values_deal
        FOREIGN KEY (tenant_id, deal_id) REFERENCES crm_deals (tenant_id, id),
    ADD CONSTRAINT fk_custom_field_values_definition
        FOREIGN KEY (tenant_id, field_definition_id, entity_type)
        REFERENCES custom_field_definitions (tenant_id, id, entity_type),
    ADD CONSTRAINT custom_field_values_unique
        UNIQUE NULLS NOT DISTINCT (tenant_id, field_definition_id,
                                   project_id, task_id, customer_contact_id,
                                   ticket_id, company_id, deal_id);

CREATE INDEX idx_custom_field_values_company
    ON custom_field_values (tenant_id, company_id) WHERE company_id IS NOT NULL;
CREATE INDEX idx_custom_field_values_deal
    ON custom_field_values (tenant_id, deal_id) WHERE deal_id IS NOT NULL;

-- Company and deal fields are the firm's own view of its customers; like the
-- CRM tables themselves (20260930110000), a portal contact reads none of them.
DROP POLICY custom_field_value_visibility ON custom_field_values;
CREATE POLICY custom_field_value_visibility ON custom_field_values AS RESTRICTIVE FOR SELECT
USING (
       (project_id IS NOT NULL
        AND EXISTS (SELECT 1 FROM projects p WHERE p.id = custom_field_values.project_id))
    OR (task_id IS NOT NULL
        AND EXISTS (SELECT 1 FROM tasks t WHERE t.id = custom_field_values.task_id))
    OR (customer_contact_id IS NOT NULL
        AND NOT (SELECT app.is_portal_contact())
        AND EXISTS (SELECT 1 FROM customer_contacts cc WHERE cc.id = custom_field_values.customer_contact_id))
    OR (ticket_id IS NOT NULL
        AND EXISTS (SELECT 1 FROM ticketing_tickets tt WHERE tt.id = custom_field_values.ticket_id))
    OR (company_id IS NOT NULL
        AND NOT (SELECT app.is_portal_contact())
        AND EXISTS (SELECT 1 FROM customers c WHERE c.id = custom_field_values.company_id))
    OR (deal_id IS NOT NULL
        AND NOT (SELECT app.is_portal_contact())
        AND EXISTS (SELECT 1 FROM crm_deals d WHERE d.id = custom_field_values.deal_id))
);
