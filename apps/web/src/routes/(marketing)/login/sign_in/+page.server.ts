import { fail, redirect } from "@sveltejs/kit"
import type { Actions } from "./$types"
import { FormReader } from "$lib/server/forms"
import { safeDestination } from "$lib/safe-destination"

/**
 * The sign-in form posts here, and the server signs in with its own Supabase
 * client, which sets the session cookies on the response. No Supabase code
 * reaches the browser: the page is plain HTML and ships no JavaScript.
 */
export const csr = false

export const actions: Actions = {
  signIn: async ({ request, locals: { supabase } }) => {
    const f = new FormReader(await request.formData())
    const email = f.text("email", { required: true, max: 254 })
    const password = f.password("password", { max: 200 })
    const destination = safeDestination(f.text("redirect", { max: 2000 }))
    if (!f.ok) return fail(400, { ...f.problem(), email })

    const { error } = await supabase.auth.signInWithPassword({
      email,
      password,
    })
    if (error) {
      // One sentence for a wrong email and a wrong password: saying which
      // tells a stranger which addresses have an account.
      return fail(400, {
        message:
          error.code === "email_not_confirmed"
            ? "Confirm your email address first: use the link we sent you."
            : "The email address or the password is incorrect.",
        errorFields: ["email", "password"],
        email,
      })
    }
    redirect(303, destination)
  },

  github: async ({ request, url, locals: { supabase } }) => {
    const f = new FormReader(await request.formData())
    const destination = safeDestination(f.text("redirect", { max: 2000 }))
    const { data, error } = await supabase.auth.signInWithOAuth({
      provider: "github",
      options: {
        // The PKCE verifier goes into a cookie on this response; the callback
        // exchanges the code with it.
        redirectTo: `${url.origin}/auth/callback?next=${encodeURIComponent(destination)}`,
        skipBrowserRedirect: true,
      },
    })
    if (error || !data.url)
      return fail(400, {
        message:
          "Sign-in with GitHub is not available. Sign in with your email address and password.",
      })
    redirect(303, data.url)
  },
}
