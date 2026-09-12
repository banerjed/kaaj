<script lang="ts">
  import PageTitle from "$lib/components/PageTitle.svelte"
  import PageHead from "$lib/components/PageHead.svelte"
  import { money } from "$lib/format"
  import EmptyState from "$lib/components/EmptyState.svelte"

  let { data } = $props()

  /** The books are kept in base currency — one locale throughout, unlike an invoice. */
  const baseCurrency = $derived(data.tenant?.default_currency ?? "USD")
  const locale = $derived(data.tenant?.default_locale ?? "en-US")

  const assetRows = $derived(
    data.rows.filter((r) => r.account_type === "asset"),
  )
  const liabilityRows = $derived(
    data.rows.filter((r) => r.account_type === "liability"),
  )
  const equityRows = $derived(
    data.rows.filter((r) => r.account_type === "equity"),
  )
</script>

<PageHead title="Balance Sheet" />

<div class="p-4 lg:p-6">
  <PageTitle
    title="Balance Sheet"
    items={[
      { label: "Finance & Accounting", path: "/accounting/balance-sheet" },
      { label: "Balance Sheet", active: true },
    ]}
  />

  <!-- This is the accounting identity itself (assets = liabilities + equity +
       net income), not a report-specific rule — a mismatch here would mean
       the ledger itself doesn't balance, which unbalanced() elsewhere finds
       independently. Shown anyway: a number nobody checks is a claim
       nobody can challenge. -->
  {#if !data.totals.balances}
    <div role="alert" class="alert alert-error mt-4">
      <span class="iconify lucide--triangle-alert size-5"></span>
      <span>
        Assets {money(data.totals.assets, baseCurrency, locale)} do not equal liabilities
        plus equity {money(
          data.totals.total_liabilities_and_equity,
          baseCurrency,
          locale,
        )}.
      </span>
    </div>
  {/if}

  <form method="GET" class="mt-4 flex flex-wrap items-end gap-3">
    <fieldset class="fieldset">
      <legend class="fieldset-legend text-xs">As of</legend>
      <input type="date" name="as_of" class="input" value={data.filters.asOf} />
    </fieldset>
    <button class="btn btn-primary">Apply</button>
    {#if data.filters.asOf}
      <a href="/accounting/balance-sheet" class="btn btn-ghost">Clear</a>
    {/if}
  </form>

  {#if data.rows.length === 0 && data.totals.net_income === "0"}
    <EmptyState icon="lucide--scale" message="No posted activity yet." />
  {:else}
    <div class="card bg-base-100 mt-4 shadow">
      <div class="overflow-x-auto">
        <table class="table">
          <tbody>
            <tr class="bg-base-200/40">
              <th colspan="2">Assets</th>
            </tr>
            {#each assetRows as r (r.account_code)}
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
              <td>Total Assets</td>
              <td class="text-right tabular-nums">
                {money(data.totals.assets, baseCurrency, locale)}
              </td>
            </tr>

            <tr class="bg-base-200/40">
              <th colspan="2">Liabilities</th>
            </tr>
            {#each liabilityRows as r (r.account_code)}
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
              <td>Total Liabilities</td>
              <td class="text-right tabular-nums">
                {money(data.totals.liabilities, baseCurrency, locale)}
              </td>
            </tr>

            <tr class="bg-base-200/40">
              <th colspan="2">Equity</th>
            </tr>
            {#each equityRows as r (r.account_code)}
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
            <tr class="hover:bg-base-200/40">
              <td>
                Current period earnings
                <span class="text-base-content/70 text-xs">
                  (no closing entry has run)
                </span>
              </td>
              <td class="text-right text-sm tabular-nums">
                {money(data.totals.net_income, baseCurrency, locale)}
              </td>
            </tr>
            <tr class="font-medium">
              <td>Total Equity</td>
              <td class="text-right tabular-nums">
                {money(data.totals.total_equity, baseCurrency, locale)}
              </td>
            </tr>
          </tbody>
          <tfoot>
            <tr class="text-base font-semibold">
              <td>Total Liabilities and Equity</td>
              <td class="text-right tabular-nums">
                {money(
                  data.totals.total_liabilities_and_equity,
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
