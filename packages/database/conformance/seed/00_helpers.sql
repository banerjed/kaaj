-- ACS_GOLDEN_SEED_V1 helpers (docs/34-accounting-conformance-spec-V1.md,
-- section 4.2). Every id is derived from a name, so two seeds are identical.
CREATE SCHEMA IF NOT EXISTS _acs;

CREATE OR REPLACE FUNCTION _acs.u(kind text, n bigint) RETURNS uuid
LANGUAGE sql IMMUTABLE PARALLEL SAFE AS $$
    SELECT md5('acs:' || kind || ':' || n)::uuid
$$;

CREATE OR REPLACE FUNCTION _acs.tenant() RETURNS uuid
LANGUAGE sql IMMUTABLE PARALLEL SAFE AS $$ SELECT _acs.u('tenant', 1) $$;

-- The owner's auth user id: every created_by/posted_by the runner writes.
CREATE OR REPLACE FUNCTION _acs.owner_user() RETURNS uuid
LANGUAGE sql IMMUTABLE PARALLEL SAFE AS $$ SELECT _acs.u('user', 1) $$;
