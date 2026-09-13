<script lang="ts">
  import PageTitle from "$lib/components/PageTitle.svelte"
  import PageHead from "$lib/components/PageHead.svelte"
  import { money, calendarDate, localeForCurrency } from "$lib/format"
  import EmptyState from "$lib/components/EmptyState.svelte"

  let { data } = $props()

  const tenantLocale = $derived(data.tenant?.default_locale ?? "en-US")
  /** A bill is read in its own currency, never converted. */
  const localeFor = (c: string) =>
    localeForCurrency(data.locations, c, tenantLocale)
</script>

<PageHead title="AP Due Soon" />

<div class="p-4 lg:p-6">
  <PageTitle
    title="AP Due Soon"
    items={[
      { label: "Finance & Accounting", path: "/accounting/ap-due-soon" },
      { label: "AP Due Soon", active: true },
    ]}
  />

  <form method="GET" class="mt-4 flex flex-wrap items-end gap-3">
    <fieldset class="fieldset">
      <legend class="fieldset-legend text-xs">As of</legend>
      <input type="date" name="as_of" class="input" value={data.filters.asOf} />
    </fieldset>
    <fieldset class="fieldset">
      <legend class="fieldset-legend text-xs">Within</legend>
      <select name="within_days" class="select">
        {#each data.windows as w (w)}
          <option value={w} selected={Number(w) === data.filters.withinDays}>
            {w} days
          </option>
        {/each}
      </select>
    </fieldset>
    <button class="btn btn-primary">Apply</button>
    {#if data.filters.asOf || data.filters.withinDays !== 30}
      <a href="/accounting/ap-due-soon" class="btn btn-ghost">Clear</a>
    {/if}
  </form>

  {#if data.rows.length === 0}
    <EmptyState
      icon="lucide--calendar-clock"
      message="Nothing coming due in that window."
    />
  {:else}
    <div class="card bg-base-100 mt-4 shadow">
      <div class="overflow-x-auto">
        <table class="table">
          <thead>
            <tr>
              <th>Vendor</th>
              <th>Bill</th>
              <th>Due</th>
              <th class="text-right">Days Until Due</th>
              <th class="text-right">Amount Due</th>
            </tr>
          </thead>
          <tbody>
            {#each data.rows as r (r.bill_id)}
              {@const locale = localeFor(r.currency)}
              <tr class="hover:bg-base-200/40">
                <td>{r.vendor_name}</td>
                <td class="font-mono text-xs">{r.bill_number}</td>
                <td>{calendarDate(r.due_date, locale)}</td>
                <td class="text-right tabular-nums">{r.days_until_due}</td>
                <td class="text-right text-sm tabular-nums">
                  {money(r.amount_due, r.currency, locale)}
                </td>
              </tr>
            {/each}
          </tbody>
        </table>
      </div>
      <p class="text-base-content/70 p-4 text-xs">
        Each row is in the bill's own currency and is not summed across
        currencies.
      </p>
    </div>
  {/if}
</div>
