<script lang="ts">
  import "../app.css"
  import { navigating, page } from "$app/state"
  import { expoOut } from "svelte/easing"
  import { slide } from "svelte/transition"
  import { safeError } from "$lib/errors"
  import { reportClientError } from "$lib/client-error-report"
  interface Props {
    children?: import("svelte").Snippet
  }

  let { children }: Props = $props()

  /**
   * Catches what hooks.client.ts's handleError does not: a raw exception or
   * an unhandled promise rejection outside SvelteKit's own load/render
   * control flow (a stray setTimeout callback, a fire-and-forget promise
   * nobody awaited).
   */
  function onWindowError(event: Event) {
    const errorEvent = event as ErrorEvent
    report(errorEvent.error ?? errorEvent.message)
  }

  function onWindowRejection(event: PromiseRejectionEvent) {
    report(event.reason)
  }

  function report(cause: unknown) {
    const id = crypto.randomUUID()
    const safe = safeError(cause)
    console.error(
      JSON.stringify({
        level: "error",
        scope: "client",
        ts: new Date().toISOString(),
        id,
        msg: safe.message,
        route: page.route?.id ?? page.url?.pathname,
        error: safe,
      }),
    )
    reportClientError({
      id,
      message: safe.message ?? "(no message)",
      route: page.route?.id ?? page.url?.pathname,
      error: safe,
    })
  }
</script>

<svelte:window
  onerror={onWindowError}
  onunhandledrejection={onWindowRejection}
/>

{#if navigating}
  <!-- 
    Loading animation for next page since svelte doesn't show any indicator. 
     - delay 100ms because most page loads are instant, and we don't want to flash 
     - long 12s duration because we don't actually know how long it will take
     - exponential easing so fast loads (>100ms and <1s) still see enough progress,
       while slow networks see it moving for a full 12 seconds
  -->
  <div
    class="fixed w-full top-0 right-0 left-0 h-1 z-50 bg-primary"
    in:slide={{ delay: 100, duration: 12000, axis: "x", easing: expoOut }}
  ></div>
{/if}
{@render children?.()}
