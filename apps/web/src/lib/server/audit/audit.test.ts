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
        action: "approve",
        entityType: "hr_time_off_requests",
        entityId: "11111111-1111-1111-1111-111111111111",
        module: "hr",
        changes: { status: { from: "pending", to: "approved" } },
      })
      return audit.forEntity(
        tx,
        "hr_time_off_requests",
        "11111111-1111-1111-1111-111111111111",
      )
    })
    expect(rows).toHaveLength(1)
    expect(rows[0].action).toBe("approve")
    expect(rows[0].actor_name).toBe("Sarah Johnson")
    expect(rows[0].changes).toEqual({
      status: { from: "pending", to: "approved" },
    })
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
      await audit.record(tx, ctx, { action: "update", entityType: "test" })
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
          job_title: {
            from: "Engineering Manager",
            to: "Engineering Director",
          },
          ssn_tax_id_ct: {
            from: "old-ciphertext",
            to: "the-actual-ciphertext",
          },
          account_number_ct: { from: null, to: "another-one" },
        },
      })
      const [r] = await audit.forEntity(tx, "employee", SARAH)
      return r
    })
    expect(row.changes).toEqual({
      job_title: { from: "Engineering Manager", to: "Engineering Director" },
      // BOTH sides replaced. Redacting only the new value would leave the old
      // one — which for a rotated account number is the number that was
      // actually in use.
      ssn_tax_id_ct: { from: "[redacted]", to: "[redacted]" },
      account_number_ct: { from: "[redacted]", to: "[redacted]" },
    })
  })

  it("redacts a review's assessments — they are not a diff", async () => {
    const row = await inRollback(async (tx) => {
      await audit.record(tx, ctx, {
        action: "submit",
        entityType: "hr_reviews",
        entityId: SARAH,
        changes: {
          status: { from: "draft", to: "submitted" },
          manager_assessment: { from: null, to: "the actual assessment text" },
        },
      })
      const [r] = await audit.forEntity(tx, "hr_reviews", SARAH)
      return r
    })
    expect(row.changes).toEqual({
      status: { from: "draft", to: "submitted" },
      manager_assessment: { from: "[redacted]", to: "[redacted]" },
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

describe("the change record's shape", () => {
  it("keeps the OLD value, not only the new one", async () => {
    // The half an auditor actually asks about. A flat {amount: "148000"}
    // records what a value became and loses what it was.
    const row = await inRollback(async (tx) => {
      await audit.record(tx, ctx, {
        action: "pay_change",
        entityType: "compensation_base",
        entityId: SARAH,
        changes: { amount: { from: "139000.00", to: "148000.00" } },
      })
      const [r] = await audit.forEntity(tx, "compensation_base", SARAH)
      return r
    })
    expect(row.changes).toEqual({
      amount: { from: "139000.00", to: "148000.00" },
    })
  })

  it("stores money as a STRING, so no digit is lost", async () => {
    // A JSON number in JSONB comes back to JavaScript as a float64. Everywhere
    // else that is a bug to fix; here it cannot be fixed, because the table
    // holds INSERT and SELECT only (L41).
    const value = "9007199254740993.00" // > 2^53: a float64 cannot hold it
    const row = await inRollback(async (tx) => {
      await audit.record(tx, ctx, {
        action: "pay_change",
        entityType: "compensation_base",
        entityId: SARAH,
        changes: { amount: { from: null, to: value } },
      })
      const [r] = await audit.forEntity(tx, "compensation_base", SARAH)
      return r
    })
    expect(row.changes!.amount.to).toBe(value)
    // The proof it matters: through a float it would not survive.
    expect(String(Number(value))).not.toBe(value)
  })

  it("reads null as 'the field had no value before'", async () => {
    const row = await inRollback(async (tx) => {
      await audit.record(tx, ctx, {
        action: "create",
        entityType: "employees",
        entityId: SARAH,
        changes: { middle_name: { from: null, to: "Anne" } },
      })
      const [r] = await audit.forEntity(tx, "employees", SARAH)
      return r
    })
    expect(row.changes!.middle_name).toEqual({ from: null, to: "Anne" })
  })

  it("keeps the reason, and keeps it out of the values", async () => {
    // Prose has a home, but never mixed with values: the redaction set matches
    // field NAMES, so a sentence carrying an account number would go straight
    // past it into a table that cannot be deleted from.
    const row = await inRollback(async (tx) => {
      await audit.record(tx, ctx, {
        action: "pay_change",
        entityType: "compensation_base",
        entityId: SARAH,
        changes: { amount: { from: "1", to: "2" } },
        reason: "backdated per the offer letter",
      })
      const [r] = await audit.forEntity(tx, "compensation_base", SARAH)
      return r
    })
    const changes = row.changes as unknown as Record<string, unknown>
    expect(changes._reason).toBe("backdated per the offer letter")
    // Still a well-formed change beside it.
    expect(changes.amount).toEqual({ from: "1", to: "2" })
  })

  it("redacts BOTH sides of a protected field", async () => {
    // Replacing only the new value would leave the old one — which for a
    // rotated account number is the number that was actually in use.
    const row = await inRollback(async (tx) => {
      await audit.record(tx, ctx, {
        action: "update",
        entityType: "employee_bank_accounts",
        entityId: SARAH,
        changes: {
          iban_ct: {
            from: "GB29NWBK60161331926819",
            to: "GB94BARC10201530093459",
          },
        },
      })
      const [r] = await audit.forEntity(tx, "employee_bank_accounts", SARAH)
      return r
    })
    expect(row.changes).toEqual({
      iban_ct: { from: "[redacted]", to: "[redacted]" },
    })
    // And neither value survives anywhere in the row.
    expect(JSON.stringify(row)).not.toContain("NWBK")
    expect(JSON.stringify(row)).not.toContain("BARC")
  })
})
