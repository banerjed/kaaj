<script lang="ts">
  import PageTitle from "$lib/components/PageTitle.svelte"
  import { currentTimeIn } from "$lib/format"
  import {
    SUPPORTED_LOCALES,
    timezoneOptions,
    currencyLabel,
  } from "$lib/firm-profile/regional"
  import type { FirmLocation } from "$lib/server/firm-profile/firm_locations.repo"
  import { fieldErrors } from "$lib/form-errors"
  import { enhance } from "$app/forms"
  import { closeOnSuccess } from "$lib/form-enhance"
  import PageHead from "$lib/components/PageHead.svelte"

  let { data, form } = $props()

  const err = $derived(fieldErrors(form))

  const supportedLocales = $derived(
    data.tenant?.supported_locales ?? [data.tenant?.default_locale ?? "en-US"],
  )
  const currencies = $derived(
    data.tenant?.supported_currencies ?? [
      data.tenant?.default_currency ?? "USD",
    ],
  )
  const zonesByRegion = timezoneOptions()

  let editing = $state<FirmLocation | "new" | null>(null)
  const current = $derived(editing === "new" ? null : editing)

  // The spec's three tabs: basic / regional / contact.
  const MODAL_TABS = ["Basic", "Regional", "Contact"] as const
  let modalTab = $state<(typeof MODAL_TABS)[number]>("Basic")

  // Live preview of the chosen zone, so "Asia/Kolkata" is legible as a time.
  let previewZone = $state("UTC")
  $effect(() => {
    previewZone = current?.timezone ?? data.tenant?.default_timezone ?? "UTC"
  })

  // Bound to the tenant's locale, not the browser's, so everyone reads the same schedule the same way.
  const locale = $derived(data.tenant?.default_locale ?? "en-US")

  // Ticks the clock: `new Date()` isn't a reactive dependency, so without this the column freezes.
  let now = $state(new Date())
  $effect(() => {
    const id = setInterval(() => (now = new Date()), 30_000)
    return () => clearInterval(id)
  })

  const currentTimeAt = (timezone: string) => {
    try {
      return new Intl.DateTimeFormat(locale, {
        hour: "numeric",
        minute: "2-digit",
        timeZoneName: "short",
        timeZone: timezone,
      }).format(now)
    } catch {
      return timezone // unknown IANA zone: show it rather than hide it
    }
  }

  const regionName = (code: string) => {
    try {
      return (
        new Intl.DisplayNames([locale], { type: "region" }).of(code) ?? code
      )
    } catch {
      return code
    }
  }

  const addressLines = (l: (typeof data.locations)[number]) =>
    [
      l.address_line1,
      l.address_line2,
      [l.city, l.state, l.postal_code].filter(Boolean).join(", "),
      regionName(l.country),
    ].filter(Boolean) as string[]
</script>

<PageHead title="Locations" />

<div class="p-4 lg:p-6">
  <PageTitle
    title="Locations"
    items={[
      { label: "Settings", path: "/settings/locations" },
      { label: "Locations", active: true },
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
      {data.locations.length}
      {data.locations.length === 1 ? "location" : "locations"}
    </p>
    <button
      class="btn btn-primary btn-sm gap-2"
      onclick={() => {
        modalTab = "Basic"
        editing = "new"
      }}
    >
      <span class="iconify lucide--plus size-4"></span>
      New Location
    </button>
  </div>

  {#if data.locations.length === 0}
    <!-- Empty state per doc 02: what is missing, why it matters, what next. -->
    <div class="card bg-base-100 mt-4 shadow">
      <div class="card-body items-center py-16 text-center">
        <span class="iconify lucide--map-pin text-base-content/30 size-10"
        ></span>
        <p class="mt-3 font-medium">No locations yet</p>
        <p class="text-base-content/70 max-w-md text-sm">
          Locations anchor holidays, payroll policies and each employee's
          working hours. Add your headquarters first.
        </p>
      </div>
    </div>
  {:else}
    <!-- Two shapes: `list` below md, table above. `md:hidden` is on the wrapper, not `.list` (L10). -->
    <div class="mt-4 md:hidden">
      <ul class="list bg-base-100 rounded-box shadow">
        {#each data.locations as location (location.id)}
          <!-- Exactly two grid children; the badge goes inside the first (L11). -->
          <li class="list-row">
            <div class="list-col-grow">
              <div class="flex items-center gap-2">
                <p class="font-medium">{location.name}</p>
                {#if location.is_headquarters}
                  <div class="badge badge-primary badge-sm">HQ</div>
                {/if}
              </div>
              {#if location.location_code}
                <p class="text-base-content/70 font-mono text-xs">
                  {location.location_code}
                </p>
              {/if}
            </div>

            <p class="list-col-wrap text-base-content/70 text-sm">
              {addressLines(location).join(" · ")}
              <span class="text-base-content/70 block pt-1 text-xs">
                {currentTimeAt(location.timezone)}
                {#if location.currency}· {location.currency}{/if}
              </span>
            </p>
          </li>
        {/each}
      </ul>
    </div>

    <!-- Table: md and up -->
    <div class="card bg-base-100 mt-4 shadow max-md:hidden">
      <div class="overflow-x-auto">
        <table class="table">
          <thead>
            <tr>
              <th>Name</th>
              <th>Address</th>
              <th>Timezone</th>
              <th>Local time</th>
              <th>Currency</th>
              <th class="w-20">Actions</th>
            </tr>
          </thead>
          <tbody>
            {#each data.locations as location (location.id)}
              <!-- daisyUI 5 dropped the v4 `hover` table modifier; this is
                   Nexus's own string. -->
              <tr class="hover:bg-base-200/40">
                <td>
                  <div class="flex items-center gap-2">
                    <span class="font-medium">{location.name}</span>
                    {#if location.is_headquarters}
                      <div class="badge badge-primary badge-sm">HQ</div>
                    {/if}
                  </div>
                  {#if location.location_code}
                    <p class="text-base-content/70 font-mono text-xs">
                      {location.location_code}
                    </p>
                  {/if}
                </td>
                <td class="text-base-content/70 text-sm">
                  {addressLines(location).join(", ")}
                </td>
                <td class="text-sm">{location.timezone}</td>
                <td class="text-sm tabular-nums">
                  {currentTimeAt(location.timezone)}
                </td>
                <td class="text-sm">
                  {location.currency ?? data.tenant?.default_currency ?? "—"}
                </td>
                <td>
                  <div class="flex gap-1">
                    <button
                      class="btn btn-ghost btn-sm btn-square"
                      aria-label={`Edit ${location.name}`}
                      onclick={() => {
                        modalTab = "Basic"
                        editing = location
                      }}
                    >
                      <span class="iconify lucide--pencil size-4"></span>
                    </button>
                    <form method="POST" action="?/archive">
                      <input type="hidden" name="id" value={location.id} />
                      <input
                        type="hidden"
                        name="location_code"
                        value={location.location_code}
                      />
                      <button
                        class="btn btn-ghost btn-sm btn-square text-error"
                        aria-label={`Deactivate ${location.name}`}
                        title="Deactivate"
                      >
                        <span class="iconify lucide--archive size-4"></span>
                      </button>
                    </form>
                  </div>
                </td>
              </tr>
            {/each}
          </tbody>
        </table>
      </div>
    </div>
  {/if}
</div>

{#if editing}
  <div class="modal modal-open" role="dialog" aria-label="Office">
    <div class="modal-box max-w-2xl">
      <h3 class="text-lg font-medium">
        {current ? "Edit office" : "New office"}
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

        <div role="tablist" class="tabs tabs-border">
          {#each MODAL_TABS as t (t)}
            <button
              type="button"
              role="tab"
              class={`tab ${modalTab === t ? "tab-active" : ""}`}
              aria-selected={modalTab === t}
              onclick={() => (modalTab = t)}
            >
              {t}
            </button>
          {/each}
        </div>

        <!-- Every tab stays mounted, hidden with CSS: an {#if} tab would post nothing. -->
        <div class:hidden={modalTab !== "Basic"}>
          <div class="grid gap-4">
            <div class="grid gap-4 sm:grid-cols-2">
              <fieldset class="fieldset">
                <legend class="fieldset-legend">Office name</legend>
                <input
                  name="name"
                  aria-invalid={err.aria("name")}
                  class={`input w-full ${err.input("name")}`}
                  value={current?.name ?? ""}
                  required
                />
              </fieldset>
              <fieldset class="fieldset">
                <legend class="fieldset-legend">Code</legend>
                <input
                  name="location_code"
                  aria-invalid={err.aria("location_code")}
                  class={`input w-full font-mono uppercase ${err.input("location_code")}`}
                  value={current?.location_code ?? ""}
                  placeholder="UK-LON"
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
                      <span class="label text-base-content/70 text-xs"
                        >{code}</span
                      >
                      <input
                        name={`name_i18n.${code}`}
                        class="input w-full"
                        value={current?.name_i18n?.[code] ?? ""}
                        placeholder={current?.name ?? ""}
                        aria-label={`Office name in ${code}`}
                      />
                    </label>
                  {/each}
                </div>
              </fieldset>
            {/if}

            <fieldset class="fieldset">
              <legend class="fieldset-legend">Address</legend>
              <input
                name="address_line1"
                aria-invalid={err.aria("address_line1")}
                class={`input w-full ${err.input("address_line1")}`}
                value={current?.address_line1 ?? ""}
                placeholder="Street"
                autocomplete="address-line1"
              />
              <input
                name="address_line2"
                aria-invalid={err.aria("address_line2")}
                class={`input mt-2 w-full ${err.input("address_line2")}`}
                value={current?.address_line2 ?? ""}
                placeholder="Line 2"
                autocomplete="address-line2"
              />
              <div class="mt-2 grid gap-2 sm:grid-cols-3">
                <input
                  name="city"
                  aria-invalid={err.aria("city")}
                  class={`input w-full ${err.input("city")}`}
                  value={current?.city ?? ""}
                  placeholder="City"
                  autocomplete="address-level2"
                />
                <input
                  name="state"
                  aria-invalid={err.aria("state")}
                  class={`input w-full ${err.input("state")}`}
                  value={current?.state ?? ""}
                  placeholder="Region"
                  autocomplete="address-level1"
                />
                <input
                  name="postal_code"
                  aria-invalid={err.aria("postal_code")}
                  class={`input w-full ${err.input("postal_code")}`}
                  value={current?.postal_code ?? ""}
                  placeholder="Postal code"
                  autocomplete="postal-code"
                />
              </div>
            </fieldset>

            <div class="grid gap-4 sm:grid-cols-2">
              <fieldset class="fieldset">
                <legend class="fieldset-legend">Country (ISO 3166-1)</legend>
                <input
                  name="country"
                  aria-invalid={err.aria("country")}
                  class={`input w-full uppercase ${err.input("country")}`}
                  value={current?.country ?? ""}
                  placeholder="GB"
                  maxlength="2"
                  required
                />
              </fieldset>
              <fieldset class="fieldset">
                <legend class="fieldset-legend">Desk capacity</legend>
                <input
                  name="capacity"
                  aria-invalid={err.aria("capacity")}
                  type="number"
                  inputmode="numeric"
                  class={`input w-full tabular-nums ${err.input("capacity")}`}
                  value={current?.capacity ?? ""}
                />
              </fieldset>
            </div>

            <label class="label cursor-pointer justify-start gap-3">
              <input
                type="checkbox"
                name="is_headquarters"
                class="checkbox checkbox-sm"
                checked={current?.is_headquarters ?? false}
              />
              <span class="text-sm">
                Headquarters — any other office loses the badge
              </span>
            </label>
          </div>
        </div>

        <div class:hidden={modalTab !== "Regional"}>
          <div class="grid gap-4">
            <fieldset class="fieldset">
              <legend class="fieldset-legend">Timezone</legend>
              <select
                name="timezone"
                aria-invalid={err.aria("timezone")}
                class={`select w-full ${err.select("timezone")}`}
                bind:value={previewZone}
              >
                {#each zonesByRegion as group (group.region)}
                  <optgroup label={group.region}>
                    {#each group.zones as zone (zone)}
                      <option value={zone}>{zone}</option>
                    {/each}
                  </optgroup>
                {/each}
              </select>
              <p class="label">
                Currently {currentTimeIn(
                  previewZone,
                  current?.locale ?? data.tenant?.default_locale ?? "en-US",
                )} there.
              </p>
            </fieldset>

            <div class="grid gap-4 sm:grid-cols-2">
              <fieldset class="fieldset">
                <legend class="fieldset-legend">Locale override</legend>
                <select
                  name="locale"
                  aria-invalid={err.aria("locale")}
                  class={`select w-full ${err.select("locale")}`}
                  value={current?.locale ?? ""}
                >
                  <option value="">
                    Use the firm default ({data.tenant?.default_locale})
                  </option>
                  {#each SUPPORTED_LOCALES as l (l.code)}
                    <option value={l.code}>{l.label}</option>
                  {/each}
                </select>
                <p class="label">
                  Decides how this office's money and dates read.
                </p>
              </fieldset>

              <fieldset class="fieldset">
                <legend class="fieldset-legend">Currency override</legend>
                <select
                  name="currency"
                  aria-invalid={err.aria("currency")}
                  class={`select w-full ${err.select("currency")}`}
                  value={current?.currency ?? ""}
                >
                  <option value="">
                    Use the firm default ({data.tenant?.default_currency})
                  </option>
                  {#each currencies as c (c)}
                    <option value={c}>
                      {currencyLabel(c, data.tenant?.default_locale ?? "en-US")}
                    </option>
                  {/each}
                </select>
              </fieldset>
            </div>
          </div>
        </div>

        <div class:hidden={modalTab !== "Contact"}>
          <div class="grid gap-4 sm:grid-cols-2">
            <fieldset class="fieldset">
              <legend class="fieldset-legend">Phone</legend>
              <input
                name="phone"
                aria-invalid={err.aria("phone")}
                type="tel"
                inputmode="tel"
                autocomplete="tel"
                class={`input w-full ${err.input("phone")}`}
                value={current?.phone ?? ""}
              />
            </fieldset>
            <fieldset class="fieldset">
              <legend class="fieldset-legend">Email</legend>
              <input
                name="email"
                aria-invalid={err.aria("email")}
                type="email"
                inputmode="email"
                autocomplete="email"
                class={`input w-full ${err.input("email")}`}
                value={current?.email ?? ""}
              />
            </fieldset>
          </div>
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
