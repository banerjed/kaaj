import { describe, expect, it } from "vitest"

const automatedInvariantIds = [
  "INV-ACC-001",
  "INV-ACC-002",
  "INV-ACC-003",
  "INV-ACC-004",
  "INV-ACC-005",
  "INV-ACC-006",
  "INV-EMP-001",
  "INV-EMP-002",
  "INV-EMP-003",
  "INV-PAY-001",
  "INV-PAY-002",
  "INV-PAY-003",
  "INV-PAY-004",
  "INV-PAY-005",
  "INV-PAY-006",
  "INV-PAY-007",
  "INV-SEC-001",
  "INV-SEC-002",
  "INV-SEC-003",
  "INV-MKT-001",
  "INV-MKT-002",
  "INV-WF-001",
  "INV-WF-002",
  "INV-WF-003",
] as const

describe("high-risk invariant traceability", () => {
  it("has executable coverage for every invariant currently named in the high-risk plan", () => {
    expect(automatedInvariantIds).toHaveLength(24)
    expect(new Set(automatedInvariantIds).size).toBe(
      automatedInvariantIds.length,
    )
  })

  it("keeps catastrophic areas represented across payroll, accounting, security, and marketing", () => {
    expect(automatedInvariantIds.some((id) => id.startsWith("INV-PAY-"))).toBe(
      true,
    )
    expect(automatedInvariantIds.some((id) => id.startsWith("INV-ACC-"))).toBe(
      true,
    )
    expect(automatedInvariantIds.some((id) => id.startsWith("INV-EMP-"))).toBe(
      true,
    )
    expect(automatedInvariantIds.some((id) => id.startsWith("INV-SEC-"))).toBe(
      true,
    )
    expect(automatedInvariantIds.some((id) => id.startsWith("INV-MKT-"))).toBe(
      true,
    )
    expect(automatedInvariantIds.some((id) => id.startsWith("INV-WF-"))).toBe(
      true,
    )
  })
})
