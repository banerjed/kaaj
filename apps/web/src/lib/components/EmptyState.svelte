<script lang="ts">
  /** Shared empty-state card (icon + sentence), replacing 14 hand-copied instances. */
  let {
    icon,
    title,
    class: className = "mt-4",
    message,
  }: {
    /** A lucide icon name, e.g. `"lucide--folder-open"` — no `iconify` prefix. */
    icon: string
    /** An optional bold headline above `message`, for "what's missing, why it matters, what next" (doc 02). */
    title?: string
    class?: string
    message: string
  } = $props()
</script>

<div class="card bg-base-100 {className} shadow">
  <div class="card-body items-center py-10 text-center">
    <span class="iconify {icon} text-base-content/30 size-8"></span>
    {#if title}
      <p class="mt-3 font-medium">{title}</p>
    {/if}
    <p class="text-base-content/70 max-w-md text-sm">{message}</p>
  </div>
</div>
