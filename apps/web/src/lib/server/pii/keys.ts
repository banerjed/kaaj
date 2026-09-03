import { dev } from "$app/environment"
import { env } from "$env/dynamic/private"
import { KEY_BYTES } from "./envelope"

/**
 * The master key (KEK), and only the master key.
 *
 * The spec's `DERIVE_KEY(org_prefix + org_4digit_code)` is deliberately NOT
 * implemented — ~13 bits of entropy, and both inputs live in the database it
 * would protect. Key material is 32 random bytes instead; `{org_prefix}-{4digit_code}`
 * survives only as the key row's label. See docs/13-pii-encryption.md.
 */

/**
 * `PRIVATE_PII_KEK` holds one or more versioned keys, newest last:
 *
 *     PRIVATE_PII_KEK="1:<base64-32-bytes>,2:<base64-32-bytes>"
 *
 * Every version decrypts; the highest encrypts — rotation is add a version,
 * re-wrap in the background, drop the old one.
 */
/** The dev key published in `.env.example` — refused outside dev, the guard that actually matters here. */
const PUBLISHED_DEV_KEY = "xZqNWwsCOqE17r/jdVQN2zca+L1Ztdop48xeCxAcxr0="

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

  if (!dev) {
    for (const [version, key] of byVersion) {
      if (key.toString("base64") === PUBLISHED_DEV_KEY) {
        throw new Error(
          `PRIVATE_PII_KEK version ${version} is the development key from ` +
            "apps/web/.env.example, which is published in this repository — " +
            "anyone who can read the source could decrypt every protected " +
            "field. Generate a real one with `openssl rand -base64 32` and " +
            "keep it in a secret store with its own backup, never in a file " +
            "beside the code.",
        )
      }
    }
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
    // Surfaced loudly — treating it as "no value" would mask a botched rotation.
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

/** Tests only — `$env/dynamic/private` doesn't observe a later `process.env` mutation. */
export const _useKeyRingForTest = (raw: string) => {
  cached = null
  const saved = env.PRIVATE_PII_KEK
  ;(env as Record<string, string | undefined>).PRIVATE_PII_KEK = raw
  const ring = keyRing()
  ;(env as Record<string, string | undefined>).PRIVATE_PII_KEK = saved
  cached = ring
  return ring
}
