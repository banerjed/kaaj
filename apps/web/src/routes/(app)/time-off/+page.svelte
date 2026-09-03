<script lang="ts">
  import PageTitle from "$lib/components/PageTitle.svelte"
  import { calendarDate, number } from "$lib/format"
  import type { TimeOffRequest } from "$lib/server/hr/hr_time_off_requests.repo"
  import { fieldErrors } from "$lib/form-errors"
  import { enhance } from "$app/forms"
  import { closeOnSuccess, keepValues } from "$lib/form-enhance"
  import StatusBadge from "$lib/components/StatusBadge.svelte"
  import type { Tone } from "$lib/components/status-tone"

  let { data, form } = $props()

  // Which field to put the highlight on. The action names them in
  // `errorFields`; colour alone is not enough, so `aria-invalid` goes with it.
  const err = $derived(fieldErrors(form))

  const tenantLocale = $derived(data.tenant?.default_locale ?? "en-US")

  /** A leave date belongs to the requester's office, so it reads in its locale. */
  const officeLocale = (code: string | null) =>
    data.locations.find((l) => l.location_code === code)?.locale ?? tenantLocale

  const pending = $derived(data.requests.filter((r) => r.status === "pending"))
  const decided = $derived(data.requests.filter((r) => r.status !== "pending"))

  /** Hours are stored; balances are in days. One place to convert. */
  const HOURS_PER_DAY = 8
  const asDays = (hours: string) => Number(hours) / HOURS_PER_DAY
  /** UI chrome is English-only by decision, so this needs no Intl.PluralRules. */
  const days = (hours: string) => {
    const n = asDays(hours)
    return `${n} ${n === 1 ? "day" : "days"}`
  }

  let denying = $state<TimeOffRequest | null>(null)

  const statusTone = (s: string): Tone =>
    s === "approved" ? "positive" : s === "denied" ? "critical" : "caution"

  // A balance that has gone negative is a real state — an adjustment, or leave
  // taken in advance — and it should be visible rather than clamped to zero.
  const balanceClass = (v: string) =>
    Number(v) < 0 ? "text-error" : Number(v) < 2 ? "text-warning" : ""
</script>

<svelte:head>
  <title>Time Off · Kaaj</title>
</svelte:head>

<div class="p-4 lg:p-6">
  <PageTitle
    title="Time Off"
    items={[
      { label: "HR", path: "/time-off" },
      { label: "Time Off", active: true },
    ]}
  />

  {#if form?.decided}
    <div role="status" class="alert alert-success mt-4">
      <span class="iconify lucide--check size-5"></span>
      <span>Request {form.decided}.</span>
    </div>
  {:else if form?.message}
    <div role="alert" class="alert alert-error mt-4">
      <span class="iconify lucide--circle-alert size-5"></span>
      <span>{form.message}</span>
    </div>
  {/if}

  <!-- Your own balances ------------------------------------------------- -->
  {#if data.myBalances.length > 0}
    <div class="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
      {#each data.myBalances as b (b.id)}
        <div class="card bg-base-100 shadow">
          <div class="card-body gap-1 p-4">
            <p class="text-base-content/70 text-xs">{b.policy_name}</p>
            <p
              class={`text-2xl font-medium tabular-nums ${balanceClass(b.current_balance)}`}
            >
              {number(b.current_balance, tenantLocale)}
              <span class="text-base-content/70 text-sm"
                >{b.unit ?? "days"}</span
              >
            </p>
            <p class="text-base-content/70 text-xs">
              available now
              {#if Number(b.pending) > 0}
                · {number(b.pending, tenantLocale)} already requested
              {/if}
            </p>
          </div>
        </div>
      {/each}
    </div>
    <p class="text-base-content/70 mt-2 text-xs">
      Available already excludes anything requested and not yet decided.
    </p>
  {/if}

  <!-- Approval queue ----------------------------------------------------- -->
  <h2 class="mt-6 text-base font-medium">
    Awaiting a decision
    {#if pending.length > 0}
      <span class="badge badge-warning badge-sm ms-1">{pending.length}</span>
    {/if}
  </h2>

  {#if pending.length === 0}
    <div class="card bg-base-100 mt-2 shadow">
      <div class="card-body items-center py-10 text-center">
        <span class="iconify lucide--check-check text-base-content/30 size-8"
        ></span>
        <p class="text-base-content/70 text-sm">Nothing waiting on you.</p>
      </div>
    </div>
  {:else}
    <div class="card bg-base-100 mt-2 shadow">
      <div class="overflow-x-auto">
        <table class="table">
          <thead>
            <tr>
              <th>Who</th>
              <th>Policy</th>
              <th>Dates</th>
              <th class="text-right">Days</th>
              <th>Reason</th>
              <th class="w-40">Decision</th>
            </tr>
          </thead>
          <tbody>
            {#each pending as r (r.id)}
              <tr class="hover:bg-base-200/40">
                <td class="font-medium">{r.employee_name}</td>
                <td class="text-sm">{r.policy_name ?? r.policy_code}</td>
                <td class="text-sm tabular-nums">
                  {calendarDate(r.start_date, officeLocale(r.location_code))}
                  {#if r.end_date !== r.start_date}
                    – {calendarDate(r.end_date, officeLocale(r.location_code))}
                  {/if}
                </td>
                <td class="text-right text-sm tabular-nums">
                  {asDays(r.total_hours)}
                </td>
                <td class="text-base-content/70 text-sm">{r.reason ?? "—"}</td>
                <td>
                  <div class="flex gap-1">
                    <form
                      method="POST"
                      action="?/decide"
                      use:enhance={keepValues}
                    >
                      <input type="hidden" name="id" value={r.id} />
                      <input type="hidden" name="decision" value="approved" />
                      <button
                        class="btn btn-sm btn-success"
                        disabled={r.employee_id === data.myEmployeeId}
                        title={r.employee_id === data.myEmployeeId
                          ? "You cannot decide your own request"
                          : "Approve"}
                      >
                        Approve
                      </button>
                    </form>
                    <button
                      class="btn btn-sm btn-ghost text-error"
                      disabled={r.employee_id === data.myEmployeeId}
                      onclick={() => (denying = r)}
                    >
                      Deny
                    </button>
                  </div>
                </td>
              </tr>
            {/each}
          </tbody>
        </table>
      </div>
    </div>
  {/if}

  <!-- History ------------------------------------------------------------ -->
  {#if decided.length > 0}
    <h2 class="mt-6 text-base font-medium">Decided</h2>
    <div class="card bg-base-100 mt-2 shadow">
      <ul class="list">
        {#each decided as r (r.id)}
          <li class="list-row">
            <div class="list-col-grow">
              <p class="font-medium">{r.employee_name}</p>
              <p class="text-base-content/70 text-xs">
                {r.policy_name ?? r.policy_code} ·
                {calendarDate(r.start_date, officeLocale(r.location_code))}
                {#if r.end_date !== r.start_date}
                  – {calendarDate(r.end_date, officeLocale(r.location_code))}
                {/if}
                · {days(r.total_hours)}
              </p>
            </div>
            <div class="flex items-center gap-2">
              <StatusBadge tone={statusTone(r.status)} capitalize={false}>
                {r.status}
              </StatusBadge>
            </div>
            {#if r.denial_reason}
              <p class="list-col-wrap text-base-content/70 text-sm">
                {r.denial_reason}
              </p>
            {/if}
          </li>
        {/each}
      </ul>
    </div>
  {/if}
</div>

{#if denying}
  <div class="modal modal-open" role="dialog" aria-label="Deny request">
    <div class="modal-box">
      <h3 class="text-lg font-medium">
        Deny {denying.employee_name}'s request
      </h3>
      <p class="text-base-content/70 mt-1 text-sm">
        {days(denying.total_hours)} from
        {calendarDate(denying.start_date, officeLocale(denying.location_code))}.
        The days go back to their balance.
      </p>
      <form
        method="POST"
        action="?/decide"
        class="mt-4 grid gap-4"
        use:enhance={closeOnSuccess(() => (denying = null))}
      >
        <input type="hidden" name="id" value={denying.id} />
        <input type="hidden" name="decision" value="denied" />
        <fieldset class="fieldset">
          <legend class="fieldset-legend">Reason</legend>
          <textarea
            name="denial_reason"
            aria-invalid={err.aria("denial_reason")}
            class={`textarea w-full ${err.textarea("denial_reason")}`}
            rows="2"
            placeholder="Shown to the requester"
          ></textarea>
        </fieldset>
        <div class="modal-action">
          <button
            type="button"
            class="btn btn-ghost"
            onclick={() => (denying = null)}>Cancel</button
          >
          <button type="submit" class="btn btn-error">Deny request</button>
        </div>
      </form>
    </div>
    <button
      class="modal-backdrop"
      aria-label="Close"
      onclick={() => (denying = null)}
    ></button>
  </div>
{/if}
