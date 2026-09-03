import type { HandleClientError } from "@sveltejs/kit"
import { safeError } from "$lib/errors"

/**
 * The browser half of the same rule: an unexpected error gets an id, and that
 * id is on screen.
 *
 * Before this file existed there was no client error handling at all — a
 * failed hydration or a component that threw during navigation produced the
 * generic error page and nothing else, with no way for anyone to say WHICH
 * failure they had hit.
 *
 * **These lines go to the browser console, not to our logs.** That is a real
 * limit and worth stating plainly: an id minted here is quotable by the person
 * reporting the problem, and it correlates with a server log line only when
 * the underlying failure was also server-side (a `load` that threw, which is
 * the common case). Getting client-only errors into the same stream needs an
 * ingest endpoint or a collector — a decision about sub-processors and abuse
 * limits that is deliberately not made here.
 *
 * The same allowlist applies. It matters as much in the browser as on the
 * server: whatever this touches is one `fetch` away from leaving the machine
 * if a reporter is ever added above it.
 */
export const handleError: HandleClientError = ({
  error,
  event,
  status,
  message,
}) => {
  const id = crypto.randomUUID()

  if (status !== 404) {
    console.error(
      JSON.stringify({
        level: "error",
        scope: "client",
        ts: new Date().toISOString(),
        id,
        msg: message,
        status,
        route: event.route?.id ?? event.url?.pathname,
        error: safeError(error),
      }),
    )
  }

  return { id, message }
}
