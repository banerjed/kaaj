import { expect, type Page } from "@playwright/test"

/**
 * Sign in through the real form, for a persona that doesn't share the
 * suite's default owner storage state — a customer-portal contact, a
 * terminated employee, or anyone else whose session needs to be distinct
 * within a single test rather than reused across the whole run.
 */
export async function signInAs(
  page: Page,
  email: string,
  password = "devpassword",
) {
  await page.context().clearCookies()
  await page.goto("/login/sign_in")

  const emailField = page.locator('input[name="email"]')
  await expect(emailField).toBeVisible({ timeout: 15_000 })

  // The Auth UI mounts its Supabase client in onMount, so the very first
  // fill can land before the form is truly interactive and gets dropped
  // silently — retry the whole fill rather than trust one attempt, the same
  // race auth.setup.ts and form-errors.spec.ts already work around.
  await expect(async () => {
    await emailField.fill(email)
    await page.locator('input[name="password"]').fill(password)
    await expect(emailField).toHaveValue(email, { timeout: 1_000 })
  }).toPass({ timeout: 10_000 })

  // The submit handler attaches on hydration; a click that lands before it
  // does nothing at all, silently, and leaves the page exactly where it
  // was — which a lenient `waitForURL` regex (one that also accepts
  // `/login`) can mistake for "arrived and was refused." Retry the click
  // itself until the URL actually leaves /login/sign_in, the same race
  // `openModal` works around in form-errors.spec.ts.
  await expect(async () => {
    await page.getByRole("button", { name: "Sign in", exact: true }).click()
    await expect(page).not.toHaveURL(/\/login\/sign_in/, { timeout: 2_000 })
  }).toPass({ timeout: 15_000 })
}
