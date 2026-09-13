<script lang="ts">
  import PageTitle from "$lib/components/PageTitle.svelte"
  import PageHead from "$lib/components/PageHead.svelte"
  import { money, localeForCurrency } from "$lib/format"
  import EmptyState from "$lib/components/EmptyState.svelte"

  let { data } = $props()

  const tenantLocale = $derived(data.tenant?.default_locale ?? "en-US")
  /** A customer's balance is read in their own currency, never converted. */
  const localeFor = (c: string) =>
    localeForCurrency(data.locations, c, tenantLocale)
</script>

<PageHead title="AR Aging" />

<div class="p-4 lg:p-6">
  <PageTitle
    title="AR Aging"
    items={[
      { label: "Finance & Accounting", path: "/accounting/ar-aging" },
      { label: "AR Aging", active: true },
    ]}
  />

  <form method="GET" class="mt-4 flex flex-wrap items-end gap-3">
    <fieldset class="fieldset">
      <legend class="fieldset-legend text-xs">As of</legend>
      <input type="date" name="as_of" class="input" value={data.filters.asOf} />
    </fieldset>
    <button class="btn btn-primary">Apply</button>
    {#if data.filters.asOf}
      <a href="/accounting/ar-aging" class="btn btn-ghost">Clear</a>
    {/if}
  </form>

  {#if data.rows.length === 0}
    <EmptyState icon="lucide--clock-alert" message="No open receivables." />
  {:else}
    <div class="card bg-base-100 mt-4 shadow">
      <div class="overflow-x-auto">
        <table class="table">
          <thead>
            <tr>
              <th>Customer</th>
              <th class="text-right">Current</th>
              <th class="text-right">1-30 Days</th>
              <th class="text-right">31-60 Days</th>
              <th class="text-right">61-90 Days</th>
              <th class="text-right">90+ Days</th>
              <th class="text-right">Total</th>
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
                <td class="text-right text-sm tabular-nums">
                  {money(r.current, r.currency, locale)}
                </td>
                <td class="text-right text-sm tabular-nums">
                  {money(r.days_1_30, r.currency, locale)}
                </td>
                <td class="text-right text-sm tabular-nums">
                  {money(r.days_31_60, r.currency, locale)}
                </td>
                <td class="text-right text-sm tabular-nums">
                  {money(r.days_61_90, r.currency, locale)}
                </td>
                <td class="text-right text-sm tabular-nums">
                  {money(r.days_90_plus, r.currency, locale)}
                </td>
                <td class="text-right text-sm font-medium tabular-nums">
                  {money(r.total, r.currency, locale)}
                </td>
              </tr>
            {/each}
          </tbody>
        </table>
      </div>
      <p class="text-base-content/70 p-4 text-xs">
        Each row is in the customer's own billing currency and is not summed
        across currencies.
      </p>
    </div>
  {/if}
</div>
