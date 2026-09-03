<script lang="ts">
  import PageTitle from "$lib/components/PageTitle.svelte"
  import { calendarDate, hours, instant } from "$lib/format"
  import { isPositive } from "$lib/decimal"
  import StatusBadge from "$lib/components/StatusBadge.svelte"
  import type { Tone } from "$lib/components/status-tone"
  import PageHead from "$lib/components/PageHead.svelte"
  import EmptyState from "$lib/components/EmptyState.svelte"

  let { data } = $props()

  const tenantLocale = $derived(data.tenant?.default_locale ?? "en-US")
  const timeFormat = $derived(data.tenant?.time_format ?? null)

  /** Shown in the office's own zone and locale, never the viewer's (L35). */
  const inOffice = (
    value: Date | null,
    row: { timezone: string | null; locale: string | null },
  ) =>
    instant(
      value,
      {
        locale: row.locale ?? tenantLocale,
        currency: "",
        timezone: row.timezone ?? "UTC",
        timeFormat,
      },
      "time",
    )

  const statusTone = (s: string): Tone =>
    s === "present"
      ? "positive"
      : s === "late"
        ? "caution"
        : s === "absent"
          ? "critical"
          : "neutral"

  const label = (s: string) => s.replace(/_/g, " ")

  /** Hours read as a timesheet — 7h 45m — via format.ts, never formatted here. */
  const worked = (v: string | null, row: { locale: string | null }) =>
    hours(v, row.locale ?? tenantLocale)
</script>

<PageHead title="Attendance" />

<div class="p-4 lg:p-6">
  <PageTitle
    title="Attendance"
    items={[
      { label: "HR", path: "/attendance" },
      { label: "Attendance", active: true },
    ]}
  />

  {#if data.rejected.length > 0}
    <div role="status" class="alert alert-warning mt-4">
      <span class="iconify lucide--filter-x size-5"></span>
      <span>
        Ignored {data.rejected.length === 1 ? "a filter" : "some filters"} that did
        not make sense: {data.rejected.join(", ")}.
      </span>
    </div>
  {/if}

  <!-- Filters live in the URL, so a filtered view is shareable (doc 03). -->
  <form
    method="GET"
    class="mt-4 flex flex-wrap items-end gap-3"
    aria-label="Filter attendance"
  >
    <fieldset class="fieldset">
      <legend class="fieldset-legend text-xs">From</legend>
      <input type="date" name="from" class="input" value={data.filters.from} />
    </fieldset>
    <fieldset class="fieldset">
      <legend class="fieldset-legend text-xs">To</legend>
      <input type="date" name="to" class="input" value={data.filters.to} />
    </fieldset>
    <fieldset class="fieldset">
      <legend class="fieldset-legend text-xs">Status</legend>
      <select name="status" class="select" value={data.filters.status}>
        <option value="">Any</option>
        {#each data.statuses as s (s)}
          <option value={s} class="capitalize">{label(s)}</option>
        {/each}
      </select>
    </fieldset>
    <button class="btn btn-primary">Apply</button>
    {#if data.filters.from || data.filters.to || data.filters.status}
      <a href="/attendance" class="btn btn-ghost">Clear</a>
    {/if}
  </form>

  {#if data.days.length === 0}
    <EmptyState
      icon="lucide--calendar-off"
      message="No attendance recorded for that period."
    />
  {:else}
    <p class="text-base-content/70 mt-4 text-sm">
      {data.days.length}
      {data.days.length === 1 ? "day" : "days"} · times shown in each office's own
      timezone
    </p>

    <!-- Mobile. `md:hidden` is on the wrapper, not `.list`, which sets display (L10). -->
    <div class="mt-2 md:hidden">
      <ul class="list bg-base-100 rounded-box shadow">
        {#each data.days as d (d.id)}
          <li class="list-row">
            <div class="list-col-grow">
              <p class="font-medium">{d.employee_name}</p>
              <p class="text-base-content/70 text-xs">
                {calendarDate(d.attendance_date, d.locale ?? tenantLocale)}
                · {inOffice(d.clock_in_time, d)}–{inOffice(d.clock_out_time, d)}
                {#if d.crosses_local_midnight}
                  <span class="badge badge-ghost badge-xs ms-1">overnight</span>
                {/if}
              </p>
              <p class="text-base-content/70 text-xs">
                {worked(d.total_hours, d)} worked
                {#if d.overtime_hours && isPositive(d.overtime_hours)}
                  · {worked(d.overtime_hours, d)} overtime
                {/if}
              </p>
            </div>
            <StatusBadge tone={statusTone(d.status)}>
              {label(d.status)}
            </StatusBadge>
          </li>
        {/each}
      </ul>
    </div>

    <div class="card bg-base-100 mt-2 shadow max-md:hidden">
      <div class="overflow-x-auto">
        <table class="table">
          <thead>
            <tr>
              <th>Who</th>
              <th>Date</th>
              <th>Office</th>
              <th>In</th>
              <th>Out</th>
              <th class="text-right">Break</th>
              <th class="text-right">Worked</th>
              <th class="text-right">Overtime</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
            {#each data.days as d (d.id)}
              <tr class="hover:bg-base-200/40">
                <td class="font-medium">{d.employee_name}</td>
                <td class="text-sm tabular-nums">
                  {calendarDate(d.attendance_date, d.locale ?? tenantLocale)}
                </td>
                <td class="text-base-content/70 text-sm">
                  {d.location_code ?? "—"}
                </td>
                <td class="text-sm tabular-nums">
                  {inOffice(d.clock_in_time, d)}
                </td>
                <td class="text-sm tabular-nums">
                  {inOffice(d.clock_out_time, d)}
                  {#if d.crosses_local_midnight}
                    <!-- Ended on a later day in the OFFICE, not UTC (L35). -->
                    <span
                      class="badge badge-ghost badge-xs ms-1"
                      title="Ended the following day in this office"
                      >overnight</span
                    >
                  {/if}
                </td>
                <td
                  class="text-base-content/70 text-right text-sm tabular-nums"
                >
                  {d.break_minutes ?? 0}m
                </td>
                <td class="text-right text-sm tabular-nums">
                  {worked(d.total_hours, d)}
                </td>
                <td class="text-right text-sm tabular-nums">
                  {#if d.overtime_hours && isPositive(d.overtime_hours)}
                    {worked(d.overtime_hours, d)}
                  {:else}
                    <span class="text-base-content/70">—</span>
                  {/if}
                </td>
                <td>
                  <StatusBadge tone={statusTone(d.status)}>
                    {label(d.status)}
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
