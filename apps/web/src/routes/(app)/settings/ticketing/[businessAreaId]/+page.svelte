<script lang="ts">
  import PageTitle from "$lib/components/PageTitle.svelte"
  import PageHead from "$lib/components/PageHead.svelte"
  import { fieldErrors } from "$lib/form-errors"
  import { enhance } from "$app/forms"
  import { keepValues } from "$lib/form-enhance"

  let { data, form } = $props()

  const err = $derived(fieldErrors(form))

  let newSubcategoryFor = $state<string | null>(null)
  const subcategoriesOf = (categoryId: string) =>
    data.subcategories.filter((s) => s.category_id === categoryId)

  const memberIds = $derived(new Set(data.members.map((m) => m.employee_id)))

  let newFieldDataType = $state("text")
</script>

<PageHead title={data.businessArea.name} />

<div class="p-4 lg:p-6">
  <PageTitle
    title={data.businessArea.name}
    items={[
      { label: "Settings", path: "/settings/ticketing" },
      { label: "Ticketing", path: "/settings/ticketing" },
      { label: data.businessArea.name, active: true },
    ]}
  />

  {#if form?.message}
    <div role="alert" class="alert alert-error mt-4">
      <span class="iconify lucide--circle-alert size-5"></span>
      <span>{form.message}</span>
    </div>
  {:else if form?.membersSaved}
    <div role="status" class="alert alert-success mt-4">
      <span class="iconify lucide--check size-5"></span>
      <span>Default viewers saved.</span>
    </div>
  {:else if form?.customFieldAdded}
    <div role="status" class="alert alert-success mt-4">
      <span class="iconify lucide--check size-5"></span>
      <span>Field added.</span>
    </div>
  {/if}

  <div class="grid gap-6 lg:grid-cols-2">
    <!-- Categories & subcategories -->
    <div class="card bg-base-100 mt-4 shadow">
      <div class="card-body gap-3">
        <h2 class="font-medium">Categories</h2>
        <ul class="list">
          {#each data.categories as c (c.id)}
            <li class="list-row flex-col items-stretch">
              <div class="flex items-center justify-between">
                <span class="font-medium">{c.name}</span>
                <div class="flex items-center gap-2">
                  <button
                    class="btn btn-ghost btn-xs"
                    onclick={() =>
                      (newSubcategoryFor =
                        newSubcategoryFor === c.id ? null : c.id)}
                  >
                    + Subcategory
                  </button>
                  <form method="POST" action="?/archiveCategory" use:enhance>
                    <input type="hidden" name="id" value={c.id} />
                    <button
                      class="btn btn-ghost btn-xs btn-square text-error"
                      aria-label={`Archive ${c.name}`}
                    >
                      <span class="iconify lucide--archive size-3.5"></span>
                    </button>
                  </form>
                </div>
              </div>
              {#if subcategoriesOf(c.id).length > 0}
                <ul class="ms-4 mt-1">
                  {#each subcategoriesOf(c.id) as s (s.id)}
                    <li class="flex items-center justify-between py-0.5">
                      <span class="text-base-content/80 text-sm"
                        >— {s.name}</span
                      >
                      <form
                        method="POST"
                        action="?/archiveSubcategory"
                        use:enhance
                      >
                        <input type="hidden" name="id" value={s.id} />
                        <button
                          class="btn btn-ghost btn-xs btn-square text-error"
                          aria-label={`Archive ${s.name}`}
                        >
                          <span class="iconify lucide--archive size-3"></span>
                        </button>
                      </form>
                    </li>
                  {/each}
                </ul>
              {/if}
              {#if newSubcategoryFor === c.id}
                <form
                  method="POST"
                  action="?/addSubcategory"
                  class="mt-2 flex gap-2"
                  use:enhance={keepValues}
                >
                  <input type="hidden" name="category_id" value={c.id} />
                  <input
                    name="name"
                    class="input input-sm flex-1"
                    placeholder="Subcategory name"
                    required
                  />
                  <button class="btn btn-sm btn-primary">Add</button>
                </form>
              {/if}
            </li>
          {:else}
            <li class="list-row">
              <p class="text-base-content/70 text-sm">No categories yet.</p>
            </li>
          {/each}
        </ul>

        <form
          method="POST"
          action="?/addCategory"
          class="mt-2 flex gap-2"
          use:enhance={keepValues}
        >
          <input
            name="name"
            aria-invalid={err.aria("name")}
            class={`input input-sm flex-1 ${err.input("name")}`}
            placeholder="New category"
            required
          />
          <button class="btn btn-sm btn-primary">Add category</button>
        </form>
      </div>
    </div>

    <!-- Default viewers -->
    <div class="card bg-base-100 mt-4 shadow">
      <div class="card-body gap-3">
        <h2 class="font-medium">Default viewers</h2>
        <p class="text-base-content/70 text-sm">
          Everyone checked here sees every non-private ticket in this business
          area by default. A ticket can still add someone else as a subscriber,
          whether or not they're on this list.
        </p>
        <form method="POST" action="?/saveMembers" use:enhance class="mt-2">
          <div
            class="max-h-72 overflow-y-auto rounded-box border border-base-300 p-2"
          >
            {#each data.employees as e (e.id)}
              <label class="flex cursor-pointer items-center gap-2 py-1">
                <input
                  type="checkbox"
                  name="member_ids"
                  value={e.id}
                  class="checkbox checkbox-sm"
                  checked={memberIds.has(e.id)}
                />
                <span class="text-sm">{e.name}</span>
              </label>
            {/each}
          </div>
          <button class="btn btn-primary btn-sm mt-3"
            >Save default viewers</button
          >
        </form>
      </div>
    </div>

    <!-- Custom fields — Tier 2 (docs/06-customization-model.md), scoped to this business area -->
    <div class="card bg-base-100 mt-4 shadow lg:col-span-2">
      <div class="card-body gap-3">
        <h2 class="font-medium">Custom fields</h2>
        <p class="text-base-content/70 text-sm">
          Fields that appear only on {data.businessArea.name} tickets. Other business
          areas keep their own set.
        </p>

        {#if data.customFields.length > 0}
          <div class="overflow-x-auto">
            <table class="table">
              <thead>
                <tr>
                  <th>Label</th>
                  <th>Type</th>
                  <th>Required</th>
                  <th class="w-16">Actions</th>
                </tr>
              </thead>
              <tbody>
                {#each data.customFields as f (f.id)}
                  <tr>
                    <td class="text-sm">
                      {f.label}
                      {#if f.help_text}
                        <span class="text-base-content/60 block text-xs"
                          >{f.help_text}</span
                        >
                      {/if}
                    </td>
                    <td class="text-sm">
                      {f.data_type}
                      {#if f.data_type === "select"}
                        <span class="text-base-content/60 block text-xs"
                          >{(f.options ?? [])
                            .map((o) => o.label)
                            .join(", ")}</span
                        >
                      {/if}
                    </td>
                    <td class="text-sm">{f.is_required ? "Yes" : "No"}</td>
                    <td>
                      <form
                        method="POST"
                        action="?/archiveCustomField"
                        use:enhance
                      >
                        <input type="hidden" name="id" value={f.id} />
                        <button
                          class="btn btn-ghost btn-xs btn-square text-error"
                          aria-label={`Archive ${f.label}`}
                        >
                          <span class="iconify lucide--archive size-3.5"></span>
                        </button>
                      </form>
                    </td>
                  </tr>
                {/each}
              </tbody>
            </table>
          </div>
        {:else}
          <p class="text-base-content/70 text-sm">No custom fields yet.</p>
        {/if}

        <form
          method="POST"
          action="?/addCustomField"
          use:enhance={keepValues}
          class="mt-2 grid gap-3 sm:grid-cols-2"
        >
          <fieldset class="fieldset">
            <legend class="fieldset-legend text-xs">Label</legend>
            <input
              name="label"
              aria-invalid={err.aria("label")}
              class={`input input-sm w-full ${err.input("label")}`}
              placeholder="e.g. Asset Tag"
              required
            />
          </fieldset>
          <fieldset class="fieldset">
            <legend class="fieldset-legend text-xs">Type</legend>
            <select
              name="data_type"
              class="select select-sm w-full"
              bind:value={newFieldDataType}
            >
              <option value="text">Text</option>
              <option value="number">Number</option>
              <option value="date">Date</option>
              <option value="boolean">Yes / No</option>
              <option value="select">Dropdown</option>
            </select>
          </fieldset>
          {#if newFieldDataType === "select"}
            <fieldset class="fieldset sm:col-span-2">
              <legend class="fieldset-legend text-xs"
                >Options (one per line)</legend
              >
              <textarea
                name="options"
                class={`textarea w-full ${err.textarea("options")}`}
                rows="3"
                placeholder={"Standard\nPremium\nEnterprise"}
              ></textarea>
            </fieldset>
          {/if}
          <fieldset class="fieldset">
            <legend class="fieldset-legend text-xs">Help text</legend>
            <input name="help_text" class="input input-sm w-full" />
          </fieldset>
          <label class="label mt-6 gap-2">
            <input
              type="checkbox"
              name="is_required"
              class="checkbox checkbox-sm"
            />
            Required
          </label>
          <div class="sm:col-span-2">
            <button class="btn btn-primary btn-sm">Add field</button>
          </div>
        </form>
      </div>
    </div>
  </div>
</div>
