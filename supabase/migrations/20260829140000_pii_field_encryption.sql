-- =============================================================================
-- Kaaj — field-level PII encryption: per-subject keys and the first field
-- =============================================================================
-- docs/module-employee-profile.md § Encryption Specification requires PII to be
-- encrypted at rest, with keys stored separately from the data, AES-256-GCM,
-- and a key version on every value. This migration provides the storage for
-- that. The cryptography itself is in the application
-- (apps/web/src/lib/server/pii/), deliberately:
--
--   * pgcrypto would put the plaintext AND the key into this server's memory,
--     its statement log, and pg_stat_statements — which is installed here. A
--     database compromise would then yield both halves.
--   * pgsodium is deprecated by Supabase and is not an option.
--
-- Encrypting in the application means a dump, a replica or a stolen backup is
-- inert without PRIVATE_PII_KEK, which never reaches Postgres.
--
-- THE SPEC'S KEY DERIVATION IS NOT IMPLEMENTED, AND MUST NOT BE. It says
-- `DERIVE_KEY(org_prefix + org_4digit_code)`. A public prefix plus four digits
-- is ten thousand candidates — about 13 bits — and both inputs live in this
-- database. No KDF repairs a search space that small. `{prefix}-{4digit}` is
-- kept as the key LABEL, which is what the spec's storage format wants; the key
-- material is 32 random bytes. See docs/13-pii-encryption.md.
-- =============================================================================


-- -----------------------------------------------------------------------------
-- 1. Per-subject data keys
-- -----------------------------------------------------------------------------
-- One key per DATA SUBJECT, not per tenant. GDPR Article 17 is an individual
-- right: destroying a tenant-wide key cannot answer one employee's erasure
-- request, and a per-subject key can. Deleting a row here renders every
-- encrypted field belonging to that person unrecoverable at once — including in
-- backups taken before the request, which no `UPDATE ... SET NULL` achieves.
--
-- The row holds only the WRAPPED key. Unwrapping needs PRIVATE_PII_KEK, which
-- is not in this database, so `app_user` reading this table learns nothing.

CREATE TABLE pii_keys (
    id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id     UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    -- Only 'employee' today. Named rather than assumed so a client or vendor
    -- subject does not need a second table.
    subject_type  TEXT NOT NULL DEFAULT 'employee',
    subject_id    UUID NOT NULL,
    -- The specification's `{org_prefix}-{4digit_code}`. An IDENTIFIER, never
    -- key material — see the header.
    key_label     TEXT,
    kek_version   INTEGER NOT NULL,
    -- {"v":1,"k":<kek version>,"iv":...,"ct":...,"tag":...}
    wrapped_dek   TEXT NOT NULL,
    created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT pii_keys_one_per_subject UNIQUE (tenant_id, subject_type, subject_id)
);

CREATE INDEX idx_pii_keys_subject ON pii_keys (tenant_id, subject_type, subject_id);
CREATE INDEX idx_pii_keys_kek_version ON pii_keys (tenant_id, kek_version);

ALTER TABLE pii_keys ENABLE ROW LEVEL SECURITY;
ALTER TABLE pii_keys FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON pii_keys
    USING (tenant_id = app.current_tenant_id())
    WITH CHECK (tenant_id = app.current_tenant_id());

CREATE TRIGGER set_updated_at BEFORE UPDATE ON pii_keys
    FOR EACH ROW EXECUTE FUNCTION app.set_updated_at();


-- -----------------------------------------------------------------------------
-- 2. The erasure record
-- -----------------------------------------------------------------------------
-- Destroying a key leaves no trace by design, which is a problem when a
-- regulator asks you to demonstrate that an erasure request was honoured. This
-- table records THAT a key was destroyed, never the key. It is append-only in
-- practice and deliberately survives the subject's own deletion.
--
-- GDPR Article 30 (records of processing), and the equivalent demonstrability
-- expectations in India's DPDP Act.

CREATE TABLE pii_erasures (
    id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id     UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    subject_type  TEXT NOT NULL,
    subject_id    UUID NOT NULL,
    -- Kept for the record even though the subject row may be gone.
    subject_label TEXT,
    reason        TEXT NOT NULL,
    requested_by  UUID,
    erased_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
    created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_pii_erasures_subject ON pii_erasures (tenant_id, subject_type, subject_id);
CREATE INDEX idx_pii_erasures_erased_at ON pii_erasures (tenant_id, erased_at DESC);

ALTER TABLE pii_erasures ENABLE ROW LEVEL SECURITY;
ALTER TABLE pii_erasures FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON pii_erasures
    USING (tenant_id = app.current_tenant_id())
    WITH CHECK (tenant_id = app.current_tenant_id());

CREATE TRIGGER set_updated_at BEFORE UPDATE ON pii_erasures
    FOR EACH ROW EXECUTE FUNCTION app.set_updated_at();


-- -----------------------------------------------------------------------------
-- 3. employees.ssn_tax_id becomes ciphertext
-- -----------------------------------------------------------------------------
-- The plaintext index goes first, and it is the more urgent half. A btree on
-- (tenant_id, ssn_tax_id) stores every tax identifier in its index pages, so
-- encrypting the column while leaving the index would have left the plaintext
-- readable in a file dump — and dropping a column does not scrub the index
-- pages it was built from.
--
-- No blind index replaces it: exact-match lookup by tax identifier is not a
-- feature this product has, and an HMAC index would make equal values linkable
-- for no current benefit. Adding one later means re-encrypting, which is
-- recorded here so the choice is visible rather than forgotten.

DROP INDEX IF EXISTS idx_employees_ssn_tax_id;

ALTER TABLE employees ADD COLUMN ssn_tax_id_ct TEXT;

COMMENT ON COLUMN employees.ssn_tax_id_ct IS
    'AES-256-GCM envelope. Read and written only through $lib/server/pii.';

-- Refuse rather than destroy. On an empty database this is a no-op; on one
-- holding real identifiers it stops the migration until the values have been
-- encrypted into ssn_tax_id_ct, because a plain DROP COLUMN here would throw
-- away data no backup should be used to recover.
DO $$
DECLARE
    remaining BIGINT;
BEGIN
    SELECT count(*) INTO remaining FROM employees WHERE ssn_tax_id IS NOT NULL;
    IF remaining > 0 THEN
        RAISE EXCEPTION
            'employees.ssn_tax_id still holds % plaintext value(s). Encrypt '
            'them into ssn_tax_id_ct first — sealField() in '
            'apps/web/src/lib/server/pii/pii.repo.ts, one row at a time with '
            'the row id as the binding — then re-run this migration. Doing it '
            'in SQL is not possible and not meant to be: the key is not in '
            'this database.', remaining;
    END IF;
END $$;

ALTER TABLE employees DROP COLUMN ssn_tax_id;
