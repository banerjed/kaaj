<script lang="ts">
  import PageTitle from "$lib/components/PageTitle.svelte"
  import { calendarDate, money } from "$lib/format"
  import { fieldErrors } from "$lib/form-errors"
  import { enhance } from "$app/forms"
  import { closeOnSuccess } from "$lib/form-enhance"
  import StatusBadge from "$lib/components/StatusBadge.svelte"
  import type { Tone } from "$lib/components/status-tone"
  import PageHead from "$lib/components/PageHead.svelte"
  import EmptyState from "$lib/components/EmptyState.svelte"

  let { data, form } = $props()

  // Which field to put the highlight on. The action names them in
  // `errorFields`; colour alone is not enough, so `aria-invalid` goes with it.
  const err = $derived(fieldErrors(form))

  let opening = $state(false)

  /**
   * A run's figures are shown in the market they belong to — a UK payroll in
   * en-GB, an Indian one in en-IN. Never converted (BR-FP-003).
   */
  const localeFor = (country: string | null) =>
    country === "GB" ? "en-GB" : country === "IN" ? "en-IN" : "en-US"

  const statusTone = (s: string): Tone =>
    s === "paid" || s === "finalized"
      ? "positive"
      : s === "approved"
        ? "progress"
        : s === "cancelled"
          ? "critical"
          : "neutral"
</script>

<PageHead title="Pay Runs" />

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
    {#if data.mayOpen}
      <button
        type="button"
        class="btn btn-outline ms-auto"
        onclick={() => (opening = true)}
      >
        <span class="iconify lucide--plus size-4"></span>
        Open a run
      </button>
    {/if}
  </form>

  {#if form?.opened}
    <div role="status" class="alert alert-success mt-4">
      <span class="iconify lucide--check size-5"></span>
      <span>
        {form.opened} opened as a draft. It has no payslips in it yet.
      </span>
    </div>
  {:else if form?.message}
    <div role="alert" class="alert alert-error mt-4">
      <span class="iconify lucide--circle-alert size-5"></span>
      <span>{form.message}</span>
    </div>
  {/if}

  {#if data.runs.length === 0}
    <EmptyState icon="lucide--receipt" message="No pay runs match that." />
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
                  <StatusBadge tone={statusTone(r.run_status)}>
                    {r.run_status}
                  </StatusBadge>
                </td>
              </tr>
            {/each}
          </tbody>
        </table>
      </div>
    </div>
  {/if}
</div>

<!-- Open a run ------------------------------------------------------------
     The header only. Lines are per-person pay, and computing those needs
     per-jurisdiction tax tables this database does not have — inventing them
     would put a correct-LOOKING number on a payslip. -->
{#if opening}
  <div class="modal modal-open" role="dialog" aria-label="Open a pay run">
    <div class="modal-box max-w-2xl">
      <h3 class="text-lg font-medium">Open a pay run</h3>
      <p class="text-base-content/70 mt-1 text-sm">
        Opens the period as a draft. The run number is derived from the period
        and the country, and a second run for the same pair is refused — two
        runs for one period is how somebody gets paid twice.
      </p>

      <form
        method="POST"
        action="?/openRun"
        class="mt-4 grid gap-4 sm:grid-cols-2"
        use:enhance={closeOnSuccess(() => (opening = false))}
      >
        <fieldset class="fieldset">
          <legend class="fieldset-legend">Period starts</legend>
          <input
            name="pay_period_start"
            aria-invalid={err.aria("pay_period_start")}
            type="date"
            class={`input w-full ${err.input("pay_period_start")}`}
            required
          />
        </fieldset>

        <fieldset class="fieldset">
          <legend class="fieldset-legend">Period ends</legend>
          <input
            name="pay_period_end"
            aria-invalid={err.aria("pay_period_end")}
            type="date"
            class={`input w-full ${err.input("pay_period_end")}`}
            required
          />
        </fieldset>

        <fieldset class="fieldset">
          <legend class="fieldset-legend">Pay date</legend>
          <input
            name="pay_date"
            aria-invalid={err.aria("pay_date")}
            type="date"
            class={`input w-full ${err.input("pay_date")}`}
            required
          />
        </fieldset>

        <fieldset class="fieldset">
          <legend class="fieldset-legend">Country</legend>
          <input
            name="country"
            aria-invalid={err.aria("country")}
            class={`input w-full uppercase ${err.input("country")}`}
            maxlength="2"
            placeholder="US"
            required
          />
        </fieldset>

        <fieldset class="fieldset">
          <legend class="fieldset-legend">Currency</legend>
          <input
            name="currency"
            aria-invalid={err.aria("currency")}
            class={`input w-full uppercase ${err.input("currency")}`}
            maxlength="3"
            value="USD"
            required
          />
        </fieldset>

        <fieldset class="fieldset">
          <legend class="fieldset-legend">Type</legend>
          <select
            name="run_type"
            aria-invalid={err.aria("run_type")}
            class={`select w-full ${err.select("run_type")}`}
            required
          >
            {#each data.runTypes as t (t)}
              <option value={t} class="capitalize"
                >{t.replace(/_/g, " ")}</option
              >
            {/each}
          </select>
        </fieldset>

        <fieldset class="fieldset sm:col-span-2">
          <legend class="fieldset-legend">Pay schedule</legend>
          <select
            name="pay_schedule_id"
            aria-invalid={err.aria("pay_schedule_id")}
            class={`select w-full ${err.select("pay_schedule_id")}`}
          >
            <option value="">None</option>
            {#each data.schedules as sc (sc.id)}
              <option value={sc.id}>{sc.name} · {sc.currency}</option>
            {/each}
          </select>
        </fieldset>

        <div class="modal-action sm:col-span-2">
          <button
            type="button"
            class="btn btn-ghost"
            onclick={() => (opening = false)}>Cancel</button
          >
          <button type="submit" class="btn btn-primary">Open run</button>
        </div>
      </form>
    </div>
    <button
      class="modal-backdrop"
      aria-label="Close"
      onclick={() => (opening = false)}
    ></button>
  </div>
{/if}
