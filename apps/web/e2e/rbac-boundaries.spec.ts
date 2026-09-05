import { expect, test } from "@playwright/test"
import { signInAs, submitPastTheBrowser } from "./helpers"

/**
 * TESTPLAN.md §2 — role-boundary sweep, negative half (SEC-05, SEC-06,
 * SEC-08). Every case here targets a persona that should be REFUSED, and
 * checks the refusal against a network response or an explicit empty-state
 * message — never just "the button isn't in the DOM" (L44: a hidden
 * control is not a permission).
 */

const MARCUS = "marcus.chen@northwind.example" // plain employee, no admin hat
const LENA = "lena.fischer@northwind.example" // auditor: reads everything, writes nothing
const PRIYA = "bf17b1af-963b-53ef-9083-21506fb34e9c" // E003, reports to Sarah — a colleague of Marcus, not his report

test("a plain employee reaches tenant settings with no permission check at all (DEFECT-02, broadened)", async ({
  page,
}) => {
  await signInAs(page, MARCUS)
  const response = await page.goto("/settings/company")

  // TESTPLAN.md DEFECT-02 found this failing for a CUSTOMER-portal contact.
  // /settings/company's own load() checks only `locals.tenantId` — nothing
  // role-specific — so the same gap should reproduce for ANY staff role
  // lacking `firm.settings.read`, not just the portal boundary. This
  // assertion states the desired outcome and is expected to fail today,
  // same as access-lifecycle.spec.ts and portal.spec.ts.
  expect(
    response?.status(),
    "firm.settings.read is not in a plain employee's permission bundle " +
      "(packages/authz) — this page must refuse, not render",
  ).toBe(403)
})

test("a colleague cannot see another employee's compensation (positive control)", async ({
  page,
}) => {
  await signInAs(page, MARCUS)
  await page.goto(`/compensation/${PRIYA}`)

  // The row policy on compensation_base correctly returns nothing for
  // Marcus (Priya's colleague, not her manager or HR), and the page names
  // WHY rather than rendering an ambiguous blank (L21) — this one is done
  // right; kept here as the counter-example to DEFECT-02's pages.
  await expect(
    page.getByText("You cannot see this person's compensation."),
  ).toBeVisible()
})

test("an auditor's employee.create attempt is refused server-side, not just gated by a silent client validator", async ({
  page,
}) => {
  await signInAs(page, LENA)
  await page.goto("/employees/new")

  // TESTPLAN.md SEC-06 was inconclusive: a plain UI submission never left
  // the browser (a `required` field — employee_id, hidden behind
  // placeholder text that looks like a value — silently blocked it).
  // requireCan(ctx, "employee.create") runs before any form parsing, so an
  // empty, noValidate-bypassed submission is enough to test the boundary
  // that actually matters: does the SERVER refuse her, not the browser.
  await submitPastTheBrowser(page)

  await page.waitForLoadState("domcontentloaded")
  expect(
    page.url(),
    "a 403 does not redirect — if this is now /employees/<uuid>, an " +
      "auditor was able to create an employee",
  ).toContain("/employees/new")
})

test("a colleague cannot record a compensation change via a raw request (IDOR)", async ({
  page,
}) => {
  await signInAs(page, MARCUS)
  await page.goto(`/compensation/${PRIYA}`)

  // Bypasses the UI entirely — mayRecordChange is false for Marcus so the
  // "Record a change" control never renders, but the ?/raise action itself
  // is reachable at a fixed URL regardless of what the page chose to show.
  // A hidden control is not a permission (L44); this is that principle
  // applied to a whole form, not just a button.
  const response = await page.request.post(`/compensation/${PRIYA}?/raise`, {
    form: { effective_from: "2026-09-04", amount: "999999.00" },
  })

  expect(
    response.status(),
    "compensation.write must be checked server-side for ANY target " +
      "employeeId, not inferred from whether the UI offered the control",
  ).toBe(403)
})
