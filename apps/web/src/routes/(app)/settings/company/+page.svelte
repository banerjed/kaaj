<script lang="ts">
  import { untrack } from "svelte"
  import PageTitle from "$lib/components/PageTitle.svelte"
  import { approxMoney, money, number } from "$lib/format"
  import {
    DATE_FORMATS,
    TIME_FORMATS,
    timezoneOptions,
    currencyLabel,
    localeOptions,
    currencyOptions,
  } from "$lib/firm-profile/regional"

  let { data, form } = $props()

  const company = $derived(form?.company ?? data.company)
  const invalid = (name: string) =>
    (form?.errorFields ?? []).includes(name) ? "input-error" : ""

  const zonesByRegion = timezoneOptions()

  // Offered lists include anything this tenant already holds that is not in the
  // launch set, so an unrecognised value cannot be dropped by a save that never
  // rendered a control for it.
  const locales = $derived(localeOptions(company.supported_locales))
  const currencies = $derived(currencyOptions(company.supported_currencies))

  // Live state for the preview, which has to reflect what is on SCREEN rather
  // than what is in the database — that is the point of showing it beside the
  // form. `untrack` says the initial read is deliberate; the effect below is
  // what keeps it honest afterwards.
  let locale = $state(untrack(() => data.company.default_locale))
  let currency = $state(untrack(() => data.company.default_currency))
  let timezone = $state(untrack(() => data.company.default_timezone))
  let timeFormat = $state(untrack(() => data.company.time_format ?? "12h"))
  let selectedLocales = $state<string[]>(
    untrack(
      () => data.company.supported_locales ?? [data.company.default_locale],
    ),
  )

  // Adopt the saved record whenever it changes — which is exactly once per
  // successful save, when the action returns and load re-runs. Without this the
  // mirrored values stay at their pre-save state, so the selects and the
  // preview would show the old settings while the database holds the new ones.
  $effect(() => {
    locale = company.default_locale
    currency = company.default_currency
    timezone = company.default_timezone
    timeFormat = company.time_format ?? "12h"
    selectedLocales = company.supported_locales ?? [company.default_locale]
  })

  const fmt = <T,>(run: () => T, fallback: T): T => {
    try {
      return run()
    } catch {
      return fallback
    }
  }

  const sample = new Date("2026-12-01T15:45:00Z")

  const previewDate = $derived(
    fmt(
      () =>
        new Intl.DateTimeFormat(locale, {
          dateStyle: "long",
          timeZone: timezone,
        }).format(sample),
      "—",
    ),
  )
  const previewTime = $derived(
    fmt(
      () =>
        new Intl.DateTimeFormat(locale, {
          timeStyle: "short",
          timeZone: timezone,
          hour12: timeFormat === "12h",
        }).format(sample),
      "—",
    ),
  )
  // Through the shared formatter, not raw Intl. This panel exists to show what
  // the rest of the product will look like, so formatting it differently from
  // the rest of the product defeats its only purpose.
  const previewCurrency = $derived(money("1234.56", currency, locale))
  const previewNumber = $derived(number(1234567.89, locale))
  const previewCompact = $derived(approxMoney("18123432", currency, locale))
</script>

<svelte:head>
  <title>Company Profile · Kaaj</title>
</svelte:head>

<div class="p-4 lg:p-6">
  <PageTitle
    title="Company Profile"
    items={[
      { label: "Settings", path: "/settings/company" },
      { label: "Company Profile", active: true },
    ]}
  />

  {#if form?.saved}
    <div role="status" class="alert alert-success mt-4">
      <span class="iconify lucide--check size-5"></span>
      <span>Company profile saved.</span>
    </div>
  {:else if form?.message}
    <div role="alert" class="alert alert-error mt-4">
      <span class="iconify lucide--circle-alert size-5"></span>
      <span>{form.message}</span>
    </div>
  {/if}

  <form method="POST" action="?/update" class="mt-4 grid gap-4 xl:grid-cols-3">
    <!-- Identity ------------------------------------------------------- -->
    <div class="card bg-base-100 shadow xl:col-span-2">
      <div class="card-body gap-4">
        <h2 class="card-title text-base">Company Information</h2>

        <fieldset class="fieldset">
          <legend class="fieldset-legend">Subdomain</legend>
          <input
            class="input w-full"
            value={company.subdomain}
            disabled
            aria-describedby="subdomain-help"
          />
          <p id="subdomain-help" class="label">
            Permanent. It is how this tenant is routed, so changing it would
            break every existing link.
          </p>
        </fieldset>

        <fieldset class="fieldset">
          <legend class="fieldset-legend">Company name</legend>
          <input
            name="company_name"
            class={`input w-full ${invalid("company_name")}`}
            value={company.company_name}
            required
          />
        </fieldset>

        {#if selectedLocales.length > 1}
          <fieldset class="fieldset">
            <legend class="fieldset-legend">Translations</legend>
            <p class="label">
              Shown to people using that language. Blank falls back to the
              company name above.
            </p>
            <div class="grid gap-2 sm:grid-cols-2">
              <!-- A plain stacked label, not daisyUI's `floating-label`: that
                   only reveals the label once the field has content or focus,
                   so every empty translation rendered unlabelled and there was
                   no way to tell which language it was for. -->
              {#each selectedLocales as code (code)}
                <label class="form-control">
                  <span class="label text-base-content/70 text-xs">{code}</span>
                  <input
                    name={`company_name_i18n.${code}`}
                    class="input w-full"
                    value={company.company_name_i18n?.[code] ?? ""}
                    placeholder={company.company_name}
                    aria-label={`Company name in ${code}`}
                  />
                </label>
              {/each}
            </div>
          </fieldset>
        {/if}

        <div class="grid gap-4 sm:grid-cols-2">
          <fieldset class="fieldset">
            <legend class="fieldset-legend">Legal entity name</legend>
            <input
              name="legal_entity_name"
              class="input w-full"
              value={company.legal_entity_name ?? ""}
            />
          </fieldset>
          <fieldset class="fieldset">
            <legend class="fieldset-legend">Industry</legend>
            <input
              name="industry"
              class="input w-full"
              value={company.industry ?? ""}
            />
          </fieldset>
        </div>

        <fieldset class="fieldset">
          <legend class="fieldset-legend">Company size</legend>
          <select
            name="company_size"
            class="select w-full"
            value={company.company_size ?? ""}
          >
            <option value="">Not specified</option>
            <!-- These five are a CHECK constraint on tenants.company_size, not
                 a Postgres enum, so they are not in @kaaj/enums. -->
            {#each ["1-10", "11-50", "51-200", "201-500", "501+"] as size (size)}
              <option value={size}>{size} people</option>
            {/each}
          </select>
        </fieldset>
      </div>
    </div>

    <!-- Preview -------------------------------------------------------- -->
    <div class="card bg-base-100 shadow xl:row-span-2">
      <div class="card-body justify-start gap-4">
        <h2 class="card-title text-base">Preview</h2>
        <p class="text-base-content/70 text-sm">
          How dates, money and numbers will read across the product with these
          settings.
        </p>
        <dl class="grid gap-3">
          {#each [["Date", previewDate], ["Time", previewTime], ["Currency", previewCurrency], ["Number", previewNumber], ["Abbreviated", previewCompact]] as [label, value] (label)}
            <div class="bg-base-200 rounded-box px-3 py-2">
              <dt class="text-base-content/70 text-xs">{label}</dt>
              <dd class="font-medium tabular-nums">{value}</dd>
            </div>
          {/each}
        </dl>
        <p class="text-base-content/70 text-xs">
          Sample: 1 December 2026, 15:45 UTC, 1234.56, 18,123,432
        </p>
      </div>
    </div>

    <!-- Regional ------------------------------------------------------- -->
    <div class="card bg-base-100 shadow xl:col-span-2">
      <div class="card-body gap-4">
        <h2 class="card-title text-base">Regional Settings</h2>

        <fieldset class="fieldset">
          <legend class="fieldset-legend">Enabled languages</legend>
          <p class="label">
            The default must be one of these. Translation fields appear for
            each.
          </p>
          <div class="flex flex-wrap gap-3">
            {#each locales as l (l.code)}
              <label class="label cursor-pointer gap-2">
                <input
                  type="checkbox"
                  name="supported_locales"
                  value={l.code}
                  class="checkbox checkbox-sm"
                  checked={selectedLocales.includes(l.code)}
                  onchange={(e) => {
                    const on = e.currentTarget.checked
                    selectedLocales = on
                      ? [...selectedLocales, l.code]
                      : selectedLocales.filter((c) => c !== l.code)
                  }}
                />
                <span class="text-sm">{l.label}</span>
              </label>
            {/each}
          </div>
        </fieldset>

        <div class="grid gap-4 sm:grid-cols-2">
          <fieldset class="fieldset">
            <legend class="fieldset-legend">Default language</legend>
            <select
              name="default_locale"
              class={`select w-full ${invalid("default_locale")}`}
              bind:value={locale}
            >
              {#each locales as l (l.code)}
                <option value={l.code}>{l.label}</option>
              {/each}
            </select>
          </fieldset>

          <fieldset class="fieldset">
            <legend class="fieldset-legend">Default currency</legend>
            <select
              name="default_currency"
              class={`select w-full ${invalid("default_currency")}`}
              bind:value={currency}
            >
              {#each currencies as code (code)}
                <option value={code}>{currencyLabel(code, locale)}</option>
              {/each}
            </select>
          </fieldset>
        </div>

        <fieldset class="fieldset">
          <legend class="fieldset-legend">Enabled currencies</legend>
          <div class="flex flex-wrap gap-3">
            {#each currencies as code (code)}
              <label class="label cursor-pointer gap-2">
                <input
                  type="checkbox"
                  name="supported_currencies"
                  value={code}
                  class="checkbox checkbox-sm"
                  checked={(
                    company.supported_currencies ?? [company.default_currency]
                  ).includes(code)}
                />
                <span class="text-sm">{code}</span>
              </label>
            {/each}
          </div>
        </fieldset>

        <div class="grid gap-4 sm:grid-cols-3">
          <fieldset class="fieldset sm:col-span-1">
            <legend class="fieldset-legend">Default timezone</legend>
            <select
              name="default_timezone"
              class={`select w-full ${invalid("default_timezone")}`}
              bind:value={timezone}
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
            <legend class="fieldset-legend">Date format</legend>
            <select
              name="date_format"
              class="select w-full"
              value={company.date_format ?? "MM/DD/YYYY"}
            >
              {#each DATE_FORMATS as f (f)}
                <option value={f}>{f}</option>
              {/each}
            </select>
          </fieldset>

          <fieldset class="fieldset">
            <legend class="fieldset-legend">Time format</legend>
            <select
              name="time_format"
              class="select w-full"
              bind:value={timeFormat}
            >
              {#each TIME_FORMATS as f (f)}
                <option value={f}>{f === "12h" ? "12-hour" : "24-hour"}</option>
              {/each}
            </select>
          </fieldset>
        </div>
      </div>
    </div>

    <!-- Contact -------------------------------------------------------- -->
    <div class="card bg-base-100 shadow xl:col-span-2">
      <div class="card-body gap-4">
        <h2 class="card-title text-base">Primary Contact</h2>
        <div class="grid gap-4 sm:grid-cols-3">
          <fieldset class="fieldset">
            <legend class="fieldset-legend">Name</legend>
            <input
              name="primary_contact_name"
              class="input w-full"
              value={company.primary_contact_name ?? ""}
              autocomplete="name"
            />
          </fieldset>
          <fieldset class="fieldset">
            <legend class="fieldset-legend">Email</legend>
            <input
              name="primary_contact_email"
              type="email"
              inputmode="email"
              autocomplete="email"
              class={`input w-full ${invalid("primary_contact_email")}`}
              value={company.primary_contact_email ?? ""}
            />
          </fieldset>
          <fieldset class="fieldset">
            <legend class="fieldset-legend">Phone</legend>
            <input
              name="primary_contact_phone"
              type="tel"
              inputmode="tel"
              autocomplete="tel"
              class={`input w-full ${invalid("primary_contact_phone")}`}
              value={company.primary_contact_phone ?? ""}
            />
          </fieldset>
        </div>
      </div>
    </div>

    <div class="xl:col-span-3">
      <button type="submit" class="btn btn-primary">Save changes</button>
    </div>
  </form>
</div>
