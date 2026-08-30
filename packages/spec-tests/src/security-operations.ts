import type {
  AccessContext,
  Actor,
  ProtectedResource,
  SecurityAction,
} from "./security.js"
import { authorizeResourceAction } from "./security.js"

export interface SearchHit {
  id: string
  tenantId: string
  requiredPermissions?: string[]
  resource: ProtectedResource
}

export interface WebhookReplayInput {
  tenantId: string
  targetTenantId: string
  providerEventId: string
  seenProviderEventIds: string[]
  signatureValid: boolean
  idempotencyKey?: string
}

export interface ScheduledReportInput {
  tenantId: string
  reportTenantId: string
  recipientTenantId: string
  recipientAuthorizedAtSendTime: boolean
  generatedAtEpochMs: number
  expiresAtEpochMs: number
  sendAtEpochMs: number
}

export interface CredentialInput {
  credentialType: "jwt" | "api_key"
  credentialTenantId: string
  requestedTenantId: string
  scopes: string[]
  requestedScope: string
  subjectActive: boolean
  issuedAtEpochMs: number
  nowEpochMs: number
}

export interface StateChangingRequestInput {
  method: "GET" | "POST" | "PUT" | "PATCH" | "DELETE"
  csrfTokenValid: boolean
  sameSiteCookie: boolean
  rateLimitExceeded: boolean
}

const apiKeyMaxAgeMs = 90 * 24 * 60 * 60 * 1000
const sensitiveKeyPattern =
  /(^|_)(authorization|bank|bank_account|password|routing|salary|secret|ssn|token)(_|$)/i
const sensitiveValuePattern =
  /(\b\d{3}-\d{2}-\d{4}\b)|(\b\d{9,17}\b)|(Bearer\s+[A-Za-z0-9._-]+)/i

export function filterAuthorizedSearchHits(
  actor: Actor,
  hits: SearchHit[],
  action: SecurityAction = "read",
  context: AccessContext = {},
): SearchHit[] {
  return hits.filter((hit) => {
    if (
      hit.tenantId !== actor.tenantId ||
      hit.resource.tenantId !== actor.tenantId
    ) {
      return false
    }

    if (
      (hit.requiredPermissions ?? []).some(
        (permission) => !actor.permissions.includes(permission),
      )
    ) {
      return false
    }

    return authorizeResourceAction(actor, hit.resource, action, context).allowed
  })
}

export function cacheKeyIsTenantScoped(key: string, tenantId: string): boolean {
  const tenantPrefix = `tenant:${tenantId}:`

  if (!key.startsWith(tenantPrefix)) {
    return false
  }

  return !key.slice(tenantPrefix.length).includes("tenant:")
}

export function authorizeWebhookReplay(input: WebhookReplayInput): boolean {
  return (
    input.signatureValid &&
    input.tenantId === input.targetTenantId &&
    input.providerEventId.length > 0 &&
    input.idempotencyKey !== undefined &&
    input.idempotencyKey.length > 0 &&
    !input.seenProviderEventIds.includes(input.providerEventId)
  )
}

export function authorizeScheduledReportSend(
  input: ScheduledReportInput,
): boolean {
  return (
    input.tenantId === input.reportTenantId &&
    input.tenantId === input.recipientTenantId &&
    input.recipientAuthorizedAtSendTime &&
    input.generatedAtEpochMs <= input.sendAtEpochMs &&
    input.sendAtEpochMs < input.expiresAtEpochMs
  )
}

export function authorizeCredential(input: CredentialInput): boolean {
  if (
    input.credentialTenantId !== input.requestedTenantId ||
    !input.subjectActive ||
    !input.scopes.includes(input.requestedScope)
  ) {
    return false
  }

  if (input.credentialType === "api_key") {
    return input.nowEpochMs - input.issuedAtEpochMs <= apiKeyMaxAgeMs
  }

  return input.nowEpochMs >= input.issuedAtEpochMs
}

export function authorizeStateChangingRequest(
  input: StateChangingRequestInput,
): boolean {
  if (input.rateLimitExceeded) {
    return false
  }

  if (input.method === "GET") {
    return true
  }

  return input.csrfTokenValid && input.sameSiteCookie
}

export function redactTelemetry<T>(value: T): T {
  if (Array.isArray(value)) {
    return value.map((entry) => redactTelemetry(entry)) as T
  }

  if (value !== null && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value).map(([key, entry]) => [
        key,
        sensitiveKeyPattern.test(key) ? "[REDACTED]" : redactTelemetry(entry),
      ]),
    ) as T
  }

  if (typeof value === "string" && sensitiveValuePattern.test(value)) {
    return "[REDACTED]" as T
  }

  return value
}

export function containsSecretMaterial(value: unknown): boolean {
  if (Array.isArray(value)) {
    return value.some((entry) => containsSecretMaterial(entry))
  }

  if (value !== null && typeof value === "object") {
    return Object.values(value).some((entry) => containsSecretMaterial(entry))
  }

  return typeof value === "string" && sensitiveValuePattern.test(value)
}
