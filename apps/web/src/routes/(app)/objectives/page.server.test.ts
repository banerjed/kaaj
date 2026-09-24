import { afterAll, afterEach, describe, expect, it } from "vitest"
import { closeConnections } from "$lib/server/db/client"
import { withTenant } from "$lib/server/db/tenant"
import * as audit from "$lib/server/audit/audit.repo"
import { actions } from "./+page.server"

/**
 * `create`'s audit entry, against the REAL deployed action (same shape as
 * `lib/server/auth/action-authz.test.ts`) — not a simulation of it.
 *
 * `audit_log` is append-only: `app_user` has no DELETE grant
 * (`audit.test.ts` asserts this directly), so the entry this leaves behind
 * is as permanent as any real create's would be — the same category of
 * growth the table is designed for, not a test-hygiene problem.
 * `app_user` has no DELETE grant on `pm_objectives` either (confirmed by
 * this file failing loudly the one time it tried) — the app never hard-
 * deletes anything, tests included, so the throwaway objective is archived
 * after each case instead, the same way a real one would be retired.
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
  return new Request("http://localhost/objectives?/create", {
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

describe("creating an objective writes exactly one audit entry, diffing only submitted fields", () => {
  it("records the create with the intended field set — and nothing else", async () => {
    const result = (await actions.create({
      request: formRequest({
        objective_name: "Audit probe objective",
        objective_type: "general",
        status: "planning",
        currency: "USD",
        // Part of the write, deliberately not part of what's audited.
        description: "should not appear in the audit diff",
      }),
      locals: locals(),
    } as never)) as { created: string }

    expect(result.created).toMatch(/^OBJ-\d+$/)

    const [{ id: objectiveId }] = await withTenant(
      OWNER,
      (tx) => tx<{ id: string }[]>`
        SELECT id FROM pm_objectives WHERE objective_number = ${result.created}
      `,
    )
    createdIds.push(objectiveId)

    const entries = await withTenant(OWNER, (tx) =>
      audit.forEntity(tx, "objectives", objectiveId),
    )

    expect(entries).toHaveLength(1)
    expect(entries[0].action).toBe("create")
    expect(entries[0].entity_type).toBe("objectives")
    // Exact shape, not a subset match — proves no field beyond these five
    // leaked in (description in particular).
    expect(entries[0].changes).toEqual({
      objective_number: { from: null, to: result.created },
      objective_name: { from: null, to: "Audit probe objective" },
      status: { from: null, to: "planning" },
      target_revenue: { from: null, to: null },
      currency: { from: null, to: "USD" },
    })
  })
})
