-- =============================================================================
-- Kaaj — development login identities
-- =============================================================================
-- DEVELOPMENT ONLY: well-known demo password, safe locally, catastrophic
-- anywhere else. NEVER load against a hosted project, staging, or a customer
-- database.
--
-- Ids are derived from tenant_users (auth.users.id = tenant_users.user_id),
-- not copied literals, so the two can't drift apart. The access-token hook
-- also needs registering in supabase/config.toml / dashboard Hooks — see
-- 20260827000002_auth_and_grants.sql section 3.
--
-- STAFF LOGINS — every base role and every functional role in
-- packages/authz has at least one login here; three (Sarah, James, Diego)
-- deliberately hold more than one hat. See mock-data.sql's tenant_users
-- insert for why each combination is legal under the role CHECK constraints.
--   sarah.johnson@northwind.example    owner, functional_roles: {payroll_admin}; manages 3
--   marcus.chen@northwind.example      employee
--   priya.raman@northwind.example      employee — subject of the one review still in draft
--   tom.whitfield@northwind.example    employee
--   aisha.okafor@northwind.example     employee; manages 2 (James, Lena) — the plain "manager" persona
--   james.reid@northwind.example       firm_admin, functional_roles: {legal_admin, project_manager}
--   lena.fischer@northwind.example     employee, functional_roles: {auditor} — read-only, alone by CHECK
--   diego.morales@northwind.example    employee, functional_roles: {sales_admin, finance_admin}; manages 1 (Yuki)
--   yuki.tanaka@northwind.example      employee, functional_roles: {marketing_admin}
--   rachel.adeyemi@northwind.example   employee, functional_roles: {hr_admin}
--   oliver.grant@northwind.example     employee, functional_roles: {it_admin}
--   nadia.hassan@northwind.example     contractor (matches her employment_type)
--
-- PORTAL LOGINS (docs/17-customer-portal.md) — role 'customer', no employee_id
--   dana.whitcombe@acme.example        Acme Manufacturing, primary contact
--   felix.ndiaye@acme.example          Acme Manufacturing
--   imogen.faulkner@britco.example     Britannia Retail Group
--   theo.bakshi@helios.example         Helios Energy
--
--   password: devpassword, for all of the above
-- =============================================================================

BEGIN;

-- Refuse to run unless the Northwind test tenant is present — the strongest
-- signal this is the local stack, not a hosted project.
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
-- email_confirmed_at is set so accounts work without confirming mail in
-- Mailpit. pgcrypto's crypt() lives in the `extensions` schema on Supabase.

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
    coalesce(e.email, cc.email),
    extensions.crypt('devpassword', extensions.gen_salt('bf')),
    now(),
    jsonb_build_object('provider', 'email', 'providers', jsonb_build_array('email')),
    jsonb_build_object(
        'full_name', coalesce(e.first_name || ' ' || e.last_name,
                               cc.first_name || ' ' || cc.last_name),
        'kaaj_role', tu.role
    ),
    now(), now(),
    '', '', '', ''
FROM tenant_users tu
LEFT JOIN employees e ON e.id = tu.employee_id
LEFT JOIN customer_contacts cc ON cc.id = tu.customer_contact_id
WHERE tu.is_active
ON CONFLICT (id) DO NOTHING;


-- -----------------------------------------------------------------------------
-- auth.identities — required for password sign-in
-- -----------------------------------------------------------------------------
-- GoTrue resolves email/password sign-in through identities, not auth.users
-- alone. provider_id is the user id for the email provider.

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
-- Every user this script itself just created (staff AND portal contacts),
-- not a domain-name guess — the set of "our seeded users" is exactly
-- tenant_users.user_id, which is what the auth.users INSERT above sourced
-- its rows from.
WHERE u.id IN (SELECT user_id FROM tenant_users WHERE is_active)
ON CONFLICT (provider_id, provider) DO NOTHING;


-- -----------------------------------------------------------------------------
-- VERIFICATION — the transaction aborts if the join did not land
-- -----------------------------------------------------------------------------
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

-- ---------------------------------------------------------------------------
-- CMSaasStarter's own user tables — kept here, not mock-data.sql, since they
-- FK into auth.users, which this file creates. UPSERT: Supabase's own trigger
-- already created the profile row (L50).
-- ---------------------------------------------------------------------------
INSERT INTO profiles (id, updated_at, full_name, company_name, avatar_url, website, unsubscribed) VALUES
  ('75bf4b0c-4f4b-cad9-daec-de7be09ff367', '2026-01-01T09:00:00Z', 'Sarah Johnson', 'Northwind Consulting',
   'https://internal.example/avatars/sarah.png', 'https://northwind.example', FALSE)
ON CONFLICT (id) DO UPDATE SET
    full_name = EXCLUDED.full_name, company_name = EXCLUDED.company_name,
    avatar_url = EXCLUDED.avatar_url, website = EXCLUDED.website,
    unsubscribed = EXCLUDED.unsubscribed, updated_at = EXCLUDED.updated_at;

INSERT INTO stripe_customers (user_id, updated_at, stripe_customer_id) VALUES
  ('75bf4b0c-4f4b-cad9-daec-de7be09ff367', '2026-01-01T09:00:00Z', 'cus_FIXTURE0001')
ON CONFLICT (user_id) DO UPDATE SET
    stripe_customer_id = EXCLUDED.stripe_customer_id, updated_at = EXCLUDED.updated_at;
