<script lang="ts">
  /** The Cancel/Save footer every settings edit-modal repeats identically. */
  let {
    onCancel,
    cancelLabel = "Cancel",
    submitLabel = "Save",
  }: {
    onCancel: () => void
    cancelLabel?: string
    submitLabel?: string
  } = $props()
</script>

<div class="modal-action">
  <button type="button" class="btn btn-ghost" onclick={onCancel}
    >{cancelLabel}</button
  >
  <button type="submit" class="btn btn-primary">{submitLabel}</button>
</div>
