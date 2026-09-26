import { afterAll, describe, expect, it } from "vitest"
import { closeConnections } from "../db/client"
import { withTenant, type Tx } from "../db/tenant"
import * as comments from "./comments.repo"
import { CommentWriteRefused } from "./comments.repo"

/** Task comments (docs/25-project-management-phase2.md), against the real database. Every case rolls back. */

const NORTHWIND = "07fb03f8-1521-5ef4-9c2d-25fcfa297ac1"
const AS_OWNER = {
  tenantId: NORTHWIND,
  role: "owner",
  functionalRoles: [] as string[],
  employeeId: null,
}
const ACTOR = "75bf4b0c-4f4b-cad9-daec-de7be09ff367"

/** PRJ-001. */
const PRJ1 = "8257009f-6a91-5fd1-9efb-518198c08e2a"
/** T-001 'Discovery workshops', in PRJ1. */
const T1 = "48961ce2-d17a-5ebe-81db-f608b4b6b125"
/** T-002 'Data model mapping', in PRJ1 — already carries a fixture comment. */
const T2 = "864cc09e-6b7e-58b4-a2e2-04233fbfea70"
/** PRJ-002. */
const PRJ2 = "fda698f3-bf14-5aae-bed6-330c8b5a6a70"

async function inRollback<T>(fn: (tx: Tx) => Promise<T>): Promise<T> {
  const marker = new Error("__rollback__")
  try {
    return await withTenant(AS_OWNER, async (tx) => {
      const result = await fn(tx)
      throw Object.assign(marker, { result })
    })
  } catch (e) {
    if (e === marker) return (e as { result: T }).result
    throw e
  }
}

describe("task comments", () => {
  afterAll(async () => {
    await closeConnections()
  })

  it("adds a comment, visible via commentsForProject grouped by task", async () => {
    const list = await inRollback(async (tx) => {
      await comments.addComment(
        tx,
        NORTHWIND,
        T1,
        PRJ1,
        "Kickoff went well.",
        ACTOR,
      )
      return comments.commentsForProject(tx, PRJ1)
    })
    expect(list[T1]).toHaveLength(1)
    expect(list[T1][0].comment_text).toBe("Kickoff went well.")
    expect(list[T1][0].author_employee_id).toBe(ACTOR)
  })

  it("refuses a task that does not belong to the given project", async () => {
    await expect(
      inRollback((tx) =>
        // T1 is in PRJ1, not PRJ2.
        comments.addComment(tx, NORTHWIND, T1, PRJ2, "Wrong project.", ACTOR),
      ),
    ).rejects.toThrow(CommentWriteRefused)
  })

  it("refuses a task that does not exist at all", async () => {
    await expect(
      inRollback((tx) =>
        comments.addComment(
          tx,
          NORTHWIND,
          "00000000-0000-0000-0000-000000000000",
          PRJ1,
          "No such task.",
          ACTOR,
        ),
      ),
    ).rejects.toThrow(CommentWriteRefused)
  })

  it("edits a comment's text and sets edited_at", async () => {
    const { before, after } = await inRollback(async (tx) => {
      const created = await comments.addComment(
        tx,
        NORTHWIND,
        T1,
        PRJ1,
        "First draft.",
        ACTOR,
      )
      const before = (await comments.commentsForProject(tx, PRJ1))[T1][0]
      await comments.editComment(tx, created.id, "Corrected draft.")
      const after = (await comments.commentsForProject(tx, PRJ1))[T1][0]
      return { before, after }
    })
    expect(before.edited_at).toBeNull()
    expect(after.comment_text).toBe("Corrected draft.")
    expect(after.edited_at).not.toBeNull()
  })

  it("soft-deletes a comment — it disappears from commentsForProject but the row is never removed", async () => {
    const { afterDelete, rowStillExists } = await inRollback(async (tx) => {
      const created = await comments.addComment(
        tx,
        NORTHWIND,
        T1,
        PRJ1,
        "Transient note.",
        ACTOR,
      )
      await comments.deleteComment(tx, created.id)
      const afterDelete =
        (await comments.commentsForProject(tx, PRJ1))[T1] ?? []
      const [row] = await tx<{ id: string; deleted_at: Date | null }[]>`
        SELECT id, deleted_at FROM pm_task_comments WHERE id = ${created.id}::uuid
      `
      return { afterDelete, rowStillExists: row }
    })
    expect(
      afterDelete.find((c) => c.comment_text === "Transient note."),
    ).toBeUndefined()
    expect(rowStillExists).toBeDefined()
    expect(rowStillExists.deleted_at).not.toBeNull()
  })

  it("refuses editing or deleting a comment that no longer exists", async () => {
    const missing = "00000000-0000-0000-0000-000000000000"
    await expect(
      inRollback((tx) => comments.editComment(tx, missing, "x")),
    ).rejects.toThrow(CommentWriteRefused)
    await expect(
      inRollback((tx) => comments.deleteComment(tx, missing)),
    ).rejects.toThrow(CommentWriteRefused)
  })

  it("commentsForProject only returns comments for tasks in THAT project", async () => {
    const list = await inRollback(async (tx) => {
      await comments.addComment(tx, NORTHWIND, T1, PRJ1, "PRJ1-only.", ACTOR)
      return comments.commentsForProject(tx, PRJ2)
    })
    expect(list[T1]).toBeUndefined()
  })

  it("the fixture's own pre-existing comment on T2 is real coverage, not a placeholder", async () => {
    const list = await inRollback((tx) => comments.commentsForProject(tx, PRJ1))
    expect(list[T2]?.length).toBeGreaterThan(0)
    expect(list[T2][0].comment_text).not.toBe("")
  })
})
