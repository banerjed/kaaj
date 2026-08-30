export type Role =
  | "employee"
  | "manager"
  | "hr_admin"
  | "hr_director"
  | "payroll_admin"
  | "finance_admin"
  | "accountant"
  | "compliance_officer"
  | "auditor"
  | "marketing_admin"
  | "sales_manager"
  | "project_manager"
  | "it_admin"
  | "ai_assistant"
  | "system_job"
  | "external_client"

export type ResourceSensitivity =
  | "normal"
  | "pii"
  | "payroll"
  | "bank"
  | "medical"
  | "tax"
  | "immigration"
  | "legal"
  | "compensation"
  | "audit"
  | "financial"
  | "marketing"

export type ResourceType =
  | "employee_profile"
  | "employee_sensitive_field"
  | "employee_document"
  | "payroll_run"
  | "payroll_run_employee"
  | "pay_stub"
  | "tax_form"
  | "direct_deposit"
  | "compensation_record"
  | "compensation_worksheet"
  | "time_off_request"
  | "timesheet"
  | "change_request"
  | "performance_review"
  | "benefit_election"
  | "accounting_record"
  | "accounting_period"
  | "invoice"
  | "bill"
  | "bank_transaction"
  | "audit_log"
  | "data_export"
  | "marketing_contact"
  | "marketing_campaign"
  | "consent_record"
  | "crm_record"
  | "ticket"
  | "project"
  | "client_portal_record"
  | "ai_knowledge"
  | "user_role"
  | "firm_settings"
  | "system_job_batch"

export type SecurityAction =
  | "read"
  | "create"
  | "update"
  | "delete"
  | "approve"
  | "reject"
  | "run"
  | "finalize"
  | "export"
  | "generate"
  | "submit"
  | "ai_retrieve"
  | "manage"

export interface Actor {
  id: string
  tenantId: string
  role: Role
  permissions: string[]
  directReportIds?: string[]
  employeeId?: string
  departmentId?: string
  clientId?: string
  mfaSatisfied: boolean
}

export interface TenantRecord {
  id: string
  tenantId: string
  ownerEmployeeId?: string
  managerId?: string
}

export interface SensitiveResource extends TenantRecord {
  sensitivity: ResourceSensitivity
  fieldName: string
  value: string
}

export interface ProtectedResource extends SensitiveResource {
  resourceType: ResourceType
  departmentId?: string
  clientId?: string
  requestorId?: string
  approverIds?: string[]
  currentApproverId?: string
  worksheetManagerId?: string
  assignedUserId?: string
  requiredPermissions?: string[]
  legalHold?: boolean
  closedPeriod?: boolean
  submittedToProvider?: boolean
}

export interface AccessContext {
  fields?: string[]
  withinCompensationPlanningCycle?: boolean
  withinEnrollmentWindow?: boolean
  qualifyingLifeEvent?: boolean
  recordCount?: number
  hasApproval?: boolean
  hasReason?: boolean
  hasSupportingDocument?: boolean
  hasAuditEvent?: boolean
  sensitiveActionConfirmed?: boolean
  hasTenantContext?: boolean
  hasIdempotencyKey?: boolean
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

export function authorizeResourceAction(
  actor: Actor,
  resource: ProtectedResource,
  action: SecurityAction,
  context: AccessContext = {},
): AccessDecision {
  if (actor.tenantId !== resource.tenantId) {
    return denied()
  }

  const allowed = isAllowedInTenant(actor, resource, action, context)

  if (!allowed) {
    return denied()
  }

  const auditEvents = auditEventsFor(resource, action)
  const responseValue = responseValueFor(actor, resource, action)

  return {
    allowed: true,
    responseValue,
    auditEvents,
  }
}

export function maskBankAccount(value: string): string {
  const digits = value.replace(/\D/g, "")
  return `****${digits.slice(-4)}`
}

function isAllowedInTenant(
  actor: Actor,
  resource: ProtectedResource,
  action: SecurityAction,
  context: AccessContext,
): boolean {
  if (isHighSensitivity(resource) && !actor.mfaSatisfied) {
    return false
  }

  switch (resource.resourceType) {
    case "employee_profile":
      return canAccessEmployeeProfile(actor, resource, action, context)
    case "employee_sensitive_field":
      return canAccessSensitiveField(actor, resource, action, context)
    case "employee_document":
      return canAccessEmployeeDocument(actor, resource, action, context)
    case "direct_deposit":
      return canAccessDirectDeposit(actor, resource, action, context)
    case "payroll_run":
      return canAccessPayrollRun(actor, action)
    case "payroll_run_employee":
    case "pay_stub":
    case "tax_form":
      return canAccessEmployeePayrollEvidence(actor, resource, action)
    case "compensation_record":
      return canAccessCompensationRecord(actor, resource, action, context)
    case "compensation_worksheet":
      return canAccessCompensationWorksheet(actor, resource, action, context)
    case "time_off_request":
    case "timesheet":
      return canAccessManagerWorkflow(actor, resource, action)
    case "change_request":
      return canAccessChangeRequest(actor, resource, action, context)
    case "benefit_election":
      return canAccessBenefitElection(actor, resource, action, context)
    case "accounting_record":
    case "accounting_period":
    case "invoice":
    case "bill":
    case "bank_transaction":
      return canAccessAccounting(actor, resource, action, context)
    case "audit_log":
      return canAccessAuditLog(actor, action)
    case "data_export":
      return canAccessDataExport(actor, resource, action, context)
    case "marketing_contact":
    case "marketing_campaign":
    case "consent_record":
      return canAccessMarketing(actor, resource, action)
    case "crm_record":
      return canAccessCrm(actor, resource, action)
    case "ticket":
    case "project":
      return canAccessAssignedWork(actor, resource, action)
    case "client_portal_record":
      return canAccessClientPortal(actor, resource, action)
    case "ai_knowledge":
      return canAccessAiKnowledge(actor, resource, action)
    case "user_role":
      return canManageUserRole(actor, resource, action, context)
    case "firm_settings":
      return canAccessFirmSettings(actor, action)
    case "system_job_batch":
      return canRunSystemJobBatch(actor, action, context)
    default:
      return false
  }
}

function canAccessEmployeeProfile(
  actor: Actor,
  resource: ProtectedResource,
  action: SecurityAction,
  context: AccessContext,
): boolean {
  if (action === "read") {
    return (
      isSelf(actor, resource) || isDirectManager(actor, resource) || isHr(actor)
    )
  }

  if (action === "update") {
    if (isSelf(actor, resource)) {
      return fieldsWithin(context.fields, [
        "home_address",
        "personal_email",
        "personal_phone",
        "emergency_contact",
      ])
    }

    return isHr(actor) && !fieldsContain(context.fields, ["role"])
  }

  return false
}

function canAccessSensitiveField(
  actor: Actor,
  resource: ProtectedResource,
  action: SecurityAction,
  context: AccessContext,
): boolean {
  if (action !== "read" && action !== "update") {
    return false
  }

  if (action === "update") {
    if (fieldsContain(context.fields, ["salary", "manager", "role"])) {
      return actor.role === "hr_director" && context.hasApproval === true
    }

    return isHr(actor) && context.hasReason === true
  }

  if (
    isSelf(actor, resource) &&
    ["pii", "payroll", "tax"].includes(resource.sensitivity)
  ) {
    return true
  }

  if (actor.role === "payroll_admin") {
    return ["payroll", "bank", "tax", "compensation"].includes(
      resource.sensitivity,
    )
  }

  if (isHr(actor)) {
    return ["pii", "medical", "immigration", "legal", "compensation"].includes(
      resource.sensitivity,
    )
  }

  if (["compliance_officer", "auditor"].includes(actor.role)) {
    return context.hasReason === true
  }

  return false
}

function canAccessEmployeeDocument(
  actor: Actor,
  resource: ProtectedResource,
  action: SecurityAction,
  context: AccessContext,
): boolean {
  if (action === "read") {
    return (
      isSelf(actor, resource) ||
      isHr(actor) ||
      actor.role === "compliance_officer"
    )
  }

  if (action === "delete") {
    return (
      actor.role === "hr_admin" &&
      resource.legalHold !== true &&
      context.hasReason === true &&
      context.hasAuditEvent === true
    )
  }

  return false
}

function canAccessDirectDeposit(
  actor: Actor,
  resource: ProtectedResource,
  action: SecurityAction,
  context: AccessContext,
): boolean {
  if (action === "read") {
    return isSelf(actor, resource) || actor.role === "payroll_admin"
  }

  if (action === "update" || action === "create") {
    return (
      isSelf(actor, resource) &&
      resource.submittedToProvider !== true &&
      context.sensitiveActionConfirmed === true
    )
  }

  return false
}

function canAccessPayrollRun(actor: Actor, action: SecurityAction): boolean {
  if (["run", "finalize", "generate"].includes(action)) {
    return actor.permissions.includes(`payroll:runs:${action}`)
  }

  return (
    action === "read" &&
    ["payroll_admin", "finance_admin", "compliance_officer"].includes(
      actor.role,
    )
  )
}

function canAccessEmployeePayrollEvidence(
  actor: Actor,
  resource: ProtectedResource,
  action: SecurityAction,
): boolean {
  if (action !== "read" && action !== "generate") {
    return false
  }

  if (action === "generate") {
    return actor.role === "payroll_admin"
  }

  return (
    isSelf(actor, resource) ||
    actor.role === "payroll_admin" ||
    actor.role === "compliance_officer" ||
    actor.role === "auditor"
  )
}

function canAccessCompensationRecord(
  actor: Actor,
  resource: ProtectedResource,
  action: SecurityAction,
  context: AccessContext,
): boolean {
  if (action === "read") {
    return (
      isSelf(actor, resource) ||
      isHr(actor) ||
      actor.role === "payroll_admin" ||
      (isDirectManager(actor, resource) &&
        context.withinCompensationPlanningCycle === true)
    )
  }

  if (action === "update") {
    return isHr(actor) && context.hasApproval === true
  }

  return false
}

function canAccessCompensationWorksheet(
  actor: Actor,
  resource: ProtectedResource,
  action: SecurityAction,
  context: AccessContext,
): boolean {
  if (context.withinCompensationPlanningCycle !== true) {
    return false
  }

  if (action === "read" || action === "update") {
    return actor.id === resource.worksheetManagerId || isHr(actor)
  }

  if (action === "approve") {
    return actor.role === "hr_director" && resource.ownerEmployeeId !== actor.id
  }

  return false
}

function canAccessManagerWorkflow(
  actor: Actor,
  resource: ProtectedResource,
  action: SecurityAction,
): boolean {
  if (action === "read") {
    return (
      isSelf(actor, resource) || isDirectManager(actor, resource) || isHr(actor)
    )
  }

  if (action === "create" || action === "submit") {
    return isSelf(actor, resource)
  }

  if (action === "approve" || action === "reject") {
    return isDirectManager(actor, resource) && !isSelf(actor, resource)
  }

  return false
}

function canAccessChangeRequest(
  actor: Actor,
  resource: ProtectedResource,
  action: SecurityAction,
  context: AccessContext,
): boolean {
  if (action === "read") {
    return (
      isSelf(actor, resource) ||
      resource.approverIds?.includes(actor.id) === true ||
      isHr(actor)
    )
  }

  if (action === "submit") {
    if (!isSelf(actor, resource)) {
      return false
    }

    if (fieldsContain(context.fields, ["salary", "manager", "role"])) {
      return false
    }

    if (fieldsContain(context.fields, ["name", "ssn", "bank_account"])) {
      return context.hasSupportingDocument === true
    }

    return true
  }

  if (action === "approve" || action === "reject") {
    return resource.currentApproverId === actor.id && !isSelf(actor, resource)
  }

  return false
}

function canAccessBenefitElection(
  actor: Actor,
  resource: ProtectedResource,
  action: SecurityAction,
  context: AccessContext,
): boolean {
  if (action === "read") {
    return isSelf(actor, resource) || isHr(actor)
  }

  if (action === "submit" || action === "update") {
    return (
      isSelf(actor, resource) &&
      (context.withinEnrollmentWindow === true ||
        context.qualifyingLifeEvent === true)
    )
  }

  return false
}

function canAccessAccounting(
  actor: Actor,
  resource: ProtectedResource,
  action: SecurityAction,
  context: AccessContext,
): boolean {
  if (!["accountant", "finance_admin", "auditor"].includes(actor.role)) {
    return false
  }

  if (action === "read" || action === "export") {
    return true
  }

  if (actor.role === "auditor") {
    return false
  }

  if (resource.closedPeriod === true) {
    return context.hasApproval === true && context.hasReason === true
  }

  return ["create", "update", "delete", "approve", "finalize"].includes(action)
}

function canAccessAuditLog(actor: Actor, action: SecurityAction): boolean {
  return (
    action === "read" &&
    actor.mfaSatisfied &&
    ["hr_director", "compliance_officer", "auditor"].includes(actor.role)
  )
}

function canAccessDataExport(
  actor: Actor,
  resource: ProtectedResource,
  action: SecurityAction,
  context: AccessContext,
): boolean {
  if (action !== "export") {
    return false
  }

  if (isSelf(actor, resource) && (context.recordCount ?? 0) <= 1) {
    return true
  }

  if (!["hr_director", "compliance_officer"].includes(actor.role)) {
    return false
  }

  if ((context.recordCount ?? 0) > 100) {
    return context.hasApproval === true && context.hasReason === true
  }

  return context.hasReason === true
}

function canAccessMarketing(
  actor: Actor,
  resource: ProtectedResource,
  action: SecurityAction,
): boolean {
  if (
    resource.sensitivity !== "marketing" &&
    resource.sensitivity !== "normal"
  ) {
    return false
  }

  return (
    actor.role === "marketing_admin" &&
    ["read", "create", "update", "delete", "submit", "export"].includes(action)
  )
}

function canAccessCrm(
  actor: Actor,
  resource: ProtectedResource,
  action: SecurityAction,
): boolean {
  if (
    resource.sensitivity !== "normal" &&
    resource.sensitivity !== "marketing"
  ) {
    return false
  }

  return (
    ["sales_manager", "marketing_admin"].includes(actor.role) &&
    ["read", "create", "update", "export"].includes(action)
  )
}

function canAccessAssignedWork(
  actor: Actor,
  resource: ProtectedResource,
  action: SecurityAction,
): boolean {
  if (action !== "read" && action !== "update") {
    return false
  }

  return (
    resource.assignedUserId === actor.id ||
    actor.role === "project_manager" ||
    actor.role === "hr_admin"
  )
}

function canAccessClientPortal(
  actor: Actor,
  resource: ProtectedResource,
  action: SecurityAction,
): boolean {
  return (
    actor.role === "external_client" &&
    actor.clientId === resource.clientId &&
    action === "read"
  )
}

function canAccessAiKnowledge(
  actor: Actor,
  resource: ProtectedResource,
  action: SecurityAction,
): boolean {
  if (action !== "ai_retrieve") {
    return false
  }

  return (
    actor.role === "ai_assistant" &&
    (resource.requiredPermissions ?? []).every((permission) =>
      actor.permissions.includes(permission),
    )
  )
}

function canManageUserRole(
  actor: Actor,
  resource: ProtectedResource,
  action: SecurityAction,
  context: AccessContext,
): boolean {
  return (
    action === "manage" &&
    actor.mfaSatisfied &&
    ["hr_director", "it_admin"].includes(actor.role) &&
    resource.ownerEmployeeId !== actor.id &&
    context.hasReason === true &&
    context.hasAuditEvent === true
  )
}

function canAccessFirmSettings(actor: Actor, action: SecurityAction): boolean {
  if (action === "read") {
    return actor.role !== "external_client"
  }

  return (
    action === "manage" &&
    ["hr_director", "it_admin", "finance_admin"].includes(actor.role)
  )
}

function canRunSystemJobBatch(
  actor: Actor,
  action: SecurityAction,
  context: AccessContext,
): boolean {
  return (
    actor.role === "system_job" &&
    action === "run" &&
    actor.permissions.includes("system:jobs:run") &&
    context.hasTenantContext === true &&
    context.hasIdempotencyKey === true &&
    context.hasAuditEvent === true
  )
}

function responseValueFor(
  actor: Actor,
  resource: ProtectedResource,
  action: SecurityAction,
): string | null {
  if (action !== "read" && action !== "export" && action !== "ai_retrieve") {
    return null
  }

  if (resource.sensitivity === "bank") {
    return maskBankAccount(resource.value)
  }

  if (
    ["auditor", "compliance_officer"].includes(actor.role) &&
    isHighSensitivity(resource)
  ) {
    return "[REDACTED]"
  }

  return resource.value
}

function auditEventsFor(
  resource: ProtectedResource,
  action: SecurityAction,
): string[] {
  if (
    isHighSensitivity(resource) &&
    ["read", "export", "ai_retrieve"].includes(action)
  ) {
    return [`sensitive.${resource.sensitivity}.${action}`]
  }

  if (
    [
      "update",
      "delete",
      "approve",
      "reject",
      "run",
      "finalize",
      "manage",
    ].includes(action)
  ) {
    return [`${resource.resourceType}.${action}`]
  }

  return []
}

function isSelf(actor: Actor, resource: TenantRecord): boolean {
  return (
    actor.id === resource.ownerEmployeeId ||
    actor.employeeId === resource.ownerEmployeeId
  )
}

function isDirectManager(actor: Actor, resource: TenantRecord): boolean {
  return (
    resource.managerId === actor.id ||
    actor.directReportIds?.includes(resource.ownerEmployeeId ?? "") === true
  )
}

function isHr(actor: Actor): boolean {
  return actor.role === "hr_admin" || actor.role === "hr_director"
}

function isHighSensitivity(resource: SensitiveResource): boolean {
  return (
    resource.sensitivity !== "normal" && resource.sensitivity !== "marketing"
  )
}

function fieldsWithin(
  fields: string[] | undefined,
  allowed: string[],
): boolean {
  return (
    fields !== undefined && fields.every((field) => allowed.includes(field))
  )
}

function fieldsContain(
  fields: string[] | undefined,
  denied: string[],
): boolean {
  return fields?.some((field) => denied.includes(field)) === true
}

function denied(): AccessDecision {
  return {
    allowed: false,
    responseValue: null,
    auditEvents: [],
  }
}
