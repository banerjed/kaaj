<script lang="ts">
  import PageTitle from "$lib/components/PageTitle.svelte"
  import { calendarDate, money, number } from "$lib/format"
  import { fieldErrors } from "$lib/form-errors"
  import { enhance } from "$app/forms"
  import { closeOnSuccess } from "$lib/form-enhance"

  let { data, form } = $props()

  // Which field to put the highlight on. The action names them in
  // `errorFields`; colour alone is not enough, so `aria-invalid` goes with it.
  const err = $derived(fieldErrors(form))

  /** The create dialog. Closed unless the last submit failed on a field. */
  let creating = $state(false)

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

  const label = (v: string) => v.replace(/_/g, " ")
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
    {#if data.mayCreate}
      <button
        type="button"
        class="btn btn-outline ms-auto"
        onclick={() => (creating = true)}
      >
        <span class="iconify lucide--plus size-4"></span>
        New project
      </button>
    {/if}
  </form>

  {#if form?.created}
    <div role="status" class="alert alert-success mt-4">
      <span class="iconify lucide--check size-5"></span>
      <span>
        {form.created} created. It starts as a draft — filter by Draft to find it.
      </span>
    </div>
  {:else if form?.message}
    <div role="alert" class="alert alert-error mt-4">
      <span class="iconify lucide--circle-alert size-5"></span>
      <span>{form.message}</span>
    </div>
  {/if}

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

<!-- Create a project ----------------------------------------------------- -->
<!--
  Rendered only for someone who may submit it. That is a convenience, not a
  control: `create` calls requireCan("projects.write") regardless, because a
  hidden form is still a form anyone can POST.
-->
{#if creating}
  <div class="modal modal-open" role="dialog" aria-label="New project">
    <div class="modal-box max-w-2xl">
      <h3 class="text-lg font-medium">New project</h3>
      <p class="text-base-content/70 mt-1 text-sm">
        The number is assigned automatically. Budget and rate are stored in the
        currency you pick and are never converted.
      </p>

      <form
        method="POST"
        action="?/create"
        class="mt-4 grid gap-4 sm:grid-cols-2"
        use:enhance={closeOnSuccess(() => (creating = false))}
      >
        <fieldset class="fieldset sm:col-span-2">
          <legend class="fieldset-legend">Name</legend>
          <input
            name="project_name"
            aria-invalid={err.aria("project_name")}
            class={`input w-full ${err.input("project_name")}`}
            maxlength="200"
            required
            autocomplete="off"
          />
        </fieldset>

        <fieldset class="fieldset">
          <legend class="fieldset-legend">Client</legend>
          <select
            name="client_id"
            aria-invalid={err.aria("client_id")}
            class={`select w-full ${err.select("client_id")}`}
          >
            <option value="">Internal — no client</option>
            {#each data.clients as c (c.id)}
              <option value={c.id}>{c.client_name}</option>
            {/each}
          </select>
        </fieldset>

        <fieldset class="fieldset">
          <legend class="fieldset-legend">Project manager</legend>
          <select
            name="project_manager_id"
            aria-invalid={err.aria("project_manager_id")}
            class={`select w-full ${err.select("project_manager_id")}`}
          >
            <option value="">Unassigned</option>
            {#each data.managers as m (m.id)}
              <option value={m.id}>{m.name}</option>
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
            {#each data.statuses as s (s)}
              <option value={s} selected={s === "draft"} class="capitalize">
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
            required
          >
            {#each data.priorities as p (p)}
              <option value={p} selected={p === "medium"} class="capitalize">
                {p}
              </option>
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
            {#each data.healths as h (h)}
              <option value={h} selected={h === "on_track"} class="capitalize">
                {label(h)}
              </option>
            {/each}
          </select>
        </fieldset>

        <fieldset class="fieldset">
          <legend class="fieldset-legend">Currency</legend>
          <input
            name="currency"
            aria-invalid={err.aria("currency")}
            class={`input w-full uppercase ${err.input("currency")}`}
            maxlength="3"
            value="USD"
            required
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
          <legend class="fieldset-legend">Target end</legend>
          <input
            name="target_end_date"
            aria-invalid={err.aria("target_end_date")}
            type="date"
            class={`input w-full ${err.input("target_end_date")}`}
          />
        </fieldset>

        <fieldset class="fieldset">
          <legend class="fieldset-legend">Budget</legend>
          <!--
            inputmode, never type="number": the latter round-trips the value
            through a float in the browser before the server ever sees it.
          -->
          <input
            name="budget"
            aria-invalid={err.aria("budget")}
            class={`input w-full ${err.input("budget")}`}
            inputmode="decimal"
          />
        </fieldset>

        <fieldset class="fieldset">
          <legend class="fieldset-legend">Hourly rate</legend>
          <input
            name="hourly_rate"
            aria-invalid={err.aria("hourly_rate")}
            class={`input w-full ${err.input("hourly_rate")}`}
            inputmode="decimal"
          />
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

        <label class="label cursor-pointer justify-start gap-2">
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
            onclick={() => (creating = false)}>Cancel</button
          >
          <button type="submit" class="btn btn-primary">Create project</button>
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
