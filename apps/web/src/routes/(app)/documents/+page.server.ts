import { error, fail } from "@sveltejs/kit"
import type { Actions, PageServerLoad } from "./$types"
import * as documents from "$lib/server/documents/documents.repo"
import {
  DocumentsRefused,
  FOLDER_VISIBILITIES,
} from "$lib/server/documents/documents.repo"
import {
  employeeLabels,
  pickerQuery,
  searchEmployees,
  searchTopFolders,
} from "$lib/server/pickers"
import { withTenant, actorFrom } from "$lib/server/db/tenant"
import { contextFrom, requireCan } from "$lib/server/auth/can"
import { FormReader } from "$lib/server/forms"
import { constraintFailure } from "$lib/server/db/constraints"
import { uploadDocument, UploadRefused } from "$lib/server/documents/upload"

/** Four rows of the card grid at its widest. */
const FOLDER_PAGE_SIZE = 24

/** /documents — root: top-level folder cards, plus the global search table (18§7). */
export const load: PageServerLoad = async ({ locals, url }) => {
  if (!locals.tenantId) error(403, "No tenant")
  const ctx = contextFrom(locals)
  requireCan(ctx, "document.read")

  const q = url.searchParams.get("q") || undefined
  const ownerId = url.searchParams.get("owner") || undefined
  const page = Math.max(1, Number(url.searchParams.get("page")) || 1)
  const folderPage = Math.max(1, Number(url.searchParams.get("fpage")) || 1)
  const hasFilters = Boolean(q || ownerId)

  return withTenant(actorFrom(locals), async (tx) => {
    const [folders, owners, results] = await Promise.all([
      documents.topFolders(tx, {
        limit: FOLDER_PAGE_SIZE,
        offset: (folderPage - 1) * FOLDER_PAGE_SIZE,
      }),
      employeeLabels(tx, [ownerId]),
      hasFilters
        ? documents.searchDocuments(tx, { q, ownerEmployeeId: ownerId, page })
        : Promise.resolve({ documents: [], total: 0 }),
    ])
    return {
      folders: folders.rows,
      folderTotal: folders.total,
      folderPage,
      folderPageSize: FOLDER_PAGE_SIZE,
      selectedOwner: ownerId ? (owners[ownerId] ?? null) : null,
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
  /** Backs the search's owner filter. */
  searchPeople: async ({ request, locals }) => {
    if (!locals.tenantId) error(403, "No tenant")
    requireCan(contextFrom(locals), "document.read")
    const q = pickerQuery(new FormReader(await request.formData()))
    return withTenant(actorFrom(locals), async (tx) => ({
      results: await searchEmployees(tx, q),
    }))
  },

  /** Backs the upload form's folder picker. */
  searchFolders: async ({ request, locals }) => {
    if (!locals.tenantId) error(403, "No tenant")
    requireCan(contextFrom(locals), "document.read")
    const q = pickerQuery(new FormReader(await request.formData()))
    return withTenant(actorFrom(locals), async (tx) => ({
      results: await searchTopFolders(tx, q),
    }))
  },

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
