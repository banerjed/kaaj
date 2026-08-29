<script lang="ts">
  import { goto } from "$app/navigation"
  import { page } from "$app/state"
  import AuthForm from "../AuthForm.svelte"

  let { data } = $props()

  const onSignedIn = () => {
    // Delay needed because callback order is not guaranteed; let layout auth
    // invalidation settle before /account loads.
    setTimeout(() => {
      goto("/account")
    }, 1)
  }
</script>

<svelte:head>
  <title>Sign in</title>
</svelte:head>

{#if page.url.searchParams.get("verified") == "true"}
  <div role="alert" class="alert alert-success mb-5">
    <svg
      xmlns="http://www.w3.org/2000/svg"
      class="stroke-current shrink-0 h-6 w-6"
      fill="none"
      viewBox="0 0 24 24"
      ><path
        stroke-linecap="round"
        stroke-linejoin="round"
        stroke-width="2"
        d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"
      /></svg
    >
    <span>Email verified! Please sign in.</span>
  </div>
{/if}
<h1 class="text-2xl font-bold mb-6">Sign In</h1>
<AuthForm
  view="sign_in"
  redirectTo={`${data.url}/auth/callback`}
  {onSignedIn}
/>
<div class="text-l text-slate-800 mt-4">
  <a class="underline" href="/login/forgot_password">Forgot password?</a>
</div>
<div class="text-l text-slate-800 mt-3">
  Don't have an account? <a class="underline" href="/login/sign_up">Sign up</a>.
</div>
