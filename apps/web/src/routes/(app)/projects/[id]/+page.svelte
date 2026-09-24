<script lang="ts">
  import PageTitle from "$lib/components/PageTitle.svelte"
  import { calendarDate, localeForCurrency, money, number } from "$lib/format"
  import { fieldErrors } from "$lib/form-errors"
  import { enhance } from "$app/forms"
  import { closeOnSuccess, keepValues } from "$lib/form-enhance"
  import StatusBadge from "$lib/components/StatusBadge.svelte"
  import type { Tone } from "$lib/components/status-tone"
  import {
    projectHealthTone as healthTone,
    projectStatusTone,
  } from "$lib/components/status-tone"
  import PageHead from "$lib/components/PageHead.svelte"
  import EmptyState from "$lib/components/EmptyState.svelte"
  import type { TaskRow } from "$lib/server/projects/projects.repo"

  let { data, form } = $props()

  const err = $derived(fieldErrors(form))

  let addingTask = $state(false)
  let editing = $state(false)
  /** The Kanban board reuses `moveTask` — no second status-writing path. */
  let view = $state<"list" | "kanban">("list")
  /** The task id, not the row itself — so the modal reflects `data.tasks`
      after `update()` refreshes it, rather than a stale snapshot. */
  let managingDependenciesFor = $state<string | null>(null)
  const managingDependenciesTask = $derived(
    data.tasks.find((t) => t.id === managingDependenciesFor) ?? null,
  )

  const label = (v: string | null) => (v ?? "").replace(/_/g, " ")

  // depth_level === 0 only — a subtask cannot itself have a subtask.
  const topLevelTasks = $derived(data.tasks.filter((t) => t.depth_level === 0))
  const subtasksOf = (parentId: string) =>
    data.tasks.filter((t) => t.parent_task_id === parentId)

  const tenantLocale = $derived(data.tenant?.default_locale ?? "en-US")
  const locale = $derived(
    localeForCurrency(
      data.locations,
      data.project.currency ?? "USD",
      tenantLocale,
    ),
  )

  // `medium` reads as neutral — the label carries the meaning, not the colour.
  const priorityTone = (p: string | null): Tone =>
    p === "urgent" ? "critical" : p === "high" ? "caution" : "neutral"

  // Task status — its own vocab (done/in_progress), not shared with the project's.
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
          {#if data.project.objective_name}
            ·
            <a class="link" href={`/objectives/${data.project.objective_id}`}>
              {data.project.objective_name}
            </a>
          {/if}
        </p>
        <div class="flex gap-1">
          <StatusBadge tone={healthTone(data.project.health_status)}>
            {data.project.health_status?.replace(/_/g, " ")}
          </StatusBadge>
          <StatusBadge tone={projectStatusTone(data.project.status)}>
            {data.project.status?.replace(/_/g, " ")}
          </StatusBadge>
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

  <h2 class="mt-6 flex flex-wrap items-center text-base font-medium">
    Tasks
    <span class="badge badge-sm ms-1">{data.tasksTotal}</span>
    <!-- Shown only when the denormalised count disagrees with the actual tasks (L58). -->
    {#if data.project.task_count !== data.tasksTotal}
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
    <!-- Client-side only: both views read the same data.tasks and share the
         same moveTask control below — no second status-writing path. -->
    <div class="join ms-auto">
      <button
        type="button"
        class={`btn btn-xs join-item ${view === "list" ? "btn-active" : ""}`}
        aria-pressed={view === "list"}
        onclick={() => (view = "list")}
      >
        List
      </button>
      <button
        type="button"
        class={`btn btn-xs join-item ${view === "kanban" ? "btn-active" : ""}`}
        aria-pressed={view === "kanban"}
        onclick={() => (view = "kanban")}
      >
        Kanban
      </button>
    </div>
  </h2>

  {#snippet statusControl(t: TaskRow)}
    {#if data.mayWrite}
      <!-- POST, never GET — this writes, and a crawler can follow a GET link. -->
      <form method="POST" action="?/moveTask" use:enhance={keepValues}>
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
            <option value={s} class="capitalize">{label(s)}</option>
          {/each}
        </select>
        <!-- Works with scripting off, where onchange does not. -->
        <noscript>
          <button class="btn btn-sm">Move</button>
        </noscript>
      </form>
    {:else}
      <StatusBadge tone={statusTone(t.status)}>{label(t.status)}</StatusBadge>
    {/if}
  {/snippet}

  {#snippet blockedBy(t: TaskRow)}
    {@const incomplete = t.depends_on.filter((d) => d.status !== "done")}
    {#if incomplete.length > 0}
      <p class="text-warning mt-0.5 text-xs">
        <span class="iconify lucide--lock size-3 align-[-1px]"></span>
        Blocked by {incomplete
          .map((d) => d.task_number ?? d.task_name)
          .join(", ")}
      </p>
    {/if}
  {/snippet}

  {#if data.tasks.length === 0}
    <EmptyState
      icon="lucide--list-checks"
      class="mt-2"
      message="No tasks on this project yet."
    />
  {:else if view === "list"}
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
              <th></th>
            </tr>
          </thead>
          <tbody>
            {#each topLevelTasks as t (t.id)}
              <tr class="hover:bg-base-200/40">
                <td class="font-medium">
                  {t.task_name}
                  {@render blockedBy(t)}
                </td>
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
                <td>{@render statusControl(t)}</td>
                <td>
                  {#if data.mayWrite}
                    <button
                      type="button"
                      class="btn btn-ghost btn-xs"
                      onclick={() => (managingDependenciesFor = t.id)}
                    >
                      Dependencies
                    </button>
                  {/if}
                </td>
              </tr>
              {#each subtasksOf(t.id) as sub (sub.id)}
                <tr class="hover:bg-base-200/40">
                  <td class="ps-6 text-sm">
                    <span class="text-base-content/50"> └ </span>{sub.task_name}
                    {@render blockedBy(sub)}
                  </td>
                  <td class="text-base-content/70 text-sm">
                    {sub.assignee_name ?? "Unassigned"}
                  </td>
                  <td>
                    <StatusBadge tone={priorityTone(sub.priority)}>
                      {sub.priority}
                    </StatusBadge>
                  </td>
                  <td class="text-sm tabular-nums">
                    {sub.due_date ? calendarDate(sub.due_date, locale) : "—"}
                    {#if sub.is_overdue}
                      <span class="badge badge-error badge-sm ms-1"
                        >overdue</span
                      >
                    {/if}
                  </td>
                  <td class="text-right text-sm tabular-nums">
                    {number(sub.actual_hours ?? "0", locale)} / {number(
                      sub.estimated_hours ?? "0",
                      locale,
                    )}
                  </td>
                  <td>
                    <progress
                      class="progress progress-primary w-full"
                      value={pct(sub.progress_percentage)}
                      max="100"
                    ></progress>
                  </td>
                  <td>{@render statusControl(sub)}</td>
                  <td>
                    {#if data.mayWrite}
                      <button
                        type="button"
                        class="btn btn-ghost btn-xs"
                        onclick={() => (managingDependenciesFor = sub.id)}
                      >
                        Dependencies
                      </button>
                    {/if}
                  </td>
                </tr>
              {/each}
            {/each}
          </tbody>
        </table>
      </div>
      {#if data.tasksTotal > data.tasks.length}
        <p class="text-base-content/70 border-base-200 border-t p-3 text-xs">
          Showing the first {data.tasks.length} of {data.tasksTotal} tasks.
        </p>
      {/if}
    </div>
  {:else}
    <!-- Kanban: one column per status, top-level tasks only — a subtask does
         not get its own card, same as Monday.com's subitems. -->
    <div class="mt-2 grid gap-3 lg:grid-cols-5">
      {#each data.taskStatuses as s (s)}
        {@const cards = topLevelTasks.filter((t) => t.status === s)}
        <div class="bg-base-200/40 rounded-box p-2">
          <p
            class="text-base-content/70 mb-2 flex items-center justify-between px-1 text-xs font-semibold uppercase"
          >
            {label(s)}
            <span class="badge badge-sm">{cards.length}</span>
          </p>
          <div class="flex flex-col gap-2">
            {#each cards as t (t.id)}
              {@const subtasks = subtasksOf(t.id)}
              <div class="card bg-base-100 shadow-sm">
                <div class="card-body gap-2 p-3">
                  <p class="text-sm font-medium">{t.task_name}</p>
                  {@render blockedBy(t)}
                  <div
                    class="text-base-content/70 flex justify-between text-xs"
                  >
                    <span>{t.assignee_name ?? "Unassigned"}</span>
                    <StatusBadge tone={priorityTone(t.priority)}>
                      {t.priority}
                    </StatusBadge>
                  </div>
                  <div
                    class="text-base-content/70 flex justify-between text-xs"
                  >
                    <span>
                      {t.due_date
                        ? calendarDate(t.due_date, locale)
                        : "No due date"}
                      {#if t.is_overdue}
                        <span class="text-error">· overdue</span>
                      {/if}
                    </span>
                    {#if subtasks.length > 0}
                      <span>
                        {subtasks.filter((s2) => s2.status === "done")
                          .length}/{subtasks.length}
                        subtasks
                      </span>
                    {/if}
                  </div>
                  {@render statusControl(t)}
                </div>
              </div>
            {/each}
          </div>
        </div>
      {/each}
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
        use:enhance={closeOnSuccess(() => (addingTask = false))}
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

        <fieldset class="fieldset sm:col-span-2">
          <legend class="fieldset-legend">Parent task (optional)</legend>
          <select
            name="parent_task_id"
            aria-invalid={err.aria("parent_task_id")}
            class={`select w-full ${err.select("parent_task_id")}`}
          >
            <option value="">— Top-level task —</option>
            {#each topLevelTasks as t (t.id)}
              <option value={t.id}>{t.task_name}</option>
            {/each}
          </select>
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
        use:enhance={closeOnSuccess(() => (editing = false))}
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

        <fieldset class="fieldset sm:col-span-2">
          <legend class="fieldset-legend">Objective (optional)</legend>
          <select
            name="objective_id"
            aria-invalid={err.aria("objective_id")}
            class={`select w-full ${err.select("objective_id")}`}
          >
            <option value="">No objective</option>
            {#each data.objectives as o (o.id)}
              <option
                value={o.id}
                selected={o.id === data.project.objective_id}
              >
                {o.objective_name}
              </option>
            {/each}
          </select>
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

<!-- Manage a task's dependencies ------------------------------------------ -->
{#if managingDependenciesTask}
  {@const t = managingDependenciesTask}
  {@const candidates = data.tasks.filter(
    (o) => o.id !== t.id && !t.depends_on.some((d) => d.id === o.id),
  )}
  <div class="modal modal-open" role="dialog" aria-label="Manage dependencies">
    <div class="modal-box max-w-md">
      <h3 class="text-lg font-medium">Dependencies for {t.task_name}</h3>
      <p class="text-base-content/70 mt-1 text-sm">
        A task this one depends on must finish first — same project only. This
        annotates the task; it never changes its status automatically.
      </p>

      {#if t.depends_on.length === 0}
        <p class="text-base-content/70 mt-4 text-sm">Depends on nothing yet.</p>
      {:else}
        <ul class="mt-4 flex flex-col gap-2">
          {#each t.depends_on as d (d.id)}
            <li class="flex items-center justify-between gap-2 text-sm">
              <span>
                {d.task_number ?? d.task_name}
                <StatusBadge tone={statusTone(d.status)}>
                  {label(d.status)}
                </StatusBadge>
              </span>
              {#if data.mayWrite}
                <form
                  method="POST"
                  action="?/removeDependency"
                  use:enhance={keepValues}
                >
                  <input type="hidden" name="task_id" value={t.id} />
                  <input type="hidden" name="depends_on_task_id" value={d.id} />
                  <button class="btn btn-ghost btn-xs" type="submit">
                    Remove
                  </button>
                </form>
              {/if}
            </li>
          {/each}
        </ul>
      {/if}

      {#if data.mayWrite && candidates.length > 0}
        <form
          method="POST"
          action="?/addDependency"
          class="mt-4 flex items-end gap-2"
          use:enhance={keepValues}
        >
          <input type="hidden" name="task_id" value={t.id} />
          <fieldset class="fieldset grow">
            <legend class="fieldset-legend">Add dependency</legend>
            <select
              name="depends_on_task_id"
              aria-invalid={err.aria("depends_on_task_id")}
              class={`select w-full ${err.select("depends_on_task_id")}`}
              required
            >
              {#each candidates as c (c.id)}
                <option value={c.id}>{c.task_number ?? c.task_name}</option>
              {/each}
            </select>
          </fieldset>
          <button type="submit" class="btn btn-outline">Add</button>
        </form>
      {/if}

      <div class="modal-action">
        <button
          type="button"
          class="btn btn-ghost"
          onclick={() => (managingDependenciesFor = null)}
        >
          Close
        </button>
      </div>
    </div>
    <button
      class="modal-backdrop"
      aria-label="Close"
      onclick={() => (managingDependenciesFor = null)}
    ></button>
  </div>
{/if}
