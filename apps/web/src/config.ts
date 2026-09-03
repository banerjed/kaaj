/**
 * The product's identity, in ONE place — nothing else may spell it literally.
 * `PageHead`, `Logo` and `Footer` render from here; `./check`'s
 * `product name is not hardcoded` step fails on a new literal.
 */

export const WebsiteName: string = "Kaaj"

/**
 * Used by the sitemap, structured data, and transactional email links. Still
 * the template's domain — no host chosen yet (docs/12-beta-deployment.md).
 */
export const WebsiteBaseUrl: string = "https://saasstarter.work"

export const WebsiteDescription: string =
  "Unified workplace management software for SMBs — HR, payroll, projects and accounting in one place."

export const CreateProfileStep: boolean = true
