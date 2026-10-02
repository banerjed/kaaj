import { describe, expect, it } from "vitest"
import {
  decodeSecret,
  parseEnvelope,
  signWebhook,
  verifyWebhook,
} from "./webhooks"

/**
 * The webhook's only authentication, asserted on the branch that REFUSES:
 * a signature over a different body, a stale timestamp, a missing header.
 * Pure functions, so every branch is reachable without a server.
 */

const SECRET =
  "whsec_" + Buffer.from("a-32-byte-demo-secret-for-tests!").toString("base64")
const BODY =
  '{"type":"sms.received","timestamp":"2026-10-02T10:00:00Z","data":{"to":"+12125550100"}}'
const NOW = 1_790_000_000

function headers(
  overrides: Partial<{ id: string; timestamp: string; signature: string }> = {},
) {
  const id = overrides.id ?? "msg_01"
  const timestamp = overrides.timestamp ?? String(NOW)
  return {
    id,
    timestamp,
    signature: overrides.signature ?? signWebhook(id, timestamp, BODY, SECRET),
  }
}

describe("verifyWebhook", () => {
  it("accepts a delivery signed with the endpoint secret", () => {
    expect(verifyWebhook(headers(), BODY, SECRET, NOW)).toEqual({
      ok: true,
      id: "msg_01",
    })
  })

  it("refuses the same signature over a different body", () => {
    const h = headers()
    const tampered = BODY.replace("+12125550100", "+12125550199")
    expect(verifyWebhook(h, tampered, SECRET, NOW)).toEqual({
      ok: false,
      reason: "bad_signature",
    })
  })

  it("refuses a signature made with another secret", () => {
    const other =
      "whsec_" +
      Buffer.from("another-secret-of-32-bytes-long!").toString("base64")
    const h = headers({
      signature: signWebhook("msg_01", String(NOW), BODY, other),
    })
    expect(verifyWebhook(h, BODY, SECRET, NOW).ok).toBe(false)
  })

  it("refuses a delivery older than five minutes, even when correctly signed", () => {
    const old = String(NOW - 301)
    const h = headers({ timestamp: old })
    expect(verifyWebhook(h, BODY, SECRET, NOW)).toEqual({
      ok: false,
      reason: "stale",
    })
  })

  it("accepts any one of several space-delimited signatures (secret rotation)", () => {
    const h = headers()
    const rotated = { ...h, signature: `v1,AAAA ${h.signature}` }
    expect(verifyWebhook(rotated, BODY, SECRET, NOW).ok).toBe(true)
  })

  it("refuses with no secret configured, and with a header missing", () => {
    expect(verifyWebhook(headers(), BODY, undefined, NOW)).toEqual({
      ok: false,
      reason: "no_secret",
    })
    expect(
      verifyWebhook({ ...headers(), signature: null }, BODY, SECRET, NOW),
    ).toEqual({ ok: false, reason: "missing_header" })
  })

  it("decodes a whsec_ secret and a bare base64 one to the same key", () => {
    expect(decodeSecret(SECRET)).toEqual(decodeSecret(SECRET.slice(6)))
  })
})

describe("parseEnvelope", () => {
  it("reads type, timestamp and data", () => {
    expect(parseEnvelope(BODY)).toEqual({
      type: "sms.received",
      timestamp: "2026-10-02T10:00:00Z",
      data: { to: "+12125550100" },
    })
  })

  it("answers null for anything that is not an event", () => {
    expect(parseEnvelope("not json")).toBeNull()
    expect(parseEnvelope('{"data":{}}')).toBeNull()
    expect(parseEnvelope('{"type":"x"}')).toBeNull()
    expect(parseEnvelope("[]")).toBeNull()
  })
})
