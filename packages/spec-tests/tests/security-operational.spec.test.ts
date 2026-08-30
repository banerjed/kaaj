import { describe, expect, it } from "vitest"
import {
  cacheKeyCases,
  credentialCases,
  scheduledReportCases,
  searchAuthorizationCases,
  stateChangingRequestCases,
  telemetryCases,
  webhookReplayCases,
} from "../fixtures/security-operational-cases.js"
import {
  authorizeCredential,
  authorizeScheduledReportSend,
  authorizeStateChangingRequest,
  authorizeWebhookReplay,
  cacheKeyIsTenantScoped,
  containsSecretMaterial,
  filterAuthorizedSearchHits,
  redactTelemetry,
} from "../src/security-operations.js"

describe("operational security invariants", () => {
  it.each(searchAuthorizationCases)(
    "$id filters search and AI results through tenant and permission checks",
    (testCase) => {
      expect(
        filterAuthorizedSearchHits(
          testCase.actor,
          testCase.hits,
          testCase.action,
          testCase.context,
        ).map((hit) => hit.id),
      ).toEqual(testCase.expectedIds)
    },
  )

  it.each(cacheKeyCases)(
    "$id validates tenant-scoped cache keys",
    (testCase) => {
      expect(cacheKeyIsTenantScoped(testCase.key, testCase.tenantId)).toBe(
        testCase.expected,
      )
    },
  )

  it.each(webhookReplayCases)(
    "$id authorizes webhook replay protection",
    (testCase) => {
      expect(authorizeWebhookReplay(testCase.input)).toBe(testCase.expected)
    },
  )

  it.each(scheduledReportCases)(
    "$id rechecks scheduled report authorization at send time",
    (testCase) => {
      expect(authorizeScheduledReportSend(testCase.input)).toBe(
        testCase.expected,
      )
    },
  )

  it.each(credentialCases)(
    "$id validates JWT and API-key tenant, scope, status, and rotation",
    (testCase) => {
      expect(authorizeCredential(testCase.input)).toBe(testCase.expected)
    },
  )

  it.each(stateChangingRequestCases)(
    "$id enforces CSRF, SameSite, and rate-limit gates",
    (testCase) => {
      expect(authorizeStateChangingRequest(testCase.input)).toBe(
        testCase.expected,
      )
    },
  )

  it.each(telemetryCases)(
    "$id redacts telemetry and log payloads before emission",
    (testCase) => {
      expect(containsSecretMaterial(testCase.input)).toBe(true)

      const redacted = redactTelemetry(testCase.input)

      expect(containsSecretMaterial(redacted)).toBe(false)
      expect(JSON.stringify(redacted)).not.toMatch(
        /123-45-6789|123456789012|021000021|125000\.00|Bearer abc\.def\.ghi/,
      )
    },
  )
})
