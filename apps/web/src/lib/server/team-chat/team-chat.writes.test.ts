import { afterAll, describe, expect, it } from "vitest"
import { closeConnections } from "../db/client"
import { withTenant, type Actor, type Tx } from "../db/tenant"
import * as chat from "./team-chat.repo"

/**
 * Team chat write paths, against the real database. Every case rolls back.
 * See docs/10-lessons-learned.md L93/L94 for why RETURNING and ON CONFLICT
 * DO UPDATE are deliberately absent from team-chat.repo.ts — several tests
 * here exist specifically to keep that regression from coming back.
 */

const NORTHWIND = "07fb03f8-1521-5ef4-9c2d-25fcfa297ac1"

// Fixture employees not already members of any team_chat row, so a "fresh
// join" test really is the first-ever membership row for that person.
const OLIVER = "56bd1329-6740-572f-aa90-c44d1b27bedf"
const NADIA = "385f5ae5-e567-5fb6-98f8-b45007099ff8"
const YUKI = "fa4c9324-158b-55b7-acdd-7fe7917bc7cf"

const asEmployee = (employeeId: string): Actor => ({
  tenantId: NORTHWIND,
  employeeId,
  customerContactId: null,
  customerId: null,
  role: "employee",
  functionalRoles: [],
})

async function inRollback<T>(
  actor: Actor,
  fn: (tx: Tx) => Promise<T>,
): Promise<T> {
  const marker = new Error("__rollback__")
  try {
    return await withTenant(actor, async (tx) => {
      const result = await fn(tx)
      throw Object.assign(marker, { result })
    })
  } catch (e) {
    if (e === marker) return (e as { result: T }).result
    throw e
  }
}

describe("findOrCreateDm", () => {
  afterAll(async () => {
    await closeConnections()
  })

  it("is idempotent regardless of participant order", async () => {
    const { first, second, memberCount } = await inRollback(
      asEmployee(OLIVER),
      async (tx) => {
        const first = await chat.findOrCreateDm(tx, {
          tenantId: NORTHWIND,
          participantIds: [OLIVER, NADIA],
        })
        const second = await chat.findOrCreateDm(tx, {
          tenantId: NORTHWIND,
          participantIds: [NADIA, OLIVER],
        })
        const [{ n }] = await tx<{ n: number }[]>`
          SELECT count(*)::int AS n FROM team_chat_members WHERE conversation_id = ${first}::uuid
        `
        return { first, second, memberCount: n }
      },
    )
    expect(second).toBe(first)
    expect(memberCount).toBe(2)
  })

  it("seeds member_ids with every participant at creation, not left to the trigger to catch up", async () => {
    const memberIds = await inRollback(asEmployee(OLIVER), async (tx) => {
      const id = await chat.findOrCreateDm(tx, {
        tenantId: NORTHWIND,
        participantIds: [OLIVER, NADIA],
      })
      const [row] = await tx<{ member_ids: string[] }[]>`
        SELECT member_ids FROM team_chat_conversations WHERE id = ${id}::uuid
      `
      return row.member_ids
    })
    expect(memberIds.sort()).toEqual([NADIA, OLIVER].sort())
  })
})

describe("joinPublicChannel — the L93/L94 regression guard", () => {
  afterAll(async () => {
    await closeConnections()
  })

  const GENERAL = "d0000000-0000-4000-8000-000000000001"

  it("succeeds on a genuinely first-ever membership row (no prior conflict)", async () => {
    // Yuki has never been a member of #general in the fixture — this is
    // exactly the branch that raised "new row violates row-level security
    // policy" before upsertMembership stopped using ON CONFLICT DO UPDATE.
    const role = await inRollback(asEmployee(YUKI), async (tx) => {
      await chat.joinPublicChannel(tx, {
        tenantId: NORTHWIND,
        conversationId: GENERAL,
        employeeId: YUKI,
      })
      return chat.myRole(tx, GENERAL, YUKI)
    })
    expect(role).toBe("member")
  })

  it("reactivates a left membership on rejoin, rather than erroring or duplicating", async () => {
    const { roleAfterLeave, roleAfterRejoin, rowCount } = await inRollback(
      asEmployee(YUKI),
      async (tx) => {
        await chat.joinPublicChannel(tx, {
          tenantId: NORTHWIND,
          conversationId: GENERAL,
          employeeId: YUKI,
        })
        await chat.leaveConversation(tx, GENERAL, YUKI)
        const roleAfterLeave = await chat.myRole(tx, GENERAL, YUKI)
        await chat.joinPublicChannel(tx, {
          tenantId: NORTHWIND,
          conversationId: GENERAL,
          employeeId: YUKI,
        })
        const roleAfterRejoin = await chat.myRole(tx, GENERAL, YUKI)
        const [{ n }] = await tx<{ n: number }[]>`
          SELECT count(*)::int AS n FROM team_chat_members
           WHERE conversation_id = ${GENERAL}::uuid AND employee_id = ${YUKI}::uuid
        `
        return { roleAfterLeave, roleAfterRejoin, rowCount: n }
      },
    )
    expect(roleAfterLeave).toBeNull()
    expect(roleAfterRejoin).toBe("member")
    expect(rowCount).toBe(1)
  })
})

describe("messages", () => {
  afterAll(async () => {
    await closeConnections()
  })

  const GENERAL = "d0000000-0000-4000-8000-000000000001"
  const SARAH = "6d466aa9-e51a-5d52-9015-152600855932"

  it("paginates newest-first without skipping or repeating across pages", async () => {
    const { firstPage, secondPage } = await inRollback(
      asEmployee(SARAH),
      async (tx) => {
        const ids: string[] = []
        for (let i = 0; i < 5; i++) {
          const { id } = await chat.postMessage(tx, {
            tenantId: NORTHWIND,
            conversationId: GENERAL,
            authorEmployeeId: SARAH,
            body: `page-test ${i}`,
          })
          ids.push(id)
        }
        const firstPage = await chat.messages(tx, GENERAL, { limit: 2 })
        const secondPage = await chat.messages(tx, GENERAL, {
          before: firstPage[firstPage.length - 1].id,
          limit: 2,
        })
        return { firstPage, secondPage }
      },
    )
    const firstIds = firstPage.map((m) => m.id)
    const secondIds = secondPage.map((m) => m.id)
    expect(firstIds).toHaveLength(2)
    expect(secondIds).toHaveLength(2)
    // No overlap between consecutive keyset pages.
    expect(firstIds.filter((id) => secondIds.includes(id))).toEqual([])
    // Strictly older: the last message of page 1 is newer than every message on page 2.
    expect(firstPage[1].created_at.getTime()).toBeGreaterThan(
      secondPage[0].created_at.getTime(),
    )
  })

  it("nulls the body of a deleted message, but keeps the row (tombstone)", async () => {
    const { before, after } = await inRollback(
      asEmployee(SARAH),
      async (tx) => {
        const { id } = await chat.postMessage(tx, {
          tenantId: NORTHWIND,
          conversationId: GENERAL,
          authorEmployeeId: SARAH,
          body: "to be deleted",
        })
        const [before] = await chat.messages(tx, GENERAL, { limit: 1 })
        await chat.deleteMessage(tx, { id, authorEmployeeId: SARAH })
        const [after] = await chat.messages(tx, GENERAL, { limit: 1 })
        return { before, after }
      },
    )
    expect(before.body).toBe("to be deleted")
    expect(after.id).toBe(before.id)
    expect(after.body).toBeNull()
    expect(after.deleted_at).not.toBeNull()
  })

  it("refuses to edit or delete someone else's message", async () => {
    const { id } = await inRollback(asEmployee(SARAH), (tx) =>
      chat.postMessage(tx, {
        tenantId: NORTHWIND,
        conversationId: GENERAL,
        authorEmployeeId: SARAH,
        body: "Sarah's message",
      }),
    )
    // A different member (Marcus) trying to edit/delete Sarah's message —
    // the UPDATE's own author_employee_id check matches zero rows.
    const MARCUS = "db1f1f2b-b140-5948-a34e-1c998ed98757"
    await expect(
      inRollback(asEmployee(MARCUS), (tx) =>
        chat.editMessage(tx, {
          id,
          authorEmployeeId: MARCUS,
          body: "hijacked",
        }),
      ),
    ).rejects.toThrow(chat.TeamChatRefused)
    await expect(
      inRollback(asEmployee(MARCUS), (tx) =>
        chat.deleteMessage(tx, { id, authorEmployeeId: MARCUS }),
      ),
    ).rejects.toThrow(chat.TeamChatRefused)
  })
})

describe("unread counts — recomputed, not maintained (§2)", () => {
  afterAll(async () => {
    await closeConnections()
  })

  const GENERAL = "d0000000-0000-4000-8000-000000000001"
  const SARAH = "6d466aa9-e51a-5d52-9015-152600855932"
  const MARCUS = "db1f1f2b-b140-5948-a34e-1c998ed98757"

  it("rises when a new message arrives, and drops to zero after markRead", async () => {
    const { before, afterMessage, afterRead } = await inRollback(
      asEmployee(SARAH),
      async (tx) => {
        const unreadFor = async () => {
          const rows = await chat.listConversations(tx, MARCUS)
          return rows.find((c) => c.id === GENERAL)!.unread_count
        }
        const before = await unreadFor()
        await chat.postMessage(tx, {
          tenantId: NORTHWIND,
          conversationId: GENERAL,
          authorEmployeeId: SARAH,
          body: "new for Marcus",
        })
        const afterMessage = await unreadFor()
        await chat.markRead(tx, GENERAL, MARCUS)
        const afterRead = await unreadFor()
        return { before, afterMessage, afterRead }
      },
    )
    expect(afterMessage).toBe(before + 1)
    expect(afterRead).toBe(0)
  })
})

describe("archiveChannel", () => {
  afterAll(async () => {
    await closeConnections()
  })

  const SARAH = "6d466aa9-e51a-5d52-9015-152600855932"

  it("removes an archived channel from the conversation list, and refuses a second archive", async () => {
    const { stillListed, secondArchiveRefused } = await inRollback(
      asEmployee(SARAH),
      async (tx) => {
        const id = await chat.createChannel(tx, {
          tenantId: NORTHWIND,
          creatorEmployeeId: SARAH,
          name: "temp-channel",
          topic: null,
          visibility: "public",
        })
        await chat.archiveChannel(tx, id)
        const rows = await chat.listConversations(tx, SARAH)
        const stillListed = rows.some((c) => c.id === id)

        let secondArchiveRefused = false
        try {
          await chat.archiveChannel(tx, id)
        } catch (e) {
          secondArchiveRefused = e instanceof chat.TeamChatRefused
        }
        return { stillListed, secondArchiveRefused }
      },
    )
    expect(stillListed).toBe(false)
    expect(secondArchiveRefused).toBe(true)
  })
})
