#!/usr/bin/env node
/**
 * No backtick inside a SQL `--` comment.
 *
 * A backtick there ends the enclosing `tx\`...\`` JS template literal early —
 * the JS parser has no idea it was meant to be plain text inside a SQL
 * comment. What follows is reinterpreted as ordinary JS, which usually fails
 * to compile... unless the exposed word happens to be an identifier already
 * in scope. Every one of these functions takes a parameter named `tx`, so
 * `` `tx` `` inside a comment reinterprets as a SECOND, VALID tagged-template
 * call using the real `tx` — no type error, no lint warning, just one SQL
 * statement silently split into two malformed fragments at runtime. This has
 * already happened three times: twice before this repo's current history
 * starts (see the L52 reference this fixed instance used to carry), and once
 * more when an automated comment-trimming pass reintroduced it.
 *
 * Deliberately a narrow, lexical check rather than an AST-based one: parsing
 * correctly requires already knowing where the template literal ends, which
 * is exactly the thing a stray backtick makes ambiguous. A `--`-prefixed line
 * has no legitimate reason to exist in a `.ts` file except as SQL text inside
 * a tagged template (JS/TS comments are `//` or `/* *\/`), and Postgres `--`
 * comments have no legitimate use for a backtick either way — so this holds
 * regardless of whether the file's own boundaries are currently correct.
 */
import { readdirSync, readFileSync, statSync } from "node:fs"
import { join, relative } from "node:path"

const ROOT = new URL("..", import.meta.url).pathname
const SCAN = ["apps/web/src"]

function* tsFiles(dir) {
  for (const name of readdirSync(dir)) {
    const full = join(dir, name)
    if (statSync(full).isDirectory()) yield* tsFiles(full)
    else if (name.endsWith(".ts")) yield full
  }
}

const offenders = []
for (const dir of SCAN) {
  for (const file of tsFiles(join(ROOT, dir))) {
    const src = readFileSync(file, "utf8")
    const lines = src.split("\n")
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i]
      const trimmed = line.trimStart()
      if (trimmed.startsWith("--") && line.includes("`")) {
        offenders.push(`${relative(ROOT, file)}:${i + 1}`)
      }
    }
  }
}

if (offenders.length) {
  console.error(
    `\n  ${offenders.length} SQL comment(s) contain a backtick:\n`,
  )
  for (const o of offenders) console.error(`    ${o}`)
  console.error(
    "\n  A backtick inside a `--` comment ends the enclosing tx`...`" +
      "\n  template literal early. Reword without one — use quotes or" +
      "\n  parentheses instead of markdown-style `code` formatting.\n",
  )
  process.exit(1)
}
console.log("  no backtick inside a SQL comment")
