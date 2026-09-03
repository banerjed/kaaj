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
 * Who is asking. A bare tenant id still isolates by tenant, but a
 * row-visibility policy keyed on role/person (docs/15-row-level-visibility.md)
 * denies a claim carrying neither — fail closed. Pass full context where one exists.
 */
export type Actor =
  | string
  | {
      tenantId: string
      employeeId?: string | null
      role?: string | null
      functionalRoles?: string[] | null
    }

/** Run `fn` inside a transaction scoped to the actor's tenant. Commits on resolve, rolls back on throw. */
export async function withTenant<T>(
  actor: Actor,
  fn: (tx: Tx) => Promise<T>,
): Promise<T> {
  const tenantId = typeof actor === "string" ? actor : actor.tenantId
  // Should never fire (claim comes from a verified JWT) — fail loudly, not into "no tenant".
  if (!UUID.test(tenantId)) {
    throw new Error("withTenant called with a malformed tenant id")
  }

  const sql: Sql = getConnection(tenantId)
  // Whole claim, not just the tenant — row-visibility reads app_metadata.role/employee_id.
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

/** The actor for a request, from `locals` — used instead of `locals.tenantId` alone so the database knows WHO is asking. */
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
