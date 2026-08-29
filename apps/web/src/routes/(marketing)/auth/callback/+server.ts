import { redirect, type RequestHandler } from "@sveltejs/kit"
import { isAuthApiError } from "@supabase/supabase-js"

export const GET: RequestHandler = async ({ url, locals: { supabase } }) => {
  const code = url.searchParams.get("code")
  if (code) {
    try {
      await supabase.auth.exchangeCodeForSession(code)
    } catch (error) {
      // If the link is opened in another browser, return to sign-in without
      // exposing the provider error to the user.
      if (isAuthApiError(error)) {
        redirect(303, "/login/sign_in?verified=true")
      }
      throw error
    }
  }

  const next = url.searchParams.get("next")
  // Only allow same-origin relative paths. In particular, reject `//host`,
  // which browsers interpret as an external origin-relative URL.
  let destination = "/account"
  if (next?.startsWith("/") && !next.startsWith("//")) {
    try {
      const candidate = new URL(next, url.origin)
      if (candidate.origin === url.origin) {
        destination = `${candidate.pathname}${candidate.search}${candidate.hash}`
      }
    } catch {
      // Malformed destinations fall back to the account page.
    }
  }

  redirect(303, destination)
}
