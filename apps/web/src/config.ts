/**
 * The product's identity, in ONE place.
 *
 * `WebsiteName` was still the CMSaasStarter default long after the fork, so
 * the public site served `<title>SaaS Starter</title>` and put that name in
 * its nav — while the application area hardcoded "Kaaj" in thirty-one separate
 * files. Two names for one product, and the wrong one was the user-facing one.
 *
 * Nothing may spell the product name literally. `PageHead` composes every
 * document title from this, `Logo` and `Footer` render it, and `./check`'s
 * `product name is not hardcoded` step fails on a new literal.
 */

export const WebsiteName: string = "Kaaj"

/**
 * Used by the sitemap, the marketing page's structured data, and the links in
 * transactional email.
 *
 * STILL THE TEMPLATE'S DOMAIN. It is a deployment fact rather than a naming
 * one — docs/12-beta-deployment.md has not chosen a host yet — and inventing a
 * plausible URL here would put a wrong link in a real email and a wrong origin
 * in a sitemap, which is worse than an obviously unset one. Set it when the
 * domain exists.
 */
export const WebsiteBaseUrl: string = "https://saasstarter.work"

export const WebsiteDescription: string =
  "Unified workplace management software for SMBs — HR, payroll, projects and accounting in one place."

export const CreateProfileStep: boolean = true
