import { describe, it, expect } from "vitest"
import {
  sanitizeEmail,
  sanitizePAN,
  sanitizeIFSC,
  sanitizeIBAN,
  sanitizeUKNIN,
  validateEnum,
} from "../src/index.js"

// These encode real jurisdictional rules, which is precisely why they cannot be
// reimplemented per-platform (ADR-004). Each case below is a rule, not a format.

describe("email", () => {
  it("trims and lowercases", () => {
    expect(sanitizeEmail(" Jane.Doe@Example.COM ").value).toBe(
      "jane.doe@example.com",
    )
  })
  it("rejects a malformed address", () => {
    expect(sanitizeEmail("not-an-email").valid).toBe(false)
  })
})

describe("India PAN", () => {
  it("accepts AAAAA9999A with a valid holder-type character", () => {
    expect(sanitizePAN("abcpe1234f").valid).toBe(true)
  })
  it("rejects a valid-looking PAN whose 4th character is not a holder type", () => {
    // 'D' is not one of P/C/H/F/A/T/B/L/J/G — shape alone is not enough.
    expect(sanitizePAN("ABCDE1234F").valid).toBe(false)
  })
})

describe("India IFSC", () => {
  it("accepts a well-formed code", () => {
    expect(sanitizeIFSC("hdfc0001234").valid).toBe(true)
  })
})

describe("IBAN", () => {
  it("accepts a valid IBAN with its checksum", () => {
    expect(sanitizeIBAN("GB82 WEST 1234 5698 7654 32").valid).toBe(true)
  })
  it("rejects one whose checksum does not compute", () => {
    expect(sanitizeIBAN("GB82WEST12345698765433").valid).toBe(false)
  })
})

describe("UK NIN", () => {
  it("rejects a disallowed prefix", () => {
    expect(sanitizeUKNIN("BG123456C").valid).toBe(false)
  })
})

describe("validateEnum", () => {
  it("names the permitted values when rejecting", () => {
    const r = validateEnum(
      "nope",
      ["full_time", "part_time"],
      "employment_type",
    )
    expect(r.valid).toBe(false)
    expect(r.errors[0]).toContain("full_time")
  })
})
