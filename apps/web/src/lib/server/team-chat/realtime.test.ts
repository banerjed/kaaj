import { afterAll, describe, expect, it, vi } from "vitest"
import { closeConnections, getSharedPool } from "../db/client"
import { subscribe } from "./realtime"

/**
 * The in-process SSE fan-out (docs/20-team-chat.md §5), against a real
 * NOTIFY on the shared pool — no mocking of `sql.listen()`, since the whole
 * point under test is that a genuine pg_notify reaches the right, and only
 * the right, subscribed connection.
 */

async function notify(
  tenantId: string,
  conversationId: string,
  messageId: string,
): Promise<void> {
  await getSharedPool().notify(
    "team_chat_message",
    JSON.stringify({
      tenant_id: tenantId,
      conversation_id: conversationId,
      message_id: messageId,
    }),
  )
}

describe("team chat realtime relay", () => {
  afterAll(async () => {
    await closeConnections()
  })

  it("delivers a NOTIFY only to a connection subscribed to that conversation and tenant", async () => {
    const framesA: unknown[] = []
    const framesB: unknown[] = []
    const unsubA = subscribe("tenant-a", ["conv-1"], (f) => framesA.push(f))
    const unsubB = subscribe("tenant-a", ["conv-2"], (f) => framesB.push(f))

    try {
      await notify("tenant-a", "conv-1", "msg-1")
      await vi.waitFor(() => expect(framesA).toHaveLength(1), {
        timeout: 5_000,
      })
      expect(framesA).toEqual([
        { conversationId: "conv-1", messageId: "msg-1" },
      ])
      expect(framesB).toEqual([])
    } finally {
      unsubA()
      unsubB()
    }
  })

  it("never delivers a notify for a different tenant on the same conversation id", async () => {
    const frames: unknown[] = []
    const unsub = subscribe("tenant-a", ["conv-shared-id"], (f) =>
      frames.push(f),
    )

    try {
      await notify("tenant-b", "conv-shared-id", "msg-2")
      // The real assertion is negative — give a genuine notify time to
      // arrive before concluding it didn't.
      await new Promise((r) => setTimeout(r, 300))
      expect(frames).toEqual([])
    } finally {
      unsub()
    }
  })

  it("stops delivering once unsubscribed", async () => {
    const frames: unknown[] = []
    const unsub = subscribe("tenant-a", ["conv-3"], (f) => frames.push(f))
    unsub()

    await notify("tenant-a", "conv-3", "msg-3")
    await new Promise((r) => setTimeout(r, 300))
    expect(frames).toEqual([])
  })
})
