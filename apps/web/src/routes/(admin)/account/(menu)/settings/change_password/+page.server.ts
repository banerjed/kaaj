import type { PageServerLoad } from "./$types"

export const load: PageServerLoad = async ({ locals: { safeGetSession } }) => {
  const { amr } = await safeGetSession({ includeAmr: true })
  return { amr }
}
