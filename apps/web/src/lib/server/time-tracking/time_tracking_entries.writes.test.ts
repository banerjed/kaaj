import { afterAll, describe, expect, it } from "vitest"
import { closeConnections } from "../db/client"
import { withTenant, type Tx } from "../db/tenant"
import * as entries from "./time_tracking_entries.repo"
import { TimeEntryWriteRefused } from "./time_tracking_entries.repo"

/**
 * time_tracking_entries WRITES, against the real database. Most of this file
 * asserts `staleHours()` is empty AFTER a write, not before. Every case rolls back.
 */

const NORTHWIND = "07fb03f8-1521-5ef4-9c2d-25fcfa297ac1"
/** An owner, so a row policy cannot silently narrow what these tests see. */
const AS_OWNER = {
  tenantId: NORTHWIND,
  role: "owner",
  functionalRoles: [] as string[],
  employeeId: null,
}

/** PRJ-001 (Acme), client 0bacfcac — the client `time_tracking_hourly_rates` has a 2026 row for. */
const PRJ1 = "8257009f-6a91-5fd1-9efb-518198c08e2a"
/** T-003 'Integration build', todo, no time logged in the fixture. */
const T3 = "6d029a3a-8887-50a7-85b0-9e22408bdf61"
/** Aisha Okafor — US-NYC, so `firm_payroll_policies`'s `nearest_15` policy applies to her approvals. */
const AISHA = "11f31511-ad53-59c7-9e90-8ee3b553489b"
/** Marcus Chen — a different employee, so he can approve Aisha's entries. */
const MARCUS = "db1f1f2b-b140-5948-a34e-1c998ed98757"

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

const NEW_ENTRY = {
  employee_id: AISHA,
  project_id: PRJ1,
  task_id: T3,
  entry_date: "2026-02-02",
  hours: "6.13",
  is_billable: true,
  description: "Cutover rehearsal prep",
}

describe("logging time keeps the task/project hours true", () => {
  afterAll(async () => {
    await closeConnections()
  })

  it("resolves the rate card and raises actual_hours", async () => {
    const after = await inRollback(async (tx) => {
      const created = await entries.create(tx, NORTHWIND, NEW_ENTRY, AISHA)
      return entries.byId(tx, created.id)
    })
    expect(after?.hourly_rate).toBe("225.0000") // the 2026 rate card row for Aisha + Acme's client
    expect(after?.billable_amount).toBeNull() // not billed until decide()
    expect(after?.status).toBe("draft")
  })

  it("leaves no stale hours anywhere in the tenant after logging", async () => {
    const stale = await inRollback(async (tx) => {
      await entries.create(tx, NORTHWIND, NEW_ENTRY, AISHA)
      return entries.staleHours(tx)
    })
    expect(stale).toEqual([])
  })

  it("refuses to submit anything but a draft", async () => {
    await expect(
      inRollback(async (tx) => {
        const created = await entries.create(tx, NORTHWIND, NEW_ENTRY, AISHA)
        await entries.submit(tx, created.id, AISHA)
        await entries.submit(tx, created.id, AISHA) // already submitted
      }),
    ).rejects.toThrow(TimeEntryWriteRefused)
  })

  it("rounds to the office's policy and snapshots billable_amount on approval", async () => {
    const after = await inRollback(async (tx) => {
      const created = await entries.create(tx, NORTHWIND, NEW_ENTRY, AISHA)
      await entries.submit(tx, created.id, AISHA)
      await entries.decide(tx, created.id, "approved", MARCUS, null)
      return entries.byId(tx, created.id)
    })
    // 6.13h = 367.8min -> nearest 15 = 375min = 6.25h; 6.25 * 225 = 1406.25.
    // hours itself is untouched — only the money is rounded.
    expect(after?.hours).toBe("6.1300")
    expect(after?.billable_amount).toBe("1406.2500") // column is numeric(18,4)
    expect(after?.status).toBe("approved")
  })

  it("leaves billable_amount NULL on rejection, with a reason", async () => {
    const after = await inRollback(async (tx) => {
      const created = await entries.create(tx, NORTHWIND, NEW_ENTRY, AISHA)
      await entries.submit(tx, created.id, AISHA)
      await entries.decide(tx, created.id, "rejected", MARCUS, "Wrong task.")
      return entries.byId(tx, created.id)
    })
    expect(after?.billable_amount).toBeNull()
    expect(after?.status).toBe("rejected")
    expect(after?.rejection_reason).toBe("Wrong task.")
  })

  it("refuses self-approval", async () => {
    await expect(
      inRollback(async (tx) => {
        const created = await entries.create(tx, NORTHWIND, NEW_ENTRY, AISHA)
        await entries.submit(tx, created.id, AISHA)
        await entries.decide(tx, created.id, "approved", AISHA, null) // same person
      }),
    ).rejects.toThrow(TimeEntryWriteRefused)
  })

  it("excludes a rejected entry's hours from actual_hours", async () => {
    const { task, actual } = await inRollback(async (tx) => {
      const created = await entries.create(tx, NORTHWIND, NEW_ENTRY, AISHA)
      await entries.submit(tx, created.id, AISHA)
      await entries.decide(tx, created.id, "rejected", MARCUS, "No.")
      const [task] = await tx<{ actual_hours: string }[]>`
        SELECT actual_hours::text AS actual_hours FROM tasks WHERE id = ${T3}::uuid
      `
      return { task, actual: await entries.staleHours(tx) }
    })
    expect(task.actual_hours).toBe("0.0000") // T3 had no other entries in the fixture
    expect(actual).toEqual([])
  })
})
