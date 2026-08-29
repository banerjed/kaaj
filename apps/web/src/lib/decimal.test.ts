import { describe, expect, it } from "vitest"
import { compareDecimal, isNegative } from "./decimal"

describe("compareDecimal", () => {
  it("orders by magnitude, not by string", () => {
    expect(compareDecimal("9", "10")).toBe(-1)
    expect(compareDecimal("100", "99.99")).toBe(1)
    expect(compareDecimal("007", "7")).toBe(0)
  })

  it("aligns fractions of different lengths", () => {
    expect(compareDecimal("1.5", "1.50")).toBe(0)
    expect(compareDecimal("1.5", "1.45")).toBe(1)
    expect(compareDecimal("1.05", "1.5")).toBe(-1)
  })

  it("orders negatives the other way round", () => {
    expect(compareDecimal("-9", "-1")).toBe(-1)
    expect(compareDecimal("-1", "1")).toBe(-1)
    expect(compareDecimal("-0", "0")).toBe(0)
    expect(isNegative("-0.01")).toBe(true)
    expect(isNegative("0.00")).toBe(false)
  })

  it("stays exact past 2^53, which is the entire point", () => {
    // Number() collapses these two to the same float64.
    expect(compareDecimal("9007199254740993.00", "9007199254740992.00")).toBe(1)
    expect(Number("9007199254740993.00")).toBe(Number("9007199254740992.00"))
  })

  it("compares INR at crore scale exactly", () => {
    expect(compareDecimal("12345678.91", "12345678.90")).toBe(1)
    expect(compareDecimal("14230000.00", "14230000.00")).toBe(0)
  })
})
