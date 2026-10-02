<script lang="ts">
  import PageTitle from "$lib/components/PageTitle.svelte"
  import PageHead from "$lib/components/PageHead.svelte"
  import Pagination from "$lib/components/Pagination.svelte"
  import EmptyState from "$lib/components/EmptyState.svelte"
  import { enhance } from "$app/forms"
  import { keepValues } from "$lib/form-enhance"
  import { page as pageState } from "$app/state"
  import {
    EMPLOYEE_ID_HINT,
    NEEDS_EMPLOYEE_ID,
    PROVIDER_LABELS,
  } from "$lib/payroll/export-formats"

  let { data, form } = $props()

  const provider = $derived(data.settings?.provider ?? null)
  // The row the refusal belongs to: every row has its own form.
  const failedRow = $derived(
    form && !("saved" in form)
      ? ((form as { employeeId?: string }).employeeId ?? null)
      : null,
  )

  function hrefFor(n: number) {
    const q = new URLSearchParams(pageState.url.searchParams)
    q.set("page", String(n))
    return `?${q}`
  }
</script>

<PageHead title="Employee Payroll IDs" />

<div class="p-4 lg:p-6">
  <PageTitle
    title="Employee Payroll IDs"
    items={[
      { label: "Payroll", path: "/payroll/export" },
      { label: "Employee Payroll IDs", active: true },
    ]}
  />

  {#if form?.message}
    <div role="alert" class="alert alert-error mt-4">
      <span class="iconify lucide--circle-alert size-5"></span>
      <span>{form.message}</span>
    </div>
  {:else if form && "saved" in form}
    <div role="status" class="alert alert-success mt-4">
      <span class="iconify lucide--check size-5"></span>
      <span>Saved.</span>
    </div>
  {/if}

  {#if !provider}
    <EmptyState
      icon="lucide--wallet"
      title="No payroll provider chosen"
      message="Each employee's id belongs to a provider. Choose the provider first."
    />
    <div class="mt-4 text-center">
      <a class="btn btn-primary btn-sm" href="/payroll/export/settings"
        >Payroll export settings</a
      >
    </div>
  {:else if !NEEDS_EMPLOYEE_ID[provider]}
    <EmptyState
      icon="lucide--users"
      title="No ids needed"
      message={EMPLOYEE_ID_HINT[provider]}
    />
  {:else if data.list}
    <p class="text-base-content/70 mt-2 text-sm">
      Each employee's id in {PROVIDER_LABELS[provider]}. {EMPLOYEE_ID_HINT[
        provider
      ]} The export refuses a file while an employee with hours has no id.
    </p>

    <form method="GET" class="mt-4 flex flex-wrap items-end gap-3">
      <label class="input input-sm">
        <span class="iconify lucide--search size-4"></span>
        <input
          name="q"
          value={data.search}
          placeholder="Name or employee id"
          aria-label="Search"
        />
      </label>
      <label class="label gap-2 text-sm">
        <input
          type="checkbox"
          class="checkbox checkbox-sm"
          name="missing"
          value="1"
          checked={data.missingOnly}
        />
        Missing an id only
      </label>
      <button class="btn btn-sm">Filter</button>
    </form>

    <div class="card bg-base-100 mt-4 shadow">
      <div class="overflow-x-auto">
        <table class="table table-sm">
          <caption class="sr-only"
            >Employee ids in {PROVIDER_LABELS[provider]}</caption
          >
          <thead>
            <tr>
              <th scope="col">Employee</th>
              <th scope="col">{PROVIDER_LABELS[provider]} id</th>
            </tr>
          </thead>
          <tbody>
            {#each data.list.rows as r (r.id)}
              <tr>
                <td>
                  {r.name}
                  <span class="text-base-content/70">{r.employee_code}</span>
                  {#if !r.is_active}<span class="badge badge-sm">Inactive</span
                    >{/if}
                </td>
                <td>
                  <form
                    method="POST"
                    action="?/save"
                    class="flex gap-2"
                    use:enhance={keepValues}
                  >
                    <input type="hidden" name="employee_id" value={r.id} />
                    <input
                      name="external_id"
                      value={r.external_id ?? ""}
                      aria-label={`${PROVIDER_LABELS[provider]} id for ${r.name}`}
                      class="input input-sm w-40"
                      class:input-error={failedRow === r.id}
                      aria-invalid={failedRow === r.id || undefined}
                    />
                    <button type="submit" class="btn btn-sm">Save</button>
                  </form>
                </td>
              </tr>
            {:else}
              <tr
                ><td colspan="2" class="text-base-content/70"
                  >No employees match.</td
                ></tr
              >
            {/each}
          </tbody>
        </table>
      </div>
      <Pagination
        page={data.page}
        pageSize={data.pageSize}
        total={data.list.total}
        {hrefFor}
      />
    </div>
  {/if}
</div>
