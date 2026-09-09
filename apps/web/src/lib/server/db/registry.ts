/**
 * Resolves a tenant to the database it lives in, per ADR-009's control
 * plane (`tenant_registry`, in the shared database).
 *
 * Deliberately does not import from `./tenant` (`withTenant`/`withControlPlane`)
 * even though the query below duplicates their claims-setting shape —
 * `client.ts` imports this module to build the very connection those
 * helpers depend on, so importing back would be circular. The duplication
 * is a handful of lines; keep it that way rather than "fixing" it into a
 * cycle.
 */
import { getSharedPool } from "./client"
import { resolveSecret } from "./secrets"

export type Target =
  | { tier: "shared" }
  | { tier: "dedicated"; connectionSecretRef: string; connectionUrl: string }

type RegistryRow = {
  tier: "shared" | "dedicated"
  connection_secret_ref: string | null
}

const CACHE_TTL_MS = 30_000
const cache = new Map<string, { target: Target; expiresAt: number }>()

/**
 * A tenant with no `tenant_registry` row defaults to shared — the
 * backward-compatible outcome for any tenant that predates this table, and
 * the correct outcome for a freshly-signed-up tenant nobody has deliberately
 * provisioned onto a dedicated database yet.
 */
const SHARED: Target = { tier: "shared" }

export async function resolveTarget(tenantId: string): Promise<Target> {
  const hit = cache.get(tenantId)
  if (hit && hit.expiresAt > Date.now()) return hit.target

  const shared = getSharedPool()
  const claims = JSON.stringify({ app_metadata: { tenant_id: tenantId } })
  const [row] = await shared.begin<RegistryRow[]>(async (tx) => {
    await tx`SET LOCAL ROLE app_user`
    await tx`SELECT set_config('request.jwt.claims', ${claims}, true)`
    return tx<RegistryRow[]>`
      SELECT tier, connection_secret_ref
        FROM tenant_registry
       WHERE tenant_id = ${tenantId}
    `
  })

  const target: Target =
    !row || row.tier === "shared"
      ? SHARED
      : {
          tier: "dedicated",
          connectionSecretRef: row.connection_secret_ref!,
          connectionUrl: resolveSecret(row.connection_secret_ref!),
        }

  cache.set(tenantId, { target, expiresAt: Date.now() + CACHE_TTL_MS })
  return target
}

/** For test teardown, so a stale target doesn't leak between test cases. */
export function clearRegistryCache(): void {
  cache.clear()
}
