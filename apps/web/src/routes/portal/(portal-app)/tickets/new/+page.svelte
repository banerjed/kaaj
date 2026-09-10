<script lang="ts">
  import PageHead from "$lib/components/PageHead.svelte"
  import { fieldErrors } from "$lib/form-errors"
  import RichTextEditor from "$lib/components/RichTextEditor.svelte"

  let { data, form } = $props()

  const err = $derived(fieldErrors(form))
  // `$state(data...)` only captures the value at first mount — this needs
  // to track `data` on every load, so it's an `$effect` instead.
  let businessAreaId = $state("")
  let categoryId = $state("")
  $effect(() => {
    businessAreaId = data.businessAreas[0]?.id ?? ""
  })
  const categories = $derived(
    data.categoriesByArea[businessAreaId]?.categories ?? [],
  )
  const subcategories = $derived(
    (data.categoriesByArea[businessAreaId]?.subcategories ?? []).filter(
      (s) => s.category_id === categoryId,
    ),
  )
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
        bind:value={businessAreaId}
        onchange={() => (categoryId = "")}
        required
      >
        {#each data.businessAreas as ba (ba.id)}
          <option value={ba.id}>{ba.name}</option>
        {/each}
      </select>
    </fieldset>
    <fieldset class="fieldset">
      <legend class="fieldset-legend">Category</legend>
      <select
        name="category_id"
        aria-invalid={err.aria("category_id")}
        class={`select w-full ${err.select("category_id")}`}
        bind:value={categoryId}
        required
      >
        <option value="" disabled selected>Choose a category</option>
        {#each categories as c (c.id)}
          <option value={c.id}>{c.name}</option>
        {/each}
      </select>
    </fieldset>
    {#if subcategories.length > 0}
      <fieldset class="fieldset">
        <legend class="fieldset-legend">Subcategory</legend>
        <select
          name="subcategory_id"
          aria-invalid={err.aria("subcategory_id")}
          class={`select w-full ${err.select("subcategory_id")}`}
        >
          <option value="">None</option>
          {#each subcategories as s (s.id)}
            <option value={s.id}>{s.name}</option>
          {/each}
        </select>
      </fieldset>
    {/if}
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
      <RichTextEditor
        name="description"
        required
        placeholder="Describe the issue"
        invalid={err.has("description")}
      />
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
