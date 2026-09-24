import type { Tx } from "../db/tenant"
import {
  sealField,
  openField,
  newKeyCache,
  type Subject,
} from "../pii/pii.repo"

/** Bring-your-own-key: the secret belongs to the tenant's own Stripe account, so `subjectId` is the tenant itself, not an employee. */
function tenantSubject(tenantId: string): Subject {
  return { tenantId, subjectType: "tenant", subjectId: tenantId }
}

const FIELD = (tenantId: string) => ({
  table: "payment_gateway_settings",
  column: "secret_key_ct",
  rowId: tenantId,
})

export type PaymentGatewaySettings = {
  secretKeyLast4: string
  isLiveMode: boolean
  verifiedAt: string
}

/** Display metadata only — never the secret itself. */
export async function paymentGatewaySettings(
  tx: Tx,
  tenantId: string,
): Promise<PaymentGatewaySettings | null> {
  const [row] = await tx<
    {
      secret_key_last4: string
      is_live_mode: boolean
      verified_at: string
    }[]
  >`
    SELECT secret_key_last4, is_live_mode, verified_at::text
      FROM payment_gateway_settings
     WHERE tenant_id = ${tenantId}::uuid
       AND secret_key_ct IS NOT NULL
  `
  if (!row) return null
  return {
    secretKeyLast4: row.secret_key_last4,
    isLiveMode: row.is_live_mode,
    verifiedAt: row.verified_at,
  }
}

/** The real key, opened for use — invoice-issuance time only, never rendered to a page. */
export async function stripeSecretKeyFor(
  tx: Tx,
  tenantId: string,
): Promise<string | null> {
  const [row] = await tx<{ secret_key_ct: string | null }[]>`
    SELECT secret_key_ct FROM payment_gateway_settings WHERE tenant_id = ${tenantId}::uuid
  `
  if (!row?.secret_key_ct) return null
  const { value } = await openField(
    tx,
    tenantSubject(tenantId),
    FIELD(tenantId),
    row.secret_key_ct,
    newKeyCache(),
  )
  return value
}

export async function savePaymentGatewaySecret(
  tx: Tx,
  tenantId: string,
  actorId: string,
  secretKey: string,
  meta: { last4: string; isLiveMode: boolean },
): Promise<void> {
  const sealed = await sealField(
    tx,
    tenantSubject(tenantId),
    FIELD(tenantId),
    secretKey,
  )
  await tx`
    INSERT INTO payment_gateway_settings
      (tenant_id, secret_key_ct, secret_key_last4, is_live_mode, verified_at, created_by, updated_by)
    VALUES (${tenantId}::uuid, ${sealed}, ${meta.last4}, ${meta.isLiveMode}, now(), ${actorId}::uuid, ${actorId}::uuid)
    ON CONFLICT (tenant_id) DO UPDATE
      SET secret_key_ct = excluded.secret_key_ct,
          secret_key_last4 = excluded.secret_key_last4,
          is_live_mode = excluded.is_live_mode,
          verified_at = excluded.verified_at,
          updated_at = now(),
          updated_by = excluded.updated_by
  `
}

export async function disconnectPaymentGateway(
  tx: Tx,
  tenantId: string,
  actorId: string,
): Promise<void> {
  await tx`
    UPDATE payment_gateway_settings
       SET secret_key_ct = NULL, secret_key_last4 = NULL, is_live_mode = NULL,
           verified_at = NULL, updated_at = now(), updated_by = ${actorId}::uuid
     WHERE tenant_id = ${tenantId}::uuid
  `
}
