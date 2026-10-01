<script lang="ts">
  import PageTitle from "$lib/components/PageTitle.svelte"
  import PageHead from "$lib/components/PageHead.svelte"
  import ModalActions from "$lib/components/ModalActions.svelte"
  import RowActions from "$lib/components/RowActions.svelte"
  import type { RowAction } from "$lib/components/row-actions"
  import { has } from "$lib/permissions"
  import { fieldErrors } from "$lib/form-errors"
  import { enhance } from "$app/forms"
  import { closeOnSuccess, keepValues } from "$lib/form-enhance"

  let { data, form } = $props()

  const err = $derived(fieldErrors(form))
  const canWrite = $derived(has(data.permissions, "crm.write"))

  let creating = $state(false)

  const rowActions = (d: (typeof data.deals)[number]): RowAction[] => [
    { kind: "view", href: `/crm/deals/${d.id}`, label: `View ${d.name}` },
    ...(canWrite
      ? ([
          {
            kind: "edit",
            href: `/crm/deals/${d.id}?edit=1`,
            label: `Edit ${d.name}`,
          },
        ] satisfies RowAction[])
      : []),
  ]

  const dealsByStage = $derived(
    new Map(
      data.stages.map((s) => [
        s.id,
        data.deals.filter((d) => d.stage_id === s.id),
      ]),
    ),
  )

  const totalValue = (stageId: string) => {
    const rows = dealsByStage.get(stageId) ?? []
    const sum = rows.reduce((acc, d) => acc + Number(d.value_amount ?? 0), 0)
    return sum > 0 ? sum.toLocaleString() : null
  }
</script>

<PageHead title="Pipeline" />

<div class="p-4 lg:p-6">
  <PageTitle
    title="Pipeline"
    items={[
      { label: "CRM", path: "/crm/companies" },
      { label: "Pipeline", active: true },
    ]}
  />

  {#if form?.message}
    <div role="alert" class="alert alert-error mt-4">
      <span class="iconify lucide--circle-alert size-5"></span>
      <span>{form.message}</span>
    </div>
  {/if}

  <div class="mt-4 flex items-center justify-between gap-3">
    <p class="text-base-content/70 text-sm">
      {data.deals.length}
      {data.deals.length === 1 ? "deal" : "deals"}
    </p>
    <button
      class="btn btn-primary btn-sm gap-2"
      onclick={() => (creating = true)}
    >
      <span class="iconify lucide--plus size-4"></span>
      New Deal
    </button>
  </div>

  <div class="mt-4 overflow-x-auto pb-2">
    <div
      class="grid gap-3"
      style={`grid-template-columns: repeat(${data.stages.length}, minmax(14rem, 1fr)); width: max-content; min-width: 100%`}
    >
      {#each data.stages as s (s.id)}
        {@const cards = dealsByStage.get(s.id) ?? []}
        <div class="bg-base-200/40 rounded-box p-2">
          <p
            class="text-base-content/70 mb-2 flex items-center justify-between px-1 text-xs font-semibold uppercase"
          >
            {s.name}
            <span class="badge badge-sm">{cards.length}</span>
          </p>
          {#if totalValue(s.id)}
            <p class="text-base-content/70 mb-2 px-1 text-xs">
              {totalValue(s.id)}
            </p>
          {/if}
          <div class="flex flex-col gap-2">
            {#each cards as d (d.id)}
              <div class="card bg-base-100 shadow-sm">
                <div class="card-body gap-2 p-3">
                  <a
                    href={`/crm/deals/${d.id}`}
                    class="link link-hover text-sm font-medium"
                  >
                    {d.name}
                  </a>
                  <p class="text-base-content/70 text-xs">{d.customer_name}</p>
                  {#if d.value_amount}
                    <p class="text-sm tabular-nums">
                      {d.currency}
                      {d.value_amount}
                    </p>
                  {/if}
                  <!-- POST, never GET — this writes. -->
                  <form
                    method="POST"
                    action="?/moveStage"
                    use:enhance={keepValues}
                  >
                    <input type="hidden" name="deal_id" value={d.id} />
                    <select
                      name="stage_id"
                      class="select select-xs w-full"
                      value={d.stage_id}
                      aria-label={`Move ${d.name}`}
                      onchange={(e) => e.currentTarget.form?.requestSubmit()}
                    >
                      {#each data.stages as opt (opt.id)}
                        <option value={opt.id}>{opt.name}</option>
                      {/each}
                    </select>
                    <noscript
                      ><button class="btn btn-xs mt-1">Move</button></noscript
                    >
                  </form>
                  <RowActions size="xs" actions={rowActions(d)} />
                </div>
              </div>
            {/each}
          </div>
        </div>
      {/each}
    </div>
  </div>
</div>

{#if creating}
  <div class="modal modal-open" role="dialog" aria-label="New deal">
    <div class="modal-box">
      <h3 class="text-lg font-medium">New deal</h3>
      <form
        method="POST"
        action="?/addDeal"
        class="mt-4 grid gap-4"
        use:enhance={closeOnSuccess(() => (creating = false))}
      >
        <fieldset class="fieldset">
          <legend class="fieldset-legend">Deal name</legend>
          <input
            name="name"
            aria-invalid={err.aria("name")}
            class={`input w-full ${err.input("name")}`}
            required
          />
        </fieldset>
        <fieldset class="fieldset">
          <legend class="fieldset-legend">Client</legend>
          <select
            name="customer_id"
            aria-invalid={err.aria("customer_id")}
            class={`select w-full ${err.select("customer_id")}`}
            required
          >
            {#each data.companies as co (co.id)}
              <option value={co.id}>{co.customer_name}</option>
            {/each}
          </select>
        </fieldset>
        <div class="grid gap-4 sm:grid-cols-2">
          <fieldset class="fieldset">
            <legend class="fieldset-legend">Stage</legend>
            <select name="stage_id" class="select w-full" required>
              {#each data.stages as s (s.id)}
                <option value={s.id}>{s.name}</option>
              {/each}
            </select>
          </fieldset>
          <fieldset class="fieldset">
            <legend class="fieldset-legend">Owner</legend>
            <select name="owner_id" class="select w-full" required>
              {#each data.owners as m (m.id)}
                <option value={m.id}>{m.name}</option>
              {/each}
            </select>
          </fieldset>
        </div>
        <div class="grid gap-4 sm:grid-cols-2">
          <fieldset class="fieldset">
            <legend class="fieldset-legend">Value</legend>
            <input
              name="value_amount"
              inputmode="decimal"
              class="input w-full tabular-nums"
            />
          </fieldset>
          <fieldset class="fieldset">
            <legend class="fieldset-legend">Currency</legend>
            <input
              name="currency"
              class="input w-full uppercase"
              placeholder="USD"
              maxlength="3"
            />
          </fieldset>
        </div>
        <div class="grid gap-4 sm:grid-cols-2">
          <fieldset class="fieldset">
            <legend class="fieldset-legend">Probability %</legend>
            <input
              name="probability_percent"
              type="number"
              inputmode="numeric"
              class="input w-full tabular-nums"
              min="0"
              max="100"
            />
          </fieldset>
          <fieldset class="fieldset">
            <legend class="fieldset-legend">Expected close date</legend>
            <input
              name="expected_close_date"
              type="date"
              class="input w-full"
            />
          </fieldset>
        </div>
        <ModalActions
          onCancel={() => (creating = false)}
          submitLabel="Create"
        />
      </form>
    </div>
    <button
      class="modal-backdrop"
      aria-label="Close"
      onclick={() => (creating = false)}
    ></button>
  </div>
{/if}
