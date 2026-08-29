<script lang="ts">
  import PageTitle from "$lib/components/PageTitle.svelte"
  import { calendarDate, currentTimeIn, money } from "$lib/format"

  let { data } = $props()

  const tenantLocale = $derived(data.tenant?.default_locale ?? "en-US")

  /**
   * Each person's pay and start date read in the locale of THEIR office, not
   * the firm's — an INR salary in lakhs, a UK start date day-first. Same rule
   * as the rest of the product (L24); it matters most here, where three
   * countries appear in one table.
   */
  const officeLocale = (code: string | null) =>
    data.locations.find((l) => l.location_code === code)?.locale ?? tenantLocale

  const officeName = (code: string | null) =>
    data.locations.find((l) => l.location_code === code)?.name ?? code ?? "—"

  const officeZone = (code: string | null) =>
    data.locations.find((l) => l.location_code === code)?.timezone

  const displayName = (e: (typeof data.employees)[number]) =>
    `${e.preferred_name || e.first_name} ${e.last_name}`

  const initials = (e: (typeof data.employees)[number]) =>
    `${(e.preferred_name || e.first_name)[0] ?? ""}${e.last_name[0] ?? ""}`.toUpperCase()

  const lastPage = $derived(Math.max(1, Math.ceil(data.total / data.pageSize)))

  /** Preserve existing filters when changing one of them. */
  const withParam = (key: string, value: string) => {
    const p = new URLSearchParams()
    const f = data.filters
    if (f.search) p.set("q", f.search)
    if (f.departmentCode) p.set("dept", f.departmentCode)
    if (f.locationCode) p.set("loc", f.locationCode)
    if (f.status) p.set("status", f.status)
    if (f.includeInactive) p.set("inactive", "1")
    if (value) p.set(key, value)
    else p.delete(key)
    if (key !== "page") p.delete("page")
    return `?${p.toString()}`
  }

  const statusClass = (s: string) =>
    s === "active"
      ? "badge-success"
      : s === "on_leave"
        ? "badge-warning"
        : "badge-ghost"
</script>

<svelte:head>
  <title>Employees · Kaaj</title>
</svelte:head>

<div class="p-4 lg:p-6">
  <PageTitle title="Employees" items={[{ label: "Employees", active: true }]} />

  <!-- Filters post as GET so the URL carries the state. -->
  <form method="GET" class="mt-4 flex flex-wrap items-end gap-2">
    <label class="input input-sm flex items-center gap-2">
      <span class="iconify lucide--search text-base-content/70 size-4"></span>
      <input
        type="search"
        name="q"
        value={data.filters.search}
        placeholder="Name, email or ID"
        aria-label="Search employees"
        class="w-40 sm:w-56"
      />
    </label>

    <select
      name="dept"
      class="select select-sm"
      aria-label="Department"
      value={data.filters.departmentCode}
      onchange={(e) => e.currentTarget.form?.requestSubmit()}
    >
      <option value="">All departments</option>
      {#each data.departments as d (d.id)}
        <option value={d.department_code}>{d.name}</option>
      {/each}
    </select>

    <select
      name="loc"
      class="select select-sm"
      aria-label="Location"
      value={data.filters.locationCode}
      onchange={(e) => e.currentTarget.form?.requestSubmit()}
    >
      <option value="">All offices</option>
      {#each data.locations as l (l.id)}
        <option value={l.location_code}>{l.name}</option>
      {/each}
    </select>

    <label class="label cursor-pointer gap-2">
      <input
        type="checkbox"
        name="inactive"
        value="1"
        class="checkbox checkbox-sm"
        checked={data.filters.includeInactive}
        onchange={(e) => e.currentTarget.form?.requestSubmit()}
      />
      <span class="text-sm">Include leavers</span>
    </label>

    <button class="btn btn-sm">Apply</button>

    <span class="text-base-content/70 ms-auto text-sm">
      {data.total}
      {data.total === 1 ? "person" : "people"}
    </span>
  </form>

  {#if data.employees.length === 0}
    <div class="card bg-base-100 mt-4 shadow">
      <div class="card-body items-center py-16 text-center">
        <span class="iconify lucide--users text-base-content/30 size-10"></span>
        <p class="mt-3 font-medium">No one matches these filters</p>
        <p class="text-base-content/70 max-w-md text-sm">
          Try clearing the search, or include leavers if you are looking for
          someone who has left.
        </p>
      </div>
    </div>
  {:else}
    <!-- Cards below md, table above (doc 04). -->
    <div class="mt-4 md:hidden">
      <ul class="list bg-base-100 rounded-box shadow">
        {#each data.employees as e (e.id)}
          <li class="list-row">
            <div class="avatar avatar-placeholder">
              <div
                class="bg-primary text-primary-content mask mask-squircle w-9"
              >
                <span class="text-xs font-medium">{initials(e)}</span>
              </div>
            </div>
            <div class="list-col-grow">
              <a class="link font-medium" href={`/employees/${e.id}`}>
                {displayName(e)}
              </a>
              <p class="text-base-content/70 text-xs">
                {e.job_title ?? "—"}{e.job_level ? ` · ${e.job_level}` : ""}
              </p>
            </div>
            <p class="list-col-wrap text-base-content/70 text-sm">
              {e.department_name ?? "—"} · {officeName(e.location_code)}
              <span class="block pt-1 tabular-nums">
                {money(
                  e.base_amount,
                  e.currency ?? "USD",
                  officeLocale(e.location_code),
                )}
              </span>
            </p>
          </li>
        {/each}
      </ul>
    </div>

    <div class="card bg-base-100 mt-4 shadow max-md:hidden">
      <div class="overflow-x-auto">
        <table class="table">
          <thead>
            <tr>
              <th>Name</th>
              <th>Department</th>
              <th>Job title</th>
              <th>Office</th>
              <th>Started</th>
              <th class="text-right">Base pay</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
            {#each data.employees as e (e.id)}
              <tr class="hover:bg-base-200/40">
                <td>
                  <div class="flex items-center gap-3">
                    <div class="avatar avatar-placeholder">
                      <div
                        class="bg-primary text-primary-content mask mask-squircle w-9"
                      >
                        <span class="text-xs font-medium">{initials(e)}</span>
                      </div>
                    </div>
                    <div>
                      <a class="link font-medium" href={`/employees/${e.id}`}>
                        {displayName(e)}
                      </a>
                      <p class="text-base-content/70 text-xs">{e.email}</p>
                    </div>
                  </div>
                </td>
                <td class="text-sm">{e.department_name ?? "—"}</td>
                <td class="text-sm">
                  {e.job_title ?? "—"}
                  {#if e.job_level}
                    <span class="text-base-content/70">· {e.job_level}</span>
                  {/if}
                </td>
                <td class="text-sm">
                  {officeName(e.location_code)}
                  {#if officeZone(e.location_code)}
                    <p class="text-base-content/70 text-xs tabular-nums">
                      {currentTimeIn(
                        officeZone(e.location_code)!,
                        officeLocale(e.location_code),
                      )}
                    </p>
                  {/if}
                </td>
                <td class="text-sm tabular-nums">
                  {calendarDate(e.start_date, officeLocale(e.location_code))}
                </td>
                <td class="text-right text-sm tabular-nums">
                  {money(
                    e.base_amount,
                    e.currency ?? "USD",
                    officeLocale(e.location_code),
                  )}
                </td>
                <td>
                  <span
                    class={`badge badge-sm ${statusClass(e.employment_status)}`}
                  >
                    {e.employment_status.replaceAll("_", " ")}
                  </span>
                </td>
              </tr>
            {/each}
          </tbody>
        </table>
      </div>
    </div>

    {#if lastPage > 1}
      <div class="mt-4 flex items-center justify-center gap-2">
        <a
          class="btn btn-sm"
          class:btn-disabled={data.page <= 1}
          href={withParam("page", String(data.page - 1))}
          aria-label="Previous page">Previous</a
        >
        <span class="text-base-content/70 text-sm">
          Page {data.page} of {lastPage}
        </span>
        <a
          class="btn btn-sm"
          class:btn-disabled={data.page >= lastPage}
          href={withParam("page", String(data.page + 1))}
          aria-label="Next page">Next</a
        >
      </div>
    {/if}
  {/if}
</div>
