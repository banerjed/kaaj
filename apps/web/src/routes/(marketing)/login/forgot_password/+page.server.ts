import { fail } from "@sveltejs/kit"
import type { Actions } from "./$types"
import { FormReader } from "$lib/server/forms"

/** Plain HTML, no JavaScript: the server asks for the reset email. */
export const csr = false

export const actions: Actions = {
  sendReset: async ({ request, url, locals: { supabase } }) => {
    const f = new FormReader(await request.formData())
    const email = f.text("email", { required: true, max: 254 })
    if (!f.ok) return fail(400, { ...f.problem(), email })

    await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${url.origin}/auth/callback?next=%2Faccount%2Fsettings%2Freset_password`,
    })
    // The same answer whether or not the address has an account: anything
    // else tells a stranger who is a user here.
    return { sent: true, email }
  },
}
