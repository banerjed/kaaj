<script lang="ts">
  import AuthForm from "../AuthForm.svelte"

  let { data } = $props()
</script>

<svelte:head>
  <title>Sign up</title>
</svelte:head>

<h1 class="text-2xl font-bold mb-6">Sign Up</h1>
<AuthForm view="sign_up" redirectTo={`${data.url}/auth/callback`} />
<div class="text-l text-slate-800 mt-4 mb-2">
  Have an account? <a class="underline" href="/login/sign_in">Sign in</a>.
</div>
