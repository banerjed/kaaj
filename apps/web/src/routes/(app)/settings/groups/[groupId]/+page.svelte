<script lang="ts">
  import PageTitle from "$lib/components/PageTitle.svelte"
  import PageHead from "$lib/components/PageHead.svelte"
  import { enhance } from "$app/forms"

  let { data, form } = $props()

  const memberIds = $derived(new Set(data.members.map((m) => m.employee_id)))
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

  {#if form?.membersSaved}
    <div role="status" class="alert alert-success mt-4">
      <span class="iconify lucide--check size-5"></span>
      <span>Members saved.</span>
    </div>
  {/if}

  <div class="card bg-base-100 mt-4 shadow max-w-lg">
    <div class="card-body gap-3">
      <h2 class="font-medium">Members</h2>
      <p class="text-base-content/70 text-sm">
        Anyone checked here inherits whatever this group is granted access to —
        a ticketing business area or a restricted project — for as long as they
        stay a member.
      </p>
      <form method="POST" action="?/saveMembers" use:enhance class="mt-2">
        <div
          class="max-h-72 overflow-y-auto rounded-box border border-base-300 p-2"
        >
          {#each data.employees as e (e.id)}
            <label class="flex cursor-pointer items-center gap-2 py-1">
              <input
                type="checkbox"
                name="employee_ids"
                value={e.id}
                class="checkbox checkbox-sm"
                checked={memberIds.has(e.id)}
              />
              <span class="text-sm">{e.name}</span>
            </label>
          {/each}
        </div>
        <button class="btn btn-primary btn-sm mt-3">Save members</button>
      </form>
    </div>
  </div>
</div>
