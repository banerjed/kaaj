<script lang="ts">
  import "../app.css"
  import { page } from "$app/state"

  // Unexpected errors carry an id minted by handleError; expected ones (403, 404) don't and get the plain message.
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
      // Clipboard access can be blocked; the id is still selectable text.
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
