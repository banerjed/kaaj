<script lang="ts">
  import PageTitle from "$lib/components/PageTitle.svelte"
  import { calendarDate, localeForCurrency, money } from "$lib/format"
  import PageHead from "$lib/components/PageHead.svelte"
  import EmptyState from "$lib/components/EmptyState.svelte"

  let { data } = $props()

  const tenantLocale = $derived(data.tenant?.default_locale ?? "en-US")

  /**
   * A payslip is read in the market that issued it, and the figure is never
   * converted (BR-FP-003) — so the locale follows the run's currency, not the
   * viewer's browser.
   */
  const localeFor = (currency: string) =>
    localeForCurrency(data.locations, currency, tenantLocale)

  const rows = (doc: Record<string, string> | null) =>
    Object.entries(doc ?? {}).filter(([, v]) => v && Number(v) !== 0)

  const label = (k: string) => k.replace(/_/g, " ")

  let open = $state<string | null>(null)
</script>

<PageHead title="My Payslips" />

<div class="p-4 lg:p-6">
  <PageTitle
    title="My Payslips"
    items={[
      { label: "Payroll", path: "/payroll/payslips" },
      { label: "My Payslips", active: true },
    ]}
  />

  {#if data.payslips.length === 0}
    <EmptyState
      icon="lucide--receipt"
      message={data.notAnEmployee
        ? "Your account is not linked to an employee record, so there is nothing to show here."
        : "No payslips yet. They appear here once a pay run is finalized."}
    />
  {:else}
    <div class="mt-4 grid gap-3">
      {#each data.payslips as p (p.id)}
        {@const locale = localeFor(p.currency)}
        {@const expanded = open === p.id}
        <div class="card bg-base-100 shadow">
          <div class="card-body gap-0 p-0">
            <button
              type="button"
              class="hover:bg-base-200/40 flex w-full items-center justify-between gap-4 p-4 text-start"
              aria-expanded={expanded}
              onclick={() => (open = expanded ? null : p.id)}
            >
              <div>
                <p class="font-medium">
                  {calendarDate(p.pay_date, locale)}
                </p>
                <p class="text-base-content/70 text-xs">
                  {p.run_id} · {p.work_country}
                </p>
              </div>
              <div class="flex items-center gap-4">
                <div class="text-end">
                  <p class="text-base-content/70 text-xs">Take home</p>
                  <p class="text-lg font-medium tabular-nums">
                    {money(p.net_pay, p.currency, locale)}
                  </p>
                </div>
                <span
                  class={`iconify lucide--chevron-down size-4 transition-transform ${expanded ? "rotate-180" : ""}`}
                ></span>
              </div>
            </button>

            {#if expanded}
              <dl class="border-base-200 grid gap-1 border-t p-4 text-sm">
                <div class="flex justify-between font-medium">
                  <dt>Gross</dt>
                  <dd class="tabular-nums">
                    {money(p.gross_pay, p.currency, locale)}
                  </dd>
                </div>
                {#each rows(p.earnings) as [k, v] (k)}
                  <div class="flex justify-between ps-3">
                    <dt class="text-base-content/70 text-xs capitalize">
                      {label(k)}
                    </dt>
                    <dd class="text-xs tabular-nums">
                      {money(v, p.currency, locale)}
                    </dd>
                  </div>
                {/each}

                <div
                  class="border-base-200 mt-2 flex justify-between border-t pt-2 font-medium"
                >
                  <dt>Taxes</dt>
                  <dd class="text-error tabular-nums">
                    −{money(p.total_taxes, p.currency, locale)}
                  </dd>
                </div>
                {#each rows(p.taxes) as [k, v] (k)}
                  <div class="flex justify-between ps-3">
                    <dt class="text-base-content/70 text-xs capitalize">
                      {label(k)}
                    </dt>
                    <dd class="text-base-content/70 text-xs tabular-nums">
                      −{money(v, p.currency, locale)}
                    </dd>
                  </div>
                {/each}

                <!-- Deductions carry their own subtotal. Listed under the
                     Taxes heading they read as taxes, and the Taxes subtotal
                     then visibly fails to equal its own children (L46). -->
                {#if p.total_deductions && Number(p.total_deductions) !== 0}
                  <div
                    class="border-base-200 mt-2 flex justify-between border-t pt-2 font-medium"
                  >
                    <dt>Deductions</dt>
                    <dd class="text-error tabular-nums">
                      −{money(p.total_deductions, p.currency, locale)}
                    </dd>
                  </div>
                  {#each rows(p.pretax_deductions) as [k, v] (k)}
                    <div class="flex justify-between ps-3">
                      <dt class="text-base-content/70 text-xs capitalize">
                        {label(k)} (pre-tax)
                      </dt>
                      <dd class="text-base-content/70 text-xs tabular-nums">
                        −{money(v, p.currency, locale)}
                      </dd>
                    </div>
                  {/each}
                  {#each rows(p.posttax_deductions) as [k, v] (k)}
                    <div class="flex justify-between ps-3">
                      <dt class="text-base-content/70 text-xs capitalize">
                        {label(k)}
                      </dt>
                      <dd class="text-base-content/70 text-xs tabular-nums">
                        −{money(v, p.currency, locale)}
                      </dd>
                    </div>
                  {/each}
                {/if}

                <div
                  class="border-base-200 mt-2 flex justify-between border-t pt-2 font-medium"
                >
                  <dt>Net pay</dt>
                  <dd class="tabular-nums">
                    {money(p.net_pay, p.currency, locale)}
                  </dd>
                </div>

                {#if p.ytd_gross}
                  <!-- Gross only. There is no ytd_net column, and deriving
                       one by subtracting this slip's deductions would be a
                       guess presented as a figure. -->
                  <p class="text-base-content/70 mt-2 text-xs">
                    Gross year to date: {money(p.ytd_gross, p.currency, locale)}
                  </p>
                {/if}
              </dl>
            {/if}
          </div>
        </div>
      {/each}
    </div>
  {/if}
</div>
