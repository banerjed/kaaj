<script lang="ts">
  import PageTitle from "$lib/components/PageTitle.svelte"
  import { calendarDate, currentTimeIn, money, number } from "$lib/format"
  import StatusBadge from "$lib/components/StatusBadge.svelte"
  import PageHead from "$lib/components/PageHead.svelte"

  let { data } = $props()

  const e = $derived(data.employee)
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

  /** Tenure in whole months via calendar arithmetic, not days/30. */
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

<PageHead title={fullName} />

<div class="p-4 lg:p-6">
  <PageTitle
    title={fullName}
    items={[
      { label: "Employees", path: "/employees" },
      { label: fullName, active: true },
    ]}
  />

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
          <StatusBadge
            tone={e.employment_status === "active" ? "positive" : "neutral"}
            size="md"
            capitalize={false}
          >
            {e.employment_status.replaceAll("_", " ")}
          </StatusBadge>
          {#if e.base_amount_pvt}
            <span class="text-lg font-medium tabular-nums">
              {money(e.base_amount_pvt, e.currency ?? "USD", locale)}
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
          <!-- Pay changes are recorded only at /compensation/[employeeId]. -->
          <a
            class="btn btn-primary btn-sm gap-2"
            href={`/compensation/${data.employee.id}`}
          >
            <span class="iconify lucide--trending-up size-4"></span>
            Record change
          </a>
        </div>
      {/if}

      {#if tab === "Compensation" && data.compensation.length === 0}
        <p class="text-base-content/70 py-6 text-center text-sm">
          No effective-dated compensation recorded.
        </p>
      {:else if tab === "Compensation"}
        <!-- History, newest first; amounts read in this person's own market. -->
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

      {#if tab === "Compensation"}
        <!-- Never summed to a total — that would need an exchange rate (BR-FP-003). -->
        {#if data.allowances.length > 0}
          <div>
            <h3 class="mt-2 text-sm font-medium">Allowances</h3>
            <ul class="list mt-1">
              {#each data.allowances as a (a.id)}
                <li class="list-row px-0">
                  <div class="list-col-grow">
                    <p class="text-sm font-medium">{a.allowance_name}</p>
                    <p class="text-base-content/70 text-xs capitalize">
                      {a.allowance_type.replaceAll("_", " ")}
                      {#if a.is_reimbursement}· reimbursement{/if}
                      {#if a.is_taxable === false}· non-taxable{/if}
                    </p>
                  </div>
                  <p class="text-sm tabular-nums">
                    {money(a.amount, a.currency, locale)}
                    <span class="text-base-content/70">/{a.frequency}</span>
                  </p>
                </li>
              {/each}
            </ul>
          </div>
        {/if}

        {#if data.variablePay.length > 0}
          <div>
            <h3 class="mt-2 text-sm font-medium">Variable pay</h3>
            <p class="text-base-content/70 text-xs">
              Target at full attainment — not earnings, and not guaranteed.
            </p>
            <ul class="list mt-1">
              {#each data.variablePay as v (v.id)}
                <li class="list-row px-0">
                  <div class="list-col-grow">
                    <p class="text-sm font-medium">{v.component_name}</p>
                    <p class="text-base-content/70 text-xs capitalize">
                      {v.component_type.replaceAll("_", " ")} · {v.payment_frequency}
                    </p>
                  </div>
                  <p class="text-sm tabular-nums">
                    {money(v.target_amount, v.currency, locale)}
                    <span class="text-base-content/70">target</span>
                  </p>
                </li>
              {/each}
            </ul>
          </div>
        {/if}

        {#if data.equity.length > 0}
          <div>
            <h3 class="mt-2 text-sm font-medium">Equity</h3>
            <div class="overflow-x-auto">
              <table class="table table-sm">
                <thead>
                  <tr>
                    <th>Granted</th>
                    <th>Type</th>
                    <th class="text-right">Shares</th>
                    <th class="text-right">Vested</th>
                    <th class="text-right">Strike</th>
                    <th>Vesting</th>
                  </tr>
                </thead>
                <tbody>
                  {#each data.equity as g (g.id)}
                    <tr>
                      <td class="tabular-nums"
                        >{calendarDate(g.grant_date, locale)}</td
                      >
                      <td class="text-sm uppercase">{g.grant_type}</td>
                      <!-- Shares are counts, not money: `number`, not `money`. -->
                      <td class="text-right tabular-nums"
                        >{number(g.shares_granted, locale)}</td
                      >
                      <td class="text-right tabular-nums">
                        {number(g.shares_vested, locale)}
                        <span class="text-base-content/70 text-xs">
                          ({Math.round(
                            (g.shares_vested / g.shares_granted) * 100,
                          )}%)
                        </span>
                      </td>
                      <td class="text-right tabular-nums">
                        {g.exercise_price
                          ? money(g.exercise_price, g.currency ?? "USD", locale)
                          : "—"}
                      </td>
                      <td class="text-base-content/70 text-xs">
                        {g.vesting_cliff_months}m cliff ·
                        {g.vesting_period_months}m total
                      </td>
                    </tr>
                  {/each}
                </tbody>
              </table>
            </div>
          </div>
        {/if}

        {#if data.workSchedule}
          <div class="bg-base-200 rounded-box px-3 py-2">
            <p class="text-base-content/70 text-xs">Work schedule</p>
            <p class="text-sm">
              {data.workSchedule.schedule_name ??
                data.workSchedule.schedule_type}
              {#if data.workSchedule.standard_hours_per_week}
                · {Number(data.workSchedule.standard_hours_per_week)} hours/week
              {/if}
              {#if data.workSchedule.timezone}
                · {data.workSchedule.timezone}
              {/if}
            </p>
          </div>
        {/if}
      {/if}
    </div>
  </div>
</div>
