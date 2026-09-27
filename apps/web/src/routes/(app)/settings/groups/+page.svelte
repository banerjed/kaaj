<script lang="ts">
  import PageTitle from "$lib/components/PageTitle.svelte"
  import PageHead from "$lib/components/PageHead.svelte"
  import { fieldErrors } from "$lib/form-errors"
  import { enhance } from "$app/forms"
  import { closeOnSuccess } from "$lib/form-enhance"
  import ModalActions from "$lib/components/ModalActions.svelte"

  let { data, form } = $props()

  const err = $derived(fieldErrors(form))

  let creating = $state(false)
</script>

<PageHead title="Groups" />

<div class="p-4 lg:p-6">
  <PageTitle
    title="Groups"
    items={[
      { label: "Settings", path: "/settings/company" },
      { label: "Groups", active: true },
    ]}
  />
  <p class="text-base-content/70 mt-1 text-sm">
    Named lists of employees, used to grant a whole team access to a ticketing
    business area or a restricted project at once (docs/28-user-groups.md).
  </p>

  {#if form?.created}
    <div role="status" class="alert alert-success mt-4">
      <span class="iconify lucide--check size-5"></span>
      <span>Group created.</span>
    </div>
  {:else if form?.archived}
    <div role="status" class="alert alert-success mt-4">
      <span class="iconify lucide--check size-5"></span>
      <span>Group deactivated.</span>
    </div>
  {:else if form?.message}
    <div role="alert" class="alert alert-error mt-4">
      <span class="iconify lucide--circle-alert size-5"></span>
      <span>{form.message}</span>
    </div>
  {/if}

  <div class="mt-4 flex items-center justify-between gap-3">
    <p class="text-base-content/70 text-sm">
      {data.groups.length}
      {data.groups.length === 1 ? "group" : "groups"}
    </p>
    <button
      class="btn btn-primary btn-sm gap-2"
      onclick={() => (creating = true)}
    >
      <span class="iconify lucide--plus size-4"></span>
      New group
    </button>
  </div>

  <div class="card bg-base-100 mt-4 shadow">
    <div class="overflow-x-auto">
      <table class="table">
        <thead>
          <tr>
            <th>Name</th>
            <th>Description</th>
            <th class="w-32">Actions</th>
          </tr>
        </thead>
        <tbody>
          {#each data.groups as g (g.id)}
            <tr class="hover:bg-base-200/40">
              <td class="font-medium">
                <a href={`/settings/groups/${g.id}`} class="link link-hover"
                  >{g.display_name}</a
                >
              </td>
              <td class="text-base-content/70 text-sm"
                >{g.description ?? "—"}</td
              >
              <td>
                <form method="POST" action="?/archive">
                  <input type="hidden" name="id" value={g.id} />
                  <button
                    class="btn btn-ghost btn-sm btn-square text-error"
                    aria-label={`Deactivate ${g.display_name}`}
                    title="Deactivate"
                  >
                    <span class="iconify lucide--archive size-4"></span>
                  </button>
                </form>
              </td>
            </tr>
          {/each}
        </tbody>
      </table>
    </div>
  </div>
</div>

{#if creating}
  <div class="modal modal-open" role="dialog" aria-label="New group">
    <div class="modal-box max-w-lg">
      <h3 class="text-lg font-medium">New group</h3>

      <form
        method="POST"
        action="?/create"
        class="mt-4 grid gap-4"
        use:enhance={closeOnSuccess(() => (creating = false))}
      >
        <fieldset class="fieldset">
          <legend class="fieldset-legend">Name</legend>
          <input
            name="display_name"
            aria-invalid={err.aria("display_name")}
            class={`input w-full ${err.input("display_name")}`}
            placeholder="e.g. Engineering"
            required
          />
        </fieldset>
        <fieldset class="fieldset">
          <legend class="fieldset-legend">Description</legend>
          <textarea
            name="description"
            aria-invalid={err.aria("description")}
            class={`textarea w-full ${err.textarea("description")}`}
            rows="2"
          ></textarea>
        </fieldset>

        <ModalActions
          onCancel={() => (creating = false)}
          submitLabel="Create"
        />
      </form>
    </div>
    <button
      class="modal-backdrop"
      aria-label="Close"
      onclick={() => (creating = false)}
    ></button>
  </div>
{/if}
