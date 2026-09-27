-- Tier 2 custom fields extend to customer_contacts. The RESTRICTIVE
-- visibility policy on custom_field_values fails closed per entity_type
-- (L103's own reasoning) — restating it whole, per this repo's DROP/CREATE
-- rule for row policies, rather than adding a third arm by ALTER.
DROP POLICY custom_field_value_visibility ON custom_field_values;

CREATE POLICY custom_field_value_visibility ON custom_field_values AS RESTRICTIVE FOR SELECT
USING (
    (entity_type = 'project'
     AND EXISTS (SELECT 1 FROM projects p WHERE p.id = custom_field_values.entity_id))
    OR (entity_type = 'task'
     AND EXISTS (SELECT 1 FROM tasks t WHERE t.id = custom_field_values.entity_id))
    OR (entity_type = 'customer_contact'
     AND EXISTS (SELECT 1 FROM customer_contacts cc WHERE cc.id = custom_field_values.entity_id))
);
