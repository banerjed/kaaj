/**
 * Restoring ACS_GOLDEN_SEED_V1 from inside the runner (spec section 4.3,
 * `isolation: database`): the same drop-then-seed `acs.mjs seed` performs,
 * run through the owner connection the runner already holds.
 */
import { readdirSync, readFileSync } from "node:fs"
import { join } from "node:path"
import type { Sql } from "postgres"
import { CONFORMANCE_DIR } from "./fixtures"

const SEED_DIR = join(CONFORMANCE_DIR, "seed")

export async function restoreSeed(sql: Sql): Promise<void> {
  await sql.unsafe(readFileSync(join(SEED_DIR, "00_helpers.sql"), "utf8"))
  const [{ id }] = await sql<{ id: string }[]>`SELECT _acs.tenant() AS id`
  const tables = await sql<{ table_name: string }[]>`
    SELECT c.table_name
      FROM information_schema.columns c
      JOIN information_schema.tables t
        ON t.table_schema = c.table_schema AND t.table_name = c.table_name
     WHERE c.table_schema = 'public' AND c.column_name = 'tenant_id' AND t.table_type = 'BASE TABLE'
     ORDER BY 1`
  await sql.begin(async (tx) => {
    await tx`SET LOCAL session_replication_role = replica`
    for (const { table_name } of tables) {
      await tx.unsafe(
        `DELETE FROM public."${table_name}" WHERE tenant_id = $1`,
        [id],
      )
    }
    await tx`DELETE FROM tenants WHERE id = ${id}`
    // The second tenant (spec GL-020): replica mode skips FK cascades, so its one table is cleared by hand.
    await tx`DELETE FROM chart_of_accounts WHERE tenant_id = _acs.u('tenant', 2)`
    await tx`DELETE FROM tenants WHERE id = _acs.u('tenant', 2)`
    await tx`DELETE FROM exchange_rates WHERE source IN ('ACS', 'ACS-FIXTURE')`
  })
  const steps = readdirSync(SEED_DIR)
    .filter((f) => /^\d\d_.+\.sql$/.test(f) && f !== "00_helpers.sql")
    .sort()
  for (const step of steps) {
    await sql.begin((tx) =>
      tx.unsafe(readFileSync(join(SEED_DIR, step), "utf8")),
    )
  }
}

/** Row counts of every tenant table, for "nothing changed" checks (spec section 14). */
export async function tableCounts(
  sql: Sql,
  tenantId: string,
): Promise<Map<string, number>> {
  const tables = await sql<{ table_name: string }[]>`
    SELECT c.table_name
      FROM information_schema.columns c
      JOIN information_schema.tables t
        ON t.table_schema = c.table_schema AND t.table_name = c.table_name
     WHERE c.table_schema = 'public' AND c.column_name = 'tenant_id' AND t.table_type = 'BASE TABLE'
     ORDER BY 1`
  const out = new Map<string, number>()
  for (const { table_name } of tables) {
    const [{ n }] = await sql.unsafe<{ n: number }[]>(
      `SELECT count(*)::int AS n FROM public."${table_name}" WHERE tenant_id = $1`,
      [tenantId],
    )
    out.set(table_name, n)
  }
  return out
}
