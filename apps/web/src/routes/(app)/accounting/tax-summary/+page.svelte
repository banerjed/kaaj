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

<PageHead title="Tax Summary" />

<div class="p-4 lg:p-6">
  <PageTitle
    title="Tax Summary"
    items={[
      { label: "Finance & Accounting", path: "/accounting/tax-summary" },
      { label: "Tax Summary", active: true },
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
      <a href="/accounting/tax-summary" class="btn btn-ghost">Clear</a>
    {/if}
  </form>

  {#if data.rows.length === 0}
    <EmptyState icon="lucide--receipt" message="No posted tax activity yet." />
  {:else}
    <div class="card bg-base-100 mt-4 shadow">
      <div class="overflow-x-auto">
        <table class="table">
          <thead>
            <tr>
              <th>Jurisdiction</th>
              <th class="text-right">Output tax (collected)</th>
              <th class="text-right">Input tax (paid)</th>
              <th class="text-right">Net liability</th>
            </tr>
          </thead>
          <tbody>
            {#each data.rows as r (r.tax_rate_id ?? "unattributed")}
              <tr class="hover:bg-base-200/40">
                <td>
                  {#if r.tax_rate_id === null}
                    <span class="text-base-content/70 italic"
                      >Unattributed — posted tax with no configured rate</span
                    >
                  {:else}
                    <span class="font-mono text-xs">{r.code}</span>
                    {r.jurisdiction}
                  {/if}
                </td>
                <td class="text-right text-sm tabular-nums">
                  {money(r.output_tax, baseCurrency, locale)}
                </td>
                <td class="text-right text-sm tabular-nums">
                  {money(r.input_tax, baseCurrency, locale)}
                </td>
                <td
                  class="text-right text-sm tabular-nums"
                  class:text-error={Number(r.net_liability) < 0}
                >
                  {money(r.net_liability, baseCurrency, locale)}
                </td>
              </tr>
            {/each}
          </tbody>
        </table>
      </div>
    </div>
    <p class="text-base-content/70 mt-2 text-xs">
      Output tax is what's owed on sales; input tax is what's recoverable on
      purchases. A jurisdiction shows here only once a taxed invoice or bill
      carrying its rate has actually been issued or approved — a draft posts
      nothing.
    </p>
  {/if}
</div>
