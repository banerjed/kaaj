#!/usr/bin/env node
/**
 * The product name is spelled ONCE, in `apps/web/src/config.ts`.
 *
 * It was not. `WebsiteName` sat at the CMSaasStarter default long after the
 * fork, so the public site served `<title>SaaS Starter</title>` and put that
 * name in its nav, while the application area wrote "Kaaj" by hand in
 * thirty-one places — twenty-eight of them `<title>X · Kaaj</title>`. The
 * product shipped under two names and the wrong one was the public one.
 *
 * A rename is the moment that bites, and it is also the moment nobody greps
 * for. So this is a check rather than a note: a new literal fails here, and
 * whoever adds it is told where the constant lives.
 *
 * It reads the name FROM the config rather than holding its own copy, so
 * renaming the product does not require editing this file too.
 */
import { readdirSync, readFileSync, statSync } from "node:fs"
import { join, relative } from "node:path"

const ROOT = new URL("..", import.meta.url).pathname
const CONFIG = "apps/web/src/config.ts"
const SCAN = ["apps/web/src", "apps/web/e2e"]

const config = readFileSync(join(ROOT, CONFIG), "utf8")
const name = config.match(/WebsiteName:\s*string\s*=\s*"([^"]+)"/)?.[1]
if (!name) {
  console.error(`  could not read WebsiteName from ${CONFIG}`)
  process.exit(1)
}

/** Files allowed to contain the literal, each with a reason. */
const PERMITTED = new Map([[CONFIG, "defines it"]])

/**
 * Comments are stripped before scanning.
 *
 * Prose legitimately names the product — "Kaaj carries two themes", "Kaaj
 * addition" — and flagging that would make the check noise, which is how a
 * check stops being read. Commenting a violation OUT is not an escape either:
 * uncommenting it puts the literal back into code, where the next run catches
 * it.
 */
function code(src) {
  return src
    .replace(/<!--[\s\S]*?-->/g, "")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/(^|[^:])\/\/[^\n]*/g, "$1")
}

function* sourceFiles(dir) {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry)
    if (statSync(full).isDirectory()) {
      if (entry === "node_modules" || entry === ".svelte-kit") continue
      yield* sourceFiles(full)
    } else if (/\.(ts|js|svelte|html)$/.test(entry)) {
      yield full
    }
  }
}

const offenders = []
for (const dir of SCAN) {
  for (const file of sourceFiles(join(ROOT, dir))) {
    const rel = relative(ROOT, file)
    if (PERMITTED.has(rel)) continue
    // Line numbers stay true: comments are blanked, not removed.
    const src = code(readFileSync(file, "utf8"))
    src.split("\n").forEach((line, i) => {
      if (line.includes(name)) offenders.push(`${rel}:${i + 1}`)
    })
  }
}

const stale = [...PERMITTED.keys()].filter(
  (f) => !readFileSync(join(ROOT, f), "utf8").includes(name),
)

if (offenders.length || stale.length) {
  if (offenders.length) {
    console.error(
      `\n  ${offenders.length} place(s) spell "${name}" instead of importing it:\n`,
    )
    for (const o of offenders) console.error(`    ${o}`)
    console.error(
      `\n  Import { WebsiteName } from the app's config, or use PageHead for a` +
        `\n  document title. Renaming the product must be one edit, not ${offenders.length + 1}.\n`,
    )
  }
  if (stale.length) {
    console.error(`\n  ${stale.length} permitted file(s) no longer contain it:\n`)
    for (const f of stale) console.error(`    ${f}`)
    console.error("\n  Remove them from PERMITTED — the list is the claim.\n")
  }
  process.exit(1)
}

console.log(`  "${name}" is spelled once, in ${CONFIG}`)
