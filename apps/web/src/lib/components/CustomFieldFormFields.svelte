<script lang="ts">
  import { byCategory } from "$lib/custom-fields"
  import CustomFieldInput from "$lib/components/CustomFieldInput.svelte"
  import type {
    CustomFieldDefinition,
    CustomFieldValueRow,
  } from "$lib/server/custom-fields/custom-fields.repo"

  /**
   * The inputs for a record's custom fields, under their category headings,
   * for use inside the page's own form. Read server-side with
   * `readCustomFieldValues` over the same definitions.
   *
   * Each category is its own `fieldset` laying its fields out two-up, rather
   * than every field being a full-width row in the page's form grid. A tenant
   * with three categories of five fields is otherwise fifteen stacked rows
   * below the built-in ones, and the modal becomes a scroll with no shape.
   *
   * Categories are VISIBLE, never behind a tab or an accordion: a refused
   * field is marked (`errorFields`), and a mark inside a collapsed pane is a
   * mark nobody can see (L68).
   */
  let {
    definitions,
    values,
    currency,
    errorFields = [],
  }: {
    definitions: CustomFieldDefinition[]
    values: CustomFieldValueRow[]
    currency: string
    errorFields?: string[]
  } = $props()

  /**
   * Complete class strings, never assembled — Tailwind reads source text and
   * cannot evaluate `sm:col-span-${n}`, so an assembled one is never
   * generated and the field renders unstyled with no error.
   *
   * A multiselect is a column of checkboxes and a textarea-shaped value wants
   * the room; everything else pairs up.
   */
  const WIDTH: Record<CustomFieldDefinition["data_type"], string> = {
    text: "",
    number: "",
    money: "",
    date: "",
    boolean: "",
    select: "",
    multiselect: "sm:col-span-2",
  }

  const groups = $derived(byCategory(definitions))
  const valueOf = $derived(
    new Map(values.map((v) => [v.field_definition_id, v])),
  )
  const hasError = (def: CustomFieldDefinition) =>
    errorFields.includes(`cf_${def.field_key}`)
</script>

{#each groups as group (group.category)}
  <fieldset class="fieldset border-base-300 rounded-box border p-4">
    <legend class="fieldset-legend px-2 text-sm font-semibold">
      {group.category}
    </legend>
    <div class="grid gap-4 sm:grid-cols-2">
      {#each group.fields as def (def.id)}
        <div class={WIDTH[def.data_type]}>
          <CustomFieldInput
            definition={def}
            value={valueOf.get(def.id)}
            {currency}
            invalid={hasError(def)}
          />
        </div>
      {/each}
    </div>
  </fieldset>
{/each}
