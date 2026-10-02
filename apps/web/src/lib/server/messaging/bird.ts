import { env } from "$env/dynamic/private"

/**
 * The Bird API, as much of it as messaging uses: send an SMS, send an email,
 * fetch an inbound email's body, search and order a number. One regional
 * host per workspace key (eu1 / us1), chosen by PRIVATE_BIRD_REGION.
 *
 * `MessagingProvider` is the seam: the repository and the inbound handler
 * take a provider, the page actions build the real one from the
 * environment, and the tests pass a fake. Nothing here reads a tenant row.
 */

export type SendResult =
  | { sent: true; providerMessageId: string }
  | { sent: false; reason: "not_configured" | "send_failed"; detail?: string }

export type EmailAttachment = {
  filename: string
  content: Buffer
  contentType?: string
}

/** `"Acme <billing@acme.example>"` or a bare address, as Bird's `{email, name}`. */
export function parseSender(from: string): { email: string; name: string } {
  const m = from.match(/^\s*(?:"?([^"<]*)"?\s*)?<([^>]+)>\s*$/)
  if (m) return { email: m[2].trim(), name: (m[1] ?? "").trim() }
  return { email: from.trim(), name: "" }
}

export type AvailableNumber = {
  number: string
  country_code: string
  number_type: string
  capabilities: string[]
}

export type NumberOrder =
  | { ordered: true; numberId: string; number: string; status: string }
  | {
      ordered: false
      reason: "not_configured" | "order_failed"
      detail?: string
    }

export type MessagingProvider = {
  sendSms(input: {
    from: string
    to: string
    text: string
    idempotencyKey: string
    /** Echoed back on every status event — how a webhook finds its tenant. */
    metadata: Record<string, string>
  }): Promise<SendResult>
  sendEmail(input: {
    from: { email: string; name: string }
    to: string
    subject: string
    text?: string
    html?: string
    inReplyTo?: string | null
    attachments?: EmailAttachment[]
    idempotencyKey: string
    metadata: Record<string, string>
  }): Promise<SendResult>
  inboundEmailBody(
    inboundMessageId: string,
  ): Promise<{ html: string | null; text: string | null } | null>
  searchNumbers(input: {
    countryCode: string
    numberType?: string
  }): Promise<AvailableNumber[]>
  orderNumber(number: string): Promise<NumberOrder>
}

const HOSTS: Record<string, string> = {
  eu1: "https://eu1.platform.bird.com",
  us1: "https://us1.platform.bird.com",
}

export type BirdConfig = {
  apiKey: string | undefined
  region: string
  /** The catch-all subdomain every email endpoint's address lives at. */
  inboundDomain: string | undefined
  webhookSecret: string | undefined
}

export function birdConfig(): BirdConfig {
  return {
    apiKey: env.PRIVATE_BIRD_API_KEY || undefined,
    region: env.PRIVATE_BIRD_REGION || "eu1",
    inboundDomain: env.PRIVATE_MESSAGING_INBOUND_DOMAIN || undefined,
    webhookSecret: env.PRIVATE_BIRD_WEBHOOK_SECRET || undefined,
  }
}

type Fetch = typeof fetch

export function birdProvider(
  config: BirdConfig = birdConfig(),
  fetchImpl: Fetch = fetch,
): MessagingProvider {
  const host = HOSTS[config.region] ?? HOSTS.eu1

  async function call(
    path: string,
    init: { method: "GET" | "POST"; body?: unknown; idempotencyKey?: string },
  ): Promise<{ ok: boolean; status: number; json: unknown }> {
    const headers: Record<string, string> = {
      Authorization: `Bearer ${config.apiKey}`,
      Accept: "application/json",
    }
    if (init.body !== undefined) headers["Content-Type"] = "application/json"
    if (init.idempotencyKey) headers["Idempotency-Key"] = init.idempotencyKey
    const res = await fetchImpl(`${host}${path}`, {
      method: init.method,
      headers,
      body: init.body === undefined ? undefined : JSON.stringify(init.body),
    })
    let json: unknown = null
    try {
      json = await res.json()
    } catch {
      json = null
    }
    return { ok: res.ok, status: res.status, json }
  }

  const failure = (
    status: number,
    json: unknown,
  ): { sent: false; reason: "send_failed"; detail: string } => ({
    sent: false,
    reason: "send_failed",
    detail: errorDetail(status, json),
  })

  return {
    async sendSms({ from, to, text, idempotencyKey, metadata }) {
      if (!config.apiKey) return { sent: false, reason: "not_configured" }
      try {
        const r = await call("/v1/sms/messages", {
          method: "POST",
          idempotencyKey,
          body: { from, to, text, category: "transactional", metadata },
        })
        const id = idOf(r.json)
        if (!r.ok || !id) return failure(r.status, r.json)
        return { sent: true, providerMessageId: id }
      } catch (e) {
        return { sent: false, reason: "send_failed", detail: String(e) }
      }
    },

    async sendEmail({
      from,
      to,
      subject,
      text,
      html,
      inReplyTo,
      attachments,
      idempotencyKey,
      metadata,
    }) {
      if (!config.apiKey) return { sent: false, reason: "not_configured" }
      try {
        const r = await call("/v1/email/messages", {
          method: "POST",
          idempotencyKey,
          body: {
            from: from.name ? from : { email: from.email },
            to: [to],
            subject,
            ...(text ? { text } : {}),
            ...(html ? { html } : {}),
            ...(attachments && attachments.length > 0
              ? {
                  attachments: attachments.map((a) => ({
                    filename: a.filename,
                    content: a.content.toString("base64"),
                    ...(a.contentType ? { content_type: a.contentType } : {}),
                  })),
                }
              : {}),
            category: "transactional",
            metadata,
            track_opens: false,
            track_clicks: false,
            ...(inReplyTo
              ? { headers: { "In-Reply-To": inReplyTo, References: inReplyTo } }
              : {}),
          },
        })
        const id = idOf(r.json)
        if (!r.ok || !id) return failure(r.status, r.json)
        return { sent: true, providerMessageId: id }
      } catch (e) {
        return { sent: false, reason: "send_failed", detail: String(e) }
      }
    },

    async inboundEmailBody(inboundMessageId) {
      if (!config.apiKey) return null
      try {
        const r = await call(
          `/v1/email/inbound-messages/${encodeURIComponent(inboundMessageId)}/body`,
          { method: "GET" },
        )
        if (!r.ok || typeof r.json !== "object" || r.json === null) return null
        const body = r.json as { html?: unknown; text?: unknown }
        return {
          html: typeof body.html === "string" ? body.html : null,
          text: typeof body.text === "string" ? body.text : null,
        }
      } catch {
        return null
      }
    },

    async searchNumbers({ countryCode, numberType }) {
      if (!config.apiKey) return []
      const params = new URLSearchParams({
        country_code: countryCode,
        capabilities: "sms",
      })
      if (numberType) params.set("number_type", numberType)
      try {
        const r = await call(`/v1/numbers/available?${params}`, {
          method: "GET",
        })
        if (!r.ok) return []
        const data = (r.json as { data?: unknown })?.data
        if (!Array.isArray(data)) return []
        return data
          .filter(
            (n): n is AvailableNumber =>
              typeof n === "object" &&
              n !== null &&
              typeof (n as AvailableNumber).number === "string",
          )
          .map((n) => ({
            number: n.number,
            country_code: String(n.country_code ?? countryCode),
            number_type: String(n.number_type ?? ""),
            capabilities: Array.isArray(n.capabilities)
              ? n.capabilities.map(String)
              : [],
          }))
      } catch {
        return []
      }
    },

    async orderNumber(number) {
      if (!config.apiKey) return { ordered: false, reason: "not_configured" }
      try {
        const r = await call("/v1/numbers/orders", {
          method: "POST",
          body: { number },
        })
        const order = r.json as {
          number_id?: unknown
          number?: unknown
          status?: unknown
        } | null
        if (!r.ok || !order || typeof order.number_id !== "string") {
          return {
            ordered: false,
            reason: "order_failed",
            detail: errorDetail(r.status, r.json),
          }
        }
        return {
          ordered: true,
          numberId: order.number_id,
          number: typeof order.number === "string" ? order.number : number,
          status: typeof order.status === "string" ? order.status : "unknown",
        }
      } catch (e) {
        return { ordered: false, reason: "order_failed", detail: String(e) }
      }
    },
  }
}

function idOf(json: unknown): string | null {
  if (typeof json !== "object" || json === null) return null
  const id = (json as { id?: unknown }).id
  return typeof id === "string" && id ? id : null
}

/** A sentence for `status_detail` — Bird's own message when it gives one, else the status. Never the raw body: it may echo what was sent. */
function errorDetail(status: number, json: unknown): string {
  if (typeof json === "object" && json !== null) {
    const err = json as { error?: { message?: unknown }; message?: unknown }
    const message = err.error?.message ?? err.message
    if (typeof message === "string" && message) {
      return message.slice(0, 500)
    }
  }
  return `Bird answered HTTP ${status}`
}
