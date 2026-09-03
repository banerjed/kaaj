-- =============================================================================
-- Kaaj — the remaining PII columns, encrypted (see 20260829140000)
-- =============================================================================
-- No repository reads/writes these columns yet, so this closes the gap before
-- any consumer inherits a plaintext column.
--
-- Two kinds of subject: employee (bank details, emergency contacts,
-- certifications — erased with the person, per Art. 17) and tenant (the
-- firm's own banking, and its clients'/vendors' identifiers — must survive an
-- employee's erasure).
-- =============================================================================

-- Constrains subject_type so a typo fails the write instead of orphaning a
-- key whose ciphertext can never be opened.
ALTER TABLE pii_keys
    ADD CONSTRAINT pii_keys_subject_type_is_known
    CHECK (subject_type IN ('employee', 'tenant'));

-- -- Employee-subject ---------------------------------------------------------
ALTER TABLE employee_bank_accounts
    ADD COLUMN routing_number_ct TEXT,
    ADD COLUMN ifsc_code_ct      TEXT,
    ADD COLUMN sort_code_ct      TEXT,
    ADD COLUMN iban_ct           TEXT,
    ADD COLUMN bic_swift_ct      TEXT;

ALTER TABLE hr_emergency_contacts
    ADD COLUMN phone_primary_ct   TEXT,
    ADD COLUMN phone_secondary_ct TEXT,
    ADD COLUMN email_ct           TEXT,
    ADD COLUMN address_ct         TEXT;

ALTER TABLE employee_certifications
    ADD COLUMN certification_number_ct TEXT;

-- -- Tenant-subject -----------------------------------------------------------
ALTER TABLE clients        ADD COLUMN tax_id_ct TEXT;

ALTER TABLE vendors
    ADD COLUMN bank_account_number_ct TEXT,
    ADD COLUMN bank_routing_number_ct TEXT;

ALTER TABLE bank_accounts
    ADD COLUMN account_number_ct  TEXT,
    ADD COLUMN iban_ct            TEXT,
    ADD COLUMN routing_number_ct  TEXT,
    ADD COLUMN swift_code_ct      TEXT;

-- Drop indexes over these columns first (dropping the column later would not
-- scrub the index pages).
DROP INDEX IF EXISTS idx_clients_tax_id;

-- Then refuse to proceed if any other survives.
DO $$
DECLARE bad TEXT;
BEGIN
    SELECT string_agg(indexname, ', ') INTO bad
      FROM pg_indexes
     WHERE schemaname = 'public'
       AND indexdef ~ '\y(routing_number|ifsc_code|sort_code|iban|bic_swift|phone_primary|phone_secondary|address|certification_number|tax_id|bank_account_number|bank_routing_number|account_number|swift_code)\y'
       AND indexdef !~ '_ct\y';
    IF bad IS NOT NULL THEN
        RAISE EXCEPTION 'indexes over PII plaintext must be dropped first: %', bad;
    END IF;
END $$;

ALTER TABLE employee_bank_accounts
    DROP COLUMN routing_number, DROP COLUMN ifsc_code, DROP COLUMN sort_code,
    DROP COLUMN iban, DROP COLUMN bic_swift;

ALTER TABLE hr_emergency_contacts
    DROP COLUMN phone_primary, DROP COLUMN phone_secondary,
    DROP COLUMN email, DROP COLUMN address;

ALTER TABLE employee_certifications DROP COLUMN certification_number;

ALTER TABLE clients  DROP COLUMN tax_id;
ALTER TABLE vendors  DROP COLUMN bank_account_number, DROP COLUMN bank_routing_number;
ALTER TABLE bank_accounts
    DROP COLUMN account_number, DROP COLUMN iban,
    DROP COLUMN routing_number, DROP COLUMN swift_code;

-- account_number_encrypted was never actually encrypted (placeholder values
-- only); account_number_ct now carries the real ciphertext.
ALTER TABLE bank_accounts DROP COLUMN account_number_encrypted;
