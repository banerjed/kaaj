-- =============================================================================
-- Kaaj — schema design invariants
-- =============================================================================
-- Rules from the ADRs that the schema must satisfy, expressed as assertions.
--
--   psql "$DATABASE_URL" -v strict=1 -f scripts/verify-invariants.sql
--
-- WHY SEPARATE FROM THE SNAPSHOT
--   The snapshot pins what the schema IS, so any change shows as a diff. These
--   check that a change obeys a RULE. A new index leading with `status` would
--   appear in the snapshot diff as an ordinary addition, easy to wave through;
--   here it fails with the reason attached.
--
-- THE EXEMPTION PRINCIPLE (see also scripts/verify-rls.sql)
--   Every exemption is a committed literal with a reason, never a pattern
--   filter. A new violation fails; removing a justified one also fails. Both
--   require a reviewed edit. A filter silently absorbs future violations, which
--   is how a suite quietly stops testing anything.
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
-- "tenant_id leads every index" is the single biggest determinant of query
-- performance on a shared instance: (tenant_id, status, created_at), never
-- (status, created_at).
--
-- Six indexes legitimately violate it. They are named here with reasons, and
-- the assertion is set EQUALITY, not "count <= 6" — so a seventh fails, and so
-- does silently dropping one of these.
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
-- enumerations.json is the source of truth shared by the database, the API and
-- the client. Drift means the three disagree about what a valid value is.
--
-- The expected values are loaded from a generated fixture so this file stays
-- pure SQL; scripts/gen-enum-fixture.mjs writes it from enumerations.json.
CREATE TEMP TABLE _expected_enum (typname TEXT, label TEXT);

\if :{?enum_fixture}
  \ir :enum_fixture
\else
  \ir ../docs/data-models/generated/expected-enums.sql
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

-- 2c. The enum/reference-table split is a design decision, not an accident.
--     These value sets are deliberately NOT enums — tenant-customizable
--     (06-customization-model.md Tier 1) or external standards that grow
--     outside our control. Postgres has no ALTER TYPE DROP VALUE, so promoting
--     one to an enum is near-irreversible.
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
  ('country',         'ISO 3166 changes');

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
-- Migration ..._auth_and_grants.sql deliberately grants nothing to anon or
-- authenticated, so PostgREST cannot read anything. A stray GRANT would open it
-- silently. Only DML matters here: Supabase's default privileges also confer
-- REFERENCES/TRIGGER/TRUNCATE, which PostgREST does not expose.
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
