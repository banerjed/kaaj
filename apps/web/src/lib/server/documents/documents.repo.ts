import type { Tx } from "../db/tenant"

/**
 * Document management — folders, upload, sharing, archiving. See
 * docs/17-customer-portal.md §3 (the base `documents` table) and
 * docs/18-document-management.md (the folder tree this repository adds on
 * top). RLS (`staff_folder_visibility` / `staff_document_visibility`,
 * 20260922090000) is what actually separates what each caller can see — the
 * same principle ticketing.repo.ts uses.
 *
 * Moving a folder to a different parent is deliberately NOT built in this
 * slice: a parent is chosen once, at creation, and stays fixed. That sidesteps
 * cycle detection (a folder moved into its own descendant) for a feature
 * nothing has asked for yet — 18§6 already expects a shallow tree.
 */

export const FOLDER_VISIBILITIES = ["private", "shared", "company"] as const
export type FolderVisibility = (typeof FOLDER_VISIBILITIES)[number]

export const SHARE_PERMISSIONS = ["view", "edit"] as const
export type SharePermission = (typeof SHARE_PERMISSIONS)[number]

export const DOCUMENT_VISIBILITIES = [
  "internal",
  "client_visible",
  "public",
] as const
export type DocumentVisibility = (typeof DOCUMENT_VISIBILITIES)[number]

export class DocumentsRefused extends Error {
  constructor(
    readonly reason: "no_such_folder" | "no_such_document" | "bad_share_target",
    readonly detail?: string,
  ) {
    super(reason)
    this.name = "DocumentsRefused"
  }
}

export type FolderRow = {
  id: string
  name: string
  visibility: FolderVisibility
  owner_employee_id: string
  owner_name: string
  parent_folder_id: string | null
  path_ids: string[]
  entity_type: string | null
  entity_id: string | null
  archived_at: Date | null
  created_at: Date
  subfolder_count: number
  document_count: number
}

export type DocumentRow = {
  id: string
  file_name: string
  mime_type: string
  file_size_bytes: number
  visibility: DocumentVisibility
  folder_id: string | null
  uploaded_by_name: string | null
  customer_name: string | null
  archived_at: Date | null
  created_at: Date
}

/**
 * The actor's effective tier on one folder — owner/admin above it, `edit`
 * from a share, `view` from company visibility or a view-only share, or
 * `null` (cannot see it at all). RLS (staff_folder_visibility) already
 * answers existence/visibility; this is the finer edit-vs-view distinction
 * §2's table draws on top, the same split `can()`/RLS draw everywhere else.
 */
export type FolderPermission = "owner" | "admin" | "edit" | "view"

const TIER: Record<FolderPermission, number> = {
  view: 0,
  edit: 1,
  owner: 2,
  admin: 3,
}
export function atLeast(
  have: FolderPermission | null,
  need: FolderPermission,
): boolean {
  return have !== null && TIER[have] >= TIER[need]
}

export async function folderPermission(
  tx: Tx,
  folderId: string,
  ctx: { employeeId: string | null; role: string; functionalRoles: string[] },
): Promise<FolderPermission | null> {
  const f = await folder(tx, folderId)
  if (!f) return null
  if (ctx.role === "owner" || ctx.role === "firm_admin") return "admin"
  if (f.owner_employee_id === ctx.employeeId) return "owner"
  if (f.visibility === "company") return "view"
  if (f.visibility === "shared") {
    const rows = await tx<{ permission: SharePermission }[]>`
      SELECT permission FROM document_folder_shares
       WHERE folder_id = ${folderId}::uuid AND revoked_at IS NULL
         AND (shared_with_employee_id = ${ctx.employeeId}::uuid
              OR shared_with_role = ANY(${ctx.functionalRoles}::text[]))
    `
    if (rows.some((r) => r.permission === "edit")) return "edit"
    if (rows.length) return "view"
    return null
  }
  return null // private, not the owner
}

export type ShareRow = {
  id: string
  shared_with_employee_id: string | null
  shared_with_name: string | null
  shared_with_role: string | null
  permission: SharePermission
  granted_at: Date
}

const FOLDER_COLUMNS = `
  f.id, f.name, f.visibility, f.owner_employee_id,
  o.first_name || ' ' || o.last_name AS owner_name,
  f.parent_folder_id, f.path_ids, f.entity_type, f.entity_id, f.archived_at, f.created_at,
  (SELECT count(*)::int FROM document_folders c
    WHERE c.parent_folder_id = f.id AND c.archived_at IS NULL) AS subfolder_count,
  (SELECT count(*)::int FROM documents d
    WHERE d.folder_id = f.id AND d.archived_at IS NULL) AS document_count
`

/** Top-level folders (no parent) — the root view's folder cards. */
export async function topFolders(tx: Tx): Promise<FolderRow[]> {
  return tx<FolderRow[]>`
    SELECT ${tx.unsafe(FOLDER_COLUMNS)}
      FROM document_folders f
      JOIN employees o ON o.id = f.owner_employee_id
     WHERE f.parent_folder_id IS NULL AND f.archived_at IS NULL
     ORDER BY f.name
  `
}

/** Subfolders of one folder. */
export async function childFolders(
  tx: Tx,
  parentId: string,
): Promise<FolderRow[]> {
  return tx<FolderRow[]>`
    SELECT ${tx.unsafe(FOLDER_COLUMNS)}
      FROM document_folders f
      JOIN employees o ON o.id = f.owner_employee_id
     WHERE f.parent_folder_id = ${parentId}::uuid AND f.archived_at IS NULL
     ORDER BY f.name
  `
}

export async function folder(tx: Tx, id: string): Promise<FolderRow | null> {
  const [row] = await tx<FolderRow[]>`
    SELECT ${tx.unsafe(FOLDER_COLUMNS)}
      FROM document_folders f
      JOIN employees o ON o.id = f.owner_employee_id
     WHERE f.id = ${id}::uuid
  `
  return row ?? null
}

/** Root-to-here, for a breadcrumb. RLS narrows this the same as any other read — an ancestor the actor cannot see simply isn't in path_ids' visible subset, which never happens in practice since seeing a folder implies seeing its ancestors under this visibility model. */
export async function breadcrumb(
  tx: Tx,
  pathIds: string[],
  folderId: string,
): Promise<{ id: string; name: string }[]> {
  const ids = [...pathIds, folderId]
  const rows = await tx<{ id: string; name: string }[]>`
    SELECT id, name FROM document_folders WHERE id = ANY(${ids}::uuid[])
  `
  const byId = new Map(rows.map((r) => [r.id, r.name]))
  return ids
    .filter((id) => byId.has(id))
    .map((id) => ({ id, name: byId.get(id)! }))
}

const DOCUMENT_COLUMNS = `
  d.id, d.file_name, d.mime_type, d.file_size_bytes, d.visibility, d.folder_id,
  e.first_name || ' ' || e.last_name AS uploaded_by_name,
  cu.display_name AS customer_name,
  d.archived_at, d.created_at
`

const PAGE_SIZE = 25

/**
 * Every document for a SET of entities of one type, in one query — grouped
 * by entity id. The caller (a project page rendering a file list per task)
 * would otherwise query once per task, inside a loop over the task list.
 */
export async function forEntities(
  tx: Tx,
  entityType: string,
  entityIds: string[],
): Promise<Record<string, DocumentRow[]>> {
  if (entityIds.length === 0) return {}
  const rows = await tx<(DocumentRow & { entity_id: string })[]>`
    SELECT ${tx.unsafe(DOCUMENT_COLUMNS)}, d.entity_id
      FROM documents d
      LEFT JOIN employees e ON e.id = d.uploaded_by_employee_id
      LEFT JOIN customers cu ON cu.id = d.customer_id
     WHERE d.entity_type = ${entityType}
       AND d.entity_id = ANY(${entityIds}::uuid[])
       AND d.archived_at IS NULL
     ORDER BY d.created_at DESC
  `
  const out: Record<string, DocumentRow[]> = {}
  for (const { entity_id, ...doc } of rows) {
    ;(out[entity_id] ??= []).push(doc)
  }
  return out
}

/** Files inside one folder — the folder-detail page's file table. */
export async function documentsIn(
  tx: Tx,
  folderId: string,
  page = 1,
): Promise<{ documents: DocumentRow[]; total: number }> {
  const [documents, [{ n: total }]] = await Promise.all([
    tx<DocumentRow[]>`
      SELECT ${tx.unsafe(DOCUMENT_COLUMNS)}
        FROM documents d
        LEFT JOIN employees e ON e.id = d.uploaded_by_employee_id
        LEFT JOIN customers cu ON cu.id = d.customer_id
       WHERE d.folder_id = ${folderId}::uuid AND d.archived_at IS NULL
       ORDER BY d.created_at DESC
       LIMIT ${PAGE_SIZE} OFFSET ${(page - 1) * PAGE_SIZE}
    `,
    tx<{ n: number }[]>`
      SELECT count(*)::int AS n FROM documents
       WHERE folder_id = ${folderId}::uuid AND archived_at IS NULL
    `,
  ])
  return { documents, total }
}

export type DocumentSearchFilters = {
  q?: string
  ownerEmployeeId?: string
  sinceDays?: number
  page?: number
}

/** The global search (18§7): file name (trigram), date range, owner. */
export async function searchDocuments(
  tx: Tx,
  filters: DocumentSearchFilters,
): Promise<{ documents: DocumentRow[]; total: number }> {
  const q = filters.q?.trim() || null
  const ownerId = filters.ownerEmployeeId || null
  const sinceDays = filters.sinceDays ?? 365
  const page = filters.page ?? 1

  const [documents, [{ n: total }]] = await Promise.all([
    tx<DocumentRow[]>`
      SELECT ${tx.unsafe(DOCUMENT_COLUMNS)}
        FROM documents d
        LEFT JOIN employees e ON e.id = d.uploaded_by_employee_id
        LEFT JOIN customers cu ON cu.id = d.customer_id
       WHERE d.archived_at IS NULL
         AND d.created_at >= now() - (${sinceDays}::text || ' days')::interval
         AND (${ownerId}::uuid IS NULL OR d.uploaded_by_employee_id = ${ownerId}::uuid)
         AND (${q}::text IS NULL OR d.file_name % ${q}::text)
       ORDER BY
         CASE WHEN ${q}::text IS NOT NULL THEN similarity(d.file_name, ${q}::text) END DESC NULLS LAST,
         d.created_at DESC
       LIMIT ${PAGE_SIZE} OFFSET ${(page - 1) * PAGE_SIZE}
    `,
    tx<{ n: number }[]>`
      SELECT count(*)::int AS n FROM documents d
       WHERE d.archived_at IS NULL
         AND d.created_at >= now() - (${sinceDays}::text || ' days')::interval
         AND (${ownerId}::uuid IS NULL OR d.uploaded_by_employee_id = ${ownerId}::uuid)
         AND (${q}::text IS NULL OR d.file_name % ${q}::text)
    `,
  ])
  return { documents, total }
}

export async function archivedFolders(tx: Tx): Promise<FolderRow[]> {
  return tx<FolderRow[]>`
    SELECT ${tx.unsafe(FOLDER_COLUMNS)}
      FROM document_folders f
      JOIN employees o ON o.id = f.owner_employee_id
     WHERE f.archived_at IS NOT NULL
     ORDER BY f.archived_at DESC
  `
}

export async function archivedDocuments(tx: Tx): Promise<DocumentRow[]> {
  return tx<DocumentRow[]>`
    SELECT ${tx.unsafe(DOCUMENT_COLUMNS)}
      FROM documents d
      LEFT JOIN employees e ON e.id = d.uploaded_by_employee_id
      LEFT JOIN customers cu ON cu.id = d.customer_id
     WHERE d.archived_at IS NOT NULL
     ORDER BY d.archived_at DESC
  `
}

/** The employee's own private root folder, created on first use — 18§3's fallback for an upload with nothing chosen. */
export async function defaultFolderFor(
  tx: Tx,
  employeeId: string,
  tenantId: string,
): Promise<string> {
  const [existing] = await tx<{ id: string }[]>`
    SELECT id FROM document_folders
     WHERE owner_employee_id = ${employeeId}::uuid
       AND parent_folder_id IS NULL
       AND name = 'My Files'
       AND archived_at IS NULL
     LIMIT 1
  `
  if (existing) return existing.id

  const [created] = await tx<{ id: string }[]>`
    INSERT INTO document_folders (tenant_id, owner_employee_id, name, visibility)
    VALUES (${tenantId}::uuid, ${employeeId}::uuid, 'My Files', 'private')
    RETURNING id
  `
  return created.id
}

/**
 * The one folder for an entity (docs/25-project-management-phase2.md's task
 * files), created lazily on first upload — same shape as `defaultFolderFor`,
 * generalised to a polymorphic owner instead of one hardcoded "My Files" per
 * employee. `visibility: 'company'` — the entity's own trust boundary
 * (`projects.write` for a task) already gates who may call this, and
 * `staff_document_visibility`'s RLS only makes a folder-less document visible
 * to `owner`/`firm_admin`, so an entity-rooted upload MUST go through a real
 * folder to be visible to anyone else at all.
 */
export async function defaultFolderForEntity(
  tx: Tx,
  params: {
    tenantId: string
    entityType: string
    entityId: string
    name: string
    ownerEmployeeId: string
  },
): Promise<string> {
  const existing = await folderForEntity(tx, params.entityType, params.entityId)
  if (existing) return existing

  return createFolder(tx, {
    tenantId: params.tenantId,
    ownerEmployeeId: params.ownerEmployeeId,
    name: params.name,
    visibility: "company",
    parentFolderId: null,
    entityType: params.entityType,
    entityId: params.entityId,
  })
}

/** Read-only lookup, for a load() that must not create a folder just to render an empty list. */
export async function folderForEntity(
  tx: Tx,
  entityType: string,
  entityId: string,
): Promise<string | null> {
  const [row] = await tx<{ id: string }[]>`
    SELECT id FROM document_folders
     WHERE entity_type = ${entityType} AND entity_id = ${entityId}::uuid
       AND archived_at IS NULL
     LIMIT 1
  `
  return row?.id ?? null
}

export async function createFolder(
  tx: Tx,
  params: {
    tenantId: string
    ownerEmployeeId: string
    name: string
    visibility: FolderVisibility
    parentFolderId: string | null
    entityType?: string | null
    entityId?: string | null
  },
): Promise<string> {
  let pathIds: string[] = []
  if (params.parentFolderId) {
    const parent = await folder(tx, params.parentFolderId)
    if (!parent) throw new DocumentsRefused("no_such_folder")
    pathIds = [...parent.path_ids, params.parentFolderId]
  }

  const [row] = await tx<{ id: string }[]>`
    INSERT INTO document_folders (
      tenant_id, parent_folder_id, path_ids, name, owner_employee_id,
      visibility, entity_type, entity_id
    ) VALUES (
      ${params.tenantId}::uuid, ${params.parentFolderId}::uuid, ${pathIds}::uuid[],
      ${params.name}, ${params.ownerEmployeeId}::uuid,
      ${params.visibility}, ${params.entityType ?? null}, ${params.entityId ?? null}::uuid
    )
    RETURNING id
  `
  return row.id
}

export async function renameFolder(
  tx: Tx,
  id: string,
  name: string,
): Promise<void> {
  const [row] = await tx<{ id: string }[]>`
    UPDATE document_folders SET name = ${name}, updated_at = now()
     WHERE id = ${id}::uuid
    RETURNING id
  `
  if (!row) throw new DocumentsRefused("no_such_folder")
}

/** Returns the OLD visibility, for the caller's audit diff — visibility is a rights change (18§2), never silent. */
export async function setFolderVisibility(
  tx: Tx,
  id: string,
  visibility: FolderVisibility,
): Promise<{ before: FolderVisibility }> {
  const [before] = await tx<{ visibility: FolderVisibility }[]>`
    SELECT visibility FROM document_folders WHERE id = ${id}::uuid
  `
  if (!before) throw new DocumentsRefused("no_such_folder")
  await tx`
    UPDATE document_folders SET visibility = ${visibility}, updated_at = now()
     WHERE id = ${id}::uuid
  `
  return { before: before.visibility }
}

export async function archiveFolder(tx: Tx, id: string): Promise<void> {
  const [row] = await tx<{ id: string }[]>`
    UPDATE document_folders SET archived_at = now(), updated_at = now()
     WHERE id = ${id}::uuid AND archived_at IS NULL
    RETURNING id
  `
  if (!row) throw new DocumentsRefused("no_such_folder")
}

export async function restoreFolder(tx: Tx, id: string): Promise<void> {
  const [row] = await tx<{ id: string }[]>`
    UPDATE document_folders SET archived_at = NULL, updated_at = now()
     WHERE id = ${id}::uuid AND archived_at IS NOT NULL
    RETURNING id
  `
  if (!row) throw new DocumentsRefused("no_such_folder")
}

export async function shares(tx: Tx, folderId: string): Promise<ShareRow[]> {
  return tx<ShareRow[]>`
    SELECT s.id, s.shared_with_employee_id,
           e.first_name || ' ' || e.last_name AS shared_with_name,
           s.shared_with_role, s.permission, s.granted_at
      FROM document_folder_shares s
      LEFT JOIN employees e ON e.id = s.shared_with_employee_id
     WHERE s.folder_id = ${folderId}::uuid AND s.revoked_at IS NULL
     ORDER BY s.granted_at
  `
}

/**
 * Share with a person XOR a role — reactivates a previously-revoked grant
 * to the same target rather than inserting a second row, which is what keeps
 * document_folder_shares_unique_share meaningful (18§1's own schema has no
 * partial-index escape hatch for a revoked-then-regranted share).
 */
export async function shareFolder(
  tx: Tx,
  params: {
    tenantId: string
    folderId: string
    targetEmployeeId: string | null
    targetRole: string | null
    permission: SharePermission
    grantedBy: string
  },
): Promise<void> {
  if ((params.targetEmployeeId === null) === (params.targetRole === null)) {
    throw new DocumentsRefused("bad_share_target")
  }

  const [existing] = await tx<{ id: string }[]>`
    SELECT id FROM document_folder_shares
     WHERE folder_id = ${params.folderId}::uuid
       AND shared_with_employee_id IS NOT DISTINCT FROM ${params.targetEmployeeId}::uuid
       AND shared_with_role IS NOT DISTINCT FROM ${params.targetRole}
  `
  if (existing) {
    await tx`
      UPDATE document_folder_shares
         SET permission = ${params.permission}, granted_by = ${params.grantedBy}::uuid,
             granted_at = now(), revoked_at = NULL
       WHERE id = ${existing.id}::uuid
    `
    return
  }

  await tx`
    INSERT INTO document_folder_shares (
      tenant_id, folder_id, shared_with_employee_id, shared_with_role,
      permission, granted_by
    ) VALUES (
      ${params.tenantId}::uuid, ${params.folderId}::uuid,
      ${params.targetEmployeeId}::uuid, ${params.targetRole},
      ${params.permission}, ${params.grantedBy}::uuid
    )
  `
}

export async function unshareFolder(tx: Tx, shareId: string): Promise<void> {
  const [row] = await tx<{ id: string }[]>`
    UPDATE document_folder_shares SET revoked_at = now()
     WHERE id = ${shareId}::uuid AND revoked_at IS NULL
    RETURNING id
  `
  if (!row) throw new DocumentsRefused("no_such_document")
}

export async function uploadDocument(
  tx: Tx,
  params: {
    /** Generated by the caller BEFORE this call — it's embedded in the storage key, so the object must already exist in Storage by the time this row is written. */
    id: string
    tenantId: string
    folderId: string
    fileName: string
    storageKey: string
    mimeType: string
    fileSizeBytes: number
    visibility: DocumentVisibility
    uploadedByEmployeeId: string
    entityType?: string | null
    entityId?: string | null
    customerId?: string | null
  },
): Promise<string> {
  const [row] = await tx<{ id: string }[]>`
    INSERT INTO documents (
      id, tenant_id, folder_id, entity_type, entity_id, customer_id,
      file_name, storage_key, mime_type, file_size_bytes, visibility,
      uploaded_by_employee_id
    ) VALUES (
      ${params.id}::uuid, ${params.tenantId}::uuid, ${params.folderId}::uuid,
      ${params.entityType ?? null}, ${params.entityId ?? null}::uuid, ${params.customerId ?? null}::uuid,
      ${params.fileName}, ${params.storageKey}, ${params.mimeType}, ${params.fileSizeBytes},
      ${params.visibility}, ${params.uploadedByEmployeeId}::uuid
    )
    RETURNING id
  `
  return row.id
}

export type DownloadableDocument = {
  storage_key: string
  file_name: string
  mime_type: string
}

/** Row-visibility-gated lookup for the download proxy — 0 rows means "cannot see it," never a storage key handed out on trust (18§5). */
export async function forDownload(
  tx: Tx,
  id: string,
): Promise<DownloadableDocument | null> {
  const [row] = await tx<DownloadableDocument[]>`
    SELECT storage_key, file_name, mime_type FROM documents WHERE id = ${id}::uuid
  `
  return row ?? null
}

export async function archiveDocument(tx: Tx, id: string): Promise<void> {
  const [row] = await tx<{ id: string }[]>`
    UPDATE documents SET archived_at = now(), updated_at = now()
     WHERE id = ${id}::uuid AND archived_at IS NULL
    RETURNING id
  `
  if (!row) throw new DocumentsRefused("no_such_document")
}

export async function restoreDocument(tx: Tx, id: string): Promise<void> {
  const [row] = await tx<{ id: string }[]>`
    UPDATE documents SET archived_at = NULL, updated_at = now()
     WHERE id = ${id}::uuid AND archived_at IS NOT NULL
    RETURNING id
  `
  if (!row) throw new DocumentsRefused("no_such_document")
}
