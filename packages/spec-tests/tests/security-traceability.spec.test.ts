import { describe, expect, it } from "vitest"
import {
  executableSecurityCaseIds,
  securityTraceabilityRequirements,
} from "../fixtures/security-traceability.js"

describe("security traceability", () => {
  it("keeps every documented security category mapped to executable cases", () => {
    for (const requirement of securityTraceabilityRequirements) {
      for (const prefix of requirement.casePrefixes) {
        expect(
          executableSecurityCaseIds.some((caseId) =>
            caseId.startsWith(`${prefix}-`),
          ),
          `${requirement.testPlanSection} is missing ${prefix} cases`,
        ).toBe(true)
      }
    }
  })

  it("keeps executable security case IDs unique", () => {
    expect(new Set(executableSecurityCaseIds).size).toBe(
      executableSecurityCaseIds.length,
    )
  })

  it("keeps the traceability manifest broad enough for CI governance", () => {
    expect(
      securityTraceabilityRequirements.map((item) => item.testPlanSection),
    ).toEqual([
      "Tenant Isolation",
      "Field-Level Security",
      "Document Security",
      "Payroll And Bank Security",
      "Compensation Security",
      "Workflow And Approval Security",
      "Benefits And Medical Security",
      "Accounting And Finance Security",
      "Audit Log Security",
      "Export And Reporting Security",
      "Marketing And Consent Security",
      "AI Assistant Security",
      "Client Portal Security",
      "Role Management And Session Security",
      "Failure-Mode Checks",
    ])
  })
})
