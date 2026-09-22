import { error, fail } from "@sveltejs/kit"
import type { Actions, PageServerLoad } from "./$types"
import * as documents from "$lib/server/documents/documents.repo"
import {
  DocumentsRefused,
  FOLDER_VISIBILITIES,
  SHARE_PERMISSIONS,
  atLeast,
} from "$lib/server/documents/documents.repo"
import * as employees from "$lib/server/employee-profile/employees.repo"
import { FUNCTIONAL_ROLES } from "@kaaj/authz"
import { withTenant, actorFrom, type Tx } from "$lib/server/db/tenant"
import { contextFrom, requireCan, type AuthContext } from "$lib/server/auth/can"
import { FormReader } from "$lib/server/forms"
import { constraintFailure } from "$lib/server/db/constraints"
import { uploadDocument, UploadRefused } from "$lib/server/documents/upload"
import * as audit from "$lib/server/audit/audit.repo"

/** /documents/[folderId] — one folder: breadcrumb, subfolders, its files, and (owner/admin) the share panel. */
export const load: PageServerLoad = async ({ locals, params, url }) => {
  if (!locals.tenantId) error(403, "No tenant")
  const ctx = contextFrom(locals)
  requireCan(ctx, "document.read")

  const page = Math.max(1, Number(url.searchParams.get("page")) || 1)

  return withTenant(actorFrom(locals), async (tx) => {
    const folder = await documents.folder(tx, params.folderId)
    if (!folder) error(404, "Folder not found")

    const permission = await documents.folderPermission(tx, folder.id, ctx!)
    if (!permission) error(403, "You cannot see this folder.")

    const [breadcrumb, subfolders, filesPage, shareRows] = await Promise.all([
      documents.breadcrumb(tx, folder.path_ids, folder.id),
      documents.childFolders(tx, folder.id),
      documents.documentsIn(tx, folder.id, page),
      atLeast(permission, "owner")
        ? documents.shares(tx, folder.id)
        : Promise.resolve([]),
    ])

    return {
      folder,
      breadcrumb,
      subfolders,
      files: filesPage.documents,
      total: filesPage.total,
      page,
      permission,
      canEdit: atLeast(permission, "edit"),
      canManage: atLeast(permission, "owner"),
      shares: shareRows,
      people: atLeast(permission, "owner")
        ? await employees.managerOptions(tx)
        : [],
      functionalRoles: FUNCTIONAL_ROLES,
      visibilities: FOLDER_VISIBILITIES,
      sharePermissions: SHARE_PERMISSIONS,
    }
  })
}

/** Refuses with a 403 unless the actor's tier on this folder meets `need`. */
async function requireFolderPermission(
  tx: Tx,
  folderId: string,
  ctx: AuthContext,
  need: Parameters<typeof atLeast>[1],
) {
  const permission = await documents.folderPermission(tx, folderId, ctx)
  if (!atLeast(permission, need)) {
    error(403, "You do not have access to do that.")
  }
}

export const actions: Actions = {
  createFolder: async ({ request, locals, params }) => {
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
      await requireFolderPermission(tx, params.folderId, ctx!, "edit")
      await documents.createFolder(tx, {
        tenantId: ctx!.tenantId,
        ownerEmployeeId: ctx!.employeeId!,
        name,
        visibility,
        parentFolderId: params.folderId,
      })
    })
    return { saved: true }
  },

  upload: async ({ request, locals, params }) => {
    if (!locals.tenantId) error(403, "No tenant")
    const ctx = contextFrom(locals)
    requireCan(ctx, "document.write")

    const data = await request.formData()
    try {
      const id = await uploadDocument(locals, ctx!, data, params.folderId)
      return { saved: true, id }
    } catch (e) {
      if (e instanceof UploadRefused) {
        return fail(400, { errorFields: [e.field], message: e.message })
      }
      if (e instanceof DocumentsRefused) {
        return fail(403, {
          errorFields: [],
          message: "You do not have access to upload here.",
        })
      }
      const refused = constraintFailure(e)
      if (refused) return refused
      throw e
    }
  },

  rename: async ({ request, locals, params }) => {
    if (!locals.tenantId) error(403, "No tenant")
    const ctx = contextFrom(locals)
    requireCan(ctx, "document.write")

    const data = await request.formData()
    const f = new FormReader(data)
    const name = f.text("name", { required: true, max: 255 })
    if (!f.ok) return fail(400, f.problem())

    try {
      await withTenant(actorFrom(locals), async (tx) => {
        await requireFolderPermission(tx, params.folderId, ctx!, "edit")
        await documents.renameFolder(tx, params.folderId, name)
      })
    } catch (e) {
      if (e instanceof DocumentsRefused) {
        return fail(400, {
          errorFields: [],
          message: "That folder no longer exists.",
        })
      }
      throw e
    }
    return { saved: true }
  },

  setVisibility: async ({ request, locals, params }) => {
    if (!locals.tenantId) error(403, "No tenant")
    const ctx = contextFrom(locals)
    requireCan(ctx, "document.write")

    const data = await request.formData()
    const f = new FormReader(data)
    const visibility = f.choice("visibility", FOLDER_VISIBILITIES, {
      required: true,
    })
    if (!f.ok) return fail(400, f.problem())

    try {
      await withTenant(actorFrom(locals), async (tx) => {
        await requireFolderPermission(tx, params.folderId, ctx!, "owner")
        const { before } = await documents.setFolderVisibility(
          tx,
          params.folderId,
          visibility,
        )
        if (before !== visibility) {
          await audit.record(tx, ctx!, {
            action: "role_grant",
            entityType: "document_folders",
            entityId: params.folderId,
            changes: audit.diff({ visibility: before }, { visibility }, [
              "visibility",
            ]),
            reason:
              "Folder visibility changed — governs who can read everything under it.",
          })
        }
      })
    } catch (e) {
      if (e instanceof DocumentsRefused) {
        return fail(400, {
          errorFields: [],
          message: "That folder no longer exists.",
        })
      }
      throw e
    }
    return { saved: true }
  },

  archive: async ({ locals, params }) => {
    if (!locals.tenantId) error(403, "No tenant")
    const ctx = contextFrom(locals)
    requireCan(ctx, "document.write")

    try {
      await withTenant(actorFrom(locals), async (tx) => {
        await requireFolderPermission(tx, params.folderId, ctx!, "edit")
        await documents.archiveFolder(tx, params.folderId)
      })
    } catch (e) {
      if (e instanceof DocumentsRefused) {
        return fail(400, {
          errorFields: [],
          message: "That folder is already archived.",
        })
      }
      throw e
    }
    return { saved: true }
  },

  share: async ({ request, locals, params }) => {
    if (!locals.tenantId) error(403, "No tenant")
    const ctx = contextFrom(locals)
    requireCan(ctx, "document.write")

    const data = await request.formData()
    const f = new FormReader(data)
    const targetType = f.choice("target_type", ["employee", "role"] as const, {
      required: true,
    })
    const employeeId = f.uuid("target_employee_id")
    const role = f.choice("target_role", FUNCTIONAL_ROLES)
    const permission = f.choice("permission", SHARE_PERMISSIONS, {
      required: true,
    })
    if (targetType === "employee" && !employeeId) f.reject("target_employee_id")
    if (targetType === "role" && !role) f.reject("target_role")
    if (!f.ok) return fail(400, f.problem())

    try {
      await withTenant(actorFrom(locals), async (tx) => {
        await requireFolderPermission(tx, params.folderId, ctx!, "owner")
        await documents.shareFolder(tx, {
          tenantId: ctx!.tenantId,
          folderId: params.folderId,
          targetEmployeeId: targetType === "employee" ? employeeId : null,
          targetRole: targetType === "role" ? role : null,
          permission,
          grantedBy: ctx!.employeeId!,
        })
        await audit.record(tx, ctx!, {
          action: "role_grant",
          entityType: "document_folders",
          entityId: params.folderId,
          changes: {
            shared_with: {
              from: null,
              to: targetType === "employee" ? employeeId : `role:${role}`,
            },
            permission: { from: null, to: permission },
          },
        })
      })
    } catch (e) {
      if (e instanceof DocumentsRefused) {
        return fail(400, {
          errorFields: ["target_employee_id"],
          message: "Share with either a person or a role, not both.",
        })
      }
      const refused = constraintFailure(e)
      if (refused) return refused
      throw e
    }
    return { saved: true }
  },

  unshare: async ({ request, locals, params }) => {
    if (!locals.tenantId) error(403, "No tenant")
    const ctx = contextFrom(locals)
    requireCan(ctx, "document.write")

    const data = await request.formData()
    const f = new FormReader(data)
    const shareId = f.uuid("share_id", { required: true })
    if (!f.ok) return fail(400, f.problem())

    try {
      await withTenant(actorFrom(locals), async (tx) => {
        await requireFolderPermission(tx, params.folderId, ctx!, "owner")
        await documents.unshareFolder(tx, shareId)
        await audit.record(tx, ctx!, {
          action: "role_revoke",
          entityType: "document_folders",
          entityId: params.folderId,
          changes: { shared_with: { from: shareId, to: null } },
        })
      })
    } catch (e) {
      if (e instanceof DocumentsRefused) {
        return fail(400, {
          errorFields: [],
          message: "That share no longer exists.",
        })
      }
      throw e
    }
    return { saved: true }
  },

  archiveDocument: async ({ request, locals, params }) => {
    if (!locals.tenantId) error(403, "No tenant")
    const ctx = contextFrom(locals)
    requireCan(ctx, "document.write")

    const data = await request.formData()
    const f = new FormReader(data)
    const documentId = f.uuid("document_id", { required: true })
    if (!f.ok) return fail(400, f.problem())

    try {
      await withTenant(actorFrom(locals), async (tx) => {
        await requireFolderPermission(tx, params.folderId, ctx!, "edit")
        await documents.archiveDocument(tx, documentId)
      })
    } catch (e) {
      if (e instanceof DocumentsRefused) {
        return fail(400, {
          errorFields: [],
          message: "That file is already archived.",
        })
      }
      throw e
    }
    return { saved: true }
  },
}
