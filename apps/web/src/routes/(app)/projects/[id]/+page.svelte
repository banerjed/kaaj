<script lang="ts">
  import PageTitle from "$lib/components/PageTitle.svelte"
  import { calendarDate, money, number } from "$lib/format"
  import { fieldErrors } from "$lib/form-errors"
  import StatusBadge from "$lib/components/StatusBadge.svelte"
  import type { Tone } from "$lib/components/status-tone"
  import PageHead from "$lib/components/PageHead.svelte"
  import EmptyState from "$lib/components/EmptyState.svelte"

  let { data, form } = $props()

  // Which field to put the highlight on. The action names them in
  // `errorFields`; colour alone is not enough, so `aria-invalid` goes with it.
  const err = $derived(fieldErrors(form))

  let addingTask = $state(false)
  let editing = $state(false)

  const label = (v: string | null) => (v ?? "").replace(/_/g, " ")

  const tenantLocale = $derived(data.tenant?.default_locale ?? "en-US")
  const locale = $derived(
    data.project.currency === "GBP"
      ? "en-GB"
      : data.project.currency === "INR"
        ? "en-IN"
        : tenantLocale,
  )

  // `medium` was `badge-neutral` — the heaviest badge in the set, on the least
  // remarkable value. The word is still there, which is what carries the
  // meaning; the colour was doing redundant work.
  const priorityTone = (p: string | null): Tone =>
    p === "urgent" ? "critical" : p === "high" ? "caution" : "neutral"

  const statusTone = (s: string | null): Tone =>
    s === "done" ? "positive" : s === "in_progress" ? "progress" : "neutral"

  const pct = (v: string | null) => Math.round(Number(v ?? 0))
</script>

<PageHead title={data.project.project_name} />

<div class="p-4 lg:p-6">
  <PageTitle
    title={data.project.project_name}
    items={[
      { label: "Business Operations", path: "/projects" },
      { label: "Projects", path: "/projects" },
      { label: data.project.project_number ?? "Project", active: true },
    ]}
  />

  {#if form?.added}
    <div role="status" class="alert alert-success mt-4">
      <span class="iconify lucide--check size-5"></span>
      <span>{form.added} added.</span>
    </div>
  {:else if form?.moved}
    <div role="status" class="alert alert-success mt-4">
      <span class="iconify lucide--check size-5"></span>
      <span>
        {form.moved}: {label(form.from)} → {label(form.to)}.
      </span>
    </div>
  {:else if form?.saved}
    <div role="status" class="alert alert-success mt-4">
      <span class="iconify lucide--check size-5"></span>
      <span>Project saved.</span>
    </div>
  {:else if form?.message}
    <div role="alert" class="alert alert-error mt-4">
      <span class="iconify lucide--circle-alert size-5"></span>
      <span>{form.message}</span>
    </div>
  {/if}

  <div class="card bg-base-100 mt-4 shadow">
    <div class="card-body gap-3 p-4">
      <div class="flex flex-wrap items-baseline justify-between gap-2">
        <p class="text-base-content/70 text-sm">
          {data.project.project_number}
          {#if data.project.client_name}· {data.project.client_name}{/if}
          {#if data.project.manager_name}· led by {data.project
              .manager_name}{/if}
        </p>
        <div class="flex gap-1">
          <span class="badge badge-sm capitalize">
            {data.project.health_status?.replace(/_/g, " ")}
          </span>
          <span class="badge badge-sm capitalize">
            {data.project.status?.replace(/_/g, " ")}
          </span>
          {#if data.mayWrite}
            <button
              type="button"
              class="btn btn-ghost btn-xs"
              onclick={() => (editing = true)}
            >
              <span class="iconify lucide--pencil size-3.5"></span>
              Edit
            </button>
          {/if}
        </div>
      </div>

      <dl class="grid gap-3 sm:grid-cols-4">
        <div>
          <dt class="text-base-content/70 text-xs">Budget</dt>
          <dd class="text-lg font-medium tabular-nums">
            {money(data.project.budget, data.project.currency ?? "USD", locale)}
          </dd>
        </div>
        <div>
          <dt class="text-base-content/70 text-xs">Spent</dt>
          <dd class="text-lg font-medium tabular-nums">
            {money(
              data.project.actual_cost,
              data.project.currency ?? "USD",
              locale,
            )}
          </dd>
        </div>
        <div>
          <dt class="text-base-content/70 text-xs">Hours</dt>
          <dd class="text-lg font-medium tabular-nums">
            {number(data.project.actual_hours ?? "0", locale)}
            <span class="text-base-content/70 text-sm">
              / {number(data.project.estimated_hours ?? "0", locale)}
            </span>
          </dd>
        </div>
        <div>
          <dt class="text-base-content/70 text-xs">Target</dt>
          <dd class="text-lg font-medium tabular-nums">
            {data.project.target_end_date
              ? calendarDate(data.project.target_end_date, locale)
              : "—"}
          </dd>
        </div>
      </dl>
    </div>
  </div>

  <h2 class="mt-6 text-base font-medium">
    Tasks
    <span class="badge badge-sm ms-1">{data.tasks.length}</span>
    <!-- The counter on the project row is shown only when it DISAGREES with
         the tasks actually present. A denormalised count that nobody checks
         drifts, and it drifts into a progress bar that still looks right. -->
    {#if data.project.task_count !== data.tasks.length}
      <span class="badge badge-error badge-sm ms-1">
        row claims {data.project.task_count}
      </span>
    {/if}
    {#if data.mayWrite}
      <button
        type="button"
        class="btn btn-outline btn-xs ms-2"
        onclick={() => (addingTask = true)}
      >
        <span class="iconify lucide--plus size-3.5"></span>
        Add task
      </button>
    {/if}
  </h2>

  {#if data.tasks.length === 0}
    <EmptyState
      icon="lucide--list-checks"
      class="mt-2"
      message="No tasks on this project yet."
    />
  {:else}
    <div class="card bg-base-100 mt-2 shadow">
      <div class="overflow-x-auto">
        <table class="table">
          <thead>
            <tr>
              <th>Task</th>
              <th>Assignee</th>
              <th>Priority</th>
              <th>Due</th>
              <th class="text-right">Hours</th>
              <th class="w-32">Progress</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
            {#each data.tasks as t (t.id)}
              <tr class="hover:bg-base-200/40">
                <td class="font-medium">{t.task_name}</td>
                <td class="text-base-content/70 text-sm">
                  {t.assignee_name ?? "Unassigned"}
                </td>
                <td>
                  <StatusBadge tone={priorityTone(t.priority)}>
                    {t.priority}
                  </StatusBadge>
                </td>
                <td class="text-sm tabular-nums">
                  {t.due_date ? calendarDate(t.due_date, locale) : "—"}
                  {#if t.is_overdue}
                    <span class="badge badge-error badge-sm ms-1">overdue</span>
                  {/if}
                </td>
                <td class="text-right text-sm tabular-nums">
                  {number(t.actual_hours ?? "0", locale)} / {number(
                    t.estimated_hours ?? "0",
                    locale,
                  )}
                </td>
                <td>
                  <progress
                    class="progress progress-primary w-full"
                    value={pct(t.progress_percentage)}
                    max="100"
                  ></progress>
                </td>
                <td>
                  {#if data.mayWrite}
                    <!--
                      A plain form per row: changing the select submits it.
                      The move is a POST, never a GET — it writes, and a link
                      that writes is a link a crawler can pull.
                    -->
                    <form method="POST" action="?/moveTask">
                      <input type="hidden" name="task_id" value={t.id} />
                      <select
                        name="status"
                        aria-invalid={err.aria("status")}
                        class={`select select-sm capitalize ${err.select("status")}`}
                        aria-label={`Status of ${t.task_name}`}
                        value={t.status}
                        onchange={(e) => e.currentTarget.form?.requestSubmit()}
                      >
                        {#each data.taskStatuses as s (s)}
                          <option value={s} class="capitalize"
                            >{label(s)}</option
                          >
                        {/each}
                      </select>
                      <!-- Works with scripting off, where onchange does not. -->
                      <noscript>
                        <button class="btn btn-sm">Move</button>
                      </noscript>
                    </form>
                  {:else}
                    <StatusBadge tone={statusTone(t.status)}>
                      {label(t.status)}
                    </StatusBadge>
                  {/if}
                </td>
              </tr>
            {/each}
          </tbody>
        </table>
      </div>
    </div>
  {/if}
</div>

<!-- Add a task ----------------------------------------------------------- -->
{#if addingTask}
  <div class="modal modal-open" role="dialog" aria-label="Add task">
    <div class="modal-box max-w-2xl">
      <h3 class="text-lg font-medium">Add a task</h3>
      <p class="text-base-content/70 mt-1 text-sm">
        To {data.project.project_name}. The task number is assigned
        automatically.
      </p>

      <form
        method="POST"
        action="?/addTask"
        class="mt-4 grid gap-4 sm:grid-cols-2"
      >
        <fieldset class="fieldset sm:col-span-2">
          <legend class="fieldset-legend">Name</legend>
          <input
            name="task_name"
            aria-invalid={err.aria("task_name")}
            class={`input w-full ${err.input("task_name")}`}
            maxlength="200"
            required
            autocomplete="off"
          />
        </fieldset>

        <fieldset class="fieldset">
          <legend class="fieldset-legend">Status</legend>
          <select
            name="status"
            aria-invalid={err.aria("status")}
            class={`select w-full ${err.select("status")}`}
            required
          >
            {#each data.taskStatuses as s (s)}
              <option value={s} selected={s === "todo"} class="capitalize">
                {label(s)}
              </option>
            {/each}
          </select>
        </fieldset>

        <fieldset class="fieldset">
          <legend class="fieldset-legend">Priority</legend>
          <select
            name="priority"
            aria-invalid={err.aria("priority")}
            class={`select w-full ${err.select("priority")}`}
          >
            {#each data.taskPriorities as p (p)}
              <option value={p} selected={p === "medium"} class="capitalize">
                {p}
              </option>
            {/each}
          </select>
        </fieldset>

        <fieldset class="fieldset">
          <legend class="fieldset-legend">Assignee</legend>
          <select
            name="assigned_to"
            aria-invalid={err.aria("assigned_to")}
            class={`select w-full ${err.select("assigned_to")}`}
          >
            <option value="">Unassigned</option>
            {#each data.assignees as a (a.id)}
              <option value={a.id}>{a.name}</option>
            {/each}
          </select>
        </fieldset>

        <fieldset class="fieldset">
          <legend class="fieldset-legend">Estimated hours</legend>
          <input
            name="estimated_hours"
            aria-invalid={err.aria("estimated_hours")}
            class={`input w-full ${err.input("estimated_hours")}`}
            inputmode="decimal"
          />
        </fieldset>

        <fieldset class="fieldset">
          <legend class="fieldset-legend">Starts</legend>
          <input
            name="start_date"
            aria-invalid={err.aria("start_date")}
            type="date"
            class={`input w-full ${err.input("start_date")}`}
          />
        </fieldset>

        <fieldset class="fieldset">
          <legend class="fieldset-legend">Due</legend>
          <input
            name="due_date"
            aria-invalid={err.aria("due_date")}
            type="date"
            class={`input w-full ${err.input("due_date")}`}
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
          ></textarea>
        </fieldset>

        <div class="modal-action sm:col-span-2">
          <button
            type="button"
            class="btn btn-ghost"
            onclick={() => (addingTask = false)}>Cancel</button
          >
          <button type="submit" class="btn btn-primary">Add task</button>
        </div>
      </form>
    </div>
    <button
      class="modal-backdrop"
      aria-label="Close"
      onclick={() => (addingTask = false)}
    ></button>
  </div>
{/if}

<!-- Edit the project ----------------------------------------------------- -->
{#if editing}
  <div class="modal modal-open" role="dialog" aria-label="Edit project">
    <div class="modal-box max-w-2xl">
      <h3 class="text-lg font-medium">Edit {data.project.project_number}</h3>
      <p class="text-base-content/70 mt-1 text-sm">
        Changes to the budget, the rate and the billable flag are recorded in
        the audit trail — they are what this work is billed on.
      </p>

      <form
        method="POST"
        action="?/updateProject"
        class="mt-4 grid gap-4 sm:grid-cols-2"
      >
        <fieldset class="fieldset sm:col-span-2">
          <legend class="fieldset-legend">Name</legend>
          <input
            name="project_name"
            aria-invalid={err.aria("project_name")}
            class={`input w-full ${err.input("project_name")}`}
            maxlength="200"
            required
            value={data.project.project_name}
          />
        </fieldset>

        <fieldset class="fieldset">
          <legend class="fieldset-legend">Status</legend>
          <select
            name="status"
            aria-invalid={err.aria("status")}
            class={`select w-full ${err.select("status")}`}
            required
          >
            {#each data.projectStatuses as s (s)}
              <option
                value={s}
                selected={s === data.project.status}
                class="capitalize">{label(s)}</option
              >
            {/each}
          </select>
        </fieldset>

        <fieldset class="fieldset">
          <legend class="fieldset-legend">Priority</legend>
          <select
            name="priority"
            aria-invalid={err.aria("priority")}
            class={`select w-full ${err.select("priority")}`}
            required
          >
            {#each data.projectPriorities as p (p)}
              <option
                value={p}
                selected={p === data.project.priority}
                class="capitalize">{p}</option
              >
            {/each}
          </select>
        </fieldset>

        <fieldset class="fieldset">
          <legend class="fieldset-legend">Health</legend>
          <select
            name="health_status"
            aria-invalid={err.aria("health_status")}
            class={`select w-full ${err.select("health_status")}`}
            required
          >
            {#each data.projectHealths as h (h)}
              <option
                value={h}
                selected={h === data.project.health_status}
                class="capitalize">{label(h)}</option
              >
            {/each}
          </select>
        </fieldset>

        <fieldset class="fieldset">
          <legend class="fieldset-legend">Target end</legend>
          <input
            name="target_end_date"
            aria-invalid={err.aria("target_end_date")}
            type="date"
            class={`input w-full ${err.input("target_end_date")}`}
            value={data.project.target_end_date ?? ""}
          />
        </fieldset>

        <fieldset class="fieldset">
          <legend class="fieldset-legend">Budget</legend>
          <input
            name="budget"
            aria-invalid={err.aria("budget")}
            class={`input w-full ${err.input("budget")}`}
            inputmode="decimal"
            value={data.project.budget ?? ""}
          />
        </fieldset>

        <fieldset class="fieldset">
          <legend class="fieldset-legend">Currency</legend>
          <input
            name="currency"
            aria-invalid={err.aria("currency")}
            class={`input w-full uppercase ${err.input("currency")}`}
            maxlength="3"
            required
            value={data.project.currency ?? "USD"}
          />
        </fieldset>

        <fieldset class="fieldset">
          <legend class="fieldset-legend">Hourly rate</legend>
          <input
            name="hourly_rate"
            aria-invalid={err.aria("hourly_rate")}
            class={`input w-full ${err.input("hourly_rate")}`}
            inputmode="decimal"
            value={data.project.hourly_rate ?? ""}
          />
        </fieldset>

        <label class="label cursor-pointer justify-start gap-2">
          <input
            type="checkbox"
            name="is_billable"
            class="checkbox"
            value="on"
            checked={data.project.is_billable ?? false}
          />
          <span class="label-text">Billable</span>
        </label>

        <div class="modal-action sm:col-span-2">
          <button
            type="button"
            class="btn btn-ghost"
            onclick={() => (editing = false)}>Cancel</button
          >
          <button type="submit" class="btn btn-primary">Save project</button>
        </div>
      </form>
    </div>
    <button
      class="modal-backdrop"
      aria-label="Close"
      onclick={() => (editing = false)}
    ></button>
  </div>
{/if}
