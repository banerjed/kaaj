import js from "@eslint/js"
import ts from "typescript-eslint"
import prettier from "eslint-config-prettier"
import globals from "globals"

/**
 * Flat config shared by every package. Apps extend it — apps/web adds the
 * Svelte plugin on top, which is why this base stays framework-agnostic.
 */
export default ts.config(
  js.configs.recommended,
  ...ts.configs.recommended,
  prettier,
  {
    languageOptions: {
      globals: { ...globals.browser, ...globals.node },
    },
    rules: {
      // Unused function args are fine (signature symmetry); unused vars still error.
      "@typescript-eslint/no-unused-vars": [
        "error",
        { args: "none", varsIgnorePattern: "^_" },
      ],
    },
  },
  {
    ignores: [
      "**/build/",
      "**/dist/",
      "**/.svelte-kit/",
      "**/node_modules/",
      "**/snapshot/",
    ],
  },
)
