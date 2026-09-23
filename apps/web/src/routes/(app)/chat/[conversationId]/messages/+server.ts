import { error, json } from "@sveltejs/kit"
import type { RequestHandler } from "./$types"
import { contextFrom, requireCan } from "$lib/server/auth/can"
import { withTenant, actorFrom } from "$lib/server/db/tenant"
import * as chat from "$lib/server/team-chat/team-chat.repo"

/**
 * GET .../messages?after=:id — the authoritative backfill read (docs/20-team-chat.md
 * §5): the SSE stream and the polling fallback both call this after a
 * pointer-only nudge or on a timer, never trusting NOTIFY's payload as
 * content. RLS (team_chat_message_visibility) is what actually decides what
 * comes back.
 */
export const GET: RequestHandler = async ({ locals, params, url }) => {
  if (!locals.tenantId) error(403, "No tenant")
  requireCan(contextFrom(locals), "team_chat.read")

  const after = url.searchParams.get("after")
  if (!after) error(400, "after is required")

  const messages = await withTenant(actorFrom(locals), (tx) =>
    chat.messagesAfter(tx, params.conversationId, after),
  )
  return json({ messages })
}
