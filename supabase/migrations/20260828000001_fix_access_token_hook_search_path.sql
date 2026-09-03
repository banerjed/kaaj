-- =============================================================================
-- Kaaj — make custom_access_token_hook() resolve its tables
-- =============================================================================
-- GoTrue invokes the hook as supabase_auth_admin, whose search_path excludes
-- public, so the unqualified `tenant_users` reference failed every login with
-- "relation does not exist" — a permission-shaped bug that was really name
-- resolution. Fixed per Supabase's recommendation for any function reachable
-- by another role: pin `SET search_path = ''` and schema-qualify references.
-- Behaviour is otherwise unchanged from 20260827000002.
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

-- CREATE OR REPLACE doesn't reliably preserve grants/revokes, so restate both.
-- The hook reads membership across every tenant and must stay GoTrue-only.
GRANT EXECUTE ON FUNCTION public.custom_access_token_hook(jsonb) TO supabase_auth_admin;
REVOKE EXECUTE ON FUNCTION public.custom_access_token_hook(jsonb)
    FROM authenticated, anon, public;
