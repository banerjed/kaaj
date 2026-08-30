<script lang="ts">
  import PageTitle from "$lib/components/PageTitle.svelte"
  import { calendarDate, money } from "$lib/format"

  let { data } = $props()

  /**
   * A run's figures are shown in the market they belong to — a UK payroll in
   * en-GB, an Indian one in en-IN. Never converted (BR-FP-003).
   */
  const localeFor = (country: string | null) =>
    country === "GB" ? "en-GB" : country === "IN" ? "en-IN" : "en-US"

  const statusClass = (s: string) =>
    s === "paid" || s === "finalized"
      ? "badge-success"
      : s === "approved"
        ? "badge-info"
        : s === "cancelled"
          ? "badge-error"
          : "badge-ghost"
</script>

<svelte:head>
  <title>Pay Runs · Kaaj</title>
</svelte:head>

<div class="p-4 lg:p-6">
  <PageTitle
    title="Pay Runs"
    items={[
      { label: "Payroll", path: "/payroll/runs" },
      { label: "Pay Runs", active: true },
    ]}
  />

  <form method="GET" class="mt-4 flex flex-wrap items-end gap-3">
    <fieldset class="fieldset">
      <legend class="fieldset-legend text-xs">Country</legend>
      <input
        name="country"
        class="input w-24"
        maxlength="2"
        placeholder="US"
        value={data.filters.country}
      />
    </fieldset>
    <fieldset class="fieldset">
      <legend class="fieldset-legend text-xs">Status</legend>
      <select name="status" class="select" value={data.filters.status}>
        <option value="">Any</option>
        {#each data.statuses as s (s)}
          <option value={s} class="capitalize">{s}</option>
        {/each}
      </select>
    </fieldset>
    <button class="btn btn-primary">Apply</button>
    {#if data.filters.country || data.filters.status}
      <a href="/payroll/runs" class="btn btn-ghost">Clear</a>
    {/if}
  </form>

  {#if data.runs.length === 0}
    <div class="card bg-base-100 mt-4 shadow">
      <div class="card-body items-center py-10 text-center">
        <span class="iconify lucide--receipt text-base-content/30 size-8"
        ></span>
        <p class="text-base-content/70 text-sm">No pay runs match that.</p>
      </div>
    </div>
  {:else}
    <div class="card bg-base-100 mt-4 shadow">
      <div class="overflow-x-auto">
        <table class="table">
          <thead>
            <tr>
              <th>Run</th>
              <th>Period</th>
              <th>Pay date</th>
              <th class="text-right">People</th>
              <th class="text-right">Gross</th>
              <th class="text-right">Net</th>
              <th>Prepared / approved</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
            {#each data.runs as r (r.id)}
              {@const locale = localeFor(r.country)}
              <tr class="hover:bg-base-200/40">
                <td class="font-medium">
                  <a class="link" href={`/payroll/runs/${r.id}`}>{r.run_id}</a>
                  <span class="text-base-content/70 block text-xs">
                    {r.country} · {r.run_type?.replace(/_/g, " ")}
                  </span>
                </td>
                <td class="text-sm tabular-nums">
                  {calendarDate(r.pay_period_start, locale)} –
                  {calendarDate(r.pay_period_end, locale)}
                </td>
                <td class="text-sm tabular-nums">
                  {calendarDate(r.pay_date, locale)}
                </td>
                <td class="text-right text-sm tabular-nums">
                  {r.line_count}
                  {#if r.line_count !== r.employee_count}
                    <!-- The header and the lines disagree. Worth showing:
                         a run claiming people it has no line for says it paid
                         someone it cannot name. -->
                    <span
                      class="badge badge-error badge-sm ms-1"
                      title={`Header claims ${r.employee_count}`}
                    >
                      ≠ {r.employee_count}
                    </span>
                  {/if}
                </td>
                <td class="text-right text-sm tabular-nums">
                  {money(r.total_gross_pay, r.currency, locale)}
                </td>
                <td class="text-right text-sm font-medium tabular-nums">
                  {money(r.total_net_pay, r.currency, locale)}
                </td>
                <td class="text-base-content/70 text-xs">
                  {r.calculated_by_name ?? "—"}
                  <span class="block"
                    >→ {r.approved_by_name ?? "not approved"}</span
                  >
                </td>
                <td>
                  <span
                    class={`badge badge-sm capitalize ${statusClass(r.run_status)}`}
                  >
                    {r.run_status}
                  </span>
                </td>
              </tr>
            {/each}
          </tbody>
        </table>
      </div>
    </div>
  {/if}
</div>
