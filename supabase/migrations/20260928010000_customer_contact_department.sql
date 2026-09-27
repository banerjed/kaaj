-- customer_contacts gets a department column, the same shape as its existing
-- `title` — common and structured enough to be a real column rather than a
-- Tier 2 custom field, so it stays fast to filter/autocomplete even at
-- thousands of contacts.
ALTER TABLE customer_contacts ADD COLUMN department VARCHAR(100);

UPDATE customer_contacts SET department = 'General' WHERE department IS NULL;
