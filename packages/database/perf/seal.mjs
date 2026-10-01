/**
 * Encrypted columns for the performance tenant, sealed exactly as the app
 * seals them (`sealField` in apps/web/src/lib/server/pii/pii.repo.ts): a data
 * key per subject in `pii_keys`, wrapped under PRIVATE_PII_KEK, and an
 * AES-256-GCM envelope bound to tenant | table | column | row. Decrypting
 * these is a real per-row cost on the pages that show them, which is the
 * point — a perf tenant with NULL ciphertext measures a different app.
 *
 * Plaintext is derived from the row id, so it is deterministic; ciphertext is
 * not (each envelope has a random IV), which is how the app writes it too.
 */
import { readFileSync } from "node:fs"
import {
  encrypt,
  newDataKey,
  serialiseEnvelope,
  wrapKey,
} from "../../../apps/web/src/lib/server/pii/envelope.ts"

const ENV_EXAMPLE = new URL("../../../apps/web/.env.example", import.meta.url)

/** table, column, whose key seals it, and a plausible value for the row. */
const SEALED = [
  { table: "employees", column: "ssn_tax_id_ct", subject: "employee",
    value: (id) => `${digits(id, 3)}-${digits(id, 2, 3)}-${digits(id, 4, 5)}` },
  { table: "customers", column: "tax_number_ct", subject: "tenant",
    value: (id) => `TAX-${digits(id, 9)}` },
  { table: "bank_accounts", column: "account_number_ct", subject: "tenant",
    value: (id) => digits(id, 10) },
  { table: "bank_accounts", column: "routing_number_ct", subject: "tenant",
    value: (id) => digits(id, 9, 10) },
  { table: "bank_accounts", column: "iban_ct", subject: "tenant",
    value: (id) => `GB${digits(id, 2)}BRGT${digits(id, 14, 2)}` },
  { table: "bank_accounts", column: "swift_code_ct", subject: "tenant",
    value: () => "BRGTGB2L" },
  { table: "vendors", column: "bank_account_number_ct", subject: "tenant",
    value: (id) => digits(id, 10) },
  { table: "vendors", column: "bank_routing_number_ct", subject: "tenant",
    value: (id) => digits(id, 9, 10) },
]

const BATCH = 2000

function digits(id, count, offset = 0) {
  const hex = id.replace(/-/g, "")
  let out = ""
  for (let i = 0; out.length < count; i++) {
    out += (parseInt(hex[(offset + i) % hex.length], 16) % 10).toString()
  }
  return out
}

function kekRing() {
  let raw = process.env.PRIVATE_PII_KEK
  if (!raw) {
    const line = readFileSync(ENV_EXAMPLE, "utf8")
      .split("\n")
      .find((l) => l.startsWith("PRIVATE_PII_KEK="))
    raw = line?.slice("PRIVATE_PII_KEK=".length).trim().replace(/^"|"$/g, "")
  }
  if (!raw) throw new Error("PRIVATE_PII_KEK is not set and .env.example has none")
  const entries = raw.split(",").map((e) => e.trim()).filter(Boolean)
  const [version, key] = entries
    .map((e) => [Number(e.slice(0, e.indexOf(":"))), Buffer.from(e.slice(e.indexOf(":") + 1), "base64")])
    .sort((a, b) => b[0] - a[0])[0]
  return { version, key }
}

/** The tenant's key label, as pii.repo.ts's keyLabel derives it. */
function keyLabel(subdomain, tenantId) {
  const prefix = subdomain.replace(/[^a-zA-Z0-9]/g, "").toUpperCase().slice(0, 8)
  const n = parseInt(tenantId.replace(/-/g, "").slice(0, 8), 16) % 10000
  return `${prefix}-${String(n).padStart(4, "0")}`
}

/** Create (or reuse) a data key per subject; returns subject id -> key. */
async function dataKeys(sql, tenantId, subjectType, subjectIds, kek, label) {
  const keys = new Map()
  const rows = subjectIds.map((subjectId) => {
    const dek = newDataKey()
    keys.set(subjectId, dek)
    return {
      subject_id: subjectId,
      wrapped_dek: serialiseEnvelope(wrapKey(dek, kek.key, kek.version, tenantId, subjectId)),
    }
  })
  for (let i = 0; i < rows.length; i += BATCH) {
    await sql`
      INSERT INTO pii_keys (tenant_id, subject_type, subject_id, key_label, kek_version, wrapped_dek)
      SELECT ${tenantId}::uuid, ${subjectType}, r.subject_id, ${label}, ${kek.version}, r.wrapped_dek
        FROM jsonb_to_recordset(${sql.json(rows.slice(i, i + BATCH))}) AS r(subject_id uuid, wrapped_dek text)
      ON CONFLICT (tenant_id, subject_type, subject_id) DO NOTHING`
  }
  return keys
}

export async function sealEncryptedColumns(sql, tenantId) {
  const kek = kekRing()
  const [tenant] = await sql`SELECT subdomain FROM tenants WHERE id = ${tenantId}`
  const label = keyLabel(tenant.subdomain, tenantId)

  const employees = await sql`SELECT id::text FROM employees WHERE tenant_id = ${tenantId}`
  const employeeKeys = await dataKeys(sql, tenantId, "employee", employees.map((e) => e.id), kek, label)
  const tenantKey = (await dataKeys(sql, tenantId, "tenant", [tenantId], kek, label)).get(tenantId)

  let sealed = 0
  for (const { table, column, subject, value } of SEALED) {
    const ids = await sql.unsafe(
      `SELECT id::text FROM public."${table}" WHERE tenant_id = $1`,
      [tenantId],
    )
    for (let i = 0; i < ids.length; i += BATCH) {
      const rows = ids.slice(i, i + BATCH).map(({ id }) => {
        const dek = subject === "employee" ? employeeKeys.get(id) : tenantKey
        const envelope = encrypt(value(id), dek, kek.version, { tenantId, table, column, rowId: id })
        return { id, sealed: serialiseEnvelope(envelope) }
      })
      await sql`
        UPDATE ${sql(table)} t SET ${sql(column)} = r.sealed
          FROM jsonb_to_recordset(${sql.json(rows)}) AS r(id uuid, sealed text)
         WHERE t.id = r.id`
      sealed += rows.length
    }
  }
  return sealed
}
