<script lang="ts">
  // The right-hand panel: was Nexus's appearance settings, repurposed for the
  // AI assistant (theme selection moved to the profile drawer). Deliberately
  // not built yet and not faked — no message list, no dead input box (L15,
  // 07-app-provenance.md).
</script>

<div class="drawer drawer-end">
  <input id="layout-rightbar-drawer" type="checkbox" class="drawer-toggle" />
  <div class="drawer-side z-[50]">
    <label
      for="layout-rightbar-drawer"
      aria-label="Close assistant"
      class="drawer-overlay"
    ></label>
    <div
      class="bg-base-100 text-base-content flex h-full w-72 flex-col sm:w-96"
    >
      <div class="bg-base-200 flex items-center justify-between px-5 py-4">
        <!-- A heading, not a styled <p> — see L64. -->
        <h2 class="text-lg font-medium">Assistant</h2>
        <label
          for="layout-rightbar-drawer"
          aria-label="Close assistant"
          class="btn btn-ghost btn-sm btn-circle"
        >
          <span class="iconify lucide--x size-5"></span>
        </label>
      </div>

      <div
        class="flex grow flex-col items-center justify-center gap-3 px-6 text-center"
      >
        <span class="iconify lucide--sparkles text-base-content/30 size-8"
        ></span>
        <p class="font-medium">Not built yet</p>
        <p class="text-base-content/70 text-sm">
          This panel will hold an assistant that can answer questions about your
          firm's data — and act on it, within whatever you are allowed to see
          and do.
        </p>
        <p class="text-base-content/70 text-xs">
          There is no input box here on purpose: a field that took your question
          and did nothing would be worse than none.
        </p>
      </div>
    </div>
  </div>
</div>
