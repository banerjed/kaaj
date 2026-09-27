import { afterAll, describe, expect, it } from "vitest"
import { closeConnections } from "../db/client"
import { withTenant, type Tx } from "../db/tenant"
import * as ticketing from "./ticketing.repo"
import { TicketingRefused } from "./ticketing.repo"

/**
 * Ticketing WRITES, against the real database. Every case rolls back.
 *
 * A ticket's business area, category and subcategory form a chain — the
 * category belongs to the area, the subcategory to the category — and the
 * schema holds it, not just createTicket: every feature that uses tickets as
 * a backing store writes through the same table.
 */

const NORTHWIND = "07fb03f8-1521-5ef4-9c2d-25fcfa297ac1"
const ACTOR = "6d466aa9-e51a-5d52-9015-152600855932"
const STAFF = {
  tenantId: NORTHWIND,
  role: "employee",
  functionalRoles: [] as string[],
  employeeId: ACTOR,
}

const IT_SUPPORT = "872ea5b0-1dc9-5e20-be3e-5eaa8c431c0c"
const IT_HARDWARE = "a1000000-0000-5000-8000-000000000001"
const IT_HARDWARE_SUB = "a1000000-0000-5000-8000-000000000011"
const IT_ACCESS_SUB = "a1000000-0000-5000-8000-000000000021"
const CLIENT_SUPPORT_QUESTION = "a2000000-0000-5000-8000-000000000002"

async function inRollback<T>(fn: (tx: Tx) => Promise<T>): Promise<T> {
  const marker = new Error("__rollback__")
  try {
    return await withTenant(STAFF, async (tx) => {
      const result = await fn(tx)
      throw Object.assign(marker, { result })
    })
  } catch (e) {
    if (e === marker) return (e as { result: T }).result
    throw e
  }
}

/** The constraint a raw insert trips, or null if it was accepted. */
async function refusedBy(row: {
  businessAreaId: string | null
  categoryId: string
  subcategoryId: string | null
}): Promise<string | null> {
  try {
    await inRollback(
      (tx) => tx`
        INSERT INTO ticketing_tickets (
          tenant_id, business_area_id, ticket_number, title, category_id,
          subcategory_id, logged_at, logger_employee_id, last_updated_by
        ) VALUES (
          ${NORTHWIND}::uuid, ${row.businessAreaId}::uuid, 'TEST-0001', 'Probe',
          ${row.categoryId}::uuid, ${row.subcategoryId}::uuid, now(),
          ${ACTOR}::uuid, ${ACTOR}
        )`,
    )
    return null
  } catch (e) {
    const err = e as { constraint_name?: string; column_name?: string }
    return err.constraint_name ?? `not-null:${err.column_name}`
  }
}

afterAll(async () => {
  await closeConnections()
})

describe("a ticket's area, category and subcategory — held by the schema", () => {
  it("accepts a consistent chain — the permitted half, so the refusals below are the rule", async () => {
    expect(
      await refusedBy({
        businessAreaId: IT_SUPPORT,
        categoryId: IT_HARDWARE,
        subcategoryId: IT_HARDWARE_SUB,
      }),
    ).toBeNull()
  })

  it("refuses a ticket with no business area", async () => {
    expect(
      await refusedBy({
        businessAreaId: null,
        categoryId: IT_HARDWARE,
        subcategoryId: null,
      }),
    ).toBe("not-null:business_area_id")
  })

  it("refuses a category from another business area", async () => {
    expect(
      await refusedBy({
        businessAreaId: IT_SUPPORT,
        categoryId: CLIENT_SUPPORT_QUESTION,
        subcategoryId: null,
      }),
    ).toBe("fk_ticketing_tickets_category_in_area")
  })

  it("refuses a subcategory from another category", async () => {
    expect(
      await refusedBy({
        businessAreaId: IT_SUPPORT,
        categoryId: IT_HARDWARE,
        subcategoryId: IT_ACCESS_SUB,
      }),
    ).toBe("fk_ticketing_tickets_subcategory_in_category")
  })
})

describe("createTicket — refuses before the database has to", () => {
  const input = {
    businessAreaId: IT_SUPPORT,
    title: "Laptop will not boot",
    description: "<p>Black screen.</p>",
    categoryId: IT_HARDWARE,
    subcategoryId: IT_HARDWARE_SUB as string | null,
    dueDate: "2026-10-30",
  }
  const create = (overrides: Partial<typeof input>) =>
    inRollback((tx) =>
      ticketing.createTicket(
        tx,
        NORTHWIND,
        { ...input, ...overrides },
        { employeeId: ACTOR },
      ),
    )

  it("creates a consistent ticket", async () => {
    const { ticketNumber } = await create({})
    expect(ticketNumber).toMatch(/^[A-Z]+-\d{4}$/)
  })

  it.each([
    [
      "a category from another area",
      { categoryId: CLIENT_SUPPORT_QUESTION, subcategoryId: null },
      "no_such_category",
    ],
    [
      "a subcategory from another category",
      { subcategoryId: IT_ACCESS_SUB },
      "no_such_subcategory",
    ],
  ])("refuses %s, naming which", async (_, overrides, reason) => {
    await expect(create(overrides)).rejects.toSatisfy(
      (e) => e instanceof TicketingRefused && e.reason === reason,
    )
  })
})
