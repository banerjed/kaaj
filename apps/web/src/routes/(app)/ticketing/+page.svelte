<script lang="ts">
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

  // Seeded from the URL on each navigation (a GET filter submit), not just
  // once — an `$effect`, not the initializer, since `$state(data...)` only
  // ever captures the value at first mount.
  let businessAreaId = $state("")
  let categoryId = $state("")
  $effect(() => {
    businessAreaId = data.filters.businessAreaId
    categoryId = data.filters.categoryId
  })
  const categories = $derived(
    businessAreaId
      ? (data.categoriesByArea[businessAreaId]?.categories ?? [])
      : Object.values(data.categoriesByArea).flatMap((c) => c.categories),
  )
  const subcategories = $derived(
    categoryId
      ? Object.values(data.categoriesByArea).flatMap((c) =>
          c.subcategories.filter((s) => s.category_id === categoryId),
        )
      : [],
  )

  const hasFilters = $derived(Object.values(data.filters).some((v) => v !== ""))

  const totalPages = $derived(
    Math.max(1, Math.ceil(data.total / data.pageSize)),
  )
  const rangeStart = $derived(
    data.total === 0 ? 0 : (data.page - 1) * data.pageSize + 1,
  )
  const rangeEnd = $derived(Math.min(data.total, data.page * data.pageSize))

  // Built from `data.filters` rather than `window.location` — this renders
  // during SSR too, where `window` doesn't exist.
  function pageUrl(page: number): string {
    const params = new URLSearchParams({
      business_area: data.filters.businessAreaId,
      category: data.filters.categoryId,
      subcategory: data.filters.subcategoryId,
      status: data.filters.status,
      logger: data.filters.loggerId,
      assignee: data.filters.assigneeId,
      subscriber: data.filters.subscriberId,
      q: data.filters.search,
    })
    for (const [k, v] of [...params]) if (v === "") params.delete(k)
    params.set("page", String(page))
    return `?${params.toString()}`
  }
</script>

<PageHead title="Ticketing" />

<div class="p-4 lg:p-6">
  <div class="flex items-center justify-between">
    <!-- The only heading on the page (L64) — the breadcrumb above it was
         dropped to simplify the page, same as the other ticketing pages. -->
    <h1 class="text-lg font-semibold">Ticketing</h1>
    <a href="/ticketing/new" class="btn btn-primary btn-sm gap-1">
      <span class="iconify lucide--plus size-4"></span>
      New ticket
    </a>
  </div>

  <form method="GET" class="mt-4 flex flex-wrap items-end gap-3">
    <fieldset class="fieldset w-48">
      <legend class="fieldset-legend text-xs">Business area</legend>
      <select
        name="business_area"
        class="select select-sm w-full"
        bind:value={businessAreaId}
        onchange={() => (categoryId = "")}
      >
        <option value="">All areas</option>
        {#each data.businessAreas as ba (ba.id)}
          <option value={ba.id}>{ba.name}</option>
        {/each}
      </select>
    </fieldset>
    <fieldset class="fieldset w-48">
      <legend class="fieldset-legend text-xs">Category</legend>
      <select
        name="category"
        class="select select-sm w-full"
        bind:value={categoryId}
      >
        <option value="">Any</option>
        {#each categories as c (c.id)}
          <option value={c.id}>{c.name}</option>
        {/each}
      </select>
    </fieldset>
    <fieldset class="fieldset w-48">
      <legend class="fieldset-legend text-xs">Subcategory</legend>
      <select
        name="subcategory"
        class="select select-sm w-full"
        value={data.filters.subcategoryId}
        disabled={subcategories.length === 0}
      >
        <option value="">Any</option>
        {#each subcategories as s (s.id)}
          <option value={s.id}>{s.name}</option>
        {/each}
      </select>
    </fieldset>
    <fieldset class="fieldset w-40">
      <legend class="fieldset-legend text-xs">Status</legend>
      <select
        name="status"
        class="select select-sm w-full"
        value={data.filters.status}
      >
        <option value="">Any</option>
        {#each data.statuses as s (s)}
          <option value={s} class="capitalize">{s.replace(/_/g, " ")}</option>
        {/each}
      </select>
    </fieldset>
    <fieldset class="fieldset w-48">
      <legend class="fieldset-legend text-xs">Logger</legend>
      <select
        name="logger"
        class="select select-sm w-full"
        value={data.filters.loggerId}
      >
        <option value="">Anyone</option>
        {#each data.people as p (p.id)}
          <option value={p.id}>{p.name}</option>
        {/each}
      </select>
    </fieldset>
    <fieldset class="fieldset w-48">
      <legend class="fieldset-legend text-xs">Assignee</legend>
      <select
        name="assignee"
        class="select select-sm w-full"
        value={data.filters.assigneeId}
      >
        <option value="">Anyone</option>
        {#each data.people as p (p.id)}
          <option value={p.id}>{p.name}</option>
        {/each}
      </select>
    </fieldset>
    <fieldset class="fieldset w-48">
      <legend class="fieldset-legend text-xs">Subscriber</legend>
      <select
        name="subscriber"
        class="select select-sm w-full"
        value={data.filters.subscriberId}
      >
        <option value="">Anyone</option>
        {#each data.people as p (p.id)}
          <option value={p.id}>{p.name}</option>
        {/each}
      </select>
    </fieldset>
    <fieldset class="fieldset w-56">
      <legend class="fieldset-legend text-xs">Search</legend>
      <input
        name="q"
        class="input input-sm w-full"
        placeholder="Subject…"
        value={data.filters.search}
      />
    </fieldset>
    <button class="btn btn-primary btn-sm">Apply</button>
    {#if hasFilters}
      <a href="/ticketing" class="btn btn-ghost btn-sm">Clear</a>
    {/if}
    <p class="text-base-content/70 text-xs">
      {data.readsAll
        ? "Showing every ticket"
        : "Showing tickets raised by, assigned to, or subscribed to by you"}
    </p>
  </form>

  {#if !data.hasFilters}
    <EmptyState
      icon="lucide--filter"
      class="mt-4"
      message="Choose a filter above to find tickets — there are too many to list by default."
    />
  {:else if data.tickets.length === 0}
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
              <th>Area / Category</th>
              <th>Logger</th>
              <th>Assignees</th>
              <th>Logged</th>
              <th>Due</th>
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
                <td class="text-base-content/70 text-xs">
                  {t.business_area_name ?? "—"}
                  <span class="block"
                    >{t.category_name}{t.subcategory_name
                      ? ` / ${t.subcategory_name}`
                      : ""}</span
                  >
                </td>
                <td class="text-sm">
                  {t.reported_by_name ?? "—"}
                  {#if t.is_portal}
                    <span class="badge badge-ghost badge-sm ms-1"
                      >{t.customer_name}</span
                    >
                  {/if}
                </td>
                <td class="text-sm tabular-nums">{t.assignee_count}</td>
                <td class="text-sm tabular-nums">
                  {instant(t.logged_at, {
                    locale: tenantLocale,
                    currency: "USD",
                    timezone: tenantZone,
                    timeFormat: data.tenant?.time_format,
                  })}
                </td>
                <td class="text-sm tabular-nums">{t.due_date ?? "—"}</td>
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
      <div
        class="border-base-200 flex items-center justify-between border-t p-3"
      >
        <p class="text-base-content/70 text-xs">
          {rangeStart}–{rangeEnd} of {data.total}
        </p>
        <div class="join">
          <a
            href={pageUrl(data.page - 1)}
            class="btn btn-sm join-item"
            class:btn-disabled={data.page <= 1}
            aria-disabled={data.page <= 1}>Prev</a
          >
          <span class="btn btn-sm join-item btn-disabled"
            >Page {data.page} of {totalPages}</span
          >
          <a
            href={pageUrl(data.page + 1)}
            class="btn btn-sm join-item"
            class:btn-disabled={data.page >= totalPages}
            aria-disabled={data.page >= totalPages}>Next</a
          >
        </div>
      </div>
    </div>
  {/if}
</div>
