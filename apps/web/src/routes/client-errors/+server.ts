/**
 * Receives a best-effort error report from the browser (hooks.client.ts, the
 * root layout's window listeners — see $lib/client-error-report.ts) and
 * folds it into the same structured log and app_error_log table a server
 * error uses. `locals.tenantId` — resolved by the existing auth guard from
 * the request's own verified session — is authoritative; the submitted
 * body is never trusted for tenant identity, only for the error shape.
 */
import { json, type RequestHandler } from "@sveltejs/kit"
import type { SafeError } from "$lib/errors"
import { log } from "$lib/server/log"
import { recordError } from "$lib/server/observability/error-store"

const MAX_BODY_BYTES = 4096
const MAX_STRING = 500

function clamp(value: unknown): string | undefined {
  return typeof value === "string" ? value.slice(0, MAX_STRING) : undefined
}

/** Only the allowlisted shape, only defined fields — same contract as safeError(). */
function clampError(field: Record<string, unknown>): SafeError {
  const out: SafeError = {}
  for (const key of ["name", "message", "code"]) {
    const value = clamp(field[key])
    if (value !== undefined) out[key] = value
  }
  return out
}

export const POST: RequestHandler = async ({ request, locals }) => {
  const raw = await request.text()
  if (raw.length > MAX_BODY_BYTES) return json({ ok: false }, { status: 413 })

  let body: Record<string, unknown>
  try {
    body = JSON.parse(raw)
  } catch {
    return json({ ok: false }, { status: 400 })
  }

  const errorField =
    typeof body.error === "object" && body.error !== null
      ? (body.error as Record<string, unknown>)
      : {}

  const entry = {
    id: clamp(body.id) ?? crypto.randomUUID(),
    message: clamp(body.message) ?? "(no message)",
    status: typeof body.status === "number" ? body.status : undefined,
    route: clamp(body.route),
    error: clampError(errorField),
  }

  log.error({
    id: entry.id,
    requestId: locals.requestId,
    scope: "client",
    msg: entry.message,
    status: entry.status,
    route: entry.route,
    tenantId: locals.tenantId,
    error: entry.error,
  })

  void recordError(locals, {
    errorId: entry.id,
    requestId: locals.requestId,
    scope: "client",
    route: entry.route,
    status: entry.status,
    error: entry.error,
  })

  return json({ ok: true })
}
