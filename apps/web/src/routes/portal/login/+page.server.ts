import { fail, redirect } from "@sveltejs/kit"
import type { Actions, PageServerLoad } from "./$types"
import { FormReader } from "$lib/server/forms"

/**
 * Portal sign-in — separate from staff /login on purpose
 * (docs/17-customer-portal.md §1: permission model, branding and
 * destination all differ enough that sharing one entry point means every
 * staff-login change has to reason about whether it affects portal
 * contacts too).
 *
 * Password-based for now, matching the dev fixture (packages/database/
 * fixtures/dev-users.sql). Swapping to magic link is a change to this one
 * action (`signInWithOtp` instead of `signInWithPassword`), not a redesign.
 */
export const load: PageServerLoad = async ({ locals }) => {
  if (locals.session && locals.customerContactId) redirect(303, "/portal")
  // No parent layout under /portal/login supplies PageData.session — an
  // unauthenticated visitor to a sign-in page has none.
  return { session: null }
}

export const actions: Actions = {
  default: async ({ request, locals, url }) => {
    const f = new FormReader(await request.formData())
    const email = f.text("email", { required: true, max: 255 })
    const password = f.text("password", { required: true, max: 255 })
    if (!f.ok) return fail(400, f.problem("Enter your email and password."))

    const { error: authError } = await locals.supabase.auth.signInWithPassword({
      email: email!,
      password: password!,
    })
    if (authError) {
      return fail(400, {
        message: "Incorrect email or password.",
        errorFields: ["password"],
      })
    }

    const wanted = url.searchParams.get("redirect")
    const destination =
      wanted && wanted.startsWith("/") && !wanted.startsWith("//")
        ? wanted
        : "/portal"
    redirect(303, destination)
  },
}
