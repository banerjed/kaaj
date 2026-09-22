import { error, fail } from "@sveltejs/kit"
import type { Actions, PageServerLoad } from "./$types"
import * as documents from "$lib/server/documents/documents.repo"
import { DocumentsRefused, atLeast } from "$lib/server/documents/documents.repo"
import { withTenant, actorFrom } from "$lib/server/db/tenant"
import { contextFrom, requireCan } from "$lib/server/auth/can"
import { FormReader } from "$lib/server/forms"

/** /documents/archived — 18§4: same visibility filtering as the main view, just archived_at IS NOT NULL instead of NULL. */
export const load: PageServerLoad = async ({ locals }) => {
  if (!locals.tenantId) error(403, "No tenant")
  const ctx = contextFrom(locals)
  requireCan(ctx, "document.read")

  return withTenant(actorFrom(locals), async (tx) => {
    const [folders, docs] = await Promise.all([
      documents.archivedFolders(tx),
      documents.archivedDocuments(tx),
    ])
    return { folders, documents: docs }
  })
}

export const actions: Actions = {
  restoreFolder: async ({ request, locals }) => {
    if (!locals.tenantId) error(403, "No tenant")
    const ctx = contextFrom(locals)
    requireCan(ctx, "document.write")

    const data = await request.formData()
    const f = new FormReader(data)
    const folderId = f.uuid("folder_id", { required: true })
    if (!f.ok) return fail(400, f.problem())

    try {
      await withTenant(actorFrom(locals), async (tx) => {
        const permission = await documents.folderPermission(tx, folderId, ctx!)
        if (!atLeast(permission, "edit"))
          error(403, "You do not have access to do that.")
        await documents.restoreFolder(tx, folderId)
      })
    } catch (e) {
      if (e instanceof DocumentsRefused) {
        return fail(400, {
          errorFields: [],
          message: "That folder is not archived.",
        })
      }
      throw e
    }
    return { saved: true }
  },

  restoreDocument: async ({ request, locals }) => {
    if (!locals.tenantId) error(403, "No tenant")
    const ctx = contextFrom(locals)
    requireCan(ctx, "document.write")

    const data = await request.formData()
    const f = new FormReader(data)
    const documentId = f.uuid("document_id", { required: true })
    const folderId = f.uuid("folder_id", { required: true })
    if (!f.ok) return fail(400, f.problem())

    try {
      await withTenant(actorFrom(locals), async (tx) => {
        const permission = await documents.folderPermission(tx, folderId, ctx!)
        if (!atLeast(permission, "edit"))
          error(403, "You do not have access to do that.")
        await documents.restoreDocument(tx, documentId)
      })
    } catch (e) {
      if (e instanceof DocumentsRefused) {
        return fail(400, {
          errorFields: [],
          message: "That file is not archived.",
        })
      }
      throw e
    }
    return { saved: true }
  },
}
