module.exports = {
  root: true,
  extends: [
    "eslint:recommended",
    "plugin:@typescript-eslint/recommended",
    "plugin:svelte/recommended",
    "prettier",
  ],
  parser: "@typescript-eslint/parser",
  plugins: ["@typescript-eslint"],
  parserOptions: {
    sourceType: "module",
    ecmaVersion: 2020,
    extraFileExtensions: [".svelte"],
  },
  overrides: [
    {
      files: ["*.svelte"],
      parser: "svelte-eslint-parser",
      parserOptions: {
        parser: {
          // Specify a parser for each lang.
          ts: "@typescript-eslint/parser",
          js: "espree",
          typescript: "@typescript-eslint/parser",
        },
      },
    },
    {
      // Apply to all test files. Proper type checking in tests with mocks can be tedious and counterproductive.
      files: ["**/*.test.ts", "**/*.spec.ts"],
      rules: {
        "@typescript-eslint/no-explicit-any": "off",
      },
    },
  ],
  env: {
    browser: true,
    es2017: true,
    node: true,
  },
  rules: {
    "no-undef": "off",
    // no-undef has been turned off because of this:
    // basically, it causes issues and TS does those checks so it's redundant
    // https://typescript-eslint.io/linting/troubleshooting#i-get-errors-from-the-no-undef-rule-about-global-variables-not-being-defined-even-though-there-are-no-typescript-errors

    // An underscore prefix marks a binding that is deliberately unused, and the
    // rule should trust it. The case that motivated this: getConnection(_tenantId)
    // carries the tier-aware signature ADR-009 specifies, so the per-subdomain
    // router can be dropped in later without touching a single call site.
    // Deleting the parameter to satisfy the linter would mean changing every
    // repository on the day that lands.
    "@typescript-eslint/no-unused-vars": [
      "error",
      {
        argsIgnorePattern: "^_",
        varsIgnorePattern: "^_",
        caughtErrorsIgnorePattern: "^_",
      },
    ],
  },
}
