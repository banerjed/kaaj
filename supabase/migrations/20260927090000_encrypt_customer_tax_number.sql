-- `customers.tax_number` becomes `tax_number_ct`, sealed to the TENANT subject
-- like the vendor and bank-account identifiers beside it. `clients.tax_id` was
-- already encrypted until `clients` merged into `customers`, where the same
-- value had always been plaintext on a row every employee can read (L103).
--
-- A migration cannot encrypt: the key never enters the database. So this
-- refuses, rather than drops, any tax number that already exists — seal those
-- through $lib/server/pii first. One statement, so it is all-or-nothing under
-- either migration runner (L104).
DO $encrypt$
DECLARE
  n bigint;
BEGIN
PERFORM set_config('row_security', 'off', true);

SELECT count(*) INTO n FROM customers WHERE NULLIF(tax_number, '') IS NOT NULL;
IF n > 0 THEN
  RAISE EXCEPTION '% customer(s) hold a plaintext tax_number. Seal each into tax_number_ct through $lib/server/pii first; nothing has been changed.', n;
END IF;

ALTER TABLE customers ADD COLUMN tax_number_ct text;
ALTER TABLE customers DROP COLUMN tax_number;

END $encrypt$;
