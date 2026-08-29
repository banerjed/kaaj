export interface ConsentEvent {
  type:
    | "consent_granted"
    | "consent_withdrawn"
    | "double_opt_in_pending"
    | "double_opt_in_confirmed"
    | "hard_bounce"
    | "spam_complaint"
    | "suppressed"
    | "consent_expired"
  occurredAt: string
  legalBasis?: "explicit" | "implied" | "contract" | "legitimate_interest"
  source: string
}

export interface ContactConsentFixture {
  id: string
  sourceRequirements: string[]
  events: ConsentEvent[]
}

export interface MarketingSendAttempt {
  contact: ContactConsentFixture
  sendAt: string
  channel: "bulk-campaign" | "workflow-email" | "ab-test" | "manual-resend"
}

export interface ConsentSnapshot {
  allowed: boolean
  blockingEventType: ConsentEvent["type"] | null
  consentEventType: ConsentEvent["type"] | null
  snapshotAt: string
  auditEvents: string[]
}

const blockingEventTypes = new Set<ConsentEvent["type"]>([
  "consent_withdrawn",
  "hard_bounce",
  "spam_complaint",
  "suppressed",
  "consent_expired",
])

export function evaluateMarketingSend(
  attempt: MarketingSendAttempt,
): ConsentSnapshot {
  const history = attempt.contact.events
    .filter((event) => event.occurredAt <= attempt.sendAt)
    .sort((left, right) => left.occurredAt.localeCompare(right.occurredAt))
  const latestBlockingEvent = [...history]
    .reverse()
    .find((event) => blockingEventTypes.has(event.type))

  if (latestBlockingEvent) {
    return snapshot(false, latestBlockingEvent.type, null, attempt.sendAt)
  }

  const latestConsentEvent = [...history]
    .reverse()
    .find((event) =>
      ["consent_granted", "double_opt_in_confirmed"].includes(event.type),
    )

  return snapshot(
    latestConsentEvent !== undefined,
    null,
    latestConsentEvent?.type ?? null,
    attempt.sendAt,
  )
}

export function mergeConsentHistories(
  primary: ContactConsentFixture,
  duplicate: ContactConsentFixture,
): ContactConsentFixture {
  return {
    id: primary.id,
    sourceRequirements: Array.from(
      new Set([...primary.sourceRequirements, ...duplicate.sourceRequirements]),
    ).sort(),
    events: [...primary.events, ...duplicate.events].sort((left, right) =>
      left.occurredAt.localeCompare(right.occurredAt),
    ),
  }
}

function snapshot(
  allowed: boolean,
  blockingEventType: ConsentSnapshot["blockingEventType"],
  consentEventType: ConsentSnapshot["consentEventType"],
  snapshotAt: string,
): ConsentSnapshot {
  return {
    allowed,
    blockingEventType,
    consentEventType,
    snapshotAt,
    auditEvents: ["marketing.consent_snapshot.created"],
  }
}
