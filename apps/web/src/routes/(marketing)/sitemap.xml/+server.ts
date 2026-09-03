import type { RequestHandler } from "@sveltejs/kit"
import * as sitemap from "super-sitemap"
import { WebsiteBaseUrl } from "../../../config"

export const prerender = true

export const GET: RequestHandler = async () => {
  return await sitemap.response({
    origin: WebsiteBaseUrl,
    excludeRoutePatterns: [
      ".*\\(admin\\).*", // exclude routes within admin group
      // Excludes the whole product surface: it's behind auth/tenancy, so listing it here would leak customer data shape.
      ".*\\(app\\).*",
    ],
  })
}
