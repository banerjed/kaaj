import { afterAll, beforeEach, describe, expect, it, vi } from "vitest"
import { isHttpError } from "@sveltejs/kit"

// audit_log is append-only: a committed entry per test run would pile up in
// the shared fixture. The spy records what the route asked to write instead.
const recorded: unknown[] = []
vi.mock("$lib/server/audit/audit.repo", async () => {
  const actual = await vi.importActual<
    typeof import("$lib/server/audit/audit.repo")
  >("$lib/server/audit/audit.repo")
  return {
    ...actual,
    record: vi.fn(async (_tx: unknown, _ctx: unknown, entry: unknown) => {
      recorded.push(entry)
    }),
  }
})

import { closeConnections } from "$lib/server/db/client"
import { GET } from "./+server"

const NORTHWIND = "07fb03f8-1521-5ef4-9c2d-25fcfa297ac1"

function locals(role: string, functionalRoles: string[]) {
  return {
    tenantId: NORTHWIND,
    tenantRole: role,
    functionalRoles,
    employeeId: "6d466aa9-e51a-5d52-9015-152600855932",
    customerContactId: null,
    customerId: null,
    user: { id: "48ccc5de-9ba7-5461-ab49-160a1146ed85" },
  } as unknown as App.Locals
}

const PAYROLL_ADMIN = locals("employee", ["payroll_admin"])

async function get(l: App.Locals, query: string) {
  return GET({
    locals: l,
    url: new URL(`http://x/payroll/export/file?${query}`),
  } as never)
}

async function refusal(l: App.Locals, query: string) {
  try {
    await get(l, query)
  } catch (e) {
    if (isHttpError(e))
      return {
        status: e.status,
        message: (e.body as { message: string }).message,
      }
    throw e
  }
  throw new Error("expected a refusal, but the file was served")
}

beforeEach(() => {
  recorded.length = 0
})

afterAll(async () => {
  await closeConnections()
})

describe("GET /payroll/export/file", () => {
  it("refuses an employee: the file holds everyone's hours", async () => {
    const r = await refusal(
      locals("employee", []),
      "from=2026-02-01&to=2026-02-28&frequency=monthly",
    )
    expect(r.status).toBe(403)
    expect(recorded).toEqual([])
  })

  it("serves a payroll admin the RUN file, and records the export", async () => {
    // Fixture: Tom Whitfield's US-PTO, Tue 10 to Sat 14 February, 40 hours,
    // mapped to VAC; his RUN id is 000102.
    const res = await get(
      PAYROLL_ADMIN,
      "from=2026-02-01&to=2026-02-28&frequency=monthly",
    )
    expect(res.status).toBe(200)
    expect(res.headers.get("content-disposition")).toBe(
      'attachment; filename="Monthly-02012026-02282026.csv"',
    )
    const body = await res.text()
    expect(body.startsWith("##GENERIC## V1.0\r\n")).toBe(true)
    expect(body).toContain(
      "R1ABC,M,02/01/2026,02/28/2026,000102,VAC,40.00,,0,,BASE\r\n",
    )
    expect(recorded).toEqual([
      expect.objectContaining({
        action: "export",
        entityType: "payroll_export_settings",
        changes: expect.objectContaining({
          provider: { from: null, to: "adp_run" },
          period_start: { from: null, to: "2026-02-01" },
          period_end: { from: null, to: "2026-02-28" },
          employees: { from: null, to: "1" },
        }),
      }),
    ])
  })

  it("leaves out leave mapped to 'not exported', and refuses an empty file", async () => {
    // March holds only James Reid's UK-ANNUAL, which the fixture does not export.
    const r = await refusal(
      PAYROLL_ADMIN,
      "from=2026-03-01&to=2026-03-31&frequency=monthly",
    )
    expect(r.status).toBe(409)
    expect(r.message).toContain("No approved hours or time off")
    expect(recorded).toEqual([])
  })

  it("refuses a RUN file with no pay frequency", async () => {
    const r = await refusal(PAYROLL_ADMIN, "from=2026-02-01&to=2026-02-28")
    expect(r.status).toBe(400)
    expect(r.message).toContain("pay frequency")
  })

  it("refuses a period longer than one file covers", async () => {
    const r = await refusal(
      PAYROLL_ADMIN,
      "from=2026-01-01&to=2026-03-31&frequency=monthly",
    )
    expect(r.status).toBe(400)
  })
})
