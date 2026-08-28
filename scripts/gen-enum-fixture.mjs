#!/usr/bin/env node
/**
 * Generates docs/data-models/generated/expected-enums.sql from
 * docs/enumerations.json, so scripts/verify-invariants.sql can compare the
 * database against the source of truth using plain SQL.
 *
 *   node scripts/gen-enum-fixture.mjs
 *
 * The generated file is committed. Regenerate it whenever enumerations.json
 * changes; CI checks it is current, so a forgotten regeneration fails the build
 * rather than silently testing a stale expectation.
 *
 * Naming: enumerations.json uses camelCase keys (employmentType), the database
 * uses snake_case type names (employment_type). The mapping is mechanical.
 */
import { readFileSync, writeFileSync, mkdirSync } from "node:fs"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..")
const SRC = join(ROOT, "docs", "enumerations.json")
const OUT = join(ROOT, "docs", "data-models", "generated", "expected-enums.sql")

const snake = (s) => s.replace(/(?<!^)(?=[A-Z])/g, "_").toLowerCase()

/** Walk the nested enumerations object, collecting every {values: [...]} node. */
function collect(node, found = new Map()) {
  if (node === null || typeof node !== "object") return found
  for (const [key, value] of Object.entries(node)) {
    if (value && typeof value === "object" && Array.isArray(value.values)) {
      found.set(
        snake(key),
        value.values.map((v) => (typeof v === "object" && v !== null ? v.value : v)),
      )
    } else {
      collect(value, found)
    }
  }
  return found
}

const json = JSON.parse(readFileSync(SRC, "utf8"))
const enums = collect(json.enumerations)

const lines = [
  "-- GENERATED FILE — do not edit.",
  "-- Source: docs/enumerations.json",
  "-- Regenerate: node scripts/gen-enum-fixture.mjs",
  "--",
  "-- Loaded by scripts/verify-invariants.sql into the temp table _expected_enum.",
  "-- Only enumerations that exist as a Postgres enum type are compared; the",
  "-- rest are deliberately reference tables or external standards.",
  "",
]

for (const name of [...enums.keys()].sort()) {
  const values = enums.get(name).filter((v) => typeof v === "string")
  if (values.length === 0) continue
  const tuples = values
    .sort()
    .map((v) => `('${name}', '${v.replace(/'/g, "''")}')`)
    .join(",\n  ")
  lines.push(`INSERT INTO _expected_enum (typname, label) VALUES\n  ${tuples};`)
}

mkdirSync(dirname(OUT), { recursive: true })
writeFileSync(OUT, lines.join("\n") + "\n")

const total = [...enums.values()].reduce((n, v) => n + v.length, 0)
console.log(
  `wrote ${OUT.replace(ROOT + "/", "")}: ${enums.size} enumerations, ${total} values`,
)
