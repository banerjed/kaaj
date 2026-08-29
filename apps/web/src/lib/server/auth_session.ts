import type { Session, User } from "@supabase/supabase-js"

export type SafeAuthSession = {
  expires_at: number | null
  user: { email: string | null }
}

export const toSafeAuthSession = (
  session: Session | null,
  user?: User | null,
): SafeAuthSession | null =>
  session
    ? {
        expires_at: session.expires_at ?? null,
        user: { email: user?.email ?? session.user.email ?? null },
      }
    : null
