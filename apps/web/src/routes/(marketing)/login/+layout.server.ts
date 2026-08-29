import type { LayoutServerLoad } from "./$types"
import { toSafeAuthSession } from "$lib/server/auth_session"

export const load: LayoutServerLoad = async ({
  locals: { session, user },
  url,
}) => {
  return {
    url: url.origin,
    session: toSafeAuthSession(session, user),
    user,
  }
}
