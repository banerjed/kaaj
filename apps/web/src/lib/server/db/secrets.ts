/**
 * Resolves a `tenant_registry.connection_secret_ref` to an actual connection
 * string. `tenant_registry` stores only the reference, never the DSN
 * (ADR-009) — this is the one place that closes the loop.
 *
 * Stand-in for a real secret store (Vault, KMS-wrapped, etc.): a secret ref
 * is looked up as an env var of the same name. Adequate for a demo where the
 * "secret store" is `apps/web/.env.local`; a real deployment would swap only
 * this file.
 */
import { env } from "$env/dynamic/private"

export function resolveSecret(ref: string): string {
  const value = env[ref]
  if (!value) {
    throw new Error(
      `Connection secret "${ref}" is not set. tenant_registry named it, but ` +
        `no matching value exists in the environment — check apps/web/.env.local.`,
    )
  }
  return value
}
