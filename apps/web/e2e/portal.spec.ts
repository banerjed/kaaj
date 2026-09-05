import { expect, test } from "@playwright/test"
import { signInAs } from "./helpers"

/**
 * TESTPLAN.md §0, DEFECT-02 — a customer-portal contact reaches the entire
 * staff application. `(app)/+layout.server.ts` checks only that a session
 * exists and carries SOME active tenant membership — never that the
 * membership's role is staff rather than `customer`. A customer_contact-
 * backed `tenant_users` row satisfies both checks trivially.
 *
 * Read-only throughout, matching smoke.spec.ts's own constraint against the
 * shared fixture: nothing here submits a form.
 */

const DANA = "dana.whitcombe@acme.example" // Acme Manufacturing, primary
const FELIX = "felix.ndiaye@acme.example" // Acme Manufacturing, same customer as Dana
const IMOGEN = "imogen.faulkner@britco.example" // Britannia Retail Group — a DIFFERENT customer

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

test("a customer contact lands on the portal, not the staff app", async ({
  page,
}) => {
  await signInAs(page, DANA)
  await page.waitForURL(/\/(portal|employees|login)/, { timeout: 15_000 })

  expect(
    page.url(),
    "DEFECT-02: a customer session must never land in the staff app",
  ).toMatch(/\/portal/)
})

test("sweep: no staff route renders staff content for a customer contact", async ({
  page,
}) => {
  await signInAs(page, DANA)
  await page.waitForURL(/\/(portal|employees|login)/, { timeout: 15_000 })

  // Collected with expect.soft so ONE run reports every affected route
  // instead of stopping at the first — this is what scopes DEFECT-02's
  // actual blast radius (TESTPLAN.md SEC-03).
  for (const route of STAFF_ROUTES) {
    const response = await page.goto(route)
    const url = page.url()
    const refused =
      /\/(portal|login)/.test(url) || (response?.status() ?? 0) >= 400

    expect
      .soft(
        refused,
        `${route}: customer session got a rendered staff page ` +
          `(status ${response?.status()}, landed at ${url})`,
      )
      .toBe(true)
  }
})

test("the portal ticket list is scoped to the signed-in contact's own customer", async ({
  page,
}) => {
  await signInAs(page, DANA)
  await page.waitForURL(/\/(portal|employees)/, { timeout: 15_000 })
  await page.goto("/portal/tickets")

  await expect(page.getByRole("heading", { name: "Tickets" })).toBeVisible()
  // Fixture: CS-0001 and CS-0003 belong to Acme Manufacturing.
  await expect(page.getByText("CS-0001")).toBeVisible()
  await expect(page.getByText("CS-0003")).toBeVisible()
})

test("a second contact at the SAME customer sees the same tickets", async ({
  page,
}) => {
  await signInAs(page, FELIX)
  await page.waitForURL(/\/(portal|employees)/, { timeout: 15_000 })
  await page.goto("/portal/tickets")

  await expect(page.getByText("CS-0001")).toBeVisible()
  await expect(page.getByText("CS-0003")).toBeVisible()
})

test("a contact at a DIFFERENT customer sees none of Acme's tickets", async ({
  page,
}) => {
  await signInAs(page, IMOGEN)
  await page.waitForURL(/\/(portal|employees)/, { timeout: 15_000 })
  await page.goto("/portal/tickets")

  await expect(page.getByText("CS-0001")).not.toBeVisible()
  await expect(page.getByText("CS-0003")).not.toBeVisible()
})
