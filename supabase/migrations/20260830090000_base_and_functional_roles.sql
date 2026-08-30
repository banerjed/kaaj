-- =============================================================================
-- Kaaj — one base role, plus any number of functional roles
-- =============================================================================
-- docs/14-access-control.md. `tenant_users.role` carried a single value drawn
-- from a vocabulary that disagreed with `enumerations.json`, with
-- `employee_group_roles`, and with itself: `owner, hr_admin, manager, member`
-- where the enum file said `firm_admin` and `employee` for the same two ideas,
-- and where `hr_admin` (a job) and `member` (a floor) were the same column.
--
-- After this migration:
--
--   role              the BASE role. Exactly one. The floor.
--                     owner | firm_admin | employee | contractor
--   functional_roles  zero or more, on top. hr_admin, payroll_admin, …
--
-- The split exists because small firms wear several hats: the office manager
-- who runs HR also orders the laptops, and one-role-per-person forces either
-- over-granting or a second login.
--
-- NEITHER COLUMN BECOMES A POSTGRES ENUM. Roles are Tier 1 customization
-- (06-customization-model.md) and ALTER TYPE has no DROP VALUE, so a customer's
-- typo would be permanent. `./check` enforces that via _must_not_be_enum.
-- CHECK constraints are used instead: they are alterable.
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

-- Separation of duties, enforced by the database rather than by remembering.
--
-- Whoever sets pay must not approve the run that pays it. Without this, one
-- person can raise their own salary and approve their own payment, which is
-- the oldest fraud in payroll and the reason the control exists.
ALTER TABLE tenant_users
    ADD CONSTRAINT tenant_users_pay_setter_is_not_pay_approver
    CHECK (NOT (functional_roles @> ARRAY['hr_admin']::text[]
            AND functional_roles @> ARRAY['payroll_admin']::text[]));

-- An auditor who can change things is not an auditor. Read-only everywhere, or
-- the audit is worthless — including via a base role that already writes.
ALTER TABLE tenant_users
    ADD CONSTRAINT tenant_users_auditor_writes_nothing
    CHECK (NOT (functional_roles @> ARRAY['auditor']::text[]
            AND (array_length(functional_roles, 1) > 1
                 OR role IN ('owner', 'firm_admin'))));

-- Composite GIN, tenant_id leading, via btree_gin. "Who here holds hr_admin?"
-- is a per-tenant question like every other, and an index that does not lead
-- with tenant_id scans other tenants' rows before discarding them — which is
-- why the index/tenant-leading invariant exists.
CREATE INDEX idx_tenant_users_functional_roles
    ON tenant_users USING GIN (tenant_id, functional_roles);


-- -----------------------------------------------------------------------------
-- The token claim carries both, and the employee id
-- -----------------------------------------------------------------------------
-- `employee_id` joins the claim because row visibility needs to know WHICH
-- person is asking, not just which tenant — "see your own record" is not
-- expressible without it.
--
-- Same discipline as 20260828000001: SET search_path = '' and every reference
-- schema-qualified, because GoTrue invokes this as `supabase_auth_admin`, whose
-- search_path does not include public. Getting that wrong is not a degraded
-- login, it is a 500 on /token and no login at all (L5).

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
