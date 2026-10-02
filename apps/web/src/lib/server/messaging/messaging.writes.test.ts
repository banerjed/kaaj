import { afterAll, describe, expect, it, vi } from "vitest"
import { closeConnections } from "../db/client"
import { withTenant, type Actor, type Tx } from "../db/tenant"
import type { AuthContext } from "../auth/can"
import type { MessagingProvider } from "./bird"
import {
  handleBirdEvent,
  routeAddress,
  stripHtml,
  systemActor,
} from "./inbound"
import * as messaging from "./messaging.repo"
import { prepareSend, SendRefused, type SendInput } from "./send"

/**
 * The messaging write paths, against the real database, every case rolled
 * back. The inbound handler's committing branches are exercised through
 * the repository functions they call (inside a rollback); the handler
 * itself is asserted on the branches that write nothing — ignored,
 * unroutable — and on the routing read that precedes any write.
 */

const NORTHWIND = "07fb03f8-1521-5ef4-9c2d-25fcfa297ac1"
const SARAH = "6d466aa9-e51a-5d52-9015-152600855932"

const SMS_ENDPOINT = "f0000000-0000-4000-8000-000000000001"
const EMAIL_ENDPOINT = "f0000000-0000-4000-8000-000000000002"
const RETIRED_ENDPOINT = "f0000000-0000-4000-8000-000000000003"
const DANA_THREAD = "f2000000-0000-4000-8000-000000000001"
const FELIX_THREAD = "f2000000-0000-4000-8000-000000000002"
const THEO_THREAD_CLOSED = "f2000000-0000-4000-8000-000000000003"
const IMOGEN_REVOKED_OPT_OUT = "f1000000-0000-4000-8000-000000000002"

const salesAdmin: Actor = {
  tenantId: NORTHWIND,
  employeeId: SARAH,
  customerContactId: null,
  customerId: null,
  role: "employee",
  functionalRoles: ["sales_admin"],
}
const salesCtx: AuthContext = {
  tenantId: NORTHWIND,
  userId: "00000000-0000-0000-0000-000000000009",
  employeeId: SARAH,
  customerContactId: null,
  customerId: null,
  role: "employee",
  functionalRoles: ["sales_admin"],
}

async function inRollback<T>(
  actor: Actor,
  fn: (tx: Tx) => Promise<T>,
): Promise<T> {
  const marker = new Error("__rollback__")
  try {
    return await withTenant(actor, async (tx) => {
      const result = await fn(tx)
      throw Object.assign(marker, { result })
    })
  } catch (e) {
    if (e === marker) return (e as { result: T }).result
    throw e
  }
}

/** A provider that must never be reached by a refused send. */
function untouchedProvider(): MessagingProvider {
  const refuse = vi.fn(async () => {
    throw new Error("provider must not be called")
  })
  return {
    sendSms: refuse as unknown as MessagingProvider["sendSms"],
    sendEmail: refuse as unknown as MessagingProvider["sendEmail"],
    inboundEmailBody: vi.fn(async () => null),
    searchNumbers: vi.fn(async () => []),
    orderNumber: refuse as unknown as MessagingProvider["orderNumber"],
  }
}

afterAll(async () => {
  await closeConnections()
})

describe("routing an address to a tenant, before any tenant is known", () => {
  it("resolves a live number and a live inbound address", async () => {
    expect(await routeAddress("sms", "+12125550100")).toBe(NORTHWIND)
    expect(
      await routeAddress("email", "northwind-7f3kq2@inbound.example"),
    ).toBe(NORTHWIND)
  })

  it("resolves nothing for a retired number or an unknown address", async () => {
    expect(await routeAddress("sms", "+442079460100")).toBeNull()
    expect(await routeAddress("sms", "+19995550000")).toBeNull()
    expect(await routeAddress("email", "nobody@inbound.example")).toBeNull()
  })
})

describe("the inbound handler's non-writing branches", () => {
  const provider = untouchedProvider()

  it("ignores an event type it does not know", async () => {
    expect(
      await handleBirdEvent(
        { type: "voice.ringing", timestamp: "", data: {} },
        provider,
      ),
    ).toBe("ignored")
  })

  it("ignores an SMS with no sender, number or id", async () => {
    expect(
      await handleBirdEvent(
        { type: "sms.received", timestamp: "", data: { to: "+12125550100" } },
        provider,
      ),
    ).toBe("ignored")
  })

  it("reports an SMS to a number no tenant owns as unroutable", async () => {
    expect(
      await handleBirdEvent(
        {
          type: "sms.received",
          timestamp: "",
          data: {
            sms_id: "sms_x",
            from: "+15551234567",
            to: "+19995550000",
            text: "hi",
          },
        },
        provider,
      ),
    ).toBe("unroutable")
  })

  it("reports an email to no inbound address of ours as unroutable, without fetching a body", async () => {
    expect(
      await handleBirdEvent(
        {
          type: "email.received",
          timestamp: "",
          data: {
            inbound_message_id: "rem_x",
            from: { email: "a@b.example", name: "A" },
            to: [{ email: "someone@elsewhere.example" }],
          },
        },
        provider,
      ),
    ).toBe("unroutable")
    expect(provider.inboundEmailBody).not.toHaveBeenCalled()
  })

  it("reports a status event with no tenant in its metadata as unroutable", async () => {
    expect(
      await handleBirdEvent(
        { type: "sms.delivered", timestamp: "", data: { sms_id: "sms_x" } },
        provider,
      ),
    ).toBe("unroutable")
  })

  it("reduces HTML to readable text when a mail has no plain part", () => {
    expect(stripHtml("<p>Hello<br>there</p><p>&amp; bye</p>")).toBe(
      "Hello\nthere\n& bye",
    )
  })
})

describe("filing an inbound message (as the system actor)", () => {
  it("matches the sender to a CRM contact, digit for digit, and by email case-insensitively", async () => {
    const { bySms, byEmail } = await inRollback(
      systemActor(NORTHWIND),
      async (tx) => ({
        bySms: await messaging.matchContact(tx, "sms", "+12125550201"),
        byEmail: await messaging.matchContact(
          tx,
          "email",
          "felix.ndiaye@acme.example",
        ),
      }),
    )
    expect(bySms?.name).toBe("Dana Whitcombe")
    expect(byEmail?.name).toBe("Felix Ndiaye")
  })

  it("finds the existing thread for a known pair and opens one for a new number", async () => {
    const { existing, fresh } = await inRollback(
      systemActor(NORTHWIND),
      async (tx) => {
        const existing = await messaging.findOrOpenConversation(tx, NORTHWIND, {
          channel: "sms",
          endpointId: SMS_ENDPOINT,
          counterpartyAddress: "+12125550201",
          counterpartyName: null,
          contact: null,
          subject: null,
          direction: "inbound",
        })
        const fresh = await messaging.findOrOpenConversation(tx, NORTHWIND, {
          channel: "sms",
          endpointId: SMS_ENDPOINT,
          counterpartyAddress: "+15550001111",
          counterpartyName: null,
          contact: null,
          subject: null,
          direction: "inbound",
        })
        return { existing, fresh }
      },
    )
    expect(existing).toBe(DANA_THREAD)
    expect(fresh).not.toBe(DANA_THREAD)
  })

  it("files once, marks the thread unread and reopens it, and files nothing on a redelivery", async () => {
    const result = await inRollback(systemActor(NORTHWIND), async (tx) => {
      const input = {
        conversationId: THEO_THREAD_CLOSED,
        fromAddress: "+15125550201",
        toAddress: "+12125550100",
        subject: null,
        bodyText: "Actually, can we move it to Friday?",
        bodyHtml: null,
        providerMessageId: "sms_test_redelivered",
        rfcMessageId: null,
        rfcInReplyTo: null,
        spfPass: null,
        dkimPass: null,
        occurredAt: new Date("2026-10-02T10:00:00Z"),
      }
      const first = await messaging.recordInbound(tx, NORTHWIND, input)
      const second = await messaging.recordInbound(tx, NORTHWIND, input)
      const convo = await messaging.conversationById(tx, THEO_THREAD_CLOSED)
      const [{ n }] = await tx<{ n: number }[]>`
        SELECT count(*)::int AS n FROM messaging_messages
         WHERE provider_message_id = 'sms_test_redelivered'
      `
      return { first, second, convo, n }
    })
    expect(result.first.duplicate).toBe(false)
    expect(result.second).toEqual({ id: null, duplicate: true })
    expect(result.n).toBe(1)
    expect(result.convo?.status).toBe("open")
    expect(result.convo?.has_unread).toBe(true)
    expect(result.convo?.last_direction).toBe("inbound")
  })

  it("re-arms a lifted opt-out on a new STOP rather than colliding", async () => {
    expect(messaging.isStopMessage(" stop ")).toBe(true)
    expect(messaging.isStopMessage("stop that")).toBe(false)
    const { before, after } = await inRollback(
      systemActor(NORTHWIND),
      async (tx) => {
        const before = await messaging.isOptedOut(
          tx,
          "email",
          "imogen.faulkner@britco.example",
        )
        await messaging.recordOptOut(tx, NORTHWIND, {
          channel: "email",
          address: "imogen.faulkner@britco.example",
          reason: "preference",
          notedBy: null,
        })
        const after = await messaging.isOptedOut(
          tx,
          "email",
          "imogen.faulkner@britco.example",
        )
        const [row] = await tx<{ reason: string; revoked_at: Date | null }[]>`
        SELECT reason, revoked_at FROM messaging_opt_outs WHERE id = ${IMOGEN_REVOKED_OPT_OUT}::uuid
      `
        return { before, after, row }
      },
    )
    expect(before).toBe(false)
    expect(after).toBe(true)
  })
})

describe("delivery status moves forward only", () => {
  it("accepts failed after sent, with Bird's reason, and ignores a late sent after delivered", async () => {
    const { failedMoved, lateSentMoved, detail } = await inRollback(
      systemActor(NORTHWIND),
      async (tx) => {
        const failedMoved = await messaging.applyStatusEvent(
          tx,
          "em_fixture000000000000000004",
          "failed",
          "550 mailbox unavailable",
        )
        const lateSentMoved = await messaging.applyStatusEvent(
          tx,
          "sms_fixture00000000000000001",
          "sent",
          null,
        )
        const [row] = await tx<{ status_detail: string | null }[]>`
          SELECT status_detail FROM messaging_messages
           WHERE provider_message_id = 'em_fixture000000000000000004'
        `
        return { failedMoved, lateSentMoved, detail: row.status_detail }
      },
    )
    expect(failedMoved).toBe(true)
    expect(lateSentMoved).toBe(false)
    expect(detail).toBe("550 mailbox unavailable")
  })

  it("answers false for a provider id nobody has", async () => {
    const moved = await inRollback(systemActor(NORTHWIND), (tx) =>
      messaging.applyStatusEvent(tx, "sms_nobody", "delivered", null),
    )
    expect(moved).toBe(false)
  })
})

describe("an outbound row's own transitions", () => {
  it("goes queued -> accepted with Bird's id, and a second markSent does nothing", async () => {
    const { first, second, row } = await inRollback(salesAdmin, async (tx) => {
      const id = await messaging.recordOutbound(tx, NORTHWIND, {
        conversationId: DANA_THREAD,
        fromAddress: "+12125550100",
        toAddress: "+12125550201",
        subject: null,
        bodyText: "Following up.",
        bodyHtml: null,
        rfcInReplyTo: null,
        authorEmployeeId: SARAH,
      })
      const first = await messaging.markSent(tx, id, "sms_new", null)
      const second = await messaging.markSent(tx, id, "sms_other", null)
      const [row] = await tx<{ status: string; provider_message_id: string }[]>`
        SELECT status, provider_message_id FROM messaging_messages WHERE id = ${id}::uuid
      `
      return { first, second, row }
    })
    expect(first).toBe(true)
    expect(second).toBe(false)
    expect(row).toEqual({ status: "accepted", provider_message_id: "sms_new" })
  })
})

describe("prepareSend() refuses before anything is written", () => {
  const provider = untouchedProvider()
  const base = {
    contactId: null,
    rawAddress: null,
    subject: null,
    body: "Hello",
    conversationId: null,
  }
  const prepare = (actor: Actor, ctx: AuthContext, input: SendInput) =>
    inRollback(actor, (tx) => prepareSend(tx, ctx, input))

  it("refuses an address that opted out", async () => {
    await expect(
      prepare(salesAdmin, salesCtx, {
        ...base,
        channel: "sms",
        endpointId: SMS_ENDPOINT,
        rawAddress: "+1 (512) 555-0201",
      }),
    ).rejects.toMatchObject({ name: "SendRefused", reason: "opted_out" })
  })

  it("refuses a retired endpoint, a channel mismatch, and a bad address", async () => {
    await expect(
      prepare(salesAdmin, salesCtx, {
        ...base,
        channel: "sms",
        endpointId: RETIRED_ENDPOINT,
        rawAddress: "+15550001111",
      }),
    ).rejects.toMatchObject({ reason: "endpoint_inactive" })
    await expect(
      prepare(salesAdmin, salesCtx, {
        ...base,
        channel: "sms",
        endpointId: EMAIL_ENDPOINT,
        rawAddress: "+15550001111",
      }),
    ).rejects.toMatchObject({ reason: "wrong_channel" })
    await expect(
      prepare(salesAdmin, salesCtx, {
        ...base,
        channel: "sms",
        endpointId: SMS_ENDPOINT,
        rawAddress: "not a number",
      }),
    ).rejects.toMatchObject({ reason: "bad_address" })
    expect(provider.sendSms).not.toHaveBeenCalled()
  })

  it("refuses an endpoint another role cannot see as if it did not exist", async () => {
    const plainEmployee: Actor = { ...salesAdmin, functionalRoles: [] }
    await expect(
      prepare(
        plainEmployee,
        { ...salesCtx, functionalRoles: [] },
        {
          ...base,
          channel: "sms",
          endpointId: SMS_ENDPOINT,
          rawAddress: "+15550001111",
        },
      ),
    ).rejects.toMatchObject({ reason: "no_such_endpoint" })
  })

  it("queues a reply into an existing thread, threaded under the newest inbound Message-ID", async () => {
    const prepared = await prepare(salesAdmin, salesCtx, {
      ...base,
      channel: "email",
      endpointId: EMAIL_ENDPOINT,
      conversationId: FELIX_THREAD,
      body: "Here they are.",
    })
    expect(prepared.to).toBe("felix.ndiaye@acme.example")
    expect(prepared.subject).toBe("Re: Renewal paperwork")
    expect(prepared.inReplyTo).toBe("<abc123@acme.example>")
    expect(provider.sendEmail).not.toHaveBeenCalled()
  })

  it("tells the form which field, in a sentence", () => {
    expect(new SendRefused("opted_out").refusal().errorFields).toEqual([
      "address",
    ])
    expect(new SendRefused("wrong_channel").refusal().errorFields).toEqual([
      "endpoint_id",
    ])
  })
})
