-- =============================================================================
-- Kaaj — customer portal identity (docs/17-customer-portal.md §1)
-- =============================================================================
-- A second class of authenticated actor: someone who works for a customer,
-- not the firm, with no employee record. tenant_users.employee_id was
-- already nullable ("a tenant member is not necessarily an employee") —
-- this migration is that seam used, not a new one invented.
-- =============================================================================


-- -----------------------------------------------------------------------------
-- 1. Who the contact is
-- -----------------------------------------------------------------------------
-- Deliberately not `employees` with a different FK: a portal contact has no
-- compensation, no time off, no performance review. Reusing `employees`
-- would mean every future employee-only column needs a NULL-tolerant read
-- path forever.

CREATE TABLE customer_contacts (
    id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id     UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    customer_id   UUID NOT NULL REFERENCES customers(id),
    first_name    VARCHAR(100) NOT NULL,
    last_name     VARCHAR(100) NOT NULL,
    email         VARCHAR(255) NOT NULL,
    phone         VARCHAR(20),
    title         VARCHAR(100),
    is_primary    BOOLEAN NOT NULL DEFAULT FALSE,
    is_active     BOOLEAN NOT NULL DEFAULT TRUE,
    created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (tenant_id, email)
);

ALTER TABLE customer_contacts ENABLE ROW LEVEL SECURITY;
ALTER TABLE customer_contacts FORCE ROW LEVEL SECURITY;

CREATE POLICY tenant_isolation ON customer_contacts
    USING (tenant_id = app.current_tenant_id())
    WITH CHECK (tenant_id = app.current_tenant_id());

-- The hook (below) reads this table before a JWT exists — the same
-- chicken-and-egg problem tenant_users has (20260827000002_auth_and_grants.sql
-- section 3): tenant_isolation requires a tenant claim, and at token issue
-- there is no JWT yet, so app.current_tenant_id() is NULL and tenant_isolation
-- would filter out every row. A GRANT alone does not fix this — FORCE ROW
-- LEVEL SECURITY still applies to supabase_auth_admin — so it needs the same
-- explicit permissive policy for this role specifically.
GRANT SELECT ON customer_contacts TO supabase_auth_admin;

CREATE POLICY auth_admin_reads_contacts ON customer_contacts
    FOR SELECT TO supabase_auth_admin
    USING (true);


-- -----------------------------------------------------------------------------
-- 2. The third row-visibility function — app.current_employee_id()'s twin
-- -----------------------------------------------------------------------------
-- Defined before anything that references it (the policy just below, and the
-- hook further down).

CREATE OR REPLACE FUNCTION app.current_customer_id() RETURNS UUID
LANGUAGE plpgsql STABLE
SET search_path = ''
AS $$
DECLARE claims jsonb;
BEGIN
    claims := nullif(current_setting('request.jwt.claims', true), '')::jsonb;
    RETURN nullif(claims #>> '{app_metadata,customer_id}', '')::uuid;
EXCEPTION WHEN OTHERS THEN
    -- A malformed claim means "no customer", never "every customer".
    RETURN NULL;
END $$;

GRANT EXECUTE ON FUNCTION app.current_customer_id() TO app_user;

-- Whether the actor is a portal contact at all — checked by ROLE, never by
-- "current_customer_id() IS NULL". Those are NOT the same question: a
-- customer-role actor with a missing or malformed customer_id claim also
-- has current_customer_id() IS NULL, and treating that as "must be staff"
-- would grant them every customer's contacts instead of none. Fails closed
-- the other direction from current_customer_id() on purpose — an error
-- here means "assume the most restrictive case", not "assume staff".
CREATE OR REPLACE FUNCTION app.is_portal_contact() RETURNS BOOLEAN
LANGUAGE plpgsql STABLE
SET search_path = ''
AS $$
DECLARE claims jsonb;
BEGIN
    claims := nullif(current_setting('request.jwt.claims', true), '')::jsonb;
    RETURN coalesce((claims #>> '{app_metadata,role}') = 'customer', false);
EXCEPTION WHEN OTHERS THEN
    RETURN true;
END $$;

GRANT EXECUTE ON FUNCTION app.is_portal_contact() TO app_user;

-- Staff see every contact — tenant_isolation alone covers them; treated as
-- ordinary business directory data, not sealed (docs/17-customer-portal.md
-- §1's explicit PII decision, not a silent default). A portal contact sees
-- only contacts at their OWN customer — a co-worker with portal access,
-- never a contact at a different customer of the firm.
CREATE POLICY portal_contact_visibility ON customer_contacts AS RESTRICTIVE FOR SELECT
USING (
    NOT (SELECT app.is_portal_contact())
    OR customer_id = (SELECT app.current_customer_id())
);


-- -----------------------------------------------------------------------------
-- 3. tenant_users grows a second identity column, symmetric with employee_id
-- -----------------------------------------------------------------------------

ALTER TABLE tenant_users ADD COLUMN customer_contact_id UUID
    REFERENCES customer_contacts(id);

COMMENT ON COLUMN tenant_users.customer_contact_id IS
    'Set for a portal contact; NULL for staff. See docs/17-customer-portal.md.';

-- Base roles are not a Postgres enum (Tier 1 customization — ALTER TYPE has
-- no DROP VALUE, so a typo would be permanent); this is a CHECK, extended
-- exactly like any other Tier 1 vocabulary edit.
ALTER TABLE tenant_users DROP CONSTRAINT tenant_users_role_is_a_base_role;
ALTER TABLE tenant_users ADD CONSTRAINT tenant_users_role_is_a_base_role
    CHECK (role IN ('owner', 'firm_admin', 'employee', 'contractor', 'customer'));

-- A tenant_users row is staff OR a portal contact, never both and never
-- neither — the constraint that keeps the two identity classes from
-- drifting into an ambiguous third shape by accident. Every existing row
-- has employee_id set and customer_contact_id NULL, confirmed against the
-- live fixture before this migration was written (0 rows with employee_id
-- IS NULL), so this needs no backfill.
ALTER TABLE tenant_users ADD CONSTRAINT ck_tenant_users_one_identity
    CHECK (num_nonnulls(employee_id, customer_contact_id) = 1);


-- -----------------------------------------------------------------------------
-- 4. The token claim carries the two new fields
-- -----------------------------------------------------------------------------
-- Mirrors 20260830090000's employee_id handling exactly: customer_id is
-- derived (joined from customer_contacts, not stored on tenant_users
-- itself), and both are NULL-coalesced the same way employee_id already is.

CREATE OR REPLACE FUNCTION public.custom_access_token_hook(event jsonb)
RETURNS jsonb
LANGUAGE plpgsql STABLE
SET search_path = ''
AS $$
DECLARE
    claims     jsonb := event->'claims';
    membership RECORD;
BEGIN
    SELECT tu.tenant_id, tu.role, tu.functional_roles, tu.employee_id,
           tu.customer_contact_id, cc.customer_id
      INTO membership
      FROM public.tenant_users tu
      LEFT JOIN public.customer_contacts cc ON cc.id = tu.customer_contact_id
     WHERE tu.user_id = (event->>'user_id')::uuid
       AND tu.is_active
     ORDER BY tu.is_default_tenant DESC, tu.last_active_at DESC NULLS LAST
     LIMIT 1;

    IF membership.tenant_id IS NOT NULL THEN
        claims := jsonb_set(claims, '{app_metadata,tenant_id}',
                            to_jsonb(membership.tenant_id::text));
        claims := jsonb_set(claims, '{app_metadata,role}',
                            to_jsonb(membership.role));
        claims := jsonb_set(claims, '{app_metadata,functional_roles}',
                            to_jsonb(coalesce(membership.functional_roles, '{}'::text[])));
        -- May be NULL: a tenant member is not necessarily an employee.
        claims := jsonb_set(claims, '{app_metadata,employee_id}',
                            coalesce(to_jsonb(membership.employee_id::text), 'null'::jsonb));
        -- May be NULL: a tenant member is not necessarily a portal contact.
        claims := jsonb_set(claims, '{app_metadata,customer_contact_id}',
                            coalesce(to_jsonb(membership.customer_contact_id::text), 'null'::jsonb));
        claims := jsonb_set(claims, '{app_metadata,customer_id}',
                            coalesce(to_jsonb(membership.customer_id::text), 'null'::jsonb));
    END IF;

    RETURN jsonb_set(event, '{claims}', claims);
END;
$$;
