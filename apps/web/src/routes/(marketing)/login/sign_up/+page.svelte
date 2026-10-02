<script lang="ts">
  import { fieldErrors } from "$lib/form-errors"

  let { form } = $props()

  const err = $derived(fieldErrors(form))
</script>

<svelte:head>
  <title>Sign up</title>
</svelte:head>

<h1 class="text-2xl font-bold mb-6">Sign Up</h1>

{#if form && "checkEmail" in form}
  <div role="status" class="alert alert-success mb-4 text-left">
    <span>
      Check your email: we sent a link to {form.email} to confirm the address.
    </span>
  </div>
{:else}
  {#if form?.message}
    <div role="alert" class="alert alert-error mb-4 text-left">
      <span>{form.message}</span>
    </div>
  {/if}

  <form method="POST" action="?/signUp" class="flex flex-col gap-3 text-left">
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
        autocomplete="new-password"
        required
        class={`input w-full ${err.input("password")}`}
        aria-invalid={err.aria("password")}
      />
    </fieldset>
    <button type="submit" class="btn btn-primary mt-2">Sign up</button>
  </form>
{/if}

<div class="text-l text-slate-800 mt-4 mb-2">
  Have an account? <a class="underline" href="/login/sign_in">Sign in</a>.
</div>
