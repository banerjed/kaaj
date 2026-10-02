<script lang="ts">
  import PageTitle from "$lib/components/PageTitle.svelte"
  import PageHead from "$lib/components/PageHead.svelte"
  import SectionCard from "$lib/components/SectionCard.svelte"
  import { fieldErrors } from "$lib/form-errors"
  import { enhance } from "$app/forms"
  import { keepValues } from "$lib/form-enhance"
  import { goto } from "$app/navigation"
  import {
    COMPANY_CODE_HINT,
    COMPANY_CODE_LABELS,
    FIXED_CODES,
    HOUR_TYPE_LABELS,
    LAYOUT_CONFIRMED,
    PAYROLL_PROVIDERS,
    PROVIDER_LABELS,
    type HourType,
  } from "$lib/payroll/export-formats"

  let { data, form } = $props()

  const err = $derived(fieldErrors(form))
  const provider = $derived(data.provider)
  const codeOf = (source: string) => data.codes.find((c) => c.source === source)

  const CODE_HINT: Record<string, string> = {
    adp_run:
      "The earnings code in RUN: Reports > Earnings Codes (for example REG, OVT, VAC).",
    adp_wfn:
      "The hours code in Workforce Now's validation table (for example V for vacation).",
    gusto:
      "The column name in Gusto's import template (for example Regular hours).",
    paychex_flex:
      "The pay component name in Paychex Flex: Company Settings > Pay Items.",
  }
</script>

<PageHead title="Payroll Export Settings" />

<div class="p-4 lg:p-6">
  <PageTitle
    title="Payroll Export Settings"
    items={[
      { label: "Payroll", path: "/payroll/export" },
      { label: "Export Settings", active: true },
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

  <form
    method="POST"
    action="?/save"
    class="mt-4 grid max-w-3xl gap-4"
    use:enhance={keepValues}
  >
    <SectionCard>
      {#snippet heading()}
        <h2 class="text-base font-medium">Provider</h2>
      {/snippet}
      <div class="grid gap-3 sm:grid-cols-2">
        <fieldset class="fieldset">
          <legend class="fieldset-legend">Payroll provider</legend>
          <select
            name="provider"
            class={`select w-full ${err.select("provider")}`}
            aria-invalid={err.aria("provider")}
            onchange={(e) =>
              goto(`?provider=${e.currentTarget.value}`, { keepFocus: true })}
          >
            {#each PAYROLL_PROVIDERS as p (p)}
              <option value={p} selected={p === provider}
                >{PROVIDER_LABELS[p]}</option
              >
            {/each}
          </select>
          {#if data.settings && data.settings.provider !== provider}
            <p class="label text-warning">
              Saving switches the export from {PROVIDER_LABELS[
                data.settings.provider
              ]}.
            </p>
          {/if}
        </fieldset>
        {#if COMPANY_CODE_LABELS[provider]}
          <fieldset class="fieldset">
            <legend class="fieldset-legend"
              >{COMPANY_CODE_LABELS[provider]}</legend
            >
            <input
              name="company_code"
              class={`input w-full ${err.input("company_code")}`}
              aria-invalid={err.aria("company_code")}
              value={data.settings?.provider === provider
                ? (data.settings.company_code ?? "")
                : ""}
            />
            <p class="label">{COMPANY_CODE_HINT[provider]}</p>
          </fieldset>
        {/if}
      </div>
      {#if !LAYOUT_CONFIRMED[provider]}
        <p class="text-base-content/70 mt-2 text-sm">
          {PROVIDER_LABELS[provider]} does not publish its import layout. Check the
          first import.
        </p>
      {/if}
    </SectionCard>

    <SectionCard>
      {#snippet heading()}
        <h2 class="text-base font-medium">
          Codes in {PROVIDER_LABELS[provider]}
        </h2>
      {/snippet}
      <p class="text-base-content/70 text-sm">{CODE_HINT[provider]}</p>
      <div class="overflow-x-auto">
        <table class="table table-sm mt-2">
          <caption class="sr-only">Provider code for each kind of hours</caption
          >
          <thead>
            <tr
              ><th scope="col">Hours</th><th scope="col">Code</th><th
                scope="col">Not exported</th
              ></tr
            >
          </thead>
          <tbody>
            {#each data.sources as s (s.source)}
              {@const fixed = FIXED_CODES[provider]?.[s.source]}
              {@const current = codeOf(s.source)}
              <tr>
                <th scope="row" class="font-normal">
                  {s.policy
                    ? `Time off: ${s.policy.policy_name}`
                    : HOUR_TYPE_LABELS[s.source as HourType]}
                </th>
                <td>
                  {#if fixed}
                    <span class="text-base-content/70"
                      >Own column in the file</span
                    >
                  {:else}
                    <input
                      name={`code:${s.source}`}
                      aria-label={`Code for ${s.policy ? s.policy.policy_name : s.source}`}
                      class={`input input-sm w-48 ${err.input(`code:${s.source}`)}`}
                      aria-invalid={err.aria(`code:${s.source}`)}
                      value={current?.code ?? ""}
                    />
                  {/if}
                </td>
                <td>
                  {#if s.policy}
                    <input
                      type="checkbox"
                      class="checkbox checkbox-sm"
                      name={`skip:${s.source}`}
                      aria-label={`Do not export ${s.policy.policy_name}`}
                      checked={current !== undefined && current.code === null}
                    />
                  {/if}
                </td>
              </tr>
            {/each}
          </tbody>
        </table>
      </div>
      <p class="text-base-content/70 mt-2 text-sm">
        Mark unpaid leave as not exported. A kind of hours with no code and not
        marked stops the export until it has one.
      </p>
    </SectionCard>

    <div>
      <button type="submit" class="btn btn-primary">Save</button>
    </div>
  </form>
</div>
