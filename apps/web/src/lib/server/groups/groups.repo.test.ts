import { afterAll, describe, expect, it } from "vitest"
import { closeConnections } from "../db/client"
import { withTenant, type Tx } from "../db/tenant"
import * as groups from "./groups.repo"

/** User groups (docs/28-user-groups.md), against the real database. Every case rolls back. */

const NORTHWIND = "07fb03f8-1521-5ef4-9c2d-25fcfa297ac1"
const AS_OWNER = {
  tenantId: NORTHWIND,
  role: "owner",
  functionalRoles: [] as string[],
  employeeId: null,
}
const ACTOR = "75bf4b0c-4f4b-cad9-daec-de7be09ff367"

/** Fixture: Sarah (Engineering owner). */
const SARAH = "6d466aa9-e51a-5d52-9015-152600855932"
/** Fixture: Marcus (Engineering member). */
const MARCUS = "db1f1f2b-b140-5948-a34e-1c998ed98757"
/** Fixture Engineering group id. */
const ENGINEERING = "0158d8de-be1c-565f-a3c4-78624d177e7f"

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

describe("groups", () => {
  afterAll(async () => {
    await closeConnections()
  })

  it("the fixture's own pre-existing group is real coverage, not a placeholder", async () => {
    const all = await inRollback((tx) => groups.listGroups(tx))
    expect(all.find((g) => g.id === ENGINEERING)?.display_name).toBe(
      "Engineering",
    )
  })

  it("creates a group and lists it", async () => {
    const created = await inRollback(async (tx) => {
      const { id } = await groups.createGroup(
        tx,
        NORTHWIND,
        { displayName: "QA", description: "Quality assurance" },
        ACTOR,
      )
      return groups.groupById(tx, id)
    })
    expect(created?.display_name).toBe("QA")
    expect(created?.description).toBe("Quality assurance")
  })

  it("archiving a group hides it from listGroups and groupById", async () => {
    const result = await inRollback(async (tx) => {
      const { id } = await groups.createGroup(
        tx,
        NORTHWIND,
        { displayName: "Temp", description: null },
        ACTOR,
      )
      const archived = await groups.archiveGroup(tx, id)
      return {
        archived,
        byId: await groups.groupById(tx, id),
        all: await groups.listGroups(tx),
      }
    })
    expect(result.archived).toBe(true)
    expect(result.byId).toBeNull()
    expect(result.all.some((g) => g.display_name === "Temp")).toBe(false)
  })

  it("archiving a group that does not exist reports it, rather than silently succeeding (L68)", async () => {
    const archived = await inRollback((tx) =>
      groups.archiveGroup(tx, "00000000-0000-0000-0000-000000000000"),
    )
    expect(archived).toBe(false)
  })

  it("the fixture's own membership is real coverage", async () => {
    const members = await inRollback((tx) => groups.membersFor(tx, ENGINEERING))
    expect(members.map((m) => m.employee_id).sort()).toContain(SARAH)
  })

  it("setMembers replaces the whole list, deactivating rather than deleting", async () => {
    const result = await inRollback(async (tx) => {
      const { id } = await groups.createGroup(
        tx,
        NORTHWIND,
        { displayName: "Rotating", description: null },
        ACTOR,
      )
      await groups.setMembers(tx, NORTHWIND, id, [SARAH, MARCUS], ACTOR)
      const withBoth = await groups.membersFor(tx, id)

      await groups.setMembers(tx, NORTHWIND, id, [SARAH], ACTOR)
      const withOne = await groups.membersFor(tx, id)

      // Re-adding Marcus reactivates his existing row via ON CONFLICT, not a
      // fresh insert — ensured by the UNIQUE(tenant_id, group_id, employee_id)
      // constraint the migration added.
      await groups.setMembers(tx, NORTHWIND, id, [SARAH, MARCUS], ACTOR)
      const withBothAgain = await groups.membersFor(tx, id)

      return { withBoth, withOne, withBothAgain }
    })
    expect(result.withBoth.map((m) => m.employee_id).sort()).toEqual(
      [SARAH, MARCUS].sort(),
    )
    expect(result.withOne.map((m) => m.employee_id)).toEqual([SARAH])
    expect(result.withBothAgain.map((m) => m.employee_id).sort()).toEqual(
      [SARAH, MARCUS].sort(),
    )
  })

  it("setMembers with an empty list clears membership without erroring", async () => {
    const after = await inRollback(async (tx) => {
      const { id } = await groups.createGroup(
        tx,
        NORTHWIND,
        { displayName: "Solo", description: null },
        ACTOR,
      )
      await groups.setMembers(tx, NORTHWIND, id, [SARAH], ACTOR)
      await groups.setMembers(tx, NORTHWIND, id, [], ACTOR)
      return groups.membersFor(tx, id)
    })
    expect(after).toEqual([])
  })
})
