<script lang="ts">
  import type {
    CustomFieldDefinition,
    CustomFieldValueRow,
  } from "$lib/server/custom-fields/custom-fields.repo"

  /**
   * The generic custom-field renderer docs/06-customization-model.md
   * describes and never built. Switches on `data_type`; the field name is
   * always `cf_<field_key>` (multiselect: `cf_<field_key>[]`), read
   * server-side by looping the same entity's `definitionsFor()` result — see
   * the addComment-shaped actions in `/projects/[id]/+page.server.ts` and
   * `/projects/+page.server.ts`.
   *
   * A blank submission clears the field (`custom-fields.repo.ts`'s
   * `setValue` treats "" / [] as "clear", never as an error) — so nothing
   * here is `required` at the HTML level even when the definition says
   * `is_required`; that's a follow-up validation this slice doesn't add.
   */
  let {
    definition,
    value,
    /** Only meaningful for `data_type === "money"` — the parent entity's own currency, never a per-field picker (docs/26). */
    currency = "USD",
  }: {
    definition: CustomFieldDefinition
    value: CustomFieldValueRow | undefined
    currency?: string
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
      class="input w-full"
      value={value?.value_text ?? ""}
    />
  {:else if definition.data_type === "number"}
    <input
      {name}
      inputmode="decimal"
      class="input w-full"
      value={value?.value_number ?? ""}
    />
  {:else if definition.data_type === "money"}
    <label class="input w-full">
      <span class="text-base-content/70 text-xs">{currency}</span>
      <input {name} inputmode="decimal" value={value?.value_money ?? ""} />
    </label>
  {:else if definition.data_type === "date"}
    <input
      {name}
      type="date"
      class="input w-full"
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
    <select {name} class="select w-full">
      <option value="">—</option>
      {#each definition.options ?? [] as o (o.value)}
        <option value={o.value} selected={o.value === value?.value_text}>
          {o.label}
        </option>
      {/each}
    </select>
  {:else if definition.data_type === "multiselect"}
    <div class="flex flex-col gap-1">
      {#each definition.options ?? [] as o (o.value)}
        <label class="label cursor-pointer justify-start gap-2">
          <input
            type="checkbox"
            name={`${name}[]`}
            class="checkbox checkbox-sm"
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
