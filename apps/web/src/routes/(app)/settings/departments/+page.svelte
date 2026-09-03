<script lang="ts">
  import PageTitle from "$lib/components/PageTitle.svelte"
  import { localised } from "$lib/format"
  import type { FirmDepartment } from "$lib/server/firm-profile/firm_departments.repo"
  import { fieldErrors } from "$lib/form-errors"
  import { enhance } from "$app/forms"
  import { closeOnSuccess } from "$lib/form-enhance"

  let { data, form } = $props()

  // Which field to put the highlight on. The action names them in
  // `errorFields`; colour alone is not enough, so `aria-invalid` goes with it.
  const err = $derived(fieldErrors(form))

  const locale = $derived(data.tenant?.default_locale ?? "en-US")
  const supportedLocales = $derived(
    data.tenant?.supported_locales ?? [data.tenant?.default_locale ?? "en-US"],
  )

  /**
   * Flatten the forest into rows carrying their depth, so the table can indent
   * without nesting tables — a nested <table> per level is unreadable to a
   * screen reader and impossible to align.
   *
   * Roots are anything whose parent is missing from the set, not just anything
   * with a null parent: a department whose parent was archived still has to
   * appear, or it vanishes from the page entirely.
   */
  type Row = FirmDepartment & { depth: number }

  const rows = $derived.by(() => {
    const all = data.departments
    const codes = new Set(all.map((d) => d.department_code))
    const childrenOf = new Map<string | null, FirmDepartment[]>()

    for (const d of all) {
      const parent =
        d.parent_department_code && codes.has(d.parent_department_code)
          ? d.parent_department_code
          : null
      const list = childrenOf.get(parent)
      if (list) list.push(d)
      else childrenOf.set(parent, [d])
    }

    const out: Row[] = []
    const walk = (parent: string | null, depth: number) => {
      for (const d of childrenOf.get(parent) ?? []) {
        out.push({ ...d, depth })
        if (d.department_code) walk(d.department_code, depth + 1)
      }
    }
    walk(null, 0)
    return out
  })

  const totalPeople = $derived(
    data.departments.reduce((sum, d) => sum + d.employee_count, 0),
  )

  // Which row the modal is editing; null means it is closed.
  let editing = $state<Row | "new" | null>(null)
  const current = $derived(editing === "new" ? null : editing)

  const locationName = (code: string | null) =>
    data.locations.find((l) => l.location_code === code)?.name ?? code ?? "—"
</script>

<svelte:head>
  <title>Departments · Kaaj</title>
</svelte:head>

<div class="p-4 lg:p-6">
  <PageTitle
    title="Departments"
    items={[
      { label: "Settings", path: "/settings/departments" },
      { label: "Departments", active: true },
    ]}
  />

  {#if form?.saved}
    <div role="status" class="alert alert-success mt-4">
      <span class="iconify lucide--check size-5"></span>
      <span>Department saved.</span>
    </div>
  {:else if form?.archived}
    <div role="status" class="alert alert-success mt-4">
      <span class="iconify lucide--check size-5"></span>
      <span>Department deactivated.</span>
    </div>
  {:else if form?.message}
    <div role="alert" class="alert alert-error mt-4">
      <span class="iconify lucide--circle-alert size-5"></span>
      <span>{form.message}</span>
    </div>
  {/if}

  <div class="mt-4 flex items-center justify-between gap-3">
    <p class="text-base-content/70 text-sm">
      {data.departments.length}
      {data.departments.length === 1 ? "department" : "departments"} ·
      {totalPeople} people
    </p>
    <button
      class="btn btn-primary btn-sm gap-2"
      onclick={() => (editing = "new")}
    >
      <span class="iconify lucide--plus size-4"></span>
      New Department
    </button>
  </div>

  {#if rows.length === 0}
    <div class="card bg-base-100 mt-4 shadow">
      <div class="card-body items-center py-16 text-center">
        <span class="iconify lucide--network text-base-content/30 size-10"
        ></span>
        <p class="mt-3 font-medium">No departments yet</p>
        <p class="text-base-content/70 max-w-md text-sm">
          Departments group people for reporting, budgets and approvals. Create
          the top-level ones first, then nest beneath them.
        </p>
      </div>
    </div>
  {:else}
    <!-- Stacked list below md, table above (doc 04). -->
    <div class="mt-4 md:hidden">
      <ul class="list bg-base-100 rounded-box shadow">
        {#each rows as row (row.id)}
          <li class="list-row">
            <div class="list-col-grow">
              <p
                class="font-medium"
                style={`padding-inline-start:${row.depth}rem`}
              >
                {localised(row.name_i18n, row.name, locale)}
              </p>
              <p class="text-base-content/70 font-mono text-xs">
                {row.department_code}
              </p>
            </div>
            <div class="badge badge-sm">{row.employee_count}</div>
            <p class="list-col-wrap text-base-content/70 text-sm">
              {locationName(row.location_code)}
              {#if row.head_name}· Head: {row.head_name}{/if}
            </p>
          </li>
        {/each}
      </ul>
    </div>

    <div class="card bg-base-100 mt-4 shadow max-md:hidden">
      <div class="overflow-x-auto">
        <table class="table">
          <thead>
            <tr>
              <th>Department</th>
              <th>Code</th>
              <th>Location</th>
              <th>Head</th>
              <th>Cost centre</th>
              <th class="text-right">People</th>
              <th class="w-24">Actions</th>
            </tr>
          </thead>
          <tbody>
            {#each rows as row (row.id)}
              <tr class="hover:bg-base-200/40">
                <td>
                  <div
                    class="flex items-center gap-2"
                    style={`padding-inline-start:${row.depth * 1.5}rem`}
                  >
                    {#if row.depth > 0}
                      <span
                        class="iconify lucide--corner-down-right text-base-content/70 size-3.5"
                        aria-hidden="true"
                      ></span>
                    {/if}
                    <span class="font-medium">
                      {localised(row.name_i18n, row.name, locale)}
                    </span>
                  </div>
                </td>
                <td class="font-mono text-xs">{row.department_code}</td>
                <td class="text-sm">{locationName(row.location_code)}</td>
                <td class="text-sm">{row.head_name ?? "—"}</td>
                <td class="text-sm">{row.cost_center ?? "—"}</td>
                <td class="text-right text-sm tabular-nums">
                  {row.employee_count}
                </td>
                <td>
                  <div class="flex gap-1">
                    <button
                      class="btn btn-ghost btn-sm btn-square"
                      aria-label={`Edit ${row.name}`}
                      onclick={() => (editing = row)}
                    >
                      <span class="iconify lucide--pencil size-4"></span>
                    </button>
                    <form method="POST" action="?/archive">
                      <input type="hidden" name="id" value={row.id} />
                      <button
                        class="btn btn-ghost btn-sm btn-square text-error"
                        aria-label={`Deactivate ${row.name}`}
                        title="Deactivate"
                      >
                        <span class="iconify lucide--archive size-4"></span>
                      </button>
                    </form>
                  </div>
                </td>
              </tr>
            {/each}
          </tbody>
        </table>
      </div>
    </div>
  {/if}
</div>

<!-- Create / edit ---------------------------------------------------------- -->
{#if editing}
  <div class="modal modal-open" role="dialog" aria-label="Department">
    <div class="modal-box max-w-2xl">
      <h3 class="text-lg font-medium">
        {current ? "Edit department" : "New department"}
      </h3>

      <form
        method="POST"
        action="?/save"
        class="mt-4 grid gap-4"
        use:enhance={closeOnSuccess(() => (editing = null))}
      >
        {#if current}
          <input type="hidden" name="id" value={current.id} />
        {/if}
        {#each supportedLocales as l (l)}
          <input type="hidden" name="supported_locales" value={l} />
        {/each}

        <div class="grid gap-4 sm:grid-cols-2">
          <fieldset class="fieldset">
            <legend class="fieldset-legend">Name</legend>
            <input
              name="name"
              aria-invalid={err.aria("name")}
              class={`input w-full ${err.input("name")}`}
              value={current?.name ?? ""}
              required
            />
          </fieldset>
          <fieldset class="fieldset">
            <legend class="fieldset-legend">Code</legend>
            <input
              name="department_code"
              aria-invalid={err.aria("department_code")}
              class={`input w-full font-mono uppercase ${err.input("department_code")}`}
              value={current?.department_code ?? ""}
              placeholder="ENG-BE"
              required
            />
          </fieldset>
        </div>

        {#if supportedLocales.length > 1}
          <fieldset class="fieldset">
            <legend class="fieldset-legend">Translations</legend>
            <div class="grid gap-2 sm:grid-cols-2">
              {#each supportedLocales as code (code)}
                <label class="form-control">
                  <span class="label text-base-content/70 text-xs">{code}</span>
                  <input
                    name={`name_i18n.${code}`}
                    class="input w-full"
                    value={current?.name_i18n?.[code] ?? ""}
                    placeholder={current?.name ?? ""}
                    aria-label={`Department name in ${code}`}
                  />
                </label>
              {/each}
            </div>
          </fieldset>
        {/if}

        <div class="grid gap-4 sm:grid-cols-2">
          <fieldset class="fieldset">
            <legend class="fieldset-legend">Parent department</legend>
            <select
              name="parent_department_code"
              aria-invalid={err.aria("parent_department_code")}
              class={`select w-full ${err.select("parent_department_code")}`}
              value={current?.parent_department_code ?? ""}
            >
              <option value="">None — top level</option>
              {#each data.departments as d (d.id)}
                {#if d.id !== current?.id}
                  <option value={d.department_code}>
                    {localised(d.name_i18n, d.name, locale)}
                  </option>
                {/if}
              {/each}
            </select>
          </fieldset>

          <fieldset class="fieldset">
            <legend class="fieldset-legend">Location</legend>
            <select
              name="location_code"
              aria-invalid={err.aria("location_code")}
              class={`select w-full ${err.select("location_code")}`}
              value={current?.location_code ?? ""}
            >
              <option value="">Not assigned</option>
              {#each data.locations as l (l.id)}
                <option value={l.location_code}>{l.name}</option>
              {/each}
            </select>
          </fieldset>
        </div>

        <div class="grid gap-4 sm:grid-cols-2">
          <fieldset class="fieldset">
            <legend class="fieldset-legend">Cost centre</legend>
            <input
              name="cost_center"
              aria-invalid={err.aria("cost_center")}
              class={`input w-full ${err.input("cost_center")}`}
              value={current?.cost_center ?? ""}
            />
          </fieldset>
          <fieldset class="fieldset">
            <legend class="fieldset-legend">Budget currency</legend>
            <select
              name="budget_currency"
              aria-invalid={err.aria("budget_currency")}
              class={`select w-full ${err.select("budget_currency")}`}
              value={current?.budget_currency ?? data.tenant?.default_currency}
            >
              {#each data.tenant?.supported_currencies ?? [] as c (c)}
                <option value={c}>{c}</option>
              {/each}
            </select>
          </fieldset>
        </div>

        <fieldset class="fieldset">
          <legend class="fieldset-legend">Description</legend>
          <textarea
            name="description"
            aria-invalid={err.aria("description")}
            class={`textarea w-full ${err.textarea("description")}`}
            rows="2"
            value={current?.description ?? ""}
          ></textarea>
        </fieldset>

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
