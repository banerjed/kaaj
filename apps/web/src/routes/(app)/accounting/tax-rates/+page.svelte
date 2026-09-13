<script lang="ts">
  import { enhance } from "$app/forms"
  import PageTitle from "$lib/components/PageTitle.svelte"
  import PageHead from "$lib/components/PageHead.svelte"
  import StatusBadge from "$lib/components/StatusBadge.svelte"
  import { fieldErrors } from "$lib/form-errors"
  import { closeOnSuccess } from "$lib/form-enhance"
  import { calendarDate } from "$lib/format"

  let { data, form } = $props()

  const err = $derived(fieldErrors(form))
  const tenantLocale = $derived(data.tenant?.default_locale ?? "en-US")

  let creating = $state(false)
</script>

<PageHead title="Tax Rates" />

<div class="p-4 lg:p-6">
  <PageTitle
    title="Tax Rates"
    items={[
      { label: "Finance & Accounting", path: "/accounting/tax-rates" },
      { label: "Tax Rates", active: true },
    ]}
  />

  {#if form?.message}
    <div class="alert alert-error mt-4" role="alert">{form.message}</div>
  {/if}
  {#if form?.saved}
    <div class="alert alert-success mt-4" role="alert">Tax rate created.</div>
  {/if}
  {#if form?.toggled}
    <div class="alert alert-success mt-4" role="alert">Saved.</div>
  {/if}

  {#if data.mayWrite}
    <div class="mt-4 flex justify-end">
      <button
        class="btn btn-primary btn-sm gap-2"
        onclick={() => (creating = true)}
      >
        <span class="iconify lucide--plus size-4"></span>
        New Tax Rate
      </button>
    </div>
  {/if}

  <div class="card bg-base-100 mt-4 shadow">
    <div class="overflow-x-auto">
      <table class="table">
        <thead>
          <tr>
            <th>Code</th>
            <th>Name</th>
            <th>Type</th>
            <th class="text-right">Rate</th>
            <th>Jurisdiction</th>
            <th>Reverse charge</th>
            <th>Since</th>
            <th>Status</th>
            {#if data.mayWrite}
              <th></th>
            {/if}
          </tr>
        </thead>
        <tbody>
          {#each data.taxRates as t (t.id)}
            <tr class="hover:bg-base-200/40">
              <td class="font-mono text-xs">{t.code}</td>
              <td>{t.tax_name}</td>
              <td class="capitalize">{t.tax_type.replace("_", " ")}</td>
              <td class="text-right tabular-nums">{t.rate_percent}%</td>
              <td class="text-sm">
                {t.jurisdiction ??
                  `${t.country}${t.region ? `-${t.region}` : ""}`}
              </td>
              <td>{t.is_reverse_charge ? "Yes" : "—"}</td>
              <td class="text-sm"
                >{calendarDate(t.effective_from, tenantLocale)}</td
              >
              <td>
                <StatusBadge tone={t.is_active ? "positive" : "neutral"}>
                  {t.is_active ? "Active" : "Inactive"}
                </StatusBadge>
              </td>
              {#if data.mayWrite}
                <td class="text-right">
                  {#if t.is_active}
                    <form method="POST" action="?/deactivate" use:enhance>
                      <input type="hidden" name="id" value={t.id} />
                      <button type="submit" class="btn btn-ghost btn-sm">
                        Deactivate
                      </button>
                    </form>
                  {:else}
                    <form method="POST" action="?/activate" use:enhance>
                      <input type="hidden" name="id" value={t.id} />
                      <button type="submit" class="btn btn-ghost btn-sm">
                        Activate
                      </button>
                    </form>
                  {/if}
                </td>
              {/if}
            </tr>
          {/each}
        </tbody>
      </table>
    </div>
  </div>
</div>

{#if creating}
  <div class="modal modal-open" role="dialog" aria-label="New tax rate">
    <div class="modal-box">
      <h3 class="text-lg font-medium">New Tax Rate</h3>
      <form
        method="POST"
        action="?/create"
        class="mt-4 grid grid-cols-2 gap-4"
        use:enhance={closeOnSuccess(() => (creating = false))}
      >
        <fieldset class="fieldset">
          <legend class="fieldset-legend">Code</legend>
          <input
            type="text"
            name="code"
            maxlength="50"
            required
            aria-invalid={err.aria("code")}
            class={`input w-full ${err.input("code")}`}
            placeholder="TAX-US-NY-2027"
          />
        </fieldset>
        <fieldset class="fieldset">
          <legend class="fieldset-legend">Name</legend>
          <input
            type="text"
            name="tax_name"
            maxlength="255"
            required
            aria-invalid={err.aria("tax_name")}
            class={`input w-full ${err.input("tax_name")}`}
            placeholder="New York Sales Tax"
          />
        </fieldset>
        <fieldset class="fieldset">
          <legend class="fieldset-legend">Type</legend>
          <select
            name="tax_type"
            required
            aria-invalid={err.aria("tax_type")}
            class={`select w-full ${err.select("tax_type")}`}
          >
            {#each data.taxTypes as t (t)}
              <option value={t}>{t.replace("_", " ")}</option>
            {/each}
          </select>
        </fieldset>
        <fieldset class="fieldset">
          <legend class="fieldset-legend">Rate (decimal, e.g. 0.08875)</legend>
          <input
            type="text"
            inputmode="decimal"
            name="rate"
            required
            aria-invalid={err.aria("rate")}
            class={`input w-full ${err.input("rate")}`}
            placeholder="0.08875"
          />
        </fieldset>
        <fieldset class="fieldset">
          <legend class="fieldset-legend">Country (ISO-2)</legend>
          <input
            type="text"
            name="country"
            maxlength="2"
            required
            aria-invalid={err.aria("country")}
            class={`input w-full uppercase ${err.input("country")}`}
            placeholder="US"
          />
        </fieldset>
        <fieldset class="fieldset">
          <legend class="fieldset-legend">Region</legend>
          <input
            type="text"
            name="region"
            maxlength="100"
            class="input w-full"
            placeholder="NY"
          />
        </fieldset>
        <fieldset class="fieldset col-span-2">
          <legend class="fieldset-legend">Jurisdiction</legend>
          <input
            type="text"
            name="jurisdiction"
            maxlength="255"
            class="input w-full"
            placeholder="US-NY-New York City"
          />
        </fieldset>
        <fieldset class="fieldset">
          <legend class="fieldset-legend">Effective from</legend>
          <input
            type="date"
            name="effective_from"
            required
            aria-invalid={err.aria("effective_from")}
            class={`input w-full ${err.input("effective_from")}`}
          />
        </fieldset>
        <label class="label mt-6 gap-2">
          <input type="checkbox" name="is_reverse_charge" class="checkbox" />
          Reverse charge
        </label>
        <div class="modal-action col-span-2">
          <button
            type="button"
            class="btn btn-ghost"
            onclick={() => (creating = false)}>Cancel</button
          >
          <button type="submit" class="btn btn-primary">Create</button>
        </div>
      </form>
    </div>
    <button
      class="modal-backdrop"
      aria-label="Close"
      onclick={() => (creating = false)}
    ></button>
  </div>
{/if}
