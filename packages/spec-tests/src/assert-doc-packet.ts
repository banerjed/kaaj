import type {
  EmployeeFixture,
  PacketResult,
  RequirementCase,
  StateEmploymentRule,
} from "./requirement-schema.js"

export function resolveEmploymentPacket(
  employee: EmployeeFixture,
  rules: StateEmploymentRule[],
): PacketResult {
  const applicableRules = rules.filter((rule) =>
    appliesToEmployee(rule, employee),
  )

  return {
    documents: uniqueSorted(
      applicableRules.flatMap((rule) => rule.expectedDocuments),
    ),
    auditEvents: ["statutory_packet.generated"],
    missingSourceRules: applicableRules
      .filter((rule) => !rule.sourceUrl || !rule.retrievedAt)
      .map((rule) => rule.ruleId),
  }
}

export function validatePacketResult(
  testCase: RequirementCase,
  result: PacketResult,
): string[] {
  const failures: string[] = []

  for (const document of testCase.expectedDocuments) {
    if (!result.documents.includes(document)) {
      failures.push(`missing expected document ${document}`)
    }
  }

  for (const event of testCase.expectedAuditEvents) {
    if (!result.auditEvents.includes(event)) {
      failures.push(`missing expected audit event ${event}`)
    }
  }

  for (const ruleId of result.missingSourceRules) {
    failures.push(`rule ${ruleId} is missing source metadata`)
  }

  return failures
}

function appliesToEmployee(
  rule: StateEmploymentRule,
  employee: EmployeeFixture,
): boolean {
  const applicability = rule.applicability

  return (
    matches(applicability.employmentTypes, employee.employmentType) &&
    matches(applicability.residenceStates, employee.residenceState) &&
    matches(applicability.workStates, employee.workState) &&
    matches(applicability.primaryLanguages, employee.primaryLanguage) &&
    matches(applicability.localities, employee.workLocality) &&
    aboveMinimum(applicability.minimumEmployerSize, employee.employerSize) &&
    belowMaximum(applicability.maximumEmployerSize, employee.employerSize)
  )
}

function matches(
  values: string[] | undefined,
  value: string | undefined,
): boolean {
  return values === undefined || (value !== undefined && values.includes(value))
}

function aboveMinimum(minimum: number | undefined, value: number): boolean {
  return minimum === undefined || value >= minimum
}

function belowMaximum(maximum: number | undefined, value: number): boolean {
  return maximum === undefined || value <= maximum
}

function uniqueSorted(values: string[]): string[] {
  return Array.from(new Set(values)).sort()
}
