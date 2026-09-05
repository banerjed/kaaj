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

  // Same hydration race as openModal above, on a field instead of a click,
  // and wider than it looks: this input is server-rendered with the real
  // company name already in it, `value={company.company_name}` is a one-way
  // binding Svelte can re-apply on its own schedule, and a trace confirmed a
  // confirmed-empty fill still lost the race — ~600ms elapsed between the
  // value reading "" and the click actually landing (submit's own
  // actionability/stability polling), long enough for a re-render to put the
  // original text back before the value is ever read for the request. No
  // single wait closes that window reliably, so retry the whole interaction:
  // if the wrong ("succeeded") outcome shows up, re-fill and resubmit rather
  // than trust one attempt. Idempotent — a wrongly-accepted save just writes
  // back the same unchanged name, so retrying costs nothing.
  await expect(async () => {
    await companyName.fill("")
    await submitPastTheBrowser(page, "?/update")
    await expect(page.locator(".alert").first()).toContainText("Company name", {
      timeout: 3_000,
    })
  }).toPass({ timeout: 20_000 })

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

test("logging time without a description is refused, hours survive", async ({
  page,
}) => {
  await page.goto("/time-tracking")
  await openModal(page, /log time/i, 'select[name="project_id"]')

  const project = page.locator('select[name="project_id"]')
  const hours = page.locator('input[name="hours"]')
  const description = page.locator('textarea[name="description"]')

  await project.selectOption({ index: 1 }) // first real project, after the placeholder
  await hours.fill("7.5")
  // description left blank — required
  await submitPastTheBrowser(page, "?/create")

  await expect(page.locator(".alert").first()).toContainText("Description")
  await expect(hours).toBeVisible()
  await expect(hours).toHaveValue("7.5")
  await expect(description).toHaveClass(/textarea-error/)
  await expect(description).toHaveAttribute("aria-invalid", "true")
})

test("a vendor payment with a third decimal is refused, not rounded", async ({
  page,
}) => {
  // BILL-AWS-2026-01: approved, outstanding, so "Pay vendor" is on screen.
  await page.goto("/accounting/bills/fdab0a8b-c4d8-5601-bf23-59c3028e9359")
  await openModal(page, /pay vendor/i, 'input[name="amount"]')

  const amount = page.locator('input[name="amount"]')
  const date = page.locator('input[name="payment_date"]')

  // Same shape as the compensation case: numeric(15,2) refuses a third
  // decimal rather than silently rounding it away.
  await amount.fill("123.456")
  await date.fill("2026-03-15")
  await submitPastTheBrowser(page, "?/recordPayment")

  await expect(amount).toHaveClass(/input-error/)
  await expect(amount).toHaveAttribute("aria-invalid", "true")
  await expect(amount).toHaveValue("123.456")
  // The modal is still open and the good field survived.
  await expect(date).toHaveValue("2026-03-15")
})

test("matching a bank transaction with no payment chosen is refused", async ({
  page,
}) => {
  await page.goto("/accounting/banking")
  await openModal(page, /^match$/i, 'select[name="payment_id"]')

  // The placeholder option is left selected — required, and empty past the
  // browser once noValidate is set.
  await submitPastTheBrowser(page, "?/match")

  await expect(page.locator(".alert").first()).toContainText("Missing payment")
  await expect(page.locator('select[name="payment_id"]')).toHaveClass(
    /select-error/,
  )
  await expect(page.locator('select[name="payment_id"]')).toHaveAttribute(
    "aria-invalid",
    "true",
  )
})

/**
 * TESTPLAN.md ADV-05/06/07 — three more `/employees/new` refusals, past the
 * browser in a different sense than `submitPastTheBrowser` above: a native
 * `<input type="date">` refuses to even HOLD "2026-02-30" — setting
 * `.value` to a calendar-invalid date leaves it empty, confirmed live
 * (`input.value = '2026-02-30'` → `""`). So this exact payload can only
 * reach the server from something that isn't a browser date picker — a
 * modified request, an old client, a different form entirely — which is
 * exactly the client `f.date()`'s round-trip check (L67) exists for. A raw
 * `page.request.post` reaches the same `default` action a real submission
 * would, without a UI control standing in the way of the probe.
 *
 * A raw `page.request.post` isn't treated as a full-page form submission,
 * so a `fail(400, ...)` result comes back as HTTP 200 with the real status
 * embedded in the JSON body (`{"type":"failure","status":400,"data":...}`)
 * — confirmed live; only an `error()`-thrown refusal (an authorization
 * check, not a validation one) gets a genuine non-200 status either way.
 * Parse it rather than trusting `response.status()` for a `fail()` path.
 */
const employeeProbe = (overrides: Record<string, string>) => ({
  first_name: "AdvProbe",
  last_name: "Probe",
  email: "adv-probe@example.test",
  start_date: "2026-09-04",
  employment_status: "active",
  employment_type: "full_time",
  ...overrides,
})

async function actionStatus(response: { text(): Promise<string> }) {
  const raw = await response.text()
  const parsed = JSON.parse(raw) as { type: string; status: number }
  return { status: parsed.status, ok: parsed.type !== "failure", raw }
}

test("a syntactically-valid but nonexistent birth date is refused, not rolled to a real one", async ({
  page,
}) => {
  const response = await page.request.post("/employees/new", {
    form: employeeProbe({
      employee_id: "ADVPROBE05",
      birth_date: "2026-02-30",
    }),
  })
  const result = await actionStatus(response)
  expect(
    result.status,
    "f.date()'s round-trip check must refuse a nonexistent calendar date",
  ).toBe(400)

  await page.goto("/employees?q=ADVPROBE05")
  await expect(page.getByText("No one matches these filters")).toBeVisible()
})

test("a duplicate employee ID is refused with a named message, not a crash", async ({
  page,
}) => {
  const response = await page.request.post("/employees/new", {
    // E001 is Sarah Johnson's real employee_id in the fixture.
    form: employeeProbe({ employee_id: "E001" }),
  })
  const result = await actionStatus(response)
  expect(result.status).toBe(400)
  expect(result.raw).toMatch(/already has that employee ID/i)
})

test("SQL-special characters in the employee ID are refused by format, never reach a query", async ({
  page,
}) => {
  const response = await page.request.post("/employees/new", {
    form: employeeProbe({ employee_id: "E999`--" }),
  })
  const result = await actionStatus(response)
  expect(result.status).toBe(400)
})

test("an employment_status outside the enum is refused, never stored as free text", async ({
  page,
}) => {
  const response = await page.request.post("/employees/new", {
    form: employeeProbe({
      employee_id: "ADVPROBE07",
      employment_status: "vibing",
    }),
  })
  const result = await actionStatus(response)
  expect(result.status).toBe(400)

  await page.goto("/employees?q=ADVPROBE07")
  await expect(page.getByText("No one matches these filters")).toBeVisible()
})
