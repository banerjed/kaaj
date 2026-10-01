<script lang="ts">
  import PageTitle from "$lib/components/PageTitle.svelte"
  import PageHead from "$lib/components/PageHead.svelte"
  import StatusBadge from "$lib/components/StatusBadge.svelte"
  import ModalActions from "$lib/components/ModalActions.svelte"
  import EmptyState from "$lib/components/EmptyState.svelte"
  import RowActions from "$lib/components/RowActions.svelte"
  import type { RowAction } from "$lib/components/row-actions"
  import { relationshipStatusTone } from "$lib/components/status-tone"
  import { fieldErrors } from "$lib/form-errors"
  import { has } from "$lib/permissions"
  import { enhance } from "$app/forms"
  import { closeOnSuccess } from "$lib/form-enhance"

  let { data, form } = $props()

  const err = $derived(fieldErrors(form))
  const canWrite = $derived(has(data.permissions, "crm.write"))

  let creating = $state(false)

  const rowActions = (c: (typeof data.companies)[number]): RowAction[] => [
    {
      kind: "view",
      href: `/crm/companies/${c.id}`,
      label: `View ${c.customer_name}`,
    },
    ...(canWrite
      ? ([
          {
            kind: "edit",
            href: `/crm/companies/${c.id}?edit=1`,
            label: `Edit ${c.customer_name}`,
          },
        ] satisfies RowAction[])
      : []),
  ]
</script>

<PageHead title="Companies" />

<div class="p-4 lg:p-6">
  <PageTitle
    title="Companies"
    items={[
      { label: "CRM", path: "/crm/companies" },
      { label: "Companies", active: true },
    ]}
  />

  {#if form?.saved}
    <div role="status" class="alert alert-success mt-4">
      <span class="iconify lucide--check size-5"></span>
      <span>Saved.</span>
    </div>
  {:else if form?.message}
    <div role="alert" class="alert alert-error mt-4">
      <span class="iconify lucide--circle-alert size-5"></span>
      <span>{form.message}</span>
    </div>
  {/if}

  <div class="mt-4 flex flex-wrap items-center justify-between gap-3">
    <form method="GET" class="flex items-center gap-2">
      <label class="text-base-content/70 text-sm" for="status">Status</label>
      <select
        id="status"
        name="status"
        class="select select-sm"
        value={data.selectedStatus}
        onchange={(e) => e.currentTarget.form?.requestSubmit()}
      >
        <option value="">All</option>
        {#each data.relationshipStatuses as s (s)}
          <option value={s} class="capitalize">{s}</option>
        {/each}
      </select>
      <span class="text-base-content/70 text-sm">
        {data.companies.length}
        {data.companies.length === 1 ? "company" : "companies"}
      </span>
    </form>

    <button
      class="btn btn-primary btn-sm gap-2"
      onclick={() => (creating = true)}
    >
      <span class="iconify lucide--plus size-4"></span>
      New Company
    </button>
  </div>

  {#if data.companies.length === 0}
    <EmptyState
      icon="lucide--building-2"
      title="No companies yet"
      message="Every deal and contact hangs off a company — start by adding one, even a solo client counts as a company here."
    />
  {:else}
    <div class="card bg-base-100 mt-4 shadow">
      <div class="overflow-x-auto">
        <table class="table">
          <thead>
            <tr>
              <th>Company</th>
              <th>Status</th>
              <th>Industry</th>
              <th>Account manager</th>
              <th class="text-right">Contacts</th>
              <th class="w-24">Actions</th>
            </tr>
          </thead>
          <tbody>
            {#each data.companies as c (c.id)}
              <tr class="hover:bg-base-200/40">
                <td>
                  <a
                    href={`/crm/companies/${c.id}`}
                    class="link link-hover font-medium"
                  >
                    {c.customer_name}
                  </a>
                  {#if c.website}
                    <p class="text-base-content/70 text-xs">{c.website}</p>
                  {/if}
                </td>
                <td>
                  <StatusBadge
                    tone={relationshipStatusTone(c.relationship_status)}
                  >
                    {c.relationship_status}
                  </StatusBadge>
                </td>
                <td class="text-sm">{c.industry ?? "—"}</td>
                <td class="text-sm">{c.account_manager_name ?? "—"}</td>
                <td class="text-right text-sm tabular-nums"
                  >{c.contact_count}</td
                >
                <td><RowActions actions={rowActions(c)} /></td>
              </tr>
            {/each}
          </tbody>
        </table>
      </div>
    </div>
  {/if}
</div>

{#if creating}
  <div class="modal modal-open" role="dialog" aria-label="New company">
    <div class="modal-box max-w-xl">
      <h3 class="text-lg font-medium">New company</h3>

      <form
        method="POST"
        action="?/save"
        class="mt-4 grid gap-4"
        use:enhance={closeOnSuccess(() => (creating = false))}
      >
        <div class="grid gap-4 sm:grid-cols-2">
          <fieldset class="fieldset">
            <legend class="fieldset-legend">Company name</legend>
            <input
              name="customer_name"
              aria-invalid={err.aria("customer_name")}
              class={`input w-full ${err.input("customer_name")}`}
              required
            />
          </fieldset>
          <fieldset class="fieldset">
            <legend class="fieldset-legend">Type</legend>
            <select
              name="customer_type"
              aria-invalid={err.aria("customer_type")}
              class={`select w-full ${err.select("customer_type")}`}
            >
              {#each data.customerTypes as t (t)}
                <option value={t}>{t.replaceAll("_", " ")}</option>
              {/each}
            </select>
          </fieldset>
        </div>

        <div class="grid gap-4 sm:grid-cols-2">
          <fieldset class="fieldset">
            <legend class="fieldset-legend">Status</legend>
            <select
              name="relationship_status"
              aria-invalid={err.aria("relationship_status")}
              class={`select w-full ${err.select("relationship_status")}`}
            >
              {#each data.relationshipStatuses as s (s)}
                <option value={s} selected={s === "prospect"}>{s}</option>
              {/each}
            </select>
          </fieldset>
          <fieldset class="fieldset">
            <legend class="fieldset-legend">Currency</legend>
            <input
              name="currency"
              aria-invalid={err.aria("currency")}
              class={`input w-full uppercase ${err.input("currency")}`}
              placeholder="USD"
              maxlength="3"
              required
            />
          </fieldset>
        </div>

        <div class="grid gap-4 sm:grid-cols-2">
          <fieldset class="fieldset">
            <legend class="fieldset-legend">Industry</legend>
            <input name="industry" class="input w-full" />
          </fieldset>
          <fieldset class="fieldset">
            <legend class="fieldset-legend">Company size</legend>
            <input
              name="company_size"
              class="input w-full"
              placeholder="1-10"
            />
          </fieldset>
        </div>

        <div class="grid gap-4 sm:grid-cols-2">
          <fieldset class="fieldset">
            <legend class="fieldset-legend">Website</legend>
            <input name="website" class="input w-full" />
          </fieldset>
          <fieldset class="fieldset">
            <legend class="fieldset-legend">Account manager</legend>
            <select name="account_manager_id" class="select w-full">
              <option value="">Unassigned</option>
              {#each data.accountManagers as m (m.id)}
                <option value={m.id}>{m.name}</option>
              {/each}
            </select>
          </fieldset>
        </div>

        <fieldset class="fieldset">
          <legend class="fieldset-legend">Acquisition source</legend>
          <input
            name="acquisition_source"
            class="input w-full"
            placeholder="referral, inbound, conference…"
          />
        </fieldset>

        <ModalActions onCancel={() => (creating = false)} />
      </form>
    </div>
    <button
      class="modal-backdrop"
      aria-label="Close"
      onclick={() => (creating = false)}
    ></button>
  </div>
{/if}
