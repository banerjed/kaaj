-- =============================================================================
-- Kaaj — tenant company logo storage (US-ACC-001 branding)
-- =============================================================================
-- A private bucket, one object per tenant at "<tenant_id>/logo" (no
-- extension in the key — the uploaded content-type is stored as Storage
-- object metadata and served back from it, so a re-upload in a different
-- format never leaves a stale second file to clean up).
--
-- Verified empirically against the local stack before writing this file
-- (real sign-in, real HTTP calls to the storage-api container, not assumed
-- from documentation): storage-api sets `request.jwt.claims` per request
-- exactly like PostgREST does, so `app.current_tenant_id()` — already used
-- by every other tenant_isolation policy in this schema — works unchanged
-- here. Confirmed: same-tenant upload/read succeed; a write into another
-- tenant's folder is rejected with a real RLS violation; a read of another
-- tenant's object reports 404, not the content. No service-role path is
-- needed for this feature.
-- =============================================================================

ALTER TABLE tenants ADD COLUMN logo_storage_key text;

INSERT INTO storage.buckets (id, name, public)
VALUES ('tenant-logos', 'tenant-logos', false);

CREATE POLICY tenant_logos_read ON storage.objects
    FOR SELECT
    USING (
        bucket_id = 'tenant-logos'
        AND (storage.foldername(name))[1] = app.current_tenant_id()::text
    );

CREATE POLICY tenant_logos_write ON storage.objects
    FOR INSERT
    WITH CHECK (
        bucket_id = 'tenant-logos'
        AND (storage.foldername(name))[1] = app.current_tenant_id()::text
    );

CREATE POLICY tenant_logos_update ON storage.objects
    FOR UPDATE
    USING (
        bucket_id = 'tenant-logos'
        AND (storage.foldername(name))[1] = app.current_tenant_id()::text
    )
    WITH CHECK (
        bucket_id = 'tenant-logos'
        AND (storage.foldername(name))[1] = app.current_tenant_id()::text
    );

CREATE POLICY tenant_logos_delete ON storage.objects
    FOR DELETE
    USING (
        bucket_id = 'tenant-logos'
        AND (storage.foldername(name))[1] = app.current_tenant_id()::text
    );
