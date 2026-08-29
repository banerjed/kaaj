import employeeFixtures from "../fixtures/employees-us.json" with { type: "json" }
import stateEmploymentCases from "../requirements/us-state-employment.json" with { type: "json" }
import type {
  EmployeeFixture,
  RequirementCase,
  StateEmploymentRule,
} from "./requirement-schema.js"

export function loadStateEmploymentCases(): RequirementCase[] {
  return stateEmploymentCases as RequirementCase[]
}

export function loadEmployeeFixtures(): EmployeeFixture[] {
  return employeeFixtures as EmployeeFixture[]
}

export function loadStateEmploymentRules(): StateEmploymentRule[] {
  return [
    {
      ruleId: "US-FEDERAL-EMPLOYMENT-PACKET-001",
      jurisdiction: "US",
      topic: "federal-employment-packet",
      verificationStatus: "official-source-verified",
      sourceUrl:
        "https://www.uscis.gov/i-9-central/form-i-9-resources/handbook-for-employers-m-274",
      sourceTitle: "USCIS Handbook for Employers M-274",
      retrievedAt: "2026-08-29",
      effectiveFrom: "2026-01-01",
      effectiveTo: null,
      versionLabel: "planning-2026-08-29",
      applicability: {},
      expectedDocuments: ["Form I-9", "Federal Form W-4"],
      expectedDataFields: [
        "employmentType",
        "hireDate",
        "legalName",
        "primaryLanguage",
      ],
    },
    ...loadStateEmploymentCases().map(toStateRule),
  ]
}

export function findFixture(
  fixtures: EmployeeFixture[],
  fixtureId: string,
): EmployeeFixture {
  const fixture = fixtures.find((candidate) => candidate.id === fixtureId)

  if (!fixture) {
    throw new Error(`Missing fixture ${fixtureId}`)
  }

  return fixture
}

export function rulesForCase(
  rules: StateEmploymentRule[],
  testCase: RequirementCase,
): StateEmploymentRule[] {
  return rules.filter((rule) => rule.versionLabel === testCase.ruleVersion)
}

function toStateRule(testCase: RequirementCase): StateEmploymentRule {
  const state = testCase.jurisdiction.replace("US-", "")

  return {
    ruleId: `${testCase.jurisdiction}-EMPLOYMENT-PACKET-001`,
    jurisdiction: testCase.jurisdiction,
    topic: "state-employment-packet",
    verificationStatus: "planning-needs-state-source-review",
    sourceUrl:
      "docs/testplan-us-state-employment.md#all-state-source-registry-requirement",
    sourceTitle: `${state} statutory employment packet planning registry`,
    retrievedAt: "2026-08-29",
    effectiveFrom: "2026-01-01",
    effectiveTo: null,
    versionLabel: testCase.ruleVersion,
    applicability: {
      workStates: [state],
    },
    expectedDocuments: testCase.expectedDocuments.filter(
      (document) => document !== "Form I-9" && document !== "Federal Form W-4",
    ),
    expectedDataFields: [
      "employerSize",
      "employmentType",
      "exemptStatus",
      "hireDate",
      "primaryLanguage",
      "residenceLocality",
      "residenceState",
      "workLocality",
      "workState",
    ],
  }
}
