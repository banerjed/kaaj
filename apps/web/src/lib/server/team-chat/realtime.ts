import { getSharedPool } from "../db/client"

/**
 * In-process SSE fan-out for team_chat_message NOTIFY events (docs/20-team-chat.md
 * §5). `sql.listen()` reserves its own dedicated, non-pooled connection
 * internally (max: 1, no idle timeout, auto-reconnect on close) — this
 * module never needs to manage that connection itself, only the map from
 * conversation id to the locally-connected streams interested in it.
 *
 * Shared-tier only: `getSharedPool()` is the one pool this module ever
 * listens on. A dedicated-tier tenant's database has nothing listening
 * against it here, so its NOTIFYs never reach any relay — those tabs simply
 * never get a push and fall back to the poll already built into
 * chat/[conversationId]/+page.svelte. That degradation is the documented
 * floor (§5: "never a correctness dependency"), not a bug to fix here.
 *
 * The NOTIFY payload is a pointer only (tenant/conversation/message id) and
 * is never trusted as content — a pg_notify channel has no concept of row
 * security, so the browser's own follow-up GET through
 * team_chat_message_visibility is the one real authorization check.
 */

type Frame = { conversationId: string; messageId: string }
type Connection = { tenantId: string; enqueue: (frame: Frame) => void }

const subscribers = new Map<string, Set<Connection>>()
let started = false

function start(): void {
  if (started) return
  started = true
  void getSharedPool().listen("team_chat_message", (payload) => {
    let parsed: {
      tenant_id?: string
      conversation_id?: string
      message_id?: string
    }
    try {
      parsed = JSON.parse(payload)
    } catch {
      return
    }
    const { tenant_id, conversation_id, message_id } = parsed
    if (!tenant_id || !conversation_id || !message_id) return

    const conns = subscribers.get(conversation_id)
    if (!conns) return
    for (const conn of conns) {
      if (conn.tenantId !== tenant_id) continue
      try {
        conn.enqueue({ conversationId: conversation_id, messageId: message_id })
      } catch {
        // The stream side has already closed; its own abort handler will
        // unsubscribe. Drop it from this dispatch rather than let one dead
        // controller's throw stop every other connection's notification.
        conns.delete(conn)
      }
    }
  })
}

/**
 * Registers one open stream's interest in a fixed set of conversation ids,
 * captured once at connect time — a join/leave/archive that happens after
 * that isn't reflected into an already-open stream. The next page load (a
 * fresh EventSource, per §5) picks up the change; nothing here mutates a
 * live registration.
 *
 * Returns the function that deregisters it. The caller MUST call this on
 * disconnect (`request.signal`'s abort event) — an unremoved entry leaks
 * for the life of the process.
 */
export function subscribe(
  tenantId: string,
  conversationIds: readonly string[],
  enqueue: (frame: Frame) => void,
): () => void {
  start()
  const conn: Connection = { tenantId, enqueue }
  for (const id of conversationIds) {
    let set = subscribers.get(id)
    if (!set) {
      set = new Set()
      subscribers.set(id, set)
    }
    set.add(conn)
  }
  return () => {
    for (const id of conversationIds) {
      const set = subscribers.get(id)
      set?.delete(conn)
      if (set && set.size === 0) subscribers.delete(id)
    }
  }
}
