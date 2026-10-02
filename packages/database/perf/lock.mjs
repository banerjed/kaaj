/**
 * One perf run at a time on the shared perf cluster. Every session's push
 * runs `regress`; two at once would delete each other's registration, fight
 * over the preview port and reset each other's query statistics, and one
 * during a `seed` would VACUUM and migrate under the generator and change
 * the layout the budget depends on (L118). A session-level lock on its own
 * connection dies with the process, so a crashed run never leaves it held.
 */
import postgres from "postgres"

const PERF_RUN_LOCK = 7_317_455_201 // any fixed key

/** Waits for the lock; resolves to a function that releases it. */
export async function holdPerfLock(url, notFound) {
  const lock = postgres(url, { onnotice: () => {}, max: 1 })
  try {
    const [held] = await lock`SELECT pg_try_advisory_lock(${PERF_RUN_LOCK}) AS ok`.catch(() => {
      throw new Error(notFound)
    })
    if (!held.ok) {
      console.log("  another perf run is in progress — waiting for it to finish…")
      await lock`SELECT pg_advisory_lock(${PERF_RUN_LOCK})`
    }
  } catch (e) {
    await lock.end()
    throw e
  }
  return () => lock.end()
}
