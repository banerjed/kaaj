<script lang="ts">
  import { byCategory } from "$lib/custom-fields"
  import { calendarDate, money, number } from "$lib/format"
  import LabelBadge from "$lib/components/LabelBadge.svelte"
  import type {
    CustomFieldDefinition,
    CustomFieldValueRow,
  } from "$lib/server/custom-fields/custom-fields.repo"

  /**
   * A record's custom field values, read-only, under their category
   * headings. Money is shown in the record's own currency.
   */
  let {
    definitions,
    values,
    locale,
    currency,
    stacked = false,
  }: {
    definitions: CustomFieldDefinition[]
    values: CustomFieldValueRow[]
    locale: string
    currency: string
    /** Label above value, for a narrow card whose own details are laid out that way. */
    stacked?: boolean
  } = $props()

  const groups = $derived(byCategory(definitions))
  const valueOf = $derived(
    new Map(values.map((v) => [v.field_definition_id, v])),
  )
  const optionOf = (def: CustomFieldDefinition, key: string) =>
    def.options?.find((o) => o.value === key)
</script>

{#snippet fieldValue(def: CustomFieldDefinition)}
  {@const v = valueOf.get(def.id)}
  {#if !v}
    —
  {:else if def.data_type === "boolean"}
    {v.value_boolean ? "Yes" : "No"}
  {:else if def.data_type === "money"}
    {money(v.value_money, currency, locale)}
  {:else if def.data_type === "number"}
    {number(v.value_number, locale)}
  {:else if def.data_type === "date"}
    {calendarDate(v.value_date, locale)}
  {:else if def.data_type === "select"}
    {@const o = optionOf(def, v.value_text ?? "")}
    {#if o?.tone}
      <LabelBadge color={o.tone}>{o.label}</LabelBadge>
    {:else}
      {o?.label ?? v.value_text}
    {/if}
  {:else if def.data_type === "multiselect"}
    <span class="flex flex-wrap gap-1">
      {#each v.value_multi ?? [] as key (key)}
        {@const o = optionOf(def, key)}
        {#if o?.tone}
          <LabelBadge color={o.tone}>{o.label}</LabelBadge>
        {:else}
          <span>{o?.label ?? key}</span>
        {/if}
      {/each}
    </span>
  {:else}
    {v.value_text}
  {/if}
{/snippet}

{#each groups as group (group.category)}
  {#if groups.length > 1}
    <h3 class="text-base-content/70 mt-3 text-xs font-semibold first:mt-0">
      {group.category}
    </h3>
  {/if}
  {#if stacked}
    <dl class="mt-1 grid gap-3 text-sm">
      {#each group.fields as def (def.id)}
        <div>
          <dt class="text-base-content/70">{def.label}</dt>
          <dd>{@render fieldValue(def)}</dd>
        </div>
      {/each}
    </dl>
  {:else}
    <dl class="mt-1 grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-sm">
      {#each group.fields as def (def.id)}
        <dt class="text-base-content/70">{def.label}</dt>
        <dd>{@render fieldValue(def)}</dd>
      {/each}
    </dl>
  {/if}
{/each}
