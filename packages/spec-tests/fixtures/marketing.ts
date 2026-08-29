import type { ContactConsentFixture } from "../src/marketing.js"

export const optedInContact = {
  id: "CONTACT-OPTED-IN",
  sourceRequirements: ["INV-MKT-001", "INV-MKT-002"],
  events: [
    {
      type: "consent_granted",
      occurredAt: "2026-02-01T10:00:00Z",
      legalBasis: "explicit",
      source: "newsletter form",
    },
  ],
} satisfies ContactConsentFixture

export const unsubscribedContact = {
  id: "CONTACT-UNSUBSCRIBED",
  sourceRequirements: ["INV-MKT-001", "INV-MKT-002"],
  events: [
    {
      type: "consent_granted",
      occurredAt: "2026-02-01T10:00:00Z",
      legalBasis: "explicit",
      source: "newsletter form",
    },
    {
      type: "consent_withdrawn",
      occurredAt: "2026-02-15T09:00:00Z",
      source: "global unsubscribe",
    },
  ],
} satisfies ContactConsentFixture

export const bouncedDuplicateContact = {
  id: "CONTACT-DUPLICATE",
  sourceRequirements: ["INV-MKT-001"],
  events: [
    {
      type: "hard_bounce",
      occurredAt: "2026-02-20T09:00:00Z",
      source: "email provider webhook",
    },
  ],
} satisfies ContactConsentFixture

export const pendingDoubleOptInContact = {
  id: "CONTACT-PENDING",
  sourceRequirements: ["INV-MKT-001", "INV-MKT-002"],
  events: [
    {
      type: "double_opt_in_pending",
      occurredAt: "2026-02-01T10:00:00Z",
      source: "preference center",
    },
  ],
} satisfies ContactConsentFixture
