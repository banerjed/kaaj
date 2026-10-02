import { expect, test as setup } from "@playwright/test"
import { existsSync, mkdirSync } from "node:fs"
import { dirname } from "node:path"

/**
 * Sign in once, save the session, and let every other spec reuse it.
 *
 * **Through the real form, not by injecting a token.** The sign-in form posts
 * to a server action that signs in with the server's Supabase client, and the
 * session it produces lives in cookies written by `@supabase/ssr`. Faking that
 * would mean reproducing the cookie format, which is the library's business
 * and changes without notice — and it would stop this from proving that login
 * works at all.
 *
 * **The credentials are the seeded dev fixture**, and deliberately not a
 * secret: `packages/database/fixtures/dev-users.sql` creates these users with
 * this password and says in its own header that it is a developer bootstrap
 * which must never be pointed at customer infrastructure. Overridable by env
 * so a different fixture can be used without editing this file.
 */
const EMAIL = process.env.E2E_EMAIL ?? "sarah.johnson@northwind.example"
const PASSWORD = process.env.E2E_PASSWORD ?? "devpassword"

const STORAGE = "e2e/.auth/owner.json"

setup("sign in as the seeded owner", async ({ page }) => {
  if (!existsSync(dirname(STORAGE))) {
    mkdirSync(dirname(STORAGE), { recursive: true })
  }

  await page.goto("/login/sign_in")

  const email = page.locator('input[name="email"]')
  await expect(email).toBeVisible({ timeout: 15_000 })

  await email.fill(EMAIL)
  await page.locator('input[name="password"]').fill(PASSWORD)
  // By accessible name, not `button[type=submit]`: "Sign in with GitHub" is
  // a submit too, and comes first.
  await page.getByRole("button", { name: "Sign in", exact: true }).click()

  // Landing on /employees is the proof, not the absence of an error: a login
  // that succeeds without a tenant claim renders every page EMPTY rather than
  // failing (dev-users.sql explains why), so the assertion is that real
  // fixture rows arrived.
  await page.waitForURL("**/employees", { timeout: 30_000 })
  await expect(
    page.getByRole("link", { name: "Sarah Johnson", exact: true }),
  ).toBeVisible({
    timeout: 15_000,
  })

  await page.context().storageState({ path: STORAGE })
})
