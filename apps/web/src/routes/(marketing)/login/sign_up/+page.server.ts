import { fail, redirect } from "@sveltejs/kit"
import type { Actions } from "./$types"
import { FormReader } from "$lib/server/forms"

/** Plain HTML, no JavaScript: the server signs the person up (see sign_in). */
export const csr = false

export const actions: Actions = {
  signUp: async ({ request, url, locals: { supabase } }) => {
    const f = new FormReader(await request.formData())
    const email = f.text("email", { required: true, max: 254 })
    const password = f.password("password", { max: 200 })
    if (!f.ok) return fail(400, { ...f.problem(), email })

    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: { emailRedirectTo: `${url.origin}/auth/callback` },
    })
    if (error)
      return fail(400, {
        // The auth service's own sentence names the rule a password broke.
        message: error.message,
        errorFields: error.code?.startsWith("weak_password")
          ? ["password"]
          : ["email"],
        email,
      })

    // With email confirmation on, there is no session until the link is used.
    if (!data.session) return { checkEmail: true, email }
    redirect(303, "/account")
  },
}
