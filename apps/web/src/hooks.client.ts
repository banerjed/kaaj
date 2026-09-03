import type { HandleClientError } from "@sveltejs/kit"
import { safeError } from "$lib/errors"

/**
 * Browser half of the same rule: an unexpected error gets an id, shown on
 * screen. Goes to the browser console, not our logs — it only correlates
 * with a server log line when the underlying failure was server-side. Same
 * error allowlist as the server hook.
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
