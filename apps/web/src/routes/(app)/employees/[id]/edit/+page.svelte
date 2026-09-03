<script lang="ts">
  import PageTitle from "$lib/components/PageTitle.svelte"
  import EmployeeForm from "$lib/components/EmployeeForm.svelte"
  import PageHead from "$lib/components/PageHead.svelte"

  let { data, form } = $props()

  const name = $derived(
    `${data.employee.preferred_name || data.employee.first_name} ${data.employee.last_name}`,
  )
</script>

<PageHead title="Edit {name}" />

<div class="p-4 lg:p-6">
  <PageTitle
    title={`Edit ${name}`}
    items={[
      { label: "Employees", path: "/employees" },
      { label: name, path: `/employees/${data.employee.id}` },
      { label: "Edit", active: true },
    ]}
  />

  <div class="mt-4">
    <EmployeeForm
      employee={data.employee}
      departments={data.departments}
      locations={data.locations}
      jobTitles={data.jobTitles}
      managers={data.managers}
      enums={data.enums}
      {form}
      submitLabel="Save changes"
      cancelHref={`/employees/${data.employee.id}`}
    />
  </div>
</div>
