import { json } from "@sveltejs/kit"
import type { RequestHandler } from "./$types"
import { birdConfig, birdProvider } from "$lib/server/messaging/bird"
import { handleBirdEvent } from "$lib/server/messaging/inbound"
import { parseEnvelope, verifyWebhook } from "$lib/server/messaging/webhooks"
import { log } from "$lib/server/log"
import { safeError } from "$lib/errors"

/**
 * Bird's one webhook into Kaaj (docs/37-messaging.md §4). No session, no
 * tenant: the signature is the only authentication, and the tenant comes
 * from the address the event was sent to. Answers 200 for anything it has
 * dealt with — including an event it chose to ignore, or one it cannot
 * route — so that Bird does not redeliver it for 27 hours; answers 5xx
 * only for a failure Kaaj wants redelivered.
 */
export const POST: RequestHandler = async ({ request }) => {
  const config = birdConfig()
  const rawBody = await request.text()
  const verdict = verifyWebhook(
    {
      id: request.headers.get("webhook-id"),
      timestamp: request.headers.get("webhook-timestamp"),
      signature: request.headers.get("webhook-signature"),
    },
    rawBody,
    config.webhookSecret,
  )
  if (!verdict.ok) {
    log.warn({ msg: "bird webhook refused", reason: verdict.reason })
    return json({ error: verdict.reason }, { status: 401 })
  }

  const envelope = parseEnvelope(rawBody)
  if (!envelope) return json({ error: "bad_envelope" }, { status: 400 })

  try {
    const outcome = await handleBirdEvent(envelope, birdProvider(config))
    if (outcome === "unroutable") {
      log.warn({
        msg: "bird event for no tenant",
        type: envelope.type,
        webhookId: verdict.id,
      })
    }
    return json({ outcome })
  } catch (e) {
    log.error({
      msg: "bird webhook failed",
      type: envelope.type,
      webhookId: verdict.id,
      error: safeError(e),
    })
    return json({ error: "internal" }, { status: 500 })
  }
}
