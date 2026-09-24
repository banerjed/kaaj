<script lang="ts">
  import { enhance } from "$app/forms"
  import PageTitle from "$lib/components/PageTitle.svelte"
  import PageHead from "$lib/components/PageHead.svelte"
  import { fieldErrors } from "$lib/form-errors"
  import { keepValues } from "$lib/form-enhance"
  import { instant } from "$lib/format"
  import { WebsiteName } from "../../../../config"

  let { data, form } = $props()

  const err = $derived(fieldErrors(form))
  const settings = $derived(data.settings)
</script>

<PageHead title="Payment Gateway" />

<div class="p-4 lg:p-6">
  <PageTitle
    title="Payment Gateway"
    items={[
      { label: "Finance & Accounting", path: "/accounting/payment-gateway" },
      { label: "Payment Gateway", active: true },
    ]}
  />

  {#if form?.saved}
    <div role="status" class="alert alert-success mt-4">
      <span class="iconify lucide--check size-5"></span>
      <span>Stripe key saved. New invoices will include a payment link.</span>
    </div>
  {:else if form?.disconnected}
    <div role="status" class="alert alert-success mt-4">
      <span class="iconify lucide--check size-5"></span>
      <span
        >Disconnected. Invoices issued from now on will carry no payment link.</span
      >
    </div>
  {:else if form?.message}
    <div role="alert" class="alert alert-error mt-4">
      <span class="iconify lucide--circle-alert size-5"></span>
      <span>{form.message}</span>
    </div>
  {/if}

  <div class="card bg-base-100 mt-4 shadow max-w-xl">
    <div class="card-body gap-4">
      <h2 class="card-title text-base">Stripe</h2>
      <p class="text-base-content/70 text-xs">
        Paste your own Stripe secret key. When an invoice is issued, {WebsiteName}
        creates a Stripe Payment Link for the amount due and includes it on the invoice
        PDF and email — the customer pays into your own Stripe account. {WebsiteName}
        never sees a customer's card details, and a payment made through the link
        is not recorded automatically here — record it as usual once it arrives.
      </p>

      {#if settings}
        <div class="flex items-center gap-3">
          <span class="badge badge-success">Connected</span>
          <span class="text-sm">
            Key ending in {settings.secretKeyLast4}
            {#if !settings.isLiveMode}
              <span class="badge badge-warning badge-sm ml-1">Test mode</span>
            {/if}
          </span>
        </div>
        <p class="text-base-content/70 text-xs">
          Verified {instant(settings.verifiedAt, data.formatContext)}.
        </p>
      {:else}
        <span class="badge badge-ghost w-fit">Not connected</span>
      {/if}

      {#if data.mayWrite}
        <form
          method="POST"
          action="?/save"
          use:enhance={keepValues}
          class="flex flex-wrap items-end gap-2"
        >
          <fieldset class="fieldset grow">
            <legend class="fieldset-legend"
              >{settings ? "Replace key" : "Secret key"}</legend
            >
            <input
              type="password"
              name="secret_key"
              autocomplete="off"
              placeholder="sk_live_..."
              aria-invalid={err.aria("secret_key")}
              class={`input w-full font-mono ${err.input("secret_key")}`}
              required
            />
          </fieldset>
          <button type="submit" class="btn btn-primary">Save</button>
        </form>
        {#if settings}
          <form method="POST" action="?/disconnect" use:enhance={keepValues}>
            <button type="submit" class="btn btn-sm btn-ghost"
              >Disconnect</button
            >
          </form>
        {/if}
      {/if}
    </div>
  </div>
</div>
