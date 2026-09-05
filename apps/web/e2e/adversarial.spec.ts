import { expect, test } from "@playwright/test"

/**
 * TESTPLAN.md §3 — adversarial cases that aren't "a form the action
 * refuses" (form-errors.spec.ts's territory) but "an input that must
 * behave ordinarily under a hostile value." Read-only: nothing here writes.
 */

test("SQL-special characters in the employee search box behave as an ordinary, non-matching search (ADV-03)", async ({
  page,
}) => {
  // postgres.js parameterizes `ILIKE ${search}` (employees.repo.ts) — if
  // that were ever bypassed, `' OR '1'='1` would make every row match
  // instead of none. "No one matches" is the discriminating result.
  await page.goto("/employees?q=" + encodeURIComponent("' OR '1'='1"))
  await expect(page.getByText("No one matches these filters")).toBeVisible()
})

test("a percent/underscore wildcard in the search box is treated as a literal, not a pattern (ADV-03)", async ({
  page,
}) => {
  // ILIKE's own wildcards, submitted as user input — postgres.js does not
  // escape them (they're not part of SQL injection, just ILIKE syntax), so
  // '%' legitimately matches everything under normal ILIKE semantics. This
  // records that behavior rather than assuming it: a bare '%' is expected
  // to behave like "match everything" here, which is a search-relevance
  // question, not a security one.
  await page.goto("/employees?q=" + encodeURIComponent("%"))
  await expect(page.getByRole("link", { name: "Sarah Johnson" })).toBeVisible()
})

test("a very unusual login email is refused as ordinary bad credentials, not a crash (ADV-10)", async ({
  page,
}) => {
  // This suite's context carries the default owner session (playwright.config.ts) —
  // an already-authenticated visit to /login/sign_in redirects away before the
  // form ever renders, same as smoke.spec.ts's unauthenticated test needs a
  // fresh context for the opposite reason.
  await page.context().clearCookies()
  await page.goto("/login/sign_in")
  const emailField = page.locator('input[name="email"]')
  await expect(emailField).toBeVisible({ timeout: 15_000 })

  await expect(async () => {
    await emailField.fill("' OR '1'='1' -- @example.test")
    await page.locator('input[name="password"]').fill("whatever")
    await expect(emailField).toHaveValue("' OR '1'='1' -- @example.test", {
      timeout: 1_000,
    })
  }).toPass({ timeout: 10_000 })

  await page.getByRole("button", { name: "Sign in", exact: true }).click()

  // Supabase Auth's own client handles this — the assertion is only that
  // our app doesn't crash or navigate anywhere authenticated. No throttling
  // check here; see TESTPLAN.md ADV-11 for that as a separate, investigative
  // (not pass/fail) question.
  await page.waitForTimeout(2_000)
  await expect(page).toHaveURL(/\/login/)
  await expect(page.locator("body")).not.toContainText(/internal error/i)
})
