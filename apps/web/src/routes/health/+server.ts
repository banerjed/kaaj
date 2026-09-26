/**
 * A platform liveness probe (what a host like Fly.io/Render hits), not a
 * substitute for the "dedicated targets" `./check` step that verifies every
 * tenant's own database — this only proves the container is up and can reach
 * its primary (control-plane) connection. No auth: a probe has no session.
 */
import { json, type RequestHandler } from "@sveltejs/kit"
import { getSharedPool } from "$lib/server/db/client"

export const GET: RequestHandler = async () => {
  const start = performance.now()
  try {
    await getSharedPool()`SELECT 1`
    return json({ status: "ok", dbMs: Math.round(performance.now() - start) })
  } catch {
    return json(
      { status: "error", dbMs: Math.round(performance.now() - start) },
      { status: 503 },
    )
  }
}
