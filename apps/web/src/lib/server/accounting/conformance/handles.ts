/**
 * How a fixture's names resolve to the conformance tenant's rows (spec
 * sections 6 and 7). Accounts resolve through account_code — the engine
 * hardcodes several codes (ACCOUNTS in accounting.repo.ts and
 * payables.repo.ts), and the seed keeps them.
 */
import type { Tx } from "../../db/tenant"

export const ACCOUNT_CODES: Record<string, string> = {
  OPERATING_BANK: "1000",
  SAVINGS_BANK: "1020",
  EUR_BANK: "1030",
  ACCOUNTS_RECEIVABLE: "1100",
  ALLOWANCE_DOUBTFUL: "1150",
  INPUT_TAX_RECOVERABLE: "1200",
  INVENTORY: "1210",
  INVENTORY_CLEARING: "1250",
  PREPAID_EXPENSES: "1300",
  EQUIPMENT: "1400",
  FURNITURE: "1410",
  ACCUMULATED_DEPRECIATION: "1490",
  ACCOUNTS_PAYABLE: "2000",
  ACCRUED_EXPENSES: "2150",
  SALES_TAX_PAYABLE: "2200",
  CUSTOMER_DEPOSITS: "2250",
  DEFERRED_REVENUE: "2300",
  CORPORATE_CARD: "2400",
  RETAINED_EARNINGS: "3000",
  COMMON_STOCK: "3100",
  SERVICE_REVENUE: "4000",
  PRODUCT_REVENUE: "4100",
  SALES_RETURNS: "4150",
  REALIZED_FX_GAIN_LOSS: "4200",
  COGS: "5000",
  BAD_DEBT_EXPENSE: "5500",
  RENT_EXPENSE: "6000",
  OFFICE_EXPENSE: "6100",
  INSURANCE_EXPENSE: "6200",
  DEPRECIATION_EXPENSE: "6300",
  BANK_FEES: "6500",
  UNREALIZED_FX_GAIN: "7020",
  UNREALIZED_FX_LOSS: "7030",
  GAIN_ON_DISPOSAL: "7100",
  LOSS_ON_DISPOSAL: "7110",
  INTEREST_INCOME: "8000",
  INACTIVE_ACCOUNT: "9000",
}

export const SEMANTIC_BY_CODE: Record<string, string> = Object.fromEntries(
  Object.entries(ACCOUNT_CODES).map(([k, v]) => [v, k]),
)

/** Products (spec 7.3). The engine has no product table; a line carries description and price. */
export const ITEMS: Record<
  string,
  { description: string; unitPrice: string; cost: string | null }
> = {
  "ITEM-A": { description: "Item A", unitPrice: "100.00", cost: "60.00" },
  "ITEM-B": { description: "Item B", unitPrice: "50.00", cost: "20.00" },
  "ITEM-C": { description: "Item C", unitPrice: "0.10", cost: "0.04" },
  "SERVICE-A": { description: "Service A", unitPrice: "100.00", cost: null },
  "SERVICE-B": { description: "Service B", unitPrice: "250.00", cost: null },
}

export type ActorHandle = {
  userId: string
  employeeId: string
  role: string
  functionalRoles: string[]
}

export type Handles = {
  tenantId: string
  accounts: Map<string, string>
  customers: Map<string, string>
  vendors: Map<string, string>
  taxRates: Map<string, { id: string; rate: string }>
  periods: Map<string, string>
  banks: Map<string, string>
  actors: Map<string, ActorHandle>
}

export async function loadHandles(tx: Tx, tenantId: string): Promise<Handles> {
  const accounts = await tx<{ id: string; account_code: string }[]>`
    SELECT id, account_code FROM chart_of_accounts WHERE tenant_id = ${tenantId}::uuid`
  const customers = await tx<{ id: string; customer_number: string }[]>`
    SELECT id, customer_number FROM customers WHERE tenant_id = ${tenantId}::uuid`
  const vendors = await tx<{ id: string; vendor_number: string }[]>`
    SELECT id, vendor_number FROM vendors WHERE tenant_id = ${tenantId}::uuid`
  const taxRates = await tx<{ id: string; code: string; rate: string }[]>`
    SELECT id, code, rate::text AS rate FROM tax_rates WHERE tenant_id = ${tenantId}::uuid`
  const periods = await tx<{ id: string; period_name: string }[]>`
    SELECT id, period_name FROM accounting_periods WHERE tenant_id = ${tenantId}::uuid`
  const banks = await tx<{ id: string; account_name: string }[]>`
    SELECT id, account_name FROM bank_accounts WHERE tenant_id = ${tenantId}::uuid`
  const users = await tx<
    {
      user_id: string
      employee_id: string
      role: string
      functional_roles: string[]
    }[]
  >`
    SELECT user_id, employee_id, role, functional_roles
      FROM tenant_users WHERE tenant_id = ${tenantId}::uuid AND employee_id IS NOT NULL`

  const accountIds = new Map<string, string>()
  for (const [semantic, code] of Object.entries(ACCOUNT_CODES)) {
    const row = accounts.find((a) => a.account_code === code)
    if (row) accountIds.set(semantic, row.id)
  }
  // Spec GL-020: the second tenant's one account, read as the owner because
  // row-level security hides it from this tenant — which is the point.
  await tx`RESET ROLE`
  try {
    const [other] = await tx<{ id: string }[]>`
      SELECT id FROM chart_of_accounts WHERE tenant_id = _acs.u('tenant', 2) LIMIT 1`
    if (other) accountIds.set("OTHER_TENANT_ACCOUNT", other.id)
  } finally {
    await tx`SET LOCAL ROLE app_user`
  }
  const actors = new Map<string, ActorHandle>()
  for (const u of users) {
    const name =
      u.role === "owner"
        ? "owner"
        : (u.functional_roles[0]?.replace(/_admin$/, "") ?? u.role)
    actors.set(name, {
      userId: u.user_id,
      employeeId: u.employee_id,
      role: u.role,
      functionalRoles: u.functional_roles ?? [],
    })
  }
  return {
    tenantId,
    accounts: accountIds,
    customers: new Map(customers.map((c) => [c.customer_number, c.id])),
    vendors: new Map(vendors.map((v) => [v.vendor_number, v.id])),
    taxRates: new Map(
      taxRates.map((t) => [t.code, { id: t.id, rate: t.rate }]),
    ),
    periods: new Map(periods.map((p) => [p.period_name, p.id])),
    banks: new Map(banks.map((b) => [b.account_name, b.id])),
    actors,
  }
}

export function must<T>(map: Map<string, T>, key: string, what: string): T {
  const v = map.get(key)
  if (v === undefined) throw new Error(`unknown ${what}: ${key}`)
  return v
}
