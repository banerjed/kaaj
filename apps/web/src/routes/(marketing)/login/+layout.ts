import { redirect } from "@sveltejs/kit"

export const load = async ({ data, depends }) => {
  depends("supabase:auth")

  if (data.session && data.user) {
    redirect(303, "/account")
  }

  return data
}
