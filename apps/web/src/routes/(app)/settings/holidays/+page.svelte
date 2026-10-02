<script lang="ts">
  import PageTitle from "$lib/components/PageTitle.svelte"
  import { calendarDate, localised } from "$lib/format"
  import type { FirmHoliday } from "$lib/server/firm-profile/firm_holidays.repo"
  import { fieldErrors } from "$lib/form-errors"
  import { enhance } from "$app/forms"
  import { closeOnSuccess } from "$lib/form-enhance"
  import PageHead from "$lib/components/PageHead.svelte"
  import EmptyState from "$lib/components/EmptyState.svelte"
  import Pagination from "$lib/components/Pagination.svelte"
  import SectionCard from "$lib/components/SectionCard.svelte"
  import ModalActions from "$lib/components/ModalActions.svelte"
  import RowActions from "$lib/components/RowActions.svelte"
  import type { RowAction } from "$lib/components/row-actions"
  import { has } from "$lib/permissions"

  let { data, form } = $props()

  const err = $derived(fieldErrors(form))
  const canWrite = $derived(has(data.permissions, "firm.settings.write"))

  const tenantLocale = $derived(data.tenant?.default_locale ?? "en-US")
  const supportedLocales = $derived(
    data.tenant?.supported_locales ?? [tenantLocale],
  )

  /** A holiday's date reads in its own office's locale, same reasoning as localeForCurrency (L24). */
  const officeLocale = (code: string) =>
    data.locations.find((l) => l.location_code === code)?.locale ?? tenantLocale

  const officeName = (code: string) =>
    data.locations.find((l) => l.location_code === code)?.name ?? code

  // Group by office so each calendar is legible on its own.
  const byOffice = $derived.by(() => {
    const groups = new Map<string, FirmHoliday[]>()
    for (const h of data.holidays) {
      const list = groups.get(h.location_code)
      if (list) list.push(h)
      else groups.set(h.location_code, [h])
    }
    return [...groups.entries()].sort((a, b) =>
      officeName(a[0]).localeCompare(officeName(b[0])),
    )
  })

  let editing = $state<FirmHoliday | "new" | null>(null)
  const current = $derived(editing === "new" ? null : editing)

  const rowActions = (h: FirmHoliday): RowAction[] =>
    canWrite
      ? [
          {
            kind: "edit",
            onclick: () => (editing = h),
            label: `Edit ${h.name}`,
          },
          {
            kind: "archive",
            post: { action: "?/archive", fields: { id: h.id } },
            label: `Archive ${h.name}`,
          },
        ]
      : []
</script>

<PageHead title="Holidays" />

<div class="p-4 lg:p-6">
  <PageTitle
    title="Holidays"
    items={[
      { label: "Settings", path: "/settings/holidays" },
      { label: "Holidays", active: true },
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

  <div class="mt-4 flex flex-wrap items-center justify-between gap-3">
    <form method="GET" class="flex items-center gap-2">
      <label class="text-base-content/70 text-sm" for="year">Year</label>
      <select
        id="year"
        name="year"
        class="select select-sm"
        value={data.selectedYear ?? ""}
        onchange={(e) => e.currentTarget.form?.requestSubmit()}
      >
        <option value="">All years</option>
        {#each data.availableYears as y (y)}
          <option value={y}>{y}</option>
        {/each}
      </select>
      <span class="text-base-content/70 text-sm">
        {data.total}
        {data.total === 1 ? "holiday" : "holidays"}
      </span>
    </form>

    <button
      class="btn btn-primary btn-sm gap-2"
      onclick={() => (editing = "new")}
    >
      <span class="iconify lucide--plus size-4"></span>
      New Holiday
    </button>
  </div>

  {#if data.holidays.length === 0}
    <EmptyState
      icon="lucide--calendar-days"
      title="No holidays for this year"
      message="Holidays are set per office — a day off in Bangalore is a working day in New York. Payroll and leave accrual both read this calendar."
    />
  {:else}
    <div class="mt-4 grid gap-4">
      {#each byOffice as [code, list] (code)}
        <SectionCard>
          {#snippet heading()}
            <div class="flex items-baseline justify-between gap-2">
              <h2 class="text-base font-medium">{officeName(code)}</h2>
              <span class="text-base-content/70 text-sm">
                {list.length} · dates shown in {officeLocale(code)}
              </span>
            </div>
          {/snippet}

          <ul class="list">
            {#each list as h (h.id)}
              <li class="list-row px-0">
                <div class="list-col-grow">
                  <p class="font-medium">
                    {localised(h.name_i18n, h.name, tenantLocale)}
                  </p>
                  <p class="text-base-content/70 text-sm tabular-nums">
                    {calendarDate(h.date, officeLocale(code), "long")}
                  </p>
                </div>
                <div class="flex items-center gap-1">
                  {#if h.is_paid}
                    <div class="badge badge-sm">Paid</div>
                  {/if}
                  {#if h.is_recurring}
                    <div class="badge badge-sm">Annual</div>
                  {/if}
                  <RowActions actions={rowActions(h)} />
                </div>
              </li>
            {/each}
          </ul>
        </SectionCard>
      {/each}
    </div>
    {#if data.total > data.pageSize}
      <div class="card bg-base-100 mt-4 shadow">
        <Pagination
          page={data.page}
          pageSize={data.pageSize}
          total={data.total}
          hrefFor={(n) => {
            const p = new URLSearchParams()
            if (data.selectedYear) p.set("year", String(data.selectedYear))
            if (n > 1) p.set("page", String(n))
            return p.size ? `?${p}` : "?"
          }}
        />
      </div>
    {/if}
  {/if}
</div>

{#if editing}
  <div class="modal modal-open" role="dialog" aria-label="Holiday">
    <div class="modal-box">
      <h3 class="text-lg font-medium">
        {current ? "Edit holiday" : "New holiday"}
      </h3>
      <form
        method="POST"
        action="?/save"
        class="mt-4 grid gap-4"
        use:enhance={closeOnSuccess(() => (editing = null))}
      >
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
            aria-invalid={err.aria("name")}
            class={`input w-full ${err.input("name")}`}
            value={current?.name ?? ""}
            required
          />
        </fieldset>

        <div class="grid gap-4 sm:grid-cols-2">
          <fieldset class="fieldset">
            <legend class="fieldset-legend">Office</legend>
            <select
              name="location_code"
              aria-invalid={err.aria("location_code")}
              class={`select w-full ${err.select("location_code")}`}
              value={current?.location_code ?? ""}
              required
            >
              {#each data.locations as l (l.id)}
                <option value={l.location_code}>{l.name}</option>
              {/each}
            </select>
          </fieldset>
          <fieldset class="fieldset">
            <legend class="fieldset-legend">Date</legend>
            <!-- type=date posts ISO YYYY-MM-DD regardless of browser locale, matching the DATE column. -->
            <input
              name="date"
              aria-invalid={err.aria("date")}
              type="date"
              class={`input w-full ${err.input("date")}`}
              value={current?.date ?? ""}
              required
            />
          </fieldset>
        </div>

        {#if supportedLocales.length > 1}
          <fieldset class="fieldset">
            <legend class="fieldset-legend">Translations</legend>
            <div class="grid gap-2 sm:grid-cols-2">
              {#each supportedLocales as code (code)}
                <label class="form-control">
                  <span class="label text-base-content/70 text-xs">{code}</span>
                  <input
                    name={`name_i18n.${code}`}
                    class="input w-full"
                    value={current?.name_i18n?.[code] ?? ""}
                    placeholder={current?.name ?? ""}
                    aria-label={`Holiday name in ${code}`}
                  />
                </label>
              {/each}
            </div>
          </fieldset>
        {/if}

        <div class="flex flex-wrap gap-4">
          <label class="label cursor-pointer gap-2">
            <input
              type="checkbox"
              name="is_paid"
              class="checkbox checkbox-sm"
              checked={current?.is_paid ?? true}
            />
            <span class="text-sm">Paid</span>
          </label>
          <label class="label cursor-pointer gap-2">
            <input
              type="checkbox"
              name="is_mandatory"
              class="checkbox checkbox-sm"
              checked={current?.is_mandatory ?? true}
            />
            <span class="text-sm">Mandatory</span>
          </label>
          <label class="label cursor-pointer gap-2">
            <input
              type="checkbox"
              name="is_recurring"
              class="checkbox checkbox-sm"
              checked={current?.is_recurring ?? false}
            />
            <span class="text-sm">Repeats annually</span>
          </label>
        </div>

        <ModalActions onCancel={() => (editing = null)} />
      </form>
    </div>
    <button
      class="modal-backdrop"
      aria-label="Close"
      onclick={() => (editing = null)}
    ></button>
  </div>
{/if}
