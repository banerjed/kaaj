<script lang="ts">
  import { enhance } from "$app/forms"
  import { invalidateAll } from "$app/navigation"
  import PageTitle from "$lib/components/PageTitle.svelte"
  import PageHead from "$lib/components/PageHead.svelte"
  import { fieldErrors } from "$lib/form-errors"
  import { money, calendarDate } from "$lib/format"
  import { compareDecimal } from "$lib/decimal"

  let { data, form } = $props()

  const err = $derived(fieldErrors(form))
  const baseCurrency = $derived(data.tenant?.default_currency ?? "USD")
  const locale = $derived(data.tenant?.default_locale ?? "en-US")
</script>

<PageHead title="Year-End Close" />

<div class="p-4 lg:p-6">
  <PageTitle
    title="Year-End Close"
    items={[
      { label: "Finance & Accounting", path: "/accounting/year-end-close" },
      { label: "Year-End Close", active: true },
    ]}
  />

  {#if form?.message}
    <div class="alert alert-error mt-4" role="alert">{form.message}</div>
  {/if}
  {#if form?.closed}
    <div class="alert alert-success mt-4" role="alert">
      Closed as of {calendarDate(form.asOf, locale)}. Revenue and expense
      accounts are zero as of that date; the net result is now in Retained
      Earnings.
    </div>
  {/if}

  <div role="alert" class="alert mt-4">
    <span class="iconify lucide--info size-5"></span>
    <span>
      Posts one journal entry zeroing every revenue and expense account as of
      the chosen date into Retained Earnings. Not gated on any period being
      closed — post this BEFORE closing that period, since a closed period
      refuses new postings, including this one.
    </span>
  </div>

  <form method="GET" class="mt-4 flex flex-wrap items-end gap-3">
    <fieldset class="fieldset">
      <legend class="fieldset-legend text-xs">As of</legend>
      <input type="date" name="as_of" class="input" value={data.asOf} />
    </fieldset>
    <button class="btn btn-primary">Preview</button>
  </form>

  {#if data.preview}
    <div class="card bg-base-100 mt-4 shadow">
      <div class="card-body">
        <h2 class="card-title text-base">
          What closing as of {calendarDate(data.asOf, locale)} would do
        </h2>

        {#if data.preview.lines.length === 0}
          <p class="text-base-content/70 text-sm">
            Every revenue and expense account is already at zero as of this date
            — there is nothing to close.
          </p>
        {:else}
          <div class="overflow-x-auto">
            <table class="table">
              <thead>
                <tr>
                  <th>Account</th>
                  <th>Type</th>
                  <th class="text-right">Amount to zero</th>
                </tr>
              </thead>
              <tbody>
                {#each data.preview.lines as l (l.account_code)}
                  <tr class="hover:bg-base-200/40">
                    <td>
                      <span class="font-mono text-xs">{l.account_code}</span>
                      {l.account_name}
                    </td>
                    <td class="capitalize">{l.account_type}</td>
                    <td class="text-right text-sm tabular-nums">
                      {money(l.net, baseCurrency, locale)}
                    </td>
                  </tr>
                {/each}
              </tbody>
              <tfoot>
                <tr class="text-base font-semibold">
                  <td colspan="2"
                    >Net {compareDecimal(data.preview.netIncome, "0") < 0
                      ? "loss"
                      : "income"} to Retained Earnings</td
                  >
                  <td class="text-right tabular-nums">
                    {money(data.preview.netIncome, baseCurrency, locale)}
                  </td>
                </tr>
              </tfoot>
            </table>
          </div>

          {#if data.mayWrite}
            <form
              method="POST"
              action="?/close"
              use:enhance={() =>
                async ({ update }) => {
                  await update()
                  // A refused close (stale/mismatched confirm) must not leave
                  // the page holding the very figures that were just refused —
                  // `update()` alone only re-runs `load` on success.
                  await invalidateAll()
                }}
              class="mt-4 flex gap-3"
            >
              <input type="hidden" name="as_of" value={data.asOf} />
              <input
                type="hidden"
                name="expected_net_income"
                value={data.preview.netIncome}
              />
              <button
                type="submit"
                class={`btn btn-primary ${err.has("as_of") ? "btn-error" : ""}`}
              >
                Close the year as of {calendarDate(data.asOf, locale)}
              </button>
            </form>
          {/if}
        {/if}
      </div>
    </div>
  {/if}
</div>
