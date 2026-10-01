<script lang="ts">
  import PageTitle from "$lib/components/PageTitle.svelte"
  import PageHead from "$lib/components/PageHead.svelte"
  import { fieldErrors } from "$lib/form-errors"
  import { enhance } from "$app/forms"
  import { keepValues } from "$lib/form-enhance"
  import SectionCard from "$lib/components/SectionCard.svelte"
  import CustomFieldSettings from "$lib/components/CustomFieldSettings.svelte"
  import RowActions from "$lib/components/RowActions.svelte"
  import type { RowAction } from "$lib/components/row-actions"
  import { has } from "$lib/permissions"

  let { data, form } = $props()

  const err = $derived(fieldErrors(form))
  const canWrite = $derived(has(data.permissions, "firm.settings.write"))

  let newSubcategoryFor = $state<string | null>(null)
  const subcategoriesOf = (categoryId: string) =>
    data.subcategories.filter((s) => s.category_id === categoryId)

  const categoryActions = (c: (typeof data.categories)[number]): RowAction[] =>
    canWrite
      ? [
          {
            kind: "archive",
            post: { action: "?/archiveCategory", fields: { id: c.id } },
            label: `Archive ${c.name}`,
          },
        ]
      : []

  const subcategoryActions = (
    s: (typeof data.subcategories)[number],
  ): RowAction[] =>
    canWrite
      ? [
          {
            kind: "archive",
            post: { action: "?/archiveSubcategory", fields: { id: s.id } },
            label: `Archive ${s.name}`,
          },
        ]
      : []

  const memberIds = $derived(new Set(data.members.map((m) => m.employee_id)))
  const grantedGroupIds = $derived(
    new Set(data.groupGrants.map((g) => g.group_id)),
  )
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
  {:else if form?.groupsSaved}
    <div role="status" class="alert alert-success mt-4">
      <span class="iconify lucide--check size-5"></span>
      <span>Groups with access saved.</span>
    </div>
  {:else if form?.fieldAdded}
    <div role="status" class="alert alert-success mt-4">
      <span class="iconify lucide--check size-5"></span>
      <span>Field added.</span>
    </div>
  {:else if form?.categoryRenamed}
    <div role="status" class="alert alert-success mt-4">
      <span class="iconify lucide--check size-5"></span>
      <span>Category renamed.</span>
    </div>
  {/if}

  <div class="grid gap-6 lg:grid-cols-2">
    <!-- Categories & subcategories -->
    <SectionCard title="Categories" class="mt-4">
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
                <RowActions actions={categoryActions(c)} size="xs" />
              </div>
            </div>
            {#if subcategoriesOf(c.id).length > 0}
              <ul class="ms-4 mt-1">
                {#each subcategoriesOf(c.id) as s (s.id)}
                  <li class="flex items-center justify-between py-0.5">
                    <span class="text-base-content/80 text-sm">— {s.name}</span>
                    <RowActions actions={subcategoryActions(s)} size="xs" />
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
    </SectionCard>

    <!-- Default viewers -->
    <SectionCard
      title="Default viewers"
      description="Everyone checked here sees every non-private ticket in this business area by default. A ticket can still add someone else as a subscriber, whether or not they're on this list."
      class="mt-4"
    >
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
        <button class="btn btn-primary btn-sm mt-3">Save default viewers</button
        >
      </form>
    </SectionCard>

    <!-- Groups with access — docs/28-user-groups.md, additive to Default viewers above -->
    <SectionCard class="mt-4">
      {#snippet heading()}
        <h2 class="text-base font-medium">Groups with access</h2>
        <p class="text-base-content/70 text-sm">
          Every current and future member of a group checked here sees every
          non-private ticket in this business area, same as an individual
          default viewer. Manage a group's own membership at <a
            href="/settings/groups"
            class="link">Settings → Groups</a
          >.
        </p>
      {/snippet}
      {#if data.allGroups.length === 0}
        <p class="text-base-content/70 text-sm">
          No groups yet — <a href="/settings/groups" class="link">create one</a> first.
        </p>
      {:else}
        <form method="POST" action="?/saveGroups" use:enhance class="mt-2">
          <div
            class="max-h-72 overflow-y-auto rounded-box border border-base-300 p-2"
          >
            {#each data.allGroups as g (g.id)}
              <label class="flex cursor-pointer items-center gap-2 py-1">
                <input
                  type="checkbox"
                  name="group_ids"
                  value={g.id}
                  class="checkbox checkbox-sm"
                  checked={grantedGroupIds.has(g.id)}
                />
                <span class="text-sm">{g.display_name}</span>
              </label>
            {/each}
          </div>
          <button class="btn btn-primary btn-sm mt-3">Save groups</button>
        </form>
      {/if}
    </SectionCard>

    <div class="lg:col-span-2">
      <CustomFieldSettings
        id="ticket-fields"
        title="Custom fields"
        description={`Fields that appear only on ${data.businessArea.name} tickets. Other business areas keep their own set.`}
        fields={data.customFields}
        {form}
      />
    </div>
  </div>
</div>
