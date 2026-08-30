-- =============================================================================
-- Kaaj — the remaining seventeen PII columns
-- =============================================================================
-- 20260829140000 built the machinery and encrypted employees.ssn_tax_id;
-- 20260829150000 (in the same commit) added the first bank account number.
-- Seventeen columns stayed plaintext, tracked by `_pii_pending` in
-- verify-invariants.sql so they could not be forgotten. This closes them.
--
-- None of these columns has an application consumer yet — no repository reads
-- or writes them — so this is a schema and fixture change with no call sites to
-- update. That is precisely why it is worth doing NOW: the modules that will
-- consume them get sealField()/openField() as the only available path, rather
-- than inheriting a plaintext column and a migration to do later.
--
-- TWO KINDS OF SUBJECT.
--   employee — bank details, emergency contacts, certifications. Erasing the
--              person destroys them, which is what Article 17 requires.
--   tenant   — the firm's OWN banking, and its clients' and vendors' tax and
--              bank identifiers. These belong to the firm, not to any employee,
--              so erasing an employee must not take a client's tax ID with it.
-- =============================================================================

-- pii_keys.subject_type defaulted to 'employee' and was never constrained.
-- Naming the two kinds makes a typo a failed write rather than an orphaned key
-- whose ciphertext can never be opened.
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

-- An index over any of these keeps the plaintext readable in its pages, and
-- dropping the column does NOT scrub the pages the index was built from — so
-- the index goes first, exactly as idx_employees_ssn_tax_id did.
--
-- idx_clients_tax_id was found by the assertion below rather than by reading
-- the schema, which is the argument for having written the assertion.
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

-- bank_accounts.account_number_encrypted was never encrypted: it shipped
-- holding `enc:<uuid>` placeholders beside a plaintext account_number. Now that
-- account_number_ct carries the real ciphertext, the placeholder column is a
-- second name for the same field that only ever asserted a protection it did
-- not provide. It goes.
ALTER TABLE bank_accounts DROP COLUMN account_number_encrypted;
