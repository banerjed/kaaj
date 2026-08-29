import { redirect } from "@sveltejs/kit"

export const actions = {
  signout: async ({ locals: { session, supabase } }) => {
    if (session) {
      await supabase.auth.signOut()
      redirect(303, "/")
    }
  },
}
