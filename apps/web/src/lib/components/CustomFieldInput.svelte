<script lang="ts">
  import type {
    CustomFieldDefinition,
    CustomFieldValueRow,
  } from "$lib/server/custom-fields/custom-fields.repo"

  /**
   * One custom field's input, switching on `data_type`. The field name is
   * `cf_<field_key>` (multiselect: `cf_<field_key>[]`), read server-side by
   * `readCustomFieldValues`. A blank submission clears the field; a
   * required one is refused by the server and marked here via `invalid`.
   */
  let {
    definition,
    value,
    /** Only meaningful for `data_type === "money"` — the parent entity's own currency, never a per-field picker (docs/26). */
    currency = "USD",
    invalid = false,
  }: {
    definition: CustomFieldDefinition
    value: CustomFieldValueRow | undefined
    currency?: string
    invalid?: boolean
  } = $props()

  const name = $derived(`cf_${definition.field_key}`)
  const selectedMulti = $derived(new Set(value?.value_multi ?? []))
</script>

<fieldset class="fieldset">
  <legend class="fieldset-legend">
    {definition.label}{#if definition.is_required}<span class="text-error"
        >*</span
      >{/if}
  </legend>

  {#if definition.data_type === "text"}
    <input
      type="text"
      {name}
      class={`input w-full ${invalid ? "input-error" : ""}`}
      aria-invalid={invalid || undefined}
      value={value?.value_text ?? ""}
    />
  {:else if definition.data_type === "number"}
    <input
      {name}
      inputmode="decimal"
      class={`input w-full ${invalid ? "input-error" : ""}`}
      aria-invalid={invalid || undefined}
      value={value?.value_number ?? ""}
    />
  {:else if definition.data_type === "money"}
    <label class={`input w-full ${invalid ? "input-error" : ""}`}>
      <span class="text-base-content/70 text-xs">{currency}</span>
      <input
        {name}
        inputmode="decimal"
        aria-invalid={invalid || undefined}
        value={value?.value_money ?? ""}
      />
    </label>
  {:else if definition.data_type === "date"}
    <input
      {name}
      type="date"
      class={`input w-full ${invalid ? "input-error" : ""}`}
      aria-invalid={invalid || undefined}
      value={value?.value_date ?? ""}
    />
  {:else if definition.data_type === "boolean"}
    <label class="label cursor-pointer justify-start gap-2">
      <input
        type="checkbox"
        {name}
        class="checkbox"
        value="on"
        checked={value?.value_boolean ?? false}
      />
      <span class="label-text">Yes</span>
    </label>
  {:else if definition.data_type === "select"}
    <select
      {name}
      class={`select w-full ${invalid ? "select-error" : ""}`}
      aria-invalid={invalid || undefined}
    >
      <option value="">—</option>
      {#each definition.options ?? [] as o (o.value)}
        <option value={o.value} selected={o.value === value?.value_text}>
          {o.label}
        </option>
      {/each}
    </select>
  {:else if definition.data_type === "multiselect"}
    <div class="flex flex-col gap-1" role="group" aria-label={definition.label}>
      {#each definition.options ?? [] as o (o.value)}
        <label class="label cursor-pointer justify-start gap-2">
          <input
            type="checkbox"
            name={`${name}[]`}
            class={`checkbox checkbox-sm ${invalid ? "checkbox-error" : ""}`}
            aria-invalid={invalid || undefined}
            value={o.value}
            checked={selectedMulti.has(o.value)}
          />
          <span class="label-text">{o.label}</span>
        </label>
      {/each}
    </div>
  {/if}

  {#if definition.help_text}
    <p class="text-base-content/70 text-xs">{definition.help_text}</p>
  {/if}
</fieldset>
