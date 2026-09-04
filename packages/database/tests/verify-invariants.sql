-- =============================================================================
-- Kaaj — schema design invariants
-- =============================================================================
-- Rules from the ADRs that the schema must satisfy, expressed as assertions.
-- The snapshot pins what the schema IS; these check that a change obeys a RULE.
--
--   psql "$DATABASE_URL" -v strict=1 -f packages/database/tests/verify-invariants.sql
--
-- Every exemption below is a committed literal with a reason, never a pattern
-- filter — see packages/database/tests/verify-rls.sql for why.
-- =============================================================================

\set ON_ERROR_STOP on
\pset pager off
\if :{?strict} \else \set strict 0 \endif

CREATE TEMP TABLE _inv (
    seq     SERIAL,
    rule    TEXT,
    subject TEXT,
    passed  BOOLEAN,
    detail  TEXT
);

-- Not part of the Kaaj schema (CMSaasStarter leftovers, pending removal —
-- see docs/07-app-provenance.md).
CREATE TEMP TABLE _foreign_tables (tbl TEXT PRIMARY KEY);
INSERT INTO _foreign_tables VALUES ('profiles'), ('stripe_customers'), ('contact_requests');

-- =============================================================================
-- RULE 1 — tenant_id leads every index on a tenant-scoped table (ADR-003 #2)
-- =============================================================================
-- tenant_id must lead every index on a shared instance: (tenant_id, status,
-- created_at), never (status, created_at). Six named exemptions below; the
-- assertion is set EQUALITY so a seventh, or a silently dropped one, fails.
CREATE TEMP TABLE _index_exempt (idx TEXT PRIMARY KEY, reason TEXT);
INSERT INTO _index_exempt VALUES
  ('idx_jobs_claim',
   'the worker claims jobs across all tenants; leading with status is the point'),
  ('idx_payroll_tax_rates_statutory',
   'partial unique WHERE tenant_id IS NULL — statutory rates are global'),
  ('idx_tenant_users_user',
   'login resolves a user across tenants before a tenant is known'),
  ('idx_employees_custom_fields',
   'GIN jsonb_path_ops; could take (tenant_id, custom_fields) via btree_gin'),
  ('idx_projects_custom_fields',
   'GIN jsonb_path_ops; same'),
  ('idx_tasks_custom_fields',
   'GIN jsonb_path_ops; same');

CREATE TEMP VIEW _index_violations AS
  SELECT i.relname AS idx, c.relname AS tbl
    FROM pg_index x
    JOIN pg_class c ON c.oid = x.indrelid
    JOIN pg_class i ON i.oid = x.indexrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
   WHERE n.nspname = 'public'
     AND NOT x.indisprimary
     AND c.relname NOT IN (SELECT tbl FROM _foreign_tables)
     AND EXISTS (SELECT 1 FROM information_schema.columns col
                  WHERE col.table_schema = 'public'
                    AND col.table_name = c.relname
                    AND col.column_name = 'tenant_id')
     AND (SELECT a.attname FROM pg_attribute a
           WHERE a.attrelid = x.indrelid AND a.attnum = x.indkey[0])
         IS DISTINCT FROM 'tenant_id';

-- 1a. No UNEXPECTED violation.
INSERT INTO _inv (rule, subject, passed, detail)
SELECT 'index/tenant-leading', '(new violations)',
       NOT EXISTS (SELECT 1 FROM _index_violations v
                    WHERE v.idx NOT IN (SELECT idx FROM _index_exempt)),
       coalesce('indexes not leading with tenant_id and not exempt: ' ||
                (SELECT string_agg(v.tbl || '.' || v.idx, ', ' ORDER BY v.idx)
                   FROM _index_violations v
                  WHERE v.idx NOT IN (SELECT idx FROM _index_exempt)),
                'ok');

-- 1b. Every exemption is still needed. A stale entry means the list is drifting
--     into a rubber stamp.
INSERT INTO _inv (rule, subject, passed, detail)
SELECT 'index/exemption-live', '(stale exemptions)',
       NOT EXISTS (SELECT 1 FROM _index_exempt e
                    WHERE e.idx NOT IN (SELECT idx FROM _index_violations)),
       coalesce('exemptions that no longer describe a real index: ' ||
                (SELECT string_agg(e.idx, ', ' ORDER BY e.idx) FROM _index_exempt e
                  WHERE e.idx NOT IN (SELECT idx FROM _index_violations)),
                'ok');

-- =============================================================================
-- RULE 2 — enum types match enumerations.json
-- =============================================================================
-- enumerations.json is the source of truth shared by DB, API and client.
-- Expected values come from a generated fixture; pass its path with
--   -v enum_fixture=packages/enums/dist/expected-enums.sql
CREATE TEMP TABLE _expected_enum (typname TEXT, label TEXT);

-- No relative fallback: `\ir` resolves against THIS file's directory, which
-- would silently break whenever the layout changes.
\if :{?enum_fixture}
  \ir :enum_fixture
\else
  \echo 'ERROR: pass -v enum_fixture=<path to expected-enums.sql>'
  \echo '       generate it with: pnpm --filter @kaaj/enums build'
  \quit 3
\endif

-- 2a. Every DB enum whose name matches an enumeration has exactly its values.
--     Types with no counterpart are skipped: several are deliberate DB-only
--     concepts, and the reverse direction is covered by 2c.
INSERT INTO _inv (rule, subject, passed, detail)
SELECT 'enum/values-match', t.typname,
       coalesce(db.labels, '{}') = coalesce(ex.labels, '{}'),
       CASE WHEN coalesce(db.labels,'{}') = coalesce(ex.labels,'{}') THEN 'ok'
            ELSE 'in DB only: ' || coalesce(array_to_string(
                     ARRAY(SELECT unnest(db.labels) EXCEPT SELECT unnest(ex.labels)), ','), '-')
              || ' | in enumerations.json only: ' || coalesce(array_to_string(
                     ARRAY(SELECT unnest(ex.labels) EXCEPT SELECT unnest(db.labels)), ','), '-')
       END
  FROM (SELECT DISTINCT typname FROM _expected_enum) t
  JOIN LATERAL (SELECT array_agg(e.enumlabel::text ORDER BY e.enumlabel) AS labels
                  FROM pg_type ty
                  JOIN pg_namespace n ON n.oid = ty.typnamespace
                  JOIN pg_enum e ON e.enumtypid = ty.oid
                 WHERE n.nspname='public' AND ty.typname = t.typname) db ON TRUE
  JOIN LATERAL (SELECT array_agg(label ORDER BY label) AS labels
                  FROM _expected_enum x WHERE x.typname = t.typname) ex ON TRUE
 WHERE db.labels IS NOT NULL;   -- only types that exist as enums in the DB

-- 2b. A column typed as an enum must not ALSO carry a CHECK on the same column:
--     two sources of truth for one value set, guaranteed to diverge.
INSERT INTO _inv (rule, subject, passed, detail)
SELECT 'enum/no-double-constraint', '(enum columns with a redundant CHECK)',
       count(*) = 0,
       coalesce(string_agg(rel.relname || '.' || a.attname, ', ' ORDER BY rel.relname), 'ok')
  FROM pg_constraint con
  JOIN pg_class rel ON rel.oid = con.conrelid
  JOIN pg_namespace n ON n.oid = rel.relnamespace
  JOIN pg_attribute a ON a.attrelid = rel.oid AND a.attnum = ANY (con.conkey)
  JOIN pg_type ty ON ty.oid = a.atttypid
 WHERE n.nspname='public' AND con.contype='c' AND ty.typtype='e'
   AND array_length(con.conkey, 1) = 1;

-- 2c. These value sets are deliberately NOT enums — tenant-customizable
--     (06-customization-model.md Tier 1) or external standards that grow
--     outside our control. Postgres has no ALTER TYPE DROP VALUE, so promoting
--     one is near-irreversible.
CREATE TEMP TABLE _must_not_be_enum (typname TEXT PRIMARY KEY, reason TEXT);
INSERT INTO _must_not_be_enum VALUES
  ('benefit_type',    'tenant-customizable — Tier 1 reference table'),
  ('time_off_type',   'tenant-customizable — jurisdictions differ'),
  ('expense_type',    'tenant-customizable'),
  ('asset_type',      'tenant-customizable'),
  ('training_type',   'tenant-customizable'),
  ('feedback_type',   'tenant-customizable'),
  ('account_subtype', 'tenant-customizable — chart of accounts varies by country'),
  ('currency',        'ISO 4217 grows without our involvement'),
  ('locale',          'IETF language tags grow'),
  ('timezone',        'IANA tzdb changes several times a year'),
  ('country',         'ISO 3166 changes'),
  -- Roles are Tier 1 customization (docs/14-access-control.md); enumerations.json
  -- holds the shipped defaults, not the enum itself.
  ('base_role',       'tenant-customizable — docs/14-access-control.md'),
  ('functional_role', 'tenant-customizable — docs/14-access-control.md'),
  ('user_role',       'superseded by base_role + functional_role');

INSERT INTO _inv (rule, subject, passed, detail)
SELECT 'enum/classification', '(wrongly promoted to enum)',
       count(*) = 0,
       coalesce(string_agg(m.typname || ' (' || m.reason || ')', '; ' ORDER BY m.typname), 'ok')
  FROM _must_not_be_enum m
 WHERE EXISTS (SELECT 1 FROM pg_type t JOIN pg_namespace n ON n.oid = t.typnamespace
                WHERE n.nspname='public' AND t.typtype='e' AND t.typname = m.typname);

-- =============================================================================
-- RULE 3 — every tenant-scoped table carries tenant_id
-- =============================================================================
CREATE TEMP TABLE _no_tenant_ok (tbl TEXT PRIMARY KEY, reason TEXT);
INSERT INTO _no_tenant_ok VALUES
  ('tenants',        'IS the registry; isolates on id'),
  ('exchange_rates', 'global reference data');

INSERT INTO _inv (rule, subject, passed, detail)
SELECT 'schema/tenant-id', '(tables missing tenant_id)',
       count(*) = 0,
       coalesce(string_agg(t.tablename, ', ' ORDER BY t.tablename), 'ok')
  FROM pg_tables t
 WHERE t.schemaname='public'
   AND t.tablename NOT IN (SELECT tbl FROM _no_tenant_ok)
   AND t.tablename NOT IN (SELECT tbl FROM _foreign_tables)
   AND NOT EXISTS (SELECT 1 FROM information_schema.columns c
                    WHERE c.table_schema='public' AND c.table_name = t.tablename
                      AND c.column_name = 'tenant_id');

-- =============================================================================
-- RULE 4 — the Data API stays closed (ADR-008)
-- =============================================================================
-- No grants to anon/authenticated, so PostgREST cannot read anything. Only DML
-- matters: Supabase's default privileges also confer REFERENCES/TRIGGER/
-- TRUNCATE, which PostgREST does not expose.
INSERT INTO _inv (rule, subject, passed, detail)
SELECT 'grants/data-api-closed', '(anon/authenticated DML)',
       count(*) = 0,
       coalesce(string_agg(DISTINCT g.grantee || ' -> ' || g.table_name ||
                           ' (' || g.privilege_type || ')', ', '), 'ok')
  FROM information_schema.role_table_grants g
 WHERE g.table_schema='public'
   AND g.grantee IN ('anon','authenticated')
   AND g.privilege_type IN ('SELECT','INSERT','UPDATE','DELETE')
   AND g.table_name NOT IN (SELECT tbl FROM _foreign_tables);

-- =============================================================================
-- REPORT
-- =============================================================================
\echo ''
-- =============================================================================
-- RULE: money is NUMERIC, never a binary float
-- =============================================================================
-- `real`/`double precision` lose precision before any application code sees
-- it (CLAUDE.md § Money). A column whose name looks monetary fails ./check
-- rather than being noticed on a payslip. Name pattern is a heuristic, so
-- exemptions are literals with reasons, as elsewhere in this file.

CREATE TEMP TABLE _float_money_exempt (col TEXT PRIMARY KEY, reason TEXT);
-- (empty — no monetary column has a justified reason to be a float)

CREATE TEMP TABLE _float_money AS
SELECT c.table_name || '.' || c.column_name AS col
  FROM information_schema.columns c
 WHERE c.table_schema = 'public'
   AND c.data_type IN ('real', 'double precision')
   AND c.column_name ~ '(amount|cost|price|salary|pay|total|balance|premium|wage|fee|revenue|budget|deduction)';

INSERT INTO _inv (rule, subject, passed, detail)
SELECT 'money/numeric-not-float', '(float money columns)',
       NOT EXISTS (SELECT 1 FROM _float_money m
                    WHERE m.col NOT IN (SELECT col FROM _float_money_exempt)),
       coalesce('monetary columns declared real/double precision: ' ||
                (SELECT string_agg(m.col, ', ' ORDER BY m.col) FROM _float_money m
                  WHERE m.col NOT IN (SELECT col FROM _float_money_exempt)),
                'ok');

INSERT INTO _inv (rule, subject, passed, detail)
SELECT 'money/exemption-live', '(stale exemptions)',
       NOT EXISTS (SELECT 1 FROM _float_money_exempt e
                    WHERE e.col NOT IN (SELECT col FROM _float_money)),
       coalesce('exemptions no longer matching any column: ' ||
                (SELECT string_agg(e.col, ', ' ORDER BY e.col)
                   FROM _float_money_exempt e
                  WHERE e.col NOT IN (SELECT col FROM _float_money)),
                'ok');



-- -----------------------------------------------------------------------------
-- PII: the plaintext must be gone, and must stay gone
-- -----------------------------------------------------------------------------
-- See docs/13-pii-encryption.md and apps/web/src/lib/server/pii/. Both lists
-- below are committed literals with reasons, not a pattern match.

-- Columns that HAVE been encrypted: plaintext must no longer exist, ciphertext
-- must. Re-adding either name is a failure.
CREATE TEMP TABLE _pii_encrypted (tbl TEXT, plaintext_col TEXT, ct_col TEXT);
INSERT INTO _pii_encrypted VALUES
  ('employees', 'ssn_tax_id', 'ssn_tax_id_ct'),
  -- Plaintext half never existed: column shipped as `account_number_encrypted`
  -- holding `enc:<uuid>` placeholders.
  ('employee_bank_accounts', 'account_number', 'account_number_encrypted'),
  -- Employee-subject: erasing the person destroys these.
  ('employee_bank_accounts',  'routing_number',       'routing_number_ct'),
  ('employee_bank_accounts',  'ifsc_code',            'ifsc_code_ct'),
  ('employee_bank_accounts',  'sort_code',            'sort_code_ct'),
  ('employee_bank_accounts',  'iban',                 'iban_ct'),
  ('employee_bank_accounts',  'bic_swift',            'bic_swift_ct'),
  ('hr_emergency_contacts',   'phone_primary',        'phone_primary_ct'),
  ('hr_emergency_contacts',   'phone_secondary',      'phone_secondary_ct'),
  ('hr_emergency_contacts',   'email',                'email_ct'),
  ('hr_emergency_contacts',   'address',              'address_ct'),
  ('employee_certifications', 'certification_number', 'certification_number_ct'),
  -- Tenant-subject: the firm's own banking and its counterparties'. These must
  -- NOT be destroyed when an employee is erased.
  ('clients',       'tax_id',              'tax_id_ct'),
  ('vendors',       'bank_account_number', 'bank_account_number_ct'),
  ('vendors',       'bank_routing_number', 'bank_routing_number_ct'),
  ('bank_accounts', 'account_number',      'account_number_ct'),
  ('bank_accounts', 'iban',                'iban_ct'),
  ('bank_accounts', 'routing_number',      'routing_number_ct'),
  ('bank_accounts', 'swift_code',          'swift_code_ct');

-- Columns that hold PII and are NOT yet encrypted (docs/13-pii-encryption.md
-- § What is not encrypted yet). When one is encrypted, move it to the list
-- above.
CREATE TEMP TABLE _pii_pending (tbl TEXT, col TEXT, reason TEXT);
-- Empty — every column that held PII is now encrypted.

-- 1. An encrypted field's plaintext column must not exist, and its ciphertext
--    column must.
INSERT INTO _inv (rule, subject, passed, detail)
SELECT 'pii/plaintext-removed', e.tbl || '.' || e.plaintext_col,
       NOT EXISTS (SELECT 1 FROM information_schema.columns c
                    WHERE c.table_schema = 'public' AND c.table_name = e.tbl
                      AND c.column_name = e.plaintext_col)
       AND EXISTS (SELECT 1 FROM information_schema.columns c
                    WHERE c.table_schema = 'public' AND c.table_name = e.tbl
                      AND c.column_name = e.ct_col),
       'plaintext column must be absent and ' || e.ct_col || ' present'
  FROM _pii_encrypted e;

-- 2. Every value in a ciphertext column must actually be an envelope — catches
--    a repository that writes the raw value into the _ct column, which
--    type-checks and passes review. Dynamic over the registry, not one
--    hardcoded table, or a second encrypted field could pass vacuously.
DO $rule2$
DECLARE
    e         RECORD;
    bad       BIGINT;
    col_found BOOLEAN;
BEGIN
    FOR e IN SELECT * FROM _pii_encrypted LOOP
        SELECT EXISTS (
            SELECT 1 FROM information_schema.columns c
             WHERE c.table_schema = 'public'
               AND c.table_name = e.tbl AND c.column_name = e.ct_col
        ) INTO col_found;

        IF NOT col_found THEN
            -- Rule 1 reports the missing column; don't claim to have inspected
            -- values that couldn't be reached.
            INSERT INTO _inv (rule, subject, passed, detail)
            VALUES ('pii/ciphertext-is-sealed', e.tbl || '.' || e.ct_col, false,
                    'column does not exist, so no value could be inspected');
            CONTINUE;
        END IF;

        EXECUTE format(
            $q$SELECT count(*) FROM %I WHERE %I IS NOT NULL AND %I !~ '^\{"v":1,'$q$,
            e.tbl, e.ct_col, e.ct_col
        ) INTO bad;

        INSERT INTO _inv (rule, subject, passed, detail)
        VALUES ('pii/ciphertext-is-sealed', e.tbl || '.' || e.ct_col, bad = 0,
                CASE WHEN bad = 0 THEN 'ok'
                     ELSE bad || ' value(s) are not an AES-GCM envelope' END);
    END LOOP;
END $rule2$;

-- Columns whose NAME claims encryption while the content is not yet encrypted.
-- Listed rather than filtered, so removing one is a deliberate act.
CREATE TEMP TABLE _pii_name_exempt (col TEXT PRIMARY KEY, reason TEXT);
-- Empty — nothing currently exempt.
INSERT INTO _pii_name_exempt
  SELECT NULL::text, NULL::text WHERE false;

-- 2b. A column NAMED as though it were encrypted must actually be encrypted —
--     a name asserting protection is worse than an honest plaintext one,
--     because nobody re-reads it.
DO $rule2b$
DECLARE
    c   RECORD;
    bad BIGINT;
BEGIN
    FOR c IN
        SELECT table_name AS tbl, column_name AS col
          FROM information_schema.columns
         WHERE table_schema = 'public'
           AND column_name ~ '(_encrypted|_ct)$'
           AND data_type IN ('text', 'character varying')
           AND table_name || '.' || column_name NOT IN
               (SELECT col FROM _pii_name_exempt)
         ORDER BY table_name, column_name
    LOOP
        EXECUTE format(
            $q$SELECT count(*) FROM %I WHERE %I IS NOT NULL AND %I !~ '^\{"v":1,'$q$,
            c.tbl, c.col, c.col
        ) INTO bad;

        INSERT INTO _inv (rule, subject, passed, detail)
        VALUES ('pii/encrypted-name-is-honest', c.tbl || '.' || c.col, bad = 0,
                CASE WHEN bad = 0 THEN 'ok'
                     ELSE bad || ' value(s) in a column named as encrypted are not' END);
    END LOOP;
END $rule2b$;

-- 3. A pending column must still be there, or the lists above are stale.
INSERT INTO _inv (rule, subject, passed, detail)
SELECT 'pii/pending-tracked', p.tbl || '.' || p.col,
       EXISTS (SELECT 1 FROM information_schema.columns c
                WHERE c.table_schema = 'public' AND c.table_name = p.tbl
                  AND c.column_name = p.col),
       'still plaintext: ' || p.reason
  FROM _pii_pending p;

-- 4. The key table must never be readable without RLS, and must never hold a
--    key that is not wrapped.
INSERT INTO _inv (rule, subject, passed, detail)
SELECT 'pii/keys-are-wrapped', 'pii_keys.wrapped_dek',
       NOT EXISTS (SELECT 1 FROM pii_keys WHERE wrapped_dek !~ '^\{"v":1,'),
       'every stored data key must be an envelope, never raw material';

-- -----------------------------------------------------------------------------
-- A malformed JWT claim fails closed QUIETLY (L62)
-- -----------------------------------------------------------------------------
-- An inline `::jsonb` cast in a policy expression can't carry an EXCEPTION
-- handler, so a malformed claim raises a 500 instead of rendering empty. No
-- rows ever leaked; what failed is fail-closed *quietly*.
--
-- This CALLS each function with a malformed claim rather than grepping for
-- the word EXCEPTION — a handler that's present but wrong passes a grep.
DO $claims$
DECLARE
    fn      RECORD;
    ok      BOOLEAN;
    detail  TEXT;
BEGIN
    FOR fn IN
        SELECT p.oid::regprocedure AS sig, p.proname
          FROM pg_proc p
         WHERE p.pronamespace = 'app'::regnamespace
           AND p.pronargs = 0
           AND pg_get_functiondef(p.oid) LIKE '%request.jwt.claims%'
    LOOP
        BEGIN
            PERFORM set_config('request.jwt.claims', 'not-json', true);
            EXECUTE format('SELECT %s', fn.sig);
            ok := true;
            detail := 'returns rather than raising on a malformed claim';
        EXCEPTION WHEN OTHERS THEN
            ok := false;
            detail := 'raised: ' || SQLERRM;
        END;
        INSERT INTO _inv (rule, subject, passed, detail)
        VALUES ('claims/fail-closed-quietly', 'app.' || fn.proname, ok, detail);
    END LOOP;
    PERFORM set_config('request.jwt.claims', '', true);
END $claims$;

-- The other half: a policy may not cast the claim itself — parsing has to
-- live in a function (`app.claim_role()` for a role); add a sibling rather
-- than inlining the next one.
INSERT INTO _inv (rule, subject, passed, detail)
SELECT 'claims/no-inline-cast-in-policy',
       c.relname || '.' || p.polname,
       FALSE,
       'casts request.jwt.claims inline; use an app.* function that can catch'
  FROM pg_policy p
  JOIN pg_class c ON c.oid = p.polrelid
 WHERE coalesce(pg_get_expr(p.polqual, p.polrelid), '') LIKE '%request.jwt.claims%'
   AND coalesce(pg_get_expr(p.polqual, p.polrelid), '') LIKE '%jsonb%';

-- Stated positively too, so the check above can't pass vacuously by finding
-- no policies at all.
INSERT INTO _inv (rule, subject, passed, detail)
SELECT 'claims/policies-examined', '(row policies)',
       count(*) > 0,
       count(*) || ' policies inspected for inline claim casts'
  FROM pg_policy;

-- -----------------------------------------------------------------------------
-- Append-only: the application must not be able to destroy a record
-- -----------------------------------------------------------------------------
-- DELETE is revoked from app_user everywhere but a named allow-list. A later
-- migration granting it back would be invisible — DELETE simply starts working.

CREATE TEMP TABLE _delete_allowed (tbl TEXT PRIMARY KEY, reason TEXT);
INSERT INTO _delete_allowed VALUES
  ('pii_keys', 'GDPR Art. 17 — destroying the key IS the erasure, and it reaches backups'),
  ('jobs',     'a work queue; a completed job is not a business record');

INSERT INTO _inv (rule, subject, passed, detail)
SELECT 'deletion/app-cannot-delete', '(DELETE granted to app_user)',
       NOT EXISTS (
         SELECT 1 FROM information_schema.role_table_grants g
          WHERE g.grantee = 'app_user' AND g.table_schema = 'public'
            AND g.privilege_type = 'DELETE'
            AND g.table_name NOT IN (SELECT tbl FROM _delete_allowed)),
       coalesce('DELETE granted on: ' || (
         SELECT string_agg(g.table_name, ', ' ORDER BY g.table_name)
           FROM information_schema.role_table_grants g
          WHERE g.grantee = 'app_user' AND g.table_schema = 'public'
            AND g.privilege_type = 'DELETE'
            AND g.table_name NOT IN (SELECT tbl FROM _delete_allowed)), 'ok');

-- The reverse: an allow-list entry that no longer has the grant is stale, and
-- a stale exemption is how a list stops describing reality.
INSERT INTO _inv (rule, subject, passed, detail)
SELECT 'deletion/allowance-live', a.tbl,
       EXISTS (SELECT 1 FROM information_schema.role_table_grants g
                WHERE g.grantee='app_user' AND g.table_schema='public'
                  AND g.privilege_type='DELETE' AND g.table_name = a.tbl),
       'DELETE is intended here: ' || a.reason
  FROM _delete_allowed a;

-- Every archivable table needs somewhere to record that it was archived. A
-- table with neither is_active nor a DELETE grant cannot be retired at all,
-- which is how a hard delete gets argued back in.
INSERT INTO _inv (rule, subject, passed, detail)
SELECT 'deletion/archivable', t.tbl,
       EXISTS (SELECT 1 FROM information_schema.columns c
                WHERE c.table_schema='public' AND c.table_name=t.tbl
                  AND c.column_name IN ('is_active','deleted_at','archived_at','effective_to','status')),
       'needs is_active (or an equivalent) so a row can be retired without deleting it'
  FROM (VALUES ('firm_job_levels'), ('firm_holidays'),
               ('firm_benefit_items'), ('firm_payroll_policies'),
               ('firm_locations'), ('firm_departments'),
               ('firm_job_titles'), ('firm_benefits_packages')) AS t(tbl);


-- The audit log is stricter than append-only: it cannot be REWRITTEN either.
-- DELETE is covered above; UPDATE is the hole that looks harmless but lets an
-- entry be edited after the fact.
INSERT INTO _inv (rule, subject, passed, detail)
SELECT 'deletion/audit-log-immutable', 'audit_log',
       NOT EXISTS (
         SELECT 1 FROM information_schema.role_table_grants
          WHERE grantee = 'app_user' AND table_schema = 'public'
            AND table_name = 'audit_log'
            AND privilege_type IN ('UPDATE', 'DELETE')),
       coalesce('audit_log is writable: ' || (
         SELECT string_agg(privilege_type, ', ' ORDER BY privilege_type)
           FROM information_schema.role_table_grants
          WHERE grantee = 'app_user' AND table_schema = 'public'
            AND table_name = 'audit_log'
            AND privilege_type IN ('UPDATE', 'DELETE')),
        'INSERT and SELECT only, as it must be');

-- And it must still be writable, or the trail silently stops recording.
INSERT INTO _inv (rule, subject, passed, detail)
SELECT 'deletion/audit-log-writable', 'audit_log',
       EXISTS (SELECT 1 FROM information_schema.role_table_grants
                WHERE grantee='app_user' AND table_schema='public'
                  AND table_name='audit_log' AND privilege_type='INSERT'),
       'app_user must retain INSERT — a trail nothing can write is not a trail';


-- -----------------------------------------------------------------------------
-- Role grants: separation of duties is a CHECK, and must stay one
-- -----------------------------------------------------------------------------
-- A later migration dropping one of these would silently permit, e.g., the
-- same person to set pay and approve the run that pays it.

INSERT INTO _inv (rule, subject, passed, detail)
SELECT 'authz/constraint-present', c.conname,
       EXISTS (SELECT 1 FROM pg_constraint x
                WHERE x.conrelid = 'tenant_users'::regclass
                  AND x.contype = 'c' AND x.conname = c.conname),
       c.why
  FROM (VALUES
    ('tenant_users_role_is_a_base_role',
     'role must be one of owner/firm_admin/employee/contractor/customer'),
    ('tenant_users_functional_roles_are_known',
     'an unknown functional role grants nothing and hides a typo'),
    ('tenant_users_pay_setter_is_not_pay_approver',
     'whoever sets pay must not approve the run that pays it'),
    ('tenant_users_auditor_writes_nothing',
     'an auditor who can change things is not an auditor'),
    ('ck_tenant_users_one_identity',
     'a tenant_users row is staff OR a portal contact, never both and never neither')
  ) AS c(conname, why);

-- And that they actually REFUSE, not merely exist. Each probe rolls back.
DO $sod$
DECLARE
    p       RECORD;
    victim  UUID;
    refused BOOLEAN;
BEGIN
    -- Staff, specifically: a portal-contact row already has employee_id
    -- NULL, which would make the "both identities" probe below a no-op
    -- (still exactly one non-null value after the UPDATE) rather than a
    -- genuine violation.
    SELECT id INTO victim FROM tenant_users WHERE employee_id IS NOT NULL LIMIT 1;
    IF victim IS NULL THEN
        INSERT INTO _inv (rule, subject, passed, detail)
        VALUES ('authz/constraint-refuses', '(no tenant_users rows)', false,
                'nothing to probe — the fixture must seed at least one member');
        RETURN;
    END IF;

    FOR p IN SELECT * FROM (VALUES
        ('hr_admin + payroll_admin', $$functional_roles = ARRAY['hr_admin','payroll_admin']::text[]$$),
        ('auditor + a writing role', $$functional_roles = ARRAY['auditor','finance_admin']::text[]$$),
        ('auditor on a writing base role', $$role = 'owner', functional_roles = ARRAY['auditor']::text[]$$),
        ('a base role that does not exist', $$role = 'manager'$$),
        ('an unknown functional role', $$functional_roles = ARRAY['cfo']::text[]$$),
        ('a tenant_user with both an employee and a portal contact',
         $$customer_contact_id = (SELECT id FROM customer_contacts LIMIT 1)$$),
        ('a tenant_user with neither an employee nor a portal contact',
         $$employee_id = NULL, customer_contact_id = NULL$$)
    ) AS v(label, assignment)
    LOOP
        refused := false;
        BEGIN
            EXECUTE format('UPDATE tenant_users SET %s WHERE id = %L', p.assignment, victim);
            -- Reached only if the constraint did NOT fire.
            RAISE EXCEPTION '__accepted__';
        EXCEPTION
            WHEN check_violation THEN refused := true;
            WHEN OTHERS THEN refused := false;
        END;
        INSERT INTO _inv (rule, subject, passed, detail)
        VALUES ('authz/constraint-refuses', p.label, refused,
                CASE WHEN refused THEN 'refused, as it must be'
                     ELSE 'ACCEPTED — the constraint is missing or wrong' END);
    END LOOP;

    -- No cleanup needed: every path out of the inner BEGIN...EXCEPTION block
    -- raises, so the UPDATE always rolls back.
END $sod$;


-- -----------------------------------------------------------------------------
-- Money inside JSONB is text, everywhere (L41, CLAUDE.md § Money)
-- -----------------------------------------------------------------------------
-- `money/numeric-not-float` reads information_schema.columns, so a JSONB
-- column is invisible to it by construction. Registered paths, not a pattern.
CREATE TEMP TABLE _jsonb_money (tbl TEXT, col TEXT);
INSERT INTO _jsonb_money VALUES
  ('payroll_run_employees', 'earnings'),
  ('payroll_run_employees', 'taxes'),
  ('payroll_run_employees', 'employer_taxes'),
  ('payroll_run_employees', 'pretax_deductions'),
  ('payroll_run_employees', 'posttax_deductions'),
  ('payroll_run_employees', 'taxable_wages'),
  ('payroll_tax_deposits',  'tax_breakdown'),
  ('payroll_india_salary_structure', 'other_allowances'),
  ('firm_job_levels',       'salary_ranges'),
  ('firm_benefit_items',    'costs_by_currency'),
  ('firm_payroll_policies', 'overtime_rules');

DO $money$
DECLARE
    m   RECORD;
    bad BIGINT;
BEGIN
    FOR m IN SELECT * FROM _jsonb_money LOOP
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns c
                        WHERE c.table_schema='public' AND c.table_name=m.tbl
                          AND c.column_name=m.col) THEN
            INSERT INTO _inv (rule, subject, passed, detail)
            VALUES ('money/jsonb-is-text', m.tbl||'.'||m.col, false,
                    'registered but the column does not exist — stale entry');
            CONTINUE;
        END IF;

        -- Any JSON number anywhere in the document, at any depth.
        EXECUTE format($q$
            SELECT count(*) FROM %I t,
                 LATERAL (SELECT jsonb_path_query_array(t.%I, '$.**') AS vals) x,
                 LATERAL jsonb_array_elements(x.vals) AS v(val)
             WHERE t.%I IS NOT NULL AND jsonb_typeof(v.val) = 'number'
        $q$, m.tbl, m.col, m.col) INTO bad;

        INSERT INTO _inv (rule, subject, passed, detail)
        VALUES ('money/jsonb-is-text', m.tbl||'.'||m.col, bad = 0,
                CASE WHEN bad = 0 THEN 'ok'
                     ELSE bad || ' JSON number(s) — money in JSONB is a string '
                          || '(CLAUDE.md § Money); a float64 round trip on read' END);
    END LOOP;
END $money$;


\echo '=================== SCHEMA INVARIANTS ==================='
SELECT rule,
       count(*) AS checks,
       count(*) FILTER (WHERE passed)     AS passed,
       count(*) FILTER (WHERE NOT passed) AS failed
  FROM _inv GROUP BY rule ORDER BY failed DESC, rule;

\echo ''
\echo '--- FAILURES ---'
SELECT rule, subject, detail FROM _inv WHERE NOT passed ORDER BY rule, subject;

DO $$
DECLARE t INT; f INT;
BEGIN
    SELECT count(*), count(*) FILTER (WHERE NOT passed) INTO t, f FROM _inv;
    RAISE NOTICE '=================================================================';
    RAISE NOTICE '  % invariant checks: % passed, % failed', t, t - f, f;
    RAISE NOTICE '=================================================================';
END $$;

\if :strict
DO $$
DECLARE f INT;
BEGIN
    SELECT count(*) INTO f FROM _inv WHERE NOT passed;
    IF f > 0 THEN RAISE EXCEPTION '% schema invariant(s) violated', f; END IF;
END $$;
\endif
