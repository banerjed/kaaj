<script lang="ts">
  import PageTitle from "$lib/components/PageTitle.svelte"
  import type { PayrollPolicy } from "$lib/server/firm-profile/firm_payroll_policies.repo"

  let { data, form } = $props()

  const DAYS = [
    "Sunday",
    "Monday",
    "Tuesday",
    "Wednesday",
    "Thursday",
    "Friday",
    "Saturday",
  ]

  const ROUNDING_LABELS: Record<string, string> = {
    none: "No rounding",
    nearest_5: "Nearest 5 minutes",
    nearest_6: "Nearest 6 minutes (tenth of an hour)",
    nearest_15: "Nearest 15 minutes",
  }

  let editing = $state<PayrollPolicy | "new" | null>(null)
  const current = $derived(editing === "new" ? null : editing)

  // Offices without their own policy fall back to the firm-wide row.
  const covered = $derived(
    new Set(data.policies.map((p) => p.location_code).filter(Boolean)),
  )
  const hasDefault = $derived(data.policies.some((p) => !p.location_id))
</script>

<svelte:head>
  <title>Payroll Policies · Kaaj</title>
</svelte:head>

<div class="p-4 lg:p-6">
  <PageTitle
    title="Payroll Policies"
    items={[
      { label: "Settings", path: "/settings/payroll/policies" },
      { label: "Payroll Policies", active: true },
    ]}
  />

  {#if form?.saved || form?.removed}
    <div role="status" class="alert alert-success mt-4">
      <span class="iconify lucide--check size-5"></span>
      <span>Saved.</span>
    </div>
  {:else if form?.message}
    <div role="alert" class="alert alert-error mt-4">
      <span class="iconify lucide--circle-alert size-5"></span>
      <span>{form.message}</span>
    </div>
  {/if}

  {#if !hasDefault}
    <div role="status" class="alert alert-warning mt-4">
      <span class="iconify lucide--triangle-alert size-5"></span>
      <span>
        No firm-wide policy. Offices without their own rules have nothing to
        fall back on.
      </span>
    </div>
  {/if}

  <div class="mt-4 flex items-center justify-between gap-3">
    <p class="text-base-content/70 text-sm">
      {data.policies.length}
      {data.policies.length === 1 ? "policy" : "policies"}
    </p>
    <button
      class="btn btn-primary btn-sm gap-2"
      onclick={() => (editing = "new")}
    >
      <span class="iconify lucide--plus size-4"></span>
      New Policy
    </button>
  </div>

  {#if data.policies.length === 0}
    <div class="card bg-base-100 mt-4 shadow">
      <div class="card-body items-center py-16 text-center">
        <span class="iconify lucide--scale text-base-content/30 size-10"></span>
        <p class="mt-3 font-medium">No payroll policies yet</p>
        <p class="text-base-content/70 max-w-md text-sm">
          Overtime law is national — FLSA in the US, the Working Time
          Regulations in the UK, the Factories Act in India — so a firm in
          several countries needs a rule per office, over a firm-wide default.
        </p>
      </div>
    </div>
  {:else}
    <div class="mt-4 grid gap-4 lg:grid-cols-2">
      {#each data.policies as p (p.id)}
        <div class="card bg-base-100 shadow">
          <div class="card-body gap-3">
            <div class="flex items-start justify-between gap-2">
              <h2 class="text-base font-medium">
                {p.location_name ?? "Firm-wide default"}
                {#if !p.location_id}
                  <span class="badge badge-sm ms-1">Fallback</span>
                {/if}
              </h2>
              <div class="flex gap-1">
                <button
                  class="btn btn-ghost btn-sm btn-square"
                  aria-label="Edit policy"
                  onclick={() => (editing = p)}
                >
                  <span class="iconify lucide--pencil size-4"></span>
                </button>
                <form method="POST" action="?/remove">
                  <input type="hidden" name="id" value={p.id} />
                  <button
                    class="btn btn-ghost btn-sm btn-square text-error"
                    aria-label="Delete policy"
                  >
                    <span class="iconify lucide--trash-2 size-4"></span>
                  </button>
                </form>
              </div>
            </div>

            <dl class="grid gap-2 text-sm">
              <div class="flex justify-between gap-4">
                <dt class="text-base-content/70">Workweek starts</dt>
                <dd>{DAYS[p.workweek_start_day ?? 0]}</dd>
              </div>
              <div class="flex justify-between gap-4">
                <dt class="text-base-content/70">Time rounding</dt>
                <dd>{ROUNDING_LABELS[p.time_rounding ?? "none"]}</dd>
              </div>
              <div class="flex justify-between gap-4">
                <dt class="text-base-content/70">Time tracking</dt>
                <dd>{p.require_time_tracking ? "Required" : "Optional"}</dd>
              </div>
              {#if p.overtime_rules?.daily_threshold_hours}
                <div class="flex justify-between gap-4">
                  <dt class="text-base-content/70">Overtime after</dt>
                  <dd class="tabular-nums">
                    {p.overtime_rules.daily_threshold_hours}h/day
                    {#if p.overtime_rules.multiplier}
                      at ×{p.overtime_rules.multiplier}
                    {/if}
                  </dd>
                </div>
              {/if}
              {#if p.overtime_rules?.weekly_threshold_hours}
                <div class="flex justify-between gap-4">
                  <dt class="text-base-content/70">Weekly threshold</dt>
                  <dd class="tabular-nums">
                    {p.overtime_rules.weekly_threshold_hours}h
                  </dd>
                </div>
              {/if}
            </dl>
          </div>
        </div>
      {/each}
    </div>

    {#if data.locations.some((l) => !covered.has(l.location_code))}
      <p class="text-base-content/70 mt-3 text-sm">
        Using the firm-wide default:
        {data.locations
          .filter((l) => !covered.has(l.location_code))
          .map((l) => l.name)
          .join(", ")}
      </p>
    {/if}
  {/if}
</div>

{#if editing}
  <div class="modal modal-open" role="dialog" aria-label="Payroll policy">
    <div class="modal-box">
      <h3 class="text-lg font-medium">
        {current ? "Edit policy" : "New policy"}
      </h3>
      <form method="POST" action="?/save" class="mt-4 grid gap-4">
        {#if current}
          <input type="hidden" name="id" value={current.id} />
        {/if}

        {#if !current}
          <fieldset class="fieldset">
            <legend class="fieldset-legend">Applies to</legend>
            <select name="location_code" class="select w-full">
              <option value="">Firm-wide default</option>
              {#each data.locations as l (l.id)}
                <option value={l.location_code}>{l.name}</option>
              {/each}
            </select>
          </fieldset>
        {/if}

        <div class="grid gap-4 sm:grid-cols-2">
          <fieldset class="fieldset">
            <legend class="fieldset-legend">Workweek starts</legend>
            <select
              name="workweek_start_day"
              class="select w-full"
              value={String(current?.workweek_start_day ?? 0)}
            >
              {#each DAYS as day, i (day)}
                <option value={i}>{day}</option>
              {/each}
            </select>
          </fieldset>
          <fieldset class="fieldset">
            <legend class="fieldset-legend">Time rounding</legend>
            <select
              name="time_rounding"
              class="select w-full"
              value={current?.time_rounding ?? "none"}
            >
              {#each data.roundingOptions as r (r)}
                <option value={r}>{ROUNDING_LABELS[r]}</option>
              {/each}
            </select>
          </fieldset>
        </div>

        <fieldset class="fieldset">
          <legend class="fieldset-legend">Overtime</legend>
          <div class="grid gap-3 sm:grid-cols-2">
            <label class="form-control">
              <span class="label text-base-content/70 text-xs"
                >Daily threshold (hours)</span
              >
              <input
                name="daily_threshold_hours"
                inputmode="decimal"
                class="input w-full tabular-nums"
                value={current?.overtime_rules?.daily_threshold_hours ?? ""}
                placeholder="8"
              />
            </label>
            <label class="form-control">
              <span class="label text-base-content/70 text-xs"
                >Weekly threshold (hours)</span
              >
              <input
                name="weekly_threshold_hours"
                inputmode="decimal"
                class="input w-full tabular-nums"
                value={current?.overtime_rules?.weekly_threshold_hours ?? ""}
                placeholder="40"
              />
            </label>
            <label class="form-control">
              <span class="label text-base-content/70 text-xs">Multiplier</span>
              <input
                name="multiplier"
                inputmode="decimal"
                class="input w-full tabular-nums"
                value={current?.overtime_rules?.multiplier ?? ""}
                placeholder="1.5"
              />
            </label>
            <label class="form-control">
              <span class="label text-base-content/70 text-xs"
                >Double time after (hours)</span
              >
              <input
                name="double_time_after_hours"
                inputmode="decimal"
                class="input w-full tabular-nums"
                value={current?.overtime_rules?.double_time_after_hours ?? ""}
                placeholder="12"
              />
            </label>
          </div>
        </fieldset>

        <label class="label cursor-pointer justify-start gap-3">
          <input
            type="checkbox"
            name="require_time_tracking"
            class="checkbox checkbox-sm"
            checked={current?.require_time_tracking ?? true}
          />
          <span class="text-sm">Require time tracking</span>
        </label>

        <div class="modal-action">
          <button
            type="button"
            class="btn btn-ghost"
            onclick={() => (editing = null)}>Cancel</button
          >
          <button type="submit" class="btn btn-primary">Save</button>
        </div>
      </form>
    </div>
    <button
      class="modal-backdrop"
      aria-label="Close"
      onclick={() => (editing = null)}
    ></button>
  </div>
{/if}
