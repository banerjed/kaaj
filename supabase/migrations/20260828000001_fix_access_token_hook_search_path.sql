-- =============================================================================
-- Kaaj — make custom_access_token_hook() resolve its tables
-- =============================================================================
-- Found by registering the hook for the first time. 20260827000002 created the
-- function but registration is a separate, non-SQL step — [auth.hook.custom_access_token]
-- in config.toml locally, Authentication > Hooks on a hosted project — so until
-- now nothing ever called it and the defect below could not surface.
--
-- The function as written references `tenant_users` unqualified:
--
--     SELECT tu.tenant_id, tu.role FROM tenant_users tu WHERE ...
--
-- GoTrue invokes it as `supabase_auth_admin`, whose search_path does not
-- include `public`. Every login therefore fails with
--
--     ERROR: relation "tenant_users" does not exist (SQLSTATE 42P01)
--
-- and GoTrue turns a hook error into a 500 on /token — so this is not a
-- degraded login, it is no login at all. The previous migration's grants
-- (USAGE on public, SELECT on tenant_users, the auth_admin_reads_memberships
-- policy) were all correct; name resolution was the missing piece, and a
-- permission-shaped bug it is easy to mistake for.
--
-- Fixed the way Supabase recommends for any function reachable by another role:
-- pin `SET search_path = ''` and schema-qualify every reference, so the function
-- cannot be affected by whatever search_path the caller happens to carry. A
-- SECURITY DEFINER function with a mutable search_path is a privilege-escalation
-- vector; this one is INVOKER, but pinning it costs nothing and makes the
-- resolution explicit rather than ambient.
--
-- Behaviour is otherwise byte-for-byte the body from 20260827000002.
-- =============================================================================

CREATE OR REPLACE FUNCTION public.custom_access_token_hook(event jsonb)
RETURNS jsonb
LANGUAGE plpgsql STABLE
SET search_path = ''
AS $$
DECLARE
    claims     jsonb := event->'claims';
    membership RECORD;
BEGIN
    SELECT tu.tenant_id, tu.role
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
    END IF;

    RETURN jsonb_set(event, '{claims}', claims);
END;
$$;

-- CREATE OR REPLACE preserves neither grants nor revokes reliably across
-- signature-identical replacements, so restate both. The hook must be callable
-- by GoTrue and by nobody else: it reads membership across every tenant.
GRANT EXECUTE ON FUNCTION public.custom_access_token_hook(jsonb) TO supabase_auth_admin;
REVOKE EXECUTE ON FUNCTION public.custom_access_token_hook(jsonb)
    FROM authenticated, anon, public;
