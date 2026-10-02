/**
 * Global invariants (spec section 9): one SQL file each in
 * packages/database/conformance/invariants/, taking the tenant id as $1 and
 * returning zero rows when the invariant holds. They run inside the
 * scenario's transaction as the cluster owner (RESET ROLE), so no row policy
 * hides a row from the check; the role is put back afterwards.
 */
import { readdirSync, readFileSync } from "node:fs"
import { join } from "node:path"
import type { Tx } from "../../db/tenant"
import { CONFORMANCE_DIR } from "./fixtures"

export type Invariant = { id: string; sql: string }

export function loadInvariants(): Invariant[] {
  const dir = join(CONFORMANCE_DIR, "invariants")
  return readdirSync(dir)
    .filter((f) => f.endsWith(".sql"))
    .sort()
    .map((f) => ({
      id: f.replace(/\.sql$/, ""),
      sql: readFileSync(join(dir, f), "utf8"),
    }))
}

export type Violation = { id: string; rows: unknown[] }

export async function checkInvariants(
  tx: Tx,
  tenantId: string,
  invariants: Invariant[],
): Promise<Violation[]> {
  const out: Violation[] = []
  await tx`RESET ROLE`
  try {
    for (const inv of invariants) {
      const rows = await tx.unsafe(inv.sql, [tenantId])
      if (rows.length > 0) out.push({ id: inv.id, rows: rows.slice(0, 5) })
    }
  } finally {
    await tx`SET LOCAL ROLE app_user`
  }
  return out
}
