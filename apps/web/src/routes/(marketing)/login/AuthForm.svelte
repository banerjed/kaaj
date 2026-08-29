<script lang="ts">
  import { Auth } from "@supabase/auth-ui-svelte"
  import { onMount } from "svelte"
  import type { SupabaseClient } from "@supabase/supabase-js"
  import { getBrowserSupabase } from "$lib/supabase/browser"
  import { oauthProviders, sharedAppearance } from "./login_config"

  type AuthView = "sign_in" | "sign_up" | "forgotten_password"

  let {
    redirectTo,
    view,
    onSignedIn,
  }: {
    redirectTo: string
    view: AuthView
    onSignedIn?: () => void
  } = $props()

  let supabase: SupabaseClient | null = $state(null)

  onMount(() => {
    const client = getBrowserSupabase()
    // Auth UI still ships narrower SupabaseClient generic constraints than
    // the SSR helper returns, so keep the cast at this package boundary.
    supabase = client as unknown as SupabaseClient

    if (!onSignedIn) return

    const { data } = client.auth.onAuthStateChange((event) => {
      if (event === "SIGNED_IN") {
        onSignedIn()
      }
    })

    return () => data.subscription.unsubscribe()
  })
</script>

{#if supabase}
  <Auth
    supabaseClient={supabase}
    {view}
    {redirectTo}
    providers={oauthProviders}
    socialLayout="horizontal"
    showLinks={false}
    appearance={sharedAppearance}
    additionalData={undefined}
  />
{/if}
