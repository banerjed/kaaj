<script lang="ts">
  // Markup, not the two PNGs Nexus ships and this repo does not have. Takes
  // its colours from the theme, so one definition covers all seven.
  type ILogo = {
    className?: string
  }

  let { className }: ILogo = $props()
</script>

<span class={`inline-flex items-center gap-2 ${className ?? ""}`}>
  <span
    class="bg-primary text-primary-content flex size-6 items-center justify-center rounded-md text-sm font-semibold"
    aria-hidden="true">K</span
  >
  <span class="text-base font-semibold tracking-tight">Kaaj</span>
</span>
