import { redirect } from "@sveltejs/kit"

export const load = async ({ data, depends, url }) => {
  depends("supabase:auth")

  // Already signed in? Send them into the app, not the billing area. Runs before the sign-in page loads.
  if (data.session && data.user) {
    const wanted = url.searchParams.get("redirect")
    // Same-origin paths only. An open redirect on a login route sends someone
    // who has just authenticated wherever a crafted link says.
    const to =
      wanted && wanted.startsWith("/") && !wanted.startsWith("//")
        ? wanted
        : "/employees"
    redirect(303, to)
  }

  return data
}
