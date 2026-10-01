import { expect, test } from "@playwright/test"
import { signInAs } from "./helpers"

/**
 * The customer portal is switched off (20260930130000): a customer contact's
 * sign-in carries no tenant, so it reaches no firm's data, and the /portal
 * pages are gone. The sweep below is the original DEFECT-02 check
 * (TESTPLAN.md §0) and still applies: no staff page renders for a contact.
 *
 * Read-only throughout: nothing here submits a form.
 */

const DANA = "dana.whitcombe@acme.example" // a contact of Acme Manufacturing

/** Every route smoke.spec.ts already proves renders correctly for the owner. */
const STAFF_ROUTES = [
  "/employees",
  "/time-off",
  "/attendance",
  "/performance",
  "/onboarding",
  "/compensation",
  "/projects",
  "/time-tracking",
  "/payroll/runs",
  "/payroll/payslips",
  "/accounting/invoices",
  "/accounting/bills",
  "/accounting/ledger",
  "/accounting/journal-entries/new",
  "/accounting/periods",
  "/accounting/year-end-close",
  "/accounting/tax-rates",
  "/accounting/tax-summary",
  "/accounting/exchange-rates",
  "/accounting/banking",
  "/ticketing",
  "/settings/company",
  "/settings/departments",
  "/settings/locations",
  "/settings/job-titles",
  "/settings/holidays",
  "/settings/benefits",
  "/settings/payroll/policies",
  "/settings/payroll/schedules",
]

test("a customer contact's sign-in reaches no firm", async ({ page }) => {
  await signInAs(page, DANA)
  await page.waitForURL((url) => !url.pathname.startsWith("/login/sign_in"), {
    timeout: 15_000,
  })
  await page.goto("/employees")
  await page.waitForURL(/\/account/, { timeout: 15_000 })
  expect(page.url()).toContain("no_tenant")
})

test("the portal pages no longer exist", async ({ page }) => {
  for (const path of ["/portal", "/portal/tickets", "/portal/login"]) {
    const response = await page.goto(path)
    expect(response?.status(), path).toBe(404)
  }
})

test("sweep: no staff route renders staff content for a customer contact", async ({
  page,
}) => {
  await signInAs(page, DANA)
  await page.waitForURL((url) => !url.pathname.startsWith("/login/sign_in"), {
    timeout: 15_000,
  })

  // Collected with expect.soft so ONE run reports every affected route
  // instead of stopping at the first.
  for (const route of STAFF_ROUTES) {
    const response = await page.goto(route)
    const url = page.url()
    const refused =
      /\/(account|login)/.test(url) || (response?.status() ?? 0) >= 400

    expect
      .soft(
        refused,
        `${route}: customer session got a rendered staff page ` +
          `(status ${response?.status()}, landed at ${url})`,
      )
      .toBe(true)
  }
})
