<script lang="ts">
  import PageTitle from "$lib/components/PageTitle.svelte"
  import EmployeeForm from "$lib/components/EmployeeForm.svelte"
  import PageHead from "$lib/components/PageHead.svelte"

  let { data, form } = $props()
</script>

<PageHead title="New employee" />

<div class="p-4 lg:p-6">
  <PageTitle
    title="New employee"
    items={[
      { label: "Employees", path: "/employees" },
      { label: "New", active: true },
    ]}
  />

  <div class="mt-4">
    <EmployeeForm
      employee={null}
      departments={data.departments}
      locations={data.locations}
      jobTitles={data.jobTitles}
      managers={data.managers}
      enums={data.enums}
      {form}
      submitLabel="Create employee"
    />
  </div>
</div>
