/**
 * Where to send someone who has just signed in. Same-origin paths only: an
 * open redirect on a login route sends a person who has just typed their
 * password wherever a crafted link says. `//host` is rejected because a
 * browser reads it as another origin.
 */
export function safeDestination(
  wanted: string | null | undefined,
  fallback = "/employees",
): string {
  return wanted && wanted.startsWith("/") && !wanted.startsWith("//")
    ? wanted
    : fallback
}
