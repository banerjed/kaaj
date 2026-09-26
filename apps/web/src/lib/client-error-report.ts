/**
 * Shared by hooks.client.ts (SvelteKit's own client error hook — a thrown
 * error in `load`/component rendering) and the root layout's window
 * listeners (a raw exception or an unhandled rejection outside SvelteKit's
 * own control flow, which the hook never sees). Both funnel into the same
 * server-side record via `POST /client-errors`, so item 2 (the queryable
 * error log) covers client errors too, not just server ones.
 *
 * Best-effort only: never throws, never blocks the caller, and swallows a
 * failed report rather than becoming a second error.
 */
import { safeError } from "$lib/errors"

export type ClientErrorPayload = {
  id: string
  message: string
  status?: number
  route?: string | null
  error: ReturnType<typeof safeError>
}

export function reportClientError(payload: ClientErrorPayload): void {
  try {
    const body = JSON.stringify(payload)
    if (
      navigator.sendBeacon?.(
        "/client-errors",
        new Blob([body], { type: "application/json" }),
      )
    ) {
      return
    }
    void fetch("/client-errors", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body,
      keepalive: true,
    }).catch(() => {})
  } catch {
    // Reporting an error must never itself throw.
  }
}
