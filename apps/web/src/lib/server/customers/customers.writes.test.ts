import { afterAll, describe, expect, it } from "vitest"
import { closeConnections } from "../db/client"
import { withTenant, type Tx } from "../db/tenant"
import * as customers from "./customers.repo"
import * as contacts from "./customer-contacts.repo"

/**
 * Person accounts — a client who is an individual, not a business. The
 * account and its single contact are one write; these assert they stay one.
 * Every case rolls back.
 */

const NORTHWIND = "07fb03f8-1521-5ef4-9c2d-25fcfa297ac1"
const AS_OWNER = {
  tenantId: NORTHWIND,
  role: "owner",
  functionalRoles: [] as string[],
  employeeId: null,
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

const base = {
  relationship_status: "prospect" as const,
  currency: "USD",
  account_manager_id: null,
  notes: null,
}

afterAll(async () => {
  await closeConnections()
})

describe("personName", () => {
  it("joins the two halves", () => {
    expect(customers.personName("Priya", "Okonkwo")).toBe("Priya Okonkwo")
  })

  it("trims, so a trailing space does not become a double space", () => {
    expect(customers.personName("  Priya ", " Okonkwo  ")).toBe("Priya Okonkwo")
  })

  it("handles a mononym without a dangling space", () => {
    expect(customers.personName("Prince", "")).toBe("Prince")
    expect(customers.personName("", "Okonkwo")).toBe("Okonkwo")
  })
})

describe("createIndividual", () => {
  it("writes the account and its contact together, with the name derived", async () => {
    await inRollback(async (tx) => {
      const { id } = await customers.createIndividual(tx, NORTHWIND, {
        ...base,
        first_name: "Amara",
        last_name: "Lindqvist",
        email: "amara.lindqvist@example.com",
        phone: "+1-415-555-0199",
      })

      const account = await customers.getById(tx, id)
      expect(account?.customer_name).toBe("Amara Lindqvist")
      expect(account?.customer_type).toBe("individual")
      // A business's shape is meaningless on a person and must not be invented.
      expect(account?.industry).toBeNull()
      expect(account?.company_size).toBeNull()
      expect(account?.website).toBeNull()

      const people = await contacts.listForCustomer(tx, id)
      expect(people).toHaveLength(1)
      expect(people[0].first_name).toBe("Amara")
      expect(people[0].last_name).toBe("Lindqvist")
      expect(people[0].is_primary).toBe(true)
    })
  })

  /**
   * The case `20261001100000_contact_email_optional.sql` exists for: a
   * walk-in client with a phone and no email. Before it, this was a NOT NULL
   * violation — a 500 with the form's contents gone.
   */
  it("accepts a client with no email at all", async () => {
    await inRollback(async (tx) => {
      const { id } = await customers.createIndividual(tx, NORTHWIND, {
        ...base,
        first_name: "Tomas",
        last_name: "Rautio",
        email: null,
        phone: "+358-40-555-0144",
      })

      const people = await contacts.listForCustomer(tx, id)
      expect(people).toHaveLength(1)
      expect(people[0].email).toBeNull()
      expect(people[0].phone).toBe("+358-40-555-0144")
    })
  })

  it("lets two clients both have no email — NULLs are distinct under the unique index", async () => {
    await inRollback(async (tx) => {
      await customers.createIndividual(tx, NORTHWIND, {
        ...base,
        first_name: "Tomas",
        last_name: "Rautio",
        email: null,
        phone: null,
      })
      await customers.createIndividual(tx, NORTHWIND, {
        ...base,
        first_name: "Ines",
        last_name: "Moreau",
        email: null,
        phone: null,
      })
    })
  })

  it("refuses a second client with an email already on file", async () => {
    await expect(
      inRollback(async (tx) => {
        await customers.createIndividual(tx, NORTHWIND, {
          ...base,
          first_name: "Dana",
          last_name: "Doppelganger",
          // Already Dana Whitcombe's, from the fixture.
          email: "dana.whitcombe@acme.example",
          phone: null,
        })
      }),
    ).rejects.toMatchObject({
      constraint_name: "customer_contacts_tenant_id_email_key",
    })
  })
})

describe("updateIndividual", () => {
  it("renames both rows, so the derived account name cannot drift", async () => {
    await inRollback(async (tx) => {
      const { id } = await customers.createIndividual(tx, NORTHWIND, {
        ...base,
        first_name: "Ines",
        last_name: "Moreau",
        email: null,
        phone: null,
      })

      const ok = await customers.updateIndividual(tx, id, {
        ...base,
        first_name: "Ines",
        last_name: "Moreau-Hart",
        email: "ines.moreau.hart@example.com",
        phone: "+33-1-55-55-0101",
      })
      expect(ok).toBe(true)

      const account = await customers.getById(tx, id)
      expect(account?.customer_name).toBe("Ines Moreau-Hart")
      expect(account?.email).toBe("ines.moreau.hart@example.com")

      const people = await contacts.listForCustomer(tx, id)
      expect(people).toHaveLength(1)
      expect(people[0].last_name).toBe("Moreau-Hart")
      // The account's copy of the address and the contact's must agree.
      expect(people[0].email).toBe(account?.email)
    })
  })

  it("reports that it did nothing rather than claiming success (L68)", async () => {
    await inRollback(async (tx) => {
      const absent = "00000000-0000-4000-8000-000000000000"
      expect(
        await customers.updateIndividual(tx, absent, {
          ...base,
          first_name: "Nobody",
          last_name: "Here",
          email: null,
          phone: null,
        }),
      ).toBe(false)
    })
  })
})
