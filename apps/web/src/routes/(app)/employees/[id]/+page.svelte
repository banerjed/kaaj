<script lang="ts">
  import { untrack } from "svelte"
  import PageTitle from "$lib/components/PageTitle.svelte"
  import { calendarDate, currentTimeIn, money } from "$lib/format"

  let { data, form } = $props()

  // Reopened when a submit failed. The form is a plain POST, so a fail(400) is
  // a full document load: without this the modal — and the error inside it —
  // would vanish and the page would look untouched. `untrack` marks the read
  // as deliberately once-only; the page-level alert covers later renders.
  let recordingRaise = $state(untrack(() => Boolean(form?.errorFields)))

  const invalid = (n: string) =>
    (form?.errorFields ?? []).includes(n) ? "input-error" : ""

  const e = $derived(data.employee)
  const currencyOptions = $derived([
    ...new Set(
      [
        ...(data.tenant?.supported_currencies ?? []),
        data.tenant?.default_currency,
        e.currency,
      ].filter((c): c is string => Boolean(c)),
    ),
  ])
  const tenantLocale = $derived(data.tenant?.default_locale ?? "en-US")

  // This person's own office decides how their money and dates read (L24).
  const office = $derived(
    data.locations.find((l) => l.location_code === e.location_code),
  )
  const locale = $derived(office?.locale ?? tenantLocale)

  const fullName = $derived(
    [e.preferred_name || e.first_name, e.middle_name, e.last_name]
      .filter(Boolean)
      .join(" "),
  )
  const initials = $derived(
    `${(e.preferred_name || e.first_name)[0] ?? ""}${e.last_name[0] ?? ""}`.toUpperCase(),
  )

  /**
   * Tenure in whole months, from the start date to today or the leaving date.
   * Calendar arithmetic, not days/30 — "1 year 2 months" has to match what a
   * person would say.
   */
  const tenure = $derived.by(() => {
    if (!e.start_date) return "—"
    const start = new Date(`${e.start_date}T00:00:00Z`)
    const end = e.end_date ? new Date(`${e.end_date}T00:00:00Z`) : new Date()
    let months =
      (end.getUTCFullYear() - start.getUTCFullYear()) * 12 +
      (end.getUTCMonth() - start.getUTCMonth())
    if (end.getUTCDate() < start.getUTCDate()) months -= 1
    if (months < 0) return "Not started"
    const years = Math.floor(months / 12)
    const rest = months % 12
    return (
      [
        years ? `${years} ${years === 1 ? "year" : "years"}` : "",
        rest ? `${rest} ${rest === 1 ? "month" : "months"}` : "",
      ]
        .filter(Boolean)
        .join(" ") || "Less than a month"
    )
  })

  const TABS = ["Personal", "Employment", "Compensation"] as const
  let tab = $state<(typeof TABS)[number]>("Personal")

  const field = (label: string, value: string | null | undefined) => ({
    label,
    value: value && value !== "" ? value : "—",
  })

  const personal = $derived([
    field("Full name", fullName),
    field("Preferred name", e.preferred_name),
    field("Email", e.email),
    field("Phone", e.phone),
    field("Pronouns", e.pronouns?.replaceAll("_", "/")),
    field(
      "Date of birth",
      e.birth_date ? calendarDate(e.birth_date, locale) : null,
    ),
  ])

  const employment = $derived([
    field("Employee ID", e.employee_id),
    field("Job title", e.job_title),
    field("Level", e.job_level),
    field("Department", e.department_name),
    field("Manager", e.manager_name),
    field("Office", office?.name ?? e.location_code),
    field("Employment type", e.employment_type?.replaceAll("_", " ")),
    field("Started", calendarDate(e.start_date, locale, "long")),
    field("Tenure", tenure),
    ...(e.end_date
      ? [field("Left", calendarDate(e.end_date, locale, "long"))]
      : []),
  ])
</script>

<svelte:head>
  <title>{fullName} · Kaaj</title>
</svelte:head>

<div class="p-4 lg:p-6">
  <PageTitle
    title={fullName}
    items={[
      { label: "Employees", path: "/employees" },
      { label: fullName, active: true },
    ]}
  />

  {#if form?.saved}
    <div role="status" class="alert alert-success mt-4">
      <span class="iconify lucide--check size-5"></span>
      <span>Pay change recorded.</span>
    </div>
  {:else if form?.message}
    <div role="alert" class="alert alert-error mt-4">
      <span class="iconify lucide--circle-alert size-5"></span>
      <span>{form.message}</span>
    </div>
  {/if}

  <div class="card bg-base-100 mt-4 shadow">
    <div class="card-body gap-4">
      <div class="flex flex-wrap items-center gap-4">
        <div class="avatar avatar-placeholder">
          <div class="bg-primary text-primary-content w-16 rounded-full">
            <span class="text-xl font-medium">{initials}</span>
          </div>
        </div>
        <div class="grow">
          <h2 class="text-lg font-medium">{fullName}</h2>
          <p class="text-base-content/70 text-sm">
            {e.job_title ?? "—"}
            {#if e.department_name}· {e.department_name}{/if}
          </p>
          {#if office}
            <p class="text-base-content/70 text-sm">
              {office.name} · {currentTimeIn(office.timezone, locale)} local
            </p>
          {/if}
        </div>
        <div class="flex flex-col items-end gap-1">
          <a class="btn btn-sm gap-2" href={`/employees/${e.id}/edit`}>
            <span class="iconify lucide--pencil size-4"></span>
            Edit
          </a>
          <span
            class={`badge ${e.employment_status === "active" ? "badge-success" : "badge-ghost"}`}
          >
            {e.employment_status.replaceAll("_", " ")}
          </span>
          {#if e.base_amount}
            <span class="text-lg font-medium tabular-nums">
              {money(e.base_amount, e.currency ?? "USD", locale)}
            </span>
            <span class="text-base-content/70 text-xs">
              {e.pay_frequency?.replaceAll("_", " ") ?? ""}
            </span>
          {/if}
        </div>
      </div>

      <div role="tablist" class="tabs tabs-border">
        {#each TABS as t (t)}
          <button
            role="tab"
            class={`tab ${tab === t ? "tab-active" : ""}`}
            aria-selected={tab === t}
            onclick={() => (tab = t)}
          >
            {t}
          </button>
        {/each}
      </div>

      {#if tab === "Personal"}
        <dl class="grid gap-x-8 gap-y-3 sm:grid-cols-2">
          {#each personal as f (f.label)}
            <div class="flex justify-between gap-4 border-b border-dashed pb-2">
              <dt class="text-base-content/70 text-sm">{f.label}</dt>
              <dd class="text-end text-sm">{f.value}</dd>
            </div>
          {/each}
        </dl>
      {:else if tab === "Employment"}
        <dl class="grid gap-x-8 gap-y-3 sm:grid-cols-2">
          {#each employment as f (f.label)}
            <div class="flex justify-between gap-4 border-b border-dashed pb-2">
              <dt class="text-base-content/70 text-sm">{f.label}</dt>
              <dd class="text-end text-sm">{f.value}</dd>
            </div>
          {/each}
        </dl>
      {:else}
        <div class="flex items-center justify-between gap-3">
          <p class="text-base-content/70 text-sm">
            A raise is a new dated record, never an edit — the history is what
            makes a past payroll reproducible.
          </p>
          <button
            class="btn btn-primary btn-sm gap-2"
            onclick={() => (recordingRaise = true)}
          >
            <span class="iconify lucide--trending-up size-4"></span>
            Record change
          </button>
        </div>
      {/if}

      {#if tab === "Compensation" && data.compensation.length === 0}
        <p class="text-base-content/70 py-6 text-center text-sm">
          No effective-dated compensation recorded.
        </p>
      {:else if tab === "Compensation"}
        <!--
            History, newest first. Amounts read in this person's own market:
            an India salary in lakhs even when a New York manager is looking.
          -->
        <div class="overflow-x-auto">
          <table class="table table-sm">
            <thead>
              <tr>
                <th>From</th>
                <th>To</th>
                <th class="text-right">Amount</th>
                <th>Frequency</th>
                <th>Reason</th>
              </tr>
            </thead>
            <tbody>
              {#each data.compensation as c, i (c.effective_from)}
                <tr class:font-medium={i === 0 && !c.effective_to}>
                  <td class="tabular-nums"
                    >{calendarDate(c.effective_from, locale)}</td
                  >
                  <td class="tabular-nums">
                    {c.effective_to
                      ? calendarDate(c.effective_to, locale)
                      : "Current"}
                  </td>
                  <td class="text-right tabular-nums">
                    {money(c.amount, c.currency, locale)}
                  </td>
                  <td class="text-sm"
                    >{c.pay_frequency?.replaceAll("_", " ") ?? "—"}</td
                  >
                  <td class="text-base-content/70 text-sm"
                    >{c.change_reason ?? "—"}</td
                  >
                </tr>
              {/each}
            </tbody>
          </table>
        </div>
      {/if}
    </div>
  </div>
</div>

{#if recordingRaise}
  <div class="modal modal-open" role="dialog" aria-label="Record a pay change">
    <div class="modal-box">
      <h3 class="text-lg font-medium">Record a pay change</h3>
      <p class="text-base-content/70 mt-1 text-sm">
        This creates a new dated record for {fullName} and closes the current one
        the day before it starts. Nothing existing is overwritten.
      </p>

      {#if form?.message}
        <div role="alert" class="alert alert-error mt-3">
          <span class="iconify lucide--circle-alert size-5"></span>
          <span>{form.message}</span>
        </div>
      {/if}

      <form method="POST" action="?/addRaise" class="mt-4 grid gap-4">
        <div class="grid gap-4 sm:grid-cols-2">
          <fieldset class="fieldset">
            <legend class="fieldset-legend">Effective from</legend>
            <input
              name="effective_from"
              type="date"
              class={`input w-full ${invalid("effective_from")}`}
              required
            />
          </fieldset>
          <fieldset class="fieldset">
            <legend class="fieldset-legend">Reason</legend>
            <!-- change_reason is a Postgres enum; free text here was a 500. -->
            <select
              name="change_reason"
              class={`select w-full ${invalid("change_reason")}`}
            >
              <option value="">Not stated</option>
              {#each data.changeReasons as r (r)}
                <option value={r}>{r.replaceAll("_", " ")}</option>
              {/each}
            </select>
          </fieldset>
        </div>

        <div class="grid gap-4 sm:grid-cols-3">
          <fieldset class="fieldset sm:col-span-2">
            <legend class="fieldset-legend">Amount</legend>
            <!-- inputmode=decimal rather than type=number: the value is kept
                 as a string end to end so numeric(12,2) never round-trips
                 through a float (L25). -->
            <input
              name="amount"
              inputmode="decimal"
              class={`input w-full tabular-nums ${invalid("amount")}`}
              value={e.base_amount ?? ""}
              required
            />
          </fieldset>
          <fieldset class="fieldset">
            <legend class="fieldset-legend">Currency</legend>
            <select
              name="currency"
              class="select w-full"
              value={e.currency ?? data.tenant?.default_currency}
            >
              <!-- Never an empty list: a tenant with NULL supported_currencies
                   would otherwise render no options, submit no currency, and
                   fail validation. The employee's own currency is included so
                   it cannot be silently switched to option[0]. -->
              {#each currencyOptions as c (c)}
                <option value={c}>{c}</option>
              {/each}
            </select>
          </fieldset>
        </div>

        <fieldset class="fieldset">
          <legend class="fieldset-legend">Compensation type</legend>
          <!-- Was hard-coded to "salary", which rewrote an hourly worker's
               record as salaried and stored their hourly rate as a salary. -->
          <select
            name="compensation_type"
            class="select w-full"
            value={e.compensation_type ?? "salary"}
          >
            {#each data.compensationTypes as t (t)}
              <option value={t}>{t}</option>
            {/each}
          </select>
        </fieldset>

        <fieldset class="fieldset">
          <legend class="fieldset-legend">Pay frequency</legend>
          <select
            name="pay_frequency"
            class="select w-full"
            value={e.pay_frequency ?? "monthly"}
          >
            {#each data.payFrequencies as f (f)}
              <option value={f}>{f.replaceAll("_", " ")}</option>
            {/each}
          </select>
        </fieldset>

        <div class="modal-action">
          <button
            type="button"
            class="btn btn-ghost"
            onclick={() => (recordingRaise = false)}>Cancel</button
          >
          <button type="submit" class="btn btn-primary">Record</button>
        </div>
      </form>
    </div>
    <button
      class="modal-backdrop"
      aria-label="Close"
      onclick={() => (recordingRaise = false)}
    ></button>
  </div>
{/if}
