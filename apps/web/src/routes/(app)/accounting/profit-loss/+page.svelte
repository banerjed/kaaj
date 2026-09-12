<script lang="ts">
  import PageTitle from "$lib/components/PageTitle.svelte"
  import PageHead from "$lib/components/PageHead.svelte"
  import { money } from "$lib/format"
  import EmptyState from "$lib/components/EmptyState.svelte"

  let { data } = $props()

  /** The books are kept in base currency — one locale throughout, unlike an invoice. */
  const baseCurrency = $derived(data.tenant?.default_currency ?? "USD")
  const locale = $derived(data.tenant?.default_locale ?? "en-US")

  const revenueRows = $derived(
    data.rows.filter((r) => r.account_type === "revenue"),
  )
  const expenseRows = $derived(
    data.rows.filter((r) => r.account_type === "expense"),
  )
</script>

<PageHead title="Profit &amp; Loss" />

<div class="p-4 lg:p-6">
  <PageTitle
    title="Profit &amp; Loss"
    items={[
      { label: "Finance & Accounting", path: "/accounting/profit-loss" },
      { label: "Profit & Loss", active: true },
    ]}
  />

  <form method="GET" class="mt-4 flex flex-wrap items-end gap-3">
    <fieldset class="fieldset">
      <legend class="fieldset-legend text-xs">From</legend>
      <input type="date" name="from" class="input" value={data.filters.from} />
    </fieldset>
    <fieldset class="fieldset">
      <legend class="fieldset-legend text-xs">To</legend>
      <input type="date" name="to" class="input" value={data.filters.to} />
    </fieldset>
    <button class="btn btn-primary">Apply</button>
    {#if data.filters.from || data.filters.to}
      <a href="/accounting/profit-loss" class="btn btn-ghost">Clear</a>
    {/if}
  </form>

  {#if data.rows.length === 0}
    <EmptyState icon="lucide--trending-up" message="No posted activity yet." />
  {:else}
    <div class="card bg-base-100 mt-4 shadow">
      <div class="overflow-x-auto">
        <table class="table">
          <tbody>
            <tr class="bg-base-200/40">
              <th colspan="2">Revenue</th>
            </tr>
            {#each revenueRows as r (r.account_code)}
              <tr class="hover:bg-base-200/40">
                <td>
                  <span class="font-mono text-xs">{r.account_code}</span>
                  {r.account_name}
                </td>
                <td class="text-right text-sm tabular-nums">
                  {money(r.amount, baseCurrency, locale)}
                </td>
              </tr>
            {/each}
            <tr class="font-medium">
              <td>Total Revenue</td>
              <td class="text-right tabular-nums">
                {money(data.totals.revenue, baseCurrency, locale)}
              </td>
            </tr>

            <tr class="bg-base-200/40">
              <th colspan="2">Expenses</th>
            </tr>
            {#each expenseRows as r (r.account_code)}
              <tr class="hover:bg-base-200/40">
                <td>
                  <span class="font-mono text-xs">{r.account_code}</span>
                  {r.account_name}
                </td>
                <td class="text-right text-sm tabular-nums">
                  {money(r.amount, baseCurrency, locale)}
                </td>
              </tr>
            {/each}
            <tr class="font-medium">
              <td>Total Expenses</td>
              <td class="text-right tabular-nums">
                {money(data.totals.expenses, baseCurrency, locale)}
              </td>
            </tr>
          </tbody>
          <tfoot>
            <tr class="text-base font-semibold">
              <td>Net Income</td>
              <td
                class="text-right tabular-nums"
                class:text-error={Number(data.totals.net_income) < 0}
              >
                {money(data.totals.net_income, baseCurrency, locale)}
              </td>
            </tr>
          </tfoot>
        </table>
      </div>
    </div>
  {/if}
</div>
