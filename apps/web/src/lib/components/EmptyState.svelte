<script lang="ts">
  /** Shared empty-state card (icon + sentence), replacing 14 hand-copied instances. */
  let {
    icon,
    class: className = "mt-4",
    message,
  }: {
    /** A lucide icon name, e.g. `"lucide--folder-open"` — no `iconify` prefix. */
    icon: string
    class?: string
    message: string
  } = $props()
</script>

<div class="card bg-base-100 {className} shadow">
  <div class="card-body items-center py-10 text-center">
    <span class="iconify {icon} text-base-content/30 size-8"></span>
    <p class="text-base-content/70 text-sm">{message}</p>
  </div>
</div>
