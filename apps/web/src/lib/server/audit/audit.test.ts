import { describe, expect, it } from "vitest"
import { withTenant, type Tx } from "../db/tenant"
import type { AuthContext } from "../auth/can"
import * as audit from "./audit.repo"

/**
 * The audit trail. Every case rolls back.
 */

const NORTHWIND = "07fb03f8-1521-5ef4-9c2d-25fcfa297ac1"
/**
 * Repositories are tested as an actor who reads everything, so a row-visibility
 * policy does not silently narrow what a repository test sees. Visibility has
 * its own tests in db/row-visibility.test.ts.
 */
const AS_OWNER = {
  tenantId: NORTHWIND,
  role: "owner",
  functionalRoles: [],
  employeeId: null,
}
const SARAH = "6d466aa9-e51a-5d52-9015-152600855932"

const ctx: AuthContext = {
  tenantId: NORTHWIND,
  userId: "00000000-0000-0000-0000-000000000001",
  employeeId: SARAH,
  role: "owner",
  functionalRoles: [],
}

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

describe("writing to the trail", () => {
  it("records who did what to which thing", async () => {
    const rows = await inRollback(async (tx) => {
      await audit.record(tx, ctx, {
        action: "approved",
        entityType: "time_off_request",
        entityId: "11111111-1111-1111-1111-111111111111",
        module: "hr",
        changes: { hours: "16.0000" },
      })
      return audit.forEntity(
        tx,
        "time_off_request",
        "11111111-1111-1111-1111-111111111111",
      )
    })
    expect(rows).toHaveLength(1)
    expect(rows[0].action).toBe("approved")
    expect(rows[0].actor_name).toBe("Sarah Johnson")
    expect(rows[0].changes).toEqual({ hours: "16.0000" })
  })

  it("stamps the time itself rather than trusting the caller", async () => {
    // occurred_at is what an auditor sorts and filters by. A row claiming to
    // have happened last year would sit quietly in the middle of the history.
    //
    // Compared against the DATABASE's clock, not this process's. The column
    // defaults to now(), so the only honest comparison is to the clock that
    // produced it — and the two clocks are on different machines here, with
    // Postgres in a VM whose time drifts across a host sleep. Comparing to
    // Date.now() made this fail for a reason that had nothing to do with
    // auditing (L43).
    const row = await inRollback(async (tx) => {
      await audit.record(tx, ctx, { action: "x", entityType: "test" })
      const [r] = await tx<{ drift_seconds: string; is_default: boolean }[]>`
        SELECT abs(extract(epoch FROM clock_timestamp() - occurred_at))::text
                 AS drift_seconds,
               occurred_at = now() AS is_default
          FROM audit_log ORDER BY id DESC LIMIT 1
      `
      return r
    })
    // now() is transaction start, so a few seconds of test setup is expected.
    expect(Number(row.drift_seconds)).toBeLessThan(60)
    // The stronger claim: it is the column default, so no caller supplied it.
    expect(row.is_default).toBe(true)
  })

  it("redacts what must never be logged, but records that it changed", async () => {
    // "Someone changed the bank details" is the fact an auditor needs. The
    // number is not — and this table is deliberately impossible to delete
    // from, so anything written here is written forever.
    const row = await inRollback(async (tx) => {
      await audit.record(tx, ctx, {
        action: "update",
        entityType: "employee",
        entityId: SARAH,
        changes: {
          job_title: "Engineering Director",
          ssn_tax_id_ct: "the-actual-ciphertext",
          account_number_ct: "another-one",
        },
      })
      const [r] = await audit.forEntity(tx, "employee", SARAH)
      return r
    })
    expect(row.changes).toEqual({
      job_title: "Engineering Director",
      ssn_tax_id_ct: "[redacted]",
      account_number_ct: "[redacted]",
    })
  })

  it("redacts a review's assessments — they are not a diff", async () => {
    const row = await inRollback(async (tx) => {
      await audit.record(tx, ctx, {
        action: "submitted",
        entityType: "review",
        entityId: SARAH,
        changes: { status: "submitted", manager_assessment: { s: "text" } },
      })
      const [r] = await audit.forEntity(tx, "review", SARAH)
      return r
    })
    expect(row.changes).toEqual({
      status: "submitted",
      manager_assessment: "[redacted]",
    })
  })
})

describe("the trail cannot be rewritten", () => {
  it("refuses an UPDATE from the application role", async () => {
    // An audit log whose entries can be edited answers "what happened?" with
    // whatever the last writer preferred.
    await expect(
      inRollback((tx) => tx`UPDATE audit_log SET action = 'tampered'`),
    ).rejects.toThrow(/permission denied/i)
  })

  it("refuses a DELETE too", async () => {
    await expect(inRollback((tx) => tx`DELETE FROM audit_log`)).rejects.toThrow(
      /permission denied/i,
    )
  })
})

describe("reading the trail", () => {
  it("returns the fixture's history newest first", async () => {
    const rows = await withTenant(AS_OWNER, (tx) => audit.recent(tx))
    expect(rows.length).toBeGreaterThan(0)
    const times = rows.map((r) => r.occurred_at.getTime())
    expect([...times].sort((a, b) => b - a)).toEqual(times)
  })

  it("filters by module", async () => {
    const rows = await withTenant(AS_OWNER, (tx) =>
      audit.recent(tx, { module: "accounting" }),
    )
    expect(rows.length).toBeGreaterThan(0)
    expect(rows.every((r) => r.module === "accounting")).toBe(true)
  })

  it("caps the limit so a page cannot ask for the whole history", async () => {
    const rows = await withTenant(AS_OWNER, (tx) =>
      audit.recent(tx, { limit: 100_000 }),
    )
    expect(rows.length).toBeLessThanOrEqual(200)
  })
})
