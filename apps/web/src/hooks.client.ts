import type { HandleClientError } from "@sveltejs/kit"
import { safeError } from "$lib/errors"
import { reportClientError } from "$lib/client-error-report"

/**
 * Browser half of the same rule: an unexpected error gets an id, shown on
 * screen. Goes to the browser console, not our logs — and, since item 2,
 * also reported to the server (`POST /client-errors`) so it lands in the same
 * queryable error log as a server-side failure. Same error allowlist as the
 * server hook.
 */
export const handleError: HandleClientError = ({
  error,
  event,
  status,
  message,
}) => {
  const id = crypto.randomUUID()
  const route = event.route?.id ?? event.url?.pathname

  if (status !== 404) {
    const safe = safeError(error)
    console.error(
      JSON.stringify({
        level: "error",
        scope: "client",
        ts: new Date().toISOString(),
        id,
        msg: message,
        status,
        route,
        error: safe,
      }),
    )
    reportClientError({ id, message, status, route, error: safe })
  }

  return { id, message }
}
