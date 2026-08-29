import type { RequestHandler } from "@sveltejs/kit"
import * as sitemap from "super-sitemap"
import { WebsiteBaseUrl } from "../../../config"

export const prerender = true

export const GET: RequestHandler = async () => {
  return await sitemap.response({
    origin: WebsiteBaseUrl,
    excludeRoutePatterns: [
      ".*\\(admin\\).*", // i.e. exclude routes within admin group
      // The whole product surface. These pages sit behind authentication and a
      // tenant claim, so they do not belong in a PUBLIC sitemap — listing
      // /employees/<uuid> would publish the shape of a customer's headcount to
      // anyone who fetched it. It also stops super-sitemap demanding
      // paramValues for every dynamic route we add.
      ".*\\(app\\).*",
    ],
  })
}
