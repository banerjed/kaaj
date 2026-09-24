<script lang="ts">
  import PageTitle from "$lib/components/PageTitle.svelte"
  import { calendarDate, localeForCurrency, money } from "$lib/format"
  import { fieldErrors } from "$lib/form-errors"
  import { enhance } from "$app/forms"
  import { closeOnSuccess } from "$lib/form-enhance"
  import StatusBadge from "$lib/components/StatusBadge.svelte"
  import { projectHealthTone as healthTone } from "$lib/components/status-tone"
  import PageHead from "$lib/components/PageHead.svelte"
  import EmptyState from "$lib/components/EmptyState.svelte"

  let { data, form } = $props()

  const err = $derived(fieldErrors(form))

  /** The create dialog. Closed unless the last submit failed on a field. */
  let creating = $state(false)

  const tenantLocale = $derived(data.tenant?.default_locale ?? "en-US")
  const localeFor = (c: string | null) =>
    c ? localeForCurrency(data.locations, c, tenantLocale) : tenantLocale

  const pct = (v: string | null) => Math.round(Number(v ?? 0))
  const label = (v: string) => v.replace(/_/g, " ")
</script>

<PageHead title="Objectives" />

<div class="p-4 lg:p-6">
  <PageTitle
    title="Objectives"
    items={[
      { label: "Business Operations", path: "/projects" },
      { label: "Objectives", active: true },
    ]}
  />

  <div class="mt-4 flex justify-end">
    {#if data.mayCreate}
      <button
        type="button"
        class="btn btn-outline"
        onclick={() => (creating = true)}
      >
        <span class="iconify lucide--plus size-4"></span>
        New objective
      </button>
    {/if}
  </div>

  {#if form?.created}
    <div role="status" class="alert alert-success mt-4">
      <span class="iconify lucide--check size-5"></span>
      <span>{form.created} created.</span>
    </div>
  {:else if form?.message}
    <div role="alert" class="alert alert-error mt-4">
      <span class="iconify lucide--circle-alert size-5"></span>
      <span>{form.message}</span>
    </div>
  {/if}

  {#if data.objectives.length === 0}
    <EmptyState
      icon="lucide--target"
      class="mt-4"
      message="No objectives yet."
    />
  {:else}
    <div class="mt-4 grid gap-3 lg:grid-cols-2 2xl:grid-cols-3">
      {#each data.objectives as o (o.id)}
        {@const locale = localeFor(o.currency)}
        <div class="card bg-base-100 shadow">
          <div class="card-body gap-3 p-4">
            <div class="flex items-start justify-between gap-3">
              <div class="min-w-0">
                <a class="link font-medium" href={`/objectives/${o.id}`}>
                  {o.objective_name}
                </a>
                <p class="text-base-content/70 truncate text-xs">
                  {o.objective_number}
                  {o.client_name ? ` · ${o.client_name}` : ""}
                  · {label(o.objective_type)}
                </p>
              </div>
              <div class="flex shrink-0 gap-1">
                <StatusBadge tone={healthTone(o.health_status)}>
                  {label(o.health_status)}
                </StatusBadge>
                <StatusBadge tone="neutral">{label(o.status)}</StatusBadge>
              </div>
            </div>

            <div>
              <div class="text-base-content/70 flex justify-between text-xs">
                <span>{o.project_count} projects</span>
                <span class="tabular-nums">{pct(o.progress_percentage)}%</span>
              </div>
              <progress
                class="progress progress-primary mt-1 w-full"
                value={pct(o.progress_percentage)}
                max="100"
              ></progress>
            </div>

            <dl class="grid grid-cols-2 gap-2 text-xs">
              <div>
                <dt class="text-base-content/70">Revenue</dt>
                <dd class="tabular-nums">
                  {money(o.actual_revenue, o.currency ?? "USD", locale)}
                  <span class="text-base-content/50">
                    / {money(o.target_revenue, o.currency ?? "USD", locale)}
                  </span>
                </dd>
              </div>
              <div>
                <dt class="text-base-content/70">Target end</dt>
                <dd class="tabular-nums">
                  {o.target_end_date
                    ? calendarDate(o.target_end_date, locale)
                    : "—"}
                </dd>
              </div>
            </dl>

            <p
              class="text-base-content/70 border-base-200 border-t pt-2 text-xs"
            >
              {o.owner_name ?? "No owner"}
            </p>
          </div>
        </div>
      {/each}
    </div>
  {/if}
</div>

<!-- Create an objective -------------------------------------------------- -->
{#if creating}
  <div class="modal modal-open" role="dialog" aria-label="New objective">
    <div class="modal-box max-w-2xl">
      <h3 class="text-lg font-medium">New objective</h3>
      <p class="text-base-content/70 mt-1 text-sm">
        The number is assigned automatically. Progress, health and actual
        revenue are rolled up from the projects you link to it later.
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
            name="objective_name"
            aria-invalid={err.aria("objective_name")}
            class={`input w-full ${err.input("objective_name")}`}
            maxlength="200"
            required
            autocomplete="off"
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
              <option value={t} class="capitalize">{label(t)}</option>
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
              <option value={s} selected={s === "planning"} class="capitalize">
                {label(s)}
              </option>
            {/each}
          </select>
        </fieldset>

        <fieldset class="fieldset">
          <legend class="fieldset-legend">Client (optional)</legend>
          <select
            name="client_id"
            aria-invalid={err.aria("client_id")}
            class={`select w-full ${err.select("client_id")}`}
          >
            <option value="">Not client-specific</option>
            {#each data.clients as c (c.id)}
              <option value={c.id}>{c.client_name}</option>
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
            value="USD"
            required
          />
        </fieldset>

        <fieldset class="fieldset">
          <legend class="fieldset-legend">Fiscal year</legend>
          <input
            name="fiscal_year"
            aria-invalid={err.aria("fiscal_year")}
            class={`input w-full ${err.input("fiscal_year")}`}
            maxlength="10"
            placeholder="2026"
          />
        </fieldset>

        <fieldset class="fieldset">
          <legend class="fieldset-legend">Quarter</legend>
          <input
            name="quarter"
            aria-invalid={err.aria("quarter")}
            class={`input w-full ${err.input("quarter")}`}
            maxlength="10"
            placeholder="Q1"
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

        <fieldset class="fieldset sm:col-span-2">
          <legend class="fieldset-legend">Target revenue</legend>
          <!-- inputmode, never type="number", which round-trips through a float. -->
          <input
            name="target_revenue"
            aria-invalid={err.aria("target_revenue")}
            class={`input w-full ${err.input("target_revenue")}`}
            inputmode="decimal"
          />
        </fieldset>

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
          <button type="submit" class="btn btn-primary">
            Create objective
          </button>
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
