import { createHmac, timingSafeEqual } from "node:crypto"

/**
 * Standard Webhooks verification, as Bird delivers it: three headers, an
 * HMAC-SHA256 over `{id}.{timestamp}.{raw body}` keyed with the decoded
 * `whsec_` secret, and a 5-minute replay window. Pure — no I/O — so the
 * refused branches (bad signature, stale timestamp, missing header) can be
 * asserted directly rather than trusted.
 */

/** How old a delivery may be before it is refused as a replay. */
const MAX_SKEW_SECONDS = 300

export type WebhookHeaders = {
  id: string | null
  timestamp: string | null
  signature: string | null
}

export type VerifyResult =
  | { ok: true; id: string }
  | {
      ok: false
      reason: "missing_header" | "stale" | "bad_signature" | "no_secret"
    }

/** The key bytes behind a `whsec_…` secret. Accepts the bare base64 too. */
export function decodeSecret(secret: string): Buffer {
  const raw = secret.startsWith("whsec_") ? secret.slice(6) : secret
  return Buffer.from(raw, "base64")
}

export function verifyWebhook(
  headers: WebhookHeaders,
  rawBody: string,
  secret: string | undefined,
  nowSeconds: number = Math.floor(Date.now() / 1000),
): VerifyResult {
  if (!secret) return { ok: false, reason: "no_secret" }
  const { id, timestamp, signature } = headers
  if (!id || !timestamp || !signature) {
    return { ok: false, reason: "missing_header" }
  }

  const ts = Number(timestamp)
  if (!Number.isFinite(ts) || Math.abs(nowSeconds - ts) > MAX_SKEW_SECONDS) {
    return { ok: false, reason: "stale" }
  }

  const expected = createHmac("sha256", decodeSecret(secret))
    .update(`${id}.${timestamp}.${rawBody}`)
    .digest()

  // During a secret rotation Bird sends every current signature,
  // space-delimited; any one matching is enough.
  for (const candidate of signature.split(" ")) {
    const [version, value] = candidate.split(",", 2)
    if (version !== "v1" || !value) continue
    const given = Buffer.from(value, "base64")
    if (given.length === expected.length && timingSafeEqual(given, expected)) {
      return { ok: true, id }
    }
  }
  return { ok: false, reason: "bad_signature" }
}

/** For a test, or a replay tool: the signature Bird would have sent. */
export function signWebhook(
  id: string,
  timestamp: string,
  rawBody: string,
  secret: string,
): string {
  const mac = createHmac("sha256", decodeSecret(secret))
    .update(`${id}.${timestamp}.${rawBody}`)
    .digest("base64")
  return `v1,${mac}`
}

/** The envelope every Bird event shares; `data` is per event type. */
export type WebhookEnvelope = {
  type: string
  timestamp: string
  data: Record<string, unknown>
}

export function parseEnvelope(rawBody: string): WebhookEnvelope | null {
  let parsed: unknown
  try {
    parsed = JSON.parse(rawBody)
  } catch {
    return null
  }
  if (typeof parsed !== "object" || parsed === null) return null
  const env = parsed as Record<string, unknown>
  if (typeof env.type !== "string") return null
  if (typeof env.data !== "object" || env.data === null) return null
  return {
    type: env.type,
    timestamp: typeof env.timestamp === "string" ? env.timestamp : "",
    data: env.data as Record<string, unknown>,
  }
}
