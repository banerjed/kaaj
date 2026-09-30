-- The CRM is the firm's own view of its customers. customers, crm_deals,
-- crm_activities and crm_pipeline_stages carried only tenant_isolation, so a
-- customer's portal contact could read every company, every deal's value and
-- every logged call in the firm. A portal contact now reads their own
-- company's row and nothing else of the CRM, and writes none of it.
--
-- Staff visibility is unchanged: these stay tenant-wide for staff.

CREATE POLICY portal_reads_own_customer ON customers AS RESTRICTIVE FOR SELECT
    USING (NOT (SELECT app.is_portal_contact()) OR id = (SELECT app.current_customer_id()));
CREATE POLICY portal_no_insert ON customers AS RESTRICTIVE FOR INSERT
    WITH CHECK (NOT (SELECT app.is_portal_contact()));
CREATE POLICY portal_no_update ON customers AS RESTRICTIVE FOR UPDATE
    USING (NOT (SELECT app.is_portal_contact()))
    WITH CHECK (NOT (SELECT app.is_portal_contact()));

CREATE POLICY portal_no_access ON crm_deals AS RESTRICTIVE FOR ALL
    USING (NOT (SELECT app.is_portal_contact()))
    WITH CHECK (NOT (SELECT app.is_portal_contact()));
CREATE POLICY portal_no_access ON crm_activities AS RESTRICTIVE FOR ALL
    USING (NOT (SELECT app.is_portal_contact()))
    WITH CHECK (NOT (SELECT app.is_portal_contact()));
CREATE POLICY portal_no_access ON crm_pipeline_stages AS RESTRICTIVE FOR ALL
    USING (NOT (SELECT app.is_portal_contact()))
    WITH CHECK (NOT (SELECT app.is_portal_contact()));

-- A contact's custom fields are the firm's notes about that person; a portal
-- contact who can see a colleague's contact row must not read them. Ticket
-- values stay visible on the customer's own tickets. Restated whole.
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
);
