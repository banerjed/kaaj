<script lang="ts">
  import PageTitle from "$lib/components/PageTitle.svelte"
  import PageHead from "$lib/components/PageHead.svelte"
  import EmptyState from "$lib/components/EmptyState.svelte"
  import Combobox from "$lib/components/Combobox.svelte"
  import type { ComboboxOption } from "$lib/components/Combobox.svelte"
  import { deserialize } from "$app/forms"

  let { data } = $props()

  const hasFilters = $derived(
    !!(
      data.filters.search ||
      data.filters.customerId ||
      data.filters.department
    ),
  )

  const lastPage = $derived(Math.max(1, Math.ceil(data.total / data.pageSize)))

  /** Preserve existing filters when changing the page. */
  const withParam = (key: string, value: string) => {
    const p = new URLSearchParams()
    const f = data.filters
    if (f.search) p.set("q", f.search)
    if (f.customerId) p.set("company", f.customerId)
    if (f.department) p.set("dept", f.department)
    if (value) p.set(key, value)
    else p.delete(key)
    if (key !== "page") p.delete("page")
    return `?${p.toString()}`
  }

  const companySelected = $derived<ComboboxOption[]>(
    data.selectedCompany
      ? [
          {
            id: data.selectedCompany.id,
            label: data.selectedCompany.customer_name,
          },
        ]
      : [],
  )

  // Company count can run into the thousands — the picker searches on
  // demand rather than choosing from a preloaded list.
  async function searchCompanies(q: string): Promise<ComboboxOption[]> {
    const body = new FormData()
    body.set("q", q)
    const res = await fetch("?/searchCompanies", { method: "POST", body })
    const result = deserialize<
      { results: ComboboxOption[] },
      Record<string, unknown>
    >(await res.text())
    return result.type === "success" ? (result.data?.results ?? []) : []
  }
</script>

<PageHead title="Contacts" />

<div class="p-4 lg:p-6">
  <PageTitle
    title="Contacts"
    items={[
      { label: "CRM", path: "/crm/companies" },
      { label: "Contacts", active: true },
    ]}
  />
  <p class="text-base-content/70 mt-1 text-sm">
    Every person across every company — the shared contact database. Add a new
    contact from their company's own page.
  </p>

  <!-- Filters post as GET so the URL carries the state. -->
  <form method="GET" class="mt-4 flex flex-wrap items-end gap-3">
    <fieldset class="fieldset w-56">
      <legend class="fieldset-legend text-xs">Search</legend>
      <input
        type="search"
        name="q"
        value={data.filters.search}
        placeholder="Name or email"
        aria-label="Search contacts"
        class="input input-sm w-full"
      />
    </fieldset>

    <fieldset class="fieldset w-48">
      <legend class="fieldset-legend text-xs">Company</legend>
      <Combobox
        name="company"
        selected={companySelected}
        search={searchCompanies}
        placeholder="Any company"
        emptyText="No matching company"
      />
    </fieldset>

    <fieldset class="fieldset w-40">
      <legend class="fieldset-legend text-xs">Department</legend>
      <select name="dept" class="select select-sm w-full">
        <option value="" selected={!data.filters.department}>All</option>
        {#each data.departmentOptions as d (d)}
          <option value={d} selected={d === data.filters.department}>{d}</option
          >
        {/each}
      </select>
    </fieldset>

    <button class="btn btn-primary btn-sm">Apply</button>
    {#if hasFilters}
      <a href="/crm/contacts" class="btn btn-ghost btn-sm">Clear</a>
    {/if}

    <p class="text-base-content/70 ms-auto text-xs">
      {data.total}
      {data.total === 1 ? "contact" : "contacts"}
    </p>
  </form>

  {#if data.contacts.length === 0}
    <EmptyState
      icon="lucide--users"
      title="No contacts found"
      message={hasFilters
        ? "No contacts match these filters."
        : "Contacts live on their company's page — open a company and add one there."}
    />
  {:else}
    <div class="card bg-base-100 mt-4 shadow">
      <div class="overflow-x-auto">
        <table class="table">
          <thead>
            <tr>
              <th>Name</th>
              <th>Company</th>
              <th>Department</th>
              <th>Title</th>
              <th>Email</th>
              <th>Phone</th>
            </tr>
          </thead>
          <tbody>
            {#each data.contacts as p (p.id)}
              <tr class="hover:bg-base-200/40">
                <td>
                  <a
                    href={`/crm/contacts/${p.id}`}
                    class="link link-hover font-medium"
                  >
                    {p.first_name}
                    {p.last_name}
                  </a>
                  {#if p.is_primary}<span class="badge badge-sm ms-1"
                      >Primary</span
                    >{/if}
                </td>
                <td>
                  <a
                    href={`/crm/companies/${p.customer_id}`}
                    class="link link-hover text-sm"
                  >
                    {p.customer_name}
                  </a>
                </td>
                <td class="text-sm">{p.department ?? "—"}</td>
                <td class="text-sm">{p.title ?? "—"}</td>
                <td class="text-sm">{p.email}</td>
                <td class="text-sm">{p.phone ?? "—"}</td>
              </tr>
            {/each}
          </tbody>
        </table>
      </div>
    </div>

    {#if lastPage > 1}
      <div class="mt-4 flex items-center justify-center gap-2">
        <a
          class="btn btn-sm"
          class:btn-disabled={data.page <= 1}
          href={withParam("page", String(data.page - 1))}
          aria-label="Previous page">Previous</a
        >
        <span class="text-base-content/70 text-sm">
          Page {data.page} of {lastPage}
        </span>
        <a
          class="btn btn-sm"
          class:btn-disabled={data.page >= lastPage}
          href={withParam("page", String(data.page + 1))}
          aria-label="Next page">Next</a
        >
      </div>
    {/if}
  {/if}
</div>
