<script lang="ts">
  // The right-hand panel, repurposed from Nexus's appearance settings to the
  // AI assistant. Theme selection moved to the profile drawer, because that
  // panel is where a person's own preferences already live and `system` has to
  // stay reachable.
  //
  // **Deliberately not built yet, and deliberately not faked.** There is no
  // message list and no input box: a text field that accepts a question and
  // does nothing is the "convincing shell over hardcoded data" this codebase
  // deleted four of on the way in (L15, 07-app-provenance.md). The empty state
  // says what the panel is for and that it is not ready, which is the honest
  // version of the same screen.
  //
  // What it becomes is an open design question, recorded rather than assumed:
  // whether the assistant may call the application's repositories — inheriting
  // `can()` and row-level visibility as the acting user — or whether it only
  // reads what the current page already holds. The first is far more useful
  // and makes every authorization guard answerable to a caller that is not a
  // form action.
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
        <p class="text-lg font-medium">Assistant</p>
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
