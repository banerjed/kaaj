<script lang="ts">
  import AuthForm from "../AuthForm.svelte"

  let { data } = $props()
</script>

<svelte:head>
  <title>Forgot Password</title>
</svelte:head>

<h1 class="text-2xl font-bold mb-6">Forgot Password</h1>
<AuthForm
  view="forgotten_password"
  redirectTo={`${data.url}/auth/callback?next=%2Faccount%2Fsettings%2Freset_password`}
/>
<div class="text-l text-slate-800 mt-4">
  Remember your password? <a class="underline" href="/login/sign_in">Sign in</a
  >.
</div>
