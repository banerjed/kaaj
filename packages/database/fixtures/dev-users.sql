-- =============================================================================
-- Kaaj — development login identities
-- =============================================================================
-- DEVELOPMENT ONLY. This file creates Supabase Auth users with a well-known
-- password so that `./setup` produces a stack you can actually log into. It is
-- the same class of artefact as the demo keys in .env.local: safe because the
-- local stack is disposable, and catastrophic anywhere else.
--
--   NEVER load this against a hosted project, staging, or a customer database.
--
-- WHY IT EXISTS
--   mock-data.sql seeds tenant_users — the table custom_access_token_hook()
--   reads at token issue to stamp app_metadata.tenant_id. But its user_id
--   values are deterministic stand-ins for auth.users rows that were never
--   created, and auth.users was empty. The consequence is subtle and total:
--   login succeeds, the hook finds no membership, no tenant claim is stamped,
--   app.current_tenant_id() returns NULL, and every one of the 98 RLS policies
--   denies every row. The application renders empty with no error anywhere.
--
--   The hook must also be REGISTERED, which is configuration rather than SQL:
--   [auth.hook.custom_access_token] in supabase/config.toml locally, and
--   Authentication > Hooks in the dashboard for a hosted project. Creating the
--   function is not enough — see 20260827000002_auth_and_grants.sql section 3.
--
-- WHY IT DERIVES FROM tenant_users
--   The ids are not copied literals. Every row below is built by selecting from
--   tenant_users, so auth.users.id equals tenant_users.user_id by construction.
--   Regenerating the fixture with different uuids cannot desynchronise them,
--   and the pair can never drift apart in a way that silently breaks login.
--
-- LOGINS  (password is the same for all four)
--   sarah.johnson@northwind.example    owner
--   rachel.adeyemi@northwind.example   hr_admin
--   aisha.okafor@northwind.example     manager
--   marcus.chen@northwind.example      member
--   tom.whitfield@northwind.example    member
--
--   password: devpassword
-- =============================================================================

BEGIN;

-- Refuse to run against anything that is not a local stack. The local Supabase
-- database is always named `postgres` AND carries the fixture's test tenant; a
-- hosted project may satisfy the first but not the second. Checking for the
-- Northwind tenant is the stronger signal, so check that.
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM tenants WHERE subdomain = 'northwind') THEN
        RAISE EXCEPTION
            'dev-users.sql refuses to run: no Northwind test tenant found. '
            'This file seeds well-known demo passwords and must never be '
            'loaded against a real database.';
    END IF;
END
$$;


-- -----------------------------------------------------------------------------
-- auth.users — one per seeded membership
-- -----------------------------------------------------------------------------
-- email_confirmed_at is set so the accounts are usable immediately; local
-- Supabase requires confirmation by default and the confirmation mail would
-- otherwise sit unread in Mailpit.
--
-- encrypted_password uses extensions.crypt(). pgcrypto lives in the
-- `extensions` schema on Supabase, not `public`, so it must be qualified.
--
-- ON CONFLICT DO NOTHING keeps this idempotent, matching ./setup's contract.

INSERT INTO auth.users (
    instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
    raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
    confirmation_token, recovery_token, email_change_token_new, email_change
)
SELECT
    '00000000-0000-0000-0000-000000000000',
    tu.user_id,
    'authenticated',
    'authenticated',
    e.email,
    extensions.crypt('devpassword', extensions.gen_salt('bf')),
    now(),
    jsonb_build_object('provider', 'email', 'providers', jsonb_build_array('email')),
    jsonb_build_object(
        'full_name', e.first_name || ' ' || e.last_name,
        'kaaj_role', tu.role
    ),
    now(), now(),
    '', '', '', ''
FROM tenant_users tu
JOIN employees e ON e.id = tu.employee_id
WHERE tu.is_active
ON CONFLICT (id) DO NOTHING;


-- -----------------------------------------------------------------------------
-- auth.identities — required for password sign-in
-- -----------------------------------------------------------------------------
-- GoTrue resolves an email/password grant through identities, not through
-- auth.users alone. A user row without a matching identity authenticates
-- inconsistently across GoTrue versions, which is a confusing thing to debug.
-- provider_id is the user id for the email provider.

INSERT INTO auth.identities (
    provider_id, user_id, identity_data, provider,
    last_sign_in_at, created_at, updated_at
)
SELECT
    u.id::text,
    u.id,
    jsonb_build_object(
        'sub', u.id::text,
        'email', u.email,
        'email_verified', true,
        'phone_verified', false
    ),
    'email',
    now(), now(), now()
FROM auth.users u
WHERE u.email LIKE '%@northwind.example'
ON CONFLICT (provider_id, provider) DO NOTHING;


-- -----------------------------------------------------------------------------
-- VERIFICATION — the transaction aborts if the join did not land
-- -----------------------------------------------------------------------------
-- Every active membership must have an auth user, or that person cannot log in
-- and the failure is invisible until someone tries. Assert it here rather than
-- discovering it at a login screen.
DO $$
DECLARE
    memberships INT;
    logins      INT;
    orphans     INT;
BEGIN
    SELECT count(*) INTO memberships FROM tenant_users WHERE is_active;

    SELECT count(*) INTO logins
      FROM auth.users u
      JOIN auth.identities i ON i.user_id = u.id AND i.provider = 'email';

    SELECT count(*) INTO orphans
      FROM tenant_users tu
     WHERE tu.is_active
       AND NOT EXISTS (SELECT 1 FROM auth.users u WHERE u.id = tu.user_id);

    IF orphans > 0 THEN
        RAISE EXCEPTION
            '% active memberships have no auth.users row — those users cannot log in',
            orphans;
    END IF;

    RAISE NOTICE 'dev-users: % active memberships, % login identities', memberships, logins;
END
$$;

COMMIT;
