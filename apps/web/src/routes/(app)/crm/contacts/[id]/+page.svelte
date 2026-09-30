<script lang="ts">
  import PageTitle from "$lib/components/PageTitle.svelte"
  import PageHead from "$lib/components/PageHead.svelte"
  import SectionCard from "$lib/components/SectionCard.svelte"
  import ModalActions from "$lib/components/ModalActions.svelte"
  import CustomFieldValues from "$lib/components/CustomFieldValues.svelte"
  import CustomFieldFormFields from "$lib/components/CustomFieldFormFields.svelte"
  import { fieldErrors } from "$lib/form-errors"
  import { enhance } from "$app/forms"
  import { closeOnSuccess, keepValues } from "$lib/form-enhance"

  let { data, form } = $props()

  const err = $derived(fieldErrors(form))
  const p = $derived(data.contact)

  let editing = $state(false)

  const activityIcon = (t: string) =>
    t === "call"
      ? "lucide--phone"
      : t === "email"
        ? "lucide--mail"
        : t === "meeting"
          ? "lucide--users"
          : "lucide--sticky-note"

  const tenantLocale = $derived(data.tenant?.default_locale ?? "en-US")
  const tenantCurrency = $derived(data.tenant?.default_currency ?? "USD")
</script>

<PageHead title={`${p.first_name} ${p.last_name}`} />

<div class="p-4 lg:p-6">
  <PageTitle
    title={`${p.first_name} ${p.last_name}`}
    items={[
      { label: "CRM", path: "/crm/companies" },
      { label: "Contacts", path: "/crm/contacts" },
      { label: `${p.first_name} ${p.last_name}`, active: true },
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
          <h2 class="text-base font-medium">Details</h2>
          <button class="btn btn-ghost btn-sm" onclick={() => (editing = true)}>
            <span class="iconify lucide--pencil size-4"></span>
            Edit
          </button>
        </div>
      {/snippet}
      <dl class="grid gap-3 text-sm">
        <div>
          <dt class="text-base-content/70">Company</dt>
          <dd>
            <a href={`/crm/companies/${p.customer_id}`} class="link link-hover">
              {p.customer_name}
            </a>
          </dd>
        </div>
        <div>
          <dt class="text-base-content/70">Title</dt>
          <dd>{p.title ?? "—"}</dd>
        </div>
        <div>
          <dt class="text-base-content/70">Department</dt>
          <dd>{p.department ?? "—"}</dd>
        </div>
        <div>
          <dt class="text-base-content/70">Email</dt>
          <dd>{p.email}</dd>
        </div>
        <div>
          <dt class="text-base-content/70">Phone</dt>
          <dd>{p.phone ?? "—"}</dd>
        </div>
      </dl>
      {#if data.fieldDefs.length > 0}
        <div class="border-base-200 mt-3 border-t pt-3">
          <CustomFieldValues
            definitions={data.fieldDefs}
            values={data.fieldValues}
            locale={tenantLocale}
            currency={tenantCurrency}
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
      {/if}
    </SectionCard>
  </div>
</div>

{#if editing}
  <div class="modal modal-open" role="dialog" aria-label="Edit contact">
    <div class="modal-box">
      <h3 class="text-lg font-medium">Edit contact</h3>
      <form
        method="POST"
        action="?/save"
        class="mt-4 grid gap-4"
        use:enhance={closeOnSuccess(() => (editing = false))}
      >
        <div class="grid gap-4 sm:grid-cols-2">
          <fieldset class="fieldset">
            <legend class="fieldset-legend">First name</legend>
            <input
              name="first_name"
              aria-invalid={err.aria("first_name")}
              class={`input w-full ${err.input("first_name")}`}
              value={p.first_name}
              required
            />
          </fieldset>
          <fieldset class="fieldset">
            <legend class="fieldset-legend">Last name</legend>
            <input
              name="last_name"
              aria-invalid={err.aria("last_name")}
              class={`input w-full ${err.input("last_name")}`}
              value={p.last_name}
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
              value={p.email}
              required
            />
          </fieldset>
          <fieldset class="fieldset">
            <legend class="fieldset-legend">Phone</legend>
            <input name="phone" class="input w-full" value={p.phone ?? ""} />
          </fieldset>
        </div>
        <div class="grid gap-4 sm:grid-cols-2">
          <fieldset class="fieldset">
            <legend class="fieldset-legend">Title</legend>
            <input name="title" class="input w-full" value={p.title ?? ""} />
          </fieldset>
          <fieldset class="fieldset">
            <legend class="fieldset-legend">Department</legend>
            <input
              name="department"
              class="input w-full"
              value={p.department ?? ""}
            />
          </fieldset>
        </div>
        <label class="label cursor-pointer justify-start gap-3">
          <input
            type="checkbox"
            name="is_primary"
            class="checkbox checkbox-sm"
            checked={p.is_primary}
          />
          <span class="text-sm">Primary contact</span>
        </label>
        <CustomFieldFormFields
          definitions={data.fieldDefs}
          values={data.fieldValues}
          currency={tenantCurrency}
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
