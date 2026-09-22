import { afterAll, describe, expect, it, vi } from "vitest"
import { isHttpError } from "@sveltejs/kit"

// Same shape as ap-due-soon/export/row-cap.test.ts: a real REPORT_ROW_CAP
// (5,000) can't be tripped by the fixture's own journal-entry-line count,
// so this drives the refusal directly (L48). Only REPORT_ROW_CAP is
// overridden; every real repo function is untouched.
vi.mock("$lib/server/accounting/accounting.repo", async () => {
  const actual = await vi.importActual<
    typeof import("$lib/server/accounting/accounting.repo")
  >("$lib/server/accounting/accounting.repo")
  return { ...actual, REPORT_ROW_CAP: 0 }
})

import { closeConnections } from "$lib/server/db/client"
import { GET as ledgerExport } from "./+server"

const NORTHWIND = "07fb03f8-1521-5ef4-9c2d-25fcfa297ac1"

function ownerLocals() {
  return {
    tenantId: NORTHWIND,
    tenantRole: "owner",
    functionalRoles: [] as string[],
    employeeId: null,
    customerContactId: null,
    customerId: null,
    user: { id: "00000000-0000-0000-0000-000000000000" },
  } as unknown as App.Locals
}

afterAll(async () => {
  await closeConnections()
})

describe("general ledger export row cap", () => {
  it("refuses with a 400 naming the true line count once REPORT_ROW_CAP is exceeded", async () => {
    try {
      await ledgerExport({
        locals: ownerLocals(),
        url: new URL("http://x/accounting/ledger/export"),
      } as never)
      throw new Error("expected the row cap to refuse, but the call succeeded")
    } catch (e) {
      if (!isHttpError(e)) throw e
      expect(e.status).toBe(400)
      expect((e.body as { message: string }).message).toContain(
        "too many for a single export",
      )
    }
  })
})
