<script lang="ts">
  import PageTitle from "$lib/components/PageTitle.svelte"
  import EmployeeForm from "$lib/components/EmployeeForm.svelte"

  let { data, form } = $props()
</script>

<svelte:head>
  <title>New employee · Kaaj</title>
</svelte:head>

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
