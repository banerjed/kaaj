import { redirect } from "@sveltejs/kit"
import type { Database } from "../../../DatabaseDefinitions.js"
import { CreateProfileStep } from "../../../config"

export const load = async ({ data, depends, url }) => {
  depends("supabase:auth")

  const { session, user, profile } = data
  if (!session || !user) {
    redirect(303, "/login")
  }

  const createProfilePath = "/account/create_profile"
  const signOutPath = "/account/sign_out"
  if (
    profile &&
    !_hasFullProfile(profile) &&
    url.pathname !== createProfilePath &&
    url.pathname !== signOutPath &&
    CreateProfileStep
  ) {
    redirect(303, createProfilePath)
  }

  return data
}

export const _hasFullProfile = (
  profile: Database["public"]["Tables"]["profiles"]["Row"] | null,
) => {
  if (!profile) {
    return false
  }
  if (!profile.full_name) {
    return false
  }
  if (!profile.company_name) {
    return false
  }
  if (!profile.website) {
    return false
  }

  return true
}
