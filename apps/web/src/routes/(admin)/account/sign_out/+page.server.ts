import { redirect } from "@sveltejs/kit"
import type { Actions } from "./$types"

/**
 * Signing out is a POST. A GET that signed out would do it whenever a link
 * was preloaded, and the app preloads on hover.
 */
export const actions: Actions = {
  default: async ({ locals: { supabase } }) => {
    await supabase.auth.signOut()
    redirect(303, "/")
  },
}
