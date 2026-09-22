-- =============================================================================
-- Kaaj — document management: the base `documents` table (17§3) plus the
-- staff-side folder tree, sharing and archiving (18-document-management.md)
-- =============================================================================
-- 17§3 specifies `documents` but it was never built — this migration lands
-- it and 18's folder layer in one file, per 18§5's build order (base table +
-- portal RLS first, folders + staff RLS on top; the two are independently
-- testable but there is no reason to split them across migrations here).
--
-- Two fixes to 18§2/§3's own SQL, made deliberately rather than copied
-- verbatim:
--
--   1. `app.can_see_folder()` is called FROM a policy ON document_folders and
--      itself queries document_folders — policy -> function -> table -> same
--      policy. As plain LANGUAGE SQL STABLE (SECURITY INVOKER) that recurses.
--      Made SECURITY DEFINER instead: a narrow read of one folder's own
--      ownership/visibility/share columns, never a route to return rows.
--   2. `SET search_path = ''` with bare table names inside the function body
--      would not resolve. Everything below is schema-qualified.
--
-- The spec also names `app.current_base_role()`, which doesn't exist —
-- `app.claim_role()` (20260902041935) already answers that question, reused
-- here instead of inventing a synonym.
-- =============================================================================


-- -----------------------------------------------------------------------------
-- 1. `documents` (17§3, verbatim schema)
-- -----------------------------------------------------------------------------

CREATE TABLE documents (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id       UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,

    -- Polymorphic owner, same shape as custom_field_definitions.entity_type —
    -- a document can hang off a project, a customer, a ticket, or nothing
    -- (a general firm document).
    entity_type     TEXT,               -- 'project' | 'customer' | 'ticket' | NULL
    entity_id       UUID,

    customer_id     UUID REFERENCES customers(id),  -- denormalized for the RLS
                                                      -- policy below; NULL for
                                                      -- internal-only documents

    file_name       TEXT NOT NULL,
    storage_key     TEXT NOT NULL,      -- Supabase Storage object path
    mime_type       TEXT NOT NULL,
    file_size_bytes INTEGER NOT NULL,

    visibility      TEXT NOT NULL DEFAULT 'internal'
        CONSTRAINT documents_visibility_check
        CHECK (visibility IN ('internal', 'client_visible', 'public')),

    uploaded_by_employee_id UUID,
    uploaded_by_contact_id  UUID REFERENCES customer_contacts(id),
    CONSTRAINT documents_uploader_check
        CHECK (num_nonnulls(uploaded_by_employee_id, uploaded_by_contact_id) = 1),

    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_documents_entity ON documents (tenant_id, entity_type, entity_id);
CREATE INDEX idx_documents_customer ON documents (tenant_id, customer_id)
    WHERE customer_id IS NOT NULL;

ALTER TABLE documents ENABLE ROW LEVEL SECURITY;
ALTER TABLE documents FORCE ROW LEVEL SECURITY;

-- The PERMISSIVE base every table gets (L63) — 17§3 only shows the two
-- RESTRICTIVE portal policies below; those narrow this, they don't replace it.
CREATE POLICY tenant_isolation ON documents
    USING (tenant_id = app.current_tenant_id())
    WITH CHECK (tenant_id = app.current_tenant_id());

CREATE POLICY portal_document_visibility ON documents AS RESTRICTIVE FOR SELECT
USING (
  NOT (SELECT app.is_portal_contact())
  OR (customer_id = (SELECT app.current_customer_id())
      AND visibility IN ('client_visible', 'public'))
);

CREATE POLICY portal_document_upload ON documents AS RESTRICTIVE FOR INSERT
WITH CHECK (
  NOT (SELECT app.is_portal_contact())
  OR (customer_id = (SELECT app.current_customer_id())
      AND uploaded_by_contact_id = (SELECT app.current_customer_contact_id())
      AND visibility = 'client_visible')
);

COMMENT ON TABLE documents IS
    'General-purpose document store — see docs/17-customer-portal.md §3 and docs/18-document-management.md.';


-- -----------------------------------------------------------------------------
-- 2. `document_folders` (18§1)
-- -----------------------------------------------------------------------------

CREATE TABLE document_folders (
    id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id         UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,

    parent_folder_id  UUID REFERENCES document_folders(id),
    -- Every ancestor's id, root-to-parent order. Denormalized and
    -- RECOMPUTED on move, never hand-maintained (L58 shape) — this is what
    -- turns "is this folder visible to me" into an array-containment check
    -- instead of a recursive CTE inside an RLS policy.
    path_ids          UUID[] NOT NULL DEFAULT '{}',

    name              VARCHAR(255) NOT NULL,
    owner_employee_id UUID NOT NULL REFERENCES employees(id),

    visibility        TEXT NOT NULL DEFAULT 'private'
        CONSTRAINT document_folders_visibility_check
        CHECK (visibility IN ('private', 'shared', 'company')),

    -- Same polymorphic-owner shape as documents.entity_type — a project's
    -- "Files" folder is a document_folders row with entity_type = 'project'.
    -- NULL/NULL is a general firm folder.
    entity_type       TEXT,
    entity_id         UUID,

    archived_at       TIMESTAMPTZ,

    created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_document_folders_parent ON document_folders (tenant_id, parent_folder_id);
CREATE INDEX idx_document_folders_path ON document_folders USING GIN (path_ids);
CREATE INDEX idx_document_folders_entity ON document_folders (tenant_id, entity_type, entity_id)
    WHERE entity_type IS NOT NULL;

ALTER TABLE document_folders ENABLE ROW LEVEL SECURITY;
ALTER TABLE document_folders FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON document_folders
    USING (tenant_id = app.current_tenant_id())
    WITH CHECK (tenant_id = app.current_tenant_id());

COMMENT ON TABLE document_folders IS
    'Staff-side folder tree over documents. See docs/18-document-management.md §1.';


-- -----------------------------------------------------------------------------
-- 3. `document_folder_shares` (18§1) — the one real ACL surface, folder-
--    scoped rather than per-file. Constraints named explicitly so the
--    constraint registry (apps/web/src/lib/server/db/constraints.ts) and
--    forms.test.ts have a stable target, not a Postgres-truncated name.
-- -----------------------------------------------------------------------------

CREATE TABLE document_folder_shares (
    id                     UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id              UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    folder_id              UUID NOT NULL REFERENCES document_folders(id) ON DELETE CASCADE,

    -- Share with a person or a functional role, never both.
    shared_with_employee_id UUID REFERENCES employees(id),
    shared_with_role        TEXT,  -- a FunctionalRole from @kaaj/authz
    CONSTRAINT document_folder_shares_target_check
        CHECK (num_nonnulls(shared_with_employee_id, shared_with_role) = 1),

    permission             TEXT NOT NULL
        CONSTRAINT document_folder_shares_permission_check
        CHECK (permission IN ('view', 'edit')),
    granted_by             UUID NOT NULL REFERENCES employees(id),
    granted_at             TIMESTAMPTZ NOT NULL DEFAULT now(),
    -- "Unshare" cannot be a DELETE (default DELETE is revoked from app_user —
    -- 20260830120000_append_only.sql — and this table inherits that, like
    -- every other). Re-sharing after a revoke UPDATEs this back to NULL
    -- rather than inserting a second row, which is what keeps the UNIQUE
    -- constraint below meaningful instead of needing a partial index.
    revoked_at              TIMESTAMPTZ,

    CONSTRAINT document_folder_shares_unique_share
        UNIQUE (tenant_id, folder_id, shared_with_employee_id, shared_with_role)
);

CREATE INDEX idx_document_folder_shares_folder ON document_folder_shares (tenant_id, folder_id);
CREATE INDEX idx_document_folder_shares_employee ON document_folder_shares (tenant_id, shared_with_employee_id)
    WHERE shared_with_employee_id IS NOT NULL;

ALTER TABLE document_folder_shares ENABLE ROW LEVEL SECURITY;
ALTER TABLE document_folder_shares FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON document_folder_shares
    USING (tenant_id = app.current_tenant_id())
    WITH CHECK (tenant_id = app.current_tenant_id());

COMMENT ON TABLE document_folder_shares IS
    'Only rows for visibility = shared folders. See docs/18-document-management.md §1.';


-- -----------------------------------------------------------------------------
-- 4. `documents` gets a folder — added after document_folders exists, since
--    it references it.
-- -----------------------------------------------------------------------------

ALTER TABLE documents ADD COLUMN folder_id UUID REFERENCES document_folders(id);
ALTER TABLE documents ADD COLUMN archived_at TIMESTAMPTZ;

CREATE INDEX idx_documents_folder ON documents (tenant_id, folder_id)
    WHERE folder_id IS NOT NULL;


-- -----------------------------------------------------------------------------
-- 5. app.current_functional_roles() — the app.current_*() family's missing
--    member, same fail-closed shape as its siblings (L62). Returns an empty
--    array on a malformed claim, never every role.
-- -----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION app.current_functional_roles() RETURNS TEXT[]
LANGUAGE plpgsql STABLE
SET search_path = ''
AS $$
DECLARE claims jsonb;
BEGIN
    claims := nullif(current_setting('request.jwt.claims', true), '')::jsonb;
    RETURN coalesce(
        (SELECT array_agg(value) FROM jsonb_array_elements_text(
            claims #> '{app_metadata,functional_roles}'
        )),
        '{}'
    );
EXCEPTION WHEN OTHERS THEN
    RETURN '{}';
END $$;

GRANT EXECUTE ON FUNCTION app.current_functional_roles() TO app_user;


-- -----------------------------------------------------------------------------
-- 6. Two helpers, split deliberately rather than the spec's single
--    can_see_folder() — verified empirically against the local stack:
--
--    `INSERT ... RETURNING` (and `UPDATE ... RETURNING`) checks the new row
--    against SELECT policies using the row's OWN column values, evaluated as
--    part of that same statement — a nested function that does its own
--    `SELECT ... FROM document_folders` cannot yet see the row it is being
--    asked about, because the command counter hasn't advanced within that
--    statement. A single self-referential can_see_folder(), called from
--    document_folders' own policy, hit exactly this: `RETURNING id` on a
--    plain owner-creates-their-own-folder insert failed row security, even
--    though the same insert without RETURNING (or a SELECT run as a
--    separate statement afterward) succeeded. SECURITY DEFINER does not
--    help here — it changes whose privileges the read runs with, not
--    whether the row is visible to a fresh query within the same statement.
--
--    Fix: document_folders' own policy (§7) never re-queries
--    document_folders — ownership/company are checked INLINE against the
--    row's own columns, which RETURNING already has in hand. Only the
--    `shared` arm needs a lookup, and it only ever touches
--    document_folder_shares — a different table, so no self-reference and
--    no RETURNING-snapshot problem. staff_document_visibility (on
--    `documents`) has no such constraint — it queries document_folders,
--    never documents — so can_see_folder() below stays as the one function
--    for that policy and for the app-layer download-proxy check (18§5).
-- -----------------------------------------------------------------------------

/** Used only by staff_folder_visibility, inline — never touches document_folders. */
CREATE OR REPLACE FUNCTION app.folder_shared_with_me(candidate_ids UUID[]) RETURNS BOOLEAN
LANGUAGE plpgsql STABLE
SET search_path = ''
AS $$
BEGIN
    RETURN EXISTS (
        SELECT 1 FROM public.document_folder_shares s
         WHERE s.folder_id = ANY (candidate_ids)
           AND s.revoked_at IS NULL
           AND (
                s.shared_with_employee_id = app.current_employee_id()
             OR s.shared_with_role = ANY (app.current_functional_roles())
               )
    );
EXCEPTION WHEN OTHERS THEN
    RETURN false;
END $$;

GRANT EXECUTE ON FUNCTION app.folder_shared_with_me(UUID[]) TO app_user;

/**
 * For staff_document_visibility (queries document_folders, a different
 * table from the one its policy protects) and for the download-proxy route.
 * SECURITY DEFINER so the read isn't itself re-narrowed by
 * staff_folder_visibility — equivalent either way (this runs as the
 * migration owner, which already bypasses RLS), but explicit rather than
 * incidental.
 */
CREATE OR REPLACE FUNCTION app.can_see_folder(folder UUID) RETURNS BOOLEAN
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    f RECORD;
BEGIN
    SELECT owner_employee_id, visibility, path_ids
      INTO f
      FROM public.document_folders
     WHERE id = folder;

    IF NOT FOUND THEN
        RETURN false;
    END IF;

    RETURN
        f.owner_employee_id = app.current_employee_id()
        OR f.visibility = 'company'
        OR (
             f.visibility = 'shared'
             AND app.folder_shared_with_me(f.path_ids || folder)
           );
EXCEPTION WHEN OTHERS THEN
    -- A malformed claim means "cannot see this folder", never "can see every folder".
    RETURN false;
END $$;

GRANT EXECUTE ON FUNCTION app.can_see_folder(UUID) TO app_user;

COMMENT ON FUNCTION app.can_see_folder(UUID) IS
    'Answers one folder at a time for staff_document_visibility and the '
    'download-proxy route. NEVER call this from document_folders'' own '
    'policy — see the RETURNING note above this function.';


-- -----------------------------------------------------------------------------
-- 7. The staff RLS policies (18§3), composed with the portal ones above the
--    same way 20260909120000_ticketing_visibility.sql composes with
--    20260905090000's portal policies: RESTRICTIVE, additive, each opening
--    with the portal exemption so neither narrows the other's actor class.
-- -----------------------------------------------------------------------------

CREATE POLICY staff_folder_visibility ON document_folders AS RESTRICTIVE FOR SELECT
USING (
  (SELECT app.is_portal_contact())
  OR (SELECT app.claim_role()) IN ('owner', 'firm_admin')
  OR owner_employee_id = (SELECT app.current_employee_id())
  OR visibility = 'company'
  OR (visibility = 'shared' AND app.folder_shared_with_me(path_ids || id))
);

CREATE POLICY staff_document_visibility ON documents AS RESTRICTIVE FOR SELECT
USING (
  (SELECT app.is_portal_contact())
  OR (SELECT app.claim_role()) IN ('owner', 'firm_admin')
  OR (folder_id IS NOT NULL AND app.can_see_folder(folder_id))
);

COMMENT ON POLICY staff_folder_visibility ON document_folders IS
    'Row-level visibility. See docs/18-document-management.md §3.';
COMMENT ON POLICY staff_document_visibility ON documents IS
    'Row-level visibility. See docs/18-document-management.md §3.';


-- -----------------------------------------------------------------------------
-- 8. Search (18§7): trigram filename match, date-range and owner indexes.
-- -----------------------------------------------------------------------------

CREATE EXTENSION IF NOT EXISTS pg_trgm;

CREATE INDEX idx_documents_name_trgm ON documents USING GIN (file_name gin_trgm_ops);
CREATE INDEX idx_folders_name_trgm ON document_folders USING GIN (name gin_trgm_ops);

CREATE INDEX idx_documents_tenant_created ON documents (tenant_id, created_at DESC);
CREATE INDEX idx_documents_tenant_owner_created
    ON documents (tenant_id, uploaded_by_employee_id, created_at DESC);


-- -----------------------------------------------------------------------------
-- 9. Storage — a private bucket, tenant-prefixed like tenant-logos
--    (20260921030000). Storage RLS covers the tenant boundary only (18§5):
--    it cannot see document_folder_shares, so folder-level sharing is
--    enforced by the app's download route re-running app.can_see_folder via
--    staff_document_visibility, never by handing out a Storage URL directly.
--
--    Key shape: {tenant_id}/{entity_type}/{entity_id}/{document_id}-{file_name}
--    for an entity-rooted document; {tenant_id}/general/{document_id}-{file_name}
--    when entity_type is NULL (17§3 leaves this case unnamed — 'general' is
--    this migration's choice, kept tenant_id as segment 1 either way, which
--    is what storage.foldername(name)[1] below depends on).
-- -----------------------------------------------------------------------------

INSERT INTO storage.buckets (id, name, public)
VALUES ('documents', 'documents', false);

CREATE POLICY documents_bucket_read ON storage.objects
    FOR SELECT
    USING (
        bucket_id = 'documents'
        AND (storage.foldername(name))[1] = app.current_tenant_id()::text
    );

CREATE POLICY documents_bucket_write ON storage.objects
    FOR INSERT
    WITH CHECK (
        bucket_id = 'documents'
        AND (storage.foldername(name))[1] = app.current_tenant_id()::text
    );
