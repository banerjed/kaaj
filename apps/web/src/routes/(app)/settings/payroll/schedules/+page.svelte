<script lang="ts">
  import PageTitle from "$lib/components/PageTitle.svelte"
  import { calendarDate, currentTimeIn, localised } from "$lib/format"
  import {
    clashingDates,
    nextPayDates,
    type Frequency,
  } from "$lib/firm-profile/pay-dates"
  import { timezoneOptions } from "$lib/firm-profile/regional"
  import type { PaySchedule } from "$lib/server/payroll/payroll_pay_schedules.repo"

  let { data, form } = $props()

  const tenantLocale = $derived(data.tenant?.default_locale ?? "en-US")
  const tenantZone = $derived(data.tenant?.default_timezone ?? "UTC")
  const supportedLocales = $derived(
    data.tenant?.supported_locales ?? [tenantLocale],
  )
  const currencies = $derived(
    data.tenant?.supported_currencies ?? [
      data.tenant?.default_currency ?? "USD",
    ],
  )
  const zonesByRegion = timezoneOptions()

  /** The locale of the office in the schedule's timezone, for its dates. */
  const zoneLocale = (timezone: string) =>
    data.locations.find((l) => l.timezone === timezone)?.locale ?? tenantLocale

  const holidayDates = (timezone: string) => {
    const office = data.locations.find((l) => l.timezone === timezone)
    return data.holidays
      .filter((h) => !office || h.location_code === office.location_code)
      .map((h) => h.date)
  }

  const projection = (s: PaySchedule) => {
    if (!s.anchor_date) return { dates: [] as string[], clashes: {} }
    const dates = nextPayDates(s.anchor_date, s.frequency as Frequency, 12)
    return { dates, clashes: clashingDates(dates, holidayDates(s.timezone)) }
  }

  let editing = $state<PaySchedule | "new" | null>(null)
  const current = $derived(editing === "new" ? null : editing)
  let expanded = $state<string | null>(null)
</script>

<svelte:head>
  <title>Pay Schedules · Kaaj</title>
</svelte:head>

<div class="p-4 lg:p-6">
  <PageTitle
    title="Pay Schedules"
    items={[
      { label: "Settings", path: "/settings/payroll/schedules" },
      { label: "Pay Schedules", active: true },
    ]}
  />

  {#if form?.saved || form?.archived}
    <div role="status" class="alert alert-success mt-4">
      <span class="iconify lucide--check size-5"></span>
      <span>Saved.</span>
    </div>
  {:else if form?.message}
    <div role="alert" class="alert alert-error mt-4">
      <span class="iconify lucide--circle-alert size-5"></span>
      <span>{form.message}</span>
    </div>
  {/if}

  <div class="mt-4 flex items-center justify-between gap-3">
    <p class="text-base-content/70 text-sm">
      {data.schedules.length}
      {data.schedules.length === 1 ? "schedule" : "schedules"}
    </p>
    <button
      class="btn btn-primary btn-sm gap-2"
      onclick={() => (editing = "new")}
    >
      <span class="iconify lucide--plus size-4"></span>
      New Schedule
    </button>
  </div>

  {#if data.schedules.length === 0}
    <div class="card bg-base-100 mt-4 shadow">
      <div class="card-body items-center py-16 text-center">
        <span
          class="iconify lucide--calendar-clock text-base-content/30 size-10"
        ></span>
        <p class="mt-3 font-medium">No pay schedules yet</p>
        <p class="text-base-content/70 max-w-md text-sm">
          A schedule fixes which calendar days people are paid on, in the
          timezone of the office that pays them.
        </p>
      </div>
    </div>
  {:else}
    <div class="mt-4 grid gap-4">
      {#each data.schedules as s (s.id)}
        {@const p = projection(s)}
        <div class="card bg-base-100 shadow">
          <div class="card-body gap-3">
            <div class="flex flex-wrap items-start justify-between gap-2">
              <div>
                <h2 class="text-base font-medium">
                  {localised(s.name_i18n, s.name, tenantLocale)}
                  {#if s.is_default}
                    <span class="badge badge-primary badge-sm ms-1"
                      >Default</span
                    >
                  {/if}
                  {#if !s.is_active}
                    <span class="badge badge-sm ms-1">Inactive</span>
                  {/if}
                </h2>
                <p class="text-base-content/70 mt-0.5 text-sm">
                  {s.frequency} · {s.currency} · {s.timezone}
                  · now {currentTimeIn(s.timezone, zoneLocale(s.timezone))}
                </p>
              </div>
              <div class="flex gap-1">
                <button
                  class="btn btn-ghost btn-sm"
                  onclick={() => (expanded = expanded === s.id ? null : s.id)}
                  aria-expanded={expanded === s.id}
                >
                  {expanded === s.id ? "Hide" : "Next 12 pay dates"}
                </button>
                <button
                  class="btn btn-ghost btn-sm btn-square"
                  aria-label={`Edit ${s.name}`}
                  onclick={() => (editing = s)}
                >
                  <span class="iconify lucide--pencil size-4"></span>
                </button>
                <form method="POST" action="?/archive">
                  <input type="hidden" name="id" value={s.id} />
                  <button
                    class="btn btn-ghost btn-sm btn-square text-error"
                    aria-label={`Deactivate ${s.name}`}
                  >
                    <span class="iconify lucide--archive size-4"></span>
                  </button>
                </form>
              </div>
            </div>

            {#if expanded === s.id}
              <!--
                The spec asks for the projection in two timezones: the
                schedule's own, and the viewer's. A pay date is a calendar day
                in the office that pays it, so the second column states what
                that day is called where the reader sits.
              -->
              <div class="overflow-x-auto">
                <table class="table table-sm">
                  <thead>
                    <tr>
                      <th>#</th>
                      <th>In {s.timezone}</th>
                      <th>As read in {tenantZone}</th>
                      <th></th>
                    </tr>
                  </thead>
                  <tbody>
                    {#each p.dates as d, i (d)}
                      <tr>
                        <td class="text-base-content/70">{i + 1}</td>
                        <td class="tabular-nums">
                          {calendarDate(d, zoneLocale(s.timezone), "long")}
                        </td>
                        <td class="text-base-content/70 tabular-nums">
                          {calendarDate(d, tenantLocale, "long")}
                        </td>
                        <td>
                          {#if p.clashes[d] === "holiday"}
                            <span class="badge badge-warning badge-sm"
                              >Holiday</span
                            >
                          {:else if p.clashes[d] === "weekend"}
                            <span class="badge badge-sm">Weekend</span>
                          {/if}
                        </td>
                      </tr>
                    {/each}
                  </tbody>
                </table>
              </div>
              {#if Object.keys(p.clashes).length > 0}
                <p class="text-base-content/70 text-xs">
                  Flagged dates are not moved automatically — whether to pay
                  early or late is set per schedule below.
                </p>
              {/if}
            {/if}
          </div>
        </div>
      {/each}
    </div>
  {/if}
</div>

{#if editing}
  <div class="modal modal-open" role="dialog" aria-label="Pay schedule">
    <div class="modal-box max-w-xl">
      <h3 class="text-lg font-medium">
        {current ? "Edit schedule" : "New schedule"}
      </h3>
      <form method="POST" action="?/save" class="mt-4 grid gap-4">
        {#if current}
          <input type="hidden" name="id" value={current.id} />
        {/if}
        {#each supportedLocales as l (l)}
          <input type="hidden" name="supported_locales" value={l} />
        {/each}

        <fieldset class="fieldset">
          <legend class="fieldset-legend">Name</legend>
          <input
            name="name"
            class="input w-full"
            value={current?.name ?? ""}
            placeholder="UK Monthly Payroll"
            required
          />
        </fieldset>

        <div class="grid gap-4 sm:grid-cols-2">
          <fieldset class="fieldset">
            <legend class="fieldset-legend">Frequency</legend>
            <select
              name="frequency"
              class="select w-full"
              value={current?.frequency ?? "monthly"}
            >
              {#each ["weekly", "bi-weekly", "semi-monthly", "monthly"] as f (f)}
                <option value={f}>{f}</option>
              {/each}
            </select>
          </fieldset>
          <fieldset class="fieldset">
            <legend class="fieldset-legend">Anchor date</legend>
            <input
              name="anchor_date"
              type="date"
              class="input w-full"
              value={current?.anchor_date ?? ""}
              required
            />
            <p class="label">
              Fixes the cycle. Every later date counts from it.
            </p>
          </fieldset>
        </div>

        <div class="grid gap-4 sm:grid-cols-2">
          <fieldset class="fieldset">
            <legend class="fieldset-legend">Timezone</legend>
            <select
              name="timezone"
              class="select w-full"
              value={current?.timezone ?? tenantZone}
            >
              {#each zonesByRegion as group (group.region)}
                <optgroup label={group.region}>
                  {#each group.zones as zone (zone)}
                    <option value={zone}>{zone}</option>
                  {/each}
                </optgroup>
              {/each}
            </select>
          </fieldset>
          <fieldset class="fieldset">
            <legend class="fieldset-legend">Currency</legend>
            <select
              name="currency"
              class="select w-full"
              value={current?.currency ?? data.tenant?.default_currency}
            >
              {#each currencies as c (c)}
                <option value={c}>{c}</option>
              {/each}
            </select>
          </fieldset>
        </div>

        <div class="flex flex-wrap gap-4">
          <label class="label cursor-pointer gap-2">
            <input
              type="checkbox"
              name="adjust_for_weekends"
              class="checkbox checkbox-sm"
              checked={current?.adjust_for_weekends ?? false}
            />
            <span class="text-sm">Shift off weekends</span>
          </label>
          <label class="label cursor-pointer gap-2">
            <input
              type="checkbox"
              name="adjust_for_holidays"
              class="checkbox checkbox-sm"
              checked={current?.adjust_for_holidays ?? false}
            />
            <span class="text-sm">Shift off holidays</span>
          </label>
        </div>

        <div class="modal-action">
          <button
            type="button"
            class="btn btn-ghost"
            onclick={() => (editing = null)}>Cancel</button
          >
          <button type="submit" class="btn btn-primary">Save</button>
        </div>
      </form>
    </div>
    <button
      class="modal-backdrop"
      aria-label="Close"
      onclick={() => (editing = null)}
    ></button>
  </div>
{/if}
