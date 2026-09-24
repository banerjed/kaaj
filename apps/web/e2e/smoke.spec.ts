import { expect, test, type Page } from "@playwright/test"
import { openModal } from "./helpers"

/**
 * Every module page renders, as a real signed-in user, in a real browser.
 *
 * This suite is READ-ONLY. Nothing here submits a form. The fixture is shared
 * with the unit suites, which assert against pristine Northwind data — driving
 * the app by hand once left a fourth project and a fifth payment behind and
 * turned nine unit tests red. A spec that writes needs its own serial project
 * and a reseed, not a place in this file.
 *
 * What it asserts is deliberately shallow and deliberately not snapshots:
 *
 *   - the page answered 200 and rendered its own heading, not a blank shell
 *     that a layout error would also produce (L21)
 *   - the nav chrome is present, which is what catches `group/html` and other
 *     silent layout failures (L23)
 *   - the console carries no errors, which is where a missing import or a
 *     failed hydration announces itself and nothing else looks wrong
 *
 * A snapshot suite would fail on every deliberate design change and teach
 * people to re-bless it without looking, which is worse than no test.
 */

/** Every route under `(app)`, with something on it only that page shows. */
const PAGES: { path: string; heading: string }[] = [
  { path: "/employees", heading: "Employees" },
  { path: "/time-off", heading: "Time Off" },
  { path: "/attendance", heading: "Attendance" },
  { path: "/performance", heading: "Performance" },
  { path: "/onboarding", heading: "Onboarding" },
  { path: "/compensation", heading: "Compensation" },
  { path: "/objectives", heading: "Objectives" },
  { path: "/projects", heading: "Projects" },
  { path: "/time-tracking", heading: "Time Tracking" },
  { path: "/payroll/runs", heading: "Pay Runs" },
  { path: "/payroll/payslips", heading: "Payslips" },
  { path: "/accounting/invoices", heading: "Invoices" },
  { path: "/accounting/invoices/new", heading: "New invoice" },
  {
    path: "/accounting/recurring-invoices",
    heading: "Recurring invoices",
  },
  { path: "/accounting/bills", heading: "Bills" },
  { path: "/accounting/bills/new", heading: "New bill" },
  { path: "/accounting/ledger", heading: "Ledger" },
  {
    path: "/accounting/journal-entries/new",
    heading: "New journal entry",
  },
  { path: "/accounting/accruals", heading: "Accruals & Deferrals" },
  { path: "/accounting/periods", heading: "Accounting Periods" },
  { path: "/accounting/year-end-close", heading: "Year-End Close" },
  {
    path: "/accounting/year-end-close?as_of=2026-12-31",
    heading: "Year-End Close",
  },
  { path: "/accounting/tax-rates", heading: "Tax Rates" },
  { path: "/accounting/tax-summary", heading: "Tax Summary" },
  {
    path: "/accounting/tax-summary?from=2026-01-01&to=2026-12-31",
    heading: "Tax Summary",
  },
  { path: "/accounting/exchange-rates", heading: "Exchange Rates" },
  { path: "/accounting/payment-gateway", heading: "Payment Gateway" },
  { path: "/accounting/fx-revaluation", heading: "FX Revaluation" },
  { path: "/accounting/trial-balance", heading: "Trial Balance" },
  {
    path: "/accounting/trial-balance?as_of=2026-01-21&compare_as_of=2025-01-01",
    heading: "Trial Balance",
  },
  { path: "/accounting/profit-loss", heading: "Profit & Loss" },
  { path: "/accounting/balance-sheet", heading: "Balance Sheet" },
  {
    path: "/accounting/balance-sheet?as_of=2026-12-31&compare_as_of=2026-01-21",
    heading: "Balance Sheet",
  },
  { path: "/accounting/cash-flow", heading: "Cash Flow" },
  {
    path: "/accounting/equity",
    heading: "Statement of Changes in Equity",
  },
  { path: "/accounting/banking", heading: "Banking" },
  {
    path: "/accounting/banking/rules",
    heading: "Bank reconciliation rules",
  },
  { path: "/accounting/ar-aging", heading: "AR Aging" },
  { path: "/accounting/ap-due-soon", heading: "AP Due Soon" },
  { path: "/accounting/customer-balances", heading: "Customer Balances" },
  { path: "/accounting/receive-payment", heading: "Receive Payment" },
  { path: "/ticketing", heading: "Ticketing" },
  { path: "/ticketing/new", heading: "New ticket" },
  { path: "/documents", heading: "Documents" },
  { path: "/documents/archived", heading: "Archived" },
  { path: "/chat", heading: "Chat" },
  { path: "/settings/company", heading: "Company" },
  { path: "/settings/departments", heading: "Departments" },
  { path: "/settings/locations", heading: "Locations" },
  { path: "/settings/job-titles", heading: "Job Titles" },
  { path: "/settings/holidays", heading: "Holidays" },
  { path: "/settings/benefits", heading: "Benefits" },
  { path: "/settings/payroll/policies", heading: "Payroll Policies" },
  { path: "/settings/payroll/schedules", heading: "Pay Schedules" },
  { path: "/settings/ticketing", heading: "Ticketing" },
]

/** Console errors, minus the noise a dev server makes on every page. */
function collectConsoleErrors(page: Page): string[] {
  const errors: string[] = []
  page.on("console", (msg) => {
    if (msg.type() !== "error") return
    const text = msg.text()
    // Vite's HMR ping and favicon 404s are not the application's problem.
    if (/favicon|\[vite\]|net::ERR_ABORTED/i.test(text)) return
    errors.push(text)
  })
  page.on("pageerror", (err) => errors.push(`pageerror: ${err.message}`))
  return errors
}

for (const { path, heading } of PAGES) {
  test(`${path} renders for a signed-in owner`, async ({ page }) => {
    const errors = collectConsoleErrors(page)

    const response = await page.goto(path)
    expect(response?.status(), `${path} did not answer 200`).toBe(200)

    // Its own heading — not just "a page loaded". A layout that renders with a
    // failed child still produces a document.
    await expect(
      page.getByRole("heading", { name: heading, exact: false }).first(),
      `${path} did not render its heading`,
    ).toBeVisible({ timeout: 15_000 })

    // The shell. If `group/html` or the sidebar markup breaks, the page still
    // "works" and looks wrong (L23).
    await expect(
      page.getByRole("navigation", { name: "Navbar" }),
      `${path} lost the topbar`,
    ).toBeVisible()

    expect(errors, `${path} logged console errors`).toEqual([])
  })
}

test("an unauthenticated visitor is bounced to login, not to an empty page", async ({
  browser,
}) => {
  // The failure this guards is the one dev-users.sql describes: without a
  // tenant claim every RLS policy denies every row, so the app renders EMPTY
  // rather than erroring. An empty directory and a redirect look identical
  // from a screenshot; only the URL tells them apart.
  const context = await browser.newContext({
    storageState: { cookies: [], origins: [] },
  })
  const page = await context.newPage()
  await page.goto("/projects")
  await expect(page).toHaveURL(/\/login/)
  await context.close()
})

test("the firm's own rows reached the page, not an empty shell", async ({
  page,
}) => {
  // A signed-in session with no tenant claim renders a directory with zero
  // people and no error. Twelve is the fixture's headcount.
  await page.goto("/employees")
  await expect(page.getByRole("link", { name: "Marcus Chen" })).toBeVisible()
  await expect(page.getByRole("link", { name: "Sarah Johnson" })).toBeVisible()
})

test("the assistant panel opens and says it is not built", async ({ page }) => {
  // It is deliberately empty (07-app-provenance.md). This asserts the honest
  // empty state is what ships — if someone adds an input box that does
  // nothing, this is the test that argues with them.
  await page.goto("/projects")
  // `exact` matters: the panel's own close control and its overlay are both
  // labelled "Close assistant", and a substring match on "Assistant" resolves
  // to all three.
  await page.getByLabel("Assistant", { exact: true }).click()
  await expect(page.getByText("Not built yet")).toBeVisible()
})

test("the new tax rate form's Type select is actually populated", async ({
  page,
}) => {
  // `data.taxTypes` comes from `allEnumerations().get("tax_type")` — a
  // typo'd enum name there would render a `<select>` with zero options, a
  // form nobody could ever submit, with nothing else on the page to say so.
  await page.goto("/accounting/tax-rates")
  const select = page.locator('select[name="tax_type"]')
  await openModal(page, /new tax rate/i, 'select[name="tax_type"]')
  await expect(select.locator("option")).not.toHaveCount(0)
  await expect(select.locator("option").first()).toHaveText(/\S/)
})

// PRJ-001 "Acme ERP Integration" — T-001 done, T-002/T-003 open,
// T-008 a real subtask of T-001 (docs/23-project-management-phase1.md).
const ACME_ERP = "/projects/8257009f-6a91-5fd1-9efb-518198c08e2a"

test("the Add-task Parent select only offers this project's own top-level tasks", async ({
  page,
}) => {
  // The server-side backstop (a cross-project or two-level parent is
  // refused) is covered in projects.writes.test.ts — this is the UI-only
  // claim that the option list itself is scoped correctly, which nothing
  // server-side can prove.
  await page.goto(ACME_ERP)
  await openModal(page, /add task/i, 'select[name="parent_task_id"]')

  const optionTexts = await page
    .locator('select[name="parent_task_id"] option')
    .allTextContents()

  expect(optionTexts).toContain("Discovery workshops")
  expect(optionTexts).toContain("Data model mapping")
  expect(optionTexts).toContain("Integration build")
  // Never an existing subtask (would create a second level) …
  expect(optionTexts).not.toContain("Write up discovery findings")
  // … and never a task from a different project.
  expect(optionTexts).not.toContain("Loyalty rules engine")
})

test("the Kanban board groups tasks by status, in order, and never gives a subtask its own card", async ({
  page,
}) => {
  await page.goto(ACME_ERP)

  // Same hydration race `openModal` guards against: the toggle's handler
  // attaches on hydration, so a click that lands before it does nothing.
  await expect(async () => {
    await page.getByRole("button", { name: "Kanban", exact: true }).click()
    await expect(page.locator("p.uppercase").first()).toBeVisible({
      timeout: 1_000,
    })
  }).toPass({ timeout: 15_000 })

  const columnHeaders = page.locator("p.uppercase")
  await expect(columnHeaders).toHaveCount(5)
  const labels = ["todo", "in progress", "review", "blocked", "done"]
  for (const [i, label] of labels.entries()) {
    await expect(columnHeaders.nth(i)).toContainText(label)
  }

  const cardTitles = await page
    .locator(".card-body p.text-sm.font-medium")
    .allTextContents()
  expect(cardTitles).toContain("Discovery workshops")
  expect(cardTitles).toContain("Data model mapping")
  expect(cardTitles).toContain("Integration build")
  // The subtask never gets its own card — only its parent does.
  expect(cardTitles).not.toContain("Write up discovery findings")

  // The parent's card carries a subtask-progress badge instead.
  await expect(page.getByText("0/1", { exact: false })).toBeVisible()
})

test("switching List ↔ Kanban is client-side only — no request fires either way", async ({
  page,
}) => {
  await page.goto(ACME_ERP)
  await page.waitForLoadState("networkidle")

  let sawRequest = false
  page.on("request", () => {
    sawRequest = true
  })

  await page.getByRole("button", { name: "Kanban", exact: true }).click()
  await expect(page.locator("p.uppercase").first()).toBeVisible()
  await page.getByRole("button", { name: "List", exact: true }).click()
  await expect(page.locator("table")).toBeVisible()

  // No single event to await the absence of — give a stray request a real
  // chance to appear before concluding there wasn't one.
  await page.waitForTimeout(300)
  expect(sawRequest).toBe(false)
})
