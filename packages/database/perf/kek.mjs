/**
 * The perf tenant's PRIVATE_PII_KEK: one local key, generated on first use
 * and kept beside the cluster's data, outside the repository.
 *
 * Not the development key from apps/web/.env.example: a production build
 * refuses that one (`keyRing()` in pii/keys.ts), and the perf tenant is
 * measured through a production build. Losing this file only means a
 * reseed — every value it seals is generated.
 */
import { randomBytes } from "node:crypto"
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs"
import { homedir } from "node:os"
import { join } from "node:path"
import { parseKeyRing } from "../../../apps/web/src/lib/server/db/sealed-secret.js"

const FILE = join(homedir(), ".kaaj", "perf-pii-kek")

/** The key ring as PRIVATE_PII_KEK spells it: `1:<base64>`. */
export function perfKek() {
  if (!existsSync(FILE)) {
    mkdirSync(join(homedir(), ".kaaj"), { recursive: true })
    writeFileSync(FILE, `1:${randomBytes(32).toString("base64")}\n`, { mode: 0o600 })
  }
  return readFileSync(FILE, "utf8").trim()
}

/** version -> key */
export function perfKeyRing() {
  return parseKeyRing(perfKek())
}
