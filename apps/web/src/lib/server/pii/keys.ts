import { env } from "$env/dynamic/private"
import { KEY_BYTES } from "./envelope"

/**
 * The master key (KEK), and only the master key.
 *
 * **The specification's key derivation is not implemented, deliberately.**
 * `docs/module-employee-profile.md` § Encryption Key Generation says:
 *
 *     encryption_key = DERIVE_KEY(org_prefix + org_4digit_code)
 *
 * That is not a key. `org_prefix` is a public identifier and `org_4digit_code`
 * has ten thousand possible values, so an attacker holding a ciphertext tries
 * every candidate in seconds — roughly 13 bits of entropy, and no key
 * derivation function repairs a search space that small. Worse, both inputs are
 * stored in the very database the encryption is meant to protect, so anyone who
 * can read the ciphertext can already read the recipe.
 *
 * What the spec appears to want is a stable key *identifier* per organisation,
 * and that is honoured: `{org_prefix}-{4digit_code}` is the label recorded on
 * the key row. The key *material* is 32 random bytes, never derived from
 * anything guessable, wrapped by this master key, which lives outside Postgres.
 *
 * See docs/13-pii-encryption.md.
 */

/**
 * `PRIVATE_PII_KEK` holds one or more versioned keys, newest last:
 *
 *     PRIVATE_PII_KEK="1:<base64-32-bytes>,2:<base64-32-bytes>"
 *
 * Every version can decrypt; the highest encrypts. That is what makes rotation
 * possible without a flag day: add a version, re-wrap in the background, drop
 * the old one when nothing references it.
 */
export type KeyRing = {
  current: { version: number; key: Buffer }
  byVersion: Map<number, Buffer>
}

let cached: KeyRing | null = null

export function keyRing(): KeyRing {
  if (cached) return cached

  const raw = env.PRIVATE_PII_KEK
  if (!raw) {
    throw new Error(
      "PRIVATE_PII_KEK is not set. It is the master key that wraps every " +
        "per-employee PII key, and without it encrypted fields cannot be read " +
        "or written. Generate one with `openssl rand -base64 32` and set it as " +
        "`1:<value>`. Run ./setup for a local development key. It must never " +
        "be PUBLIC_-prefixed: SvelteKit ships those to the browser.",
    )
  }

  const byVersion = new Map<number, Buffer>()
  for (const entry of raw.split(",")) {
    const trimmed = entry.trim()
    if (trimmed === "") continue
    const at = trimmed.indexOf(":")
    if (at < 1) {
      throw new Error(
        "PRIVATE_PII_KEK entries must be `<version>:<base64>` — an unversioned " +
          "key cannot be rotated, because nothing records which key wrote a row.",
      )
    }
    const version = Number(trimmed.slice(0, at))
    if (!Number.isInteger(version) || version < 1) {
      throw new Error(
        `PRIVATE_PII_KEK has a non-integer version: ${trimmed.slice(0, at)}`,
      )
    }
    const key = Buffer.from(trimmed.slice(at + 1), "base64")
    if (key.length !== KEY_BYTES) {
      throw new Error(
        `PRIVATE_PII_KEK version ${version} is ${key.length} bytes; AES-256 needs ${KEY_BYTES}.`,
      )
    }
    if (byVersion.has(version)) {
      throw new Error(`PRIVATE_PII_KEK declares version ${version} twice.`)
    }
    byVersion.set(version, key)
  }

  if (byVersion.size === 0) {
    throw new Error("PRIVATE_PII_KEK is set but contains no usable key.")
  }

  const newest = Math.max(...byVersion.keys())
  cached = {
    current: { version: newest, key: byVersion.get(newest)! },
    byVersion,
  }
  return cached
}

export function kekForVersion(version: number): Buffer {
  const key = keyRing().byVersion.get(version)
  if (!key) {
    // A row wrapped under a key that is no longer configured. Surfaced loudly:
    // silently treating it as "no value" would look like data loss and would
    // hide a botched rotation.
    throw new Error(
      `No PII master key configured for version ${version}. A key was removed ` +
        `from PRIVATE_PII_KEK while rows still reference it — restore it, or ` +
        `re-wrap those rows before dropping it.`,
    )
  }
  return key
}

/** Tests only: the ring is memoised, and a test that swaps keys must reset it. */
export const _resetKeyRing = () => {
  cached = null
}
