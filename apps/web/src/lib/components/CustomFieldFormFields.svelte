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

  const groups = $derived(byCategory(definitions))
  const valueOf = $derived(
    new Map(values.map((v) => [v.field_definition_id, v])),
  )
</script>

{#each groups as group (group.category)}
  {#if groups.length > 1}
    <h3 class="mt-2 text-sm font-semibold">{group.category}</h3>
  {/if}
  {#each group.fields as def (def.id)}
    <CustomFieldInput
      definition={def}
      value={valueOf.get(def.id)}
      {currency}
      invalid={errorFields.includes(`cf_${def.field_key}`)}
    />
  {/each}
{/each}
