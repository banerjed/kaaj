/**
 * Per-tenant gradual rollout. `feature_flags` (control plane, ADR-009) has no
 * write policy for app_user — a flag is toggled with the database OWNER
 * connection (`psql "$DATABASE_URL"`), the same class of access already used
 * to create the first beta tenant by hand (12-beta-deployment.md).
 *
 * Always requires a real tenant: the table's read policy requires a valid
 * tenant claim to be set at all (ADR-003 rule 5, "no claim = no tenant, fails
 * closed") even for the platform-default (NULL tenant_id) row, so there is no
 * anonymous/pre-auth lookup path — nothing in this product needs one, since a
 * flag only ever governs already-authenticated, tenant-scoped behavior.
 */
import { withControlPlane, type Actor } from "$lib/server/db/tenant"

export async function isEnabled(key: string, actor: Actor): Promise<boolean> {
  const rows = await withControlPlane(
    actor,
    (tx) => tx<{ enabled: boolean }[]>`
      SELECT enabled FROM feature_flags
      WHERE flag_key = ${key}
        AND (tenant_id = ${typeof actor === "string" ? actor : actor.tenantId} OR tenant_id IS NULL)
      ORDER BY tenant_id NULLS LAST
      LIMIT 1
    `,
  )
  return rows[0]?.enabled ?? false
}
