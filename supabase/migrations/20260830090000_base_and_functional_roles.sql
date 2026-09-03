-- =============================================================================
-- Kaaj — one base role, plus any number of functional roles (docs/14-access-control.md)
-- =============================================================================
-- `role` is the base role, exactly one: owner | firm_admin | employee |
-- contractor. `functional_roles` are zero or more on top (hr_admin,
-- payroll_admin, …) — small firms wear several hats, and one-role-per-person
-- forces over-granting or a second login.
--
-- Neither column is a Postgres enum: roles are Tier 1 customization
-- (06-customization-model.md), and ALTER TYPE has no DROP VALUE, so a
-- customer's typo would be permanent. CHECK constraints instead.
-- =============================================================================

ALTER TABLE tenant_users
    ADD COLUMN functional_roles TEXT[] NOT NULL DEFAULT '{}'::text[];

COMMENT ON COLUMN tenant_users.role IS
    'Base role — exactly one. See docs/14-access-control.md.';
COMMENT ON COLUMN tenant_users.functional_roles IS
    'Functional roles on top of the base role. See docs/14-access-control.md.';

-- Rename the two values that were spelled differently everywhere else.
-- `manager` disappears entirely: it is DERIVED from employees.manager_id, and a
-- granted `manager` on someone with no reports conferred nothing.
UPDATE tenant_users SET role = 'employee' WHERE role IN ('member', 'manager');

-- hr_admin was a job held in the base column. It becomes what it always was.
UPDATE tenant_users
   SET role = 'employee',
       functional_roles = array_append(functional_roles, 'hr_admin')
 WHERE role = 'hr_admin';

ALTER TABLE tenant_users
    ALTER COLUMN role SET DEFAULT 'employee';

ALTER TABLE tenant_users
    ADD CONSTRAINT tenant_users_role_is_a_base_role
    CHECK (role IN ('owner', 'firm_admin', 'employee', 'contractor'));

ALTER TABLE tenant_users
    ADD CONSTRAINT tenant_users_functional_roles_are_known
    CHECK (functional_roles <@ ARRAY[
        'hr_admin', 'payroll_admin', 'finance_admin', 'sales_admin',
        'marketing_admin', 'it_admin', 'legal_admin', 'project_manager',
        'auditor'
    ]::text[]);

-- Separation of duties: whoever sets pay must not approve the run that pays
-- it, or one person can raise and approve their own salary.
ALTER TABLE tenant_users
    ADD CONSTRAINT tenant_users_pay_setter_is_not_pay_approver
    CHECK (NOT (functional_roles @> ARRAY['hr_admin']::text[]
            AND functional_roles @> ARRAY['payroll_admin']::text[]));

-- An auditor must be read-only everywhere, including via a base role that
-- already writes.
ALTER TABLE tenant_users
    ADD CONSTRAINT tenant_users_auditor_writes_nothing
    CHECK (NOT (functional_roles @> ARRAY['auditor']::text[]
            AND (array_length(functional_roles, 1) > 1
                 OR role IN ('owner', 'firm_admin'))));

-- tenant_id leads the index (ADR-003 rule 3) so this scan stays per-tenant.
CREATE INDEX idx_tenant_users_functional_roles
    ON tenant_users USING GIN (tenant_id, functional_roles);


-- -----------------------------------------------------------------------------
-- The token claim carries both, and the employee id
-- -----------------------------------------------------------------------------
-- `employee_id` lets row visibility answer "see your own record", not just
-- "which tenant". search_path pinned per 20260828000001 — GoTrue runs this as
-- supabase_auth_admin, which cannot resolve unqualified names.

CREATE OR REPLACE FUNCTION public.custom_access_token_hook(event jsonb)
RETURNS jsonb
LANGUAGE plpgsql STABLE
SET search_path = ''
AS $$
DECLARE
    claims     jsonb := event->'claims';
    membership RECORD;
BEGIN
    SELECT tu.tenant_id, tu.role, tu.functional_roles, tu.employee_id
      INTO membership
      FROM public.tenant_users tu
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
    END IF;

    RETURN jsonb_set(event, '{claims}', claims);
END;
$$;
