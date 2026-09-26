import { randomBytes, randomUUID } from "node:crypto"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { env } from "$env/dynamic/private"
import { decrypt, encrypt, type Envelope } from "../pii/envelope"
import { _resetKeyRing, _useKeyRingForTest } from "../pii/keys"
import { clearRegistryCache, resolveTarget } from "./registry"
import { resolveSecret } from "./secrets"
import {
  SEALED_PREFIX,
  SealedSecretError,
  isSealedRef,
  newestKey,
  openConnectionUrl,
  parseKeyRing,
  sealConnectionUrl,
} from "./sealed-secret.js"

// resolveTarget reads the control plane through the shared pool; a real
// tenant_registry row would need a write to the shared database.
let registryRow: { tier: string; connection_secret_ref: string | null } | null =
  null
vi.mock("./client", () => ({
  getSharedPool: () => ({
    begin: async (fn: (tx: unknown) => unknown) => {
      const tx = Object.assign(
        async () => (registryRow ? [registryRow] : []),
        {},
      )
      return fn(tx)
    },
  }),
}))

const DSN = "postgresql://app_user:s3cret-pw@db.abc.supabase.co:5432/postgres"
const TENANT = randomUUID()
const OTHER_TENANT = randomUUID()
const key = () => randomBytes(32)
const seal = (url = DSN, tenant = TENANT, k = key(), v = 1) => ({
  k,
  ref: sealConnectionUrl(url, tenant, v, k),
})
const ringOf =
  (...pairs: [number, Buffer][]) =>
  (v: number) =>
    new Map(pairs).get(v)

describe("sealed connection secret", () => {
  it("opens to exactly what was sealed", () => {
    const { k, ref } = seal()
    expect(isSealedRef(ref)).toBe(true)
    expect(openConnectionUrl(ref, TENANT, ringOf([1, k]))).toBe(DSN)
  })

  it("never contains the connection string in the clear", () => {
    const { ref } = seal()
    const payload = Buffer.from(
      ref.slice(SEALED_PREFIX.length),
      "base64url",
    ).toString()
    for (const s of [ref, payload]) {
      expect(s).not.toContain("s3cret-pw")
      expect(s).not.toContain("supabase.co")
    }
  })

  it("seals the same value differently each time (fresh nonce)", () => {
    const k = key()
    expect(seal(DSN, TENANT, k).ref).not.toBe(seal(DSN, TENANT, k).ref)
  })

  it("is the pii Envelope wire format: envelope.ts opens what this seals, and the reverse", () => {
    const { k, ref } = seal()
    const envelope = JSON.parse(
      Buffer.from(ref.slice(SEALED_PREFIX.length), "base64url").toString(),
    ) as Envelope
    const binding = {
      tenantId: TENANT,
      table: "tenant_registry",
      column: "connection_secret_ref",
      rowId: TENANT,
    }
    expect(decrypt(envelope, k, binding)).toBe(DSN)

    const theirs =
      SEALED_PREFIX +
      Buffer.from(JSON.stringify(encrypt(DSN, k, 1, binding))).toString(
        "base64url",
      )
    expect(openConnectionUrl(theirs, TENANT, ringOf([1, k]))).toBe(DSN)
  })

  it("refuses a value copied onto another tenant's row", () => {
    const { k, ref } = seal()
    expect(() =>
      openConnectionUrl(ref, OTHER_TENANT, ringOf([1, k])),
    ).toThrowError(expect.objectContaining({ reason: "not_authentic" }))
  })

  it("refuses the wrong key", () => {
    const { ref } = seal()
    expect(() =>
      openConnectionUrl(ref, TENANT, ringOf([1, key()])),
    ).toThrowError(expect.objectContaining({ reason: "not_authentic" }))
  })

  it("refuses a tampered ciphertext", () => {
    const { k, ref } = seal()
    const env = JSON.parse(
      Buffer.from(ref.slice(SEALED_PREFIX.length), "base64url").toString(),
    )
    const ct = Buffer.from(env.ct, "base64")
    ct[0] ^= 1
    env.ct = ct.toString("base64")
    const tampered =
      SEALED_PREFIX + Buffer.from(JSON.stringify(env)).toString("base64url")
    expect(() =>
      openConnectionUrl(tampered, TENANT, ringOf([1, k])),
    ).toThrowError(SealedSecretError)
  })

  it("reports a missing key version rather than 'not authentic'", () => {
    const { ref } = seal(DSN, TENANT, key(), 7)
    expect(() =>
      openConnectionUrl(ref, TENANT, ringOf([1, key()])),
    ).toThrowError(expect.objectContaining({ reason: "unknown_key_version" }))
  })

  it.each([
    ["not sealed at all", "MY_ENV_VAR"],
    ["empty payload", SEALED_PREFIX],
    ["not base64 json", SEALED_PREFIX + "!!!"],
    [
      "wrong shape",
      SEALED_PREFIX + Buffer.from('{"v":2}').toString("base64url"),
    ],
  ])("reports malformed input: %s", (_n, ref) => {
    expect(() =>
      openConnectionUrl(ref, TENANT, ringOf([1, key()])),
    ).toThrowError(expect.objectContaining({ reason: "malformed" }))
  })

  it("keeps opening old values after the master key rotates", () => {
    const old = key()
    const { ref } = seal(DSN, TENANT, old, 1)
    const next = key()
    const ring = parseKeyRing(
      `1:${old.toString("base64")},2:${next.toString("base64")}`,
    )
    expect(openConnectionUrl(ref, TENANT, (v) => ring.get(v))).toBe(DSN)
    expect(newestKey(ring).version).toBe(2)
  })

  it("will not seal something that is not a connection string", () => {
    expect(() => sealConnectionUrl("hunter2", TENANT, 1, key())).toThrow()
    expect(() => sealConnectionUrl(DSN, "not-a-uuid", 1, key())).toThrow()
    expect(() => sealConnectionUrl(DSN, TENANT, 1, Buffer.alloc(16))).toThrow()
  })

  it("parses a key ring strictly", () => {
    expect(() => parseKeyRing(undefined)).toThrow(/not set/)
    expect(() => parseKeyRing("no-version")).toThrow(/malformed/)
    expect(() => parseKeyRing("1:c2hvcnQ=")).toThrow(/malformed/)
    const k = key().toString("base64")
    expect(() => parseKeyRing(`1:${k},1:${k}`)).toThrow(/twice/)
  })
})

describe("resolveSecret", () => {
  const masterKey = key()
  beforeEach(() => {
    _useKeyRingForTest(`1:${masterKey.toString("base64")}`)
  })
  afterEach(() => {
    _resetKeyRing()
    delete (env as Record<string, string | undefined>).TEST_TENANT_DSN
  })

  it("opens a sealed ref with the application's own key ring", () => {
    const ref = sealConnectionUrl(DSN, TENANT, 1, masterKey)
    expect(resolveSecret(ref, TENANT)).toBe(DSN)
  })

  it("explains, without leaking, a sealed ref that cannot be opened", () => {
    const ref = sealConnectionUrl(DSN, OTHER_TENANT, 1, masterKey)
    const attempt = () => resolveSecret(ref, TENANT)
    expect(attempt).toThrow(/could not be opened \(not_authentic\)/)
    expect(attempt).not.toThrow(/s3cret-pw/)
  })

  it("reports a key ring that lost the version a value was sealed with", () => {
    const ref = sealConnectionUrl(DSN, TENANT, 9, key())
    expect(() => resolveSecret(ref, TENANT)).toThrow(/unknown_key_version/)
  })

  it("still resolves a plain ref as an environment variable name", () => {
    ;(env as Record<string, string | undefined>).TEST_TENANT_DSN = DSN
    expect(resolveSecret("TEST_TENANT_DSN", TENANT)).toBe(DSN)
  })

  it("names the missing variable for a plain ref that is not set", () => {
    expect(() => resolveSecret("NO_SUCH_VARIABLE_ANYWHERE", TENANT)).toThrow(
      /"NO_SUCH_VARIABLE_ANYWHERE" is not set/,
    )
  })
})

describe("resolveTarget with a sealed ref", () => {
  const masterKey = key()
  beforeEach(() => {
    clearRegistryCache()
    _useKeyRingForTest(`1:${masterKey.toString("base64")}`)
  })
  afterEach(() => {
    registryRow = null
    clearRegistryCache()
    _resetKeyRing()
  })

  it("routes a dedicated tenant to its unsealed connection string", async () => {
    const ref = sealConnectionUrl(DSN, TENANT, 1, masterKey)
    registryRow = { tier: "dedicated", connection_secret_ref: ref }
    expect(await resolveTarget(TENANT)).toEqual({
      tier: "dedicated",
      connectionSecretRef: ref,
      connectionUrl: DSN,
    })
  })

  it("does not route a tenant to a database sealed for a different tenant", async () => {
    registryRow = {
      tier: "dedicated",
      connection_secret_ref: sealConnectionUrl(DSN, OTHER_TENANT, 1, masterKey),
    }
    await expect(resolveTarget(TENANT)).rejects.toThrow(/could not be opened/)
  })

  it("still routes a shared tenant to the shared pool", async () => {
    registryRow = { tier: "shared", connection_secret_ref: null }
    expect(await resolveTarget(TENANT)).toEqual({ tier: "shared" })
  })
})
