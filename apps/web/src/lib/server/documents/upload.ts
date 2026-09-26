import type { AuthContext } from "../auth/can"
import { withTenant, actorFrom } from "../db/tenant"
import * as documents from "./documents.repo"
import { DocumentsRefused, atLeast } from "./documents.repo"

/** Thrown for anything the calling action should show as a field error, never an error page. */
export class UploadRefused extends Error {
  constructor(
    readonly field: string,
    message: string,
  ) {
    super(message)
    this.name = "UploadRefused"
  }
}

/**
 * Shared by the root page's and the folder-detail page's `upload` action —
 * one path for "validate, place in Storage, record the row" so the two
 * routes can't drift on the checks that matter.
 *
 * 18§1's `documents.max_gb`/allow-list is a deferred Tier-3 tenant_settings
 * default (18§8.2) — MAX_BYTES here is a fixed placeholder for that, not a
 * per-tenant value yet.
 */
const MAX_BYTES = 25 * 1024 * 1024

function validatedFile(data: FormData): File {
  const file = data.get("file")
  if (!(file instanceof File) || file.size === 0) {
    throw new UploadRefused("file", "Choose a file to upload.")
  }
  if (file.size > MAX_BYTES) {
    throw new UploadRefused("file", "That file is larger than 25MB.")
  }
  return file
}

/**
 * Bytes into the `documents` bucket, keyed the same way regardless of caller
 * — `{tenant_id}/{entityType}/{entityId}/{documentId}-{fileName}` (18§5).
 * Does not touch the `documents` table; the caller inserts the row in its own
 * transaction, with whatever entity/visibility/permission model fits it.
 */
async function putFileInStorage(
  locals: App.Locals,
  tenantId: string,
  entityType: string | null,
  entityId: string | null,
  file: File,
): Promise<{ documentId: string; storageKey: string }> {
  const documentId = crypto.randomUUID()
  const safeName = file.name.replace(/[^\w.\- ]/g, "_").slice(0, 200)
  const storageKey = entityType
    ? `${tenantId}/${entityType}/${entityId}/${documentId}-${safeName}`
    : `${tenantId}/general/${documentId}-${safeName}`

  const bytes = new Uint8Array(await file.arrayBuffer())
  const { error: uploadError } = await locals.supabase.storage
    .from("documents")
    .upload(storageKey, bytes, {
      contentType: file.type || "application/octet-stream",
    })
  if (uploadError) {
    throw new UploadRefused("file", "Could not upload the file. Try again.")
  }
  return { documentId, storageKey }
}

export async function uploadDocument(
  locals: App.Locals,
  ctx: AuthContext,
  data: FormData,
  requestedFolderId: string | null,
): Promise<string> {
  const file = validatedFile(data)

  // Resolve the destination folder and confirm the actor may write to it
  // BEFORE anything reaches Storage — a folder that doesn't exist, or isn't
  // visible, must refuse here, not after bytes are already sitting in the
  // bucket for a folder_id the insert then fails to reach.
  const { folderId, entityType, entityId } = await withTenant(
    actorFrom(locals),
    async (tx) => {
      const id =
        requestedFolderId ??
        (await documents.defaultFolderFor(tx, ctx.employeeId!, ctx.tenantId))
      const permission = await documents.folderPermission(tx, id, ctx)
      if (!atLeast(permission, "edit")) {
        throw new DocumentsRefused("no_such_folder")
      }
      const f = await documents.folder(tx, id)
      return {
        folderId: id,
        entityType: f!.entity_type,
        entityId: f!.entity_id,
      }
    },
  )

  const { documentId, storageKey } = await putFileInStorage(
    locals,
    ctx.tenantId,
    entityType,
    entityId,
    file,
  )

  return withTenant(actorFrom(locals), async (tx) => {
    return documents.uploadDocument(tx, {
      id: documentId,
      tenantId: ctx.tenantId,
      folderId,
      fileName: file.name.slice(0, 255),
      storageKey,
      mimeType: file.type || "application/octet-stream",
      fileSizeBytes: file.size,
      visibility: "internal",
      uploadedByEmployeeId: ctx.employeeId!,
      entityType,
      entityId,
    })
  })
}

/**
 * A task's own file upload (docs/25-project-management-phase2.md) — deliberately
 * NOT routed through `folderPermission`/`atLeast` above: a task's folder is
 * `company`-visibility (every employee may see the board, same as the task
 * itself), and `folderPermission` only grants that visibility "view", not
 * "edit" — company folders are read-only to everyone but their creator and
 * admins under the generic documents model. A task's write boundary is
 * `projects.write`, already checked by the caller (the same action that
 * calls every other task write); this bypasses the folder-ownership gate on
 * purpose rather than widening it for every OTHER document feature too.
 */
export async function uploadTaskFile(
  locals: App.Locals,
  tenantId: string,
  taskId: string,
  taskName: string,
  employeeId: string,
  data: FormData,
): Promise<string> {
  const file = validatedFile(data)

  const folderId = await withTenant(actorFrom(locals), async (tx) => {
    return documents.defaultFolderForEntity(tx, {
      tenantId,
      entityType: "task",
      entityId: taskId,
      name: taskName,
      ownerEmployeeId: employeeId,
    })
  })

  const { documentId, storageKey } = await putFileInStorage(
    locals,
    tenantId,
    "task",
    taskId,
    file,
  )

  return withTenant(actorFrom(locals), async (tx) => {
    return documents.uploadDocument(tx, {
      id: documentId,
      tenantId,
      folderId,
      fileName: file.name.slice(0, 255),
      storageKey,
      mimeType: file.type || "application/octet-stream",
      fileSizeBytes: file.size,
      visibility: "internal",
      uploadedByEmployeeId: employeeId,
      entityType: "task",
      entityId: taskId,
    })
  })
}
