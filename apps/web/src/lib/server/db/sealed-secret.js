import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto"

/**
 * A dedicated tenant's connection string, sealed for storage in
 * `tenant_registry.connection_secret_ref`. Plain JS with no SvelteKit imports
 * so the provisioning script and `./check` can seal and open the same format
 * the app does.
 *
 * The wire format is the `Envelope` of `$lib/server/pii/envelope.ts` (AES-256-GCM,
 * `{v,k,iv,ct,tag}`) bound by AAD to `tenantId|tenant_registry|connection_secret_ref|tenantId`,
 * so a sealed value copied onto another tenant's row fails to open.
 */

export const SEALED_PREFIX = "sealed:v1:"

const KEY_BYTES = 32
const IV_BYTES = 12
const TAG_BYTES = 16
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const POSTGRES_URL = /^postgres(ql)?:\/\//

export class SealedSecretError extends Error {
  /** @param {"malformed" | "unknown_key_version" | "not_authentic"} reason */
  constructor(reason) {
    super(reason)
    this.name = "SealedSecretError"
    this.reason = reason
  }
}

const aadFor = (tenantId) =>
  Buffer.from(
    `${tenantId}|tenant_registry|connection_secret_ref|${tenantId}`,
    "utf8",
  )

export const isSealedRef = (ref) =>
  typeof ref === "string" && ref.startsWith(SEALED_PREFIX)

export function sealConnectionUrl(url, tenantId, keyVersion, key) {
  if (!POSTGRES_URL.test(url)) {
    throw new Error(
      "A connection string must start with postgres:// or postgresql://",
    )
  }
  if (!UUID.test(tenantId)) throw new Error("tenantId must be a UUID")
  if (!Number.isInteger(keyVersion) || keyVersion < 1) {
    throw new Error("keyVersion must be a positive integer")
  }
  if (key.length !== KEY_BYTES) {
    throw new Error(`A sealing key must be ${KEY_BYTES} bytes (AES-256)`)
  }

  const iv = randomBytes(IV_BYTES)
  const cipher = createCipheriv("aes-256-gcm", key, iv)
  cipher.setAAD(aadFor(tenantId))
  const ct = Buffer.concat([cipher.update(url, "utf8"), cipher.final()])
  const envelope = {
    v: 1,
    k: keyVersion,
    iv: iv.toString("base64"),
    ct: ct.toString("base64"),
    tag: cipher.getAuthTag().toString("base64"),
  }
  return (
    SEALED_PREFIX + Buffer.from(JSON.stringify(envelope)).toString("base64url")
  )
}

/**
 * Never echoes the ciphertext or a fragment of the plaintext: a wrong key, a
 * tampered value and a value sealed for another tenant are one outcome.
 *
 * @param {(version: number) => Buffer | undefined} keyFor
 */
export function openConnectionUrl(ref, tenantId, keyFor) {
  if (!isSealedRef(ref)) throw new SealedSecretError("malformed")

  let envelope
  try {
    envelope = JSON.parse(
      Buffer.from(ref.slice(SEALED_PREFIX.length), "base64url").toString(
        "utf8",
      ),
    )
  } catch {
    throw new SealedSecretError("malformed")
  }
  if (
    envelope?.v !== 1 ||
    !Number.isInteger(envelope.k) ||
    typeof envelope.iv !== "string" ||
    typeof envelope.ct !== "string" ||
    typeof envelope.tag !== "string"
  ) {
    throw new SealedSecretError("malformed")
  }

  const key = keyFor(envelope.k)
  if (!key) throw new SealedSecretError("unknown_key_version")
  if (key.length !== KEY_BYTES) throw new SealedSecretError("not_authentic")

  const iv = Buffer.from(envelope.iv, "base64")
  const tag = Buffer.from(envelope.tag, "base64")
  if (iv.length !== IV_BYTES || tag.length !== TAG_BYTES) {
    throw new SealedSecretError("malformed")
  }

  try {
    const decipher = createDecipheriv("aes-256-gcm", key, iv)
    decipher.setAAD(aadFor(tenantId))
    decipher.setAuthTag(tag)
    const url = Buffer.concat([
      decipher.update(Buffer.from(envelope.ct, "base64")),
      decipher.final(),
    ]).toString("utf8")
    if (!POSTGRES_URL.test(url)) throw new Error("not a connection string")
    return url
  } catch {
    throw new SealedSecretError("not_authentic")
  }
}

/**
 * `PRIVATE_PII_KEK` for callers outside the app: `1:<base64>,2:<base64>`.
 * The app itself goes through `keyRing()` in `pii/keys.ts`.
 *
 * @returns {Map<number, Buffer>}
 */
export function parseKeyRing(raw) {
  const byVersion = new Map()
  for (const entry of (raw ?? "").split(",")) {
    const trimmed = entry.trim()
    if (trimmed === "") continue
    const at = trimmed.indexOf(":")
    const version = Number(trimmed.slice(0, at))
    const key = Buffer.from(trimmed.slice(at + 1), "base64")
    if (
      at < 1 ||
      !Number.isInteger(version) ||
      version < 1 ||
      key.length !== KEY_BYTES
    ) {
      throw new Error(
        "PRIVATE_PII_KEK is malformed: expected <version>:<base64 of 32 bytes>",
      )
    }
    if (byVersion.has(version))
      throw new Error(`PRIVATE_PII_KEK declares version ${version} twice`)
    byVersion.set(version, key)
  }
  if (byVersion.size === 0)
    throw new Error("PRIVATE_PII_KEK is not set or holds no key")
  return byVersion
}

/** The key new values are sealed with: the highest version. */
export function newestKey(byVersion) {
  const version = Math.max(...byVersion.keys())
  return { version, key: byVersion.get(version) }
}
