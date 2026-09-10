<script lang="ts">
  import PageTitle from "$lib/components/PageTitle.svelte"
  import PageHead from "$lib/components/PageHead.svelte"
  import { fieldErrors } from "$lib/form-errors"
  import { enhance } from "$app/forms"
  import { closeOnSuccess } from "$lib/form-enhance"
  import type { BusinessAreaSettingsRow } from "$lib/server/ticketing/ticketing.repo"

  let { data, form } = $props()

  const err = $derived(fieldErrors(form))

  let editing = $state<BusinessAreaSettingsRow | "new" | null>(null)
  const current = $derived(editing === "new" ? null : editing)
</script>

<PageHead title="Ticketing" />

<div class="p-4 lg:p-6">
  <PageTitle
    title="Ticketing"
    items={[
      { label: "Settings", path: "/settings/ticketing" },
      { label: "Ticketing", active: true },
    ]}
  />

  {#if form?.saved}
    <div role="status" class="alert alert-success mt-4">
      <span class="iconify lucide--check size-5"></span>
      <span>Business area saved.</span>
    </div>
  {:else if form?.archived}
    <div role="status" class="alert alert-success mt-4">
      <span class="iconify lucide--check size-5"></span>
      <span>Business area deactivated.</span>
    </div>
  {:else if form?.message}
    <div role="alert" class="alert alert-error mt-4">
      <span class="iconify lucide--circle-alert size-5"></span>
      <span>{form.message}</span>
    </div>
  {/if}

  <div class="mt-4 flex items-center justify-between gap-3">
    <p class="text-base-content/70 text-sm">
      {data.businessAreas.length}
      {data.businessAreas.length === 1 ? "business area" : "business areas"}
    </p>
    <button
      class="btn btn-primary btn-sm gap-2"
      onclick={() => (editing = "new")}
    >
      <span class="iconify lucide--plus size-4"></span>
      New business area
    </button>
  </div>

  <div class="card bg-base-100 mt-4 shadow">
    <div class="overflow-x-auto">
      <table class="table">
        <thead>
          <tr>
            <th>Name</th>
            <th>Prefix</th>
            <th>Description</th>
            <th class="w-32">Actions</th>
          </tr>
        </thead>
        <tbody>
          {#each data.businessAreas as ba (ba.id)}
            <tr class="hover:bg-base-200/40">
              <td class="font-medium">
                <a href={`/settings/ticketing/${ba.id}`} class="link link-hover"
                  >{ba.name}</a
                >
                {#if !ba.is_active}
                  <span class="badge badge-ghost badge-sm ms-1">inactive</span>
                {/if}
              </td>
              <td class="font-mono text-xs">{ba.prefix}</td>
              <td class="text-base-content/70 text-sm"
                >{ba.description ?? "—"}</td
              >
              <td>
                <div class="flex gap-1">
                  <button
                    class="btn btn-ghost btn-sm btn-square"
                    aria-label={`Edit ${ba.name}`}
                    onclick={() => (editing = ba)}
                  >
                    <span class="iconify lucide--pencil size-4"></span>
                  </button>
                  <form method="POST" action="?/archive">
                    <input type="hidden" name="id" value={ba.id} />
                    <button
                      class="btn btn-ghost btn-sm btn-square text-error"
                      aria-label={`Deactivate ${ba.name}`}
                      title="Deactivate"
                    >
                      <span class="iconify lucide--archive size-4"></span>
                    </button>
                  </form>
                </div>
              </td>
            </tr>
          {/each}
        </tbody>
      </table>
    </div>
  </div>
</div>

{#if editing}
  <div class="modal modal-open" role="dialog" aria-label="Business area">
    <div class="modal-box max-w-lg">
      <h3 class="text-lg font-medium">
        {current ? "Edit business area" : "New business area"}
      </h3>

      <form
        method="POST"
        action="?/save"
        class="mt-4 grid gap-4"
        use:enhance={closeOnSuccess(() => (editing = null))}
      >
        {#if current}
          <input type="hidden" name="id" value={current.id} />
        {/if}
        <div class="grid gap-4 sm:grid-cols-2">
          <fieldset class="fieldset">
            <legend class="fieldset-legend">Name</legend>
            <input
              name="name"
              aria-invalid={err.aria("name")}
              class={`input w-full ${err.input("name")}`}
              value={current?.name ?? ""}
              required
            />
          </fieldset>
          <fieldset class="fieldset">
            <legend class="fieldset-legend">Prefix</legend>
            <input
              name="prefix"
              aria-invalid={err.aria("prefix")}
              class={`input w-full font-mono uppercase ${err.input("prefix")}`}
              value={current?.prefix ?? ""}
              placeholder="IT"
              required
            />
          </fieldset>
        </div>
        <fieldset class="fieldset">
          <legend class="fieldset-legend">Description</legend>
          <textarea
            name="description"
            aria-invalid={err.aria("description")}
            class={`textarea w-full ${err.textarea("description")}`}
            rows="2"
            value={current?.description ?? ""}
          ></textarea>
        </fieldset>

        <div class="modal-action">
          <button
            type="button"
            class="btn btn-ghost"
            onclick={() => (editing = null)}>Cancel</button
          >
          <button type="submit" class="btn btn-primary">Save</button>
        </div>
      </form>
    </div>
    <button
      class="modal-backdrop"
      aria-label="Close"
      onclick={() => (editing = null)}
    ></button>
  </div>
{/if}
