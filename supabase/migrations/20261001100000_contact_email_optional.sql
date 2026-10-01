-- An individual client often has a phone number and no email — a salon's
-- walk-in, a tutor's parent contact. The column was NOT NULL because a
-- contact used to be a portal sign-in identity; the portal is off
-- (20260930130000) and a contact is now just a person on file.
--
-- UNIQUE (tenant_id, email) is deliberately left alone: Postgres treats
-- NULLs as distinct, so any number of contacts may have no email while a
-- real address stays unique per tenant.
ALTER TABLE customer_contacts ALTER COLUMN email DROP NOT NULL;
