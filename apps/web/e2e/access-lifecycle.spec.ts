import { expect, test } from "@playwright/test"
import { signInAs } from "./helpers"

/**
 * TESTPLAN.md §0, DEFECT-01 — a terminated employee keeps a fully working
 * login.
 *
 * nadia.hassan@northwind.example (E012) is employment_status='terminated',
 * is_active=FALSE, end_date='2026-01-15', and the fixture's own GDPR Art. 17
 * erasure-request subject (audit_log). Nothing observed connects employee
 * termination to tenant_users.is_active — her membership is still active,
 * and docs/module-hr.md's US-HR-006 ("... so that their access is revoked
 * appropriately") is unmet.
 *
 * This test states the DESIRED outcome and is expected to FAIL until that
 * gap is closed — leave it red rather than deleting it; flipping green is
 * how the fix gets noticed.
 */
test("a terminated employee's session must not reach the staff app", async ({
  page,
}) => {
  await signInAs(page, "nadia.hassan@northwind.example")

  await page.waitForURL(/\/(employees|login|account)/, { timeout: 15_000 })

  expect(
    page.url(),
    "DEFECT-01: employment_status='terminated' must revoke access, " +
      "not just hide the employee row from the directory",
  ).not.toMatch(/\/employees/)
})
