<script lang="ts">
  import PageTitle from "$lib/components/PageTitle.svelte"
  import { calendarDate, money, number } from "$lib/format"

  let { data } = $props()

  const tenantLocale = $derived(data.tenant?.default_locale ?? "en-US")

  /** A budget is shown in the currency of the engagement, never converted. */
  const localeFor = (c: string | null) =>
    c === "GBP" ? "en-GB" : c === "INR" ? "en-IN" : tenantLocale

  const healthClass = (h: string | null) =>
    h === "at_risk"
      ? "badge-warning"
      : h === "off_track"
        ? "badge-error"
        : "badge-success"

  const statusClass = (s: string | null) =>
    s === "active"
      ? "badge-info"
      : s === "completed"
        ? "badge-success"
        : s === "cancelled"
          ? "badge-error"
          : "badge-ghost"

  const pct = (v: string | null) => Math.round(Number(v ?? 0))
</script>

<svelte:head><title>Projects · Kaaj</title></svelte:head>

<div class="p-4 lg:p-6">
  <PageTitle
    title="Projects"
    items={[
      { label: "Business Operations", path: "/projects" },
      { label: "Projects", active: true },
    ]}
  />

  <form method="GET" class="mt-4 flex flex-wrap items-end gap-3">
    <fieldset class="fieldset">
      <legend class="fieldset-legend text-xs">Status</legend>
      <select name="status" class="select" value={data.filters.status}>
        <option value="">Any</option>
        {#each data.statuses as s (s)}
          <option value={s} class="capitalize">{s.replace(/_/g, " ")}</option>
        {/each}
      </select>
    </fieldset>
    <fieldset class="fieldset">
      <legend class="fieldset-legend text-xs">Health</legend>
      <select name="health" class="select" value={data.filters.health}>
        <option value="">Any</option>
        {#each data.healths as h (h)}
          <option value={h} class="capitalize">{h.replace(/_/g, " ")}</option>
        {/each}
      </select>
    </fieldset>
    <button class="btn btn-primary">Apply</button>
    {#if data.filters.status || data.filters.health}
      <a href="/projects" class="btn btn-ghost">Clear</a>
    {/if}
  </form>

  {#if data.projects.length === 0}
    <div class="card bg-base-100 mt-4 shadow">
      <div class="card-body items-center py-10 text-center">
        <span class="iconify lucide--folder-open text-base-content/30 size-8"
        ></span>
        <p class="text-base-content/70 text-sm">No projects match that.</p>
      </div>
    </div>
  {:else}
    <div class="mt-4 grid gap-3 lg:grid-cols-2 2xl:grid-cols-3">
      {#each data.projects as p (p.id)}
        {@const locale = localeFor(p.currency)}
        <div class="card bg-base-100 shadow">
          <div class="card-body gap-3 p-4">
            <div class="flex items-start justify-between gap-3">
              <div class="min-w-0">
                <a class="link font-medium" href={`/projects/${p.id}`}>
                  {p.project_name}
                </a>
                <p class="text-base-content/70 truncate text-xs">
                  {p.project_number}{p.client_name ? ` · ${p.client_name}` : ""}
                </p>
              </div>
              <div class="flex shrink-0 gap-1">
                <span
                  class={`badge badge-sm capitalize ${healthClass(p.health_status)}`}
                >
                  {p.health_status?.replace(/_/g, " ")}
                </span>
                <span
                  class={`badge badge-sm capitalize ${statusClass(p.status)}`}
                >
                  {p.status?.replace(/_/g, " ")}
                </span>
              </div>
            </div>

            <div>
              <div class="text-base-content/70 flex justify-between text-xs">
                <span>
                  {p.actual_completed_count} of {p.actual_task_count} tasks
                  {#if p.overdue_task_count > 0}
                    <span class="text-error"
                      >· {p.overdue_task_count} overdue</span
                    >
                  {/if}
                </span>
                <span class="tabular-nums">{pct(p.progress_percentage)}%</span>
              </div>
              <progress
                class="progress progress-primary mt-1 w-full"
                value={pct(p.progress_percentage)}
                max="100"
              ></progress>
            </div>

            <dl class="grid grid-cols-3 gap-2 text-xs">
              <div>
                <dt class="text-base-content/70">Budget</dt>
                <dd class="tabular-nums">
                  {money(p.budget, p.currency ?? "USD", locale)}
                </dd>
              </div>
              <div>
                <dt class="text-base-content/70">Hours</dt>
                <dd class="tabular-nums">
                  {number(p.actual_hours ?? "0", locale)} / {number(
                    p.estimated_hours ?? "0",
                    locale,
                  )}
                </dd>
              </div>
              <div>
                <dt class="text-base-content/70">Due</dt>
                <dd class="tabular-nums">
                  {p.target_end_date
                    ? calendarDate(p.target_end_date, locale)
                    : "—"}
                </dd>
              </div>
            </dl>

            <p
              class="text-base-content/70 border-base-200 border-t pt-2 text-xs"
            >
              {p.manager_name ?? "No project manager"}
            </p>
          </div>
        </div>
      {/each}
    </div>
  {/if}
</div>
