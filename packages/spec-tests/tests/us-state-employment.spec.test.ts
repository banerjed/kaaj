import { describe, expect, it } from "vitest"
import {
  resolveEmploymentPacket,
  validatePacketResult,
} from "../src/assert-doc-packet.js"
import {
  findFixture,
  loadEmployeeFixtures,
  loadStateEmploymentCases,
  loadStateEmploymentRules,
  rulesForCase,
} from "../src/load-spec-cases.js"
import { noBroadWageIncomeTaxStates, usStatesAndDc } from "../src/states.js"

const cases = loadStateEmploymentCases()
const fixtures = loadEmployeeFixtures()
const rules = loadStateEmploymentRules()

describe("US state employment spec coverage", () => {
  it("has one baseline R0 hire case for every state and DC", () => {
    const coveredJurisdictions = new Set(
      cases.map((testCase) => testCase.jurisdiction.replace("US-", "")),
    )

    expect(coveredJurisdictions).toEqual(new Set(usStatesAndDc))
    expect(cases).toHaveLength(usStatesAndDc.length)
    expect(cases.every((testCase) => testCase.risk === "R0")).toBe(true)
  })

  it("has a worker fixture for every state and DC", () => {
    const fixtureStates = new Set(fixtures.map((fixture) => fixture.workState))

    expect(fixtureStates).toEqual(new Set(usStatesAndDc))
    expect(fixtures).toHaveLength(usStatesAndDc.length)
  })

  it("has state packet rules for every state and DC", () => {
    const ruleStates = new Set(
      rules
        .filter((rule) => rule.topic === "state-employment-packet")
        .map((rule) => rule.jurisdiction.replace("US-", "")),
    )

    expect(ruleStates).toEqual(new Set(usStatesAndDc))
  })
})

describe.each(cases)("state employment packet $id", (testCase) => {
  it("resolves the expected statutory packet documents and audit events", () => {
    const employee = findFixture(fixtures, testCase.fixture)
    const result = resolveEmploymentPacket(
      employee,
      rulesForCase(rules, testCase),
    )

    expect(validatePacketResult(testCase, result)).toEqual([])
  })

  it("keeps high-risk evidence dimensions attached to the case", () => {
    expect(testCase.testTypes).toEqual(
      expect.arrayContaining(["audit", "golden-file", "invariant", "unit"]),
    )
    expect(testCase.negativeCases.length).toBeGreaterThanOrEqual(3)
    expect(testCase.expectedAuditEvents).toContain("statutory_packet.generated")
    expect(testCase.expectedDocuments).toEqual(
      expect.arrayContaining(["Form I-9", "Federal Form W-4"]),
    )
  })
})

describe("US state withholding invariants", () => {
  it("does not require a state income-tax withholding certificate in no-broad-wage-income-tax states", () => {
    const noTaxStateCases = cases.filter((testCase) =>
      noBroadWageIncomeTaxStates.has(
        testCase.jurisdiction.replace(
          "US-",
          "",
        ) as (typeof usStatesAndDc)[number],
      ),
    )

    expect(noTaxStateCases).toHaveLength(noBroadWageIncomeTaxStates.size)
    expect(
      noTaxStateCases.flatMap((testCase) =>
        testCase.expectedDocuments.filter((document) =>
          document.includes("withholding certificate"),
        ),
      ),
    ).toEqual([])
  })

  it("requires explicit local tax review where the state test fixture has known local overlays", () => {
    const localOverlayStates = [
      "IN",
      "KY",
      "MD",
      "MI",
      "MO",
      "NY",
      "OH",
      "OR",
      "PA",
    ]

    for (const state of localOverlayStates) {
      const testCase = cases.find(
        (candidate) => candidate.jurisdiction === `US-${state}`,
      )

      expect(testCase?.negativeCases).toContain("local-tax-not-reevaluated")
      expect(
        testCase?.expectedDocuments.some(
          (document) =>
            document.includes("local") ||
            document.includes("county") ||
            document.includes("city") ||
            document.includes("municipal") ||
            document.includes("school district") ||
            document.includes("PSD") ||
            document.includes("transit") ||
            document.includes("NYC/Yonkers"),
        ),
      ).toBe(true)
    }
  })
})

describe("US state employment source governance", () => {
  it("keeps official federal source metadata attached to the federal baseline", () => {
    const federalRule = rules.find(
      (rule) => rule.ruleId === "US-FEDERAL-EMPLOYMENT-PACKET-001",
    )

    expect(federalRule).toMatchObject({
      verificationStatus: "official-source-verified",
      retrievedAt: "2026-08-29",
      sourceTitle: "USCIS Handbook for Employers M-274",
    })
    expect(federalRule?.sourceUrl).toContain("uscis.gov")
  })

  it("does not let planning state rules masquerade as source-verified law", () => {
    const stateRules = rules.filter(
      (rule) => rule.topic === "state-employment-packet",
    )

    expect(stateRules).toHaveLength(usStatesAndDc.length)
    expect(
      stateRules.every(
        (rule) =>
          rule.verificationStatus === "planning-needs-state-source-review",
      ),
    ).toBe(true)
  })

  it("requires effective dates, version labels, and source placeholders for every rule", () => {
    for (const rule of rules) {
      expect(rule.effectiveFrom).toMatch(/^\d{4}-\d{2}-\d{2}$/)
      expect(rule.retrievedAt).toMatch(/^\d{4}-\d{2}-\d{2}$/)
      expect(rule.sourceTitle.length).toBeGreaterThan(0)
      expect(rule.sourceUrl.length).toBeGreaterThan(0)
      expect(rule.versionLabel).toBe("planning-2026-08-29")
    }
  })
})
