<script lang="ts">
  import { enhance } from "$app/forms"
  import PageTitle from "$lib/components/PageTitle.svelte"
  import PageHead from "$lib/components/PageHead.svelte"
  import { calendarDate } from "$lib/format"

  let { data, form } = $props()

  const locale = $derived(data.tenant?.default_locale ?? "en-US")
  let refreshing = $state(false)
</script>

<PageHead title="Exchange Rates" />

<div class="p-4 lg:p-6">
  <PageTitle
    title="Exchange Rates"
    items={[
      { label: "Finance & Accounting", path: "/accounting/exchange-rates" },
      { label: "Exchange Rates", active: true },
    ]}
  />

  {#if form?.message}
    <div class="alert alert-error mt-4" role="alert">{form.message}</div>
  {/if}

  {#if form?.refreshed}
    <div class="alert alert-success mt-4" role="status">
      Refreshed {form.refreshed.map((r) => r.currency).join(", ") || "nothing"}.
      {#if form.failed?.length}
        Could not reach Yahoo for {form.failed
          .map((f) => f.currency)
          .join(", ")}.
      {/if}
    </div>
  {/if}

  {#if data.mayWrite}
    <form
      method="POST"
      action="?/refresh"
      class="mt-4"
      use:enhance={() => {
        refreshing = true
        return async ({ update }) => {
          await update()
          refreshing = false
        }
      }}
    >
      <button class="btn btn-primary" disabled={refreshing}>
        {#if refreshing}
          <span class="loading loading-spinner loading-sm"></span>
        {/if}
        Refresh from Yahoo
      </button>
      <p class="text-base-content/70 mt-1 text-xs">
        Pulls today's rate for USD, CAD, GBP, EUR and INR. Rates are shared
        across every tenant — this isn't a per-firm setting.
      </p>
    </form>
  {/if}

  {#if data.rates.length === 0}
    <p class="text-base-content/70 mt-4 text-sm">No rates on file yet.</p>
  {:else}
    <div class="card bg-base-100 mt-4 shadow">
      <div class="overflow-x-auto">
        <table class="table">
          <thead>
            <tr>
              <th>Pair</th>
              <th class="text-right">Rate</th>
              <th class="text-right">Inverse</th>
              <th>As of</th>
              <th>Source</th>
            </tr>
          </thead>
          <tbody>
            {#each data.rates as r (`${r.from_currency}-${r.to_currency}`)}
              <tr class="hover:bg-base-200/40">
                <td class="font-mono text-xs"
                  >{r.from_currency} / {r.to_currency}</td
                >
                <td class="text-right text-sm tabular-nums">{r.rate}</td>
                <td class="text-right text-sm tabular-nums">{r.inverse_rate}</td
                >
                <td>{calendarDate(r.rate_date, locale)}</td>
                <td>
                  <span class="badge badge-ghost badge-sm">{r.source}</span>
                </td>
              </tr>
            {/each}
          </tbody>
        </table>
      </div>
    </div>
  {/if}
</div>
