import {
  createCipheriv,
  createDecipheriv,
  randomBytes,
  timingSafeEqual,
} from "node:crypto"

/**
 * AES-256-GCM field encryption.
 *
 * Pure and dependency-free on purpose: no database, no environment, no key
 * management. Those live in `keys.ts` and `pii.repo.ts`, so this file can be
 * reasoned about and tested on its own.
 *
 * **Why this is not `pgcrypto`.** Encrypting in Postgres puts the plaintext and
 * the key into the server's memory, its statement log, and `pg_stat_statements`
 * — which is installed on this database. It also means a database compromise
 * yields both halves. Encrypting in the application keeps the key out of
 * Postgres entirely, so a dump, a replica, or a stolen backup is inert.
 * (`pgsodium` is not an option either: Supabase has deprecated it.)
 *
 * **Every ciphertext is bound to where it lives.** The AAD is
 * `tenant | table | column | row`, so a ciphertext lifted from one row and
 * pasted into another fails to authenticate rather than decrypting into the
 * wrong person's record. Without it, a `UPDATE ... SET ssn_ct = (SELECT ...)`
 * would silently move someone's tax identifier onto another employee.
 */

/** 96 bits is the GCM-specified nonce size; anything else weakens the mode. */
const IV_BYTES = 12
const TAG_BYTES = 16
export const KEY_BYTES = 32

/** The stored shape. `v` is the envelope format, `k` the key version. */
export type Envelope = {
  v: 1
  k: number
  iv: string
  ct: string
  tag: string
}

export class DecryptionFailed extends Error {
  constructor(
    readonly reason: "malformed" | "not_authentic" | "unknown_key_version",
  ) {
    super(reason)
    this.name = "DecryptionFailed"
  }
}

/**
 * What a ciphertext is bound to. Passing the wrong one is indistinguishable
 * from tampering, which is the point.
 */
export type Binding = {
  tenantId: string
  table: string
  column: string
  rowId: string
}

const aadFor = (b: Binding) =>
  Buffer.from(`${b.tenantId}|${b.table}|${b.column}|${b.rowId}`, "utf8")

export function encrypt(
  plaintext: string,
  key: Buffer,
  keyVersion: number,
  binding: Binding,
): Envelope {
  assertKey(key)
  const iv = randomBytes(IV_BYTES)
  const cipher = createCipheriv("aes-256-gcm", key, iv)
  cipher.setAAD(aadFor(binding))
  const ct = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()])
  return {
    v: 1,
    k: keyVersion,
    iv: iv.toString("base64"),
    ct: ct.toString("base64"),
    tag: cipher.getAuthTag().toString("base64"),
  }
}

export function decrypt(
  envelope: Envelope,
  key: Buffer,
  binding: Binding,
): string {
  assertKey(key)
  const iv = Buffer.from(envelope.iv, "base64")
  const tag = Buffer.from(envelope.tag, "base64")
  if (iv.length !== IV_BYTES || tag.length !== TAG_BYTES) {
    throw new DecryptionFailed("malformed")
  }
  const decipher = createDecipheriv("aes-256-gcm", key, iv)
  decipher.setAAD(aadFor(binding))
  decipher.setAuthTag(tag)
  try {
    return Buffer.concat([
      decipher.update(Buffer.from(envelope.ct, "base64")),
      decipher.final(),
    ]).toString("utf8")
    // `final()` is what verifies the tag. A wrong key, a tampered ciphertext
    // and a wrong binding all land here, and are deliberately not told apart.
  } catch {
    throw new DecryptionFailed("not_authentic")
  }
}

/** Parses what came out of the column. Never throws on shape — reports it. */
export function parseEnvelope(raw: string | null): Envelope | null {
  if (raw === null || raw === "") return null
  let parsed: unknown
  try {
    parsed = JSON.parse(raw)
  } catch {
    throw new DecryptionFailed("malformed")
  }
  const e = parsed as Partial<Envelope>
  if (
    e?.v !== 1 ||
    typeof e.k !== "number" ||
    typeof e.iv !== "string" ||
    typeof e.ct !== "string" ||
    typeof e.tag !== "string"
  ) {
    throw new DecryptionFailed("malformed")
  }
  return e as Envelope
}

export const serialiseEnvelope = (e: Envelope) => JSON.stringify(e)

/**
 * Wrapping a data key with the master key. The same primitive, bound to the
 * subject so a wrapped key cannot be moved onto another person or tenant.
 */
export const wrapKey = (
  dek: Buffer,
  kek: Buffer,
  kekVersion: number,
  tenantId: string,
  subjectId: string,
): Envelope =>
  encrypt(dek.toString("base64"), kek, kekVersion, {
    tenantId,
    table: "pii_keys",
    column: "wrapped_dek",
    rowId: subjectId,
  })

export function unwrapKey(
  envelope: Envelope,
  kek: Buffer,
  tenantId: string,
  subjectId: string,
): Buffer {
  const dek = Buffer.from(
    decrypt(envelope, kek, {
      tenantId,
      table: "pii_keys",
      column: "wrapped_dek",
      rowId: subjectId,
    }),
    "base64",
  )
  assertKey(dek)
  return dek
}

export const newDataKey = () => randomBytes(KEY_BYTES)

function assertKey(key: Buffer): void {
  if (key.length !== KEY_BYTES) {
    throw new Error(
      `A PII key must be ${KEY_BYTES} bytes (AES-256); got ${key.length}.`,
    )
  }
}

/** Constant-time compare, for tests and for any future key equality check. */
export const sameKey = (a: Buffer, b: Buffer) =>
  a.length === b.length && timingSafeEqual(a, b)
