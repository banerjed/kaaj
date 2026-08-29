export type RiskLevel = "R0" | "R1" | "R2" | "R3"

export type TestType =
  | "unit"
  | "workflow"
  | "invariant"
  | "golden-file"
  | "permission"
  | "audit"
  | "integration-contract"
  | "migration"

export interface RequirementCase {
  id: string
  source: string
  risk: RiskLevel
  jurisdiction: string
  fixture: string
  ruleVersion: string
  expectedDocuments: string[]
  expectedAuditEvents: string[]
  negativeCases: string[]
  testTypes: TestType[]
}

export interface StateEmploymentRule {
  ruleId: string
  jurisdiction: string
  topic: string
  verificationStatus:
    "official-source-verified" | "planning-needs-state-source-review"
  sourceUrl: string
  sourceTitle: string
  retrievedAt: string
  effectiveFrom: string
  effectiveTo: string | null
  versionLabel: string
  applicability: {
    employmentTypes?: string[]
    residenceStates?: string[]
    workStates?: string[]
    primaryLanguages?: string[]
    minimumEmployerSize?: number
    maximumEmployerSize?: number
    localities?: string[]
  }
  expectedDocuments: string[]
  expectedDataFields: string[]
}

export interface EmployeeFixture {
  id: string
  legalName: string
  employmentType: string
  exemptStatus: "exempt" | "nonexempt"
  residenceState: string
  workState: string
  residenceLocality?: string
  workLocality?: string
  primaryLanguage: string
  employerSize: number
  hireDate: string
  rehireAfterDays?: number
  remote: boolean
}

export interface PacketResult {
  documents: string[]
  auditEvents: string[]
  missingSourceRules: string[]
}
