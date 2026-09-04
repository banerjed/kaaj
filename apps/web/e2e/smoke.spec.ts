import { expect, test, type Page } from "@playwright/test"

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
  { path: "/projects", heading: "Projects" },
  { path: "/time-tracking", heading: "Time Tracking" },
  { path: "/payroll/runs", heading: "Pay Runs" },
  { path: "/payroll/payslips", heading: "Payslips" },
  { path: "/accounting/invoices", heading: "Invoices" },
  { path: "/accounting/bills", heading: "Bills" },
  { path: "/accounting/ledger", heading: "Ledger" },
  { path: "/accounting/banking", heading: "Banking" },
  { path: "/settings/company", heading: "Company" },
  { path: "/settings/departments", heading: "Departments" },
  { path: "/settings/locations", heading: "Locations" },
  { path: "/settings/job-titles", heading: "Job Titles" },
  { path: "/settings/holidays", heading: "Holidays" },
  { path: "/settings/benefits", heading: "Benefits" },
  { path: "/settings/payroll/policies", heading: "Payroll Policies" },
  { path: "/settings/payroll/schedules", heading: "Pay Schedules" },
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
