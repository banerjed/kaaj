<script lang="ts">
  import PageTitle from "$lib/components/PageTitle.svelte"
  import {
    calendarDate,
    instant,
    localeForCurrency,
    money,
    number,
  } from "$lib/format"
  import { fieldErrors } from "$lib/form-errors"
  import { enhance } from "$app/forms"
  import { closeOnSuccess, keepValues, resetOnSuccess } from "$lib/form-enhance"
  import StatusBadge from "$lib/components/StatusBadge.svelte"
  import type { Tone } from "$lib/components/status-tone"
  import {
    projectHealthTone as healthTone,
    projectStatusTone,
  } from "$lib/components/status-tone"
  import PageHead from "$lib/components/PageHead.svelte"
  import EmptyState from "$lib/components/EmptyState.svelte"
  import type { TaskRow } from "$lib/server/projects/projects.repo"
  import { formatBytes } from "$lib/documents/format-bytes"
  import CustomFieldInput from "$lib/components/CustomFieldInput.svelte"

  let { data, form } = $props()

  const err = $derived(fieldErrors(form))

  let addingTask = $state(false)
  let editing = $state(false)
  let savingTemplate = $state(false)
  let viewingProjectFields = $state(false)
  /** The Kanban/Gantt/Calendar/Workload boards all read the same data.tasks
      and (where they write at all) reuse moveTask — no second status-writing
      path. */
  let view = $state<"list" | "kanban" | "gantt" | "calendar" | "workload">(
    "list",
  )
  /** The task id, not the row itself — so the modal reflects `data.tasks`
      after `update()` refreshes it, rather than a stale snapshot. */
  let managingDependenciesFor = $state<string | null>(null)
  const managingDependenciesTask = $derived(
    data.tasks.find((t) => t.id === managingDependenciesFor) ?? null,
  )
  let viewingCommentsFor = $state<string | null>(null)
  const viewingCommentsTask = $derived(
    data.tasks.find((t) => t.id === viewingCommentsFor) ?? null,
  )
  let editingCommentId = $state<string | null>(null)
  let viewingFilesFor = $state<string | null>(null)
  const viewingFilesTask = $derived(
    data.tasks.find((t) => t.id === viewingFilesFor) ?? null,
  )
  let viewingTaskFieldsFor = $state<string | null>(null)
  const viewingTaskFieldsTask = $derived(
    data.tasks.find((t) => t.id === viewingTaskFieldsFor) ?? null,
  )

  // Calendar view's own month, client-side only — same "no network request
  // on toggle" principle as the List/Kanban switch: every task is already
  // loaded, so paging months just re-filters it.
  const today = new Date()
  let calendarYear = $state(today.getFullYear())
  let calendarMonth = $state(today.getMonth()) // 0-11

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
  // A comment isn't tied to one office's timezone the way an attendance
  // record is — the tenant's own default, same as ticketing's update feed.
  const tenantZone = $derived(data.tenant?.default_timezone ?? "UTC")
  const commentTime = (v: string | Date) =>
    instant(v, {
      locale: tenantLocale,
      currency: data.project.currency ?? "USD",
      timezone: tenantZone,
      timeFormat: data.tenant?.time_format,
    })

  // `medium` reads as neutral — the label carries the meaning, not the colour.
  const priorityTone = (p: string | null): Tone =>
    p === "urgent" ? "critical" : p === "high" ? "caution" : "neutral"

  // Task status — its own vocab (done/in_progress), not shared with the project's.
  const statusTone = (s: string | null): Tone =>
    s === "done" ? "positive" : s === "in_progress" ? "progress" : "neutral"

  const pct = (v: string | null) => Math.round(Number(v ?? 0))

  // ---------------------------------------------------------------------
  // Gantt, Calendar, Workload — read-only, client-side, computed entirely
  // from data.tasks. Day granularity only (docs/25-project-management-phase2.md):
  // no week/month/quarter scale switching, no drag-to-reschedule.
  // ---------------------------------------------------------------------

  const dayMs = (iso: string) => Date.parse(`${iso}T00:00:00Z`)

  const ganttTasks = $derived(
    topLevelTasks.filter((t) => t.start_date || t.due_date),
  )
  const ganttRange = $derived.by(() => {
    const starts = ganttTasks.map((t) => dayMs(t.start_date ?? t.due_date!))
    const ends = ganttTasks.map((t) => dayMs(t.due_date ?? t.start_date!))
    if (starts.length === 0) return null
    const start = Math.min(...starts)
    const end = Math.max(...ends)
    // At least one day wide, so a single-day task is never divide-by-zero.
    const totalDays = Math.max(1, Math.round((end - start) / 86_400_000) + 1)
    return { start, totalDays }
  })
  function ganttBar(t: TaskRow) {
    if (!ganttRange) return { leftPct: 0, widthPct: 100 }
    const s = dayMs(t.start_date ?? t.due_date!)
    const e = dayMs(t.due_date ?? t.start_date!)
    const offsetDays = Math.round((s - ganttRange.start) / 86_400_000)
    const spanDays = Math.max(1, Math.round((e - s) / 86_400_000) + 1)
    return {
      leftPct: (offsetDays / ganttRange.totalDays) * 100,
      widthPct: (spanDays / ganttRange.totalDays) * 100,
    }
  }

  const calendarMonthLabel = $derived(
    new Date(calendarYear, calendarMonth, 1).toLocaleDateString(locale, {
      month: "long",
      year: "numeric",
    }),
  )
  /** A 6x7 grid — some leading/trailing cells belong to the adjacent month (dimmed, still shown for a complete week row). */
  const calendarWeeks = $derived.by(() => {
    const first = new Date(calendarYear, calendarMonth, 1)
    const gridStart = new Date(first)
    gridStart.setDate(1 - first.getDay())
    const days: { date: Date; inMonth: boolean; tasks: TaskRow[] }[] = []
    for (let i = 0; i < 42; i++) {
      const date = new Date(gridStart)
      date.setDate(gridStart.getDate() + i)
      const iso = date.toISOString().slice(0, 10)
      days.push({
        date,
        inMonth: date.getMonth() === calendarMonth,
        tasks: topLevelTasks.filter((t) => t.due_date === iso),
      })
    }
    const weeks: (typeof days)[] = []
    for (let i = 0; i < days.length; i += 7) weeks.push(days.slice(i, i + 7))
    return weeks
  })

  const workloadRows = $derived.by(() => {
    const byAssignee = new Map<string, number>()
    for (const t of topLevelTasks) {
      if (t.status === "done") continue
      const name = t.assignee_name ?? "Unassigned"
      byAssignee.set(
        name,
        (byAssignee.get(name) ?? 0) + Number(t.estimated_hours ?? 0),
      )
    }
    return [...byAssignee.entries()]
      .sort((a, b) => b[1] - a[1])
      .map(([name, hours]) => ({ name, hours }))
  })
  const workloadMax = $derived(Math.max(1, ...workloadRows.map((r) => r.hours)))
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
  {:else if form?.commented}
    <div role="status" class="alert alert-success mt-4">
      <span class="iconify lucide--check size-5"></span>
      <span>Comment saved.</span>
    </div>
  {:else if form?.commentDeleted}
    <div role="status" class="alert alert-success mt-4">
      <span class="iconify lucide--check size-5"></span>
      <span>Comment deleted.</span>
    </div>
  {:else if form?.fileUploaded}
    <div role="status" class="alert alert-success mt-4">
      <span class="iconify lucide--check size-5"></span>
      <span>File attached.</span>
    </div>
  {:else if form?.templateSaved}
    <div role="status" class="alert alert-success mt-4">
      <span class="iconify lucide--check size-5"></span>
      <span>Saved as template {form.templateSaved}.</span>
    </div>
  {:else if form?.fieldsSaved}
    <div role="status" class="alert alert-success mt-4">
      <span class="iconify lucide--check size-5"></span>
      <span>Fields saved.</span>
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
            <button
              type="button"
              class="btn btn-ghost btn-xs"
              onclick={() => (savingTemplate = true)}
            >
              <span class="iconify lucide--layout-template size-3.5"></span>
              Save as template
            </button>
            {#if data.projectFieldDefs.length > 0}
              <button
                type="button"
                class="btn btn-ghost btn-xs"
                onclick={() => (viewingProjectFields = true)}
              >
                <span class="iconify lucide--list-plus size-3.5"></span>
                Fields
              </button>
            {/if}
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
      <button
        type="button"
        class={`btn btn-xs join-item ${view === "gantt" ? "btn-active" : ""}`}
        aria-pressed={view === "gantt"}
        onclick={() => (view = "gantt")}
      >
        Gantt
      </button>
      <button
        type="button"
        class={`btn btn-xs join-item ${view === "calendar" ? "btn-active" : ""}`}
        aria-pressed={view === "calendar"}
        onclick={() => (view = "calendar")}
      >
        Calendar
      </button>
      <button
        type="button"
        class={`btn btn-xs join-item ${view === "workload" ? "btn-active" : ""}`}
        aria-pressed={view === "workload"}
        onclick={() => (view = "workload")}
      >
        Workload
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

  <!-- One dropdown per task, not one button per feature — the row was
       already crowded before comments/files/log-time joined dependencies. -->
  {#snippet taskActions(t: TaskRow)}
    {@const commentCount = data.commentsByTask[t.id]?.length ?? 0}
    {@const fileCount = data.filesByTask[t.id]?.length ?? 0}
    <!-- Plain inline buttons, not a dropdown — a `dropdown-content` inside
         the list table's `overflow-x-auto` wrapper gets clipped by it (CSS
         overflow-x != visible forces overflow-y to auto too), which isn't
         worth fighting for four actions. -->
    <div class="flex items-center gap-0.5">
      {#if data.mayWrite}
        <button
          type="button"
          class="btn btn-ghost btn-xs"
          aria-label={`Dependencies for ${t.task_name}`}
          title="Dependencies"
          onclick={() => (managingDependenciesFor = t.id)}
        >
          <span class="iconify lucide--link size-3.5"></span>
        </button>
      {/if}
      <button
        type="button"
        class="btn btn-ghost btn-xs"
        aria-label={`Comments on ${t.task_name}`}
        title="Comments"
        onclick={() => (viewingCommentsFor = t.id)}
      >
        <span class="iconify lucide--message-square size-3.5"></span>
        {#if commentCount > 0}<span class="text-xs">{commentCount}</span>{/if}
      </button>
      <button
        type="button"
        class="btn btn-ghost btn-xs"
        aria-label={`Files on ${t.task_name}`}
        title="Files"
        onclick={() => (viewingFilesFor = t.id)}
      >
        <span class="iconify lucide--paperclip size-3.5"></span>
        {#if fileCount > 0}<span class="text-xs">{fileCount}</span>{/if}
      </button>
      <a
        class="btn btn-ghost btn-xs"
        aria-label={`Log time on ${t.task_name}`}
        title="Log time"
        href={`/time-tracking?project_id=${data.project.id}&task_id=${t.id}`}
      >
        <span class="iconify lucide--clock size-3.5"></span>
      </a>
      {#if data.taskFieldDefs.length > 0}
        <button
          type="button"
          class="btn btn-ghost btn-xs"
          aria-label={`Fields on ${t.task_name}`}
          title="Fields"
          onclick={() => (viewingTaskFieldsFor = t.id)}
        >
          <span class="iconify lucide--list-plus size-3.5"></span>
        </button>
      {/if}
    </div>
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
                <td>{@render taskActions(t)}</td>
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
                  <td>{@render taskActions(sub)}</td>
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
  {:else if view === "kanban"}
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
                  <div class="flex items-start justify-between gap-1">
                    <p class="text-sm font-medium">{t.task_name}</p>
                    {@render taskActions(t)}
                  </div>
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
  {:else if view === "gantt"}
    <!-- One bar per top-level task, positioned as a % of the whole range —
         day granularity only, no week/month/quarter scale switching. -->
    <div class="card bg-base-100 mt-2 shadow">
      <div class="card-body gap-2 p-4">
        {#if ganttTasks.length === 0}
          <p class="text-base-content/70 text-sm">
            No task here has a start or due date yet.
          </p>
        {:else}
          {#each ganttTasks as t (t.id)}
            {@const bar = ganttBar(t)}
            <div class="flex items-center gap-3">
              <p class="w-48 shrink-0 truncate text-sm" title={t.task_name}>
                {t.task_name}
              </p>
              <div class="bg-base-200 relative h-5 grow rounded">
                <div
                  class={`absolute h-5 rounded ${t.status === "done" ? "bg-success" : t.is_overdue ? "bg-error" : "bg-primary"}`}
                  style={`left:${bar.leftPct}%; width:${bar.widthPct}%`}
                  title={`${t.start_date ?? t.due_date} → ${t.due_date ?? t.start_date}`}
                ></div>
              </div>
            </div>
          {/each}
        {/if}
      </div>
    </div>
  {:else if view === "calendar"}
    <div class="card bg-base-100 mt-2 shadow">
      <div class="card-body gap-3 p-4">
        <div class="flex items-center justify-between">
          <button
            type="button"
            class="btn btn-ghost btn-xs"
            aria-label="Previous month"
            onclick={() => {
              if (calendarMonth === 0) {
                calendarMonth = 11
                calendarYear -= 1
              } else {
                calendarMonth -= 1
              }
            }}
          >
            <span class="iconify lucide--chevron-left size-4"></span>
          </button>
          <p class="text-sm font-medium">{calendarMonthLabel}</p>
          <button
            type="button"
            class="btn btn-ghost btn-xs"
            aria-label="Next month"
            onclick={() => {
              if (calendarMonth === 11) {
                calendarMonth = 0
                calendarYear += 1
              } else {
                calendarMonth += 1
              }
            }}
          >
            <span class="iconify lucide--chevron-right size-4"></span>
          </button>
        </div>
        <div class="grid grid-cols-7 gap-1 text-center text-xs font-medium">
          <!-- Fixed, never-reordered literal — the index as key is fine
               here (the letters alone aren't unique: two Ts, two Ss). -->
          {#each ["S", "M", "T", "W", "T", "F", "S"] as d, i (i)}
            <span class="text-base-content/70">{d}</span>
          {/each}
        </div>
        <div class="grid grid-cols-7 gap-1">
          {#each calendarWeeks as week, wi (wi)}
            {#each week as day (day.date.toISOString())}
              <div
                class={`rounded p-1 text-xs ${day.inMonth ? "bg-base-200/40" : "text-base-content/40"}`}
              >
                <p class="tabular-nums">{day.date.getDate()}</p>
                {#each day.tasks as t (t.id)}
                  <p
                    class="bg-primary/20 mt-0.5 truncate rounded px-1"
                    title={t.task_name}
                  >
                    {t.task_name}
                  </p>
                {/each}
              </div>
            {/each}
          {/each}
        </div>
      </div>
    </div>
  {:else}
    <!-- Workload: open (not done) top-level tasks' estimated hours, summed
         per assignee. Project-scoped only — a cross-project rollup needs the
         dashboard machinery, still deferred. -->
    <div class="card bg-base-100 mt-2 shadow">
      <div class="card-body gap-3 p-4">
        {#if workloadRows.length === 0}
          <p class="text-base-content/70 text-sm">No open tasks with hours.</p>
        {:else}
          {#each workloadRows as row (row.name)}
            <div class="flex items-center gap-3">
              <p class="w-40 shrink-0 truncate text-sm">{row.name}</p>
              <div class="bg-base-200 relative h-5 grow rounded">
                <div
                  class="bg-primary absolute h-5 rounded"
                  style={`width:${(row.hours / workloadMax) * 100}%`}
                ></div>
              </div>
              <p class="w-16 shrink-0 text-right text-sm tabular-nums">
                {number(String(row.hours), locale)}h
              </p>
            </div>
          {/each}
        {/if}
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

<!-- Comments on a task ----------------------------------------------------- -->
{#if viewingCommentsTask}
  {@const t = viewingCommentsTask}
  {@const taskComments = data.commentsByTask[t.id] ?? []}
  <div class="modal modal-open" role="dialog" aria-label="Comments">
    <div class="modal-box max-w-lg">
      <h3 class="text-lg font-medium">Comments on {t.task_name}</h3>

      {#if taskComments.length === 0}
        <p class="text-base-content/70 mt-4 text-sm">No comments yet.</p>
      {:else}
        <ul class="mt-4 flex max-h-72 flex-col gap-3 overflow-y-auto">
          {#each taskComments as c (c.id)}
            <li class="border-base-200 border-b pb-2 text-sm">
              {#if editingCommentId === c.id}
                <form
                  method="POST"
                  action="?/editComment"
                  use:enhance={closeOnSuccess(() => (editingCommentId = null))}
                  class="flex flex-col gap-2"
                >
                  <input type="hidden" name="comment_id" value={c.id} />
                  <textarea
                    name="comment_text"
                    class="textarea w-full"
                    rows="2"
                    maxlength="4000"
                    required>{c.comment_text}</textarea
                  >
                  <div class="flex justify-end gap-2">
                    <button
                      type="button"
                      class="btn btn-ghost btn-xs"
                      onclick={() => (editingCommentId = null)}
                    >
                      Cancel
                    </button>
                    <button type="submit" class="btn btn-primary btn-xs">
                      Save
                    </button>
                  </div>
                </form>
              {:else}
                <div class="flex items-start justify-between gap-2">
                  <div class="min-w-0">
                    <p class="text-base-content/70 text-xs">
                      {c.author_name ?? "Someone"} · {commentTime(c.created_at)}
                      {#if c.edited_at}(edited){/if}
                    </p>
                    <p class="whitespace-pre-wrap">{c.comment_text}</p>
                  </div>
                  {#if data.mayWrite}
                    <div class="flex shrink-0 gap-1">
                      <button
                        type="button"
                        class="btn btn-ghost btn-xs"
                        onclick={() => (editingCommentId = c.id)}
                      >
                        Edit
                      </button>
                      <form
                        method="POST"
                        action="?/deleteComment"
                        use:enhance={keepValues}
                      >
                        <input type="hidden" name="comment_id" value={c.id} />
                        <button type="submit" class="btn btn-ghost btn-xs">
                          Delete
                        </button>
                      </form>
                    </div>
                  {/if}
                </div>
              {/if}
            </li>
          {/each}
        </ul>
      {/if}

      {#if data.mayWrite}
        <form
          method="POST"
          action="?/addComment"
          class="mt-4 flex flex-col gap-2"
          use:enhance={resetOnSuccess(() => {})}
        >
          <input type="hidden" name="task_id" value={t.id} />
          <fieldset class="fieldset">
            <legend class="fieldset-legend">Add a comment</legend>
            <textarea
              name="comment_text"
              aria-invalid={err.aria("comment_text")}
              class={`textarea w-full ${err.textarea("comment_text")}`}
              rows="2"
              maxlength="4000"
              required
            ></textarea>
          </fieldset>
          <div class="flex justify-end">
            <button type="submit" class="btn btn-primary btn-sm">
              Comment
            </button>
          </div>
        </form>
      {/if}

      <div class="modal-action">
        <button
          type="button"
          class="btn btn-ghost"
          onclick={() => (viewingCommentsFor = null)}
        >
          Close
        </button>
      </div>
    </div>
    <button
      class="modal-backdrop"
      aria-label="Close"
      onclick={() => (viewingCommentsFor = null)}
    ></button>
  </div>
{/if}

<!-- Files on a task --------------------------------------------------------- -->
{#if viewingFilesTask}
  {@const t = viewingFilesTask}
  {@const taskFiles = data.filesByTask[t.id] ?? []}
  <div class="modal modal-open" role="dialog" aria-label="Files">
    <div class="modal-box max-w-lg">
      <h3 class="text-lg font-medium">Files on {t.task_name}</h3>

      {#if taskFiles.length === 0}
        <p class="text-base-content/70 mt-4 text-sm">No files attached yet.</p>
      {:else}
        <ul class="mt-4 flex flex-col gap-2">
          {#each taskFiles as d (d.id)}
            <li class="flex items-center justify-between gap-2 text-sm">
              <a
                class="link min-w-0 truncate"
                href={`/documents/download/${d.id}`}
              >
                {d.file_name}
              </a>
              <span class="text-base-content/70 shrink-0 text-xs">
                {formatBytes(d.file_size_bytes)}
              </span>
            </li>
          {/each}
        </ul>
      {/if}

      {#if data.mayWrite}
        <form
          method="POST"
          action="?/uploadTaskFile"
          enctype="multipart/form-data"
          class="mt-4 flex flex-col gap-2"
          use:enhance={resetOnSuccess(() => {})}
        >
          <input type="hidden" name="task_id" value={t.id} />
          <input type="hidden" name="task_name" value={t.task_name} />
          <fieldset class="fieldset">
            <legend class="fieldset-legend">Attach a file</legend>
            <input
              type="file"
              name="file"
              required
              aria-invalid={err.aria("file")}
              class={`file-input w-full ${err.input("file")}`}
            />
          </fieldset>
          <div class="flex justify-end">
            <button type="submit" class="btn btn-primary btn-sm">
              Upload
            </button>
          </div>
        </form>
      {/if}

      <div class="modal-action">
        <button
          type="button"
          class="btn btn-ghost"
          onclick={() => (viewingFilesFor = null)}
        >
          Close
        </button>
      </div>
    </div>
    <button
      class="modal-backdrop"
      aria-label="Close"
      onclick={() => (viewingFilesFor = null)}
    ></button>
  </div>
{/if}

<!-- Save this project as a template ----------------------------------------- -->
{#if savingTemplate}
  <div class="modal modal-open" role="dialog" aria-label="Save as template">
    <div class="modal-box max-w-md">
      <h3 class="text-lg font-medium">Save as template</h3>
      <p class="text-base-content/70 mt-1 text-sm">
        Captures this project's top-level tasks — names, priorities and
        estimated hours, and each one's day offset from the earliest due date.
        Assignees, dates and dependencies are not captured; a new project from
        this template starts with none of those set.
      </p>

      <form
        method="POST"
        action="?/saveAsTemplate"
        class="mt-4 flex flex-col gap-4"
        use:enhance={closeOnSuccess(() => (savingTemplate = false))}
      >
        <fieldset class="fieldset">
          <legend class="fieldset-legend">Template name</legend>
          <input
            name="name"
            aria-invalid={err.aria("name")}
            class={`input w-full ${err.input("name")}`}
            maxlength="200"
            required
            value={data.project.project_name}
          />
        </fieldset>
        <fieldset class="fieldset">
          <legend class="fieldset-legend">Category</legend>
          <input
            name="category"
            aria-invalid={err.aria("category")}
            class={`input w-full ${err.input("category")}`}
            maxlength="100"
          />
        </fieldset>
        <fieldset class="fieldset">
          <legend class="fieldset-legend">Description</legend>
          <textarea
            name="description"
            aria-invalid={err.aria("description")}
            class={`textarea w-full ${err.textarea("description")}`}
            rows="2"
            maxlength="2000"
          ></textarea>
        </fieldset>

        <div class="modal-action">
          <button
            type="button"
            class="btn btn-ghost"
            onclick={() => (savingTemplate = false)}
          >
            Cancel
          </button>
          <button type="submit" class="btn btn-primary">Save template</button>
        </div>
      </form>
    </div>
    <button
      class="modal-backdrop"
      aria-label="Close"
      onclick={() => (savingTemplate = false)}
    ></button>
  </div>
{/if}

<!-- Task custom fields ---------------------------------------------------- -->
{#if viewingTaskFieldsTask}
  {@const t = viewingTaskFieldsTask}
  {@const valuesForTask = data.taskFieldValues[t.id] ?? []}
  <div class="modal modal-open" role="dialog" aria-label="Fields">
    <div class="modal-box max-w-lg">
      <h3 class="text-lg font-medium">Fields on {t.task_name}</h3>

      {#if data.mayWrite}
        <form
          method="POST"
          action="?/setTaskCustomFields"
          class="mt-4 flex flex-col gap-4"
          use:enhance={closeOnSuccess(() => (viewingTaskFieldsFor = null))}
        >
          <input type="hidden" name="task_id" value={t.id} />
          {#each data.taskFieldDefs as def (def.id)}
            <CustomFieldInput
              definition={def}
              value={valuesForTask.find(
                (v) => v.field_definition_id === def.id,
              )}
              currency={data.project.currency ?? "USD"}
            />
          {/each}
          <div class="modal-action">
            <button
              type="button"
              class="btn btn-ghost"
              onclick={() => (viewingTaskFieldsFor = null)}
            >
              Cancel
            </button>
            <button type="submit" class="btn btn-primary">Save fields</button>
          </div>
        </form>
      {:else}
        <div class="modal-action">
          <button
            type="button"
            class="btn btn-ghost"
            onclick={() => (viewingTaskFieldsFor = null)}
          >
            Close
          </button>
        </div>
      {/if}
    </div>
    <button
      class="modal-backdrop"
      aria-label="Close"
      onclick={() => (viewingTaskFieldsFor = null)}
    ></button>
  </div>
{/if}

<!-- Project custom fields -------------------------------------------------- -->
{#if viewingProjectFields}
  <div class="modal modal-open" role="dialog" aria-label="Project fields">
    <div class="modal-box max-w-lg">
      <h3 class="text-lg font-medium">Fields on {data.project.project_name}</h3>

      <form
        method="POST"
        action="?/setProjectCustomFields"
        class="mt-4 flex flex-col gap-4"
        use:enhance={closeOnSuccess(() => (viewingProjectFields = false))}
      >
        {#each data.projectFieldDefs as def (def.id)}
          <CustomFieldInput
            definition={def}
            value={data.projectFieldValues?.find(
              (v) => v.field_definition_id === def.id,
            )}
            currency={data.project.currency ?? "USD"}
          />
        {/each}
        <div class="modal-action">
          <button
            type="button"
            class="btn btn-ghost"
            onclick={() => (viewingProjectFields = false)}
          >
            Cancel
          </button>
          <button type="submit" class="btn btn-primary">Save fields</button>
        </div>
      </form>
    </div>
    <button
      class="modal-backdrop"
      aria-label="Close"
      onclick={() => (viewingProjectFields = false)}
    ></button>
  </div>
{/if}
