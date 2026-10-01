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
  import { money } from "$lib/format"

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

  const tenantLocale = $derived(data.tenant?.default_locale ?? "en-US")
  const tenantCurrency = $derived(data.tenant?.default_currency ?? "USD")

  const dealsByStage = $derived(
    new Map(
      data.stages.map((s) => [
        s.id,
        data.deals.filter((d) => d.stage_id === s.id),
      ]),
    ),
  )

  // Counts and totals come from the database, not from the cards on screen:
  // the board shows a PAGE of each column, so counting what is loaded would
  // report the page size as the pipeline.
  const summaryOf = $derived(
    new Map(data.stageSummary.map((s) => [s.stage_id, s])),
  )
  const loadedCount = (stageId: string) =>
    dealsByStage.get(stageId)?.length ?? 0
  const totalCount = (stageId: string) =>
    summaryOf.get(stageId)?.deal_count ?? 0

  /** `?stage=<id>&pages=<n>` — one column at a time, so the query stays one query. */
  const showMoreHref = (stageId: string) =>
    `?stage=${stageId}&pages=${(data.expandStageId === stageId ? data.expandPages : 1) + 1}`
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
        <div class="bg-base-200/40 rounded-box flex max-h-[70vh] flex-col p-2">
          <p
            class="text-base-content/70 flex items-center justify-between px-1 text-xs font-semibold uppercase"
          >
            {s.name}
            <span class="badge badge-sm">{totalCount(s.id)}</span>
          </p>
          <!-- Per currency. A total mixing USD and GBP is not a number
               anyone can act on, and money is never converted (BR-FP-003). -->
          {#each summaryOf.get(s.id)?.totals ?? [] as t (t.currency)}
            <p class="text-base-content/70 mt-1 px-1 text-xs tabular-nums">
              {money(t.amount, t.currency, tenantLocale)}
            </p>
          {/each}
          <div class="mt-2 flex flex-col gap-2 overflow-y-auto pe-1">
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
                      {money(
                        d.value_amount,
                        d.currency ?? tenantCurrency,
                        tenantLocale,
                      )}
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
          {#if loadedCount(s.id) < totalCount(s.id)}
            <a href={showMoreHref(s.id)} class="btn btn-ghost btn-xs mt-2">
              Show more ({totalCount(s.id) - loadedCount(s.id)} more)
            </a>
          {/if}
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
