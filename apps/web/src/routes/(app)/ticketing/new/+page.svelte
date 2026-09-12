<script lang="ts">
  import PageHead from "$lib/components/PageHead.svelte"
  import { fieldErrors } from "$lib/form-errors"
  import { keepValues } from "$lib/form-enhance"
  import { enhance } from "$app/forms"
  import TicketSubjectAndBody from "$lib/components/TicketSubjectAndBody.svelte"

  let { data, form } = $props()

  const err = $derived(fieldErrors(form))
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
  {#if form?.message}
    <div role="alert" class="alert alert-error mt-4">
      <span class="iconify lucide--circle-alert size-5"></span>
      <span>{form.message}</span>
    </div>
  {/if}

  <form
    method="POST"
    use:enhance={keepValues}
    class="card bg-base-100 mt-4 max-w-lg shadow"
  >
    <div class="card-body gap-3 p-4">
      <!-- The only heading on the page (L64) — matches how the ticket detail
           page puts its heading inside the card rather than in a page title
           above it. -->
      <h1 class="text-lg font-semibold">New ticket</h1>

      <fieldset class="fieldset">
        <legend class="fieldset-legend text-xs">Business area</legend>
        <select
          name="business_area_id"
          aria-invalid={err.aria("business_area_id")}
          class={`select select-sm w-full ${err.select("business_area_id")}`}
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
        <legend class="fieldset-legend text-xs">Category</legend>
        <select
          name="category_id"
          aria-invalid={err.aria("category_id")}
          class={`select select-sm w-full ${err.select("category_id")}`}
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
          <legend class="fieldset-legend text-xs">Subcategory</legend>
          <select
            name="subcategory_id"
            aria-invalid={err.aria("subcategory_id")}
            class={`select select-sm w-full ${err.select("subcategory_id")}`}
          >
            <option value="">None</option>
            {#each subcategories as s (s.id)}
              <option value={s.id}>{s.name}</option>
            {/each}
          </select>
        </fieldset>
      {/if}

      <TicketSubjectAndBody
        {err}
        bodyName="description"
        bodyLabel="Description"
        bodyPlaceholder="Describe the issue"
        bodyRequired
      />

      <fieldset class="fieldset">
        <legend class="fieldset-legend text-xs">Due date</legend>
        <input
          name="due_date"
          type="date"
          aria-invalid={err.aria("due_date")}
          class={`input input-sm w-full ${err.input("due_date")}`}
          required
        />
      </fieldset>
      <button type="submit" class="btn btn-primary btn-sm">Create ticket</button
      >
    </div>
  </form>
</div>
