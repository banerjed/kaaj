import { error } from "@sveltejs/kit"
import type { RequestHandler } from "./$types"
import { contextFrom, requireCan } from "$lib/server/auth/can"
import { withTenant, actorFrom } from "$lib/server/db/tenant"
import * as tenants from "$lib/server/platform-tenancy/tenants.repo"

/**
 * Streams the current tenant's logo — same read permission as the company
 * profile page it's embedded on (L79: a page's own read permission is not
 * inherited from anywhere else). `key` always comes from the caller's own
 * `logo_storage_key`, never a client-supplied path, so Storage RLS on top
 * of this can never be asked to cross tenants.
 */
export const GET: RequestHandler = async ({ locals }) => {
  if (!locals.tenantId) error(403, "No tenant")
  requireCan(contextFrom(locals), "firm.settings.read")

  const key = await withTenant(actorFrom(locals), async (tx) => {
    const tenant = await tenants.getCurrent(tx)
    return tenant?.logo_storage_key ?? null
  })
  if (!key) error(404, "No logo set")

  const { data, error: downloadError } = await locals.supabase.storage
    .from("tenant-logos")
    .download(key)
  if (downloadError || !data) error(404, "No logo set")

  return new Response(data, {
    headers: {
      "Content-Type": data.type || "application/octet-stream",
      // Always revalidated, not cached across an upload — the key never
      // changes on re-upload (upsert to a fixed path), so a longer max-age
      // would show the old image right after replacing it.
      "Cache-Control": "private, max-age=0, must-revalidate",
      // Defense in depth alongside the upload-time magic-byte check — the
      // stored content-type is still whatever the uploader originally
      // declared, so the browser is told never to guess past it.
      "X-Content-Type-Options": "nosniff",
    },
  })
}
