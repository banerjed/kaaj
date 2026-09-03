import type { Tx } from "../db/tenant"
import { kekForVersion, keyRing } from "./keys"
import {
  decrypt,
  encrypt,
  newDataKey,
  parseEnvelope,
  serialiseEnvelope,
  unwrapKey,
  wrapKey,
  type Binding,
} from "./envelope"

/**
 * Per-subject data keys, and the read/write path for an encrypted field.
 * Everything goes through `sealField`/`openField` — never `encrypt`/`decrypt`
 * directly — so the tenant|table|column|row binding stays consistent.
 */

/**
 * Whose data this is. `employee` — erasing the person destroys it. `tenant` —
 * the firm's own data and its counterparties', keyed so one leaver's erasure
 * can't take the company's banking details with it.
 */
export type Subject = {
  tenantId: string
  subjectType: "employee" | "tenant"
  subjectId: string
}

/** Keys are fetched per request and reused; a page showing 50 people would
 *  otherwise unwrap 50 keys per encrypted column rather than per person. */
type KeyCache = Map<string, Buffer>

const cacheKey = (s: Subject) => `${s.tenantId}:${s.subjectType}:${s.subjectId}`

/** The subject's data key, creating one on first use. */
export async function dataKey(
  tx: Tx,
  subject: Subject,
  cache?: KeyCache,
): Promise<Buffer> {
  const hit = cache?.get(cacheKey(subject))
  if (hit) return hit

  const [row] = await tx<{ kek_version: number; wrapped_dek: string }[]>`
    SELECT kek_version, wrapped_dek
      FROM pii_keys
     WHERE tenant_id = ${subject.tenantId}
       AND subject_type = ${subject.subjectType}
       AND subject_id = ${subject.subjectId}
  `

  let dek: Buffer
  if (row) {
    const envelope = parseEnvelope(row.wrapped_dek)!
    dek = unwrapKey(
      envelope,
      kekForVersion(row.kek_version),
      subject.tenantId,
      subject.subjectId,
    )
  } else {
    const ring = keyRing()
    dek = newDataKey()
    const wrapped = wrapKey(
      dek,
      ring.current.key,
      ring.current.version,
      subject.tenantId,
      subject.subjectId,
    )
    // ON CONFLICT DO NOTHING + re-read guards concurrent first-writes racing to insert a key.
    await tx`
      INSERT INTO pii_keys (tenant_id, subject_type, subject_id, key_label, kek_version, wrapped_dek)
      VALUES (${subject.tenantId}, ${subject.subjectType}, ${subject.subjectId},
              ${await keyLabel(tx, subject.tenantId)}, ${ring.current.version},
              ${serialiseEnvelope(wrapped)})
      ON CONFLICT (tenant_id, subject_type, subject_id) DO NOTHING
    `
    const [stored] = await tx<{ kek_version: number; wrapped_dek: string }[]>`
      SELECT kek_version, wrapped_dek FROM pii_keys
       WHERE tenant_id = ${subject.tenantId}
         AND subject_type = ${subject.subjectType}
         AND subject_id = ${subject.subjectId}
    `
    dek = unwrapKey(
      parseEnvelope(stored.wrapped_dek)!,
      kekForVersion(stored.kek_version),
      subject.tenantId,
      subject.subjectId,
    )
  }

  cache?.set(cacheKey(subject), dek)
  return dek
}

/** `{org_prefix}-{4digit_code}` — the specification's key identifier. */
async function keyLabel(tx: Tx, tenantId: string): Promise<string | null> {
  const [t] = await tx<{ subdomain: string | null }[]>`
    SELECT subdomain FROM tenants WHERE id = ${tenantId}
  `
  if (!t?.subdomain) return null
  const prefix = t.subdomain
    .replace(/[^a-zA-Z0-9]/g, "")
    .toUpperCase()
    .slice(0, 8)
  // Names a key, does not make one — carries no secrecy.
  const digits = String(
    parseInt(tenantId.replace(/-/g, "").slice(0, 8), 16) % 10000,
  ).padStart(4, "0")
  return `${prefix}-${digits}`
}

/** True when this subject has an erasure on record — `sealField` refuses to mint a fresh key for them. */
export async function isErased(tx: Tx, subject: Subject): Promise<boolean> {
  const [row] = await tx<{ n: number }[]>`
    SELECT count(*)::int AS n FROM pii_erasures
     WHERE tenant_id = ${subject.tenantId}
       AND subject_type = ${subject.subjectType}
       AND subject_id = ${subject.subjectId}
  `
  return row.n > 0
}

export class SubjectErased extends Error {
  constructor(readonly subjectId: string) {
    super(`subject ${subjectId} has an erasure on record`)
    this.name = "SubjectErased"
  }
}

export async function sealField(
  tx: Tx,
  subject: Subject,
  field: { table: string; column: string; rowId: string },
  plaintext: string | null,
  cache?: KeyCache,
): Promise<string | null> {
  if (plaintext === null || plaintext === "") return null
  if (await isErased(tx, subject)) throw new SubjectErased(subject.subjectId)
  const ring = keyRing()
  const dek = await dataKey(tx, subject, cache)
  const binding: Binding = { tenantId: subject.tenantId, ...field }
  return serialiseEnvelope(
    encrypt(plaintext, dek, ring.current.version, binding),
  )
}

/**
 * Decrypt, or report why not. A destroyed key reads as `{null, erased: true}`,
 * not an error. Every other failure throws — must not look like an empty field.
 */
export async function openField(
  tx: Tx,
  subject: Subject,
  field: { table: string; column: string; rowId: string },
  stored: string | null,
  cache?: KeyCache,
): Promise<{ value: string | null; erased: boolean }> {
  const envelope = parseEnvelope(stored)
  if (!envelope) return { value: null, erased: false }

  // Checked here, not via dataKey() — that would MINT a fresh key for an erased subject.
  const [key] = await tx<{ kek_version: number; wrapped_dek: string }[]>`
    SELECT kek_version, wrapped_dek FROM pii_keys
     WHERE tenant_id = ${subject.tenantId}
       AND subject_type = ${subject.subjectType}
       AND subject_id = ${subject.subjectId}
  `
  if (!key) return { value: null, erased: true }

  const dek = unwrapKey(
    parseEnvelope(key.wrapped_dek)!,
    kekForVersion(key.kek_version),
    subject.tenantId,
    subject.subjectId,
  )
  cache?.set(cacheKey(subject), dek)

  return {
    value: decrypt(envelope, dek, { tenantId: subject.tenantId, ...field }),
    erased: false,
  }
}

/**
 * Erasure — GDPR Art. 17, DPDP §12(3), CCPA/CPRA. Destroying the key is the
 * load-bearing step (it makes every ciphertext unrecoverable, backups
 * included); nulling columns is housekeeping. Key first: a crash mid-way still
 * leaves the data unrecoverable.
 */
export async function eraseSubject(
  tx: Tx,
  subject: Subject,
  record: {
    reason: string
    requestedBy: string | null
    subjectLabel: string | null
  },
): Promise<{ keyDestroyed: boolean }> {
  const destroyed = await tx`
    DELETE FROM pii_keys
     WHERE tenant_id = ${subject.tenantId}
       AND subject_type = ${subject.subjectType}
       AND subject_id = ${subject.subjectId}
     RETURNING id
  `

  // Written whether or not a key existed — "nothing to erase" is itself the answer.
  await tx`
    INSERT INTO pii_erasures
      (tenant_id, subject_type, subject_id, subject_label, reason, requested_by)
    VALUES (${subject.tenantId}, ${subject.subjectType}, ${subject.subjectId},
            ${record.subjectLabel}, ${record.reason}, ${record.requestedBy})
  `

  if (subject.subjectType === "employee") {
    await tx`
      UPDATE employees SET ssn_tax_id_ct = NULL, updated_at = now()
       WHERE id = ${subject.subjectId}
    `
  }

  return { keyDestroyed: destroyed.length > 0 }
}

/** Subjects still holding a key wrapped under an older master key version. */
export async function needsRewrap(
  tx: Tx,
): Promise<
  { subject_id: string; subject_type: string; kek_version: number }[]
> {
  const current = keyRing().current.version
  return tx`
    SELECT subject_id, subject_type, kek_version
      FROM pii_keys
     WHERE kek_version <> ${current}
     ORDER BY kek_version, subject_id
  `
}

/** Re-wrap one subject's key under the newest master key — touches the KEY only, never the field ciphertext. */
export async function rewrapSubject(tx: Tx, subject: Subject): Promise<void> {
  const [row] = await tx<{ kek_version: number; wrapped_dek: string }[]>`
    SELECT kek_version, wrapped_dek FROM pii_keys
     WHERE tenant_id = ${subject.tenantId}
       AND subject_type = ${subject.subjectType}
       AND subject_id = ${subject.subjectId}
     FOR UPDATE
  `
  if (!row) return

  const ring = keyRing()
  if (row.kek_version === ring.current.version) return

  const dek = unwrapKey(
    parseEnvelope(row.wrapped_dek)!,
    kekForVersion(row.kek_version),
    subject.tenantId,
    subject.subjectId,
  )
  const rewrapped = wrapKey(
    dek,
    ring.current.key,
    ring.current.version,
    subject.tenantId,
    subject.subjectId,
  )
  await tx`
    UPDATE pii_keys
       SET kek_version = ${ring.current.version},
           wrapped_dek = ${serialiseEnvelope(rewrapped)},
           updated_at = now()
     WHERE tenant_id = ${subject.tenantId}
       AND subject_type = ${subject.subjectType}
       AND subject_id = ${subject.subjectId}
  `
}

export const newKeyCache = (): KeyCache => new Map()
