-- The portal authenticates through auth claims (`customer_contact_id`), and
-- nothing in the application reads or writes this column. `customers` rows are
-- readable by every staff member, so a credential-shaped value here was
-- readable by all of them, with no reader to justify keeping it.
ALTER TABLE customers DROP COLUMN portal_access_token;
