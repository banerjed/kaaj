import { expect, test, type Page } from "@playwright/test"

/**
 * The theme cull, verified in a browser.
 *
 * Six themes became light, dark and `system`; the sidebar's independent
 * light/dark override was removed; theme selection moved from the right-hand
 * panel to the profile drawer. All of that shipped on the strength of
 * `./check` and the compiled bundle — nothing had rendered it.
 *
 * The most valuable case here is the stale-storage one. `readStoredConfig`
 * guards against a browser that still holds "material" or "dim" from before
 * the cull, and NOTHING tested it: the config is read on the client, from
 * storage no unit test populates, and the failure is a page that renders
 * unstyled rather than one that errors.
 */

const STORAGE_KEY = "__NEXUS_CONFIG_v3.0__"

/**
 * Seed a stored config, load the page as a returning visitor, and wait until
 * the app has actually acted on it.
 *
 * Navigate → write → reload, NOT `addInitScript`: the signed-in `storageState`
 * already carries this key, and Playwright restores it when it first reaches
 * the origin, which can land after an init script and silently overwrite the
 * seeded value.
 *
 * Then the settle. `data-theme` is written by an `$effect` after hydration, so
 * reading it straight after reload is a race — it came back null one run in
 * five. Polling the ATTRIBUTE would fix the race and break the cases that
 * expect null: before hydration there is no attribute either, so `toBeNull`
 * would pass without the app having run at all.
 *
 * `applyConfig` writes the config it settled on back to localStorage, so
 * waiting for that value is both the synchronisation point and an assertion —
 * it is how the "material" case proves the stale theme was SANITISED rather
 * than merely absent.
 */
async function visitWithStoredConfig(
  page: Page,
  path: string,
  stored: string,
  settlesOn: "light" | "dark" | "system",
) {
  await page.goto(path)
  await page.evaluate(([key, v]) => window.localStorage.setItem(key, v), [
    STORAGE_KEY,
    stored,
  ] as const)
  await page.reload()

  await expect
    .poll(
      () =>
        page.evaluate((key) => window.localStorage.getItem(key), STORAGE_KEY),
      { timeout: 10_000 },
    )
    .toBe(JSON.stringify({ theme: settlesOn }))
}

const themeAttr = (page: Page) =>
  page.evaluate(() => document.documentElement.getAttribute("data-theme"))

/**
 * The painted surface, and the variable behind it.
 *
 * The background lives on `<html>`; `<body>` is transparent, so asserting
 * against body measures nothing. `--color-base-100` is read too because it is
 * the more direct evidence: the attribute can be set for a theme whose
 * variables never compiled, and the page then renders with no palette.
 */
const surface = (page: Page) =>
  page.evaluate(() => {
    const root = document.documentElement
    const bg = getComputedStyle(root).backgroundColor
    const channels = (bg.match(/\d+/g) ?? []).slice(0, 3).map(Number)
    return {
      bg,
      brightness: channels.reduce((a, b) => a + b, 0),
      base100: getComputedStyle(root)
        .getPropertyValue("--color-base-100")
        .trim(),
    }
  })

test("light is applied, and the page is actually painted", async ({ page }) => {
  await visitWithStoredConfig(
    page,
    "/projects",
    JSON.stringify({ theme: "light" }),
    "light",
  )

  expect(await themeAttr(page)).toBe("light")

  const { brightness, base100 } = await surface(page)
  expect(
    brightness,
    "light theme did not paint a light surface",
  ).toBeGreaterThan(600)
  expect(base100, "--color-base-100 did not resolve").toBe("#ffffff")
})

test("dark is applied, and paints a dark surface rather than a light one", async ({
  page,
}) => {
  await visitWithStoredConfig(
    page,
    "/projects",
    JSON.stringify({ theme: "dark" }),
    "dark",
  )

  expect(await themeAttr(page)).toBe("dark")

  // A dark theme that resolved to the light palette would still be "painted".
  // The channel sum is what distinguishes applied from merely present.
  const { bg, brightness, base100 } = await surface(page)
  expect(brightness, `dark theme painted a light surface (${bg})`).toBeLessThan(
    260,
  )
  expect(base100).not.toBe("#ffffff")
})

test("system sets no data-theme at all", async ({ page }) => {
  // `system` is the absence of a choice, not a third palette. If it ever
  // starts writing an attribute, `prefers-color-scheme` stops being consulted
  // and the default silently pins everyone to one theme.
  await visitWithStoredConfig(
    page,
    "/projects",
    JSON.stringify({ theme: "system" }),
    "system",
  )
  expect(await themeAttr(page)).toBeNull()
})

test("a theme deleted by the cull falls back instead of rendering unstyled", async ({
  page,
}) => {
  // The guard added with the cull. A browser that visited before it still
  // holds "material" here; written back to data-theme it selects a theme
  // daisyUI no longer emits variables for, and the page renders unstyled with
  // no error anywhere. The helper's settle assertion is the proof that it was
  // rewritten to `system` rather than simply ignored.
  await visitWithStoredConfig(
    page,
    "/projects",
    JSON.stringify({ theme: "material" }),
    "system",
  )

  expect(
    await themeAttr(page),
    "a stale theme was written back to data-theme",
  ).toBeNull()

  const { base100 } = await surface(page)
  expect(base100, "no palette resolved after the fallback").not.toBe("")
})

test("garbage in storage does not take the page down", async ({ page }) => {
  await visitWithStoredConfig(page, "/projects", "{not json at all", "system")
  expect(await themeAttr(page)).toBeNull()
  await expect(page.getByRole("heading", { name: "Projects" })).toBeVisible()
})

test("the sidebar follows the theme rather than carrying its own", async ({
  page,
}) => {
  // The independent `sidebarTheme` override is gone. If something reintroduces
  // a data-theme on the sidebar it becomes a fourth contrast surface that
  // every new colour pair has to be measured against (L22).
  await visitWithStoredConfig(
    page,
    "/projects",
    JSON.stringify({ theme: "light" }),
    "light",
  )
  const sidebarTheme = await page
    .locator("#layout-sidebar")
    .getAttribute("data-theme")
  expect(sidebarTheme).toBeNull()
})

test("theme selection lives in the profile drawer and works", async ({
  page,
}) => {
  // It moved there when the right panel became the assistant. Without it,
  // `system` is unreachable once someone picks light or dark explicitly,
  // because the Topbar toggle only cycles the two.
  await visitWithStoredConfig(
    page,
    "/projects",
    JSON.stringify({ theme: "light" }),
    "light",
  )

  // The topbar trigger specifically. Three labels drive this drawer — trigger,
  // overlay and close — and the sidebar footer also shows the user's name, so
  // matching on the name picks the wrong element.
  await page.locator('label[for="topbar-profile-drawer"]').first().click()
  await expect(page.getByText("Appearance")).toBeVisible()

  await page.getByRole("button", { name: "Dark", exact: true }).click()
  await expect.poll(() => themeAttr(page), { timeout: 5_000 }).toBe("dark")

  await page.getByRole("button", { name: "System", exact: true }).click()
  await expect.poll(() => themeAttr(page), { timeout: 5_000 }).toBeNull()
})

test("the right panel is the assistant, not the old settings drawer", async ({
  page,
}) => {
  await page.goto("/projects")
  await page.getByLabel("Assistant", { exact: true }).click()

  await expect(page.getByRole("heading", { name: "Assistant" })).toBeVisible()
  await expect(page.getByText("Not built yet")).toBeVisible()

  // The controls that were removed must not have survived anywhere in it.
  await expect(page.getByText("Direction")).toHaveCount(0)
  await expect(page.getByText("Font Family")).toHaveCount(0)
})
