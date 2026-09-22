import { error } from "@sveltejs/kit"
import type { RequestHandler } from "./$types"
import { contextFrom, requireCan } from "$lib/server/auth/can"
import { withTenant, actorFrom } from "$lib/server/db/tenant"
import * as documents from "$lib/server/documents/documents.repo"

/**
 * Streams a document — the only download path, per 18§5: Storage's own RLS
 * can see the tenant boundary only, not document_folder_shares, so the
 * folder-level permission check has to happen here, via the same
 * staff_document_visibility RLS the app already trusts for reads. `id`
 * always comes from the URL, and the row lookup is what decides whether the
 * caller may have it — never a client-supplied storage key.
 */
export const GET: RequestHandler = async ({ locals, params }) => {
  if (!locals.tenantId) error(403, "No tenant")
  requireCan(contextFrom(locals), "document.read")

  const doc = await withTenant(actorFrom(locals), async (tx) => {
    return documents.forDownload(tx, params.id)
  })
  if (!doc) error(404, "Not found")

  const { data, error: downloadError } = await locals.supabase.storage
    .from("documents")
    .download(doc.storage_key)
  if (downloadError || !data) error(404, "Not found")

  return new Response(data, {
    headers: {
      "Content-Type": doc.mime_type || "application/octet-stream",
      "Content-Disposition": `attachment; filename="${doc.file_name.replace(/"/g, "")}"`,
      "Cache-Control": "private, max-age=0, must-revalidate",
      "X-Content-Type-Options": "nosniff",
    },
  })
}
