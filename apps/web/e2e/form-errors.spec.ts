import { expect, test, type Page } from "@playwright/test"

/**
 * A refused form says WHICH field, and puts the mark on that field.
 *
 * Like `smoke.spec.ts`, this suite writes nothing — every submission here is
 * one the action REFUSES, so no row is created and the fixture stays pristine.
 * That is the reason it can live beside the read-only specs and run in
 * parallel with them.
 *
 * It exists because the three things it asserts each failed silently and
 * separately, and none of the other seventeen checks can see any of them:
 *
 *   - the message. Every action answered "Some fields need attention.", which
 *     is true of every rejection and actionable in none.
 *   - the mark. Actions returned `errorFields` and thirteen of sixteen pages
 *     rendered nothing with it, so the field that was wrong looked exactly
 *     like the nine that were right.
 *   - the form still being THERE. A plain POST reloads the page, which
 *     reconstructs `$state` and closes the modal the form lives in — so the
 *     alert arrived describing a form that was no longer on screen, with
 *     everything typed into it gone (L68).
 *
 * Native validation is turned off before submitting. `required` and `type`
 * are browser UX; the subject here is what the ACTION does with a request
 * that got past them, which is the premise of L34 and of `FormReader`.
 */

/**
 * Click the button that opens a modal, and be sure it actually opened.
 *
 * The handler is attached at hydration, so a click that lands before it does
 * nothing at all — silently, and only when the dev server is compiling other
 * pages at the same time. Retrying the click is the fix; asserting on the
 * first one is a test that fails by position.
 */
async function openModal(page: Page, button: RegExp, field: string) {
  await expect(async () => {
    await page.getByRole("button", { name: button }).first().click()
    await expect(page.locator(field)).toBeVisible({ timeout: 1000 })
  }).toPass({ timeout: 15_000 })
}

/** Submit a form the browser would otherwise refuse to send. */
async function submitPastTheBrowser(page: Page, action: string) {
  await page
    .locator(`form[action="${action}"]`)
    .evaluate((f: HTMLFormElement) => (f.noValidate = true))
  await page.locator(`form[action="${action}"] button[type="submit"]`).click()
}

test("a modal form keeps the refused field marked, and stays open", async ({
  page,
}) => {
  await page.goto("/settings/holidays")
  await openModal(page, /new holiday/i, 'input[name="name"]')

  const name = page.locator('input[name="name"]')
  const date = page.locator('input[name="date"]')

  // A real date, no name: exactly one field is wrong.
  await date.fill("2027-03-17")
  await submitPastTheBrowser(page, "?/save")

  // The message NAMES it rather than gesturing at the form.
  await expect(page.locator(".alert").first()).toContainText("Name")

  // The modal is still open and the good value survived, or there is nothing
  // for the person to correct.
  await expect(name).toBeVisible()
  await expect(date).toHaveValue("2027-03-17")

  // The mark is on the field that failed — and not on the one that did not.
  await expect(name).toHaveClass(/input-error/)
  await expect(name).toHaveAttribute("aria-invalid", "true")
  await expect(date).not.toHaveClass(/input-error/)
})

test("a full-page form marks the refused field too", async ({ page }) => {
  await page.goto("/settings/company")

  const companyName = page.locator('input[name="company_name"]')
  await expect(companyName).toBeVisible()
  await companyName.fill("")
  await submitPastTheBrowser(page, "?/update")

  await expect(page.locator(".alert").first()).toContainText("Company name")
  await expect(companyName).toHaveClass(/input-error/)
  await expect(companyName).toHaveAttribute("aria-invalid", "true")
})

test("a database refusal is a sentence, not a crash page", async ({ page }) => {
  await page.goto("/settings/departments")
  await openModal(page, /new department/i, 'input[name="department_code"]')

  // ENG is in the fixture, and `UNIQUE (tenant_id, department_code)` refuses a
  // second one. This was an "Internal Error" page until the constraint
  // registry named it.
  await page.locator('input[name="name"]').fill("Duplicate Probe")
  await page.locator('input[name="department_code"]').fill("ENG")
  await submitPastTheBrowser(page, "?/save")

  await expect(page.locator(".alert").first()).toContainText(
    /already uses that code/i,
  )
  await expect(page.locator('input[name="department_code"]')).toHaveClass(
    /input-error/,
  )
})

test("a refused form keeps what was typed into it", async ({ page }) => {
  // `keepValues` is the non-modal half of the same rule. Without it the POST
  // reloads the page, every input reverts to the value the server last knew,
  // and the person is asked to fix an edit that is no longer on screen.
  await page.goto("/compensation/6d466aa9-e51a-5d52-9015-152600855932")
  await openModal(page, /record a change/i, 'input[name="amount"]')

  const amount = page.locator('input[name="amount"]')

  // Six decimal places on a numeric(15,2): refused rather than rounded, so
  // nobody is silently paid a figure they did not enter.
  await amount.fill("123456.789012")
  await submitPastTheBrowser(page, "?/raise")

  await expect(amount).toHaveClass(/input-error/)
  await expect(amount).toHaveAttribute("aria-invalid", "true")
  await expect(amount).toHaveValue("123456.789012")
})
