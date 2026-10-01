<script lang="ts">
  import PageTitle from "$lib/components/PageTitle.svelte"
  import PageHead from "$lib/components/PageHead.svelte"
  import CustomFieldSettings from "$lib/components/CustomFieldSettings.svelte"

  let { data, form } = $props()

  const TABS = [
    { key: "company", label: "Clients", title: "Client fields" },
    { key: "customer_contact", label: "Contacts", title: "Contact fields" },
    { key: "deal", label: "Pipeline", title: "Deal fields" },
  ] as const
  let tab = $state<(typeof TABS)[number]["key"]>("company")

  const fieldsOf = $derived({
    company: data.companyFields,
    customer_contact: data.contactFields,
    deal: data.dealFields,
  })
</script>

<PageHead title="CRM Fields" />

<div class="p-4 lg:p-6">
  <PageTitle
    title="CRM Fields"
    items={[
      { label: "Settings", path: "/settings/company" },
      { label: "CRM Fields", active: true },
    ]}
  />
  <p class="text-base-content/70 mt-1 text-sm">
    The details your team tracks on each client, contact and deal, grouped under
    categories you name. Every client shows the client fields, every contact the
    contact fields, and every deal the pipeline fields.
  </p>

  {#if form?.fieldAdded || form?.fieldArchived || form?.categoryRenamed}
    <div role="status" class="alert alert-success mt-4">
      <span class="iconify lucide--check size-5"></span>
      <span>
        {form.fieldAdded
          ? "Field added."
          : form.fieldArchived
            ? "Field archived."
            : "Category renamed."}
      </span>
    </div>
  {:else if form?.message}
    <div role="alert" class="alert alert-error mt-4">
      <span class="iconify lucide--circle-alert size-5"></span>
      <span>{form.message}</span>
    </div>
  {/if}

  <div role="tablist" class="tabs tabs-border mt-4">
    {#each TABS as t (t.key)}
      <button
        role="tab"
        class={`tab ${tab === t.key ? "tab-active" : ""}`}
        aria-selected={tab === t.key}
        onclick={() => (tab = t.key)}
      >
        {t.label}
        <span class="badge badge-sm ms-2">{fieldsOf[t.key].length}</span>
      </button>
    {/each}
  </div>

  {#each TABS as t (t.key)}
    <div role="tabpanel" hidden={tab !== t.key}>
      <CustomFieldSettings
        id={`${t.key}-fields`}
        title={t.title}
        fields={fieldsOf[t.key]}
        {form}
        hidden={{ entity_type: t.key }}
      />
    </div>
  {/each}
</div>
