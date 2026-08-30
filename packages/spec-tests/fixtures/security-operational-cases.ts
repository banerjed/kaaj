import type {
  CredentialInput,
  ScheduledReportInput,
  SearchHit,
  StateChangingRequestInput,
  WebhookReplayInput,
} from "../src/security-operations.js"
import type { Actor, ProtectedResource } from "../src/security.js"

const tenant = "TENANT-A"
const otherTenant = "TENANT-B"
const now = Date.UTC(2026, 7, 30, 12, 0, 0)

const manager: Actor = {
  id: "MGR-001",
  tenantId: tenant,
  role: "manager",
  permissions: [],
  directReportIds: ["EMP-001"],
  mfaSatisfied: true,
}

const hrDirector: Actor = {
  id: "HRD-001",
  tenantId: tenant,
  role: "hr_director",
  permissions: [],
  mfaSatisfied: true,
}

const aiAssistant: Actor = {
  id: "AI-001",
  tenantId: tenant,
  role: "ai_assistant",
  permissions: ["hr:timeoff:read:self"],
  mfaSatisfied: true,
}

const directReportProfile = resource("employee_profile", "EMP-001", {
  value: "Direct report profile",
  managerId: "MGR-001",
})
const peerProfile = resource("employee_profile", "EMP-002", {
  value: "Peer profile",
  managerId: "MGR-002",
})
const crossTenantProfile = resource("employee_profile", "EMP-003", {
  tenantId: otherTenant,
  value: "Other tenant profile",
})
const aiKnowledge = resource("ai_knowledge", undefined, {
  value: "Time off policy",
  requiredPermissions: ["hr:timeoff:read:self"],
})
const restrictedAiKnowledge = resource("ai_knowledge", undefined, {
  value: "Payroll policy",
  requiredPermissions: ["payroll:runs:run"],
})
const employeeExport = resource("data_export", "EMP-001", {
  sensitivity: "pii",
  value: "Employee export",
})

export const searchAuthorizationCases = [
  {
    id: "SEC-SEARCH-001",
    actor: manager,
    hits: [
      searchHit("SEARCH-001", directReportProfile),
      searchHit("SEARCH-002", peerProfile),
      searchHit("SEARCH-003", crossTenantProfile),
    ],
    expectedIds: ["SEARCH-001"],
  },
  {
    id: "SEC-SEARCH-002",
    actor: aiAssistant,
    hits: [
      searchHit("SEARCH-004", aiKnowledge),
      searchHit("SEARCH-005", restrictedAiKnowledge),
      searchHit("SEARCH-006", { ...aiKnowledge, tenantId: otherTenant }),
    ],
    expectedIds: ["SEARCH-004"],
    action: "ai_retrieve" as const,
  },
  {
    id: "SEC-SEARCH-003",
    actor: hrDirector,
    hits: [
      searchHit("SEARCH-007", employeeExport),
      searchHit("SEARCH-008", { ...employeeExport, tenantId: otherTenant }),
    ],
    expectedIds: ["SEARCH-007"],
    action: "export" as const,
    context: { recordCount: 50, hasReason: true },
  },
]

export const cacheKeyCases = [
  {
    id: "SEC-CACHE-001",
    key: "tenant:TENANT-A:employee:EMP-001",
    tenantId: tenant,
    expected: true,
  },
  {
    id: "SEC-CACHE-002",
    key: "employee:EMP-001",
    tenantId: tenant,
    expected: false,
  },
  {
    id: "SEC-CACHE-003",
    key: "tenant:TENANT-B:employee:EMP-001",
    tenantId: tenant,
    expected: false,
  },
  {
    id: "SEC-CACHE-004",
    key: "tenant:TENANT-A:report:tenant:TENANT-B:payroll",
    tenantId: tenant,
    expected: false,
  },
]

export const webhookReplayCases: Array<{
  id: string
  input: WebhookReplayInput
  expected: boolean
}> = [
  {
    id: "SEC-WEBHOOK-001",
    input: webhook({ providerEventId: "evt_001", idempotencyKey: "idem-001" }),
    expected: true,
  },
  {
    id: "SEC-WEBHOOK-002",
    input: webhook({ signatureValid: false }),
    expected: false,
  },
  {
    id: "SEC-WEBHOOK-003",
    input: webhook({ targetTenantId: otherTenant }),
    expected: false,
  },
  {
    id: "SEC-WEBHOOK-004",
    input: webhook({ providerEventId: "evt_seen" }),
    expected: false,
  },
  {
    id: "SEC-WEBHOOK-005",
    input: webhook({ idempotencyKey: "" }),
    expected: false,
  },
]

export const scheduledReportCases: Array<{
  id: string
  input: ScheduledReportInput
  expected: boolean
}> = [
  {
    id: "SEC-REPORT-001",
    input: report({}),
    expected: true,
  },
  {
    id: "SEC-REPORT-002",
    input: report({ recipientAuthorizedAtSendTime: false }),
    expected: false,
  },
  {
    id: "SEC-REPORT-003",
    input: report({ recipientTenantId: otherTenant }),
    expected: false,
  },
  {
    id: "SEC-REPORT-004",
    input: report({ sendAtEpochMs: now + 61 * 60 * 1000 }),
    expected: false,
  },
]

export const credentialCases: Array<{
  id: string
  input: CredentialInput
  expected: boolean
}> = [
  {
    id: "SEC-CREDENTIAL-001",
    input: credential({ credentialType: "jwt" }),
    expected: true,
  },
  {
    id: "SEC-CREDENTIAL-002",
    input: credential({ requestedTenantId: otherTenant }),
    expected: false,
  },
  {
    id: "SEC-CREDENTIAL-003",
    input: credential({
      scopes: ["hr:profile:read"],
      requestedScope: "payroll:run",
    }),
    expected: false,
  },
  {
    id: "SEC-CREDENTIAL-004",
    input: credential({ subjectActive: false }),
    expected: false,
  },
  {
    id: "SEC-CREDENTIAL-005",
    input: credential({
      credentialType: "api_key",
      issuedAtEpochMs: now - 89 * 24 * 60 * 60 * 1000,
    }),
    expected: true,
  },
  {
    id: "SEC-CREDENTIAL-006",
    input: credential({
      credentialType: "api_key",
      issuedAtEpochMs: now - 91 * 24 * 60 * 60 * 1000,
    }),
    expected: false,
  },
]

export const stateChangingRequestCases: Array<{
  id: string
  input: StateChangingRequestInput
  expected: boolean
}> = [
  {
    id: "SEC-CSRF-001",
    input: request({ method: "GET", csrfTokenValid: false }),
    expected: true,
  },
  {
    id: "SEC-CSRF-002",
    input: request({ method: "POST", csrfTokenValid: true }),
    expected: true,
  },
  {
    id: "SEC-CSRF-003",
    input: request({ method: "POST", csrfTokenValid: false }),
    expected: false,
  },
  {
    id: "SEC-CSRF-004",
    input: request({ method: "DELETE", sameSiteCookie: false }),
    expected: false,
  },
  {
    id: "SEC-RATE-001",
    input: request({ method: "PATCH", rateLimitExceeded: true }),
    expected: false,
  },
]

export const telemetryCases = [
  {
    id: "SEC-TELEMETRY-001",
    input: {
      route: "/payroll/direct-deposit",
      ssn: "123-45-6789",
      nested: { bank_account_number: "123456789012" },
    },
  },
  {
    id: "SEC-TELEMETRY-002",
    input: {
      message: "Payroll update failed for Bearer abc.def.ghi",
      salary: "125000.00",
      headers: { authorization: "Bearer abc.def.ghi" },
    },
  },
  {
    id: "SEC-TELEMETRY-003",
    input: {
      events: [
        { field: "routing_number", value: "021000021" },
        { field: "safe", value: "ordinary diagnostic text" },
      ],
    },
  },
]

export const operationalSecurityCaseIds = [
  ...searchAuthorizationCases,
  ...cacheKeyCases,
  ...webhookReplayCases,
  ...scheduledReportCases,
  ...credentialCases,
  ...stateChangingRequestCases,
  ...telemetryCases,
].map((testCase) => testCase.id)

function searchHit(id: string, resourceValue: ProtectedResource): SearchHit {
  return {
    id,
    tenantId: resourceValue.tenantId,
    requiredPermissions: resourceValue.requiredPermissions,
    resource: resourceValue,
  }
}

function resource(
  resourceType: ProtectedResource["resourceType"],
  ownerEmployeeId: string | undefined,
  options: Partial<ProtectedResource>,
): ProtectedResource {
  return {
    id: `${resourceType}-${ownerEmployeeId ?? "tenant"}`,
    tenantId: options.tenantId ?? tenant,
    resourceType,
    sensitivity: options.sensitivity ?? "normal",
    ownerEmployeeId,
    managerId: options.managerId,
    fieldName: options.fieldName ?? resourceType,
    value: options.value ?? resourceType,
    requiredPermissions: options.requiredPermissions,
  }
}

function webhook(options: Partial<WebhookReplayInput>): WebhookReplayInput {
  return {
    tenantId: options.tenantId ?? tenant,
    targetTenantId: options.targetTenantId ?? tenant,
    providerEventId: options.providerEventId ?? "evt_new",
    seenProviderEventIds: options.seenProviderEventIds ?? ["evt_seen"],
    signatureValid: options.signatureValid ?? true,
    idempotencyKey: options.idempotencyKey ?? "idem-new",
  }
}

function report(options: Partial<ScheduledReportInput>): ScheduledReportInput {
  return {
    tenantId: options.tenantId ?? tenant,
    reportTenantId: options.reportTenantId ?? tenant,
    recipientTenantId: options.recipientTenantId ?? tenant,
    recipientAuthorizedAtSendTime:
      options.recipientAuthorizedAtSendTime ?? true,
    generatedAtEpochMs: options.generatedAtEpochMs ?? now,
    expiresAtEpochMs: options.expiresAtEpochMs ?? now + 60 * 60 * 1000,
    sendAtEpochMs: options.sendAtEpochMs ?? now + 5 * 60 * 1000,
  }
}

function credential(options: Partial<CredentialInput>): CredentialInput {
  return {
    credentialType: options.credentialType ?? "api_key",
    credentialTenantId: options.credentialTenantId ?? tenant,
    requestedTenantId: options.requestedTenantId ?? tenant,
    scopes: options.scopes ?? ["payroll:run"],
    requestedScope: options.requestedScope ?? "payroll:run",
    subjectActive: options.subjectActive ?? true,
    issuedAtEpochMs: options.issuedAtEpochMs ?? now - 60 * 1000,
    nowEpochMs: options.nowEpochMs ?? now,
  }
}

function request(
  options: Partial<StateChangingRequestInput>,
): StateChangingRequestInput {
  return {
    method: options.method ?? "POST",
    csrfTokenValid: options.csrfTokenValid ?? true,
    sameSiteCookie: options.sameSiteCookie ?? true,
    rateLimitExceeded: options.rateLimitExceeded ?? false,
  }
}
