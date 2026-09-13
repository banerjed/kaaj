<script lang="ts">
  import PageTitle from "$lib/components/PageTitle.svelte"
  import PageHead from "$lib/components/PageHead.svelte"
  import { money, localeForCurrency } from "$lib/format"
  import { compareDecimal } from "$lib/decimal"
  import EmptyState from "$lib/components/EmptyState.svelte"

  let { data } = $props()

  const tenantLocale = $derived(data.tenant?.default_locale ?? "en-US")
  /** A customer's balance is read in their own currency, never converted. */
  const localeFor = (c: string) =>
    localeForCurrency(data.locations, c, tenantLocale)

  const overLimit = (r: (typeof data.rows)[number]) =>
    r.credit_limit !== null && compareDecimal(r.total_due, r.credit_limit) > 0
</script>

<PageHead title="Customer Balances" />

<div class="p-4 lg:p-6">
  <PageTitle
    title="Customer Balances"
    items={[
      { label: "Finance & Accounting", path: "/accounting/customer-balances" },
      { label: "Customer Balances", active: true },
    ]}
  />

  {#if data.rows.length === 0}
    <EmptyState
      icon="lucide--users"
      message="No customer owes money right now."
    />
  {:else}
    <div class="card bg-base-100 mt-4 shadow">
      <div class="overflow-x-auto">
        <table class="table">
          <thead>
            <tr>
              <th>Customer</th>
              <th class="text-right">Invoices</th>
              <th class="text-right">Invoiced</th>
              <th class="text-right">Paid</th>
              <th class="text-right">Credited</th>
              <th class="text-right">Balance Due</th>
              <th class="text-right">Credit Limit</th>
            </tr>
          </thead>
          <tbody>
            {#each data.rows as r (r.customer_id + r.currency)}
              {@const locale = localeFor(r.currency)}
              <tr class="hover:bg-base-200/40">
                <td>
                  {r.customer_name}
                  <span class="text-base-content/70 text-xs">{r.currency}</span>
                </td>
                <td class="text-right tabular-nums">{r.invoice_count}</td>
                <td class="text-right text-sm tabular-nums">
                  {money(r.total_invoiced, r.currency, locale)}
                </td>
                <td class="text-right text-sm tabular-nums">
                  {money(r.total_paid, r.currency, locale)}
                </td>
                <td class="text-right text-sm tabular-nums">
                  {money(r.total_credited, r.currency, locale)}
                </td>
                <td
                  class="text-right text-sm font-medium tabular-nums"
                  class:text-error={overLimit(r)}
                >
                  {money(r.total_due, r.currency, locale)}
                </td>
                <td class="text-right text-sm tabular-nums">
                  {r.credit_limit !== null
                    ? money(r.credit_limit, r.currency, locale)
                    : "—"}
                </td>
              </tr>
            {/each}
          </tbody>
        </table>
      </div>
      <p class="text-base-content/70 p-4 text-xs">
        Each row is in the customer's own currency and is not summed across
        currencies. Balance due shown in red is over that customer's credit
        limit.
      </p>
    </div>
  {/if}
</div>
