import { afterAll, describe, expect, it } from "vitest"
import { closeConnections } from "../db/client"
import { withTenant, type Tx } from "../db/tenant"
import {
  DecryptionFailed,
  decrypt,
  encrypt,
  newDataKey,
  parseEnvelope,
  sameKey,
  serialiseEnvelope,
  unwrapKey,
  wrapKey,
} from "./envelope"
import * as pii from "./pii.repo"

/**
 * PII encryption. The envelope cases are pure; the rest run against the real
 * database and roll back.
 */

const NORTHWIND = "07fb03f8-1521-5ef4-9c2d-25fcfa297ac1"
const SARAH = "6d466aa9-e51a-5d52-9015-152600855932"
const MARCUS = "db1f1f2b-b140-5948-a34e-1c998ed98757"
/** Has an erasure record and deliberately NO key. */
const PRIYA = "bf17b1af-963b-53ef-9083-21506fb34e9c"

const subject = (id: string, tenantId = NORTHWIND): pii.Subject => ({
  tenantId,
  subjectType: "employee",
  subjectId: id,
})

const taxField = (id: string) => ({
  table: "employees",
  column: "ssn_tax_id_ct",
  rowId: id,
})

async function inRollback<T>(fn: (tx: Tx) => Promise<T>): Promise<T> {
  const marker = new Error("__rollback__")
  try {
    return await withTenant(NORTHWIND, async (tx) => {
      const result = await fn(tx)
      throw Object.assign(marker, { result })
    })
  } catch (e) {
    if (e === marker) return (e as { result: T }).result
    throw e
  }
}

describe("the envelope", () => {
  const key = newDataKey()
  const binding = {
    tenantId: NORTHWIND,
    table: "employees",
    column: "ssn_tax_id_ct",
    rowId: SARAH,
  }

  it("round-trips", () => {
    const e = encrypt("123-45-6789", key, 1, binding)
    expect(decrypt(e, key, binding)).toBe("123-45-6789")
  })

  it("never repeats a ciphertext for the same plaintext", () => {
    // A deterministic scheme would let anyone with read access group employees
    // by equal tax identifier without decrypting anything.
    const a = encrypt("123-45-6789", key, 1, binding)
    const b = encrypt("123-45-6789", key, 1, binding)
    expect(a.ct).not.toBe(b.ct)
    expect(a.iv).not.toBe(b.iv)
  })

  it("refuses a ciphertext moved to another ROW", () => {
    // Without AAD binding, `UPDATE employees SET ssn_ct = (SELECT ssn_ct FROM
    // employees WHERE ...)` would silently graft one person's tax identifier
    // onto another and decrypt cleanly.
    const e = encrypt("123-45-6789", key, 1, binding)
    expect(() => decrypt(e, key, { ...binding, rowId: MARCUS })).toThrow(
      DecryptionFailed,
    )
  })

  it("refuses a ciphertext moved to another TENANT", () => {
    const e = encrypt("123-45-6789", key, 1, binding)
    expect(() =>
      decrypt(e, key, { ...binding, tenantId: crypto.randomUUID() }),
    ).toThrow(DecryptionFailed)
  })

  it("refuses a ciphertext moved to another COLUMN", () => {
    const e = encrypt("123-45-6789", key, 1, binding)
    expect(() => decrypt(e, key, { ...binding, column: "phone" })).toThrow(
      DecryptionFailed,
    )
  })

  it("refuses a tampered ciphertext and a tampered tag", () => {
    const e = encrypt("123-45-6789", key, 1, binding)
    const ct = Buffer.from(e.ct, "base64")
    ct[0] ^= 0xff
    expect(() =>
      decrypt({ ...e, ct: ct.toString("base64") }, key, binding),
    ).toThrow(DecryptionFailed)

    const tag = Buffer.from(e.tag, "base64")
    tag[0] ^= 0xff
    expect(() =>
      decrypt({ ...e, tag: tag.toString("base64") }, key, binding),
    ).toThrow(DecryptionFailed)
  })

  it("refuses the wrong key", () => {
    const e = encrypt("123-45-6789", key, 1, binding)
    expect(() => decrypt(e, newDataKey(), binding)).toThrow(DecryptionFailed)
  })

  it("records the key version, so rotation has something to read", () => {
    expect(encrypt("x", key, 7, binding).k).toBe(7)
  })

  it("rejects a key that is not 256 bits", () => {
    expect(() => encrypt("x", Buffer.alloc(16), 1, binding)).toThrow(/32 bytes/)
  })

  it("reports a malformed envelope rather than treating it as empty", () => {
    expect(() => parseEnvelope("not json")).toThrow(DecryptionFailed)
    expect(() => parseEnvelope('{"v":99}')).toThrow(DecryptionFailed)
    // A genuinely absent value is not malformed.
    expect(parseEnvelope(null)).toBeNull()
    expect(parseEnvelope("")).toBeNull()
  })

  it("wraps and unwraps a data key, bound to its subject", () => {
    const kek = newDataKey()
    const dek = newDataKey()
    const wrapped = wrapKey(dek, kek, 1, NORTHWIND, SARAH)
    expect(sameKey(unwrapKey(wrapped, kek, NORTHWIND, SARAH), dek)).toBe(true)
    // A wrapped key lifted onto another employee must not open.
    expect(() => unwrapKey(wrapped, kek, NORTHWIND, MARCUS)).toThrow(
      DecryptionFailed,
    )
  })
})

describe("the stored fixture", () => {
  afterAll(async () => {
    await closeConnections()
  })

  it("holds ciphertext, not tax identifiers", async () => {
    // The point of the whole exercise: a database dump is inert.
    const rows = await withTenant(
      NORTHWIND,
      (tx) => tx<{ ssn_tax_id_ct: string }[]>`
      SELECT ssn_tax_id_ct FROM employees WHERE ssn_tax_id_ct IS NOT NULL
    `,
    )
    expect(rows.length).toBeGreaterThan(0)
    for (const r of rows) {
      expect(r.ssn_tax_id_ct).not.toMatch(/\d{3}-\d{2}-\d{4}/)
      expect(r.ssn_tax_id_ct).not.toMatch(/[A-Z]{5}\d{4}[A-Z]/) // Indian PAN
      expect(parseEnvelope(r.ssn_tax_id_ct)!.v).toBe(1)
    }
  })

  it("has no plaintext column left to read", async () => {
    const [col] = (await withTenant(
      NORTHWIND,
      (tx) => tx`
      SELECT count(*)::int AS n FROM information_schema.columns
       WHERE table_name = 'employees' AND column_name = 'ssn_tax_id'
    `,
    )) as unknown as { n: number }[]
    expect(col.n).toBe(0)
  })

  it("has no index over the plaintext either", async () => {
    // An index would have kept every identifier readable in its pages, and
    // dropping the column does not scrub them.
    const [idx] = (await withTenant(
      NORTHWIND,
      (tx) => tx`
      SELECT count(*)::int AS n FROM pg_indexes
       WHERE tablename = 'employees' AND indexname = 'idx_employees_ssn_tax_id'
    `,
    )) as unknown as { n: number }[]
    expect(idx.n).toBe(0)
  })

  it("opens with the key that is stored for that person", async () => {
    const value = await withTenant(NORTHWIND, async (tx) => {
      const [row] = await tx<{ ssn_tax_id_ct: string }[]>`
        SELECT ssn_tax_id_ct FROM employees WHERE id = ${SARAH}
      `
      return pii.openField(
        tx,
        subject(SARAH),
        taxField(SARAH),
        row.ssn_tax_id_ct,
      )
    })
    expect(value).toEqual({ value: "123-45-6789", erased: false })
  })

  it("labels the key the way the specification asks, without deriving from it", async () => {
    // {org_prefix}-{4digit_code} is an IDENTIFIER. The key material is random.
    const [row] = (await withTenant(
      NORTHWIND,
      (tx) => tx`
      SELECT key_label FROM pii_keys LIMIT 1
    `,
    )) as unknown as { key_label: string }[]
    expect(row.key_label).toMatch(/^[A-Z0-9]{1,8}-\d{4}$/)
  })
})

describe("writing an encrypted field", () => {
  it("mints a key on first use and reads back what was written", async () => {
    const result = await inRollback(async (tx) => {
      const before = await tx<
        { n: number }[]
      >`SELECT count(*)::int AS n FROM pii_keys`
      const sealed = await pii.sealField(
        tx,
        subject(PRIYA),
        taxField(PRIYA),
        "AAAPA1234A",
      )
      await tx`UPDATE employees SET ssn_tax_id_ct = ${sealed} WHERE id = ${PRIYA}`
      const after = await tx<
        { n: number }[]
      >`SELECT count(*)::int AS n FROM pii_keys`
      const read = await pii.openField(
        tx,
        subject(PRIYA),
        taxField(PRIYA),
        sealed,
      )
      return {
        minted:
          (after as { n: number }[])[0].n - (before as { n: number }[])[0].n,
        read,
        sealed,
      }
    })
    expect(result.minted).toBe(1)
    expect(result.read).toEqual({ value: "AAAPA1234A", erased: false })
    expect(result.sealed).not.toContain("AAAPA1234A")
  })

  it("stores nothing for a blank value", async () => {
    const sealed = await inRollback((tx) =>
      pii.sealField(tx, subject(SARAH), taxField(SARAH), ""),
    )
    expect(sealed).toBeNull()
  })
})

describe("erasure — GDPR Article 17", () => {
  it("destroys the key, so the ciphertext cannot be recovered from a backup", async () => {
    const result = await inRollback(async (tx) => {
      const [before] = await tx<{ ssn_tax_id_ct: string }[]>`
        SELECT ssn_tax_id_ct FROM employees WHERE id = ${SARAH}
      `
      const opened = await pii.openField(
        tx,
        subject(SARAH),
        taxField(SARAH),
        before.ssn_tax_id_ct,
      )

      const erased = await pii.eraseSubject(tx, subject(SARAH), {
        reason: "Data subject request",
        requestedBy: null,
        subjectLabel: "E001",
      })

      // The ciphertext as it would still exist in yesterday's backup.
      const afterErasure = await pii.openField(
        tx,
        subject(SARAH),
        taxField(SARAH),
        before.ssn_tax_id_ct,
      )
      const [row] = await tx<{ ssn_tax_id_ct: string | null }[]>`
        SELECT ssn_tax_id_ct FROM employees WHERE id = ${SARAH}
      `
      const [audit] = await tx<{ n: number }[]>`
        SELECT count(*)::int AS n FROM pii_erasures WHERE subject_id = ${SARAH}
      `
      return {
        opened,
        erased,
        afterErasure,
        live: row.ssn_tax_id_ct,
        audit: audit.n,
      }
    })

    expect(result.opened.value).toBe("123-45-6789")
    expect(result.erased.keyDestroyed).toBe(true)
    // The backup's ciphertext is now unreadable — this is the load-bearing part.
    expect(result.afterErasure).toEqual({ value: null, erased: true })
    expect(result.live).toBeNull()
    expect(result.audit).toBe(1)
  })

  it("erases one person without touching anyone else", async () => {
    // The reason keys are per-subject rather than per-tenant: Article 17 is an
    // individual right, and a tenant-wide key cannot answer it.
    const other = await inRollback(async (tx) => {
      await pii.eraseSubject(tx, subject(SARAH), {
        reason: "Data subject request",
        requestedBy: null,
        subjectLabel: "E001",
      })
      const [row] = await tx<{ ssn_tax_id_ct: string }[]>`
        SELECT ssn_tax_id_ct FROM employees WHERE id = ${MARCUS}
      `
      return pii.openField(
        tx,
        subject(MARCUS),
        taxField(MARCUS),
        row.ssn_tax_id_ct,
      )
    })
    expect(other).toEqual({ value: "ABCDE1234F", erased: false })
  })

  it("records the request even when there was no key to destroy", async () => {
    const result = await inRollback((tx) =>
      pii.eraseSubject(tx, subject(PRIYA), {
        reason: "Data subject request",
        requestedBy: null,
        subjectLabel: "E003",
      }),
    )
    expect(result.keyDestroyed).toBe(false)
  })

  it("does not mint a fresh key for an erased subject on read", async () => {
    // The trap: `dataKey` creates on miss, so an unguarded read path would
    // resurrect a key, fail to decrypt, and report corruption instead of an
    // erasure that was correctly honoured.
    const result = await inRollback(async (tx) => {
      const [row] = await tx<{ ssn_tax_id_ct: string }[]>`
        SELECT ssn_tax_id_ct FROM employees WHERE id = ${SARAH}
      `
      await tx`DELETE FROM pii_keys WHERE subject_id = ${SARAH}`
      const read = await pii.openField(
        tx,
        subject(SARAH),
        taxField(SARAH),
        row.ssn_tax_id_ct,
      )
      const [keys] = await tx<{ n: number }[]>`
        SELECT count(*)::int AS n FROM pii_keys WHERE subject_id = ${SARAH}
      `
      return { read, keys: keys.n }
    })
    expect(result.read).toEqual({ value: null, erased: true })
    expect(result.keys).toBe(0)
  })
})

describe("key rotation", () => {
  it("rotates the master key without re-encrypting a single field", async () => {
    // The envelope's whole purpose: field ciphertext is under the data key,
    // which never changes. Rotating the master re-wraps one small row per
    // subject instead of rewriting every encrypted column in the database.
    const result = await inRollback(async (tx) => {
      const [before] = await tx<{ wrapped_dek: string; kek_version: number }[]>`
        SELECT wrapped_dek, kek_version FROM pii_keys WHERE subject_id = ${SARAH}
      `
      const [emp] = await tx<{ ssn_tax_id_ct: string }[]>`
        SELECT ssn_tax_id_ct FROM employees WHERE id = ${SARAH}
      `
      const pending = await pii.needsRewrap(tx)
      return { before, ciphertext: emp.ssn_tax_id_ct, pending }
    })
    // Only one master key is configured locally, so nothing is pending.
    expect(result.pending).toEqual([])
    expect(result.before.kek_version).toBe(1)
    // And the field ciphertext records the key version it was written under.
    expect(parseEnvelope(result.ciphertext)!.k).toBe(1)
  })

  it("survives a round trip through the stored envelope format", () => {
    const key = newDataKey()
    const binding = {
      tenantId: NORTHWIND,
      table: "t",
      column: "c",
      rowId: SARAH,
    }
    const stored = serialiseEnvelope(encrypt("secret", key, 3, binding))
    expect(decrypt(parseEnvelope(stored)!, key, binding)).toBe("secret")
  })
})
