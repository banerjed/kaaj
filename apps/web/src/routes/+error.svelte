<script lang="ts">
  import "../app.css"
  import { page } from "$app/state"

  /**
   * The reference an unexpected error leaves behind.
   *
   * This page used to render `page.error.message`, which in production is the
   * literal string "Internal Error" for every bug in the application — so it
   * said "There was an error: Internal Error" and the person had nothing to
   * quote. `handleError` mints an id and logs the real error against it; this
   * is where that id becomes reachable.
   *
   * Expected errors (403, 404) carry no id, and get the plain message: there
   * is nothing to investigate, and a reference nobody can look up is worse
   * than none.
   */
  const id = $derived(page.error?.id)
  const message = $derived(page.error?.message ?? "Something went wrong.")

  let copied = $state(false)
  async function copy() {
    if (!id) return
    try {
      await navigator.clipboard.writeText(id)
      copied = true
      setTimeout(() => (copied = false), 2000)
    } catch {
      // Clipboard access is permission-gated and blocked outright in some
      // contexts. The id is selectable text regardless, so this is cosmetic.
    }
  }
</script>

<div class="hero min-h-[100vh]">
  <div class="hero-content text-center">
    <div class="max-w-lg">
      <h1 class="text-5xl font-bold">
        {page.status === 404 ? "Page not found" : "Something went wrong"}
      </h1>

      {#if id}
        <p class="py-6 text-lg">
          The problem has been recorded. Quote this reference and we can find
          exactly what happened:
        </p>
        <button
          class="btn btn-outline gap-2 font-mono text-sm"
          onclick={copy}
          aria-label="Copy the error reference"
        >
          <span class="iconify lucide--copy size-4"></span>
          {id}
        </button>
        <p class="text-base-content/70 mt-2 h-5 text-sm" aria-live="polite">
          {copied ? "Copied." : ""}
        </p>
      {:else}
        <p class="py-6 text-2xl">{message}</p>
      {/if}

      <div class="mt-6">
        <a href="/" class="btn btn-primary btn-wide">Return home</a>
      </div>
    </div>
  </div>
</div>
