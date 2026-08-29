import { describe, expect, it } from "vitest"
import {
  evaluateMarketingSend,
  mergeConsentHistories,
} from "../src/marketing.js"
import {
  bouncedDuplicateContact,
  optedInContact,
  pendingDoubleOptInContact,
  unsubscribedContact,
} from "../fixtures/marketing.js"

describe("INV-MKT-001 suppression wins", () => {
  it("allows marketing email when explicit consent exists and no blocker precedes send", () => {
    expect(
      evaluateMarketingSend({
        contact: optedInContact,
        sendAt: "2026-02-10T10:00:00Z",
        channel: "bulk-campaign",
      }),
    ).toMatchObject({
      allowed: true,
      blockingEventType: null,
      consentEventType: "consent_granted",
      auditEvents: ["marketing.consent_snapshot.created"],
    })
  })

  it("blocks bulk campaigns after global unsubscribe", () => {
    expect(
      evaluateMarketingSend({
        contact: unsubscribedContact,
        sendAt: "2026-02-16T10:00:00Z",
        channel: "bulk-campaign",
      }),
    ).toMatchObject({
      allowed: false,
      blockingEventType: "consent_withdrawn",
    })
  })

  it("blocks workflow emails after merged duplicate hard bounce", () => {
    const merged = mergeConsentHistories(
      optedInContact,
      bouncedDuplicateContact,
    )

    expect(
      evaluateMarketingSend({
        contact: merged,
        sendAt: "2026-02-21T10:00:00Z",
        channel: "workflow-email",
      }),
    ).toMatchObject({
      allowed: false,
      blockingEventType: "hard_bounce",
    })
  })

  it("does not treat pending double opt-in as permission to send", () => {
    expect(
      evaluateMarketingSend({
        contact: pendingDoubleOptInContact,
        sendAt: "2026-02-02T10:00:00Z",
        channel: "ab-test",
      }),
    ).toMatchObject({
      allowed: false,
      consentEventType: null,
    })
  })
})

describe("INV-MKT-002 consent is historical", () => {
  it("preserves the consent state that existed at the send timestamp", () => {
    expect(
      evaluateMarketingSend({
        contact: unsubscribedContact,
        sendAt: "2026-02-10T10:00:00Z",
        channel: "bulk-campaign",
      }),
    ).toMatchObject({
      allowed: true,
      consentEventType: "consent_granted",
      snapshotAt: "2026-02-10T10:00:00Z",
    })

    expect(
      evaluateMarketingSend({
        contact: unsubscribedContact,
        sendAt: "2026-02-16T10:00:00Z",
        channel: "manual-resend",
      }),
    ).toMatchObject({
      allowed: false,
      blockingEventType: "consent_withdrawn",
      snapshotAt: "2026-02-16T10:00:00Z",
    })
  })

  it("keeps consent and suppression evidence when duplicate contacts are merged", () => {
    const merged = mergeConsentHistories(
      optedInContact,
      bouncedDuplicateContact,
    )

    expect(merged.sourceRequirements).toEqual(["INV-MKT-001", "INV-MKT-002"])
    expect(merged.events.map((event) => event.type)).toEqual([
      "consent_granted",
      "hard_bounce",
    ])
  })
})
