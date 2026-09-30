<script lang="ts">
  import { enhance } from "$app/forms"
  import { keepValues } from "$lib/form-enhance"
  import { fieldErrors } from "$lib/form-errors"
  import SectionCard from "$lib/components/SectionCard.svelte"
  import { byCategory, DEFAULT_CATEGORY } from "$lib/custom-fields"
  import type { CustomFieldDefinition } from "$lib/server/custom-fields/custom-fields.repo"

  /**
   * The custom-field editor every settings page uses (docs/31-custom-fields.md).
   * Posts to the page's `addField`, `archiveField`, `renameCategory` and
   * `moveField` actions; `hidden` travels with every form, for a page that
   * manages more than one kind of record.
   */
  let {
    id,
    title,
    description,
    fields,
    form,
    hidden = {},
  }: {
    /** Unique on the page — names the category list and the form controls. */
    id: string
    title: string
    description?: string
    fields: CustomFieldDefinition[]
    form: { errorFields?: string[]; message?: string } | null | undefined
    hidden?: Record<string, string>
  } = $props()

  // A page can hold several editors sharing one `form` result; only the one
  // whose form was submitted marks its fields.
  let container = $state<HTMLElement>()
  let submittedHere = $state(true)
  const err = $derived(fieldErrors(submittedHere ? (form ?? null) : null))
  const groups = $derived(byCategory(fields))
  const categories = $derived(groups.map((g) => g.category))

  let dataType = $state("text")
  let renaming = $state<string | null>(null)

  const TYPES = [
    ["text", "Text"],
    ["number", "Number"],
    ["money", "Money"],
    ["date", "Date"],
    ["boolean", "Yes / No"],
    ["select", "Dropdown"],
    ["multiselect", "Multi-select"],
  ] as const
  const typeLabel = (t: string) => TYPES.find(([v]) => v === t)?.[1] ?? t
</script>

<svelte:window
  onsubmit={(e) => (submittedHere = !!container?.contains(e.target as Node))}
/>

{#snippet hiddenInputs()}
  {#each Object.entries(hidden) as [name, value] (name)}
    <input type="hidden" {name} {value} />
  {/each}
{/snippet}

<div bind:this={container}>
  <SectionCard {title} {description} class="mt-4">
    {#if fields.length === 0}
      <p class="text-base-content/70 text-sm">No fields yet.</p>
    {/if}

    {#each groups as group (group.category)}
      <div class="mt-4 first:mt-0">
        {#if renaming === group.category}
          <form
            method="POST"
            action="?/renameCategory"
            class="flex flex-wrap items-center gap-2"
            use:enhance={() =>
              async ({ update, result }) => {
                await update({ reset: false })
                if (result.type === "success") renaming = null
              }}
          >
            {@render hiddenInputs()}
            <input type="hidden" name="from" value={group.category} />
            <label class="sr-only" for={`${id}-rename`}>
              New name for {group.category}
            </label>
            <input
              id={`${id}-rename`}
              name="to"
              value={group.category}
              maxlength="100"
              aria-invalid={err.aria("to")}
              class={`input input-sm ${err.input("to")}`}
              required
            />
            <button class="btn btn-primary btn-sm">Rename</button>
            <button
              type="button"
              class="btn btn-ghost btn-sm"
              onclick={() => (renaming = null)}>Cancel</button
            >
          </form>
        {:else}
          <div class="flex items-center gap-1">
            <h3 class="text-sm font-semibold">{group.category}</h3>
            <button
              type="button"
              class="btn btn-ghost btn-xs btn-square"
              aria-label={`Rename category ${group.category}`}
              title="Rename category"
              onclick={() => (renaming = group.category)}
            >
              <span class="iconify lucide--pencil size-3.5"></span>
            </button>
          </div>
        {/if}

        <div class="overflow-x-auto">
          <table class="table table-sm mt-1 table-fixed">
            <thead>
              <tr>
                <th>Label</th>
                <th class="w-40">Type</th>
                <th class="w-24">Required</th>
                <th class="w-28">Actions</th>
              </tr>
            </thead>
            <tbody>
              {#each group.fields as f, i (f.id)}
                <tr>
                  <td class="text-sm">
                    {f.label}
                    {#if f.help_text}
                      <span class="text-base-content/70 block text-xs"
                        >{f.help_text}</span
                      >
                    {/if}
                  </td>
                  <td class="text-sm">
                    {typeLabel(f.data_type)}
                    {#if f.options}
                      <span class="text-base-content/70 block text-xs">
                        {f.options.map((o) => o.label).join(", ")}
                      </span>
                    {/if}
                  </td>
                  <td class="text-sm">{f.is_required ? "Yes" : "No"}</td>
                  <td>
                    <div class="flex gap-1">
                      {#each [["up", "lucide--chevron-up", i === 0], ["down", "lucide--chevron-down", i === group.fields.length - 1]] as const as [direction, icon, disabled] (direction)}
                        <form method="POST" action="?/moveField" use:enhance>
                          {@render hiddenInputs()}
                          <input type="hidden" name="id" value={f.id} />
                          <input
                            type="hidden"
                            name="direction"
                            value={direction}
                          />
                          <button
                            class="btn btn-ghost btn-xs btn-square"
                            aria-label={`Move ${f.label} ${direction}`}
                            {disabled}
                          >
                            <span class={`iconify ${icon} size-3.5`}></span>
                          </button>
                        </form>
                      {/each}
                      <form method="POST" action="?/archiveField" use:enhance>
                        {@render hiddenInputs()}
                        <input type="hidden" name="id" value={f.id} />
                        <button
                          class="btn btn-ghost btn-xs btn-square text-error"
                          aria-label={`Archive ${f.label}`}
                          title="Archive"
                        >
                          <span class="iconify lucide--archive size-3.5"></span>
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
    {/each}

    <form
      method="POST"
      action="?/addField"
      use:enhance={keepValues}
      class="border-base-200 mt-6 grid gap-3 border-t pt-4 sm:grid-cols-2"
    >
      {@render hiddenInputs()}
      <h3 class="text-sm font-semibold sm:col-span-2">Add a field</h3>
      <fieldset class="fieldset">
        <legend class="fieldset-legend text-xs">Label</legend>
        <input
          name="label"
          maxlength="200"
          aria-invalid={err.aria("label")}
          class={`input input-sm w-full ${err.input("label")}`}
          required
        />
      </fieldset>
      <fieldset class="fieldset">
        <legend class="fieldset-legend text-xs">Category</legend>
        <input
          name="category"
          list={`${id}-categories`}
          maxlength="100"
          placeholder={DEFAULT_CATEGORY}
          aria-invalid={err.aria("category")}
          class={`input input-sm w-full ${err.input("category")}`}
        />
        <datalist id={`${id}-categories`}>
          {#each categories as c (c)}
            <option value={c}></option>
          {/each}
        </datalist>
      </fieldset>
      <fieldset class="fieldset">
        <legend class="fieldset-legend text-xs">Type</legend>
        <select
          name="data_type"
          class="select select-sm w-full"
          bind:value={dataType}
        >
          {#each TYPES as [value, text] (value)}
            <option {value}>{text}</option>
          {/each}
        </select>
      </fieldset>
      <fieldset class="fieldset">
        <legend class="fieldset-legend text-xs">Help text</legend>
        <input name="help_text" maxlength="500" class="input input-sm w-full" />
      </fieldset>
      {#if dataType === "select" || dataType === "multiselect"}
        <fieldset class="fieldset sm:col-span-2">
          <legend class="fieldset-legend text-xs">
            Options, one per line: "Label" or "Label|colour" (success, warning,
            error, info, primary, secondary, accent, neutral)
          </legend>
          <textarea
            name="options"
            rows="3"
            aria-invalid={err.aria("options")}
            class={`textarea w-full ${err.textarea("options")}`}
          ></textarea>
        </fieldset>
      {/if}
      <label class="label gap-2">
        <input
          type="checkbox"
          name="is_required"
          class="checkbox checkbox-sm"
        />
        Required
      </label>
      <div class="sm:col-span-2">
        <button type="submit" class="btn btn-primary btn-sm">Add field</button>
      </div>
    </form>
  </SectionCard>
</div>
