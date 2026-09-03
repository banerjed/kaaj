#!/usr/bin/env node
/**
 * Every withTenant in application code carries the ACTOR, not a bare tenant
 * id — row-visibility policies key on role and person, so a bare id passes
 * isolation but returns zero rows, silently (L21).
 */
import { readdirSync, readFileSync, statSync } from "node:fs"
import { join, relative } from "node:path"

const ROOT = new URL("..", import.meta.url).pathname
const DIRS = ["apps/web/src/routes", "apps/web/src/lib/server"]

function* tsFiles(dir) {
  for (const name of readdirSync(dir)) {
    const full = join(dir, name)
    if (statSync(full).isDirectory()) yield* tsFiles(full)
    else if (name.endsWith(".ts") && !name.endsWith(".test.ts")) yield full
  }
}

const bare = []
for (const d of DIRS) {
  for (const file of tsFiles(join(ROOT, d))) {
    const src = readFileSync(file, "utf8")
    for (const m of src.matchAll(/withTenant\(\s*(locals\.tenantId|tenantId)\s*,/g)) {
      const line = src.slice(0, m.index).split("\n").length
      bare.push(`${relative(ROOT, file)}:${line}`)
    }
  }
}

if (bare.length) {
  console.error(`\n  ${bare.length} withTenant call(s) pass a bare tenant id:\n`)
  for (const b of bare) console.error(`    ${b}`)
  console.error(
    "\n  Row-visibility policies key on the role and the person, so a claim" +
      "\n  carrying neither returns ZERO ROWS — silently. Use actorFrom(locals)." +
      "\n  See docs/15-row-level-visibility.md.\n",
  )
  process.exit(1)
}
console.log("  every withTenant carries the actor")
