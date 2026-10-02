<script lang="ts">
  import { fieldErrors } from "$lib/form-errors"

  let { form } = $props()

  const err = $derived(fieldErrors(form))
</script>

<svelte:head>
  <title>Forgot Password</title>
</svelte:head>

<h1 class="text-2xl font-bold mb-6">Forgot Password</h1>

{#if form && "sent" in form}
  <div role="status" class="alert alert-success mb-4 text-left">
    <span>
      If {form.email} has an account, we sent it a link to set a new password.
    </span>
  </div>
{:else}
  {#if form?.message}
    <div role="alert" class="alert alert-error mb-4 text-left">
      <span>{form.message}</span>
    </div>
  {/if}

  <form
    method="POST"
    action="?/sendReset"
    class="flex flex-col gap-3 text-left"
  >
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
    <button type="submit" class="btn btn-primary mt-2">
      Send reset instructions
    </button>
  </form>
{/if}

<div class="text-l text-slate-800 mt-4">
  Remember your password? <a class="underline" href="/login/sign_in">Sign in</a
  >.
</div>
