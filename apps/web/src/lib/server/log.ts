/**
 * One JSON object per line, on stdout — fields, never interpolated prose, so
 * a support ticket's error id becomes one query. Everything here has already
 * been through safeError ($lib/errors); never log a raw PostgresError.
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
