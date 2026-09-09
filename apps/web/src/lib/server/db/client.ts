/**
 * The application's connections to PostgreSQL — one pool per resolved
 * database target (ADR-009: subdomain-routed database targets).
 *
 * Connects as `app_user`, never the owner (L3). Not the Supabase Data API,
 * which is deliberately ungranted (L8). See docs/10-lessons-learned.md.
 */
import { env } from "$env/dynamic/private"
import postgres from "postgres"
import { resolveTarget } from "./registry"

// The one sanctioned piece of module-level server state: ADR-009 specifies this
// pool map, because connections are the scarce resource.
const pools = new Map<string, { sql: postgres.Sql; lastUsed: number }>()
const MAX_POOLS = 50

const SHARED = "shared"

function createPool(url: string, tier: "shared" | "dedicated"): postgres.Sql {
  return postgres(url, {
    max: tier === "shared" ? 20 : 4, // ADR-009: dedicated pools stay small
    idle_timeout: 60,
    connect_timeout: 10,
    // Keep NUMERIC as a string. Money lives in these columns; parse
    // deliberately at the point of use, never implicitly here.
    types: {},
    onnotice: () => {},
  })
}

/** The shared tier's pool — also where the control plane (tenant_registry) lives. */
export function getSharedPool(): postgres.Sql {
  const hit = pools.get(SHARED)
  if (hit) {
    hit.lastUsed = Date.now()
    return hit.sql
  }

  const url = env.APP_DATABASE_URL
  if (!url) {
    throw new Error(
      "APP_DATABASE_URL is not set. It is the connection the application uses, " +
        "as the non-owner role app_user — deliberately distinct from DATABASE_URL, " +
        "which is the owner and bypasses row-level security. Run ./setup, or copy " +
        "the value from apps/web/.env.example.",
    )
  }

  const sql = createPool(url, "shared")
  pools.set(SHARED, { sql, lastUsed: Date.now() })
  return sql
}

function evictLeastRecentlyUsed(): void {
  let oldestKey: string | null = null
  let oldestTime = Infinity
  for (const [key, entry] of pools) {
    if (key === SHARED) continue // never evict the shared pool
    if (entry.lastUsed < oldestTime) {
      oldestTime = entry.lastUsed
      oldestKey = key
    }
  }
  if (oldestKey) {
    pools.get(oldestKey)?.sql.end({ timeout: 5 })
    pools.delete(oldestKey)
  }
}

/**
 * The connection for a tenant, resolved per request from `tenant_registry`
 * (ADR-009). Shared-tier tenants all land on `getSharedPool()`; a dedicated
 * tenant gets its own pool, keyed by its connection secret ref so two
 * tenants pointed at the same target would share a pool too.
 */
export async function getConnection(tenantId: string): Promise<postgres.Sql> {
  const target = await resolveTarget(tenantId)
  if (target.tier === "shared") return getSharedPool()

  const key = target.connectionSecretRef
  const hit = pools.get(key)
  if (hit) {
    hit.lastUsed = Date.now()
    return hit.sql
  }

  const sql = createPool(target.connectionUrl, "dedicated")
  if (pools.size >= MAX_POOLS) evictLeastRecentlyUsed()
  pools.set(key, { sql, lastUsed: Date.now() })
  return sql
}

/** Close every pool. For test teardown; the server never calls this. */
export async function closeConnections(): Promise<void> {
  const open = [...pools.values()]
  pools.clear()
  await Promise.all(open.map(({ sql }) => sql.end({ timeout: 5 })))
}
