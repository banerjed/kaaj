import type { LayoutServerLoad } from "./$types"
import { toSafeAuthSession } from "$lib/server/auth_session"

export const load: LayoutServerLoad = async ({
  locals: { session, user, supabase },
}) => {
  const { data: profile } = user?.id
    ? await supabase.from("profiles").select("*").eq("id", user.id).single()
    : { data: null }

  return {
    session: toSafeAuthSession(session, user),
    user,
    profile,
  }
}
