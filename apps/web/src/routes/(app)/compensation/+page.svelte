<script lang="ts">
  import PageTitle from "$lib/components/PageTitle.svelte"
  import { calendarDate, localeForCurrency, money } from "$lib/format"
  import PageHead from "$lib/components/PageHead.svelte"
  import EmptyState from "$lib/components/EmptyState.svelte"

  let { data } = $props()

  const tenantLocale = $derived(data.tenant?.default_locale ?? "en-US")

  /** Pay is read in the market it is paid in, and never converted. */
  const localeFor = (c: string) =>
    localeForCurrency(data.locations, c, tenantLocale)
</script>

<PageHead title="Compensation" />

<div class="p-4 lg:p-6">
  <PageTitle
    title="Compensation"
    items={[
      { label: "People & Organization", path: "/compensation" },
      { label: "Compensation", active: true },
    ]}
  />

  <p class="text-base-content/70 mt-2 text-sm">
    {#if data.seesEveryone}
      Current base pay across the firm.
    {:else}
      Your own pay. Everyone else's is visible only to HR and payroll.
    {/if}
  </p>

  {#if data.rows.length === 0}
    <EmptyState
      icon="lucide--wallet"
      message="No pay record is on file for you yet."
    />
  {:else}
    <div class="card bg-base-100 mt-4 shadow">
      <div class="overflow-x-auto">
        <table class="table">
          <thead>
            <tr>
              <th>Person</th>
              <th>Role</th>
              <th>Office</th>
              <th>Basis</th>
              <th class="text-right">Amount</th>
              <th>Effective</th>
            </tr>
          </thead>
          <tbody>
            {#each data.rows as r (r.employee_id)}
              {@const locale = localeFor(r.currency)}
              <tr class="hover:bg-base-200/40">
                <td class="font-medium">
                  <a class="link" href={`/compensation/${r.employee_id}`}>
                    {r.first_name}
                    {r.last_name}
                  </a>
                  {#if r.employee_id === data.myEmployeeId}
                    <span class="badge badge-ghost badge-sm ms-1">you</span>
                  {/if}
                </td>
                <td class="text-sm">{r.job_title ?? "—"}</td>
                <td class="text-base-content/70 text-sm">
                  {r.location_code ?? "—"}
                </td>
                <td class="text-sm capitalize">
                  {r.compensation_type ?? "—"}
                  <span class="text-base-content/70 block text-xs">
                    {r.pay_frequency?.replace(/_/g, " ") ?? ""}
                  </span>
                </td>
                <!-- Exact, never abbreviated: this is what someone is paid,
                     not a figure read for a sense of scale. -->
                <td class="text-right font-medium tabular-nums">
                  {money(r.amount, r.currency, locale)}
                </td>
                <td class="text-sm tabular-nums">
                  {calendarDate(r.effective_from, locale)}
                </td>
              </tr>
            {/each}
          </tbody>
        </table>
      </div>
    </div>
  {/if}
</div>
