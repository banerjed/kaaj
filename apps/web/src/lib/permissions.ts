/**
 * The viewer's own capability list, as sent to the browser by
 * `(app)/+layout.server.ts` and already used to filter the sidebar.
 *
 * This is navigation hygiene, NOT access control (L44): it stops the app
 * offering a control that would answer 403. Every `load` and every action
 * still checks server-side, and must keep doing so — a hidden button is not
 * a permission.
 */
export function has(
  permissions: string[] | undefined,
  permission: string,
): boolean {
  return !!permissions?.includes(permission)
}

/** True when the viewer holds ANY of these — for a page whose write path has several names. */
export function hasAny(
  permissions: string[] | undefined,
  ...wanted: string[]
): boolean {
  return wanted.some((p) => has(permissions, p))
}
