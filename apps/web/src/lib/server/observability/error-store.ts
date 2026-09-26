/**
 * Persists an unexpected error into `app_error_log` (control plane, ADR-009)
 * so it is queryable across every tenant regardless of which physical
 * database that tenant's own data lives in. Never throws: a failed write
 * here must not turn an already-handled error into an unhandled one, and
 * must not block the response that's already being sent back.
 */
import type { SafeError } from "$lib/errors"
import { actorFrom, withControlPlane } from "$lib/server/db/tenant"
import { log } from "$lib/server/log"

export type ErrorLogEntry = {
  errorId: string
  requestId?: string
  scope: "server" | "client"
  route?: string | null
  status?: number | null
  error: SafeError
}

export async function recordError(
  locals: App.Locals,
  entry: ErrorLogEntry,
): Promise<void> {
  if (!locals.tenantId) return // no resolvable tenant — stays in stdout only, see CLAUDE.md/plan

  try {
    await withControlPlane(
      actorFrom(locals),
      (tx) =>
        tx`
        INSERT INTO app_error_log
          (tenant_id, error_id, request_id, scope, route, status, name, message, code)
        VALUES (
          ${locals.tenantId}, ${entry.errorId}, ${entry.requestId ?? null},
          ${entry.scope}, ${entry.route ?? null}, ${entry.status ?? null},
          ${entry.error.name ?? null}, ${entry.error.message ?? null}, ${entry.error.code ?? null}
        )
      `,
    )
  } catch (writeError) {
    log.warn({
      msg: "failed to persist error-log row",
      errorId: entry.errorId,
      error:
        writeError instanceof Error
          ? { name: writeError.name, message: writeError.message }
          : { name: typeof writeError, message: String(writeError) },
    })
  }
}
