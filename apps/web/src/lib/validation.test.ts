import { describe, it, expect } from "vitest"
import { sanitizeEmail, sanitizePAN, validateEnum } from "@kaaj/validation"

// Proves the workspace package resolves at RUNTIME from inside the app, not
// merely that TypeScript is satisfied. If @kaaj/validation is ever wired up
// incorrectly this fails loudly rather than silently resolving to nothing.
//
// Every function returns { valid, value, errors } — never a bare string.
describe("@kaaj/validation resolves from apps/web", () => {
  it("normalises an email", () => {
    const r = sanitizeEmail("  Jane.Doe@Example.COM ")
    expect(r.valid).toBe(true)
    expect(r.value).toBe("jane.doe@example.com")
  })

  it("accepts a well-formed Indian PAN", () => {
    // The 4th character encodes holder type — P for an individual. "ABCDE1234F"
    // matches the AAAAA9999A shape but has 'D' there, which the validator
    // correctly rejects. That domain rule is exactly why this code cannot be
    // reimplemented per-platform.
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
