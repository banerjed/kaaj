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

/**
 * Submit a form the browser would otherwise refuse to send.
 *
 * `submitSelector` overrides where the submit button lives — the ticket-edit
 * form's Save button sits outside its own `<form>` (associated instead via
 * `form="ticket-edit-form"`, so it can follow every tab rather than only the
 * two physically inside the element); `novalidate` on the form still governs
 * it, since the HTML form-association mechanism treats it as a submitter of
 * that form regardless of where it sits in the DOM.
 */
async function submitPastTheBrowser(
  page: Page,
  action: string,
  submitSelector?: string,
) {
  await page
    .locator(`form[action="${action}"]`)
    .evaluate((f: HTMLFormElement) => (f.noValidate = true))
  await page
    .locator(submitSelector ?? `form[action="${action}"] button[type="submit"]`)
    .click()
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

test("a credit memo larger than what's outstanding is refused, not silently capped", async ({
  page,
}) => {
  // INV-2026-004: partial, 32,439.97 outstanding, so "Issue a credit" is on screen.
  await page.goto("/accounting/invoices/37bd63c2-86a1-513c-8404-b731dd666b28")
  await openModal(page, /issue a credit/i, 'input[name="credit_amount"]')

  const amount = page.locator('input[name="credit_amount"]')
  const date = page.locator('input[name="credit_date"]')
  const reason = page.locator('textarea[name="credit_reason"]')

  await amount.fill("32439.98")
  await date.fill("2026-03-15")
  await reason.fill("Testing an over-credit refusal")
  await submitPastTheBrowser(page, "?/recordCredit")

  await expect(page.locator(".alert").first()).toContainText("outstanding")
  await expect(amount).toHaveClass(/input-error/)
  await expect(amount).toHaveAttribute("aria-invalid", "true")
  // The modal is still open and what was typed survived.
  await expect(amount).toHaveValue("32439.98")
  await expect(reason).toHaveValue("Testing an over-credit refusal")
})

test("a write-off larger than what's outstanding is refused, not silently capped", async ({
  page,
}) => {
  // INV-2026-004: partial, 32,439.97 outstanding, so "Write off" is on screen.
  await page.goto("/accounting/invoices/37bd63c2-86a1-513c-8404-b731dd666b28")
  await openModal(page, /write off/i, 'input[name="writeoff_amount"]')

  const amount = page.locator('input[name="writeoff_amount"]')
  const date = page.locator('input[name="writeoff_date"]')
  const reason = page.locator('textarea[name="writeoff_reason"]')

  await amount.fill("32439.98")
  await date.fill("2026-03-15")
  await reason.fill("Testing an over-writeoff refusal")
  await submitPastTheBrowser(page, "?/recordWriteOff")

  await expect(page.locator(".alert").first()).toContainText("outstanding")
  await expect(amount).toHaveClass(/input-error/)
  await expect(amount).toHaveAttribute("aria-invalid", "true")
  // The modal is still open and what was typed survived.
  await expect(amount).toHaveValue("32439.98")
  await expect(reason).toHaveValue("Testing an over-writeoff refusal")
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

test("a lockbox payment whose allocations don't match the total received is refused", async ({
  page,
}) => {
  // Acme Manufacturing — has open invoices to allocate against.
  await page.goto(
    "/accounting/receive-payment?customer_id=e40d0f18-1333-5cd1-a969-f5113df51e70",
  )

  const totalAmount = page.locator('input[name="total_amount"]')
  const date = page.locator('input[name="payment_date"]')
  const alloc = page.locator('input[name^="alloc_"]').first()
  await expect(alloc).toBeVisible()

  // $100 said received, but only $50 allocated — a mismatch, not an
  // unallocated remainder silently accepted.
  await totalAmount.fill("100.00")
  await date.fill("2026-03-01")
  await alloc.fill("50.00")
  await submitPastTheBrowser(page, "?/allocate")

  await expect(page.locator(".alert").first()).toContainText("don't add up")
  await expect(totalAmount).toHaveClass(/input-error/)
  await expect(totalAmount).toHaveAttribute("aria-invalid", "true")
  // The form is still there and what was typed survived (keepValues).
  await expect(totalAmount).toHaveValue("100.00")
  await expect(alloc).toHaveValue("50.00")
})

test("creating an invoice with no lines is refused, not silently accepted", async ({
  page,
}) => {
  // Acme Manufacturing (USD) — a real fixture customer, so only line_count
  // is the thing under test.
  const response = await page.request.post("/accounting/invoices/new?/create", {
    form: {
      customer_id: "e40d0f18-1333-5cd1-a969-f5113df51e70",
      invoice_date: "2026-03-10",
      due_date: "2026-04-10",
      exchange_rate: "1.000000",
      line_count: "0",
    },
  })
  const result = await actionStatus(response)
  expect(result.status).toBe(400)
  // f.problem()'s default names the field ("lines"), not a bare "invalid" —
  // the friendlier "An invoice needs at least one line." is the UI hint
  // shown on the page itself (err.has("lines")), not the action's message.
  expect(result.raw).toMatch(/lines/i)
})

test("an invoice line with a negative quantity is refused, not stored as a negative charge", async ({
  page,
}) => {
  const response = await page.request.post("/accounting/invoices/new?/create", {
    form: {
      customer_id: "e40d0f18-1333-5cd1-a969-f5113df51e70",
      invoice_date: "2026-03-10",
      due_date: "2026-04-10",
      exchange_rate: "1.000000",
      line_count: "1",
      "lines.0.description": "Consulting",
      "lines.0.quantity": "-1",
      "lines.0.unit_price": "100.00",
      "lines.0.discount_percent": "0",
      "lines.0.tax_amount": "0",
    },
  })
  const result = await actionStatus(response)
  expect(result.status).toBe(400)
  // Not just "some field failed" (a typo'd field name would also 400 as
  // "missing") — the indexed reader must name THIS row's quantity.
  expect(result.raw).toMatch(/lines\.0\.quantity/)
})

test("an invoice line naming a tax rate that no longer exists is refused, not a crash", async ({
  page,
}) => {
  const response = await page.request.post("/accounting/invoices/new?/create", {
    form: {
      customer_id: "e40d0f18-1333-5cd1-a969-f5113df51e70",
      invoice_date: "2026-03-10",
      due_date: "2026-04-10",
      exchange_rate: "1.000000",
      line_count: "1",
      "lines.0.description": "Consulting",
      "lines.0.quantity": "1",
      "lines.0.unit_price": "100.00",
      "lines.0.discount_percent": "0",
      "lines.0.tax_amount": "8.00",
      "lines.0.tax_rate_id": "00000000-0000-0000-0000-000000000000",
    },
  })
  const result = await actionStatus(response)
  expect(result.status).toBe(400)
  expect(result.raw).toMatch(/no longer exists/i)
})

test("a taxed invoice line for a customer exempt as of the invoice date is refused, not silently charged", async ({
  page,
}) => {
  // Helios Energy — exempt through 2026-12-31 in the fixture (US-ACC-050).
  const response = await page.request.post("/accounting/invoices/new?/create", {
    form: {
      customer_id: "df492f8b-55ce-504f-869d-52f5ffc6292d",
      invoice_date: "2026-06-01",
      due_date: "2026-07-01",
      exchange_rate: "1.000000",
      line_count: "1",
      "lines.0.description": "Consulting",
      "lines.0.quantity": "1",
      "lines.0.unit_price": "100.00",
      "lines.0.discount_percent": "0",
      "lines.0.tax_amount": "10.00",
    },
  })
  const result = await actionStatus(response)
  expect(result.status).toBe(400)
  expect(result.raw).toMatch(/tax-exempt/i)
})

test("creating a bill with no lines is refused, not silently accepted", async ({
  page,
}) => {
  // Amazon Web Services (USD) — a real fixture vendor, so only line_count
  // is the thing under test.
  const response = await page.request.post("/accounting/bills/new?/create", {
    form: {
      vendor_id: "8a0bb1a6-448e-50f5-bbc0-1a41850d2e92",
      bill_number: "BILL-AWS-NO-LINES",
      bill_date: "2026-03-10",
      due_date: "2026-04-10",
      exchange_rate: "1.000000",
      line_count: "0",
    },
  })
  const result = await actionStatus(response)
  expect(result.status).toBe(400)
  expect(result.raw).toMatch(/lines/i)
})

test("a bill line with a negative quantity is refused, not stored as a negative cost", async ({
  page,
}) => {
  const response = await page.request.post("/accounting/bills/new?/create", {
    form: {
      vendor_id: "8a0bb1a6-448e-50f5-bbc0-1a41850d2e92",
      bill_number: "BILL-AWS-BAD-QTY",
      bill_date: "2026-03-10",
      due_date: "2026-04-10",
      exchange_rate: "1.000000",
      line_count: "1",
      "lines.0.description": "Cloud hosting",
      "lines.0.quantity": "-1",
      "lines.0.unit_price": "100.00",
      "lines.0.tax_amount": "0",
      "lines.0.expense_account_id": "030e294b-88ad-544e-841a-cfda187885ac",
    },
  })
  const result = await actionStatus(response)
  expect(result.status).toBe(400)
  // Not just "some field failed" — the indexed reader must name THIS row's
  // quantity, same proof as the invoice case above.
  expect(result.raw).toMatch(/lines\.0\.quantity/)
})

test("a bill number already used by the same vendor is refused, not silently duplicated", async ({
  page,
}) => {
  // BILL-AWS-2026-01 already exists for this exact vendor in the fixture
  // (idx_bills_vendor_number is unique per tenant+vendor+number) — this
  // stays read-only: the insert is refused before anything is written.
  const response = await page.request.post("/accounting/bills/new?/create", {
    form: {
      vendor_id: "8a0bb1a6-448e-50f5-bbc0-1a41850d2e92",
      bill_number: "BILL-AWS-2026-01",
      bill_date: "2026-03-10",
      due_date: "2026-04-10",
      exchange_rate: "1.000000",
      line_count: "1",
      "lines.0.description": "Cloud hosting",
      "lines.0.quantity": "1",
      "lines.0.unit_price": "100.00",
      "lines.0.tax_amount": "0",
      "lines.0.expense_account_id": "030e294b-88ad-544e-841a-cfda187885ac",
    },
  })
  const result = await actionStatus(response)
  expect(result.status).toBe(400)
  // The registered constraints.ts message, not just the field name — a
  // FormReader rejection would also serialize "bill_number" as the errored
  // field, so this proves the DATABASE constraint (idx_bills_vendor_number)
  // is what actually fired, same sharpening as the quantity case above.
  expect(result.raw).toMatch(/already has a bill with that number/i)
})

test("a manual journal entry with fewer than two lines is refused, not silently accepted", async ({
  page,
}) => {
  const response = await page.request.post(
    "/accounting/journal-entries/new?/create",
    {
      form: {
        entry_date: "2026-03-10",
        description: "Manual JE probe",
        currency: "USD",
        exchange_rate: "1.000000",
        line_count: "1",
        "lines.0.account_id": "eef02e95-6acb-5039-8acc-56340013e53a",
        "lines.0.description": "Cash",
        "lines.0.debit": "50.00",
      },
    },
  )
  const result = await actionStatus(response)
  expect(result.status).toBe(400)
  expect(result.raw).toMatch(/lines/i)
})

test("a manual journal entry line with both a debit and a credit is refused, not posted as one-sided", async ({
  page,
}) => {
  // Cash at Bank (1000) / Consulting Revenue (4000) — real fixture accounts,
  // so only the line-0 debit+credit combination is the thing under test.
  const response = await page.request.post(
    "/accounting/journal-entries/new?/create",
    {
      form: {
        entry_date: "2026-03-10",
        description: "Manual JE probe",
        currency: "USD",
        exchange_rate: "1.000000",
        line_count: "2",
        "lines.0.account_id": "eef02e95-6acb-5039-8acc-56340013e53a",
        "lines.0.description": "Cash",
        "lines.0.debit": "50.00",
        "lines.0.credit": "50.00",
        "lines.1.account_id": "6d1ef213-cb96-5ad4-beaf-1d4e07242d65",
        "lines.1.description": "Revenue",
        "lines.1.credit": "50.00",
      },
    },
  )
  const result = await actionStatus(response)
  expect(result.status).toBe(400)
  // Not just "some field failed" — the indexed reader must name THIS row's
  // debit, same sharpening as the invoice/bill quantity cases above.
  expect(result.raw).toMatch(/lines\.0\.debit/)
})

test("a manual journal entry whose debits and credits don't match is refused", async ({
  page,
}) => {
  const response = await page.request.post(
    "/accounting/journal-entries/new?/create",
    {
      form: {
        entry_date: "2026-03-10",
        description: "Manual JE probe",
        currency: "USD",
        exchange_rate: "1.000000",
        line_count: "2",
        "lines.0.account_id": "eef02e95-6acb-5039-8acc-56340013e53a",
        "lines.0.description": "Cash",
        "lines.0.debit": "50.00",
        "lines.1.account_id": "6d1ef213-cb96-5ad4-beaf-1d4e07242d65",
        "lines.1.description": "Revenue",
        "lines.1.credit": "40.00",
      },
    },
  )
  const result = await actionStatus(response)
  expect(result.status).toBe(400)
  expect(result.raw).toMatch(/does not balance/i)
  // The message surfaces the actual figures, not just "invalid" — same
  // convention as the invoice/bill does_not_balance refusal.
  expect(result.raw).toMatch(/debits 50\.00 against credits 40\.00/)
})

test("closing a period that is not open is refused, not silently a no-op", async ({
  page,
}) => {
  // January 2026 is already closed in the fixture.
  const response = await page.request.post("/accounting/periods?/close", {
    form: { period_id: "c4fff2b2-1b53-592f-84f6-586e3b2ca0dc" },
  })
  const result = await actionStatus(response)
  expect(result.status).toBe(400)
  expect(result.raw).toMatch(/is closed, not open/i)
})

test("reopening a period with no reason is refused, not silently accepted", async ({
  page,
}) => {
  // January 2026 is closed in the fixture — reason is the only thing under test.
  const response = await page.request.post("/accounting/periods?/reopen", {
    form: { period_id: "c4fff2b2-1b53-592f-84f6-586e3b2ca0dc" },
  })
  const result = await actionStatus(response)
  expect(result.status).toBe(400)
  expect(result.raw).toMatch(/reason/i)
})

test("reopening a period that is not closed is refused", async ({ page }) => {
  // February 2026 is open in the fixture.
  const response = await page.request.post("/accounting/periods?/reopen", {
    form: {
      period_id: "5b1446f7-7db5-54f5-bf88-a3c4527d6027",
      reason: "Testing the reopen guard",
    },
  })
  const result = await actionStatus(response)
  expect(result.status).toBe(400)
  expect(result.raw).toMatch(/is open, not closed/i)
})

test("a year-end close with nothing left to close is refused, not silently a no-op", async ({
  page,
}) => {
  // Before any posted activity in the fixture — every revenue/expense
  // account is at zero as of this date.
  const response = await page.request.post(
    "/accounting/year-end-close?/close",
    { form: { as_of: "2020-01-01", expected_net_income: "0" } },
  )
  const result = await actionStatus(response)
  expect(result.status).toBe(400)
  expect(result.raw).toMatch(/nothing to close/i)
})

test("a year-end close dated into a closed period is refused", async ({
  page,
}) => {
  // January 2026 is closed in the fixture, and carries genuine posted
  // revenue/expense activity by its own end (verified via psql) — so this
  // exercises the period-closed refusal, not the unrelated nothing-to-close one.
  const response = await page.request.post(
    "/accounting/year-end-close?/close",
    { form: { as_of: "2026-01-31", expected_net_income: "-56020.00" } },
  )
  const result = await actionStatus(response)
  expect(result.status).toBe(400)
  expect(result.raw).toMatch(/is closed/i)
})

test("a year-end close whose confirmed figure no longer matches is refused, not silently posted", async ({
  page,
}) => {
  // Something could have posted between the preview and this submit — the
  // route checks the previewed net income against what it recomputes.
  const response = await page.request.post(
    "/accounting/year-end-close?/close",
    { form: { as_of: "2026-12-31", expected_net_income: "-1.00" } },
  )
  const result = await actionStatus(response)
  expect(result.status).toBe(400)
  expect(result.raw).toMatch(/no longer matches/i)
})

test("a refused year-end close re-fetches its data, rather than leaving the page holding the stale figure", async ({
  page,
}) => {
  // The preview and the confirm are two separate requests — a plain
  // `use:enhance` only re-runs `load` on SUCCESS (SvelteKit's own default),
  // so a refusal here would otherwise leave the hidden `expected_net_income`
  // field, and the table it's copied from, holding the very figure that was
  // just refused — and resubmitting would repeat the same refusal forever.
  // A DOM assertion on the hidden field's value can't tell the two cases
  // apart: Svelte only rewrites an attribute when the underlying VALUE
  // changes, and nothing in this read-only suite actually changes the real
  // net income between load and submit — so the field's content is
  // identical whether `load` reran or not. Whether it reran at all is only
  // observable on the wire: SvelteKit issues a `__data.json` request when it
  // does, and only then.
  const dataRequests: string[] = []
  page.on("request", (req) => {
    if (req.url().includes("__data.json")) dataRequests.push(req.url())
  })

  await page.goto("/accounting/year-end-close?as_of=2026-12-31")
  const closeButton = page.getByRole("button", { name: /close the year/i })
  await expect(closeButton).toBeVisible()
  dataRequests.length = 0

  const hiddenAmount = page.locator('input[name="expected_net_income"]')
  await hiddenAmount.evaluate((el: HTMLInputElement) => {
    el.value = "-1.00"
  })

  await closeButton.click()
  await expect(page.getByText(/no longer matches/i)).toBeVisible()

  await expect
    .poll(() => dataRequests.length, {
      message: "expected the refusal to re-run load(), not leave stale data",
    })
    .toBeGreaterThan(0)
})

test("creating a tax rate with a code already in use is refused, not silently duplicated", async ({
  page,
}) => {
  // TAX-US-NY-2026 is the fixture's own New York sales tax rate.
  const response = await page.request.post("/accounting/tax-rates?/create", {
    form: {
      code: "TAX-US-NY-2026",
      tax_name: "Duplicate Attempt",
      tax_type: "sales_tax",
      rate: "0.05",
      country: "US",
      effective_from: "2027-01-01",
    },
  })
  const result = await actionStatus(response)
  expect(result.status).toBe(400)
  expect(result.raw).toMatch(/already uses that code/i)
})

test("creating a tax rate with no effective date is refused, not silently accepted", async ({
  page,
}) => {
  const response = await page.request.post("/accounting/tax-rates?/create", {
    form: {
      code: "TAX-TEST-MISSING-DATE",
      tax_name: "Missing Date",
      tax_type: "sales_tax",
      rate: "0.05",
      country: "US",
    },
  })
  const result = await actionStatus(response)
  expect(result.status).toBe(400)
})

test("a tax rate typed as a percentage rather than a fraction is refused, not silently configured 100x too high", async ({
  page,
}) => {
  // The field wants 0.08875, not 8.875 — a plausible typo that would
  // otherwise configure an 887.5% tax with no error anywhere.
  const response = await page.request.post("/accounting/tax-rates?/create", {
    form: {
      code: "TAX-TEST-PERCENT-TYPO",
      tax_name: "Percent Typo",
      tax_type: "sales_tax",
      rate: "8.875",
      country: "US",
      effective_from: "2027-01-01",
    },
  })
  const result = await actionStatus(response)
  expect(result.status).toBe(400)
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

test("the unified ticket-edit form stays open, and marked, on a refused submission", async ({
  page,
}) => {
  // IT-0001 — any staff-visible ticket in the fixture does.
  await page.goto("/ticketing/a22f6d41-d654-5951-a043-e174f7e1a258")
  await openModal(page, /^update$/i, 'input[name="title"]')

  // due_date lives on the "Details" tab, not the one "Update" opens onto.
  await page.getByRole("tab", { name: "Details" }).click()

  // Posting a comment is optional here (a save that only changes the due
  // date must not be forced to write one) — due_date is the field that is
  // still required, so blanking it is what triggers a refusal.
  await page.locator('input[name="due_date"]').fill("")
  await submitPastTheBrowser(
    page,
    "?/saveTicket",
    'button[form="ticket-edit-form"][type="submit"]',
  )
  await expect(page.locator(".alert").first()).toContainText("Due date")

  // Still open (the "Update" tab is still there, not reset back to the
  // button), routed to the tab the refused field lives on, and marked.
  await expect(page.getByRole("tab", { name: "Update" })).toBeVisible()
  await expect(page.locator('input[name="due_date"]')).toBeVisible()
  await expect(page.locator('input[name="due_date"]')).toHaveClass(
    /input-error/,
  )
})

test("an inverted date range on the cash flow statement is refused, not rendered as a false ledger-imbalance alert", async ({
  page,
}) => {
  // from > to leaves begin_bal/end_bal/net_income each well-defined but
  // mutually inconsistent, so cashFlowTotals().reconciles would go false
  // and the page would accuse the LEDGER of not balancing — for a problem
  // that is really just the date range. A GET with a bad query string is
  // read-only, so this needs no serial project or reseed.
  await page.goto("/accounting/cash-flow?from=2026-03-01&to=2026-01-31")
  await expect(page.getByText("Something went wrong")).toBeVisible()
  await expect(
    page.getByText(/'from' date must be on or before the 'to' date/i),
  ).toBeVisible()
})

test("an inverted date range on the tax summary is refused, not rendered as a false report", async ({
  page,
}) => {
  await page.goto("/accounting/tax-summary?from=2026-03-01&to=2026-01-31")
  await expect(page.getByText("Something went wrong")).toBeVisible()
  await expect(
    page.getByText(/'from' date must be on or before the 'to' date/i),
  ).toBeVisible()
})

test("requesting a period comparison with no date range is refused, not silently ignored", async ({
  page,
}) => {
  // `compare` without both `from` and `to` has no window to compare
  // against — profitAndLossComparison() requires both, so this must be
  // refused rather than rendering the page with comparison quietly dropped.
  await page.goto("/accounting/profit-loss?compare=previous_period")
  await expect(page.getByText("Something went wrong")).toBeVisible()
  await expect(
    page.getByText(/comparing periods requires both a 'from' and 'to' date/i),
  ).toBeVisible()
})

test("an unrecognized `compare` value is refused with its own message, not read as a bad date", async ({
  page,
}) => {
  // `f.choice()` treats an off-list value as a rejection like any other
  // field, so a naive `if (!f.ok) error(..., "That date is not a real
  // date.")` would blame the wrong field for this one.
  await page.goto(
    "/accounting/profit-loss?from=2026-01-01&to=2026-01-31&compare=bogus",
  )
  await expect(page.getByText("Something went wrong")).toBeVisible()
  await expect(
    page.getByText(/that comparison option is not recognized/i),
  ).toBeVisible()
})

test("a year-over-year comparison over a year-or-longer period is refused, not silently double-counted", async ({
  page,
}) => {
  // previous_year shifts both dates back exactly a year — a period this
  // long makes that shifted window overlap the current one, so the same
  // posted activity would count on both sides of the comparison.
  await page.goto(
    "/accounting/profit-loss?from=2025-01-01&to=2026-12-31&compare=previous_year",
  )
  await expect(page.getByText("Something went wrong")).toBeVisible()
  await expect(
    page.getByText(/requires a period shorter than one year/i),
  ).toBeVisible()
})

test("a trial balance comparison date with no 'as of' date is refused, not silently ignored", async ({
  page,
}) => {
  // trialBalanceComparison() names two independent snapshot dates directly —
  // there is no "prior period" to compute a second date from, so a
  // `compare_as_of` with nothing to compare against must be refused.
  await page.goto("/accounting/trial-balance?compare_as_of=2025-01-01")
  await expect(page.getByText("Something went wrong")).toBeVisible()
  await expect(
    page.getByText(/give an 'as of' date to compare against/i),
  ).toBeVisible()
})

test("a balance sheet comparison date with no 'as of' date is refused, not silently ignored", async ({
  page,
}) => {
  await page.goto("/accounting/balance-sheet?compare_as_of=2025-01-01")
  await expect(page.getByText("Something went wrong")).toBeVisible()
  await expect(
    page.getByText(/give an 'as of' date to compare against/i),
  ).toBeVisible()
})

test("a batch vendor payment with no bills selected is refused, not silently a no-op", async ({
  page,
}) => {
  // Read-only, like every other case here: fills in the payment details but
  // checks no bill, so payBillsInBatch's own no_lines refusal fires before
  // anything is written — no fixture bill actually gets paid.
  await page.goto("/accounting/bills?status=approved")
  const form = page.locator('form[action="?/payBatch"]')
  await form.locator('input[name="payment_date"]').fill("2026-03-15")
  await form
    .locator('select[name="payment_method"]')
    .selectOption("wire_transfer")
  await form.getByRole("button", { name: /pay selected/i }).click()

  await expect(page.getByText(/select at least one bill/i)).toBeVisible()
})

test("a reconciliation rule with no matching criteria is refused, not silently accepted", async ({
  page,
}) => {
  // Read-only: createReconciliationRule's own no_criteria refusal fires
  // before any INSERT, since the form leaves every condition field blank —
  // no rule actually gets created.
  await page.goto("/accounting/banking/rules")
  const form = page.locator('form[action="?/create"]')
  await form.locator('input[name="rule_name"]').fill("Matches everything")
  await form
    .locator('select[name="category_account_id"]')
    .selectOption({ index: 1 })
  await form.getByRole("button", { name: /create rule/i }).click()

  await expect(page.getByText(/a rule needs at least one of/i)).toBeVisible()
})

test("sending payment reminders with no invoice selected is refused, not silently a no-op", async ({
  page,
}) => {
  // Read-only: no checkbox is checked, so sendReminders's own invoice_ids
  // rejection fires before invoicesForReminder ever runs — no email sent,
  // no fixture invoice touched.
  await page.goto("/accounting/invoices?overdue=1")
  const form = page.locator('form[action="?/sendReminders"]')
  await form.getByRole("button", { name: /send reminders/i }).click()

  await expect(page.getByText(/select at least one invoice/i)).toBeVisible()
})

test("creating a recurring schedule with no lines is refused, not silently accepted", async ({
  page,
}) => {
  // Read-only, same shape as invoices/new's own "no lines" case above —
  // Acme Manufacturing (USD) is a real fixture customer, line_count is the
  // thing under test. A crafted POST, not the UI: the create form itself
  // never lets line_count reach 0 (removeLine keeps at least one row).
  const response = await page.request.post(
    "/accounting/recurring-invoices?/create",
    {
      form: {
        customer_id: "e40d0f18-1333-5cd1-a969-f5113df51e70",
        frequency: "monthly",
        next_run_date: "2026-03-10",
        due_in_days: "30",
        exchange_rate: "1.000000",
        line_count: "0",
      },
    },
  )
  const result = await actionStatus(response)
  expect(result.status).toBe(400)
  expect(result.raw).toMatch(/lines/i)
})

test("recording an accrual against the last period is refused, not silently accepted", async ({
  page,
}) => {
  // Read-only: March 2026 is the fixture's LAST period, so recordAccrual's
  // own no_such_period refusal fires before either journal entry posts —
  // driven through the real form/UI, not a crafted POST, since picking the
  // last period from the dropdown is a genuine, reachable user action.
  await page.goto("/accounting/accruals")
  const form = page.locator('form[action="?/recordAccrual"]')
  await form.locator('select[name="period_id"]').selectOption({
    label: "March 2026",
  })
  await form.locator('select[name="expense_account_id"]').selectOption({
    index: 1,
  })
  await form.locator('input[name="amount"]').fill("100.00")
  await form
    .locator('input[name="description"]')
    .fill("Test accrual with no next period")
  await form.getByRole("button", { name: /record accrual/i }).click()

  await expect(page.getByText(/no period follows/i)).toBeVisible()
})
