<script lang="ts">
  import PageTitle from "$lib/components/PageTitle.svelte"
  import { calendarDate } from "$lib/format"
  import StatusBadge from "$lib/components/StatusBadge.svelte"
  import type { Tone } from "$lib/components/status-tone"

  let { data } = $props()

  const locale = $derived(data.tenant?.default_locale ?? "en-US")

  const open = $derived(data.tasks.filter((t) => t.status !== "completed"))
  const done = $derived(data.tasks.filter((t) => t.status === "completed"))

  const statusTone = (t: { status: string; overdue: boolean }): Tone =>
    t.overdue ? "critical" : t.status === "completed" ? "positive" : "neutral"
</script>

<svelte:head>
  <title>Onboarding · Kaaj</title>
</svelte:head>

<div class="p-4 lg:p-6">
  <PageTitle
    title="Onboarding"
    items={[
      { label: "HR", path: "/onboarding" },
      { label: "Onboarding", active: true },
    ]}
  />

  {#if open.length > 0}
    <h2 class="mt-4 text-base font-medium">
      Still to do
      <span class="badge badge-sm ms-1">{open.length}</span>
    </h2>
    <div class="card bg-base-100 mt-2 shadow">
      <ul class="list">
        {#each open as t (t.id)}
          <li class="list-row">
            <div class="list-col-grow">
              <p class="font-medium">{t.task_name}</p>
              <p class="text-base-content/70 text-xs">
                For {t.employee_name}
                {#if t.assigned_to_name}· {t.assigned_to_name} to do{/if}
                {#if t.due_date}· due {calendarDate(t.due_date, locale)}{/if}
              </p>
            </div>
            <StatusBadge tone={statusTone(t)}>
              {t.overdue ? "overdue" : t.status}
            </StatusBadge>
          </li>
        {/each}
      </ul>
    </div>
  {/if}

  {#if done.length > 0}
    <h2 class="mt-6 text-base font-medium">Done</h2>
    <div class="card bg-base-100 mt-2 shadow">
      <ul class="list">
        {#each done as t (t.id)}
          <li class="list-row">
            <div class="list-col-grow">
              <p class="font-medium">{t.task_name}</p>
              <p class="text-base-content/70 text-xs">
                For {t.employee_name}
                {#if t.completion_date}
                  · completed {calendarDate(t.completion_date, locale)}
                {/if}
              </p>
            </div>
            <span class="badge badge-soft badge-success badge-sm"
              >completed</span
            >
          </li>
        {/each}
      </ul>
    </div>
  {/if}

  {#if data.readsAll && data.templates.length > 0}
    <h2 class="mt-6 text-base font-medium">Templates</h2>
    <p class="text-base-content/70 mt-1 max-w-prose text-sm">
      A hire gets the most specific template that matches them — a department
      and location together beat a department alone, which beats the default.
    </p>
    <div class="card bg-base-100 mt-2 shadow">
      <div class="overflow-x-auto">
        <table class="table">
          <thead>
            <tr>
              <th>Template</th>
              <th>Applies to</th>
              <th class="text-right">Tasks</th>
            </tr>
          </thead>
          <tbody>
            {#each data.templates as t (t.id)}
              <tr class="hover:bg-base-200/40">
                <td class="font-medium">
                  {t.template_name}
                  {#if t.is_default}
                    <span class="badge badge-ghost badge-sm ms-1">default</span>
                  {/if}
                </td>
                <td class="text-base-content/70 text-sm">
                  {[t.applies_to_department_code, t.applies_to_location_code]
                    .filter(Boolean)
                    .join(" · ") || "Everyone"}
                </td>
                <td class="text-right text-sm tabular-nums">{t.task_count}</td>
              </tr>
            {/each}
          </tbody>
        </table>
      </div>
    </div>
  {/if}

  {#if data.tasks.length === 0}
    <div class="card bg-base-100 mt-4 shadow">
      <div class="card-body items-center py-10 text-center">
        <span class="iconify lucide--check-check text-base-content/30 size-8"
        ></span>
        <p class="text-base-content/70 text-sm">No onboarding tasks for you.</p>
      </div>
    </div>
  {/if}
</div>
