---
paths:
  - "**/*.test.ts"
  - "apps/web/e2e/**"
  - "packages/spec-tests/**"
  - ".github/workflows/**"
  - "docs/22-test-inventory.md"
---

# Test rules

Claude Code loads this file when it reads a test, an e2e spec or a CI workflow.

**Run a test for an access rule as the actor that the rule must REFUSE.** The
repository test suites deliberately run as an owner, so that a policy cannot
narrow what they see with no error. But then these suites cannot reach the
restricted branch of any query. Assert both halves: the refused actor gets NULL,
*and* the permitted actor still gets the value.

To do a test of the policy of a child table, read the child table alone. A join
to its parent applies the policy of the parent, and that hides a policy with a
bug on the child ([L110](docs/10-lessons-learned.md)). If a policy hides all
values, the page looks like it has a bug. It does not look like a rule.

**A new page under `(app)` gets a line in `apps/web/e2e/smoke.spec.ts`. A new
FORM gets a case in `apps/web/e2e/form-errors.spec.ts`.** They are the only
e2e tests that load a URL. Apart from these tests, only the front-page load
step and the perf steps render a page in `./check`. These tests ask for
headings BY ROLE. This is how the smoke test found that no page in
the product had an `<h1>` ([L64](docs/10-lessons-learned.md)).

Both are read-only, because the unit suites use the same fixture. A spec
that WRITES goes in the `writes` project of `playwright.config.ts`: its file
is named `*.writes.spec.ts`, it runs on one worker after the read-only
project, and it must remove every row it creates (`webhook-bird.writes.spec.ts`
does this by the addresses it chose, as the owner, in `beforeAll` and
`afterAll`). It never changes a fixture row another test asserts on
([L125](docs/10-lessons-learned.md)). Run them with
`pnpm --filter @kaaj/web e2e`. They are NOT in plain `./check` on purpose:
`./check` takes 24 seconds, and the team wants to keep that time.
`./check --all` and the pre-push hook run them.

**If you did not see a workflow green, do not think that it runs.**
`tests.yml` failed each run for five weeks. In the same weeks, `build`,
`linting`, `format`, `database` and `e2e` were green on the same commits. Many
green marks with one red cross look like "a test over there that sometimes
fails". The failure hid two suites that never ran. Five assertions of those
suites are Storage RLS tenant isolation.

Examine the COUNT of runs, not the last run.
`gh run list --workflow=<file> --limit 30` shows the difference between
"fails" and "never passed". On one red mark, these two look the same
([L114](docs/10-lessons-learned.md)). Examine specifically the workflow of a
suite that connects to a service over HTTP. On a local machine, the
`supabase start` services always run. Thus, on a development machine, "needs
Postgres" and "needs GoTrue" have no difference.

**A new test file, or a new top-level `describe` in a current file, gets a
line in [docs/22-test-inventory.md](docs/22-test-inventory.md).** Nothing
enforces this rule, and no step fails, the same as for the `testplan-*.md`
set. Thus, the doc stays correct only if you update it in the same PR that
adds the test, not after.

The doc groups unit tests by module (`pnpm --filter @kaaj/web run test`) and
e2e tests by purpose (`pnpm --filter @kaaj/web e2e`). Add the line to the
section that already covers the area. If no section covers the area, start a
new section. The doc exists to show this type of gap: a module with no
section. The doc found two already: documents and ticketing had no section.
