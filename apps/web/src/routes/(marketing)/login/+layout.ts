import { redirect } from "@sveltejs/kit"

export const load = async ({ data, depends, url }) => {
  depends("supabase:auth")

  // Already signed in? Go to the app, not CMSaasStarter's billing area.
  //
  // This fires BEFORE the sign-in page loads, so it is what an authenticated
  // person sees when they visit /login/sign_in at all — which is how "the
  // sign-in page keeps redirecting me to /account" happened. Fixing the
  // destination on the page itself was not enough; this ran first.
  //
  // To sign in as someone else, sign out first: the app's sidebar and profile
  // menu both link to /account/sign_out.
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
