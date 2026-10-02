// The accounting conformance runner's own vitest config: the same app config
// (so `$env` and `$lib` resolve and the engine can be imported), narrowed to
// the one conformance file. `include` is REPLACED, not merged — mergeConfig
// concatenates arrays, which would run every unit test against the
// conformance database. ./check must stay green without this cluster.
import { defineConfig } from "vitest/config"
import base from "./vite.config"

export default defineConfig((env) => {
  const b = base(env)
  return {
    ...b,
    test: {
      ...b.test,
      include: ["src/lib/server/accounting/conformance/acs.conformance.ts"],
      globals: true,
      fileParallelism: false,
      testTimeout: 900_000,
      hookTimeout: 900_000,
    },
  }
})
