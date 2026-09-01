<script lang="ts">
  import PageTitle from "$lib/components/PageTitle.svelte"
  import { calendarDate, money, number } from "$lib/format"

  let { data } = $props()

  const tenantLocale = $derived(data.tenant?.default_locale ?? "en-US")
  const locale = $derived(
    data.project.currency === "GBP"
      ? "en-GB"
      : data.project.currency === "INR"
        ? "en-IN"
        : tenantLocale,
  )

  const priorityClass = (p: string | null) =>
    p === "urgent"
      ? "badge-error"
      : p === "high"
        ? "badge-warning"
        : p === "low"
          ? "badge-ghost"
          : "badge-neutral"

  const statusClass = (s: string | null) =>
    s === "done"
      ? "badge-success"
      : s === "in_progress"
        ? "badge-info"
        : "badge-ghost"

  const pct = (v: string | null) => Math.round(Number(v ?? 0))
</script>

<svelte:head><title>{data.project.project_name} · Kaaj</title></svelte:head>

<div class="p-4 lg:p-6">
  <PageTitle
    title={data.project.project_name}
    items={[
      { label: "Business Operations", path: "/projects" },
      { label: "Projects", path: "/projects" },
      { label: data.project.project_number ?? "Project", active: true },
    ]}
  />

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
  </h2>

  {#if data.tasks.length === 0}
    <div class="card bg-base-100 mt-2 shadow">
      <div class="card-body items-center py-10 text-center">
        <span class="iconify lucide--list-checks text-base-content/30 size-8"
        ></span>
        <p class="text-base-content/70 text-sm">
          No tasks on this project yet.
        </p>
      </div>
    </div>
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
                  <span
                    class={`badge badge-sm capitalize ${priorityClass(t.priority)}`}
                  >
                    {t.priority}
                  </span>
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
                  <span
                    class={`badge badge-sm capitalize ${statusClass(t.status)}`}
                  >
                    {t.status?.replace(/_/g, " ")}
                  </span>
                </td>
              </tr>
            {/each}
          </tbody>
        </table>
      </div>
    </div>
  {/if}
</div>
