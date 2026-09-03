import { describe, it, expect } from "vitest"
import { sanitizeEmail, sanitizePAN, validateEnum } from "@kaaj/validation"

// Proves @kaaj/validation resolves at RUNTIME, not just for TypeScript.
// Every function returns { valid, value, errors } — never a bare string.
describe("@kaaj/validation resolves from apps/web", () => {
  it("normalises an email", () => {
    const r = sanitizeEmail("  Jane.Doe@Example.COM ")
    expect(r.valid).toBe(true)
    expect(r.value).toBe("jane.doe@example.com")
  })

  it("accepts a well-formed Indian PAN", () => {
    // 4th char encodes holder type (P = individual) — a domain rule, not just shape.
    const r = sanitizePAN("abcpe1234f")
    expect(r.valid).toBe(true)
    expect(r.value).toBe("ABCPE1234F")
  })

  it("reports errors rather than throwing on a bad PAN", () => {
    const r = sanitizePAN("not-a-pan")
    expect(r.valid).toBe(false)
    expect(r.errors.length).toBeGreaterThan(0)
  })

  it("rejects a value outside an enumeration", () => {
    const r = validateEnum(
      "nope",
      ["full_time", "part_time"],
      "employment_type",
    )
    expect(r.valid).toBe(false)
    expect(r.errors[0]).toContain("full_time")
  })
})
