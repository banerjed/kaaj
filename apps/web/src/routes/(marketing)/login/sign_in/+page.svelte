<script lang="ts">
  import { page } from "$app/state"
  import { fieldErrors } from "$lib/form-errors"

  let { form } = $props()

  const err = $derived(fieldErrors(form))
  // Set by the app's layout when it sends an unauthenticated visitor here.
  const redirectTo = $derived(page.url.searchParams.get("redirect") ?? "")
</script>

<svelte:head>
  <title>Sign in</title>
</svelte:head>

{#if page.url.searchParams.get("verified") == "true"}
  <div role="alert" class="alert alert-success mb-5">
    <span class="iconify lucide--circle-check size-6"></span>
    <span>Email verified! Please sign in.</span>
  </div>
{/if}
<h1 class="text-2xl font-bold mb-6">Sign In</h1>

{#if form?.message}
  <div role="alert" class="alert alert-error mb-4 text-left">
    <span>{form.message}</span>
  </div>
{/if}

<form method="POST" action="?/github">
  <input type="hidden" name="redirect" value={redirectTo} />
  <button type="submit" class="btn btn-outline w-full">
    Sign in with GitHub
  </button>
</form>

<div class="divider">or</div>

<form method="POST" action="?/signIn" class="flex flex-col gap-3 text-left">
  <input type="hidden" name="redirect" value={redirectTo} />
  <fieldset class="fieldset">
    <legend class="fieldset-legend">Email address</legend>
    <input
      name="email"
      type="email"
      autocomplete="email"
      required
      value={form?.email ?? ""}
      class={`input w-full ${err.input("email")}`}
      aria-invalid={err.aria("email")}
    />
  </fieldset>
  <fieldset class="fieldset">
    <legend class="fieldset-legend">Password</legend>
    <input
      name="password"
      type="password"
      autocomplete="current-password"
      required
      class={`input w-full ${err.input("password")}`}
      aria-invalid={err.aria("password")}
    />
  </fieldset>
  <button type="submit" class="btn btn-primary mt-2">Sign in</button>
</form>

<div class="text-l text-slate-800 mt-4">
  <a class="underline" href="/login/forgot_password">Forgot password?</a>
</div>
<div class="text-l text-slate-800 mt-3">
  Don't have an account? <a class="underline" href="/login/sign_up">Sign up</a>.
</div>
