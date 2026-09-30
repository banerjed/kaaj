<script lang="ts">
  import PageTitle from "$lib/components/PageTitle.svelte"
  import PageHead from "$lib/components/PageHead.svelte"
  import CustomFieldSettings from "$lib/components/CustomFieldSettings.svelte"

  let { data, form } = $props()
</script>

<PageHead title="Project Management Fields" />

<div class="p-4 lg:p-6">
  <PageTitle
    title="Project Management Fields"
    items={[
      { label: "Settings", path: "/settings/company" },
      { label: "Project Management Fields", active: true },
    ]}
  />
  <p class="text-base-content/70 mt-1 text-sm">
    Extra fields on every project and every task, grouped under categories you
    name. Money fields are for reference only and never feed accounting or
    payroll.
  </p>

  {#if form?.fieldAdded || form?.fieldArchived || form?.categoryRenamed}
    <div role="status" class="alert alert-success mt-4">
      <span class="iconify lucide--check size-5"></span>
      <span>
        {form.fieldAdded
          ? "Field added."
          : form.fieldArchived
            ? "Field archived."
            : "Category renamed."}
      </span>
    </div>
  {:else if form?.message}
    <div role="alert" class="alert alert-error mt-4">
      <span class="iconify lucide--circle-alert size-5"></span>
      <span>{form.message}</span>
    </div>
  {/if}

  <CustomFieldSettings
    id="project-fields"
    title="Project fields"
    fields={data.projectFields}
    {form}
    hidden={{ entity_type: "project" }}
  />
  <CustomFieldSettings
    id="task-fields"
    title="Task fields"
    fields={data.taskFields}
    {form}
    hidden={{ entity_type: "task" }}
  />
</div>
