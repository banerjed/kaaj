import { error, fail } from "@sveltejs/kit"
import type { Actions, PageServerLoad } from "./$types"
import * as documents from "$lib/server/documents/documents.repo"
import {
  DocumentsRefused,
  FOLDER_VISIBILITIES,
} from "$lib/server/documents/documents.repo"
import * as employees from "$lib/server/employee-profile/employees.repo"
import { withTenant, actorFrom } from "$lib/server/db/tenant"
import { contextFrom, requireCan } from "$lib/server/auth/can"
import { FormReader } from "$lib/server/forms"
import { constraintFailure } from "$lib/server/db/constraints"
import { uploadDocument, UploadRefused } from "$lib/server/documents/upload"

/** /documents — root: top-level folder cards, plus the global search table (18§7). */
export const load: PageServerLoad = async ({ locals, url }) => {
  if (!locals.tenantId) error(403, "No tenant")
  const ctx = contextFrom(locals)
  requireCan(ctx, "document.read")

  const q = url.searchParams.get("q") || undefined
  const ownerId = url.searchParams.get("owner") || undefined
  const page = Math.max(1, Number(url.searchParams.get("page")) || 1)
  const hasFilters = Boolean(q || ownerId)

  return withTenant(actorFrom(locals), async (tx) => {
    const [folders, people, results] = await Promise.all([
      documents.topFolders(tx),
      employees.managerOptions(tx),
      hasFilters
        ? documents.searchDocuments(tx, { q, ownerEmployeeId: ownerId, page })
        : Promise.resolve({ documents: [], total: 0 }),
    ])
    return {
      folders,
      people,
      results: results.documents,
      total: results.total,
      page,
      hasFilters,
      filters: { q: q ?? "", owner: ownerId ?? "" },
      visibilities: FOLDER_VISIBILITIES,
    }
  })
}

export const actions: Actions = {
  createFolder: async ({ request, locals }) => {
    if (!locals.tenantId) error(403, "No tenant")
    const ctx = contextFrom(locals)
    requireCan(ctx, "document.write")

    const data = await request.formData()
    const f = new FormReader(data)
    const name = f.text("name", { required: true, max: 255 })
    const visibility = f.choice("visibility", FOLDER_VISIBILITIES, {
      fallback: "private",
    })
    if (!f.ok) return fail(400, f.problem())

    await withTenant(actorFrom(locals), async (tx) => {
      await documents.createFolder(tx, {
        tenantId: ctx!.tenantId,
        ownerEmployeeId: ctx!.employeeId!,
        name,
        visibility,
        parentFolderId: null,
      })
    })
    return { saved: true }
  },

  upload: async ({ request, locals }) => {
    if (!locals.tenantId) error(403, "No tenant")
    const ctx = contextFrom(locals)
    requireCan(ctx, "document.write")

    const data = await request.formData()
    const folderId = String(data.get("folder_id") ?? "") || null

    try {
      const id = await uploadDocument(locals, ctx!, data, folderId)
      return { saved: true, id }
    } catch (e) {
      if (e instanceof UploadRefused) {
        return fail(400, { errorFields: [e.field], message: e.message })
      }
      if (e instanceof DocumentsRefused) {
        return fail(400, {
          errorFields: ["folder_id"],
          message:
            "That folder no longer exists, or you don't have access to it.",
        })
      }
      const refused = constraintFailure(e)
      if (refused) return refused
      throw e
    }
  },
}
