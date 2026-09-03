<script lang="ts">
  import PageTitle from "$lib/components/PageTitle.svelte"
  import { calendarDate, localeForCountry, money } from "$lib/format"
  import { fieldErrors } from "$lib/form-errors"
  import { enhance } from "$app/forms"
  import { closeOnSuccess } from "$lib/form-enhance"
  import PageHead from "$lib/components/PageHead.svelte"
  import StatusBadge from "$lib/components/StatusBadge.svelte"
  import type { Tone } from "$lib/components/status-tone"

  let { data, form } = $props()

  const err = $derived(fieldErrors(form))

  let cancelling = $state(false)

  // Matches the list page's statusTone.
  const statusTone = (s: string): Tone =>
    s === "paid" || s === "finalized"
      ? "positive"
      : s === "approved"
        ? "progress"
        : s === "cancelled"
          ? "critical"
          : "neutral"

  /** What this run may do next — mirrors NEXT in payroll_runs.repo.ts. */
  const may = $derived({
    calculate: data.mayRun && data.run.run_status === "draft",
    approve:
      data.mayApprove &&
      data.run.run_status === "calculated" &&
      // The calculator cannot approve their own run (DB-enforced too).
      data.run.calculated_by_name !== null,
    finalize: data.mayApprove && data.run.run_status === "approved",
    cancel:
      data.mayRun &&
      ["draft", "calculating", "calculated", "approved"].includes(
        data.run.run_status,
      ),
  })

  const tenantLocale = $derived(data.tenant?.default_locale ?? "en-US")
  /** The market the run belongs to. Figures are never converted. */
  const locale = $derived(
    localeForCountry(data.locations, data.run.country, tenantLocale),
  )
  const currency = $derived(data.run.currency)

  /** A breakdown reads best as rows; the values are strings, never parsed. */
  const rows = (doc: Record<string, string> | null) =>
    Object.entries(doc ?? {}).filter(([, v]) => v && Number(v) !== 0)

  const label = (k: string) => k.replace(/_/g, " ")
</script>

<PageHead title={data.run.run_id} />

<div class="p-4 lg:p-6">
  <PageTitle
    title={data.run.run_id ?? "Pay run"}
    items={[
      { label: "Payroll", path: "/payroll/runs" },
      { label: "Pay Runs", path: "/payroll/runs" },
      { label: data.run.run_id ?? "Run", active: true },
    ]}
  />

  {#if form?.moved}
    <div role="status" class="alert alert-success mt-4">
      <span class="iconify lucide--check size-5"></span>
      <span>Run {form.from} → {form.moved}.</span>
    </div>
  {:else if form?.message}
    <div role="alert" class="alert alert-error mt-4">
      <span class="iconify lucide--circle-alert size-5"></span>
      <span>{form.message}</span>
    </div>
  {/if}

  <div class="card bg-base-100 mt-4 shadow">
    <div class="card-body gap-3 p-4">
      <div class="flex flex-wrap items-baseline justify-between gap-2">
        <p class="text-base-content/70 text-sm">
          {data.run.country} · {data.run.run_type?.replace(/_/g, " ")} ·
          {calendarDate(data.run.pay_period_start, locale)} –
          {calendarDate(data.run.pay_period_end, locale)}
        </p>
        <StatusBadge tone={statusTone(data.run.run_status)}>
          {data.run.run_status}
        </StatusBadge>
      </div>

      <!-- Each step is a POST, never a link, and audited in the same transaction. -->
      {#if may.calculate || may.approve || may.finalize || may.cancel}
        <div
          class="border-base-200 flex flex-wrap items-center gap-2 border-t pt-3"
        >
          {#if may.calculate}
            <form method="POST" action="?/calculate">
              <button class="btn btn-primary btn-sm">
                <span class="iconify lucide--calculator size-4"></span>
                Calculate
              </button>
            </form>
          {/if}
          {#if may.approve}
            <form method="POST" action="?/approve">
              <button class="btn btn-primary btn-sm">
                <span class="iconify lucide--check size-4"></span>
                Approve
              </button>
            </form>
          {/if}
          {#if may.finalize}
            <form method="POST" action="?/finalize">
              <button class="btn btn-primary btn-sm">
                <span class="iconify lucide--lock size-4"></span>
                Finalize
              </button>
            </form>
          {/if}
          {#if may.cancel}
            <button
              type="button"
              class="btn btn-ghost btn-sm ms-auto"
              onclick={() => (cancelling = true)}
            >
              Cancel run
            </button>
          {/if}
        </div>
        {#if data.run.calculated_by_name}
          <p class="text-base-content/70 text-xs">
            Calculated by {data.run
              .calculated_by_name}{#if data.run.approved_by_name}, approved by {data
                .run.approved_by_name}{/if}. Whoever calculates a run cannot
            approve it.
          </p>
        {/if}
      {/if}

      <dl class="grid gap-3 sm:grid-cols-4">
        {#each [["Gross", data.run.total_gross_pay], ["Taxes", data.run.total_taxes], ["Deductions", data.run.total_deductions], ["Net", data.run.total_net_pay]] as [k, v] (k)}
          <div>
            <dt class="text-base-content/70 text-xs">{k}</dt>
            <dd class="text-lg font-medium tabular-nums">
              {money(v, currency, locale)}
            </dd>
          </div>
        {/each}
      </dl>

      <!-- Separation of duties is a CHECK constraint; this shows it held. -->
      <p class="text-base-content/70 border-base-200 border-t pt-2 text-xs">
        Prepared by {data.run.calculated_by_name ?? "—"} · approved by {data.run
          .approved_by_name ?? "not yet approved"} · paid {calendarDate(
          data.run.pay_date,
          locale,
        )}
      </p>
    </div>
  </div>

  <h2 class="mt-6 text-base font-medium">
    Payslips
    <span class="badge badge-sm ms-1">{data.lines.length}</span>
  </h2>

  <div class="mt-2 grid gap-3 lg:grid-cols-2">
    {#each data.lines as l (l.id)}
      <div class="card bg-base-100 shadow">
        <div class="card-body gap-3 p-4">
          <div class="flex items-baseline justify-between gap-2">
            <p class="font-medium">{l.employee_name}</p>
            <p class="text-lg font-medium tabular-nums">
              {money(l.net_pay, currency, locale)}
            </p>
          </div>
          <p class="text-base-content/70 -mt-2 text-xs">
            {l.work_country}{l.work_state ? ` · ${l.work_state}` : ""} · net pay
          </p>

          <dl class="grid gap-1 text-sm">
            <div class="flex justify-between">
              <dt class="text-base-content/70">Gross</dt>
              <dd class="tabular-nums">
                {money(l.gross_pay, currency, locale)}
              </dd>
            </div>
            {#each rows(l.earnings) as [k, v] (k)}
              <div class="flex justify-between ps-3">
                <dt class="text-base-content/70 text-xs capitalize">
                  {label(k)}
                </dt>
                <dd class="text-xs tabular-nums">
                  {money(v, currency, locale)}
                </dd>
              </div>
            {/each}

            <!-- Own subtotal — merged with taxes it'd break that total (L46). -->
            <div class="flex justify-between">
              <dt class="text-base-content/70">Taxes</dt>
              <dd class="text-error tabular-nums">
                −{money(l.total_taxes, currency, locale)}
              </dd>
            </div>
            {#each rows(l.taxes) as [k, v] (k)}
              <div class="flex justify-between ps-3">
                <dt class="text-base-content/70 text-xs capitalize">
                  {label(k)}
                </dt>
                <dd class="text-base-content/70 text-xs tabular-nums">
                  −{money(v, currency, locale)}
                </dd>
              </div>
            {/each}

            {#if l.total_deductions && Number(l.total_deductions) !== 0}
              <div class="flex justify-between">
                <dt class="text-base-content/70">Deductions</dt>
                <dd class="text-error tabular-nums">
                  −{money(l.total_deductions, currency, locale)}
                </dd>
              </div>
              {#each rows(l.pretax_deductions) as [k, v] (k)}
                <div class="flex justify-between ps-3">
                  <dt class="text-base-content/70 text-xs capitalize">
                    {label(k)} (pre-tax)
                  </dt>
                  <dd class="text-base-content/70 text-xs tabular-nums">
                    −{money(v, currency, locale)}
                  </dd>
                </div>
              {/each}
              {#each rows(l.posttax_deductions) as [k, v] (k)}
                <div class="flex justify-between ps-3">
                  <dt class="text-base-content/70 text-xs capitalize">
                    {label(k)}
                  </dt>
                  <dd class="text-base-content/70 text-xs tabular-nums">
                    −{money(v, currency, locale)}
                  </dd>
                </div>
              {/each}
            {/if}

            <div
              class="border-base-200 mt-1 flex justify-between border-t pt-2 font-medium"
            >
              <dt>Net pay</dt>
              <dd class="tabular-nums">{money(l.net_pay, currency, locale)}</dd>
            </div>
          </dl>

          {#if l.ytd_gross}
            <p
              class="text-base-content/70 border-base-200 border-t pt-2 text-xs"
            >
              Year to date {money(l.ytd_gross, currency, locale)}
            </p>
          {/if}
        </div>
      </div>
    {/each}
  </div>
</div>

<!-- Cancel a run ---------------------------------------------------------- -->
{#if cancelling}
  <div class="modal modal-open" role="dialog" aria-label="Cancel pay run">
    <div class="modal-box">
      <h3 class="text-lg font-medium">Cancel {data.run.run_id}</h3>
      <p class="text-base-content/70 mt-1 text-sm">
        There is no route back. A cancelled run is corrected by raising another,
        the same way an audit entry is corrected by a new row rather than an
        edit.
      </p>
      <form
        method="POST"
        action="?/cancel"
        class="mt-4 grid gap-4"
        use:enhance={closeOnSuccess(() => (cancelling = false))}
      >
        <fieldset class="fieldset">
          <legend class="fieldset-legend">Why</legend>
          <textarea
            name="reason"
            aria-invalid={err.aria("reason")}
            class={`textarea w-full ${err.textarea("reason")}`}
            rows="2"
            maxlength="500"
            required
            placeholder="Recorded in the audit trail"
          ></textarea>
        </fieldset>
        <div class="modal-action">
          <button
            type="button"
            class="btn btn-ghost"
            onclick={() => (cancelling = false)}>Keep the run</button
          >
          <button type="submit" class="btn btn-error">Cancel run</button>
        </div>
      </form>
    </div>
    <button
      class="modal-backdrop"
      aria-label="Close"
      onclick={() => (cancelling = false)}
    ></button>
  </div>
{/if}
