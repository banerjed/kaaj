<script lang="ts">
  import PageTitle from "$lib/components/PageTitle.svelte"
  import { calendarDate, number } from "$lib/format"

  let { data } = $props()

  const locale = $derived(data.tenant?.default_locale ?? "en-US")

  const mine = $derived(data.reviews.filter((r) => r.employee_id === data.me))
  const others = $derived(data.reviews.filter((r) => r.employee_id !== data.me))

  const statusClass = (s: string) =>
    s === "acknowledged"
      ? "badge-success"
      : s === "submitted"
        ? "badge-info"
        : "badge-ghost"

  const goalsFor = (employeeId: string) =>
    data.goals.filter((g) => g.employee_id === employeeId)

  const cycle = $derived(data.cycles[0])
</script>

<svelte:head>
  <title>Performance · Kaaj</title>
</svelte:head>

<div class="p-4 lg:p-6">
  <PageTitle
    title="Performance"
    items={[
      { label: "HR", path: "/performance" },
      { label: "Performance", active: true },
    ]}
  />

  {#if cycle}
    <div class="card bg-base-100 mt-4 shadow">
      <div class="card-body gap-3 p-4">
        <div class="flex flex-wrap items-baseline justify-between gap-2">
          <h2 class="text-base font-medium">{cycle.cycle_name}</h2>
          <span class="badge badge-sm capitalize">{cycle.status}</span>
        </div>
        <!-- The four deadlines are a sequence, so they read as one. -->
        <ol class="flex flex-wrap gap-x-6 gap-y-1 text-sm">
          {#each [["Opens", cycle.start_date], ["Self-assessment", cycle.self_assessment_due], ["Manager assessment", cycle.manager_assessment_due], ["Closes", cycle.cycle_close_date]] as [label, date] (label)}
            {#if date}
              <li class="flex flex-col">
                <span class="text-base-content/70 text-xs">{label}</span>
                <span class="tabular-nums">{calendarDate(date, locale)}</span>
              </li>
            {/if}
          {/each}
        </ol>
        {#if data.readsAll && data.progress.length > 0}
          <div class="flex flex-wrap gap-2 pt-1">
            {#each data.progress as p (p.status)}
              <span class={`badge badge-sm ${statusClass(p.status)}`}>
                {p.n}
                {p.status}
              </span>
            {/each}
          </div>
        {/if}
      </div>
    </div>
  {/if}

  <!-- Your own review ---------------------------------------------------- -->
  {#if mine.length > 0}
    <h2 class="mt-6 text-base font-medium">Your review</h2>
    {#each mine as r (r.id)}
      <div class="card bg-base-100 mt-2 shadow">
        <div class="card-body gap-3 p-4">
          <div class="flex flex-wrap items-baseline justify-between gap-2">
            <p class="text-base-content/70 text-sm">
              {r.cycle_name ?? r.cycle_code} · reviewed by {r.reviewer_name ??
                "—"}
            </p>
            <span class={`badge badge-sm capitalize ${statusClass(r.status)}`}>
              {r.status}
            </span>
          </div>

          {#if r.self_assessment}
            <div>
              <p class="text-base-content/70 text-xs">What you wrote</p>
              <dl class="mt-1 grid gap-1 text-sm sm:grid-cols-2">
                {#each Object.entries(r.self_assessment) as [k, v] (k)}
                  <div>
                    <dt class="text-base-content/70 text-xs capitalize">
                      {k.replace(/_/g, " ")}
                    </dt>
                    <dd>{v}</dd>
                  </div>
                {/each}
              </dl>
            </div>
          {/if}

          {#if r.manager_assessment_withheld}
            <!-- Said, not left blank. An empty section reads as "they wrote
                 nothing about me", which is a different and worse message. -->
            <div role="status" class="alert alert-info">
              <span class="iconify lucide--lock size-5"></span>
              <span>
                Your manager is still writing their assessment. You will see it
                when they submit it.
              </span>
            </div>
          {:else if r.manager_assessment}
            <div>
              <p class="text-base-content/70 text-xs">
                What {r.reviewer_name ?? "your manager"} wrote
              </p>
              <dl class="mt-1 grid gap-1 text-sm sm:grid-cols-2">
                {#each Object.entries(r.manager_assessment) as [k, v] (k)}
                  <div>
                    <dt class="text-base-content/70 text-xs capitalize">
                      {k.replace(/_/g, " ")}
                    </dt>
                    <dd>{v}</dd>
                  </div>
                {/each}
              </dl>
            </div>
          {/if}

          {#if r.overall_rating && !r.manager_assessment_withheld}
            <p class="text-sm">
              <span class="text-base-content/70">Overall</span>
              <span class="ms-1 font-medium tabular-nums">
                {number(r.overall_rating, locale)}
              </span>
            </p>
          {/if}
        </div>
      </div>
    {/each}
  {/if}

  <!-- Goals --------------------------------------------------------------- -->
  {#if data.me && goalsFor(data.me).length > 0}
    <h2 class="mt-6 text-base font-medium">Your goals</h2>
    <div class="mt-2 grid gap-3 sm:grid-cols-2">
      {#each goalsFor(data.me) as g (g.id)}
        <div class="card bg-base-100 shadow">
          <div class="card-body gap-2 p-4">
            <div class="flex items-baseline justify-between gap-2">
              <p class="font-medium">{g.goal_title}</p>
              {#if g.overdue}
                <span class="badge badge-warning badge-sm">overdue</span>
              {/if}
            </div>
            {#if g.description}
              <p class="text-base-content/70 text-sm">{g.description}</p>
            {/if}
            <div class="flex items-center gap-2">
              <progress
                class="progress progress-primary"
                value={Number(g.progress_percentage ?? 0)}
                max="100"
                aria-label={`${g.goal_title} progress`}
              ></progress>
              <span class="text-sm tabular-nums"
                >{number(g.progress_percentage, locale)}%</span
              >
            </div>
            {#if g.target_date}
              <p class="text-base-content/70 text-xs">
                Due {calendarDate(g.target_date, locale)}
              </p>
            {/if}
          </div>
        </div>
      {/each}
    </div>
  {/if}

  <!-- Reviews you are writing, or all of them if you run the cycle -------- -->
  {#if others.length > 0}
    <h2 class="mt-6 text-base font-medium">
      {data.readsAll ? "Everyone's reviews" : "Reviews you are writing"}
    </h2>
    <div class="card bg-base-100 mt-2 shadow">
      <div class="overflow-x-auto">
        <table class="table">
          <thead>
            <tr>
              <th>Who</th>
              <th>Cycle</th>
              <th>Reviewer</th>
              <th class="text-right">Rating</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
            {#each others as r (r.id)}
              <tr class="hover:bg-base-200/40">
                <td class="font-medium">{r.employee_name}</td>
                <td class="text-sm">{r.cycle_name ?? r.cycle_code}</td>
                <td class="text-base-content/70 text-sm"
                  >{r.reviewer_name ?? "—"}</td
                >
                <td class="text-right text-sm tabular-nums">
                  {r.overall_rating ? number(r.overall_rating, locale) : "—"}
                </td>
                <td>
                  <span
                    class={`badge badge-sm capitalize ${statusClass(r.status)}`}
                  >
                    {r.status}
                  </span>
                </td>
              </tr>
            {/each}
          </tbody>
        </table>
      </div>
    </div>
  {/if}

  {#if data.reviews.length === 0}
    <div class="card bg-base-100 mt-4 shadow">
      <div class="card-body items-center py-10 text-center">
        <span
          class="iconify lucide--clipboard-check text-base-content/30 size-8"
        ></span>
        <p class="text-base-content/70 text-sm">
          You have no reviews in this cycle.
        </p>
      </div>
    </div>
  {/if}
</div>
