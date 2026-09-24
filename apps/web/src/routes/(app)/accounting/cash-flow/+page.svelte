<script lang="ts">
  import PageTitle from "$lib/components/PageTitle.svelte"
  import PageHead from "$lib/components/PageHead.svelte"
  import { money, calendarDate } from "$lib/format"
  import EmptyState from "$lib/components/EmptyState.svelte"

  let { data } = $props()

  /** The books are kept in base currency — one locale throughout, unlike an invoice. */
  const baseCurrency = $derived(data.tenant?.default_currency ?? "USD")
  const locale = $derived(data.tenant?.default_locale ?? "en-US")

  const assetAdjustments = $derived(
    data.rows.filter((r) => r.account_type === "asset"),
  )
  const liabilityAdjustments = $derived(
    data.rows.filter((r) => r.account_type === "liability"),
  )
  const financingAdjustments = $derived(
    data.rows.filter((r) => r.account_type === "equity"),
  )
</script>

<PageHead title="Cash Flow" />

<div class="p-4 lg:p-6">
  <PageTitle
    title="Cash Flow"
    items={[
      { label: "Finance & Accounting", path: "/accounting/cash-flow" },
      { label: "Cash Flow", active: true },
    ]}
  />

  <!-- Same identity as the balance sheet's, viewed from the cash side:
       beginning cash + net change must equal the real Cash-account
       balance. A mismatch means the ledger itself doesn't balance. -->
  {#if !data.totals.reconciles}
    <div role="alert" class="alert alert-error mt-4">
      <span class="iconify lucide--triangle-alert size-5"></span>
      <span>
        Computed ending cash {money(
          data.totals.computed_ending_cash,
          baseCurrency,
          locale,
        )} does not match the actual Cash account balance {money(
          data.totals.ending_cash,
          baseCurrency,
          locale,
        )}.
      </span>
    </div>
  {/if}

  <form method="GET" class="mt-4 flex flex-wrap items-end gap-3">
    <fieldset class="fieldset">
      <legend class="fieldset-legend text-xs">From</legend>
      <input type="date" name="from" class="input" value={data.filters.from} />
    </fieldset>
    <fieldset class="fieldset">
      <legend class="fieldset-legend text-xs">To</legend>
      <input type="date" name="to" class="input" value={data.filters.to} />
    </fieldset>
    <fieldset class="fieldset">
      <legend class="fieldset-legend text-xs">Compare to</legend>
      <select name="compare" class="select">
        <option value="none" selected={data.compare === "none"}>None</option>
        <option
          value="previous_period"
          selected={data.compare === "previous_period"}
        >
          Previous period
        </option>
        <option
          value="previous_year"
          selected={data.compare === "previous_year"}
        >
          Same period last year
        </option>
      </select>
    </fieldset>
    <button class="btn btn-primary">Apply</button>
    {#if data.filters.from || data.filters.to || data.compare !== "none"}
      <a href="/accounting/cash-flow" class="btn btn-ghost">Clear</a>
    {/if}
    <a
      href="/accounting/cash-flow/export?from={data.filters.from}&to={data
        .filters.to}&compare={data.compare}"
      class="btn btn-outline"
    >
      <span class="iconify lucide--download size-4"></span>
      Export CSV
    </a>
  </form>

  {#if data.rows.length === 0 && data.totals.net_income === "0"}
    <EmptyState icon="lucide--waves" message="No posted activity yet." />
  {:else}
    <div class="card bg-base-100 mt-4 shadow">
      <div class="overflow-x-auto">
        <table class="table">
          <tbody>
            <tr class="bg-base-200/40">
              <th colspan="2">Operating Activities</th>
            </tr>
            <tr class="hover:bg-base-200/40">
              <td>Net Income</td>
              <td class="text-right text-sm tabular-nums">
                {money(data.totals.net_income, baseCurrency, locale)}
              </td>
            </tr>
            {#each assetAdjustments as r (r.account_code)}
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
            {#each liabilityAdjustments as r (r.account_code)}
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
              <td>Net Cash from Operating Activities</td>
              <td class="text-right tabular-nums">
                {money(data.totals.operating_cash_flow, baseCurrency, locale)}
              </td>
            </tr>

            <tr class="bg-base-200/40">
              <th colspan="2">Investing Activities</th>
            </tr>
            <tr class="hover:bg-base-200/40">
              <td>
                <span class="text-base-content/70 text-xs">
                  No fixed-asset or investment accounts exist in this chart of
                  accounts
                </span>
              </td>
              <td class="text-right text-sm tabular-nums">
                {money(data.totals.investing_cash_flow, baseCurrency, locale)}
              </td>
            </tr>
            <tr class="font-medium">
              <td>Net Cash from Investing Activities</td>
              <td class="text-right tabular-nums">
                {money(data.totals.investing_cash_flow, baseCurrency, locale)}
              </td>
            </tr>

            <tr class="bg-base-200/40">
              <th colspan="2">Financing Activities</th>
            </tr>
            {#each financingAdjustments as r (r.account_code)}
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
              <td>Net Cash from Financing Activities</td>
              <td class="text-right tabular-nums">
                {money(data.totals.financing_cash_flow, baseCurrency, locale)}
              </td>
            </tr>
          </tbody>
          <tfoot>
            <tr>
              <td>Beginning Cash</td>
              <td class="text-right tabular-nums">
                {money(data.totals.beginning_cash, baseCurrency, locale)}
              </td>
            </tr>
            <tr>
              <td>Net Change in Cash</td>
              <td class="text-right tabular-nums">
                {money(data.totals.net_change_in_cash, baseCurrency, locale)}
              </td>
            </tr>
            <tr class="text-base font-semibold">
              <td>Ending Cash</td>
              <td class="text-right tabular-nums">
                {money(data.totals.ending_cash, baseCurrency, locale)}
              </td>
            </tr>
          </tfoot>
        </table>
      </div>
    </div>
  {/if}

  {#if data.comparison}
    <div class="card bg-base-100 mt-4 shadow">
      <div class="overflow-x-auto">
        <table class="table">
          <caption class="text-base-content/70 p-4 text-left text-xs">
            Prior period: {calendarDate(data.comparison.prior_from, locale)} to
            {calendarDate(data.comparison.prior_to, locale)}
            {#if data.compare === "previous_year"}
              — the same dates one year earlier.
            {:else}
              — an equal-length window immediately before the current period;
              not necessarily a full calendar month.
            {/if}
          </caption>
          <thead>
            <tr>
              <th></th>
              <th class="text-right">Current</th>
              <th class="text-right">Prior</th>
              <th class="text-right">Change</th>
            </tr>
          </thead>
          <tbody>
            <tr class="hover:bg-base-200/40">
              <td>Net Cash from Operating Activities</td>
              <td class="text-right text-sm tabular-nums">
                {money(
                  data.comparison.current_operating_cash_flow,
                  baseCurrency,
                  locale,
                )}
              </td>
              <td class="text-right text-sm tabular-nums">
                {money(
                  data.comparison.prior_operating_cash_flow,
                  baseCurrency,
                  locale,
                )}
              </td>
              <td class="text-right text-sm tabular-nums">
                {money(
                  data.comparison.operating_cash_flow_change,
                  baseCurrency,
                  locale,
                )}
              </td>
            </tr>
            <tr class="hover:bg-base-200/40">
              <td>Net Cash from Financing Activities</td>
              <td class="text-right text-sm tabular-nums">
                {money(
                  data.comparison.current_financing_cash_flow,
                  baseCurrency,
                  locale,
                )}
              </td>
              <td class="text-right text-sm tabular-nums">
                {money(
                  data.comparison.prior_financing_cash_flow,
                  baseCurrency,
                  locale,
                )}
              </td>
              <td class="text-right text-sm tabular-nums">
                {money(
                  data.comparison.financing_cash_flow_change,
                  baseCurrency,
                  locale,
                )}
              </td>
            </tr>
          </tbody>
          <tfoot>
            <tr class="text-base font-semibold">
              <td>Net Change in Cash</td>
              <td class="text-right tabular-nums">
                {money(
                  data.comparison.current_net_change_in_cash,
                  baseCurrency,
                  locale,
                )}
              </td>
              <td class="text-right tabular-nums">
                {money(
                  data.comparison.prior_net_change_in_cash,
                  baseCurrency,
                  locale,
                )}
              </td>
              <td class="text-right tabular-nums">
                {money(
                  data.comparison.net_change_in_cash_change,
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
