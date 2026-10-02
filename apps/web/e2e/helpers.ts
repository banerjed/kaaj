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

  // The sign-in page is server-rendered HTML with no JavaScript, so there is
  // no hydration to wait for: the form works from the first paint.
  await emailField.fill(email)
  await page.locator('input[name="password"]').fill(password)
  await page.getByRole("button", { name: "Sign in", exact: true }).click()
  await expect(page).not.toHaveURL(/\/login\/sign_in/, { timeout: 15_000 })
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
 *
 * The default skips the shell's sign-out forms, which are on every page and
 * come before the page's own form.
 */
export async function submitPastTheBrowser(
  page: Page,
  formSelector = 'form:not([action="/account/sign_out"])',
) {
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
