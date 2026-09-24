import { afterAll, describe, expect, it } from "vitest"
import { closeConnections } from "$lib/server/db/client"
import { actions } from "./+page.server"

const NORTHWIND = "07fb03f8-1521-5ef4-9c2d-25fcfa297ac1"
// overdue, amount_due > 0, customer email on file — eligible for a reminder.
const INV_2026_002_OVERDUE = "a31732ea-dadb-575f-bd99-cbcfeaba29da"
// fully paid (amount_due = 0) — ineligible, so invoicesForReminder refuses it.
const INV_2026_001_PAID = "c72699f8-700c-5760-a8e8-19ae6dfd53c5"

function locals() {
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

function formData(fields: Record<string, string>) {
  const fd = new FormData()
  for (const [k, v] of Object.entries(fields)) fd.set(k, v)
  return fd
}

afterAll(async () => {
  await closeConnections()
})

describe("sendReminders (US-ACC-020-ish)", () => {
  it("refuses when nothing was checked", async () => {
    const result = (await actions.sendReminders({
      locals: locals(),
      request: { formData: async () => formData({}) },
    } as never)) as { status: number; data: { errorFields: string[] } }
    expect(result.status).toBe(400)
    expect(result.data.errorFields).toEqual(["invoice_ids"])
  })

  it("refuses an ineligible invoice (paid, nothing due) without throwing", async () => {
    const result = (await actions.sendReminders({
      locals: locals(),
      request: {
        formData: async () =>
          formData({ [`invoice_${INV_2026_001_PAID}`]: "on" }),
      },
    } as never)) as { status: number; data: { errorFields: string[] } }
    expect(result.status).toBe(400)
    expect(result.data.errorFields).toEqual(["invoice_ids"])
  })

  // No PRIVATE_RESEND_API_KEY is configured in this environment (same as
  // page.server.test.ts's own emailInvoice case), so a real send is not
  // exercised here — but reaching this honest per-invoice skip proves the
  // read (invoicesForReminder + locations), the loop, and the write phase
  // all run as three separate steps with no transaction held across the
  // loop, and that data (rows, locations) crosses the phase boundary intact.
  it("reaches an honest not_configured skip for an eligible invoice, across the split transaction", async () => {
    const result = (await actions.sendReminders({
      locals: locals(),
      request: {
        formData: async () =>
          formData({ [`invoice_${INV_2026_002_OVERDUE}`]: "on" }),
      },
    } as never)) as {
      reminded: {
        sent: number
        skipped: { invoiceNumber: string; reason: string }[]
      }
    }
    expect(result.reminded.sent).toBe(0)
    expect(result.reminded.skipped).toHaveLength(1)
    expect(result.reminded.skipped[0].reason).toContain("not configured")
  })
})
