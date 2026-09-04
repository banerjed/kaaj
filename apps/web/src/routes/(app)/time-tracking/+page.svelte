<script lang="ts">
  import PageTitle from "$lib/components/PageTitle.svelte"
  import { calendarDate, money } from "$lib/format"
  import type { TimeEntryRow } from "$lib/server/time-tracking/time_tracking_entries.repo"
  import { fieldErrors } from "$lib/form-errors"
  import { enhance } from "$app/forms"
  import { closeOnSuccess, keepValues } from "$lib/form-enhance"
  import StatusBadge from "$lib/components/StatusBadge.svelte"
  import { timeEntryStatusTone } from "$lib/components/status-tone"
  import PageHead from "$lib/components/PageHead.svelte"
  import EmptyState from "$lib/components/EmptyState.svelte"

  let { data, form } = $props()

  const err = $derived(fieldErrors(form))
  const tenantLocale = $derived(data.tenant?.default_locale ?? "en-US")

  let creating = $state(false)
  let rejecting = $state<TimeEntryRow | null>(null)

  // Cascades the task picker to the chosen project — plain reactive state,
  // no `use:enhance` involved.
  let creatingProjectId = $state("")
  const tasksForSelected = $derived(
    data.tasks.filter((t) => t.project_id === creatingProjectId),
  )

  const awaitingDecision = $derived(
    data.entries.filter((e) => e.status === "submitted"),
  )
  const mine = $derived(
    data.entries.filter((e) => e.employee_id === data.myEmployeeId),
  )
  // A decided outcome, not a draft still in progress — someone else's draft
  // isn't "history" yet, it's just not visible to this viewer as a draft.
  const history = $derived(
    data.entries.filter(
      (e) => e.status === "approved" || e.status === "rejected",
    ),
  )
</script>

<PageHead title="Time Tracking" />

<div class="p-4 lg:p-6">
  <PageTitle
    title="Time Tracking"
    items={[{ label: "Time Tracking", active: true }]}
  />

  {#if form?.logged}
    <div role="status" class="alert alert-success mt-4">
      <span class="iconify lucide--check size-5"></span>
      <span>Time logged.</span>
    </div>
  {:else if form?.decided}
    <div role="status" class="alert alert-success mt-4">
      <span class="iconify lucide--check size-5"></span>
      <span>Entry {form.decided}.</span>
    </div>
  {:else if form?.message}
    <div role="alert" class="alert alert-error mt-4">
      <span class="iconify lucide--circle-alert size-5"></span>
      <span>{form.message}</span>
    </div>
  {/if}

  <div class="mt-4 flex flex-wrap items-center justify-between gap-2">
    <!-- Filters post as GET so the URL carries the state. -->
    <form method="GET" class="flex flex-wrap items-end gap-2">
      <select name="status" class="select select-sm">
        <option value="" selected={data.filters.status === ""}>
          All statuses
        </option>
        {#each ["draft", "submitted", "approved", "rejected"] as s (s)}
          <option value={s} selected={data.filters.status === s}>
            {s}
          </option>
        {/each}
      </select>
      <label class="label cursor-pointer gap-2">
        <input
          type="checkbox"
          name="mine"
          value="1"
          class="checkbox checkbox-sm"
          checked={data.filters.mine}
        />
        <span class="label-text">My entries only</span>
      </label>
      <button class="btn btn-sm btn-ghost">Filter</button>
    </form>
    <button
      class="btn btn-primary btn-sm"
      onclick={() => {
        creating = true
        creatingProjectId = ""
      }}
    >
      <span class="iconify lucide--plus size-4"></span>
      Log time
    </button>
  </div>

  {#if data.mayApprove}
    <h2 class="mt-6 text-base font-medium">
      Awaiting a decision
      {#if awaitingDecision.length > 0}
        <span class="badge badge-warning badge-sm ms-1"
          >{awaitingDecision.length}</span
        >
      {/if}
    </h2>

    {#if awaitingDecision.length === 0}
      <EmptyState
        icon="lucide--check-check"
        class="mt-2"
        message="Nothing waiting on you."
      />
    {:else}
      <div class="card bg-base-100 mt-2 shadow">
        <div class="overflow-x-auto">
          <table class="table">
            <thead>
              <tr>
                <th>Who</th>
                <th>Project / task</th>
                <th>Date</th>
                <th class="text-right">Hours</th>
                <th>Description</th>
                <th class="w-44">Decision</th>
              </tr>
            </thead>
            <tbody>
              {#each awaitingDecision as e (e.id)}
                <tr class="hover:bg-base-200/40">
                  <td class="font-medium">{e.employee_name}</td>
                  <td class="text-sm">
                    {e.project_name ?? "—"}
                    {#if e.task_name}<br /><span
                        class="text-base-content/70 text-xs">{e.task_name}</span
                      >{/if}
                  </td>
                  <td class="text-sm tabular-nums">
                    {calendarDate(e.entry_date, tenantLocale)}
                  </td>
                  <td class="text-right text-sm tabular-nums">{e.hours}</td>
                  <td class="text-base-content/70 text-sm">{e.description}</td>
                  <td>
                    <div class="flex gap-1">
                      <form
                        method="POST"
                        action="?/decide"
                        use:enhance={keepValues}
                      >
                        <input type="hidden" name="id" value={e.id} />
                        <input type="hidden" name="decision" value="approved" />
                        <button
                          class="btn btn-sm btn-success"
                          disabled={e.employee_id === data.myEmployeeId}
                          title={e.employee_id === data.myEmployeeId
                            ? "You cannot decide your own entry"
                            : "Approve"}
                        >
                          Approve
                        </button>
                      </form>
                      <button
                        class="btn btn-sm btn-ghost text-error"
                        disabled={e.employee_id === data.myEmployeeId}
                        onclick={() => (rejecting = e)}
                      >
                        Reject
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
  {/if}

  <h2 class="mt-6 text-base font-medium">Your drafts</h2>
  {#if mine.filter((e) => e.status === "draft").length === 0}
    <EmptyState icon="lucide--timer" class="mt-2" message="No draft time." />
  {:else}
    <ul class="list bg-base-100 mt-2 shadow">
      {#each mine.filter((e) => e.status === "draft") as e (e.id)}
        <li class="list-row">
          <div class="list-col-grow">
            <p class="font-medium">
              {e.project_name ?? "—"}{#if e.task_name}
                · {e.task_name}{/if}
            </p>
            <p class="text-base-content/70 text-xs">
              {calendarDate(e.entry_date, tenantLocale)} · {e.hours}h ·
              {e.description}
            </p>
          </div>
          <form method="POST" action="?/submit" use:enhance={keepValues}>
            <input type="hidden" name="id" value={e.id} />
            <button class="btn btn-sm btn-outline">Submit</button>
          </form>
        </li>
      {/each}
    </ul>
  {/if}

  {#if history.length > 0}
    <h2 class="mt-6 text-base font-medium">History</h2>
    <div class="card bg-base-100 mt-2 shadow">
      <ul class="list">
        {#each history as e (e.id)}
          <li class="list-row">
            <div class="list-col-grow">
              <p class="font-medium">
                {e.employee_name} · {e.project_name ?? "—"}{#if e.task_name}
                  · {e.task_name}{/if}
              </p>
              <p class="text-base-content/70 text-xs">
                {calendarDate(e.entry_date, tenantLocale)} · {e.hours}h ·
                {e.description}
                {#if e.status === "approved" && e.billable_amount}
                  · {money(
                    e.billable_amount,
                    e.currency ?? "USD",
                    tenantLocale,
                  )}
                {/if}
              </p>
            </div>
            <StatusBadge tone={timeEntryStatusTone(e.status)}>
              {e.status}
            </StatusBadge>
            {#if e.rejection_reason}
              <p class="list-col-wrap text-base-content/70 text-sm">
                {e.rejection_reason}
              </p>
            {/if}
          </li>
        {/each}
      </ul>
    </div>
  {/if}
</div>

<!-- Log time ---------------------------------------------------------- -->
{#if creating}
  <div class="modal modal-open" role="dialog" aria-label="Log time">
    <div class="modal-box max-w-2xl">
      <h3 class="text-lg font-medium">Log time</h3>
      <p class="text-base-content/70 mt-1 text-sm">
        The rate is resolved from the project's rate card automatically.
      </p>

      <form
        method="POST"
        action="?/create"
        class="mt-4 grid gap-4 sm:grid-cols-2"
        use:enhance={closeOnSuccess(() => (creating = false))}
      >
        <fieldset class="fieldset">
          <legend class="fieldset-legend">Project</legend>
          <select
            name="project_id"
            aria-invalid={err.aria("project_id")}
            class={`select w-full ${err.select("project_id")}`}
            required
            bind:value={creatingProjectId}
          >
            <option value="">Select a project</option>
            {#each data.activeProjects as p (p.id)}
              <option value={p.id}>{p.project_name}</option>
            {/each}
          </select>
        </fieldset>

        <fieldset class="fieldset">
          <legend class="fieldset-legend">Task (optional)</legend>
          <select
            name="task_id"
            aria-invalid={err.aria("task_id")}
            class={`select w-full ${err.select("task_id")}`}
            disabled={!creatingProjectId}
          >
            <option value="">No specific task</option>
            {#each tasksForSelected as t (t.id)}
              <option value={t.id}>{t.task_name}</option>
            {/each}
          </select>
        </fieldset>

        <fieldset class="fieldset">
          <legend class="fieldset-legend">Date</legend>
          <input
            name="entry_date"
            type="date"
            aria-invalid={err.aria("entry_date")}
            class={`input w-full ${err.input("entry_date")}`}
            required
          />
        </fieldset>

        <fieldset class="fieldset">
          <legend class="fieldset-legend">Hours</legend>
          <input
            name="hours"
            inputmode="decimal"
            aria-invalid={err.aria("hours")}
            class={`input w-full ${err.input("hours")}`}
            placeholder="7.5"
            required
          />
        </fieldset>

        <label class="label cursor-pointer justify-start gap-2 sm:col-span-2">
          <input
            type="checkbox"
            name="is_billable"
            class="checkbox"
            value="on"
            checked
          />
          <span class="label-text">Billable</span>
        </label>

        <fieldset class="fieldset sm:col-span-2">
          <legend class="fieldset-legend">Description</legend>
          <textarea
            name="description"
            aria-invalid={err.aria("description")}
            class={`textarea w-full ${err.textarea("description")}`}
            rows="2"
            maxlength="2000"
            required
          ></textarea>
        </fieldset>

        <div class="modal-action sm:col-span-2">
          <button
            type="button"
            class="btn btn-ghost"
            onclick={() => (creating = false)}>Cancel</button
          >
          <button type="submit" class="btn btn-primary">Log time</button>
        </div>
      </form>
    </div>
    <button
      class="modal-backdrop"
      aria-label="Close"
      onclick={() => (creating = false)}
    ></button>
  </div>
{/if}

<!-- Reject an entry ----------------------------------------------------- -->
{#if rejecting}
  <div class="modal modal-open" role="dialog" aria-label="Reject entry">
    <div class="modal-box">
      <h3 class="text-lg font-medium">
        Reject {rejecting.employee_name}'s entry
      </h3>
      <p class="text-base-content/70 mt-1 text-sm">
        {rejecting.hours}h on {calendarDate(
          rejecting.entry_date,
          tenantLocale,
        )}.
      </p>
      <form
        method="POST"
        action="?/decide"
        class="mt-4 grid gap-4"
        use:enhance={closeOnSuccess(() => (rejecting = null))}
      >
        <input type="hidden" name="id" value={rejecting.id} />
        <input type="hidden" name="decision" value="rejected" />
        <fieldset class="fieldset">
          <legend class="fieldset-legend">Reason</legend>
          <textarea
            name="rejection_reason"
            aria-invalid={err.aria("rejection_reason")}
            class={`textarea w-full ${err.textarea("rejection_reason")}`}
            rows="2"
            placeholder="Shown to whoever logged this time"
          ></textarea>
        </fieldset>
        <div class="modal-action">
          <button
            type="button"
            class="btn btn-ghost"
            onclick={() => (rejecting = null)}>Cancel</button
          >
          <button type="submit" class="btn btn-error">Reject entry</button>
        </div>
      </form>
    </div>
    <button
      class="modal-backdrop"
      aria-label="Close"
      onclick={() => (rejecting = null)}
    ></button>
  </div>
{/if}
