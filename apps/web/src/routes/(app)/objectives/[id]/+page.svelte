<script lang="ts">
  import PageTitle from "$lib/components/PageTitle.svelte"
  import { calendarDate, localeForCurrency, money } from "$lib/format"
  import { fieldErrors } from "$lib/form-errors"
  import { enhance } from "$app/forms"
  import { closeOnSuccess } from "$lib/form-enhance"
  import StatusBadge from "$lib/components/StatusBadge.svelte"
  import {
    projectHealthTone as healthTone,
    projectStatusTone,
  } from "$lib/components/status-tone"
  import PageHead from "$lib/components/PageHead.svelte"
  import EmptyState from "$lib/components/EmptyState.svelte"

  let { data, form } = $props()

  const err = $derived(fieldErrors(form))

  let editing = $state(false)
  let addingProject = $state(false)

  const label = (v: string | null) => (v ?? "").replace(/_/g, " ")

  const tenantLocale = $derived(data.tenant?.default_locale ?? "en-US")
  const locale = $derived(
    localeForCurrency(
      data.locations,
      data.objective.currency ?? "USD",
      tenantLocale,
    ),
  )

  const pct = (v: string | null) => Math.round(Number(v ?? 0))
</script>

<PageHead title={data.objective.objective_name} />

<div class="p-4 lg:p-6">
  <PageTitle
    title={data.objective.objective_name}
    items={[
      { label: "Business Operations", path: "/projects" },
      { label: "Objectives", path: "/objectives" },
      { label: data.objective.objective_number ?? "Objective", active: true },
    ]}
  />

  {#if form?.added}
    <div role="status" class="alert alert-success mt-4">
      <span class="iconify lucide--check size-5"></span>
      <span>{form.added} added.</span>
    </div>
  {:else if form?.saved}
    <div role="status" class="alert alert-success mt-4">
      <span class="iconify lucide--check size-5"></span>
      <span>Objective saved.</span>
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
          {data.objective.objective_number}
          {#if data.objective.client_name}· {data.objective.client_name}{/if}
          · {label(data.objective.objective_type)}
          {#if data.objective.owner_name}· owned by {data.objective
              .owner_name}{/if}
        </p>
        <div class="flex gap-1">
          <StatusBadge tone={healthTone(data.objective.health_status)}>
            {label(data.objective.health_status)}
          </StatusBadge>
          <StatusBadge tone={projectStatusTone(data.objective.status)}>
            {label(data.objective.status)}
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

      {#if data.objective.description}
        <p class="text-sm">{data.objective.description}</p>
      {/if}

      <dl class="grid gap-3 sm:grid-cols-4">
        <div>
          <dt class="text-base-content/70 text-xs">Revenue</dt>
          <dd class="text-lg font-medium tabular-nums">
            {money(
              data.objective.actual_revenue,
              data.objective.currency ?? "USD",
              locale,
            )}
          </dd>
        </div>
        <div>
          <dt class="text-base-content/70 text-xs">Target</dt>
          <dd class="text-lg font-medium tabular-nums">
            {money(
              data.objective.target_revenue,
              data.objective.currency ?? "USD",
              locale,
            )}
          </dd>
        </div>
        <div>
          <dt class="text-base-content/70 text-xs">Target end</dt>
          <dd class="text-lg font-medium tabular-nums">
            {data.objective.target_end_date
              ? calendarDate(data.objective.target_end_date, locale)
              : "—"}
          </dd>
        </div>
        <div>
          <dt class="text-base-content/70 text-xs">Progress</dt>
          <dd class="text-lg font-medium tabular-nums">
            {pct(data.objective.progress_percentage)}%
          </dd>
        </div>
      </dl>
      <progress
        class="progress progress-primary w-full"
        value={pct(data.objective.progress_percentage)}
        max="100"
      ></progress>
      <p class="text-base-content/70 text-xs">
        Progress, health and revenue are rolled up from the
        {data.objective.project_count} linked, non-archived project(s) — recomputed
        whenever one of them changes, not editable directly.
      </p>
    </div>
  </div>

  <div class="mt-6">
    <h2 class="flex items-center justify-between text-lg font-medium">
      Projects
      {#if data.mayWrite}
        <button
          type="button"
          class="btn btn-outline btn-sm"
          onclick={() => (addingProject = true)}
        >
          <span class="iconify lucide--plus size-3.5"></span>
          New project
        </button>
      {/if}
    </h2>

    {#if data.projects.length === 0}
      <EmptyState
        icon="lucide--folder-open"
        class="mt-2"
        message="No projects linked to this objective yet."
      />
    {:else}
      <div class="card bg-base-100 mt-2 shadow">
        <div class="overflow-x-auto">
          <table class="table">
            <thead>
              <tr>
                <th>Project</th>
                <th>Status</th>
                <th>Health</th>
                <th class="w-32">Progress</th>
                <th class="text-right">Billed</th>
              </tr>
            </thead>
            <tbody>
              {#each data.projects as p (p.id)}
                <tr class="hover:bg-base-200/40">
                  <td class="font-medium">
                    <a class="link" href={`/projects/${p.id}`}>
                      {p.project_name}
                    </a>
                    <span class="text-base-content/70 block text-xs">
                      {p.project_number}
                    </span>
                  </td>
                  <td>
                    <StatusBadge tone={projectStatusTone(p.status)}>
                      {label(p.status)}
                    </StatusBadge>
                  </td>
                  <td>
                    <StatusBadge tone={healthTone(p.health_status)}>
                      {label(p.health_status)}
                    </StatusBadge>
                  </td>
                  <td>
                    <progress
                      class="progress progress-primary w-full"
                      value={pct(p.progress_percentage)}
                      max="100"
                    ></progress>
                  </td>
                  <td class="text-right tabular-nums">
                    {money(
                      p.total_billed,
                      p.currency ?? data.objective.currency ?? "USD",
                      locale,
                    )}
                  </td>
                </tr>
              {/each}
            </tbody>
          </table>
        </div>
      </div>
    {/if}
  </div>
</div>

<!-- Edit the objective ---------------------------------------------------- -->
{#if editing}
  <div class="modal modal-open" role="dialog" aria-label="Edit objective">
    <div class="modal-box max-w-2xl">
      <h3 class="text-lg font-medium">
        Edit {data.objective.objective_number}
      </h3>
      <p class="text-base-content/70 mt-1 text-sm">
        Progress, health and actual revenue are rolled up from linked projects
        and are not edited here.
      </p>

      <form
        method="POST"
        action="?/updateObjective"
        class="mt-4 grid gap-4 sm:grid-cols-2"
        use:enhance={closeOnSuccess(() => (editing = false))}
      >
        <fieldset class="fieldset sm:col-span-2">
          <legend class="fieldset-legend">Name</legend>
          <input
            name="objective_name"
            aria-invalid={err.aria("objective_name")}
            class={`input w-full ${err.input("objective_name")}`}
            maxlength="200"
            required
            value={data.objective.objective_name}
          />
        </fieldset>

        <fieldset class="fieldset">
          <legend class="fieldset-legend">Type</legend>
          <select
            name="objective_type"
            aria-invalid={err.aria("objective_type")}
            class={`select w-full ${err.select("objective_type")}`}
            required
          >
            {#each data.types as t (t)}
              <option
                value={t}
                selected={t === data.objective.objective_type}
                class="capitalize"
              >
                {label(t)}
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
            {#each data.statuses as s (s)}
              <option
                value={s}
                selected={s === data.objective.status}
                class="capitalize"
              >
                {label(s)}
              </option>
            {/each}
          </select>
        </fieldset>

        <fieldset class="fieldset">
          <legend class="fieldset-legend">Owner</legend>
          <select
            name="owner_employee_id"
            aria-invalid={err.aria("owner_employee_id")}
            class={`select w-full ${err.select("owner_employee_id")}`}
          >
            <option value="">Unassigned</option>
            {#each data.owners as owner (owner.id)}
              <option value={owner.id}>{owner.name}</option>
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
            value={data.objective.currency ?? "USD"}
            required
          />
        </fieldset>

        <fieldset class="fieldset">
          <legend class="fieldset-legend">Target end</legend>
          <input
            name="target_end_date"
            aria-invalid={err.aria("target_end_date")}
            type="date"
            class={`input w-full ${err.input("target_end_date")}`}
            value={data.objective.target_end_date}
          />
        </fieldset>

        <fieldset class="fieldset">
          <legend class="fieldset-legend">Target revenue</legend>
          <input
            name="target_revenue"
            aria-invalid={err.aria("target_revenue")}
            class={`input w-full ${err.input("target_revenue")}`}
            inputmode="decimal"
            value={data.objective.target_revenue}
          />
        </fieldset>

        <fieldset class="fieldset sm:col-span-2">
          <legend class="fieldset-legend">Description</legend>
          <textarea
            name="description"
            aria-invalid={err.aria("description")}
            class={`textarea w-full ${err.textarea("description")}`}
            rows="2"
            maxlength="2000">{data.objective.description ?? ""}</textarea
          >
        </fieldset>

        <div class="modal-action sm:col-span-2">
          <button
            type="button"
            class="btn btn-ghost"
            onclick={() => (editing = false)}>Cancel</button
          >
          <button type="submit" class="btn btn-primary">Save</button>
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

<!-- Add a project under this objective ------------------------------------ -->
{#if addingProject}
  <div class="modal modal-open" role="dialog" aria-label="New project">
    <div class="modal-box max-w-md">
      <h3 class="text-lg font-medium">New project</h3>
      <p class="text-base-content/70 mt-1 text-sm">
        Linked to {data.objective.objective_name}. Budget, dates and billing can
        be filled in from the project's own page afterward.
      </p>

      <form
        method="POST"
        action="?/addProject"
        class="mt-4 grid gap-4"
        use:enhance={closeOnSuccess(() => (addingProject = false))}
      >
        <fieldset class="fieldset">
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
          <legend class="fieldset-legend">Currency</legend>
          <input
            name="currency"
            aria-invalid={err.aria("currency")}
            class={`input w-full uppercase ${err.input("currency")}`}
            maxlength="3"
            value={data.objective.currency ?? "USD"}
            required
          />
        </fieldset>

        <div class="modal-action">
          <button
            type="button"
            class="btn btn-ghost"
            onclick={() => (addingProject = false)}>Cancel</button
          >
          <button type="submit" class="btn btn-primary">Create project</button>
        </div>
      </form>
    </div>
    <button
      class="modal-backdrop"
      aria-label="Close"
      onclick={() => (addingProject = false)}
    ></button>
  </div>
{/if}
