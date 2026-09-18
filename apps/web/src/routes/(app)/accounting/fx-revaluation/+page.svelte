<script lang="ts">
  import PageTitle from "$lib/components/PageTitle.svelte"
  import PageHead from "$lib/components/PageHead.svelte"
  import { money, localeForCurrency } from "$lib/format"
  import EmptyState from "$lib/components/EmptyState.svelte"

  let { data } = $props()

  const tenantLocale = $derived(data.tenant?.default_locale ?? "en-US")
  const localeFor = (c: string) =>
    localeForCurrency(data.locations, c, tenantLocale)
  const usdLocale = $derived(localeFor("USD"))

  const receivables = $derived(data.rows.filter((r) => r.kind === "receivable"))
  const payables = $derived(data.rows.filter((r) => r.kind === "payable"))
</script>

<PageHead title="FX Revaluation" />

<div class="p-4 lg:p-6">
  <PageTitle
    title="FX Revaluation"
    items={[
      { label: "Finance & Accounting", path: "/accounting/fx-revaluation" },
      { label: "FX Revaluation", active: true },
    ]}
  />

  <p class="text-base-content/70 mt-1 max-w-3xl text-sm">
    Unrealized gain or loss on open foreign-currency invoices and bills, had
    they settled at the rate below instead of the rate they were booked at. This
    report changes nothing on the ledger — nothing here is posted.
  </p>

  <form method="GET" class="mt-4 flex flex-wrap items-end gap-3">
    <fieldset class="fieldset">
      <legend class="fieldset-legend text-xs">As of</legend>
      <input type="date" name="as_of" class="input" value={data.filters.asOf} />
    </fieldset>
    <button class="btn btn-primary">Apply</button>
    {#if data.filters.asOf}
      <a href="/accounting/fx-revaluation" class="btn btn-ghost">Clear</a>
    {/if}
  </form>

  {#if data.rows.length === 0}
    <EmptyState
      icon="lucide--arrow-left-right"
      message="No open foreign-currency invoices or bills."
    />
  {:else}
    {#each [{ title: "Receivables", rows: receivables }, { title: "Payables", rows: payables }] as section (section.title)}
      {#if section.rows.length > 0}
        <div class="card bg-base-100 mt-4 shadow">
          <div class="card-body pb-2">
            <h2 class="card-title text-base">{section.title}</h2>
          </div>
          <div class="overflow-x-auto">
            <table class="table">
              <thead>
                <tr>
                  <th>Document</th>
                  <th
                    >{section.title === "Receivables"
                      ? "Customer"
                      : "Vendor"}</th
                  >
                  <th class="text-right">Amount Due</th>
                  <th class="text-right">Booked Rate</th>
                  <th class="text-right">As-of Rate</th>
                  <th class="text-right">Booked (USD)</th>
                  <th class="text-right">Revalued (USD)</th>
                  <th class="text-right">Unrealized Gain/Loss</th>
                </tr>
              </thead>
              <tbody>
                {#each section.rows as r (r.kind + r.documentNumber)}
                  {@const locale = localeFor(r.currency)}
                  <tr class="hover:bg-base-200/40">
                    <td>{r.documentNumber}</td>
                    <td>
                      {r.partyName ?? "—"}
                      <span class="text-base-content/70 text-xs"
                        >{r.currency}</span
                      >
                    </td>
                    <td class="text-right text-sm tabular-nums">
                      {money(r.amountDue, r.currency, locale)}
                    </td>
                    <td class="text-right text-sm tabular-nums">
                      {r.bookedRate}
                    </td>
                    <td class="text-right text-sm tabular-nums">
                      {r.asOfRate ?? "no rate on file"}
                    </td>
                    <td class="text-right text-sm tabular-nums">
                      {money(r.bookedBase, "USD", usdLocale)}
                    </td>
                    <td class="text-right text-sm tabular-nums">
                      {money(r.revaluedBase, "USD", usdLocale)}
                    </td>
                    <td
                      class="text-right text-sm font-medium tabular-nums"
                      class:text-success={Number(r.unrealizedGainLoss) > 0}
                      class:text-error={Number(r.unrealizedGainLoss) < 0}
                    >
                      {money(r.unrealizedGainLoss, "USD", usdLocale)}
                    </td>
                  </tr>
                {/each}
              </tbody>
            </table>
          </div>
        </div>
      {/if}
    {/each}
  {/if}
</div>
