<script lang="ts">
  import PageTitle from "$lib/components/PageTitle.svelte"
  import PageHead from "$lib/components/PageHead.svelte"
  import SectionCard from "$lib/components/SectionCard.svelte"
  import Pagination from "$lib/components/Pagination.svelte"
  import Combobox from "$lib/components/Combobox.svelte"
  import { actionSearch } from "$lib/action-search"
  import { enhance } from "$app/forms"
  import { has } from "$lib/permissions"

  let { data, form } = $props()

  const canWrite = $derived(has(data.permissions, "it.groups.write"))
  const searchPeople = actionSearch("searchPeople")
  // A fresh picker after each add, so the one just added is not still shown.
  let addedCount = $state(0)
</script>

<PageHead title={data.group.display_name} />

<div class="p-4 lg:p-6">
  <PageTitle
    title={data.group.display_name}
    items={[
      { label: "Settings", path: "/settings/company" },
      { label: "Groups", path: "/settings/groups" },
      { label: data.group.display_name, active: true },
    ]}
  />

  {#if form?.memberAdded || form?.memberRemoved}
    <div role="status" class="alert alert-success mt-4">
      <span class="iconify lucide--check size-5"></span>
      <span>{form?.memberAdded ? "Member added." : "Member removed."}</span>
    </div>
  {:else if form?.message}
    <div role="alert" class="alert alert-error mt-4">
      <span class="iconify lucide--circle-alert size-5"></span>
      <span>{form.message}</span>
    </div>
  {/if}

  <SectionCard
    title="Members"
    description="Everyone listed here inherits whatever this group is granted access to — a ticketing business area or a restricted project — for as long as they stay a member."
    class="mt-4 max-w-lg"
  >
    {#if canWrite}
      <form
        method="POST"
        action="?/addMember"
        class="mt-2 flex items-start gap-2"
        use:enhance={() =>
          async ({ result, update }) => {
            await update({ reset: false })
            if (result.type === "success") addedCount++
          }}
      >
        <div class="flex-1">
          {#key addedCount}
            <Combobox
              name="employee_id"
              search={searchPeople}
              placeholder="Add a person…"
              emptyText="No matching person"
            />
          {/key}
        </div>
        <button class="btn btn-primary btn-sm">Add</button>
      </form>
    {/if}

    {#if data.total === 0}
      <p class="text-base-content/70 mt-3 text-sm">No members yet.</p>
    {:else}
      <ul class="mt-3 flex flex-col">
        {#each data.members as m (m.employee_id)}
          <li
            class="border-base-200 flex items-center justify-between gap-2 border-t py-1.5"
          >
            <span class="text-sm">{m.name}</span>
            {#if canWrite}
              <form method="POST" action="?/removeMember" use:enhance>
                <input type="hidden" name="employee_id" value={m.employee_id} />
                <button
                  class="btn btn-ghost btn-xs"
                  aria-label={`Remove ${m.name}`}>Remove</button
                >
              </form>
            {/if}
          </li>
        {/each}
      </ul>
      {#if data.total > data.pageSize}
        <Pagination
          page={data.page}
          pageSize={data.pageSize}
          total={data.total}
          hrefFor={(n) => (n > 1 ? `?page=${n}` : "?")}
        />
      {/if}
    {/if}
  </SectionCard>
</div>
