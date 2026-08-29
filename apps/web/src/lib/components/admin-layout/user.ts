export type ISidebarUser = {
  id: string
  email?: string | null
  fullName?: string | null
  role?: string
}

export const userInitials = (name?: string | null, email?: string | null) => {
  const source =
    name?.trim() || email?.split("@")[0]?.replace(/[._-]/g, " ") || "?"

  return source
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? "")
    .join("")
}

export const userDisplayName = (
  user?: Pick<ISidebarUser, "fullName" | "email">,
) => user?.fullName ?? user?.email ?? "Account"
