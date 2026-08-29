/**
 * One transaction per request, with the tenant set on it (ADR-003 rule 4).
 *
 * Repositories accept a `Tx` they cannot construct, so there is exactly one way
 * to reach the database and it always carries a tenant.
 *
 * L1: the claim is `request.jwt.claims`, not `app.tenant_id`.
 * L2: two ways to set it that silently do nothing — both handled here.
 * L3: `SET LOCAL ROLE` so isolation survives a misconfigured DSN.
 */
import type { Sql, TransactionSql } from "postgres"
import { getConnection } from "./client"

export type Tx = TransactionSql<Record<string, never>>

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/**
 * Run `fn` inside a transaction scoped to `tenantId`. Commits on resolve,
 * rolls back on throw.
 */
export async function withTenant<T>(
  tenantId: string,
  fn: (tx: Tx) => Promise<T>,
): Promise<T> {
  // Should never fire — the claim comes from a verified JWT. It is here because
  // this value is the sole basis for isolation, so a malformed one must fail
  // loudly rather than degrade into "no tenant".
  if (!UUID.test(tenantId)) {
    throw new Error("withTenant called with a malformed tenant id")
  }

  const sql: Sql = getConnection(tenantId)
  const claims = JSON.stringify({ app_metadata: { tenant_id: tenantId } })

  return sql.begin(async (tx) => {
    await tx`SET LOCAL ROLE app_user`
    await tx`SELECT set_config('request.jwt.claims', ${claims}, true)`

    return fn(tx as Tx)
  }) as Promise<T>
}
