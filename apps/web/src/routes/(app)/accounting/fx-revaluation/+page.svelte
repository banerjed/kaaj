<script lang="ts">
  import PageTitle from "$lib/components/PageTitle.svelte"
  import PageHead from "$lib/components/PageHead.svelte"
  import { money, localeForCurrency } from "$lib/format"
  import EmptyState from "$lib/components/EmptyState.svelte"
  import Pagination from "$lib/components/Pagination.svelte"

  let { data } = $props()

  const tenantLocale = $derived(data.tenant?.default_locale ?? "en-US")
  const localeFor = (c: string) =>
    localeForCurrency(data.locations, c, tenantLocale)
  const usdLocale = $derived(localeFor("USD"))

  /** Each section pages on its own; the other's page is carried along. */
  function pageHref(param: "ar_page" | "ap_page", n: number): string {
    const params = new URLSearchParams()
    if (data.filters.asOf) params.set("as_of", data.filters.asOf)
    const pages = { ar_page: data.arPage, ap_page: data.apPage, [param]: n }
    for (const [k, v] of Object.entries(pages))
      if (v > 1) params.set(k, String(v))
    return `?${params}`
  }

  const sections = $derived([
    {
      title: "Receivables",
      section: data.receivables,
      page: data.arPage,
      param: "ar_page" as const,
    },
    {
      title: "Payables",
      section: data.payables,
      page: data.apPage,
      param: "ap_page" as const,
    },
  ])
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
    <a
      href="/accounting/fx-revaluation/export?as_of={data.filters.asOf}"
      class="btn btn-outline"
    >
      <span class="iconify lucide--download size-4"></span>
      Export CSV
    </a>
  </form>

  {#if data.receivables.total === 0 && data.payables.total === 0}
    <EmptyState
      icon="lucide--arrow-left-right"
      message="No open foreign-currency invoices or bills."
    />
  {:else}
    {#each sections as section (section.title)}
      {#if section.section.total > 0}
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
                {#each section.section.rows as r (r.kind + r.documentNumber)}
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
          <Pagination
            page={section.page}
            pageSize={data.pageSize}
            total={section.section.total}
            hrefFor={(n) => pageHref(section.param, n)}
          />
        </div>
      {/if}
    {/each}
  {/if}
</div>
