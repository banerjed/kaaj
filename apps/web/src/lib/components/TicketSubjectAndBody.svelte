<script lang="ts">
  import RichTextEditor from "$lib/components/RichTextEditor.svelte"
  import type { FieldErrors } from "$lib/form-errors"

  /**
   * The one pair of fields a ticket always has, however it's reached: a
   * subject and a body. `/ticketing/new` uses it for Title + Description;
   * `/ticketing/[id]`'s "Update" tab uses it for Subject + a new update —
   * same shape, different labels and requiredness, so the markup lives once.
   */
  let {
    err,
    titleValue = "",
    bodyName,
    bodyLabel,
    bodyPlaceholder,
    bodyRequired = false,
  }: {
    err: FieldErrors
    titleValue?: string
    bodyName: string
    bodyLabel: string
    bodyPlaceholder: string
    bodyRequired?: boolean
  } = $props()
</script>

<fieldset class="fieldset">
  <legend class="fieldset-legend text-xs">Subject</legend>
  <input
    name="title"
    value={titleValue}
    aria-invalid={err.aria("title")}
    class={`input input-sm w-full ${err.input("title")}`}
    maxlength="255"
    required
  />
</fieldset>

<fieldset class="fieldset">
  <legend class="fieldset-legend text-xs">{bodyLabel}</legend>
  <RichTextEditor
    name={bodyName}
    placeholder={bodyPlaceholder}
    required={bodyRequired}
    invalid={err.has(bodyName)}
  />
</fieldset>
