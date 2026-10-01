import { describe, expect, it } from "vitest"
import { has, hasAny } from "./permissions"

describe("has", () => {
  it("is true only for a permission actually held", () => {
    expect(has(["crm.read", "crm.write"], "crm.write")).toBe(true)
    expect(has(["crm.read"], "crm.write")).toBe(false)
  })

  it("fails closed on a missing list rather than throwing", () => {
    expect(has(undefined, "crm.write")).toBe(false)
    expect(has([], "crm.write")).toBe(false)
  })

  it("does not match on a prefix — crm.read must never satisfy crm.read.all", () => {
    expect(has(["crm.read"], "crm.read.all")).toBe(false)
  })
})

describe("hasAny", () => {
  it("is true when any one is held", () => {
    expect(
      hasAny(
        ["ticketing.read.own"],
        "ticketing.read.all",
        "ticketing.read.own",
      ),
    ).toBe(true)
  })

  it("is false when none is, and when nothing was asked for", () => {
    expect(hasAny(["crm.read"], "crm.write", "crm.admin")).toBe(false)
    expect(hasAny(["crm.read"])).toBe(false)
  })
})
