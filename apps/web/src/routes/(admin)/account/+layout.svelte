<script lang="ts">
  import { invalidate } from "$app/navigation"
  import { getBrowserSupabase } from "$lib/supabase/browser"
  import { onMount } from "svelte"

  let { data, children } = $props()

  let session = $derived(data.session)

  onMount(() => {
    const supabase = getBrowserSupabase()

    const { data } = supabase.auth.onAuthStateChange((event, _session) => {
      if (_session?.expires_at !== session?.expires_at) {
        invalidate("supabase:auth")
      }
    })

    return () => data.subscription.unsubscribe()
  })
</script>

<!-- Same reasoning as (marketing)/+layout.svelte: the account pages are
     CMSaasStarter's, so they claim the CMSaasStarter theme explicitly rather
     than inheriting whatever the (app) surface last set on <html>. -->
<div style="display: contents" data-theme="saasstartertheme">
  {@render children?.()}
</div>
