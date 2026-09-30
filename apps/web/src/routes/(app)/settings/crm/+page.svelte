<script lang="ts">
  import PageTitle from "$lib/components/PageTitle.svelte"
  import PageHead from "$lib/components/PageHead.svelte"
  import CustomFieldSettings from "$lib/components/CustomFieldSettings.svelte"

  let { data, form } = $props()
</script>

<PageHead title="Contact Fields" />

<div class="p-4 lg:p-6">
  <PageTitle
    title="Contact Fields"
    items={[
      { label: "Settings", path: "/settings/company" },
      { label: "Contact Fields", active: true },
    ]}
  />
  <p class="text-base-content/70 mt-1 text-sm">
    Custom fields you can add to a contact — alternate phone numbers, an
    alternate email, personal or family details, or anything else specific to
    how your business tracks the people you deal with. Group them under
    categories you name.
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

  <CustomFieldSettings
    id="contact-fields"
    title="Contact fields"
    fields={data.contactFields}
    {form}
  />
</div>
