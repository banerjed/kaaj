import type { Tx } from "../db/tenant"

/**
 * tenants — the firm's own record. One row per tenant, and RLS scopes every
 * query here to the caller's, so there is no `list`.
 *
 * Path per docs/api-surface.md § Surface B (platform-tenancy, not firm-profile:
 * the table is platform infrastructure that the firm profile edits).
 */

export type Tenant = {
  id: string
  subdomain: string
  company_name: string
  company_name_i18n: Record<string, string> | null
  legal_entity_name: string | null
  industry: string | null
  company_size: string | null
  default_locale: string
  supported_locales: string[] | null
  default_currency: string
  supported_currencies: string[] | null
  default_timezone: string
  date_format: string | null
  time_format: string | null
  primary_contact_name: string | null
  primary_contact_email: string | null
  primary_contact_phone: string | null
}

const COLUMNS = `
  id, subdomain, company_name, company_name_i18n,
  legal_entity_name, industry, company_size,
  default_locale, supported_locales,
  default_currency, supported_currencies,
  default_timezone, date_format, time_format,
  primary_contact_name, primary_contact_email, primary_contact_phone
`

/** The caller's own tenant. */
export async function getCurrent(tx: Tx): Promise<Tenant | null> {
  const [row] = await tx<Tenant[]>`SELECT ${tx.unsafe(COLUMNS)} FROM tenants`
  return row ?? null
}

export type TenantUpdate = {
  company_name: string
  company_name_i18n: Record<string, string> | null
  legal_entity_name: string | null
  industry: string | null
  company_size: string | null
  default_locale: string
  supported_locales: string[]
  default_currency: string
  supported_currencies: string[]
  default_timezone: string
  date_format: string
  time_format: string
  primary_contact_name: string | null
  primary_contact_email: string | null
  primary_contact_phone: string | null
}

/**
 * `subdomain` is deliberately absent: the spec marks it immutable, and it is
 * the tenant's routing key under ADR-009. Changing it would strand every
 * existing link. No WHERE clause either — RLS restricts this to one row, and
 * adding a predicate would introduce a second source of truth for which tenant
 * we are (L3).
 */
export async function update(tx: Tx, patch: TenantUpdate): Promise<Tenant> {
  const [row] = await tx<Tenant[]>`
    UPDATE tenants SET
      company_name          = ${patch.company_name},
      company_name_i18n     = ${tx.json(patch.company_name_i18n)},
      legal_entity_name     = ${patch.legal_entity_name},
      industry              = ${patch.industry},
      company_size          = ${patch.company_size},
      default_locale        = ${patch.default_locale},
      supported_locales     = ${patch.supported_locales},
      default_currency      = ${patch.default_currency},
      supported_currencies  = ${patch.supported_currencies},
      default_timezone      = ${patch.default_timezone},
      date_format           = ${patch.date_format},
      time_format           = ${patch.time_format},
      primary_contact_name  = ${patch.primary_contact_name},
      primary_contact_email = ${patch.primary_contact_email},
      primary_contact_phone = ${patch.primary_contact_phone},
      updated_at            = now()
    RETURNING ${tx.unsafe(COLUMNS)}
  `
  return row
}
