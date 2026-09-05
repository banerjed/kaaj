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

/**
 * Click the button that opens a modal, and be sure it actually opened.
 * Same helper as form-errors.spec.ts's — duplicated rather than imported so
 * that file stays untouched; shared here for specs written after it.
 */
export async function openModal(page: Page, button: RegExp, field: string) {
  await expect(async () => {
    await page.getByRole("button", { name: button }).first().click()
    await expect(page.locator(field)).toBeVisible({ timeout: 1_000 })
  }).toPass({ timeout: 15_000 })
}

/**
 * Submit a form the browser would otherwise refuse to send — bypasses
 * native `required`/`type` validation so the ACTION sees exactly what was
 * typed, which is the point of an authorization probe: a client-side gate
 * silently blocking submission must never be mistaken for a server-side
 * refusal (TESTPLAN.md SEC-06 found this the hard way).
 */
export async function submitPastTheBrowser(page: Page, formSelector = "form") {
  await page
    .locator(formSelector)
    .first()
    .evaluate((f: HTMLFormElement) => (f.noValidate = true))
  await page
    .locator(formSelector)
    .first()
    .locator('button[type="submit"]')
    .click()
}
