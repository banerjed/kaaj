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
/**
 * Who is asking. A bare tenant id is still accepted and still isolates by
 * tenant — but row-visibility policies key on the ROLE and the PERSON
 * (docs/15-row-level-visibility.md), and a claim carrying neither is denied by
 * them. That is deliberate: fail closed. Pass the context wherever one exists.
 */
export type Actor =
  | string
  | {
      tenantId: string
      employeeId?: string | null
      role?: string | null
      functionalRoles?: string[] | null
    }

export async function withTenant<T>(
  actor: Actor,
  fn: (tx: Tx) => Promise<T>,
): Promise<T> {
  const tenantId = typeof actor === "string" ? actor : actor.tenantId
  // Should never fire — the claim comes from a verified JWT. It is here because
  // this value is the sole basis for isolation, so a malformed one must fail
  // loudly rather than degrade into "no tenant".
  if (!UUID.test(tenantId)) {
    throw new Error("withTenant called with a malformed tenant id")
  }

  const sql: Sql = getConnection(tenantId)
  // The whole claim, not just the tenant. Row-visibility policies read
  // app_metadata.role and app_metadata.employee_id, and an absent role means
  // "no rows" rather than "every row".
  const claims = JSON.stringify({
    app_metadata:
      typeof actor === "string"
        ? { tenant_id: tenantId }
        : {
            tenant_id: tenantId,
            employee_id: actor.employeeId ?? null,
            role: actor.role ?? null,
            functional_roles: actor.functionalRoles ?? [],
          },
  })

  return sql.begin(async (tx) => {
    await tx`SET LOCAL ROLE app_user`
    await tx`SELECT set_config('request.jwt.claims', ${claims}, true)`

    return fn(tx as Tx)
  }) as Promise<T>
}

/**
 * The actor for a request, from `locals`.
 *
 * Every page and action uses this rather than `locals.tenantId` alone, so the
 * database knows WHO is asking and not only which firm. A claim with a tenant
 * and nothing else is denied by every row-visibility policy — fail closed.
 */
export function actorFrom(locals: App.Locals): Actor {
  if (!locals.tenantId) {
    throw new Error(
      "actorFrom called without a tenant — check locals.tenantId first",
    )
  }
  return {
    tenantId: locals.tenantId,
    employeeId: locals.employeeId ?? null,
    role: locals.tenantRole ?? null,
    functionalRoles: locals.functionalRoles ?? [],
  }
}
