<script lang="ts">
  import PageTitle from "$lib/components/PageTitle.svelte"
  import PageHead from "$lib/components/PageHead.svelte"
  import { money } from "$lib/format"
  import EmptyState from "$lib/components/EmptyState.svelte"

  let { data } = $props()

  /** The books are kept in base currency — one locale throughout, unlike an invoice. */
  const baseCurrency = $derived(data.tenant?.default_currency ?? "USD")
  const locale = $derived(data.tenant?.default_locale ?? "en-US")
</script>

<PageHead title="Statement of Changes in Equity" />

<div class="p-4 lg:p-6">
  <PageTitle
    title="Statement of Changes in Equity"
    items={[
      { label: "Finance & Accounting", path: "/accounting/equity" },
      { label: "Statement of Changes in Equity", active: true },
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
      <a href="/accounting/equity" class="btn btn-ghost">Clear</a>
    {/if}
  </form>

  {#if data.rows.length === 0}
    <EmptyState
      icon="lucide--landmark"
      message="No equity accounts exist yet."
    />
  {:else}
    <div class="card bg-base-100 mt-4 shadow">
      <div class="overflow-x-auto">
        <table class="table">
          <thead>
            <tr>
              <th>Account</th>
              <th class="text-right">Beginning Balance</th>
              <th class="text-right">Direct Changes</th>
              <th class="text-right">Ending Balance</th>
            </tr>
          </thead>
          <tbody>
            {#each data.rows as r (r.account_code)}
              <tr class="hover:bg-base-200/40">
                <td>
                  <span class="font-mono text-xs">{r.account_code}</span>
                  {r.account_name}
                </td>
                <td class="text-right text-sm tabular-nums">
                  {money(r.beginning_balance, baseCurrency, locale)}
                </td>
                <td class="text-right text-sm tabular-nums">
                  {money(r.direct_changes, baseCurrency, locale)}
                </td>
                <td class="text-right text-sm tabular-nums">
                  {money(r.ending_balance, baseCurrency, locale)}
                </td>
              </tr>
            {/each}
            <tr class="font-medium">
              <td>Total (stated equity accounts)</td>
              <td class="text-right tabular-nums">
                {money(data.totals.beginning_equity, baseCurrency, locale)}
              </td>
              <td class="text-right tabular-nums">
                {money(data.totals.direct_changes, baseCurrency, locale)}
              </td>
              <td class="text-right tabular-nums">
                {money(data.totals.ending_equity, baseCurrency, locale)}
              </td>
            </tr>
            <tr class="hover:bg-base-200/40">
              <td colspan="3">
                Current period earnings
                <span class="text-base-content/70 text-xs">
                  (not yet closed into an equity account)
                </span>
              </td>
              <td class="text-right text-sm tabular-nums">
                {money(data.totals.net_income, baseCurrency, locale)}
              </td>
            </tr>
          </tbody>
          <tfoot>
            <tr class="text-base font-semibold">
              <td colspan="3">Total Equity, Including Current Earnings</td>
              <td class="text-right tabular-nums">
                {money(
                  data.totals.ending_equity_including_current_earnings,
                  baseCurrency,
                  locale,
                )}
              </td>
            </tr>
          </tfoot>
        </table>
      </div>
    </div>
  {/if}
</div>
