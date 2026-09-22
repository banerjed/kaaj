# Document Management: folders, sharing, archiving

**Status:** 📋 specification — not implemented.
**Created:** 2026-09-21

A general-purpose, Drive-like document store for staff — folders, upload,
simple sharing, archiving. This is the internal half of document handling;
the client-facing half is already specified in
[17-customer-portal.md §3](./17-customer-portal.md#3-document-portal-internal-and-client-facing)
("no generic document table exists... a file attached to a project, visible
to that project's client, uploaded by either side"). This document extends
that `documents` table with a folder tree rather than building a second
document system — see [§5](#5-relationship-to-17-customer-portal-3) for
exactly what is reused and what is new.

Reviewed against the Nexus file-manager reference
(`https://nexus.daisyui.com/apps/file-manager`) per the UI reference rule in
CLAUDE.md: folder cards with a file count, a flat file table
(Name/Size/Owner/**Shared With**/Action), and a three-state visibility badge
(Private / N members / Public) — that three-state badge is the visual
confirmation for the permission model in §2, not a coincidence.

**Design goal:** small-to-medium business, not an enterprise DMS. Every
decision below picks the simpler of two options where Drive's full
feature set would add a concept an SMB user doesn't need — see the
"What this deliberately excludes" table in §6.

---

## 1. Schema

### `document_folders` (new)

```sql
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
        CHECK (visibility IN ('private', 'shared', 'company')),

    -- Same polymorphic-owner shape as documents.entity_type in 17§3 — a
    -- project's "Files" folder is a document_folders row with
    -- entity_type = 'project'. NULL/NULL is a general firm folder.
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
```

### `document_folder_shares` (new)

Only rows exist here for folders with `visibility = 'shared'` — the one real
ACL surface in this design, deliberately folder-scoped, not per-file:

```sql
CREATE TABLE document_folder_shares (
    id                     UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id              UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    folder_id              UUID NOT NULL REFERENCES document_folders(id) ON DELETE CASCADE,

    -- Share with a person or a functional role, never both.
    shared_with_employee_id UUID REFERENCES employees(id),
    shared_with_role        TEXT,  -- a FunctionalRole from @kaaj/authz
    CHECK (num_nonnulls(shared_with_employee_id, shared_with_role) = 1),

    permission             TEXT NOT NULL CHECK (permission IN ('view', 'edit')),
    granted_by             UUID NOT NULL REFERENCES employees(id),
    granted_at             TIMESTAMPTZ NOT NULL DEFAULT now(),

    UNIQUE (folder_id, shared_with_employee_id, shared_with_role)
);
```

### `documents` — extends the 17§3 table, does not replace it

Add one column to the table already specified in 17§3:

```sql
ALTER TABLE documents ADD COLUMN folder_id UUID REFERENCES document_folders(id);
ALTER TABLE documents ADD COLUMN archived_at TIMESTAMPTZ;

CREATE INDEX idx_documents_folder ON documents (tenant_id, folder_id)
    WHERE folder_id IS NOT NULL;
```

`entity_type`/`entity_id`/`customer_id`/`visibility`
(`internal`/`client_visible`/`public`) and the two `uploaded_by_*` columns
are exactly as 17§3 defined them — a portal contact's ability to see a
document is governed entirely by that existing spec, unaffected by
everything below.

---

## 2. Permissions — three states, not a general ACL

Drive's full per-file ACL is more than an SMB needs to explain or an admin
needs to audit. Three folder-level states, chosen at creation and changeable
by the owner or an admin, cover the real cases:

| State | Who can view | Who can edit |
|---|---|---|
| **Private** | owner, `owner`/`firm_admin` | owner, `owner`/`firm_admin` |
| **Shared** | owner, admins, everyone in `document_folder_shares` | owner, admins, `permission = 'edit'` rows |
| **Company** | every employee in the tenant | owner, admins, explicit editors |

Subfolders inherit the nearest ancestor's effective visibility unless
someone deliberately sets a different one — checked via `path_ids`
containment, not a rule a user has to reason about. There is no per-file
override: a document's visibility is its folder's, full stop. This mirrors
how Drive actually behaves in practice (people share folders, not
individual files) without the surface area of letting every file diverge
from its folder.

Tenant `owner`/`firm_admin` can always see every folder — the same
always-can-see-everything property `owner` already has everywhere else in
`@kaaj/authz`, needed here so an offboarding or compliance review is never
blocked by someone's private folder.

### New permissions (`packages/authz/src/index.ts`)

```ts
"document.read",
"document.write",
```

Added to `EVERYONE` — the same self-service default as
`ticketing.read.own`/`ticketing.write.own`. The coarse permission gates
*whether an employee can use the document store at all*; folder visibility
(§2 above) and RLS govern *which rows* they see, the same two-layer split
`employee.read.self` + row-level policy already uses. No separate
`document.archive` permission — archiving a folder or document requires
edit rights on it (owner, an explicit editor, or an admin), not a new grant
to explain.

The customer-portal permissions `document.read.own`/`document.upload.own`
(17§1) are untouched — a different namespace, a different actor class, no
overlap. `legal.documents.write` (already in `PERMISSIONS`, currently
unused by anything) is also untouched; it is reserved for a narrower,
not-yet-specified legal/compliance document feature and should not be
conflated with the general store this document specifies.

---

## 3. RLS

Three `RESTRICTIVE` policies stack on `documents` and `document_folders`,
each exempting the actor class it isn't for — the same composition pattern
17§3 already uses for `portal_document_visibility`, extended by one more
policy for staff:

```sql
CREATE OR REPLACE FUNCTION app.can_see_folder(folder UUID) RETURNS boolean
LANGUAGE sql STABLE SET search_path = '' AS $$
  SELECT EXISTS (
    SELECT 1 FROM document_folders f
    WHERE f.id = folder
      AND (
        f.owner_employee_id = app.current_employee_id()
        OR f.visibility = 'company'
        OR (
          f.visibility = 'shared'
          AND EXISTS (
            SELECT 1 FROM document_folder_shares s
            WHERE s.folder_id = ANY (f.path_ids || f.id)
              AND (
                s.shared_with_employee_id = app.current_employee_id()
                OR s.shared_with_role = ANY (app.current_functional_roles())
              )
          )
        )
      )
  )
$$;

CREATE POLICY staff_folder_visibility ON document_folders AS RESTRICTIVE FOR SELECT
USING (
  (SELECT app.is_portal_contact())          -- portal contacts: this policy doesn't narrow them
  OR app.current_base_role() IN ('owner', 'firm_admin')
  OR app.can_see_folder(id)
);

CREATE POLICY staff_document_visibility ON documents AS RESTRICTIVE FOR SELECT
USING (
  (SELECT app.is_portal_contact())
  OR app.current_base_role() IN ('owner', 'firm_admin')
  OR (folder_id IS NOT NULL AND app.can_see_folder(folder_id))
);
```

`app.current_functional_roles()` mirrors the existing `app.current_*()`
family (14-access-control.md) — closed-answer on a malformed claim, per
CLAUDE.md's rule that no policy expression parses `request.jwt.claims`
directly.

A document with `folder_id IS NULL` (nothing has been filed into a folder
yet — shouldn't happen via the UI, but the column is nullable) is visible
to nobody but admins by this policy; the upload path should always assign a
folder, defaulting to the uploader's own private root folder if none is
chosen.

---

## 4. Archiving

`./check`'s "no DELETE in app code" rule applies here exactly as
everywhere else: there is no delete action, only `archived_at = now()`.
Archived folders and documents:

- drop out of the default listing and search,
- remain under a dedicated **Archived** view, filtered the same way the
  main view is (an archived private folder is still only visible to its
  owner and admins),
- are restorable by anyone who could have archived them,
- are never purged automatically.

Archiving a folder does not need to recursively archive its contents at
write time — the default view's query excludes anything whose *own or any
ancestor's* `archived_at IS NOT NULL`, so a child folder or document is
already hidden the moment an ancestor is archived, and un-archiving the
parent alone is enough to bring everything back exactly as it was. This
avoids a fan-out write across a whole subtree for what is a display
concern, not a data concern.

Real erasure (a hard delete, for a jurisdiction's right-to-erasure request
on a document containing personal data) is explicitly **out of scope for
this spec** — it would be a service-role-only path with its own review, not
a default UI action, flagged here as a deliberate deferral rather than a
silent gap.

---

## 5. Relationship to 17§3

| | 17§3 (customer portal) | This document |
|---|---|---|
| Table | `documents` (defines it) | Adds `folder_id`, `archived_at` |
| Actor | `customer_contacts` (portal) | Employees (staff) |
| Organization | `entity_type`/`entity_id` only | Adds `document_folders` tree, reusing the same `entity_type`/`entity_id` shape for entity-rooted folders |
| Visibility | `internal`/`client_visible`/`public`, RLS keyed on `customer_id` | `private`/`shared`/`company`, RLS keyed on folder ownership/sharing |
| Storage | Bucket + key convention specified once (§3, "first real use") | Reused unchanged — see below |

**Storage** is specified once, in 17§3, and this document does not
redefine it: one private bucket, objects tenant-prefixed, Storage RLS
covering tenant isolation only. The one addition worth stating explicitly:
**Storage's own RLS has no visibility into `document_folder_shares` — it
cannot enforce folder-level sharing**, only the tenant boundary. Every
download must therefore go through an app route that runs the real
Postgres permission check (`app.can_see_folder`) and then streams the
object — the same proxy shape already shipped in
`apps/web/src/routes/(app)/settings/company/logo/+server.ts` for the
tenant logo. Never return a direct Storage URL to the client for a
`shared` or `private` document; that would let anyone with the key bypass
the folder permission entirely, which is precisely the "a protected value
has more than one home" failure class CLAUDE.md's disclosure lessons warn
about.

**Build order:** 17§3's base `documents` table and portal-side RLS should
land first (nothing here changes that spec), then this document's
`document_folders`/`document_folder_shares` and the staff-side RLS/routes
layer on top. The two are independently testable — `row-visibility.test.ts`
gets one pair of assertions (refused/permitted) per new policy, same
convention as every other table.

---

## 6. What this deliberately excludes, and why

| Drive/enterprise DMS feature | Excluded because |
|---|---|
| Per-file sharing overrides | Folder-level sharing covers the real SMB case; per-file exceptions are a second mental model to teach and a second thing to audit. |
| Comments/annotations on files | No product requirement surfaced one; adds a table, a notification path, and a permission axis for zero validated demand. |
| Version history / file revisions | Re-upload replaces the object at a new `storage_key`, old `documents` row is superseded (not versioned) — a real version chain is a Tier-1-sized feature to add later if requested, not a default. |
| Real-time collaborative editing | Out of scope for a file store; this is upload/organize/share, not a document editor. |
| Arbitrary folder depth in the UI | Deep nesting is technically supported (`path_ids` has no cap) but the UI should nudge toward 2–3 levels — an SMB's file organization rarely needs more, and a shallow tree keeps the sharing model easy to reason about. |
| Cross-tenant/external sharing (a public link) | `documents.visibility = 'public'` already exists in 17§3 for signed-link access without a portal login; this document's `document_folders.visibility = 'company'` is scoped to the tenant and does not extend that mechanism. |

---

## 7. Search

**ADR-002 already settles the infrastructure question**: "PostgreSQL holds
relational data, full-text search indexes... nothing else," and explicitly
supersedes Elasticsearch. Thousands of documents is nowhere near the scale
where that constraint costs anything — a GIN-indexed query over this table
scales into the millions of rows. The three filters this needs to support —
**file name, date range, owner** — are three indexed columns, not three
different subsystems.

### Indexes

```sql
CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- Fuzzy/partial filename match. Trigram, not tsvector: a filename
-- ("Q3-invoice-acme.pdf") is a short identifier, not prose — trigram
-- similarity handles typos, partial fragments and reordered words better
-- than tsvector's word-stemming, which is built for sentences.
CREATE INDEX idx_documents_name_trgm ON documents USING GIN (file_name gin_trgm_ops);
CREATE INDEX idx_folders_name_trgm ON document_folders USING GIN (name gin_trgm_ops);

-- Date-range and owner filters: every list/search query already carries
-- tenant_id (tenant_isolation) and, per §3's RLS, usually a folder or
-- ownership predicate — so tenant_id leads both composite indexes, same
-- convention as every other table in this schema.
CREATE INDEX idx_documents_tenant_created ON documents (tenant_id, created_at DESC);
CREATE INDEX idx_documents_tenant_owner_created
    ON documents (tenant_id, uploaded_by_employee_id, created_at DESC);
```

### Query shape

```sql
SELECT d.*
FROM documents d
WHERE d.tenant_id = app.current_tenant_id()          -- tenant_isolation, always
  AND d.archived_at IS NULL                            -- default view excludes archived
  AND d.created_at >= now() - interval '1 year'        -- date-range filter
  AND (:owner_id IS NULL OR d.uploaded_by_employee_id = :owner_id)
  AND (:q IS NULL OR d.file_name % :q)                 -- trigram filename match
ORDER BY
  CASE WHEN :q IS NOT NULL THEN similarity(d.file_name, :q) END DESC NULLS LAST,
  d.created_at DESC
LIMIT 25 OFFSET :offset;
```

`staff_document_visibility` (§3) applies to this query exactly as it does to
the plain listing page — search is not a separate code path with its own
permission logic, it is the same `SELECT` with more `WHERE` clauses. That
matters beyond convenience: an external search index (Elasticsearch,
Algolia) would need to duplicate the sharing model and stay in sync with
every folder-permission change, or it silently leaks a document's existence
to someone the folder was never shared with — the "a protected value has
more than one home" failure class CLAUDE.md's disclosure lessons warn
about. Keeping search inside Postgres means there is only ever one place
permissions live.

**Confirms the three requested filters are covered by this design as-is:**

| Filter | Mechanism |
|---|---|
| File name | `file_name % :q` (trigram), ranked by `similarity()` |
| Date range, "last 1 year" | `created_at >= now() - interval '1 year'`, served by `idx_documents_tenant_created` |
| Owner | `uploaded_by_employee_id = :owner_id`, served by `idx_documents_tenant_owner_created` |

One UX default worth deciding explicitly rather than leaving implicit: a
**default 1-year window** (as above) keeps the common case fast and the
result list relevant, with an explicit "search all time" toggle for the
rarer case of finding something older — the same pattern most mailbox
search boxes use. This is a product default, not a technical limit — the
index supports any range equally well.

Results are paged 20–50 rows per the existing `SCALE_SENSITIVE` rule (this
table accumulates per upload, unbounded, same shape as tickets) — never
"fetch everything and filter in the template."

**What this does not cover, on purpose:** searching *inside* file content
(PDF/docx text bodies). That stays deferred — see §8.3.

---

## 8. Open decisions, flagged rather than defaulted

1. **Whether a `shared`-visibility folder's viewers can re-share it.**
   Default assumption in this spec: no — only the owner or an admin can add
   rows to `document_folder_shares`. Worth confirming before build; Drive's
   own default (any editor can share) is one toggle away if wanted, and is
   the kind of behavior-change that belongs in Tier 3 settings if it ever
   needs to vary per tenant.
2. **Per-tenant storage quota.** Not modeled here. `tenant_settings`
   (06-customization-model.md) is the right home for a `documents.max_gb`
   deviation-from-default value if this becomes a plan-tier feature later.
3. **Content search.** §7 covers file name, date range and owner — deliberately
   not full-text search *inside* file content. If that's genuinely needed
   later: extract text asynchronously via the existing `jobs` queue on
   upload (never on the request path — extraction is slow), write it to a
   separate `tsvector` column (English stemming earns its place here, unlike
   for filenames), and index that with GIN. Same "ship the simple thing,
   measure demand, then invest" reasoning docs/17 §4 uses for chat/Realtime —
   not a default to build speculatively.
