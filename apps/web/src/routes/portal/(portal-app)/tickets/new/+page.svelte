<script lang="ts">
  import PageHead from "$lib/components/PageHead.svelte"
  import { fieldErrors } from "$lib/form-errors"

  let { data, form } = $props()

  const err = $derived(fieldErrors(form))
</script>

<PageHead title="New ticket" />

<div class="p-4 lg:p-6">
  <h1 class="font-display text-2xl">New ticket</h1>

  {#if form?.message}
    <div role="alert" class="alert alert-error mt-4">
      <span class="iconify lucide--circle-alert size-5"></span>
      <span>{form.message}</span>
    </div>
  {/if}

  <form method="POST" class="mt-4 grid max-w-lg gap-4">
    <fieldset class="fieldset">
      <legend class="fieldset-legend">Area</legend>
      <select
        name="business_area_id"
        aria-invalid={err.aria("business_area_id")}
        class={`select w-full ${err.select("business_area_id")}`}
        required
      >
        {#each data.businessAreas as ba (ba.id)}
          <option value={ba.id}>{ba.name}</option>
        {/each}
      </select>
    </fieldset>
    <fieldset class="fieldset">
      <legend class="fieldset-legend">Category</legend>
      <input
        name="category"
        aria-invalid={err.aria("category")}
        class={`input w-full ${err.input("category")}`}
        required
      />
    </fieldset>
    <fieldset class="fieldset">
      <legend class="fieldset-legend">Title</legend>
      <input
        name="title"
        aria-invalid={err.aria("title")}
        class={`input w-full ${err.input("title")}`}
        required
        maxlength="255"
      />
    </fieldset>
    <fieldset class="fieldset">
      <legend class="fieldset-legend">Description</legend>
      <textarea
        name="description"
        aria-invalid={err.aria("description")}
        class={`textarea w-full ${err.textarea("description")}`}
        rows="4"
        required
        maxlength="5000"
      ></textarea>
    </fieldset>
    <fieldset class="fieldset">
      <legend class="fieldset-legend">Needed by</legend>
      <input
        name="due_date"
        type="date"
        aria-invalid={err.aria("due_date")}
        class={`input w-full ${err.input("due_date")}`}
        required
      />
    </fieldset>
    <button type="submit" class="btn btn-primary">Submit ticket</button>
  </form>
</div>
