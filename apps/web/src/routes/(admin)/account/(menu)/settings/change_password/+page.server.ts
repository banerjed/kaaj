import { fail } from "@sveltejs/kit"
import type { Actions, PageServerLoad } from "./$types"

export const load: PageServerLoad = async ({ locals: { safeGetSession } }) => {
  const { amr } = await safeGetSession({ includeAmr: true })
  return { amr }
}

export const actions: Actions = {
  /** Emails the signed-in person a link to set a password: their own address, never a posted one. */
  sendReset: async ({ url, locals: { safeGetSession, supabase } }) => {
    const { user } = await safeGetSession()
    if (!user?.email) return fail(401, { message: "Sign in again first." })
    const { error } = await supabase.auth.resetPasswordForEmail(user.email, {
      redirectTo: `${url.origin}/auth/callback?next=%2Faccount%2Fsettings%2Freset_password`,
    })
    if (error)
      return fail(400, {
        message: "The email could not be sent. Try again in a minute.",
      })
    return { sent: true }
  },
}
