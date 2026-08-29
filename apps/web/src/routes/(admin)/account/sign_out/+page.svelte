<script lang="ts">
  import { goto } from "$app/navigation"
  import { getBrowserSupabase } from "$lib/supabase/browser"
  import { onMount } from "svelte"

  let message = $state("Signing out....")

  // on mount, sign out
  onMount(() => {
    const supabase = getBrowserSupabase()

    supabase.auth.signOut().then(({ error }) => {
      if (error) {
        message = "There was an issue signing out."
      } else {
        goto("/")
      }
    })
  })
</script>

<h1 class="text-2xl font-bold m-6 mx-auto my-auto">{message}</h1>
