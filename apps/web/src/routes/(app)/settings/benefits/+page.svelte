<script lang="ts">
  import PageTitle from "$lib/components/PageTitle.svelte"
  import { localeForCurrency, localised, money } from "$lib/format"
  import type { BenefitsPackage } from "$lib/server/firm-profile/firm_benefits_packages.repo"
  import type { BenefitItem } from "$lib/server/firm-profile/firm_benefit_items.repo"
  import { fieldErrors } from "$lib/form-errors"
  import { enhance } from "$app/forms"
  import { closeOnSuccess } from "$lib/form-enhance"
  import PageHead from "$lib/components/PageHead.svelte"

  let { data, form } = $props()

  const err = $derived(fieldErrors(form))

  const locale = $derived(data.tenant?.default_locale ?? "en-US")
  const supportedLocales = $derived(data.tenant?.supported_locales ?? [locale])
  const currencies = $derived(
    data.tenant?.supported_currencies ?? [
      data.tenant?.default_currency ?? "USD",
    ],
  )

  // Each market's cost reads in that market's locale, as everywhere else (L24).
  const costLocale = (currency: string) =>
    localeForCurrency(data.locations, currency, locale)

  // Grouped once into a Map so itemsFor() in the loop below is O(1), not O(n·m).
  const itemsByPackage = $derived(
    data.items.reduce<Map<string, typeof data.items>>((m, i) => {
      const bucket = m.get(i.benefits_package_id)
      if (bucket) bucket.push(i)
      else m.set(i.benefits_package_id, [i])
      return m
    }, new Map()),
  )
  const itemsFor = (packageId: string) => itemsByPackage.get(packageId) ?? []

  let editingPackage = $state<BenefitsPackage | "new" | null>(null)
  const currentPackage = $derived(
    editingPackage === "new" ? null : editingPackage,
  )

  let editingItem = $state<{
    item: BenefitItem | null
    packageId: string
  } | null>(null)

  /** Employer + employee total; summed in SQL, not JS — money is a string here. */
  const totalCost = (item: BenefitItem, currency: string) =>
    item.total_by_currency?.[currency] ?? null
</script>

<PageHead title="Benefits" />

<div class="p-4 lg:p-6">
  <PageTitle
    title="Benefits"
    items={[
      { label: "Settings", path: "/settings/benefits" },
      { label: "Benefits", active: true },
    ]}
  />

  {#if form?.saved || form?.archived}
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

  <div class="mt-4 flex items-center justify-between gap-3">
    <p class="text-base-content/70 text-sm">
      {data.packages.length}
      {data.packages.length === 1 ? "package" : "packages"} · {data.items
        .length}
      benefits
    </p>
    <button
      class="btn btn-primary btn-sm gap-2"
      onclick={() => (editingPackage = "new")}
    >
      <span class="iconify lucide--plus size-4"></span>
      New Package
    </button>
  </div>

  {#if data.packages.length === 0}
    <div class="card bg-base-100 mt-4 shadow">
      <div class="card-body items-center py-16 text-center">
        <span class="iconify lucide--heart-pulse text-base-content/30 size-10"
        ></span>
        <p class="mt-3 font-medium">No benefits packages yet</p>
        <p class="text-base-content/70 max-w-md text-sm">
          A package bundles what a group of people is enrolled in — health,
          retirement, commuter. Costs are held per currency, because the same
          benefit is priced differently in each market.
        </p>
      </div>
    </div>
  {:else}
    <div class="mt-4 grid gap-4">
      {#each data.packages as pkg (pkg.id)}
        <div class="card bg-base-100 shadow">
          <div class="card-body gap-3">
            <div class="flex flex-wrap items-start justify-between gap-2">
              <div>
                <h2 class="text-base font-medium">
                  {localised(pkg.name_i18n, pkg.name, locale)}
                </h2>
                {#if pkg.description}
                  <p class="text-base-content/70 mt-0.5 text-sm">
                    {pkg.description}
                  </p>
                {/if}
              </div>
              <div class="flex gap-1">
                <button
                  class="btn btn-ghost btn-sm gap-1"
                  onclick={() =>
                    (editingItem = { item: null, packageId: pkg.id })}
                >
                  <span class="iconify lucide--plus size-4"></span>
                  Benefit
                </button>
                <button
                  class="btn btn-ghost btn-sm btn-square"
                  aria-label={`Edit ${pkg.name}`}
                  onclick={() => (editingPackage = pkg)}
                >
                  <span class="iconify lucide--pencil size-4"></span>
                </button>
                <form method="POST" action="?/archivePackage">
                  <input type="hidden" name="id" value={pkg.id} />
                  <button
                    class="btn btn-ghost btn-sm btn-square text-error"
                    aria-label={`Deactivate ${pkg.name}`}
                  >
                    <span class="iconify lucide--archive size-4"></span>
                  </button>
                </form>
              </div>
            </div>

            {#if itemsFor(pkg.id).length === 0}
              <p class="text-base-content/70 text-sm">
                Nothing in this package yet.
              </p>
            {:else}
              <div class="overflow-x-auto">
                <table class="table table-sm">
                  <thead>
                    <tr>
                      <th>Benefit</th>
                      <th>Type</th>
                      <th>Carrier</th>
                      {#each currencies as c (c)}
                        <th class="text-right">{c} / month</th>
                      {/each}
                      <th class="w-20"></th>
                    </tr>
                  </thead>
                  <tbody>
                    {#each itemsFor(pkg.id) as item (item.id)}
                      <tr class="hover:bg-base-200/40">
                        <td class="font-medium">
                          {localised(
                            item.benefit_name_i18n,
                            item.benefit_name,
                            locale,
                          )}
                        </td>
                        <td class="text-sm capitalize">{item.benefit_type}</td>
                        <td class="text-sm">
                          {item.carrier_name ?? "—"}
                          {#if item.carrier_varies_by_location}
                            <span class="badge badge-sm ms-1">varies</span>
                          {/if}
                        </td>
                        {#each currencies as c (c)}
                          <td class="text-right text-sm tabular-nums">
                            {#if totalCost(item, c) !== null}
                              {money(totalCost(item, c), c, costLocale(c))}
                              <span class="text-base-content/70 block text-xs">
                                staff {money(
                                  item.costs_by_currency?.[c]?.employee,
                                  c,
                                  costLocale(c),
                                )}
                              </span>
                            {:else}
                              <span class="text-base-content/70">—</span>
                            {/if}
                          </td>
                        {/each}
                        <td>
                          <div class="flex gap-1">
                            <button
                              class="btn btn-ghost btn-xs btn-square"
                              aria-label={`Edit ${item.benefit_name}`}
                              onclick={() =>
                                (editingItem = { item, packageId: pkg.id })}
                            >
                              <span class="iconify lucide--pencil size-3.5"
                              ></span>
                            </button>
                            <form method="POST" action="?/archiveItem">
                              <input type="hidden" name="id" value={item.id} />
                              <button
                                class="btn btn-ghost btn-xs btn-square text-error"
                                aria-label={`Delete ${item.benefit_name}`}
                              >
                                <span class="iconify lucide--trash-2 size-3.5"
                                ></span>
                              </button>
                            </form>
                          </div>
                        </td>
                      </tr>
                    {/each}
                  </tbody>
                </table>
              </div>
            {/if}
          </div>
        </div>
      {/each}
    </div>
  {/if}
</div>

{#if editingPackage}
  <div class="modal modal-open" role="dialog" aria-label="Benefits package">
    <div class="modal-box">
      <h3 class="text-lg font-medium">
        {currentPackage ? "Edit package" : "New package"}
      </h3>
      <form
        method="POST"
        action="?/savePackage"
        class="mt-4 grid gap-4"
        use:enhance={closeOnSuccess(() => (editingPackage = null))}
      >
        {#if currentPackage}
          <input type="hidden" name="id" value={currentPackage.id} />
        {/if}
        {#each supportedLocales as l (l)}
          <input type="hidden" name="supported_locales" value={l} />
        {/each}

        <fieldset class="fieldset">
          <legend class="fieldset-legend">Package name</legend>
          <input
            name="name"
            aria-invalid={err.aria("name")}
            class={`input w-full ${err.input("name")}`}
            value={currentPackage?.name ?? ""}
            placeholder="Standard — full time"
            required
          />
        </fieldset>

        {#if supportedLocales.length > 1}
          <fieldset class="fieldset">
            <legend class="fieldset-legend">Translations</legend>
            <div class="grid gap-2 sm:grid-cols-2">
              {#each supportedLocales as code (code)}
                <label class="form-control">
                  <span class="label text-base-content/70 text-xs">{code}</span>
                  <input
                    name={`name_i18n.${code}`}
                    class="input w-full"
                    value={currentPackage?.name_i18n?.[code] ?? ""}
                    placeholder={currentPackage?.name ?? ""}
                    aria-label={`Package name in ${code}`}
                  />
                </label>
              {/each}
            </div>
          </fieldset>
        {/if}

        <fieldset class="fieldset">
          <legend class="fieldset-legend">Description</legend>
          <textarea
            name="description"
            aria-invalid={err.aria("description")}
            class={`textarea w-full ${err.textarea("description")}`}
            rows="2"
            value={currentPackage?.description ?? ""}
          ></textarea>
        </fieldset>

        <div class="modal-action">
          <button
            type="button"
            class="btn btn-ghost"
            onclick={() => (editingPackage = null)}>Cancel</button
          >
          <button type="submit" class="btn btn-primary">Save</button>
        </div>
      </form>
    </div>
    <button
      class="modal-backdrop"
      aria-label="Close"
      onclick={() => (editingPackage = null)}
    ></button>
  </div>
{/if}

{#if editingItem}
  <div class="modal modal-open" role="dialog" aria-label="Benefit">
    <div class="modal-box max-w-2xl">
      <h3 class="text-lg font-medium">
        {editingItem.item ? "Edit benefit" : "New benefit"}
      </h3>
      <form
        method="POST"
        action="?/saveItem"
        class="mt-4 grid gap-4"
        use:enhance={closeOnSuccess(() => (editingItem = null))}
      >
        {#if editingItem.item}
          <input type="hidden" name="id" value={editingItem.item.id} />
        {/if}
        <input
          type="hidden"
          name="benefits_package_id"
          value={editingItem.packageId}
        />

        <div class="grid gap-4 sm:grid-cols-2">
          <fieldset class="fieldset">
            <legend class="fieldset-legend">Name</legend>
            <input
              name="benefit_name"
              aria-invalid={err.aria("benefit_name")}
              class={`input w-full ${err.input("benefit_name")}`}
              value={editingItem.item?.benefit_name ?? ""}
              required
            />
          </fieldset>
          <fieldset class="fieldset">
            <legend class="fieldset-legend">Type</legend>
            <select
              name="benefit_type"
              aria-invalid={err.aria("benefit_type")}
              class={`select w-full ${err.select("benefit_type")}`}
              value={editingItem.item?.benefit_type ?? "health"}
            >
              {#each data.benefitTypes as t (t)}
                <option value={t}>{t}</option>
              {/each}
            </select>
          </fieldset>
        </div>

        <fieldset class="fieldset">
          <legend class="fieldset-legend">Carrier</legend>
          <input
            name="carrier_name"
            aria-invalid={err.aria("carrier_name")}
            class={`input w-full ${err.input("carrier_name")}`}
            value={editingItem.item?.carrier_name ?? ""}
          />
          <label class="label mt-2 cursor-pointer justify-start gap-3">
            <input
              type="checkbox"
              name="carrier_varies_by_location"
              class="checkbox checkbox-sm"
              checked={editingItem.item?.carrier_varies_by_location ?? false}
            />
            <span class="text-sm">Carrier differs by office</span>
          </label>
        </fieldset>

        <fieldset class="fieldset">
          <legend class="fieldset-legend">Monthly cost</legend>
          <p class="label">
            Set independently per market — the same cover is priced differently
            in each country. Leave a pair blank where it is not offered.
          </p>
          <div class="grid gap-3">
            {#each currencies as c (c)}
              <div class="grid grid-cols-[3rem_1fr_1fr] items-center gap-2">
                <span class="text-sm font-medium">{c}</span>
                <label class="form-control">
                  <span class="label text-base-content/70 text-xs"
                    >Employee pays</span
                  >
                  <input
                    name={`cost.${c}.employee`}
                    inputmode="decimal"
                    class="input w-full tabular-nums"
                    value={editingItem.item?.costs_by_currency?.[c]?.employee ??
                      ""}
                    aria-label={`Employee cost in ${c}`}
                  />
                </label>
                <label class="form-control">
                  <span class="label text-base-content/70 text-xs"
                    >Employer pays</span
                  >
                  <input
                    name={`cost.${c}.employer`}
                    inputmode="decimal"
                    class="input w-full tabular-nums"
                    value={editingItem.item?.costs_by_currency?.[c]?.employer ??
                      ""}
                    aria-label={`Employer cost in ${c}`}
                  />
                </label>
              </div>
            {/each}
          </div>
        </fieldset>

        <div class="modal-action">
          <button
            type="button"
            class="btn btn-ghost"
            onclick={() => (editingItem = null)}>Cancel</button
          >
          <button type="submit" class="btn btn-primary">Save</button>
        </div>
      </form>
    </div>
    <button
      class="modal-backdrop"
      aria-label="Close"
      onclick={() => (editingItem = null)}
    ></button>
  </div>
{/if}
