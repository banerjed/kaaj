import { error } from "@sveltejs/kit"
import type { PageServerLoad } from "./$types"
import * as projects from "$lib/server/projects/projects.repo"
import { withTenant, actorFrom } from "$lib/server/db/tenant"
import { FormReader } from "$lib/server/forms"

// The values these columns actually hold. They are plain `text` with no CHECK
// constraint and no enum behind them, so the app is the only thing keeping a
// crafted POST from writing anything at all — which is why they go through
// `choice` rather than being read raw.
const STATUSES = [
  "planning",
  "active",
  "on_hold",
  "completed",
  "cancelled",
] as const
const HEALTHS = ["on_track", "at_risk", "off_track"] as const

/**
 * /projects — the project list.
 *
 * No permission gate: a project is firm business data and everyone in the firm
 * may see the board. What a CLIENT sees is a different boundary entirely, and
 * lives in `clientVisibleOnly`.
 */
export const load: PageServerLoad = async ({ locals, url }) => {
  if (!locals.tenantId) error(403, "No tenant")

  const params = new FormData()
  for (const k of ["status", "health"]) {
    params.append(k, url.searchParams.get(k) ?? "")
  }
  const f = new FormReader(params)
  const status = f.choice("status", STATUSES) ?? ""
  const health = f.choice("health", HEALTHS) ?? ""

  return withTenant(actorFrom(locals), async (tx) => ({
    projects: await projects.list(tx, { status, health }),
    statuses: STATUSES,
    healths: HEALTHS,
    filters: { status, health },
  }))
}
