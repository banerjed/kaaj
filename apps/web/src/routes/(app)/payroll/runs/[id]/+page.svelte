<script lang="ts">
  import PageTitle from "$lib/components/PageTitle.svelte"
  import { calendarDate, money } from "$lib/format"

  let { data } = $props()

  /** The market the run belongs to. Figures are never converted. */
  const locale = $derived(
    data.run.country === "GB"
      ? "en-GB"
      : data.run.country === "IN"
        ? "en-IN"
        : "en-US",
  )
  const currency = $derived(data.run.currency)

  /** A breakdown reads best as rows; the values are strings, never parsed. */
  const rows = (doc: Record<string, string> | null) =>
    Object.entries(doc ?? {}).filter(([, v]) => v && Number(v) !== 0)

  const label = (k: string) => k.replace(/_/g, " ")
</script>

<svelte:head>
  <title>{data.run.run_id} · Kaaj</title>
</svelte:head>

<div class="p-4 lg:p-6">
  <PageTitle
    title={data.run.run_id ?? "Pay run"}
    items={[
      { label: "Payroll", path: "/payroll/runs" },
      { label: "Pay Runs", path: "/payroll/runs" },
      { label: data.run.run_id ?? "Run", active: true },
    ]}
  />

  <div class="card bg-base-100 mt-4 shadow">
    <div class="card-body gap-3 p-4">
      <div class="flex flex-wrap items-baseline justify-between gap-2">
        <p class="text-base-content/70 text-sm">
          {data.run.country} · {data.run.run_type?.replace(/_/g, " ")} ·
          {calendarDate(data.run.pay_period_start, locale)} –
          {calendarDate(data.run.pay_period_end, locale)}
        </p>
        <span class="badge badge-sm capitalize">{data.run.run_status}</span>
      </div>

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

      <!-- Who did what. Separation of duties is enforced by a CHECK; showing
           it is how a person can see that it held. -->
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

            <!-- Taxes and deductions each carry their own subtotal. Run
                 together under one heading, a pension deduction reads as a tax
                 and the tax subtotal visibly fails to equal its own children
                 (L46). -->
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
