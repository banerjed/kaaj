-- =============================================================================
-- Kaaj — Tenant isolation verification (ALL tables, data-driven)
-- =============================================================================
-- WHAT THIS PROVES, that nothing else does
--   scripts/verify-migrations.sh checks isolation behaviourally but only against
--   `employees` — 1 of 98 tables. docs/data-models/verify-stories.sql checks RLS
--   only as metadata (pg_class.relrowsecurity), so a policy of USING(true) passes
--   it. This file proves every table's policy actually filters.
--
-- PRECONDITIONS
--   * migrations applied (supabase/migrations/*.sql, NOT docs/.../schema.sql)
--   * docs/data-models/mock-data.sql loaded — every fixture row is tenant A
--   * connected as a role that BYPASSES RLS (setup must not be subject to the
--     thing under test); `app_user` must exist and must NOT bypass
--
-- USAGE
--   psql "$DATABASE_URL" -v strict=1 -f scripts/verify-rls.sql
--
-- DESIGN NOTE — why the loop is data-driven
--   98 hand-written per-table tests would be copy-pasted wrong and the 99th
--   table would be forgotten. Driving from pg_class means a table added
--   tomorrow is covered without anyone remembering. The cost is that
--   exemptions must be explicit, which is the next note.
--
-- DESIGN NOTE — exemptions are committed literals, never filters
--   Each exempt table is named below with a reason. A NEW violation fails; so
--   does removing a justified one. Both require a reviewed edit. A `NOT IN`
--   filter that silently absorbs future violations is how suites die.
-- =============================================================================

\set ON_ERROR_STOP on
\pset pager off
\if :{?strict} \else \set strict 0 \endif

-- Fixture tenant (Northwind, from mock-data.sql) and a second, empty tenant.
\set TENANT_A '''07fb03f8-1521-5ef4-9c2d-25fcfa297ac1'''
\set TENANT_B '''bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'''

-- -----------------------------------------------------------------------------
-- PRECONDITION 0 — role posture. Get this wrong and everything below is theatre.
-- -----------------------------------------------------------------------------
DO $$
DECLARE me_bypasses BOOLEAN; app_bypasses BOOLEAN;
BEGIN
    SELECT rolsuper OR rolbypassrls INTO me_bypasses
      FROM pg_roles WHERE rolname = current_user;
    IF NOT me_bypasses THEN
        RAISE EXCEPTION 'setup must run as a BYPASSRLS role; current_user=% is not', current_user;
    END IF;

    SELECT rolsuper OR rolbypassrls INTO app_bypasses
      FROM pg_roles WHERE rolname = 'app_user';
    IF app_bypasses IS NULL THEN
        RAISE EXCEPTION 'role app_user does not exist — apply supabase/migrations/*_auth_and_grants.sql';
    END IF;
    IF app_bypasses THEN
        RAISE EXCEPTION 'app_user has BYPASSRLS/SUPERUSER — every isolation test below would pass vacuously';
    END IF;

    -- The probes below SET ROLE app_user. On Supabase (local and hosted) the
    -- `postgres` role is NOT superuser — it is BYPASSRLS — and a non-superuser
    -- may only SET ROLE to a role it belongs to.
    --
    -- PostgreSQL 16 split role membership into three options. Plain membership
    -- (`MEMBER`) is NOT sufficient for SET ROLE: that needs set_option = true,
    -- granted explicitly with `WITH SET TRUE`. pg_has_role(...,'MEMBER') returns
    -- true either way, so checking membership alone is misleading here.
    IF NOT EXISTS (
        SELECT 1 FROM pg_auth_members m
          JOIN pg_roles g ON g.oid = m.roleid
          JOIN pg_roles r ON r.oid = m.member
         WHERE g.rolname = 'app_user' AND r.rolname = current_user
           AND m.set_option
    ) THEN
        BEGIN
            EXECUTE format('GRANT app_user TO %I WITH SET TRUE', current_user);
        EXCEPTION WHEN OTHERS THEN
            RAISE EXCEPTION
              'cannot SET ROLE app_user as %: %. Run this as a role that can: '
              'GRANT app_user TO %I WITH SET TRUE;', current_user, SQLERRM, current_user;
        END;
    END IF;
END $$;

CREATE TEMP TABLE _rls (
    seq       SERIAL,
    phase     TEXT,
    tbl       TEXT,
    passed    BOOLEAN,
    detail    TEXT
);
GRANT ALL ON _rls TO app_user;
GRANT ALL ON SEQUENCE _rls_seq_seq TO app_user;

CREATE TEMP TABLE _baseline (tbl TEXT PRIMARY KEY, n BIGINT);
GRANT SELECT ON _baseline TO app_user;

-- -----------------------------------------------------------------------------
-- Exemption literals
-- -----------------------------------------------------------------------------
-- in_scope=false marks tables that are not part of the Kaaj schema at all, so
-- policy-shape rules do not apply to them. in_scope=true marks OUR tables that
-- are merely excluded from the per-tenant row loop (they have no tenant_id).
CREATE TEMP TABLE _exempt (tbl TEXT PRIMARY KEY, in_scope BOOLEAN, reason TEXT);
GRANT SELECT ON _exempt TO app_user;
INSERT INTO _exempt VALUES
  ('tenants',        true,  'the registry itself; isolates on id = app.current_tenant_id()'),
  ('exchange_rates', true,  'global reference data, no tenant_id, FOR SELECT USING (true)'),
  -- CMSaasStarter leftovers. Not part of the 98-table Kaaj schema; they carry no
  -- tenant_id and are isolated per-user (auth.uid() = id), not per-tenant. They
  -- are listed rather than filtered so that removing them is a deliberate act —
  -- see docs/07-app-provenance.md, which plans exactly that.
  ('profiles',         false, 'CMSaasStarter leftover; per-user RLS, pending removal'),
  ('stripe_customers', false, 'CMSaasStarter leftover; per-user RLS, pending removal'),
  ('contact_requests', false, 'CMSaasStarter leftover; no tenancy, pending removal');

-- Tables whose tenant_id is NULLABLE by design: NULL rows are platform-global
-- and visible to every tenant. The leak test filters on tenant_id IS NOT NULL
-- so these behave uniformly; their global-write rules are tested separately.
CREATE TEMP TABLE _global_rows (tbl TEXT PRIMARY KEY);
GRANT SELECT ON _global_rows TO app_user;
INSERT INTO _global_rows VALUES ('payroll_tax_rates'), ('translations');

-- Tables with no fixture rows. This list exists so that a NEW table without a
-- fixture FAILS rather than passing vacuously — see PHASE A.
CREATE TEMP TABLE _no_fixture (tbl TEXT PRIMARY KEY);
INSERT INTO _no_fixture VALUES
  ('compensation_premiums'), ('firm_benefit_items'), ('firm_benefits_packages'),
  ('firm_benefits_plans'), ('firm_payroll_policies'), ('pm_project_templates'),
  ('pm_task_time_entries');

CREATE TEMP VIEW _targets AS
  SELECT c.relname AS tbl
    FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
   WHERE n.nspname = 'public' AND c.relkind = 'r'
     AND c.relname NOT IN (SELECT tbl FROM _exempt)
     AND EXISTS (SELECT 1 FROM information_schema.columns col
                  WHERE col.table_schema = 'public'
                    AND col.table_name = c.relname
                    AND col.column_name = 'tenant_id');
GRANT SELECT ON _targets TO app_user;

-- Any table WITHOUT tenant_id must be a NAMED exemption. This is the check that
-- catches "someone added a table and forgot tenant_id" — which the per-table
-- loop cannot, because such a table is invisible to it.
DO $$
DECLARE unlisted TEXT[];
BEGIN
    SELECT array_agg(c.relname ORDER BY c.relname) INTO unlisted
      FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
     WHERE n.nspname = 'public' AND c.relkind = 'r'
       AND c.relname NOT IN (SELECT tbl FROM _exempt)
       AND NOT EXISTS (SELECT 1 FROM information_schema.columns col
                        WHERE col.table_schema = 'public'
                          AND col.table_name = c.relname
                          AND col.column_name = 'tenant_id');
    INSERT INTO _rls (phase, tbl, passed, detail)
    VALUES ('0/tenant-id-coverage', '(all tables)', unlisted IS NULL,
            coalesce('tables with no tenant_id and no exemption: '
                     || array_to_string(unlisted, ', '), 'ok'));
END $$;

-- Seed the second tenant. Superuser, so RLS does not interfere with setup.
INSERT INTO tenants (id, subdomain, company_name)
VALUES (:TENANT_B::uuid, 'tenant-b-isolation-probe', 'Isolation Probe Ltd')
ON CONFLICT (id) DO NOTHING;

-- =============================================================================
-- PHASE A — every table has RLS on, is FORCEd, and HAS FIXTURE ROWS
-- =============================================================================
-- The fixture check is the one that stops this whole file from degrading into a
-- vacuous pass. Without it, a table with no rows satisfies "tenant B sees 0"
-- trivially — and every table added from now on starts empty.
DO $$
DECLARE r RECORD; n BIGINT;
BEGIN
    FOR r IN SELECT tbl FROM _targets ORDER BY 1 LOOP
        EXECUTE format('SELECT count(*) FROM public.%I WHERE tenant_id IS NOT NULL', r.tbl)
          INTO n;
        INSERT INTO _baseline VALUES (r.tbl, n);

        INSERT INTO _rls (phase, tbl, passed, detail)
        SELECT 'A/rls-on', r.tbl, c.relrowsecurity AND c.relforcerowsecurity,
               format('enabled=%s forced=%s', c.relrowsecurity, c.relforcerowsecurity)
          FROM pg_class c JOIN pg_namespace ns ON ns.oid = c.relnamespace
         WHERE ns.nspname = 'public' AND c.relname = r.tbl;

        INSERT INTO _rls (phase, tbl, passed, detail)
        VALUES ('A/has-fixture', r.tbl,
                (n > 0) OR EXISTS (SELECT 1 FROM _no_fixture f WHERE f.tbl = r.tbl),
                CASE WHEN n > 0 THEN format('%s rows', n)
                     WHEN EXISTS (SELECT 1 FROM _no_fixture f WHERE f.tbl = r.tbl)
                       THEN 'no rows (known, listed in _no_fixture)'
                     ELSE 'NO FIXTURE ROWS — add one to mock-data.sql, or add the '
                          'table to _no_fixture with a reason. Until then this '
                          'table''s isolation is untested.' END);
    END LOOP;
END $$;

-- =============================================================================
-- PHASE B — tenant A sees exactly what the superuser sees
-- =============================================================================
-- Catches USING(false), an over-restrictive predicate, or a missing GRANT —
-- failures that would otherwise masquerade as "isolation working".
BEGIN;
  SET LOCAL ROLE app_user;
  SET LOCAL request.jwt.claims = '{"app_metadata":{"tenant_id":"07fb03f8-1521-5ef4-9c2d-25fcfa297ac1"}}';
  DO $$
  DECLARE r RECORD; n BIGINT;
  BEGIN
      FOR r IN SELECT t.tbl, b.n AS want FROM _targets t JOIN _baseline b USING (tbl) ORDER BY 1 LOOP
          EXECUTE format('SELECT count(*) FROM public.%I WHERE tenant_id IS NOT NULL', r.tbl)
            INTO n;
          INSERT INTO _rls (phase, tbl, passed, detail)
          VALUES ('B/owner-sees-own', r.tbl, n = r.want, format('saw %s of %s', n, r.want));
      END LOOP;
  END $$;
COMMIT;

-- =============================================================================
-- PHASE C — tenant B sees NOTHING that belongs to a tenant
-- =============================================================================
-- The leak test proper.
BEGIN;
  SET LOCAL ROLE app_user;
  SET LOCAL request.jwt.claims = '{"app_metadata":{"tenant_id":"bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb"}}';
  DO $$
  DECLARE r RECORD; n BIGINT;
  BEGIN
      FOR r IN SELECT tbl FROM _targets ORDER BY 1 LOOP
          EXECUTE format('SELECT count(*) FROM public.%I WHERE tenant_id IS NOT NULL', r.tbl)
            INTO n;
          INSERT INTO _rls (phase, tbl, passed, detail)
          VALUES ('C/no-leak', r.tbl, n = 0,
                  CASE WHEN n = 0 THEN 'ok' ELSE format('LEAK: %s foreign rows visible', n) END);
      END LOOP;
  END $$;
COMMIT;

-- =============================================================================
-- PHASE D — no claim means no rows (fail closed, not fail open)
-- =============================================================================
-- Distinct from C: C proves the predicate discriminates between tenants;
-- D proves that an ABSENT claim is not treated as "unset, therefore unfiltered".
BEGIN;
  SET LOCAL ROLE app_user;
  DO $$
  DECLARE r RECORD; n BIGINT;
  BEGIN
      FOR r IN SELECT tbl FROM _targets ORDER BY 1 LOOP
          EXECUTE format('SELECT count(*) FROM public.%I', r.tbl) INTO n;
          INSERT INTO _rls (phase, tbl, passed, detail)
          VALUES ('D/fail-closed', r.tbl, n = 0,
                  CASE WHEN n = 0 THEN 'ok' ELSE format('FAIL-OPEN: %s rows with no claim', n) END);
      END LOOP;
  END $$;
COMMIT;

-- =============================================================================
-- PHASE E — writes cannot move a row to another tenant
-- =============================================================================
-- Catches a WITH CHECK that was widened to match USING. Expressed as a row
-- count rather than an error: USING filters the row out before WITH CHECK is
-- ever evaluated, so the correct result is "0 rows affected", not an exception.
BEGIN;
  SET LOCAL ROLE app_user;
  SET LOCAL request.jwt.claims = '{"app_metadata":{"tenant_id":"07fb03f8-1521-5ef4-9c2d-25fcfa297ac1"}}';
  DO $$
  DECLARE r RECORD; affected BIGINT; verdict BOOLEAN; note TEXT;
  BEGIN
      FOR r IN SELECT t.tbl FROM _targets t JOIN _baseline b USING (tbl)
                WHERE b.n > 0 ORDER BY 1 LOOP
          affected := NULL; verdict := NULL; note := NULL;
          -- Each probe is its own SUBTRANSACTION. The sentinel RAISE undoes the
          -- UPDATE while plpgsql variables keep their values, so the result
          -- survives into the outer transaction and can be committed.
          BEGIN
              EXECUTE format(
                'UPDATE public.%I SET tenant_id = %L WHERE tenant_id IS NOT NULL',
                r.tbl, 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb');
              GET DIAGNOSTICS affected = ROW_COUNT;
              RAISE EXCEPTION SQLSTATE 'KJ001';   -- sentinel: undo the write
          EXCEPTION
              WHEN SQLSTATE 'KJ001' THEN
                  verdict := (affected = 0);
                  note := CASE WHEN affected = 0 THEN 'ok (0 rows moved)'
                               ELSE format('MOVED %s rows to another tenant', affected) END;
              WHEN insufficient_privilege THEN
                  verdict := true; note := 'ok (rejected 42501 by WITH CHECK)';
              WHEN OTHERS THEN
                  -- A constraint fired before RLS was reached. Not a leak, but
                  -- not a proof either — reported so it cannot masquerade as one.
                  verdict := true;
                  note := format('inconclusive: %s (%s)', SQLSTATE, left(SQLERRM, 60));
          END;
          INSERT INTO _rls (phase, tbl, passed, detail)
          VALUES ('E/no-tenant-move', r.tbl, verdict, note);
      END LOOP;
  END $$;
COMMIT;

-- =============================================================================
-- PHASE F — the global-row tables cannot be used as a cross-tenant write channel
-- =============================================================================
-- HIGHEST SEVERITY CHECK IN THIS FILE.
-- payroll_tax_rates and translations use
--     USING      (tenant_id IS NULL OR tenant_id = app.current_tenant_id())
--     WITH CHECK (tenant_id = app.current_tenant_id())
-- The asymmetry is deliberate and load-bearing: any tenant may READ platform
-- rows, but none may WRITE one. If a well-meaning refactor makes WITH CHECK
-- match USING "for consistency", any tenant can insert a row visible to EVERY
-- tenant — a statutory tax rate, or a translation shown to all customers.
BEGIN;
  SET LOCAL ROLE app_user;
  SET LOCAL request.jwt.claims = '{"app_metadata":{"tenant_id":"07fb03f8-1521-5ef4-9c2d-25fcfa297ac1"}}';
  DO $$
  DECLARE ok BOOLEAN;
  BEGIN
      BEGIN
          INSERT INTO translations (tenant_id, locale, namespace, key, value)
          VALUES (NULL, 'en-US', 'app', 'probe.global.write', 'should be rejected');
          -- Reaching here means a tenant wrote a platform-global row. Raise the
          -- sentinel so the row is undone either way.
          ok := false;
          RAISE EXCEPTION SQLSTATE 'KJ001';
      EXCEPTION
          WHEN insufficient_privilege THEN ok := true;
          WHEN SQLSTATE 'KJ001'       THEN NULL;   -- ok already false
          WHEN OTHERS                 THEN ok := false;
      END;
      INSERT INTO _rls (phase, tbl, passed, detail)
      VALUES ('F/no-global-write', 'translations', ok,
              CASE WHEN ok THEN 'ok (rejected 42501)'
                   ELSE 'A TENANT CAN WRITE A PLATFORM-GLOBAL ROW' END);
  END $$;
COMMIT;

-- =============================================================================
-- PHASE G — malformed claims degrade to zero rows, never to an error or a leak
-- =============================================================================
-- Once per run, not per table: these exercise app.current_tenant_id()'s
-- exception handling, and one regression there breaks all 98 tables identically.
BEGIN;
  SET LOCAL ROLE app_user;
  SET LOCAL request.jwt.claims = '';
  DO $$ DECLARE n BIGINT; BEGIN
      SELECT count(*) INTO n FROM employees;
      INSERT INTO _rls (phase, tbl, passed, detail)
      VALUES ('G/claim-empty', 'employees', n = 0, format('%s rows', n));
  EXCEPTION WHEN OTHERS THEN
      INSERT INTO _rls (phase, tbl, passed, detail)
      VALUES ('G/claim-empty', 'employees', false, 'raised: ' || SQLERRM);
  END $$;
COMMIT;

BEGIN;
  SET LOCAL ROLE app_user;
  SET LOCAL request.jwt.claims = 'not-json';
  DO $$ DECLARE n BIGINT; BEGIN
      SELECT count(*) INTO n FROM employees;
      INSERT INTO _rls (phase, tbl, passed, detail)
      VALUES ('G/claim-malformed', 'employees', n = 0, format('%s rows', n));
  EXCEPTION WHEN OTHERS THEN
      INSERT INTO _rls (phase, tbl, passed, detail)
      VALUES ('G/claim-malformed', 'employees', false, 'raised: ' || SQLERRM);
  END $$;
COMMIT;

BEGIN;
  SET LOCAL ROLE app_user;
  SET LOCAL request.jwt.claims = '{"app_metadata":{"tenant_id":"not-a-uuid"}}';
  DO $$ DECLARE n BIGINT; BEGIN
      SELECT count(*) INTO n FROM employees;
      INSERT INTO _rls (phase, tbl, passed, detail)
      VALUES ('G/claim-non-uuid', 'employees', n = 0, format('%s rows', n));
  EXCEPTION WHEN OTHERS THEN
      INSERT INTO _rls (phase, tbl, passed, detail)
      VALUES ('G/claim-non-uuid', 'employees', false, 'raised: ' || SQLERRM);
  END $$;
COMMIT;

-- =============================================================================
-- PHASE H — every FOR ALL policy has a WITH CHECK
-- =============================================================================
-- A policy with USING but no WITH CHECK filters reads while leaving writes
-- unconstrained. Two policies legitimately lack one; both are read-oriented and
-- are named here so a third fails.
DO $$
DECLARE missing TEXT[];
BEGIN
    SELECT array_agg(tablename || '.' || policyname ORDER BY tablename)
      INTO missing
      FROM pg_policies
     WHERE schemaname = 'public'
       AND with_check IS NULL
       -- Starter tables are not ours; their policy shape is out of scope until
       -- they are removed (docs/07-app-provenance.md).
       AND tablename NOT IN (SELECT tbl FROM _exempt WHERE NOT in_scope)
       AND (tablename, policyname) NOT IN (
             ('tenants',      'tenant_self'),                  -- USING doubles as WITH CHECK on write
             ('exchange_rates','exchange_rates_read'),           -- FOR SELECT only
             ('tenant_users', 'auth_admin_reads_memberships')    -- FOR SELECT, supabase_auth_admin only
           );
    INSERT INTO _rls (phase, tbl, passed, detail)
    VALUES ('H/with-check', '(all policies)', missing IS NULL,
            coalesce('policies missing WITH CHECK: ' || array_to_string(missing, ', '), 'ok'));
END $$;

-- =============================================================================
-- REPORT
-- =============================================================================
\echo ''
\echo '=============== TENANT ISOLATION — ALL TABLES ==============='
SELECT phase, count(*) AS checks,
       count(*) FILTER (WHERE passed)     AS passed,
       count(*) FILTER (WHERE NOT passed) AS failed
  FROM _rls GROUP BY phase ORDER BY phase;

\echo ''
\echo '--- FAILURES ---'
SELECT phase, tbl, detail FROM _rls WHERE NOT passed ORDER BY phase, tbl;

DO $$
DECLARE t INT; f INT;
BEGIN
    SELECT count(*), count(*) FILTER (WHERE NOT passed) INTO t, f FROM _rls;
    RAISE NOTICE '=================================================================';
    RAISE NOTICE '  % isolation checks across % tables: % passed, % failed',
                 t, (SELECT count(*) FROM _targets), t - f, f;
    RAISE NOTICE '=================================================================';
END $$;

\if :strict
DO $$
DECLARE f INT;
BEGIN
    SELECT count(*) INTO f FROM _rls WHERE NOT passed;
    IF f > 0 THEN RAISE EXCEPTION '% tenant-isolation check(s) failed', f; END IF;
END $$;
\endif
