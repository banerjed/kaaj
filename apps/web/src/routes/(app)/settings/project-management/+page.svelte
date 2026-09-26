<script lang="ts">
  import PageTitle from "$lib/components/PageTitle.svelte"
  import PageHead from "$lib/components/PageHead.svelte"
  import { fieldErrors } from "$lib/form-errors"
  import { enhance } from "$app/forms"
  import { keepValues } from "$lib/form-enhance"
  import type { CustomFieldDefinition } from "$lib/server/custom-fields/custom-fields.repo"

  let { data, form } = $props()

  const err = $derived(fieldErrors(form))

  let addingEntityType = $state<"project" | "task">("project")
  let addingDataType = $state("text")

  const label = (v: string) => v.replace(/_/g, " ")
</script>

<PageHead title="Project Management Fields" />

<div class="p-4 lg:p-6">
  <PageTitle
    title="Project Management Fields"
    items={[
      { label: "Settings", path: "/settings/company" },
      { label: "Project Management Fields", active: true },
    ]}
  />
  <p class="text-base-content/70 mt-1 text-sm">
    Custom fields tenants can add to a project or a task — descriptive only. A
    `money`-typed field here is typed and validated, but never feeds accounting
    or payroll (docs/26-project-management-custom-fields.md).
  </p>

  {#if form?.fieldAdded}
    <div role="status" class="alert alert-success mt-4">
      <span class="iconify lucide--check size-5"></span>
      <span>Field added.</span>
    </div>
  {:else if form?.fieldArchived}
    <div role="status" class="alert alert-success mt-4">
      <span class="iconify lucide--check size-5"></span>
      <span>Field archived.</span>
    </div>
  {:else if form?.message}
    <div role="alert" class="alert alert-error mt-4">
      <span class="iconify lucide--circle-alert size-5"></span>
      <span>{form.message}</span>
    </div>
  {/if}

  {#snippet fieldsTable(fields: CustomFieldDefinition[])}
    {#if fields.length === 0}
      <p class="text-base-content/70 text-sm">No fields yet.</p>
    {:else}
      <div class="overflow-x-auto">
        <table class="table">
          <thead>
            <tr>
              <th>Label</th>
              <th>Type</th>
              <th>Required</th>
              <th class="w-16">Actions</th>
            </tr>
          </thead>
          <tbody>
            {#each fields as f (f.id)}
              <tr>
                <td class="text-sm">
                  {f.label}
                  {#if f.help_text}
                    <span class="text-base-content/60 block text-xs"
                      >{f.help_text}</span
                    >
                  {/if}
                </td>
                <td class="text-sm">
                  {label(f.data_type)}
                  {#if f.options}
                    <span class="text-base-content/60 block text-xs">
                      {f.options.map((o) => o.label).join(", ")}
                    </span>
                  {/if}
                </td>
                <td class="text-sm">{f.is_required ? "Yes" : "No"}</td>
                <td>
                  <form method="POST" action="?/archiveField" use:enhance>
                    <input type="hidden" name="id" value={f.id} />
                    <button
                      class="btn btn-ghost btn-xs btn-square text-error"
                      aria-label={`Archive ${f.label}`}
                    >
                      <span class="iconify lucide--archive size-3.5"></span>
                    </button>
                  </form>
                </td>
              </tr>
            {/each}
          </tbody>
        </table>
      </div>
    {/if}
  {/snippet}

  <div class="card bg-base-100 mt-4 shadow">
    <div class="card-body gap-2">
      <h2 class="text-base font-medium">Project fields</h2>
      {@render fieldsTable(data.projectFields)}
    </div>
  </div>

  <div class="card bg-base-100 mt-4 shadow">
    <div class="card-body gap-2">
      <h2 class="text-base font-medium">Task fields</h2>
      {@render fieldsTable(data.taskFields)}
    </div>
  </div>

  <div class="card bg-base-100 mt-4 shadow">
    <div class="card-body gap-3">
      <h2 class="text-base font-medium">Add a field</h2>
      <form
        method="POST"
        action="?/addField"
        use:enhance={keepValues}
        class="grid gap-3 sm:grid-cols-2"
      >
        <fieldset class="fieldset">
          <legend class="fieldset-legend text-xs">Applies to</legend>
          <select
            name="entity_type"
            class="select select-sm w-full"
            bind:value={addingEntityType}
          >
            <option value="project">Project</option>
            <option value="task">Task</option>
          </select>
        </fieldset>
        <fieldset class="fieldset">
          <legend class="fieldset-legend text-xs">Label</legend>
          <input
            name="label"
            aria-invalid={err.aria("label")}
            class={`input input-sm w-full ${err.input("label")}`}
            placeholder="e.g. Estimated Licensing Cost"
            required
          />
        </fieldset>
        <fieldset class="fieldset">
          <legend class="fieldset-legend text-xs">Type</legend>
          <select
            name="data_type"
            class="select select-sm w-full"
            bind:value={addingDataType}
          >
            <option value="text">Text</option>
            <option value="number">Number</option>
            <option value="money">Money</option>
            <option value="date">Date</option>
            <option value="boolean">Yes / No</option>
            <option value="select">Dropdown</option>
            <option value="multiselect">Multi-select</option>
          </select>
        </fieldset>
        {#if addingDataType === "select" || addingDataType === "multiselect"}
          <fieldset class="fieldset sm:col-span-2">
            <legend class="fieldset-legend text-xs">
              Options (one per line — "Label" or "Label|color". Colors: success,
              warning, error, info, primary, secondary, accent, neutral —
              unspecified colors are assigned automatically)
            </legend>
            <textarea
              name="options"
              class={`textarea w-full ${err.textarea("options")}`}
              rows="3"
              placeholder={"Gold|warning\nSilver|neutral"}
            ></textarea>
          </fieldset>
        {/if}
        <fieldset class="fieldset">
          <legend class="fieldset-legend text-xs">Help text</legend>
          <input name="help_text" class="input input-sm w-full" />
        </fieldset>
        <label class="label mt-6 gap-2">
          <input
            type="checkbox"
            name="is_required"
            class="checkbox checkbox-sm"
          />
          Required
        </label>
        <div class="sm:col-span-2">
          <button type="submit" class="btn btn-primary btn-sm">Add field</button
          >
        </div>
      </form>
    </div>
  </div>
</div>
