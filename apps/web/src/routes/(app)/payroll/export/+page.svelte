<script lang="ts">
  import PageTitle from "$lib/components/PageTitle.svelte"
  import PageHead from "$lib/components/PageHead.svelte"
  import Pagination from "$lib/components/Pagination.svelte"
  import EmptyState from "$lib/components/EmptyState.svelte"
  import {
    HOUR_TYPE_LABELS,
    LAYOUT_CONFIRMED,
    PROVIDER_LABELS,
    type HourType,
  } from "$lib/payroll/export-formats"
  import { page as pageState } from "$app/state"
  import { WebsiteName } from "../../../../config"

  let { data } = $props()

  const provider = $derived(data.settings?.provider ?? null)
  const review = $derived(data.review)
  const invalid = $derived(
    "invalid" in data
      ? (data.invalid as { message: string; errorFields: string[] })
      : null,
  )
  const params = $derived(pageState.url.searchParams)
  const from = $derived(params.get("from") ?? data.defaults.from)
  const to = $derived(params.get("to") ?? data.defaults.to)
  const frequency = $derived(params.get("frequency") ?? "")

  const sourceLabel = (s: string) =>
    s.startsWith("time_off:")
      ? `Time off: ${s.slice("time_off:".length)}`
      : HOUR_TYPE_LABELS[s as HourType]

  const names = (p: { first: { name: string }[]; total: number }) =>
    p.first.map((m) => m.name).join(", ") +
    (p.total > p.first.length ? ", …" : "")

  const codeFor = (s: string) => {
    const m = review?.mappings.find((x) => x.source === s)
    return m === undefined ? null : (m.code ?? "not exported")
  }

  const fileHref = $derived(
    review
      ? `/payroll/export/file?${new URLSearchParams({
          from: review.period.from,
          to: review.period.to,
          ...(review.period.frequency
            ? { frequency: review.period.frequency }
            : {}),
        })}`
      : "",
  )

  function hrefFor(n: number) {
    const q = new URLSearchParams(params)
    q.set("page", String(n))
    return `?${q}`
  }

  const FREQUENCY_LABELS: Record<string, string> = {
    weekly: "Weekly",
    "bi-weekly": "Bi-weekly",
    "semi-monthly": "Semi-monthly",
    monthly: "Monthly",
    quarterly: "Quarterly",
  }
</script>

<PageHead title="Export to Payroll" />

<div class="p-4 lg:p-6">
  <PageTitle
    title="Export to Payroll"
    items={[
      { label: "Payroll", path: "/payroll/export" },
      { label: "Export to Payroll", active: true },
    ]}
  />

  {#if !provider}
    <EmptyState
      icon="lucide--wallet"
      title="No payroll provider chosen"
      message="{WebsiteName} exports approved hours and time off as a file your payroll provider imports. Choose the provider first."
    />
    <div class="mt-4 text-center">
      <a class="btn btn-primary btn-sm" href="/payroll/export/settings"
        >Payroll export settings</a
      >
    </div>
  {:else}
    <p class="text-base-content/70 mt-2 text-sm">
      Hours for <strong>{PROVIDER_LABELS[provider]}</strong>: approved time of
      hourly employees, with overtime by each office's payroll policy, and
      approved time off for everyone. {WebsiteName}
      does not calculate pay; {PROVIDER_LABELS[provider]} does, from this file.
      <a class="link" href="/payroll/export/settings">Settings</a>
      ·
      <a class="link" href="/payroll/employee-ids">Employee payroll ids</a>
    </p>

    {#if !LAYOUT_CONFIRMED[provider]}
      <div role="status" class="alert alert-warning mt-4">
        <span class="iconify lucide--triangle-alert size-5"></span>
        <span>
          {PROVIDER_LABELS[provider]} does not publish this file layout. {WebsiteName}
          follows the layout that other products use. Check the first import carefully,
          and tell us if a column is refused.
        </span>
      </div>
    {/if}

    <form method="GET" class="mt-4 flex flex-wrap items-end gap-3">
      <fieldset class="fieldset">
        <legend class="fieldset-legend">First day</legend>
        <input
          type="date"
          name="from"
          value={from}
          class="input input-sm"
          class:input-error={invalid?.errorFields.includes("from")}
          aria-invalid={invalid?.errorFields.includes("from") || undefined}
        />
      </fieldset>
      <fieldset class="fieldset">
        <legend class="fieldset-legend">Last day</legend>
        <input
          type="date"
          name="to"
          value={to}
          class="input input-sm"
          class:input-error={invalid?.errorFields.includes("to")}
          aria-invalid={invalid?.errorFields.includes("to") || undefined}
        />
      </fieldset>
      <fieldset class="fieldset">
        <legend class="fieldset-legend">Pay frequency</legend>
        <select
          name="frequency"
          class="select select-sm"
          class:select-error={invalid?.errorFields.includes("frequency")}
          aria-invalid={invalid?.errorFields.includes("frequency") || undefined}
        >
          {#if provider !== "adp_run"}
            <option value="" selected={frequency === ""}>All employees</option>
          {/if}
          {#each Object.entries(FREQUENCY_LABELS) as [value, label] (value)}
            <option {value} selected={frequency === value}>{label}</option>
          {/each}
        </select>
      </fieldset>
      <button class="btn btn-primary btn-sm">Review</button>
    </form>

    {#if invalid}
      <div role="alert" class="alert alert-error mt-4">
        <span class="iconify lucide--circle-alert size-5"></span>
        <span>{invalid.message}</span>
      </div>
    {/if}

    {#if review}
      {#if review.refused}
        <div role="alert" class="alert alert-error mt-4 items-start">
          <span class="iconify lucide--circle-alert size-5"></span>
          <div class="grid gap-1">
            <p class="font-medium">
              The file would leave someone out, so it cannot be downloaded yet.
            </p>
            {#if review.problems.missing_ids.total}
              <p>
                {review.problems.missing_ids.total}
                {review.problems.missing_ids.total === 1
                  ? "employee has"
                  : "employees have"} no
                {PROVIDER_LABELS[provider]} id: {names(
                  review.problems.missing_ids,
                )}.
                <a class="link" href="/payroll/employee-ids?missing=1"
                  >Add the ids</a
                >.
              </p>
            {/if}
            {#if review.problems.unmapped_sources.length}
              <p>
                No {PROVIDER_LABELS[provider]} code for:
                {review.problems.unmapped_sources.map(sourceLabel).join(", ")}.
                <a class="link" href="/payroll/export/settings">Map the codes</a
                >.
              </p>
            {/if}
            {#if review.problems.no_overtime_rule.total}
              <p>
                {review.problems.no_overtime_rule.total} overtime-eligible
                {review.problems.no_overtime_rule.total === 1
                  ? "employee works"
                  : "employees work"} in an office with no overtime rule, and there
                is no firm-wide one: {names(review.problems.no_overtime_rule)}.
                Every hour would go out as regular.
                <a class="link" href="/settings/payroll/policies"
                  >Add a payroll policy</a
                >.
              </p>
            {/if}
            {#if review.problems.no_pay_record.total}
              <p>
                {review.problems.no_pay_record.total}
                {review.problems.no_pay_record.total === 1
                  ? "employee has"
                  : "employees have"} approved time in this period and no pay record
                to say how it is paid: {names(review.problems.no_pay_record)}.
                <a class="link" href="/compensation">Check their compensation</a
                >.
              </p>
            {/if}
            {#if review.problems.duplicate_names.total}
              <p>
                Gusto matches employees by name, and {review.problems
                  .duplicate_names.total}
                {review.problems.duplicate_names.total === 1
                  ? "name belongs"
                  : "names belong"} to more than one employee:
                {review.problems.duplicate_names.first.join(", ")}{review
                  .problems.duplicate_names.total > 10
                  ? ", …"
                  : ""}. Enter their hours in Gusto by hand.
              </p>
            {/if}
          </div>
        </div>
      {/if}

      {#if review.notes.unapproved_entries > 0}
        <div role="status" class="alert alert-warning mt-4">
          <span class="iconify lucide--triangle-alert size-5"></span>
          <span>
            {review.notes.unapproved_entries} time
            {review.notes.unapproved_entries === 1 ? "entry is" : "entries are"} in
            this period but not approved, so not in the file.
            <a class="link" href="/time-tracking">Approve time</a>.
          </span>
        </div>
      {/if}

      {#if review.notes.prorated.length}
        <div role="status" class="alert alert-info mt-4 items-start">
          <span class="iconify lucide--info size-5"></span>
          <div>
            <p>
              {review.notes.prorated_total} time-off
              {review.notes.prorated_total === 1
                ? "request extends"
                : "requests extend"} outside the period. The file holds the part on
              weekdays inside the period{review.notes.prorated_total > 10
                ? ". The first ten:"
                : ":"}
            </p>
            <ul class="list-disc ps-5">
              {#each review.notes.prorated as r (r.employee + r.policy_code + r.start_date)}
                <li>
                  {r.employee}, {r.policy_code}, {r.start_date} to {r.end_date}
                </li>
              {/each}
            </ul>
          </div>
        </div>
      {/if}

      <p class="text-base-content/70 mt-4 text-sm">
        Not in the file: holidays, bonuses, commissions and reimbursements.
        Enter those in
        {PROVIDER_LABELS[provider]}. Do not open the file in Excel and save it
        again: Excel removes the leading zeros of ids. Import each period once:
        a second import of the same file can add the hours again.
      </p>

      {#if review.employeeCount === 0}
        <EmptyState
          icon="lucide--clock"
          title="Nothing to export"
          message="No approved hours of hourly employees, and no approved time off, in this period."
        />
      {:else}
        <div class="card bg-base-100 mt-4 shadow">
          <div class="overflow-x-auto">
            <table class="table table-sm">
              <caption class="sr-only">Hours by employee</caption>
              <thead>
                <tr>
                  <th scope="col">Employee</th>
                  <th scope="col">{PROVIDER_LABELS[provider]} id</th>
                  {#each review.sources as s (s)}
                    <th scope="col" class="text-end">
                      {sourceLabel(s)}
                      <span class="text-base-content/70 block font-normal"
                        >{codeFor(s) ?? "no code"}</span
                      >
                    </th>
                  {/each}
                </tr>
              </thead>
              <tbody>
                {#each review.rows as r (r.employee_id)}
                  <tr>
                    <td
                      >{r.name}
                      <span class="text-base-content/70">{r.employee_code}</span
                      ></td
                    >
                    <td>
                      {#if r.external_id}{r.external_id}{:else if provider === "gusto"}<span
                          class="text-base-content/70">by name</span
                        >{:else}<span class="text-error">missing</span>{/if}
                    </td>
                    {#each review.sources as s (s)}
                      <td class="text-end tabular-nums">{r.hours[s] ?? ""}</td>
                    {/each}
                  </tr>
                {/each}
              </tbody>
              <tfoot>
                <tr>
                  <th scope="row" colspan="2"
                    >Total, {review.employeeCount} employees</th
                  >
                  {#each review.sources as s (s)}
                    <td class="text-end tabular-nums">{review.totals[s]}</td>
                  {/each}
                </tr>
              </tfoot>
            </table>
          </div>
          <Pagination
            page={review.page}
            pageSize={review.pageSize}
            total={review.employeeCount}
            {hrefFor}
          />
        </div>
      {/if}

      <div class="mt-4 flex justify-end">
        {#if review.refused || review.employeeCount === 0}
          <button class="btn btn-primary" disabled>Download file</button>
        {:else}
          <a class="btn btn-primary gap-2" href={fileHref} download>
            <span class="iconify lucide--download size-4"></span>
            Download file for {PROVIDER_LABELS[provider]}
          </a>
        {/if}
      </div>
    {/if}
  {/if}
</div>
