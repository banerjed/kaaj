export type Role =
  | "employee"
  | "manager"
  | "hr_admin"
  | "hr_director"
  | "payroll_admin"
  | "finance_admin"
  | "compliance_officer"
  | "auditor"
  | "external_client"

export interface Actor {
  id: string
  tenantId: string
  role: Role
  permissions: string[]
  directReportIds?: string[]
  mfaSatisfied: boolean
}

export interface TenantRecord {
  id: string
  tenantId: string
  ownerEmployeeId?: string
  managerId?: string
}

export interface SensitiveResource extends TenantRecord {
  sensitivity:
    | "normal"
    | "pii"
    | "payroll"
    | "bank"
    | "medical"
    | "tax"
    | "immigration"
    | "legal"
  fieldName: string
  value: string
}

export interface AccessDecision {
  allowed: boolean
  responseValue: string | null
  auditEvents: string[]
}

export function filterTenantRecords<T extends TenantRecord>(
  actor: Actor,
  records: T[],
): T[] {
  return records.filter((record) => record.tenantId === actor.tenantId)
}

export function authorizeSensitiveRead(
  actor: Actor,
  resource: SensitiveResource,
): AccessDecision {
  if (actor.tenantId !== resource.tenantId) {
    return denied()
  }

  if (resource.sensitivity === "normal") {
    return {
      allowed: true,
      responseValue: resource.value,
      auditEvents: [],
    }
  }

  const selfRead =
    actor.id === resource.ownerEmployeeId &&
    ["pii", "payroll", "tax"].includes(resource.sensitivity)
  const managerRead =
    actor.role === "manager" &&
    actor.directReportIds?.includes(resource.ownerEmployeeId ?? "") === true &&
    resource.sensitivity !== "bank" &&
    resource.sensitivity !== "medical" &&
    resource.sensitivity !== "tax" &&
    resource.sensitivity !== "immigration"
  const privilegedRead =
    actor.permissions.includes(`sensitive:${resource.sensitivity}:read`) ||
    actor.permissions.includes("sensitive:all:read")

  if ((selfRead || managerRead || privilegedRead) && actor.mfaSatisfied) {
    return {
      allowed: true,
      responseValue:
        resource.sensitivity === "bank"
          ? maskBankAccount(resource.value)
          : resource.value,
      auditEvents: [`sensitive.${resource.sensitivity}.read`],
    }
  }

  return denied()
}

export function maskBankAccount(value: string): string {
  const digits = value.replace(/\D/g, "")
  return `****${digits.slice(-4)}`
}

function denied(): AccessDecision {
  return {
    allowed: false,
    responseValue: null,
    auditEvents: [],
  }
}
