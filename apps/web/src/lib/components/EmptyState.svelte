<script lang="ts">
  /**
   * The centred icon-plus-sentence card shown in place of a list, a table, or
   * a detail panel with nothing in it.
   *
   * Fourteen pages wrote this card by hand — same wrapper, same padding, same
   * muted icon and text classes — differing only in which lucide icon and
   * which sentence. That is the same shape `StatusBadge` was written for: a
   * page names what varies, and one place holds how it is styled, so
   * restyling every empty state is one edit rather than fourteen.
   *
   * `message` is a plain string, not a snippet — every call site is a
   * sentence, at most a ternary between two of them (payslips: "not linked to
   * an employee" vs "no payslips yet"), never markup.
   */
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
