-- `service_role` has BYPASSRLS (confirmed: pg_roles.rolbypassrls = true), but
-- RLS bypass and table-level GRANTs are separate layers — nothing in any
-- prior migration ever granted this role SELECT/INSERT/UPDATE on anything.
-- Verified empirically: a real PostgREST call through the service-role key
-- fails with "permission denied for table contact_requests" even though
-- that file is on verify-service-role.mjs's own PERMITTED list — every
-- already-shipped service-role write path (contact form, billing, account
-- deletion) has been silently broken by this, not just the new one.
--
-- No DELETE, mirroring this codebase's own "no DELETE in app code" rule —
-- every service-role caller so far only selects, inserts or updates.
GRANT SELECT, INSERT, UPDATE ON ALL TABLES IN SCHEMA public TO service_role;

ALTER DEFAULT PRIVILEGES IN SCHEMA public
    GRANT SELECT, INSERT, UPDATE ON TABLES TO service_role;
