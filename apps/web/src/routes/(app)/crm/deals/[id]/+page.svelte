<script lang="ts">
  import PageTitle from "$lib/components/PageTitle.svelte"
  import PageHead from "$lib/components/PageHead.svelte"
  import SectionCard from "$lib/components/SectionCard.svelte"
  import StatusBadge from "$lib/components/StatusBadge.svelte"
  import ModalActions from "$lib/components/ModalActions.svelte"
  import CustomFieldValues from "$lib/components/CustomFieldValues.svelte"
  import CustomFieldFormFields from "$lib/components/CustomFieldFormFields.svelte"
  import { dealStageTone } from "$lib/components/status-tone"
  import { fieldErrors } from "$lib/form-errors"
  import { enhance } from "$app/forms"
  import { closeOnSuccess, keepValues } from "$lib/form-enhance"
  import { page } from "$app/state"
  import Combobox from "$lib/components/Combobox.svelte"
  import { actionSearch } from "$lib/action-search"

  const searchPeople = actionSearch("searchPeople")

  let { data, form } = $props()

  const err = $derived(fieldErrors(form))
  const d = $derived(data.deal)
  const tenantLocale = $derived(data.tenant?.default_locale ?? "en-US")
  const dealCurrency = $derived(
    d.currency ?? data.tenant?.default_currency ?? "USD",
  )

  // Opened straight from the pipeline card's edit icon (`?edit=1`), the same
  // deep-link shape /time-tracking already uses. Seeded once on purpose: it
  // is this page's own draft state from here on, and must not snap shut when
  // the URL changes under it.
  let editing = $state(page.url.searchParams.get("edit") === "1")

  const activityIcon = (t: string) =>
    t === "call"
      ? "lucide--phone"
      : t === "email"
        ? "lucide--mail"
        : t === "meeting"
          ? "lucide--users"
          : "lucide--sticky-note"
</script>

<PageHead title={d.name} />

<div class="p-4 lg:p-6">
  <PageTitle
    title={d.name}
    items={[
      { label: "CRM", path: "/crm/companies" },
      { label: "Pipeline", path: "/crm/pipeline" },
      { label: d.name, active: true },
    ]}
  />

  {#if form?.saved || form?.activityAdded}
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

  <div class="mt-4 grid gap-4 lg:grid-cols-3">
    <SectionCard class="lg:col-span-1">
      {#snippet heading()}
        <div class="flex items-start justify-between gap-2">
          <div>
            <h2 class="text-base font-medium">Deal details</h2>
            <div class="mt-1">
              <StatusBadge tone={dealStageTone(d.stage_type)}
                >{d.stage_name}</StatusBadge
              >
            </div>
          </div>
          <button class="btn btn-ghost btn-sm" onclick={() => (editing = true)}>
            <span class="iconify lucide--pencil size-4"></span>
            Edit
          </button>
        </div>
      {/snippet}
      <dl class="grid gap-3 text-sm">
        <div>
          <dt class="text-base-content/70">Client</dt>
          <dd>
            <a href={`/crm/companies/${d.customer_id}`} class="link link-hover">
              {d.customer_name}
            </a>
          </dd>
        </div>
        {#if d.contact_name}
          <div>
            <dt class="text-base-content/70">Contact</dt>
            <dd>
              <a
                href={`/crm/contacts/${d.customer_contact_id}`}
                class="link link-hover"
              >
                {d.contact_name}
              </a>
            </dd>
          </div>
        {/if}
        <div>
          <dt class="text-base-content/70">Value</dt>
          <dd class="tabular-nums">
            {d.value_amount ? `${d.currency} ${d.value_amount}` : "—"}
          </dd>
        </div>
        <div>
          <dt class="text-base-content/70">Probability</dt>
          <dd>
            {d.probability_percent !== null ? `${d.probability_percent}%` : "—"}
          </dd>
        </div>
        <div>
          <dt class="text-base-content/70">Expected close</dt>
          <dd>{d.expected_close_date ?? "—"}</dd>
        </div>
        <div>
          <dt class="text-base-content/70">Owner</dt>
          <dd>{d.owner_name}</dd>
        </div>
      </dl>
      {#if data.fieldDefs.length > 0}
        <div class="border-base-200 mt-3 border-t pt-3">
          <CustomFieldValues
            stacked
            definitions={data.fieldDefs}
            values={data.fieldValues}
            locale={tenantLocale}
            currency={dealCurrency}
          />
        </div>
      {/if}
    </SectionCard>

    <SectionCard title="Activity" class="lg:col-span-2">
      <form
        method="POST"
        action="?/addActivity"
        class="grid gap-2 sm:grid-cols-[8rem_1fr_auto]"
        use:enhance={keepValues}
      >
        <select
          name="activity_type"
          aria-invalid={err.aria("activity_type")}
          class={`select select-sm w-full ${err.select("activity_type")}`}
        >
          {#each data.activityTypes as t (t)}
            <option value={t} class="capitalize">{t}</option>
          {/each}
        </select>
        <input
          name="subject"
          class="input input-sm w-full"
          placeholder="What happened?"
        />
        <button class="btn btn-primary btn-sm">Log</button>
        <input
          name="body"
          class="input input-sm w-full sm:col-span-2"
          placeholder="Details (optional)"
        />
        <!-- Optional: a call or meeting is usually WITH someone, but a note
             about the deal is not. Blank stays NULL. -->
        <select
          name="customer_contact_id"
          class="select select-sm w-full"
          aria-label="Who was involved"
        >
          <option value="">No specific contact</option>
          {#each data.contacts as p (p.id)}
            <option value={p.id} selected={p.id === d.customer_contact_id}>
              {p.first_name}
              {p.last_name}
            </option>
          {/each}
        </select>
      </form>

      {#if data.activities.length === 0}
        <p class="text-base-content/70 mt-3 text-sm">Nothing logged yet.</p>
      {:else}
        <ul class="mt-3 flex flex-col gap-2">
          {#each data.activities as a (a.id)}
            <li class="border-base-200 border-t pt-2">
              <div class="flex items-start gap-2">
                <span
                  class="iconify {activityIcon(
                    a.activity_type,
                  )} text-base-content/50 mt-0.5 size-4"
                ></span>
                <div class="min-w-0 flex-1">
                  <p class="text-sm font-medium">
                    {a.subject ?? a.activity_type}
                  </p>
                  {#if a.body}
                    <p class="text-base-content/70 text-sm">{a.body}</p>
                  {/if}
                  <p class="text-base-content/70 mt-0.5 text-xs">
                    {#if a.contact_name}with {a.contact_name} ·
                    {/if}{a.created_by_name} · {new Date(
                      a.occurred_at,
                    ).toLocaleString()}
                  </p>
                </div>
              </div>
            </li>
          {/each}
        </ul>
      {/if}
    </SectionCard>
  </div>
</div>

{#if editing}
  <div class="modal modal-open" role="dialog" aria-label="Edit deal">
    <div class="modal-box max-w-3xl">
      <h3 class="text-lg font-medium">Edit deal</h3>
      <form
        method="POST"
        action="?/save"
        class="mt-4 grid gap-4"
        use:enhance={closeOnSuccess(() => (editing = false))}
      >
        <fieldset class="fieldset">
          <legend class="fieldset-legend">Deal name</legend>
          <input
            name="name"
            aria-invalid={err.aria("name")}
            class={`input w-full ${err.input("name")}`}
            value={d.name}
            required
          />
        </fieldset>
        <div class="grid gap-4 sm:grid-cols-2">
          <fieldset class="fieldset">
            <legend class="fieldset-legend">Stage</legend>
            <select name="stage_id" class="select w-full" required>
              {#each data.stages as s (s.id)}
                <option value={s.id} selected={s.id === d.stage_id}
                  >{s.name}</option
                >
              {/each}
            </select>
          </fieldset>
          <fieldset class="fieldset">
            <legend class="fieldset-legend">Owner</legend>
            {#key d.id}
              <Combobox
                name="owner_id"
                search={searchPeople}
                selected={[{ id: d.owner_id, label: d.owner_name }]}
                invalid={!!err.aria("owner_id")}
                placeholder="Search people…"
                emptyText="No matching person"
              />
            {/key}
          </fieldset>
        </div>
        <div class="grid gap-4 sm:grid-cols-2">
          <fieldset class="fieldset">
            <legend class="fieldset-legend">Value</legend>
            <input
              name="value_amount"
              inputmode="decimal"
              class="input w-full tabular-nums"
              value={d.value_amount ?? ""}
            />
          </fieldset>
          <fieldset class="fieldset">
            <legend class="fieldset-legend">Currency</legend>
            <input
              name="currency"
              class="input w-full uppercase"
              value={d.currency ?? ""}
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
              value={d.probability_percent ?? ""}
            />
          </fieldset>
          <fieldset class="fieldset">
            <legend class="fieldset-legend">Expected close date</legend>
            <input
              name="expected_close_date"
              type="date"
              class="input w-full"
              value={d.expected_close_date ?? ""}
            />
          </fieldset>
        </div>
        {#if data.contacts.length > 0}
          <fieldset class="fieldset">
            <legend class="fieldset-legend">Contact</legend>
            <select name="customer_contact_id" class="select w-full">
              <option value="">None</option>
              {#each data.contacts as p (p.id)}
                <option value={p.id} selected={p.id === d.customer_contact_id}>
                  {p.first_name}
                  {p.last_name}
                </option>
              {/each}
            </select>
          </fieldset>
        {/if}
        <CustomFieldFormFields
          definitions={data.fieldDefs}
          values={data.fieldValues}
          currency={dealCurrency}
          errorFields={form?.errorFields ?? []}
        />
        <ModalActions onCancel={() => (editing = false)} />
      </form>
    </div>
    <button
      class="modal-backdrop"
      aria-label="Close"
      onclick={() => (editing = false)}
    ></button>
  </div>
{/if}
