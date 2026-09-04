<script lang="ts">
  import { fieldErrors } from "$lib/form-errors"
  import PageHead from "$lib/components/PageHead.svelte"

  let { form } = $props()

  const err = $derived(fieldErrors(form))
</script>

<PageHead title="Sign in" />

<div class="bg-base-200 flex min-h-screen items-center justify-center p-4">
  <div class="card bg-base-100 w-full max-w-sm shadow">
    <div class="card-body gap-4">
      <h1 class="text-lg font-medium">Sign in</h1>

      {#if form?.message}
        <div role="alert" class="alert alert-error">
          <span class="iconify lucide--circle-alert size-5"></span>
          <span>{form.message}</span>
        </div>
      {/if}

      <form method="POST" class="grid gap-4">
        <fieldset class="fieldset">
          <legend class="fieldset-legend">Email</legend>
          <input
            name="email"
            type="email"
            aria-invalid={err.aria("email")}
            class={`input w-full ${err.input("email")}`}
            required
            autocomplete="email"
          />
        </fieldset>
        <fieldset class="fieldset">
          <legend class="fieldset-legend">Password</legend>
          <input
            name="password"
            type="password"
            aria-invalid={err.aria("password")}
            class={`input w-full ${err.input("password")}`}
            required
            autocomplete="current-password"
          />
        </fieldset>
        <button type="submit" class="btn btn-primary">Sign in</button>
      </form>
    </div>
  </div>
</div>
