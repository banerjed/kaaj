-- The customer portal is switched off. A customer contact's membership no
-- longer becomes a session: the hook skips it, so the contact's token carries
-- no tenant and reaches no row. Their tenant_users rows are kept, inactive in
-- effect, so turning the portal back on is a change to this function alone.
--
-- Restated whole from 20260928060000_stamp_sso_claims.sql; the only change is
-- the membership filter.
CREATE OR REPLACE FUNCTION public.custom_access_token_hook(event jsonb)
RETURNS jsonb
LANGUAGE plpgsql STABLE
SET search_path = ''
AS $$
DECLARE
    claims     jsonb := event->'claims';
    membership RECORD;
    registry   RECORD;
BEGIN
    SELECT tu.tenant_id, tu.role, tu.functional_roles, tu.employee_id
      INTO membership
      FROM public.tenant_users tu
     WHERE tu.user_id = (event->>'user_id')::uuid
       AND tu.is_active
       AND tu.customer_contact_id IS NULL
       AND tu.role <> 'customer'
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
        -- Always NULL while the portal is off; kept so readers of the claim
        -- see an explicit "not a portal contact".
        claims := jsonb_set(claims, '{app_metadata,customer_contact_id}', 'null'::jsonb);
        claims := jsonb_set(claims, '{app_metadata,customer_id}', 'null'::jsonb);

        SELECT tr.sso_provider_type, tr.sso_provider_ref, tr.sso_required
          INTO registry
          FROM public.tenant_registry tr
         WHERE tr.tenant_id = membership.tenant_id;

        claims := jsonb_set(claims, '{app_metadata,sso_provider_type}',
                            coalesce(to_jsonb(registry.sso_provider_type), 'null'::jsonb));
        claims := jsonb_set(claims, '{app_metadata,sso_provider_ref}',
                            coalesce(to_jsonb(registry.sso_provider_ref), 'null'::jsonb));
        claims := jsonb_set(claims, '{app_metadata,sso_required}',
                            to_jsonb(coalesce(registry.sso_required, false)));
    END IF;

    RETURN jsonb_set(event, '{claims}', claims);
END;
$$;
