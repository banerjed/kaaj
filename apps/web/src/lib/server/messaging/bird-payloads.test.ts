import { readdirSync, readFileSync } from "node:fs"
import { join } from "node:path"
import { describe, expect, it } from "vitest"
import type { MessagingProvider } from "./bird"
import { emailFields, handleBirdEvent, smsFields } from "./inbound"
import { parseEnvelope } from "./webhooks"

/**
 * Bird's payloads, as checked-in JSON under fixtures/bird/, read the way the
 * webhook reads them: the raw body through `parseEnvelope`, then the pure
 * field extractors the handler uses. Each fixture's `_source` says whether
 * it is a verbatim documentation example or a composition — a captured
 * delivery from the workspace replaces a composed one, and this file is
 * what tells us if the real shape differs from the assumed one.
 */

const DIR = join(import.meta.dirname, "fixtures/bird")

function fixture(name: string) {
  const raw = readFileSync(join(DIR, name), "utf8")
  const envelope = parseEnvelope(raw)
  if (!envelope) throw new Error(`${name} is not a Bird envelope`)
  return envelope
}

describe("every fixture", () => {
  it("is an envelope with a type, a timestamp, data, and a stated source", () => {
    const names = readdirSync(DIR).filter((n) => n.endsWith(".json"))
    expect(names.length).toBeGreaterThanOrEqual(6)
    for (const name of names) {
      const json = JSON.parse(readFileSync(join(DIR, name), "utf8"))
      expect(typeof json._source, name).toBe("string")
      const env = fixture(name)
      expect(env.type, name).toBe(name.replace(/(\.mailer)?\.json$/, ""))
      expect(Number.isNaN(new Date(env.timestamp).getTime()), name).toBe(false)
    }
  })
})

describe("sms.received", () => {
  it("yields Bird's id, both numbers in E.164, and the text", () => {
    expect(smsFields(fixture("sms.received.json").data)).toEqual({
      providerId: "sms_01krdgeqcxet5s7t44vh8rt9mg",
      from: "+15125550177",
      to: "+12125550100",
      text: "Is the invoice due Friday?",
    })
  })
})

describe("email.received", () => {
  it("yields the sender, every recipient lower-cased, the headers and the authentication results", () => {
    expect(emailFields(fixture("email.received.json").data)).toEqual({
      providerId: "rem_01krdgeqcxet5s7t44vh8rt9mh",
      from: "felix.ndiaye@acme.example",
      senderName: "Felix Ndiaye",
      recipients: ["northwind-7f3kq2@inbound.example"],
      subject: "Renewal paperwork",
      rfcMessageId: "<abc123@acme.example>",
      rfcInReplyTo: null,
      spfPass: true,
      dkimPass: true,
    })
  })
})

describe("status and suppression events", () => {
  /** Nothing here may reach Bird: these fixtures are routed by their metadata, never by a body fetch. */
  const provider: MessagingProvider = {
    sendSms: async () => {
      throw new Error("not reached")
    },
    sendEmail: async () => {
      throw new Error("not reached")
    },
    inboundEmailBody: async () => {
      throw new Error("not reached")
    },
    searchNumbers: async () => [],
    orderNumber: async () => {
      throw new Error("not reached")
    },
  }

  it("a delivery event about the product's own mail is ignored, not reported as unroutable", async () => {
    expect(
      await handleBirdEvent(fixture("email.delivered.mailer.json"), provider),
    ).toBe("ignored")
  })

  it("sms.delivered on a fixture message is routed by its metadata and applied — a message already delivered does not move again", async () => {
    // The fixture row f3…01 is already `delivered`, so the answer is
    // "ignored" (no transition), which proves the route through metadata
    // reached the row under the tenant's own policies.
    expect(await handleBirdEvent(fixture("sms.delivered.json"), provider)).toBe(
      "ignored",
    )
  })
})
