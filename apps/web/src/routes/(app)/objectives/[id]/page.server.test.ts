import { afterAll, afterEach, describe, expect, it } from "vitest"
import { closeConnections } from "$lib/server/db/client"
import { withTenant } from "$lib/server/db/tenant"
import * as audit from "$lib/server/audit/audit.repo"
import * as objectives from "$lib/server/objectives/objectives.repo"
import { actions } from "./+page.server"

/**
 * `updateObjective`'s audit entry, against the REAL deployed action — see
 * `../page.server.test.ts` for why the append-only `audit_log` row this
 * leaves behind is accepted rather than avoided, and why the throwaway
 * objective is archived afterward rather than deleted.
 */

const NORTHWIND = "07fb03f8-1521-5ef4-9c2d-25fcfa297ac1"
const SARAH = "6d466aa9-e51a-5d52-9015-152600855932"
const OWNER = {
  tenantId: NORTHWIND,
  role: "owner" as const,
  functionalRoles: [] as string[],
  employeeId: null,
}

const locals = () =>
  ({
    tenantId: NORTHWIND,
    tenantRole: "owner",
    functionalRoles: [] as string[],
    employeeId: SARAH,
    user: { id: "00000000-0000-0000-0000-000000000009" },
  }) as unknown as App.Locals

function formRequest(fields: Record<string, string>) {
  const fd = new FormData()
  for (const [k, v] of Object.entries(fields)) fd.append(k, v)
  return new Request("http://localhost/objectives/x?/updateObjective", {
    method: "POST",
    body: fd,
  })
}

const createdIds: string[] = []

afterEach(async () => {
  if (createdIds.length === 0) return
  await withTenant(
    OWNER,
    (tx) =>
      tx`UPDATE pm_objectives SET archived_at = now()
          WHERE id = ANY(${createdIds}::uuid[])`,
  )
  createdIds.length = 0
})

afterAll(async () => {
  await closeConnections()
})

describe("editing an objective diffs only the fields that actually moved, and only from the audited list", () => {
  it("records name and status changing; leaves out description and every unchanged field", async () => {
    const { id } = await withTenant(OWNER, (tx) =>
      objectives.createObjective(
        tx,
        NORTHWIND,
        {
          objective_name: "Audit probe objective",
          description: "original description",
          objective_type: "general",
          status: "planning",
          client_id: null,
          owner_employee_id: null,
          start_date: null,
          target_end_date: null,
          fiscal_year: null,
          quarter: null,
          // Written in the same shape `f.decimal` would return it, so the
          // edit below can submit the identical string and prove it's
          // excluded from the diff as an unchanged field.
          target_revenue: "1000.0000",
          currency: "USD",
        },
        SARAH,
      ),
    )
    createdIds.push(id)

    const result = (await actions.updateObjective({
      request: formRequest({
        objective_name: "Audit probe objective — renamed",
        // Changed, but not in the audited field list.
        description: "a new description, deliberately not audited",
        objective_type: "general", // unchanged
        status: "active", // changed
        target_revenue: "1000.0000", // unchanged (same string)
        currency: "USD", // unchanged
      }),
      locals: locals(),
      params: { id },
    } as never)) as { saved: boolean }

    expect(result.saved).toBe(true)

    const entries = await withTenant(OWNER, (tx) =>
      audit.forEntity(tx, "objectives", id),
    )

    expect(entries).toHaveLength(1)
    expect(entries[0].action).toBe("update")
    // Exact shape: only what moved, from the intended list — not
    // description (moved, but not audited), and not any of the four fields
    // that were resubmitted unchanged (audit.diff skips those on its own).
    expect(entries[0].changes).toEqual({
      objective_name: {
        from: "Audit probe objective",
        to: "Audit probe objective — renamed",
      },
      status: { from: "planning", to: "active" },
    })
  })
})
