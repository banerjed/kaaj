-- =============================================================================
-- Kaaj — field-level PII encryption: per-subject keys and the first field
-- =============================================================================
-- Storage only; the cryptography lives in apps/web/src/lib/server/pii/, not
-- pgcrypto — encrypting in Postgres would put plaintext and key in the same
-- process (memory, statement log). A stolen backup stays inert without
-- PRIVATE_PII_KEK, which never reaches this database.
--
-- The spec's `DERIVE_KEY(org_prefix + org_4digit_code)` is NOT implemented —
-- ~13 bits of entropy, both inputs in this database. `{prefix}-{4digit}` is
-- kept only as a key LABEL; key material is 32 random bytes. See
-- docs/13-pii-encryption.md.
-- =============================================================================


-- -----------------------------------------------------------------------------
-- 1. Per-subject data keys
-- -----------------------------------------------------------------------------
-- One key per data subject, not per tenant: GDPR Art. 17 is an individual
-- right, so deleting a row here must render just that person's fields
-- unrecoverable — including in old backups. Only the WRAPPED key is stored;
-- unwrapping needs PRIVATE_PII_KEK, not present in this database.

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
-- Key destruction leaves no trace by design; this records THAT a key was
-- destroyed (never the key), append-only, surviving the subject's own
-- deletion — needed to demonstrate compliance (GDPR Art. 30, DPDP Act).

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
-- Drop the plaintext btree index first — it stores every tax identifier in
-- its pages, and dropping the column later would not scrub them. No blind
-- index replaces it: exact-match lookup isn't a feature we have, and an HMAC
-- index would make equal values linkable for no benefit.

DROP INDEX IF EXISTS idx_employees_ssn_tax_id;

ALTER TABLE employees ADD COLUMN ssn_tax_id_ct TEXT;

COMMENT ON COLUMN employees.ssn_tax_id_ct IS
    'AES-256-GCM envelope. Read and written only through $lib/server/pii.';

-- Refuse rather than destroy: a plain DROP COLUMN would throw away data no
-- backup should be used to recover.
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
