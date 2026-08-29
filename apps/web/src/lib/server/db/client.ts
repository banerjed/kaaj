/**
 * The application's connection to PostgreSQL.
 *
 * Connects as `app_user`, never the owner (L3). Not the Supabase Data API,
 * which is deliberately ungranted (L8). See docs/10-lessons-learned.md.
 */
import { env } from "$env/dynamic/private"
import postgres from "postgres"

// The one sanctioned piece of module-level server state: ADR-009 specifies this
// pool map, because connections are the scarce resource.
const pools = new Map<string, postgres.Sql>()

const SHARED = "shared"

function createPool(): postgres.Sql {
  const url = env.APP_DATABASE_URL
  if (!url) {
    throw new Error(
      "APP_DATABASE_URL is not set. It is the connection the application uses, " +
        "as the non-owner role app_user — deliberately distinct from DATABASE_URL, " +
        "which is the owner and bypasses row-level security. Run ./setup, or copy " +
        "the value from apps/web/.env.example.",
    )
  }

  return postgres(url, {
    max: 20, // ADR-009: shared tier. Dedicated pools stay at 2-4.
    idle_timeout: 60,
    connect_timeout: 10,
    // Keep NUMERIC as a string. Money lives in these columns; parse
    // deliberately at the point of use, never implicitly here.
    types: {},
    onnotice: () => {},
  })
}

/**
 * The connection for a tenant. Every tenant shares one pool today; the
 * parameter makes ADR-009's per-subdomain router a change of this function
 * body rather than of every repository.
 */
export function getConnection(_tenantId: string): postgres.Sql {
  let sql = pools.get(SHARED)
  if (!sql) {
    sql = createPool()
    pools.set(SHARED, sql)
  }
  return sql
}

/** Close every pool. For test teardown; the server never calls this. */
export async function closeConnections(): Promise<void> {
  const open = [...pools.values()]
  pools.clear()
  await Promise.all(open.map((sql) => sql.end({ timeout: 5 })))
}
