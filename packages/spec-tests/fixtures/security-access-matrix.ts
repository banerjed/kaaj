import type {
  AccessContext,
  Actor,
  ProtectedResource,
  SecurityAction,
} from "../src/security.js"

type SecurityAccessCase = {
  id: string
  sourceRequirements: string[]
  actor: Actor
  resource: ProtectedResource
  action: SecurityAction
  context?: AccessContext
  expected: {
    allowed: boolean
    responseValue?: string | null
    auditEvent?: string
  }
}

const tenant = "TENANT-A"
const otherTenant = "TENANT-B"

const actors = {
  employee: actor("EMP-001", "employee", []),
  peerEmployee: actor("EMP-002", "employee", []),
  manager: actor("MGR-001", "manager", [], { directReportIds: ["EMP-001"] }),
  otherManager: actor("MGR-002", "manager", []),
  hrAdmin: actor("HR-001", "hr_admin", []),
  hrDirector: actor("HRD-001", "hr_director", []),
  payrollAdmin: actor("PAY-001", "payroll_admin", [
    "payroll:runs:run",
    "payroll:runs:finalize",
  ]),
  financeAdmin: actor("FIN-001", "finance_admin", []),
  accountant: actor("ACC-001", "accountant", []),
  compliance: actor("COMP-001", "compliance_officer", []),
  auditor: actor("AUD-001", "auditor", []),
  marketingAdmin: actor("MKT-001", "marketing_admin", []),
  salesManager: actor("SALES-001", "sales_manager", []),
  projectManager: actor("PM-001", "project_manager", []),
  itAdmin: actor("IT-001", "it_admin", []),
  aiWithPermission: actor("AI-001", "ai_assistant", ["hr:timeoff:read:self"]),
  aiWithoutPermission: actor("AI-002", "ai_assistant", []),
  systemJob: actor("JOB-001", "system_job", ["system:jobs:run"]),
  externalClient: actor("CLIENT-USER-001", "external_client", [], {
    clientId: "CLIENT-001",
  }),
  otherTenantHrDirector: actor("HRD-OTHER", "hr_director", [], {
    tenantId: otherTenant,
  }),
}

const resources = {
  ownProfile: resource("employee_profile", "normal", "EMP-001", {
    value: "Own employee profile",
  }),
  peerProfile: resource("employee_profile", "normal", "EMP-002", {
    value: "Peer employee profile",
    managerId: "MGR-002",
  }),
  directReportProfile: resource("employee_profile", "normal", "EMP-001", {
    value: "Direct report profile",
    managerId: "MGR-001",
  }),
  salary: resource("employee_sensitive_field", "payroll", "EMP-001", {
    fieldName: "salary",
    value: "125000.00",
    managerId: "MGR-001",
  }),
  ssn: resource("employee_sensitive_field", "pii", "EMP-001", {
    fieldName: "ssn",
    value: "123-45-6789",
    managerId: "MGR-001",
  }),
  peerSsn: resource("employee_sensitive_field", "pii", "EMP-002", {
    fieldName: "ssn",
    value: "987-65-4321",
    managerId: "MGR-002",
  }),
  bankAccount: resource("employee_sensitive_field", "bank", "EMP-001", {
    fieldName: "bank_account_number",
    value: "123456789012",
  }),
  peerBankAccount: resource("employee_sensitive_field", "bank", "EMP-002", {
    fieldName: "bank_account_number",
    value: "987654321098",
  }),
  medicalDoc: resource("employee_document", "medical", "EMP-001", {
    fieldName: "document",
    value: "ADA accommodation record",
  }),
  peerMedicalDoc: resource("employee_document", "medical", "EMP-002", {
    fieldName: "document",
    value: "Peer ADA accommodation record",
  }),
  i9Doc: resource("employee_document", "immigration", "EMP-001", {
    fieldName: "document",
    value: "I-9 packet",
  }),
  peerI9Doc: resource("employee_document", "immigration", "EMP-002", {
    fieldName: "document",
    value: "Peer I-9 packet",
  }),
  legalHoldDoc: resource("employee_document", "legal", "EMP-001", {
    fieldName: "document",
    value: "litigation hold document",
    legalHold: true,
  }),
  directDeposit: resource("direct_deposit", "bank", "EMP-001", {
    value: "123456789012",
  }),
  submittedDirectDeposit: resource("direct_deposit", "bank", "EMP-001", {
    value: "123456789012",
    submittedToProvider: true,
  }),
  payrollRun: resource("payroll_run", "payroll", undefined, {
    value: "March payroll run",
  }),
  ownPayStub: resource("pay_stub", "payroll", "EMP-001", {
    value: "Pay stub",
  }),
  peerPayStub: resource("pay_stub", "payroll", "EMP-002", {
    value: "Peer pay stub",
  }),
  taxForm: resource("tax_form", "tax", "EMP-001", {
    value: "W-2",
  }),
  compensationRecord: resource(
    "compensation_record",
    "compensation",
    "EMP-001",
    {
      value: "Current salary",
      managerId: "MGR-001",
    },
  ),
  compensationWorksheet: resource(
    "compensation_worksheet",
    "compensation",
    "EMP-001",
    {
      value: "Comp worksheet",
      worksheetManagerId: "MGR-001",
    },
  ),
  timeOffRequest: resource("time_off_request", "normal", "EMP-001", {
    value: "Time off request",
    managerId: "MGR-001",
  }),
  timesheet: resource("timesheet", "normal", "EMP-001", {
    value: "Timesheet",
    managerId: "MGR-001",
  }),
  changeRequest: resource("change_request", "pii", "EMP-001", {
    value: "Name change request",
    currentApproverId: "MGR-001",
    approverIds: ["MGR-001", "HR-001"],
  }),
  peerChangeRequest: resource("change_request", "pii", "EMP-002", {
    value: "Peer name change request",
    currentApproverId: "MGR-002",
    approverIds: ["MGR-002", "HR-001"],
  }),
  peerPerformanceReview: resource("performance_review", "pii", "EMP-002", {
    value: "Peer performance review",
    managerId: "MGR-002",
  }),
  benefitElection: resource("benefit_election", "medical", "EMP-001", {
    value: "Medical plan election",
  }),
  peerBenefitElection: resource("benefit_election", "medical", "EMP-002", {
    value: "Peer medical plan election",
  }),
  accountingRecord: resource("accounting_record", "financial", undefined, {
    value: "Journal entry",
  }),
  closedAccountingRecord: resource(
    "accounting_record",
    "financial",
    undefined,
    {
      value: "Closed-period journal entry",
      closedPeriod: true,
    },
  ),
  auditLog: resource("audit_log", "audit", undefined, {
    value: "Audit event",
  }),
  dataExport: resource("data_export", "pii", "EMP-001", {
    value: "Employee export",
  }),
  marketingContact: resource("marketing_contact", "marketing", undefined, {
    value: "Marketing contact",
  }),
  marketingCampaign: resource("marketing_campaign", "marketing", undefined, {
    value: "Marketing campaign",
  }),
  consentRecord: resource("consent_record", "marketing", undefined, {
    value: "Consent history",
  }),
  crmRecord: resource("crm_record", "normal", undefined, {
    value: "Sales opportunity",
    assignedUserId: "SALES-001",
  }),
  ticket: resource("ticket", "normal", undefined, {
    value: "Assigned ticket",
    assignedUserId: "EMP-001",
  }),
  clientRecord: resource("client_portal_record", "normal", undefined, {
    value: "Client invoice",
    clientId: "CLIENT-001",
  }),
  otherClientRecord: resource("client_portal_record", "normal", undefined, {
    value: "Other client invoice",
    clientId: "CLIENT-002",
  }),
  aiKnowledge: resource("ai_knowledge", "normal", undefined, {
    value: "Time off policy",
    requiredPermissions: ["hr:timeoff:read:self"],
  }),
  userRole: resource("user_role", "pii", "EMP-001", {
    value: "Employee role assignment",
  }),
  otherTenantProfile: resource("employee_profile", "normal", "EMP-001", {
    tenantId: otherTenant,
    value: "Other tenant employee profile",
  }),
  firmSettings: resource("firm_settings", "normal", undefined, {
    value: "Firm settings",
  }),
  systemJobBatch: resource("system_job_batch", "audit", undefined, {
    value: "Tenant payroll retry batch",
  }),
  otherTenantSystemJobBatch: resource("system_job_batch", "audit", undefined, {
    tenantId: otherTenant,
    value: "Other tenant retry batch",
  }),
}

export const securityAccessCases: SecurityAccessCase[] = [
  allow("SEC-TENANT-001", actors.employee, resources.ownProfile, "read"),
  deny("SEC-TENANT-002", actors.employee, resources.otherTenantProfile, "read"),
  deny(
    "SEC-TENANT-003",
    actors.otherTenantHrDirector,
    resources.ownProfile,
    "read",
  ),
  deny(
    "SEC-TENANT-004",
    actors.otherTenantHrDirector,
    resources.payrollRun,
    "run",
  ),
  deny(
    "SEC-TENANT-005",
    actors.otherTenantHrDirector,
    resources.accountingRecord,
    "read",
  ),

  allow("SEC-EMP-001", actors.employee, resources.ownProfile, "read"),
  allow("SEC-EMP-002", actors.employee, resources.ownProfile, "update", {
    fields: ["personal_email", "personal_phone"],
  }),
  deny("SEC-EMP-003", actors.employee, resources.ownProfile, "update", {
    fields: ["salary"],
  }),
  deny("SEC-EMP-004", actors.employee, resources.peerProfile, "read"),
  deny("SEC-EMP-005", actors.employee, resources.peerProfile, "update", {
    fields: ["personal_phone"],
  }),
  allow(
    "SEC-EMP-006",
    actors.employee,
    resources.salary,
    "read",
    {},
    "125000.00",
  ),
  allow(
    "SEC-EMP-007",
    actors.employee,
    resources.ssn,
    "read",
    {},
    "123-45-6789",
  ),
  deny(
    "SEC-EMP-008",
    { ...actors.employee, mfaSatisfied: false },
    resources.ssn,
    "read",
  ),
  deny("SEC-EMP-009", actors.peerEmployee, resources.salary, "read"),
  deny("SEC-EMP-010", actors.employee, resources.salary, "update", {
    fields: ["salary"],
  }),
  deny("SEC-EMP-011", actors.employee, resources.ownProfile, "update", {
    fields: ["manager"],
  }),
  deny("SEC-EMP-012", actors.employee, resources.ownProfile, "update", {
    fields: ["role"],
  }),
  deny("SEC-EMP-013", actors.employee, resources.ownProfile, "update", {
    fields: ["hire_date"],
  }),
  deny("SEC-EMP-014", actors.employee, resources.ownProfile, "update", {
    fields: ["employment_status"],
  }),
  deny("SEC-EMP-015", actors.employee, resources.ownProfile, "update", {
    fields: ["compensation_history"],
  }),
  allow("SEC-EMP-016", actors.employee, resources.ownPayStub, "read"),
  allow("SEC-EMP-017", actors.employee, resources.taxForm, "read"),
  deny(
    "SEC-EMP-018",
    { ...actors.employee, mfaSatisfied: false },
    resources.ownPayStub,
    "read",
  ),
  deny(
    "SEC-EMP-019",
    { ...actors.employee, mfaSatisfied: false },
    resources.taxForm,
    "read",
  ),
  deny("SEC-EMP-020", actors.employee, resources.peerSsn, "read"),
  deny("SEC-EMP-021", actors.employee, resources.peerBankAccount, "read"),
  deny("SEC-EMP-022", actors.employee, resources.peerMedicalDoc, "read"),
  deny("SEC-EMP-023", actors.employee, resources.peerI9Doc, "read"),
  deny("SEC-EMP-024", actors.employee, resources.peerBenefitElection, "read"),
  deny("SEC-EMP-025", actors.employee, resources.peerChangeRequest, "read"),
  deny("SEC-EMP-026", actors.employee, resources.peerPerformanceReview, "read"),
  deny(
    "SEC-EMP-027",
    { ...actors.employee, mfaSatisfied: false },
    resources.salary,
    "read",
  ),

  allow("SEC-MGR-001", actors.manager, resources.directReportProfile, "read"),
  deny("SEC-MGR-002", actors.manager, resources.peerProfile, "read"),
  deny("SEC-MGR-003", actors.manager, resources.ssn, "read"),
  deny("SEC-MGR-004", actors.manager, resources.bankAccount, "read"),
  allow("SEC-MGR-005", actors.manager, resources.compensationRecord, "read", {
    withinCompensationPlanningCycle: true,
  }),
  deny("SEC-MGR-006", actors.manager, resources.compensationRecord, "read", {
    withinCompensationPlanningCycle: false,
  }),
  allow("SEC-MGR-007", actors.manager, resources.timeOffRequest, "approve"),
  deny("SEC-MGR-008", actors.employee, resources.timeOffRequest, "approve"),
  deny("SEC-MGR-009", actors.otherManager, resources.timeOffRequest, "approve"),
  allow("SEC-MGR-010", actors.manager, resources.timesheet, "approve"),
  deny("SEC-MGR-011", actors.manager, resources.salary, "update", {
    fields: ["salary"],
    hasApproval: true,
  }),

  allow("SEC-HR-001", actors.hrAdmin, resources.peerProfile, "read"),
  allow("SEC-HR-002", actors.hrAdmin, resources.peerProfile, "update", {
    fields: ["title", "department"],
  }),
  deny("SEC-HR-003", actors.hrAdmin, resources.peerProfile, "update", {
    fields: ["role"],
  }),
  allow("SEC-HR-004", actors.hrAdmin, resources.ssn, "read"),
  allow("SEC-HR-005", actors.hrAdmin, resources.medicalDoc, "read"),
  allow("SEC-HR-006", actors.hrAdmin, resources.i9Doc, "delete", {
    hasReason: true,
    hasAuditEvent: true,
  }),
  deny("SEC-HR-007", actors.hrAdmin, resources.legalHoldDoc, "delete", {
    hasReason: true,
    hasAuditEvent: true,
  }),
  deny("SEC-HR-008", actors.hrAdmin, resources.auditLog, "read"),
  allow("SEC-HR-009", actors.hrDirector, resources.auditLog, "read"),
  allow("SEC-HR-010", actors.hrDirector, resources.userRole, "manage", {
    hasReason: true,
    hasAuditEvent: true,
  }),
  deny(
    "SEC-HR-011",
    actors.hrDirector,
    { ...resources.userRole, ownerEmployeeId: "HRD-001" },
    "manage",
    {
      hasReason: true,
      hasAuditEvent: true,
    },
  ),
  allow("SEC-HR-012", actors.itAdmin, resources.userRole, "manage", {
    hasReason: true,
    hasAuditEvent: true,
  }),

  allow("SEC-PAY-001", actors.payrollAdmin, resources.payrollRun, "run"),
  allow("SEC-PAY-002", actors.payrollAdmin, resources.payrollRun, "finalize"),
  allow("SEC-PAY-003", actors.payrollAdmin, resources.ownPayStub, "read"),
  deny("SEC-PAY-004", actors.employee, resources.peerPayStub, "read"),
  allow(
    "SEC-PAY-005",
    actors.payrollAdmin,
    resources.bankAccount,
    "read",
    {},
    "****9012",
  ),
  deny(
    "SEC-PAY-006",
    { ...actors.payrollAdmin, mfaSatisfied: false },
    resources.bankAccount,
    "read",
  ),
  deny(
    "SEC-PAY-007",
    actors.payrollAdmin,
    resources.compensationRecord,
    "update",
    {
      hasApproval: true,
    },
  ),
  allow("SEC-PAY-008", actors.payrollAdmin, resources.taxForm, "generate"),
  deny("SEC-PAY-009", actors.manager, resources.taxForm, "read"),

  allow(
    "SEC-DD-001",
    actors.employee,
    resources.directDeposit,
    "read",
    {},
    "****9012",
  ),
  allow("SEC-DD-002", actors.employee, resources.directDeposit, "update", {
    sensitiveActionConfirmed: true,
  }),
  deny("SEC-DD-003", actors.employee, resources.directDeposit, "update", {
    sensitiveActionConfirmed: false,
  }),
  deny(
    "SEC-DD-004",
    actors.employee,
    resources.submittedDirectDeposit,
    "update",
    {
      sensitiveActionConfirmed: true,
    },
  ),

  allow(
    "SEC-COMP-001",
    actors.hrAdmin,
    resources.compensationRecord,
    "update",
    {
      hasApproval: true,
    },
  ),
  deny("SEC-COMP-002", actors.hrAdmin, resources.compensationRecord, "update", {
    hasApproval: false,
  }),
  allow(
    "SEC-COMP-003",
    actors.manager,
    resources.compensationWorksheet,
    "read",
    {
      withinCompensationPlanningCycle: true,
    },
  ),
  allow(
    "SEC-COMP-004",
    actors.manager,
    resources.compensationWorksheet,
    "update",
    {
      withinCompensationPlanningCycle: true,
    },
  ),
  deny(
    "SEC-COMP-005",
    actors.manager,
    resources.compensationWorksheet,
    "read",
    {
      withinCompensationPlanningCycle: false,
    },
  ),
  allow(
    "SEC-COMP-006",
    actors.hrDirector,
    resources.compensationWorksheet,
    "approve",
    {
      withinCompensationPlanningCycle: true,
    },
  ),
  deny(
    "SEC-COMP-007",
    actors.employee,
    resources.compensationWorksheet,
    "approve",
    {
      withinCompensationPlanningCycle: true,
    },
  ),

  allow("SEC-CR-001", actors.employee, resources.changeRequest, "submit", {
    fields: ["name"],
    hasSupportingDocument: true,
  }),
  deny("SEC-CR-002", actors.employee, resources.changeRequest, "submit", {
    fields: ["name"],
    hasSupportingDocument: false,
  }),
  deny("SEC-CR-003", actors.employee, resources.changeRequest, "submit", {
    fields: ["salary"],
  }),
  allow("SEC-CR-004", actors.manager, resources.changeRequest, "approve"),
  deny("SEC-CR-005", actors.employee, resources.changeRequest, "approve"),
  allow("SEC-CR-006", actors.hrAdmin, resources.changeRequest, "read"),

  allow("SEC-BEN-001", actors.employee, resources.benefitElection, "submit", {
    withinEnrollmentWindow: true,
  }),
  allow("SEC-BEN-002", actors.employee, resources.benefitElection, "update", {
    qualifyingLifeEvent: true,
  }),
  deny("SEC-BEN-003", actors.employee, resources.benefitElection, "update", {
    withinEnrollmentWindow: false,
    qualifyingLifeEvent: false,
  }),
  deny("SEC-BEN-004", actors.manager, resources.benefitElection, "read"),

  allow("SEC-ACC-001", actors.accountant, resources.accountingRecord, "read"),
  allow("SEC-ACC-002", actors.accountant, resources.accountingRecord, "update"),
  deny(
    "SEC-ACC-003",
    actors.accountant,
    resources.closedAccountingRecord,
    "update",
  ),
  allow(
    "SEC-ACC-004",
    actors.financeAdmin,
    resources.closedAccountingRecord,
    "update",
    {
      hasApproval: true,
      hasReason: true,
    },
  ),
  deny("SEC-ACC-005", actors.auditor, resources.accountingRecord, "update"),
  allow(
    "SEC-ACC-006",
    actors.auditor,
    resources.accountingRecord,
    "read",
    {},
    "[REDACTED]",
  ),
  deny(
    "SEC-ACC-007",
    actors.marketingAdmin,
    resources.accountingRecord,
    "read",
  ),

  allow(
    "SEC-AUDIT-001",
    actors.compliance,
    resources.auditLog,
    "read",
    {},
    "[REDACTED]",
  ),
  allow(
    "SEC-AUDIT-002",
    actors.auditor,
    resources.auditLog,
    "read",
    {},
    "[REDACTED]",
  ),
  deny(
    "SEC-AUDIT-003",
    { ...actors.auditor, mfaSatisfied: false },
    resources.auditLog,
    "read",
  ),
  deny("SEC-AUDIT-004", actors.compliance, resources.auditLog, "delete"),
  allow(
    "SEC-AUDIT-005",
    actors.compliance,
    resources.ssn,
    "read",
    {
      hasReason: true,
    },
    "[REDACTED]",
  ),
  allow(
    "SEC-AUDIT-006",
    actors.auditor,
    resources.taxForm,
    "read",
    {
      hasReason: true,
    },
    "[REDACTED]",
  ),
  allow(
    "SEC-AUDIT-007",
    actors.compliance,
    resources.i9Doc,
    "read",
    {},
    "[REDACTED]",
  ),

  allow("SEC-EXPORT-001", actors.employee, resources.dataExport, "export", {
    recordCount: 1,
  }),
  allow("SEC-EXPORT-002", actors.hrDirector, resources.dataExport, "export", {
    recordCount: 50,
    hasReason: true,
  }),
  deny("SEC-EXPORT-003", actors.hrDirector, resources.dataExport, "export", {
    recordCount: 150,
    hasReason: true,
    hasApproval: false,
  }),
  allow("SEC-EXPORT-004", actors.hrDirector, resources.dataExport, "export", {
    recordCount: 150,
    hasReason: true,
    hasApproval: true,
  }),
  deny("SEC-EXPORT-005", actors.manager, resources.dataExport, "export", {
    recordCount: 150,
    hasReason: true,
    hasApproval: true,
  }),

  allow(
    "SEC-MKT-001",
    actors.marketingAdmin,
    resources.marketingContact,
    "read",
  ),
  allow(
    "SEC-MKT-002",
    actors.marketingAdmin,
    resources.consentRecord,
    "update",
  ),
  deny("SEC-MKT-003", actors.marketingAdmin, resources.salary, "read"),
  deny("SEC-MKT-004", actors.employee, resources.marketingCampaign, "submit"),

  allow("SEC-SALES-001", actors.salesManager, resources.crmRecord, "read"),
  allow("SEC-SALES-002", actors.salesManager, resources.crmRecord, "update"),
  allow("SEC-SALES-003", actors.salesManager, resources.crmRecord, "export"),
  deny("SEC-SALES-004", actors.salesManager, resources.salary, "read"),
  deny(
    "SEC-SALES-005",
    actors.salesManager,
    resources.accountingRecord,
    "read",
  ),
  deny("SEC-SALES-006", actors.salesManager, resources.auditLog, "read"),
  deny("SEC-SALES-007", actors.salesManager, resources.consentRecord, "update"),

  allow("SEC-WORK-001", actors.employee, resources.ticket, "read"),
  allow("SEC-WORK-002", actors.projectManager, resources.ticket, "update"),
  deny("SEC-WORK-003", actors.peerEmployee, resources.ticket, "read"),

  allow(
    "SEC-CLIENT-001",
    actors.externalClient,
    resources.clientRecord,
    "read",
  ),
  deny(
    "SEC-CLIENT-002",
    actors.externalClient,
    resources.otherClientRecord,
    "read",
  ),
  deny("SEC-CLIENT-003", actors.externalClient, resources.ownProfile, "read"),
  deny(
    "SEC-CLIENT-004",
    actors.externalClient,
    resources.clientRecord,
    "update",
  ),

  allow(
    "SEC-AI-001",
    actors.aiWithPermission,
    resources.aiKnowledge,
    "ai_retrieve",
  ),
  deny(
    "SEC-AI-002",
    actors.aiWithoutPermission,
    resources.aiKnowledge,
    "ai_retrieve",
  ),
  deny("SEC-AI-003", actors.aiWithPermission, resources.ssn, "ai_retrieve"),

  allow("SEC-FIRM-001", actors.hrDirector, resources.firmSettings, "manage"),
  allow("SEC-FIRM-002", actors.financeAdmin, resources.firmSettings, "manage"),
  deny("SEC-FIRM-003", actors.externalClient, resources.firmSettings, "read"),

  allow("SEC-JOB-001", actors.systemJob, resources.systemJobBatch, "run", {
    hasTenantContext: true,
    hasIdempotencyKey: true,
    hasAuditEvent: true,
  }),
  deny("SEC-JOB-002", actors.systemJob, resources.systemJobBatch, "run", {
    hasTenantContext: false,
    hasIdempotencyKey: true,
    hasAuditEvent: true,
  }),
  deny("SEC-JOB-003", actors.systemJob, resources.systemJobBatch, "run", {
    hasTenantContext: true,
    hasIdempotencyKey: false,
    hasAuditEvent: true,
  }),
  deny("SEC-JOB-004", actors.systemJob, resources.systemJobBatch, "run", {
    hasTenantContext: true,
    hasIdempotencyKey: true,
    hasAuditEvent: false,
  }),
  deny("SEC-JOB-005", actors.hrDirector, resources.systemJobBatch, "run", {
    hasTenantContext: true,
    hasIdempotencyKey: true,
    hasAuditEvent: true,
  }),
  deny(
    "SEC-JOB-006",
    actors.systemJob,
    resources.otherTenantSystemJobBatch,
    "run",
    {
      hasTenantContext: true,
      hasIdempotencyKey: true,
      hasAuditEvent: true,
    },
  ),
]

function allow(
  id: string,
  actorValue: Actor,
  resourceValue: ProtectedResource,
  action: SecurityAction,
  context: AccessContext = {},
  responseValue = ["read", "export", "ai_retrieve"].includes(action)
    ? resourceValue.value
    : null,
): SecurityAccessCase {
  return accessCase(id, actorValue, resourceValue, action, context, {
    allowed: true,
    responseValue,
  })
}

function deny(
  id: string,
  actorValue: Actor,
  resourceValue: ProtectedResource,
  action: SecurityAction,
  context: AccessContext = {},
): SecurityAccessCase {
  return accessCase(id, actorValue, resourceValue, action, context, {
    allowed: false,
    responseValue: null,
  })
}

function accessCase(
  id: string,
  actorValue: Actor,
  resourceValue: ProtectedResource,
  action: SecurityAction,
  context: AccessContext,
  expected: SecurityAccessCase["expected"],
): SecurityAccessCase {
  return {
    id,
    sourceRequirements: ["INV-SEC-001", "INV-SEC-002", "INV-SEC-003"],
    actor: actorValue,
    resource: resourceValue,
    action,
    context,
    expected,
  }
}

function actor(
  id: string,
  role: Actor["role"],
  permissions: string[],
  options: Partial<Actor> = {},
): Actor {
  return {
    id,
    tenantId: options.tenantId ?? tenant,
    role,
    permissions,
    mfaSatisfied: options.mfaSatisfied ?? true,
    directReportIds: options.directReportIds,
    employeeId: options.employeeId,
    departmentId: options.departmentId,
    clientId: options.clientId,
  }
}

function resource(
  resourceType: ProtectedResource["resourceType"],
  sensitivity: ProtectedResource["sensitivity"],
  ownerEmployeeId: string | undefined,
  options: Partial<ProtectedResource>,
): ProtectedResource {
  return {
    id: `${resourceType}-${ownerEmployeeId ?? "tenant"}`,
    tenantId: options.tenantId ?? tenant,
    resourceType,
    sensitivity,
    ownerEmployeeId,
    managerId: options.managerId,
    fieldName: options.fieldName ?? resourceType,
    value: options.value ?? resourceType,
    departmentId: options.departmentId,
    clientId: options.clientId,
    requestorId: options.requestorId,
    approverIds: options.approverIds,
    currentApproverId: options.currentApproverId,
    worksheetManagerId: options.worksheetManagerId,
    assignedUserId: options.assignedUserId,
    requiredPermissions: options.requiredPermissions,
    legalHold: options.legalHold,
    closedPeriod: options.closedPeriod,
    submittedToProvider: options.submittedToProvider,
  }
}
