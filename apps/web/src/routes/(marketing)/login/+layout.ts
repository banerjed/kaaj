import { redirect } from "@sveltejs/kit"
import { safeDestination } from "$lib/safe-destination"

export const load = async ({ data, depends, url }) => {
  depends("supabase:auth")

  // Already signed in? Send them into the app, not the billing area. Runs before the sign-in page loads.
  if (data.session && data.user) {
    redirect(303, safeDestination(url.searchParams.get("redirect")))
  }

  return data
}
