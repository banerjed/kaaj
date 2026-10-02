/**
 * Opens a sample of the perf tenant's sealed values with the app's own
 * envelope code, the way `openField` does — proof the generator wrote
 * ciphertext the app can read, not merely something that looks populated.
 * Run by `perf-tenant.mjs verify`.
 */
import {
  decrypt,
  parseEnvelope,
  unwrapKey,
} from "../../../apps/web/src/lib/server/pii/envelope.ts"
import { perfKeyRing } from "./kek.mjs"

/** Returns the number of values opened; throws on the first that will not open. */
export async function verifySealed(sql, tenantId, sample = 25) {
  const keks = perfKeyRing()
  const checks = [
    { table: "employees", column: "ssn_tax_id_ct", subject: "employee" },
    { table: "customers", column: "tax_number_ct", subject: "tenant" },
    { table: "bank_accounts", column: "account_number_ct", subject: "tenant" },
    { table: "vendors", column: "bank_account_number_ct", subject: "tenant" },
    { table: "payment_gateway_settings", column: "secret_key_ct", subject: "tenant", key: "tenant_id" },
  ]
  let opened = 0
  for (const { table, column, subject, key: idColumn = "id" } of checks) {
    const rows = await sql`
      SELECT ${sql(idColumn)}::text AS id, ${sql(column)} AS stored FROM ${sql(table)}
       WHERE tenant_id = ${tenantId} AND ${sql(column)} IS NOT NULL
       ORDER BY id LIMIT ${sample}`
    for (const { id, stored } of rows) {
      const subjectId = subject === "employee" ? id : tenantId
      const [key] = await sql`
        SELECT kek_version, wrapped_dek FROM pii_keys
         WHERE tenant_id = ${tenantId} AND subject_type = ${subject}
           AND subject_id = ${subjectId}`
      if (!key) throw new Error(`${table}.${column} ${id}: no data key`)
      const dek = unwrapKey(
        parseEnvelope(key.wrapped_dek),
        keks.get(key.kek_version),
        tenantId,
        subjectId,
      )
      const value = decrypt(parseEnvelope(stored), dek, {
        tenantId,
        table,
        column,
        rowId: id,
      })
      if (!value) throw new Error(`${table}.${column} ${id}: opened to nothing`)
      opened++
    }
  }
  return opened
}
