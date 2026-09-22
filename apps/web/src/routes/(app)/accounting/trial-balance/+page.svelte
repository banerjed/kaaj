<script lang="ts">
  import PageTitle from "$lib/components/PageTitle.svelte"
  import PageHead from "$lib/components/PageHead.svelte"
  import { money, calendarDate } from "$lib/format"
  import EmptyState from "$lib/components/EmptyState.svelte"

  let { data } = $props()

  /** The books are kept in base currency — one locale throughout, unlike an invoice. */
  const baseCurrency = $derived(data.tenant?.default_currency ?? "USD")
  const locale = $derived(data.tenant?.default_locale ?? "en-US")
</script>

<PageHead title="Trial Balance" />

<div class="p-4 lg:p-6">
  <PageTitle
    title="Trial Balance"
    items={[
      { label: "Finance & Accounting", path: "/accounting/trial-balance" },
      { label: "Trial Balance", active: true },
    ]}
  />

  <!-- Structurally guaranteed by double-entry (unbalanced() elsewhere finds
       the same thing per-entry) — shown anyway, since a number nobody
       checks is a claim nobody can challenge. -->
  {#if !data.totals.balances}
    <div role="alert" class="alert alert-error mt-4">
      <span class="iconify lucide--triangle-alert size-5"></span>
      <span>
        The ledger itself does not balance: total debits {money(
          data.totals.debits,
          baseCurrency,
          locale,
        )} against total credits {money(
          data.totals.credits,
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
    <fieldset class="fieldset">
      <legend class="fieldset-legend text-xs">Compare to</legend>
      <input
        type="date"
        name="compare_as_of"
        class="input"
        value={data.filters.compareAsOf}
      />
    </fieldset>
    <button class="btn btn-primary">Apply</button>
    {#if data.filters.asOf || data.filters.compareAsOf}
      <a href="/accounting/trial-balance" class="btn btn-ghost">Clear</a>
    {/if}
    <a
      href="/accounting/trial-balance/export?as_of={data.filters.asOf}"
      class="btn btn-outline"
    >
      <span class="iconify lucide--download size-4"></span>
      Export CSV
    </a>
  </form>

  {#if data.rows.length === 0}
    <EmptyState icon="lucide--scale" message="No posted activity yet." />
  {:else}
    <div class="card bg-base-100 mt-4 shadow">
      <div class="overflow-x-auto">
        <table class="table">
          <thead>
            <tr>
              <th>Account</th>
              <th>Type</th>
              <th class="text-right">Debits</th>
              <th class="text-right">Credits</th>
            </tr>
          </thead>
          <tbody>
            {#each data.rows as r (r.account_code)}
              <tr class="hover:bg-base-200/40">
                <td>
                  <span class="font-mono text-xs">{r.account_code}</span>
                  {r.account_name}
                </td>
                <td class="text-sm capitalize">{r.account_type}</td>
                <td class="text-right text-sm tabular-nums">
                  {money(r.debits, baseCurrency, locale)}
                </td>
                <td class="text-right text-sm tabular-nums">
                  {money(r.credits, baseCurrency, locale)}
                </td>
              </tr>
            {/each}
          </tbody>
          <tfoot>
            <tr class="font-medium">
              <td colspan="2">Total</td>
              <td class="text-right tabular-nums">
                {money(data.totals.debits, baseCurrency, locale)}
              </td>
              <td class="text-right tabular-nums">
                {money(data.totals.credits, baseCurrency, locale)}
              </td>
            </tr>
          </tfoot>
        </table>
      </div>
    </div>
  {/if}

  {#if data.comparison && data.comparisonTotals}
    <div class="card bg-base-100 mt-4 shadow">
      <div class="overflow-x-auto">
        <table class="table">
          <caption class="text-base-content/70 p-4 text-left text-xs">
            {calendarDate(data.filters.asOf, locale)} compared to {calendarDate(
              data.filters.compareAsOf,
              locale,
            )} — two independent points in time, not a period.
          </caption>
          <thead>
            <tr>
              <th>Account</th>
              <th>Type</th>
              <th class="text-right"
                >Debits ({calendarDate(data.filters.asOf, locale)})</th
              >
              <th class="text-right"
                >Credits ({calendarDate(data.filters.asOf, locale)})</th
              >
              <th class="text-right"
                >Debits ({calendarDate(data.filters.compareAsOf, locale)})</th
              >
              <th class="text-right"
                >Credits ({calendarDate(data.filters.compareAsOf, locale)})</th
              >
            </tr>
          </thead>
          <tbody>
            {#each data.comparison as r (r.account_code)}
              <tr class="hover:bg-base-200/40">
                <td>
                  <span class="font-mono text-xs">{r.account_code}</span>
                  {r.account_name}
                </td>
                <td class="text-sm capitalize">{r.account_type}</td>
                <td class="text-right text-sm tabular-nums">
                  {money(r.debits, baseCurrency, locale)}
                </td>
                <td class="text-right text-sm tabular-nums">
                  {money(r.credits, baseCurrency, locale)}
                </td>
                <td class="text-right text-sm tabular-nums">
                  {money(r.compare_debits, baseCurrency, locale)}
                </td>
                <td class="text-right text-sm tabular-nums">
                  {money(r.compare_credits, baseCurrency, locale)}
                </td>
              </tr>
            {/each}
          </tbody>
          <tfoot>
            <tr class="font-medium">
              <td colspan="2">Total</td>
              <td class="text-right tabular-nums">
                {money(data.comparisonTotals.debits, baseCurrency, locale)}
              </td>
              <td class="text-right tabular-nums">
                {money(data.comparisonTotals.credits, baseCurrency, locale)}
              </td>
              <td class="text-right tabular-nums">
                {money(
                  data.comparisonTotals.compare_debits,
                  baseCurrency,
                  locale,
                )}
              </td>
              <td class="text-right tabular-nums">
                {money(
                  data.comparisonTotals.compare_credits,
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

  <h2 class="mt-8 text-lg font-medium">Control account tie-out</h2>
  <p class="text-base-content/70 text-sm">
    Each control account's own ledger balance, against the total it should equal
    in its subledger — always as of today, unaffected by the "As of" filter
    above.
  </p>
  <div class="card bg-base-100 mt-4 shadow">
    <div class="overflow-x-auto">
      <table class="table">
        <thead>
          <tr>
            <th>Control account</th>
            <th class="text-right">GL balance</th>
            <th class="text-right">Subledger total</th>
            <th class="text-right">Difference</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          {#each data.tieOut as t (t.account_code)}
            <tr class="hover:bg-base-200/40">
              <td>
                <span class="font-mono text-xs">{t.account_code}</span>
                {t.label}
              </td>
              <td class="text-right text-sm tabular-nums">
                {money(t.gl_balance, baseCurrency, locale)}
              </td>
              <td class="text-right text-sm tabular-nums">
                {money(t.subledger_total, baseCurrency, locale)}
              </td>
              <td class="text-right text-sm tabular-nums">
                {money(t.difference, baseCurrency, locale)}
              </td>
              <td>
                {#if t.ties_out}
                  <span class="badge badge-success badge-sm">ties out</span>
                {:else}
                  <span class="badge badge-error badge-sm">drift</span>
                {/if}
              </td>
            </tr>
          {/each}
        </tbody>
      </table>
    </div>
  </div>
</div>
