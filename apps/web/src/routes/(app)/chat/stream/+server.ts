import { error } from "@sveltejs/kit"
import type { RequestHandler } from "./$types"
import { contextFrom, requireCan } from "$lib/server/auth/can"
import { withTenant, actorFrom } from "$lib/server/db/tenant"
import * as chat from "$lib/server/team-chat/team-chat.repo"
import { subscribe } from "$lib/server/team-chat/realtime"

/**
 * SSE stream of pointer-only nudges — {conversationId, messageId} — for the
 * caller's own conversations (docs/20-team-chat.md §5). Never the source of
 * truth: a nudge just tells an open tab to re-fetch through
 * chat/[id]/messages?after=, the same RLS-protected read the poll already
 * uses, and the feature is specified to keep working correctly with this
 * stream switched off entirely.
 *
 * The membership lookup runs in its own short transaction and completes
 * before the stream is constructed — a `withTenant` transaction must never
 * stay open for the stream's lifetime, or every open tab pins one of the
 * shared pool's connections (max 20) for as long as the tab stays open.
 */
export const GET: RequestHandler = async ({ locals, request }) => {
  if (!locals.tenantId) error(403, "No tenant")
  requireCan(contextFrom(locals), "team_chat.read")
  if (!locals.employeeId)
    error(403, "Chat is for employees, not this kind of account.")

  const tenantId = locals.tenantId
  const employeeId = locals.employeeId
  const conversationIds = await withTenant(actorFrom(locals), (tx) =>
    chat.memberConversationIds(tx, employeeId),
  )

  const encoder = new TextEncoder()
  let heartbeat: ReturnType<typeof setInterval>
  let unsubscribe: () => void

  const stream = new ReadableStream({
    start(controller) {
      const send = (chunk: string) => {
        try {
          controller.enqueue(encoder.encode(chunk))
        } catch {
          // Controller already closed; the abort listener below tears the
          // rest down.
        }
      }

      send(": connected\n\n")
      unsubscribe = subscribe(tenantId, conversationIds, (frame) => {
        send(`event: message\ndata: ${JSON.stringify(frame)}\n\n`)
      })

      // Keeps an idle intermediary (a proxy, a load balancer) from timing
      // out a connection that may otherwise sit quiet for the whole 45s
      // poll interval.
      heartbeat = setInterval(() => send(": heartbeat\n\n"), 25_000)
    },
    cancel() {
      clearInterval(heartbeat)
      unsubscribe()
    },
  })

  request.signal.addEventListener("abort", () => {
    clearInterval(heartbeat)
    unsubscribe?.()
  })

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
    },
  })
}
