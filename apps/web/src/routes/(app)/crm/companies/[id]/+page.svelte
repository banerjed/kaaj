<script lang="ts">
  import PageTitle from "$lib/components/PageTitle.svelte"
  import PageHead from "$lib/components/PageHead.svelte"
  import SectionCard from "$lib/components/SectionCard.svelte"
  import StatusBadge from "$lib/components/StatusBadge.svelte"
  import ModalActions from "$lib/components/ModalActions.svelte"
  import CustomFieldValues from "$lib/components/CustomFieldValues.svelte"
  import CustomFieldFormFields from "$lib/components/CustomFieldFormFields.svelte"
  import { relationshipStatusTone } from "$lib/components/status-tone"
  import { fieldErrors } from "$lib/form-errors"
  import { enhance } from "$app/forms"
  import { closeOnSuccess, keepValues } from "$lib/form-enhance"
  import { page } from "$app/state"

  let { data, form } = $props()

  const err = $derived(fieldErrors(form))
  const c = $derived(data.company)
  const tenantLocale = $derived(data.tenant?.default_locale ?? "en-US")

  // Opened straight from the list's edit icon (`?edit=1`), the same
  // deep-link shape /time-tracking already uses. Seeded once on purpose: it
  // is this page's own draft state from here on, and must not snap shut when
  // the URL changes under it.
  let editing = $state(page.url.searchParams.get("edit") === "1")
  let addingContact = $state(false)
  let addingDeal = $state(false)

  const dealsTotal = $derived(
    data.deals.reduce((sum, d) => sum + Number(d.value_amount ?? 0), 0),
  )
  const loadMoreActivitiesHref = $derived(
    `?activities=${data.activityPages + 1}`,
  )

  const activityIcon = (t: string) =>
    t === "call"
      ? "lucide--phone"
      : t === "email"
        ? "lucide--mail"
        : t === "meeting"
          ? "lucide--users"
          : "lucide--sticky-note"
</script>

<PageHead title={c.customer_name} />

<div class="p-4 lg:p-6">
  <PageTitle
    title={c.customer_name}
    items={[
      { label: "CRM", path: "/crm/companies" },
      { label: "Companies", path: "/crm/companies" },
      { label: c.customer_name, active: true },
    ]}
  />

  {#if form?.saved || form?.contactAdded || form?.dealAdded || form?.activityAdded}
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
    <div class="lg:sticky lg:top-4 lg:col-span-1 lg:self-start">
      <SectionCard>
        {#snippet heading()}
          <div class="flex items-start justify-between gap-2">
            <div>
              <h2 class="text-base font-medium">Company details</h2>
              <div class="mt-1 flex items-center gap-2">
                <StatusBadge
                  tone={relationshipStatusTone(c.relationship_status)}
                >
                  {c.relationship_status}
                </StatusBadge>
                {#if c.customer_type}
                  <span class="text-base-content/70 text-xs capitalize">
                    {c.customer_type.replaceAll("_", " ")}
                  </span>
                {/if}
              </div>
            </div>
            <button
              class="btn btn-ghost btn-sm"
              onclick={() => (editing = true)}
            >
              <span class="iconify lucide--pencil size-4"></span>
              Edit
            </button>
          </div>
        {/snippet}
        <dl class="grid gap-3 text-sm">
          <div>
            <dt class="text-base-content/70">Industry</dt>
            <dd>{c.industry ?? "—"}</dd>
          </div>
          <div>
            <dt class="text-base-content/70">Company size</dt>
            <dd>{c.company_size ?? "—"}</dd>
          </div>
          <div>
            <dt class="text-base-content/70">Website</dt>
            <dd>{c.website ?? "—"}</dd>
          </div>
          <div>
            <dt class="text-base-content/70">Account manager</dt>
            <dd>{c.account_manager_name ?? "Unassigned"}</dd>
          </div>
          <div>
            <dt class="text-base-content/70">Acquisition source</dt>
            <dd>{c.acquisition_source ?? "—"}</dd>
          </div>
          <div>
            <dt class="text-base-content/70">Currency</dt>
            <dd>{c.currency}</dd>
          </div>
          {#if c.notes}
            <div>
              <dt class="text-base-content/70">Notes</dt>
              <dd class="whitespace-pre-wrap">{c.notes}</dd>
            </div>
          {/if}
        </dl>
        {#if data.fieldDefs.length > 0}
          <div class="border-base-200 mt-3 border-t pt-3">
            <CustomFieldValues
              stacked
              definitions={data.fieldDefs}
              values={data.fieldValues}
              locale={tenantLocale}
              currency={c.currency}
            />
          </div>
        {/if}
      </SectionCard>
    </div>

    <div class="flex flex-col gap-4 lg:col-span-2">
      <SectionCard>
        {#snippet heading()}
          <div class="flex items-center justify-between gap-2">
            <h2 class="text-base font-medium">
              Contacts
              {#if data.contacts.length > 0}({data.contacts.length}){/if}
            </h2>
            <button
              class="btn btn-ghost btn-sm gap-2"
              onclick={() => (addingContact = true)}
            >
              <span class="iconify lucide--plus size-4"></span>
              New contact
            </button>
          </div>
        {/snippet}
        {#if data.contacts.length === 0}
          <div class="flex flex-col items-center gap-2 py-6 text-center">
            <span class="iconify lucide--users text-base-content/30 size-8"
            ></span>
            <p class="text-base-content/70 text-sm">No contacts yet.</p>
          </div>
        {:else}
          <ul class="flex max-h-72 flex-col gap-2 overflow-y-auto pe-1">
            {#each data.contacts as p (p.id)}
              <li>
                <a
                  href={`/crm/contacts/${p.id}`}
                  class="link link-hover text-sm font-medium"
                >
                  {p.first_name}
                  {p.last_name}
                </a>
                {#if p.is_primary}<span class="badge badge-sm ms-1"
                    >Primary</span
                  >{/if}
                <p class="text-base-content/70 text-xs">
                  {p.title ?? "—"}{#if p.department}
                    · {p.department}{/if} ·
                  {p.email}
                </p>
              </li>
            {/each}
          </ul>
        {/if}
      </SectionCard>

      <SectionCard>
        {#snippet heading()}
          <div class="flex items-center justify-between gap-2">
            <div>
              <h2 class="text-base font-medium">
                Deals
                {#if data.deals.length > 0}({data.deals.length}){/if}
              </h2>
              {#if dealsTotal}
                <p class="text-base-content/70 text-xs">
                  {c.currency}
                  {dealsTotal.toLocaleString()} total
                </p>
              {/if}
            </div>
            <button
              class="btn btn-ghost btn-sm gap-2"
              onclick={() => (addingDeal = true)}
            >
              <span class="iconify lucide--plus size-4"></span>
              New deal
            </button>
          </div>
        {/snippet}
        {#if data.deals.length === 0}
          <div class="flex flex-col items-center gap-2 py-6 text-center">
            <span class="iconify lucide--handshake text-base-content/30 size-8"
            ></span>
            <p class="text-base-content/70 text-sm">No deals yet.</p>
          </div>
        {:else}
          <ul class="flex max-h-72 flex-col gap-2 overflow-y-auto pe-1">
            {#each data.deals as d (d.id)}
              <li>
                <a
                  href={`/crm/deals/${d.id}`}
                  class="link link-hover text-sm font-medium"
                >
                  {d.name}
                </a>
                <p class="text-base-content/70 text-xs">
                  {d.stage_name}
                  {#if d.value_amount}· {d.currency} {d.value_amount}{/if}
                </p>
              </li>
            {/each}
          </ul>
        {/if}
      </SectionCard>

      <SectionCard title="Activity">
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
            class="input input-sm w-full sm:col-span-3"
            placeholder="Details (optional)"
          />
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
                      {a.created_by_name} · {new Date(
                        a.occurred_at,
                      ).toLocaleString()}
                    </p>
                  </div>
                </div>
              </li>
            {/each}
          </ul>
          <div class="mt-3 flex items-center justify-between gap-2">
            <p class="text-base-content/70 text-xs">
              Showing the most recent {data.activities.length} of {data.activityTotal}
            </p>
            {#if data.activities.length < data.activityTotal}
              <a href={loadMoreActivitiesHref} class="btn btn-ghost btn-xs">
                Load more
              </a>
            {/if}
          </div>
        {/if}
      </SectionCard>
    </div>
  </div>
</div>

{#if editing}
  <div class="modal modal-open" role="dialog" aria-label="Edit company">
    <div class="modal-box max-w-xl">
      <h3 class="text-lg font-medium">Edit company</h3>
      <form
        method="POST"
        action="?/save"
        class="mt-4 grid gap-4"
        use:enhance={closeOnSuccess(() => (editing = false))}
      >
        <div class="grid gap-4 sm:grid-cols-2">
          <fieldset class="fieldset">
            <legend class="fieldset-legend">Company name</legend>
            <input
              name="customer_name"
              aria-invalid={err.aria("customer_name")}
              class={`input w-full ${err.input("customer_name")}`}
              value={c.customer_name}
              required
            />
          </fieldset>
          <fieldset class="fieldset">
            <legend class="fieldset-legend">Type</legend>
            <select name="customer_type" class="select w-full">
              {#each data.customerTypes as t (t)}
                <option value={t} selected={t === c.customer_type}>
                  {t.replaceAll("_", " ")}
                </option>
              {/each}
            </select>
          </fieldset>
        </div>
        <div class="grid gap-4 sm:grid-cols-2">
          <fieldset class="fieldset">
            <legend class="fieldset-legend">Status</legend>
            <select name="relationship_status" class="select w-full">
              {#each data.relationshipStatuses as s (s)}
                <option value={s} selected={s === c.relationship_status}
                  >{s}</option
                >
              {/each}
            </select>
          </fieldset>
          <fieldset class="fieldset">
            <legend class="fieldset-legend">Currency</legend>
            <input
              name="currency"
              class="input w-full uppercase"
              value={c.currency}
              maxlength="3"
              required
            />
          </fieldset>
        </div>
        <div class="grid gap-4 sm:grid-cols-2">
          <fieldset class="fieldset">
            <legend class="fieldset-legend">Industry</legend>
            <input
              name="industry"
              class="input w-full"
              value={c.industry ?? ""}
            />
          </fieldset>
          <fieldset class="fieldset">
            <legend class="fieldset-legend">Company size</legend>
            <input
              name="company_size"
              class="input w-full"
              value={c.company_size ?? ""}
            />
          </fieldset>
        </div>
        <div class="grid gap-4 sm:grid-cols-2">
          <fieldset class="fieldset">
            <legend class="fieldset-legend">Website</legend>
            <input
              name="website"
              class="input w-full"
              value={c.website ?? ""}
            />
          </fieldset>
          <fieldset class="fieldset">
            <legend class="fieldset-legend">Account manager</legend>
            <select name="account_manager_id" class="select w-full">
              <option value="">Unassigned</option>
              {#each data.accountManagers as m (m.id)}
                <option value={m.id} selected={m.id === c.account_manager_id}
                  >{m.name}</option
                >
              {/each}
            </select>
          </fieldset>
        </div>
        <fieldset class="fieldset">
          <legend class="fieldset-legend">Acquisition source</legend>
          <input
            name="acquisition_source"
            class="input w-full"
            value={c.acquisition_source ?? ""}
          />
        </fieldset>
        <fieldset class="fieldset">
          <legend class="fieldset-legend">Notes</legend>
          <textarea name="notes" class="textarea w-full" rows="3"
            >{c.notes ?? ""}</textarea
          >
        </fieldset>
        <CustomFieldFormFields
          definitions={data.fieldDefs}
          values={data.fieldValues}
          currency={c.currency}
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

{#if addingContact}
  <div class="modal modal-open" role="dialog" aria-label="New contact">
    <div class="modal-box">
      <h3 class="text-lg font-medium">New contact at {c.customer_name}</h3>
      <form
        method="POST"
        action="?/addContact"
        class="mt-4 grid gap-4"
        use:enhance={closeOnSuccess(() => (addingContact = false))}
      >
        <div class="grid gap-4 sm:grid-cols-2">
          <fieldset class="fieldset">
            <legend class="fieldset-legend">First name</legend>
            <input
              name="first_name"
              aria-invalid={err.aria("first_name")}
              class={`input w-full ${err.input("first_name")}`}
              required
            />
          </fieldset>
          <fieldset class="fieldset">
            <legend class="fieldset-legend">Last name</legend>
            <input
              name="last_name"
              aria-invalid={err.aria("last_name")}
              class={`input w-full ${err.input("last_name")}`}
              required
            />
          </fieldset>
        </div>
        <div class="grid gap-4 sm:grid-cols-2">
          <fieldset class="fieldset">
            <legend class="fieldset-legend">Email</legend>
            <input
              name="email"
              type="email"
              aria-invalid={err.aria("email")}
              class={`input w-full ${err.input("email")}`}
              required
            />
          </fieldset>
          <fieldset class="fieldset">
            <legend class="fieldset-legend">Phone</legend>
            <input name="phone" class="input w-full" />
          </fieldset>
        </div>
        <div class="grid gap-4 sm:grid-cols-2">
          <fieldset class="fieldset">
            <legend class="fieldset-legend">Title</legend>
            <input name="title" class="input w-full" />
          </fieldset>
          <fieldset class="fieldset">
            <legend class="fieldset-legend">Department</legend>
            <input name="department" class="input w-full" />
          </fieldset>
        </div>
        <label class="label cursor-pointer justify-start gap-3">
          <input
            type="checkbox"
            name="is_primary"
            class="checkbox checkbox-sm"
          />
          <span class="text-sm">Primary contact</span>
        </label>
        <ModalActions onCancel={() => (addingContact = false)} />
      </form>
    </div>
    <button
      class="modal-backdrop"
      aria-label="Close"
      onclick={() => (addingContact = false)}
    ></button>
  </div>
{/if}

{#if addingDeal}
  <div class="modal modal-open" role="dialog" aria-label="New deal">
    <div class="modal-box">
      <h3 class="text-lg font-medium">New deal for {c.customer_name}</h3>
      <form
        method="POST"
        action="?/addDeal"
        class="mt-4 grid gap-4"
        use:enhance={closeOnSuccess(() => (addingDeal = false))}
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
        <div class="grid gap-4 sm:grid-cols-2">
          <fieldset class="fieldset">
            <legend class="fieldset-legend">Stage</legend>
            <select name="stage_id" class="select w-full" required>
              {#each data.pipelineStages as s (s.id)}
                <option value={s.id}>{s.name}</option>
              {/each}
            </select>
          </fieldset>
          <fieldset class="fieldset">
            <legend class="fieldset-legend">Owner</legend>
            <select name="owner_id" class="select w-full" required>
              {#each data.accountManagers as m (m.id)}
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
              value={c.currency}
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
        {#if data.contacts.length > 0}
          <fieldset class="fieldset">
            <legend class="fieldset-legend">Contact</legend>
            <select name="customer_contact_id" class="select w-full">
              <option value="">None</option>
              {#each data.contacts as p (p.id)}
                <option value={p.id}>{p.first_name} {p.last_name}</option>
              {/each}
            </select>
          </fieldset>
        {/if}
        <ModalActions
          onCancel={() => (addingDeal = false)}
          submitLabel="Create"
        />
      </form>
    </div>
    <button
      class="modal-backdrop"
      aria-label="Close"
      onclick={() => (addingDeal = false)}
    ></button>
  </div>
{/if}
