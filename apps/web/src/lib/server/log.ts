/**
 * One JSON object per line, on stdout.
 *
 * Deliberately not a logging library. `adapter-node` runs as a long-running
 * container ([docs/12-beta-deployment.md](../../../../docs/12-beta-deployment.md)),
 * and every host worth deploying it to captures stdout — so a line here is
 * already shippable to whatever collects logs, without the application knowing
 * which one that is. Choosing a vendor is a later decision this does not
 * foreclose.
 *
 * **Fields, never interpolated prose.** `"tenant abc had an error"` cannot be
 * filtered; `{"tenantId":"abc"}` can. The whole value of this file is that a
 * support ticket quoting an error id becomes one query.
 *
 * Everything that reaches here has already been through `safeError`
 * ([$lib/errors](../errors.ts)). Do not add a call site that logs a raw
 * `PostgresError`.
 */

type Level = "error" | "warn" | "info"

export type LogEntry = {
  /** The id the person on the phone is reading out. */
  id?: string
  msg: string
  [field: string]: unknown
}

function emit(level: Level, entry: LogEntry): void {
  const line = JSON.stringify({
    level,
    ts: new Date().toISOString(),
    ...entry,
  })
  // stderr for error, stdout otherwise — so a host that separates the two
  // still routes alerts correctly.
  if (level === "error") console.error(line)
  else console.log(line)
}

export const log = {
  error: (entry: LogEntry) => emit("error", entry),
  warn: (entry: LogEntry) => emit("warn", entry),
  info: (entry: LogEntry) => emit("info", entry),
}
