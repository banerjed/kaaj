/**
 * Resolves a `tenant_registry.connection_secret_ref` to a connection string.
 * `tenant_registry` stores only the reference (ADR-009); this is the one place
 * that closes the loop.
 *
 * A `sealed:v1:…` ref is the connection string itself, encrypted under
 * `PRIVATE_PII_KEK` and bound to its tenant — nothing to add to the host's
 * environment or redeploy when a tenant is provisioned. Any other ref is the
 * NAME of an environment variable, which is what local development uses
 * (`apps/web/.env.local`).
 */
import { env } from "$env/dynamic/private"
import { keyRing } from "../pii/keys"
import {
  SealedSecretError,
  isSealedRef,
  openConnectionUrl,
} from "./sealed-secret.js"

export function resolveSecret(ref: string, tenantId: string): string {
  if (isSealedRef(ref)) {
    const ring = keyRing()
    try {
      return openConnectionUrl(ref, tenantId, (v) => ring.byVersion.get(v))
    } catch (e) {
      if (!(e instanceof SealedSecretError)) throw e
      throw new Error(
        `The sealed connection secret for tenant ${tenantId} could not be opened ` +
          `(${e.reason}). Either PRIVATE_PII_KEK no longer holds the key it was ` +
          `sealed with, or the value was copied from another tenant's row.`,
      )
    }
  }

  const value = env[ref]
  if (!value) {
    throw new Error(
      `Connection secret "${ref}" is not set. tenant_registry named it, but ` +
        `no matching value exists in the environment — check apps/web/.env.local.`,
    )
  }
  return value
}
