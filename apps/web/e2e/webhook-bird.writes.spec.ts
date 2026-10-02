import { expect, test, type APIRequestContext } from "@playwright/test"
import { createHmac } from "node:crypto"
import postgres from "postgres"
import { E2E_WEBHOOK_SECRET } from "../playwright.config"

/**
 * The Bird webhook, end to end: a signed HTTP POST to the running app, the
 * rows it files, and the page a person then opens. The only spec that
 * WRITES, so it runs in the `writes` project alone and removes every row it
 * made — the fixture it writes into is the one every other suite asserts
 * exact counts against.
 *
 * Addresses are chosen to match nothing in the fixture, so the threads it
 * opens are its own; cleanup is by those addresses, as the owner, through
 * the same raw connection the unit tests use for what app_user may not do.
 */

const NORTHWIND = "07fb03f8-1521-5ef4-9c2d-25fcfa297ac1"
/** The fixture's SMS number and inbound address — what Bird would deliver TO. */
const OUR_NUMBER = "+12125550100"
const OUR_ADDRESS = "northwind-7f3kq2@inbound.example"
/** Nobody in the fixture; normalised forms below. */
const THEIR_NUMBER_RAW = "+1 (646) 555-0199"
const THEIR_NUMBER = "+16465550199"
const THEIR_ADDRESS = "e2e.sender@elsewhere.example"

const superuser = postgres(
  process.env.DATABASE_URL ??
    "postgresql://postgres:postgres@127.0.0.1:54322/postgres",
  { max: 1, types: {}, onnotice: () => {} },
)

function signed(
  body: string,
  id: string,
  timestamp = Math.floor(Date.now() / 1000),
) {
  const key = Buffer.from(E2E_WEBHOOK_SECRET.slice("whsec_".length), "base64")
  const mac = createHmac("sha256", key)
    .update(`${id}.${timestamp}.${body}`)
    .digest("base64")
  return {
    "content-type": "application/json",
    "webhook-id": id,
    "webhook-timestamp": String(timestamp),
    "webhook-signature": `v1,${mac}`,
  }
}

async function deliver(
  request: APIRequestContext,
  id: string,
  event: Record<string, unknown>,
  headers?: Record<string, string>,
) {
  const body = JSON.stringify(event)
  return request.post("/webhooks/bird", {
    data: body,
    headers: headers ?? signed(body, id),
  })
}

const run = Date.now().toString(36)

async function cleanup() {
  await superuser.begin(async (tx) => {
    await tx`
      DELETE FROM messaging_messages
       WHERE tenant_id = ${NORTHWIND}::uuid
         AND conversation_id IN (
           SELECT id FROM messaging_conversations
            WHERE tenant_id = ${NORTHWIND}::uuid
              AND counterparty_address IN (${THEIR_NUMBER}, ${THEIR_ADDRESS}))`
    await tx`
      DELETE FROM messaging_conversations
       WHERE tenant_id = ${NORTHWIND}::uuid
         AND counterparty_address IN (${THEIR_NUMBER}, ${THEIR_ADDRESS})`
    await tx`
      DELETE FROM messaging_opt_outs
       WHERE tenant_id = ${NORTHWIND}::uuid AND address IN (${THEIR_NUMBER}, ${THEIR_ADDRESS})`
  })
}

test.describe.configure({ mode: "serial" })

test.beforeAll(cleanup)
test.afterAll(async () => {
  await cleanup()
  await superuser.end()
})

test("an unsigned or tampered delivery is refused with 401 and files nothing", async ({
  request,
}) => {
  const event = {
    type: "sms.received",
    timestamp: new Date().toISOString(),
    data: {
      sms_id: `sms_e2e_${run}_x`,
      from: THEIR_NUMBER_RAW,
      to: OUR_NUMBER,
      text: "forged",
    },
  }
  const body = JSON.stringify(event)
  const unsigned = await request.post("/webhooks/bird", {
    data: body,
    headers: { "content-type": "application/json" },
  })
  expect(unsigned.status()).toBe(401)

  const tampered = signed(body.replace("forged", "forged!"), `wh_${run}_t`)
  const bad = await request.post("/webhooks/bird", {
    data: body,
    headers: tampered,
  })
  expect(bad.status()).toBe(401)

  const [{ n }] = await superuser<{ n: number }[]>`
    SELECT count(*)::int AS n FROM messaging_messages
     WHERE tenant_id = ${NORTHWIND}::uuid AND from_address = ${THEIR_NUMBER}`
  expect(n).toBe(0)
})

test("a signed inbound SMS opens a thread the inbox and the thread page show; a redelivery files nothing twice", async ({
  request,
  page,
}) => {
  const event = {
    type: "sms.received",
    timestamp: new Date().toISOString(),
    data: {
      sms_id: `sms_e2e_${run}_1`,
      from: THEIR_NUMBER_RAW,
      to: OUR_NUMBER,
      text: `Hello from the e2e run ${run}`,
    },
  }
  const first = await deliver(request, `wh_${run}_1`, event)
  expect(first.status()).toBe(200)
  expect(await first.json()).toEqual({ outcome: "handled" })

  // Bird redelivers the same event for 27 hours if it ever saw a non-2xx;
  // the same provider id must file nothing.
  const again = await deliver(request, `wh_${run}_1b`, event)
  expect(await again.json()).toEqual({ outcome: "duplicate" })

  const [thread] = await superuser<
    { id: string; has_unread: boolean; n: number }[]
  >`
    SELECT c.id, c.has_unread,
           (SELECT count(*)::int FROM messaging_messages m WHERE m.conversation_id = c.id) AS n
      FROM messaging_conversations c
     WHERE c.tenant_id = ${NORTHWIND}::uuid AND c.counterparty_address = ${THEIR_NUMBER}`
  expect(thread.n).toBe(1)
  expect(thread.has_unread).toBe(true)

  await page.goto("/messaging?unread=on")
  await expect(page.getByRole("link", { name: THEIR_NUMBER })).toBeVisible()

  await page.goto(`/messaging/${thread.id}`)
  await expect(
    page.getByRole("heading", { name: THEIR_NUMBER, exact: false }),
  ).toBeVisible()
  await expect(page.getByText(`Hello from the e2e run ${run}`)).toBeVisible()
})

test("STOP from that number records an opt-out that the send path then refuses", async ({
  request,
  page,
}) => {
  const res = await deliver(request, `wh_${run}_2`, {
    type: "sms.received",
    timestamp: new Date().toISOString(),
    data: {
      sms_id: `sms_e2e_${run}_2`,
      from: THEIR_NUMBER,
      to: OUR_NUMBER,
      text: "STOP",
    },
  })
  expect(await res.json()).toEqual({ outcome: "handled" })

  const [opt] = await superuser<{ reason: string }[]>`
    SELECT reason FROM messaging_opt_outs
     WHERE tenant_id = ${NORTHWIND}::uuid AND address = ${THEIR_NUMBER} AND revoked_at IS NULL`
  expect(opt?.reason).toBe("stop")

  // The thread page still renders; a reply is refused before anything
  // could leave, with the address field named.
  const [thread] = await superuser<{ id: string }[]>`
    SELECT id FROM messaging_conversations
     WHERE tenant_id = ${NORTHWIND}::uuid AND counterparty_address = ${THEIR_NUMBER}`
  await page.goto(`/messaging/${thread.id}`)
  await page.locator('textarea[name="body"]').fill("Are you still there?")
  await page.locator('form[action="?/reply"] button[type="submit"]').click()
  await expect(page.getByText("asked not to be contacted")).toBeVisible()
  const [{ n }] = await superuser<{ n: number }[]>`
    SELECT count(*)::int AS n FROM messaging_messages
     WHERE conversation_id = ${thread.id}::uuid AND direction = 'outbound'`
  expect(n).toBe(0)
})

test("a signed inbound email files under the catch-all address, with the body marked unavailable when Bird is not configured", async ({
  request,
  page,
}) => {
  const res = await deliver(request, `wh_${run}_3`, {
    type: "email.received",
    timestamp: new Date().toISOString(),
    data: {
      inbound_message_id: `rem_e2e_${run}_3`,
      from: { email: THEIR_ADDRESS.toUpperCase(), name: "E2E Sender" },
      to: [{ email: OUR_ADDRESS }],
      subject: `Question from run ${run}`,
      message_id: `<${run}@elsewhere.example>`,
      spf_pass: true,
      dkim_pass: false,
    },
  })
  expect(await res.json()).toEqual({ outcome: "handled" })

  const [thread] = await superuser<
    { id: string; subject: string; counterparty_name: string }[]
  >`
    SELECT id, subject, counterparty_name FROM messaging_conversations
     WHERE tenant_id = ${NORTHWIND}::uuid AND counterparty_address = ${THEIR_ADDRESS}`
  expect(thread.subject).toBe(`Question from run ${run}`)
  expect(thread.counterparty_name).toBe("E2E Sender")

  await page.goto(`/messaging/${thread.id}`)
  await expect(
    page.getByText("The message body could not be retrieved"),
  ).toBeVisible()
  // DKIM failed: the sender is flagged, not hidden.
  await expect(page.getByText("unverified sender")).toBeVisible()
})

test("an event for an address no tenant owns is acknowledged, not retried, and files nothing", async ({
  request,
}) => {
  const res = await deliver(request, `wh_${run}_4`, {
    type: "sms.received",
    timestamp: new Date().toISOString(),
    data: {
      sms_id: `sms_e2e_${run}_4`,
      from: THEIR_NUMBER,
      to: "+19995550000",
      text: "lost",
    },
  })
  expect(res.status()).toBe(200)
  expect(await res.json()).toEqual({ outcome: "unroutable" })
})
