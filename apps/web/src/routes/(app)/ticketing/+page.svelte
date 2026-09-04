<script lang="ts">
  import PageTitle from "$lib/components/PageTitle.svelte"
  import { instant } from "$lib/format"
  import StatusBadge from "$lib/components/StatusBadge.svelte"
  import { ticketStatusTone as statusTone } from "$lib/components/status-tone"
  import PageHead from "$lib/components/PageHead.svelte"
  import EmptyState from "$lib/components/EmptyState.svelte"

  let { data } = $props()

  const tenantLocale = $derived(data.tenant?.default_locale ?? "en-US")
  // No single office owns a ticket, so this falls back to the tenant's own
  // zone — same choice the banking page makes for last_synced_at.
  const tenantZone = $derived(data.tenant?.default_timezone ?? "UTC")
</script>

<PageHead title="Ticketing" />

<div class="p-4 lg:p-6">
  <PageTitle
    title="Ticketing"
    items={[
      { label: "Support & Services", path: "/ticketing" },
      { label: "Ticketing", active: true },
    ]}
  />

  <form method="GET" class="mt-4 flex flex-wrap items-end gap-3">
    <fieldset class="fieldset">
      <legend class="fieldset-legend text-xs">Business area</legend>
      <select
        name="business_area"
        class="select"
        value={data.filters.businessAreaId}
      >
        <option value="">All areas</option>
        {#each data.businessAreas as ba (ba.id)}
          <option value={ba.id}>{ba.name}</option>
        {/each}
      </select>
    </fieldset>
    <fieldset class="fieldset">
      <legend class="fieldset-legend text-xs">Status</legend>
      <select name="status" class="select" value={data.filters.status}>
        <option value="">Any</option>
        {#each data.statuses as s (s)}
          <option value={s} class="capitalize">{s.replace(/_/g, " ")}</option>
        {/each}
      </select>
    </fieldset>
    <button class="btn btn-primary">Apply</button>
    {#if data.filters.status || data.filters.businessAreaId}
      <a href="/ticketing" class="btn btn-ghost">Clear</a>
    {/if}
    <p class="text-base-content/70 ms-auto text-xs">
      {data.readsAll
        ? "Showing every ticket"
        : "Showing tickets raised by or assigned to you"}
    </p>
  </form>

  {#if data.tickets.length === 0}
    <EmptyState
      icon="lucide--life-buoy"
      class="mt-4"
      message="Nothing matches that."
    />
  {:else}
    <div class="card bg-base-100 mt-2 shadow">
      <div class="overflow-x-auto">
        <table class="table">
          <thead>
            <tr>
              <th>Ticket</th>
              <th>Area</th>
              <th>Reported by</th>
              <th>Logged</th>
              <th>State</th>
            </tr>
          </thead>
          <tbody>
            {#each data.tickets as t (t.id)}
              <tr class="hover:bg-base-200/40">
                <td class="text-sm">
                  <a
                    href="/ticketing/{t.id}"
                    class="link link-hover font-medium">{t.ticket_number}</a
                  >
                  <span class="text-base-content/70 block text-xs"
                    >{t.title}</span
                  >
                </td>
                <td class="text-base-content/70 text-xs"
                  >{t.business_area_name ?? "—"}</td
                >
                <td class="text-sm">
                  {t.reported_by_name ?? "—"}
                  {#if t.is_portal}
                    <span class="badge badge-ghost badge-sm ms-1"
                      >{t.customer_name}</span
                    >
                  {/if}
                </td>
                <td class="text-sm tabular-nums">
                  {instant(t.logged_at, {
                    locale: tenantLocale,
                    currency: "USD",
                    timezone: tenantZone,
                    timeFormat: data.tenant?.time_format,
                  })}
                </td>
                <td>
                  <StatusBadge tone={statusTone(t.status)}>
                    {t.status.replace(/_/g, " ")}
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
