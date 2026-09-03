<script lang="ts">
  import PageTitle from "$lib/components/PageTitle.svelte"
  import { localeForCurrency, localised, money } from "$lib/format"
  import type { FirmJobTitle } from "$lib/server/firm-profile/firm_job_titles.repo"
  import type { FirmJobLevel } from "$lib/server/firm-profile/firm_job_levels.repo"
  import { fieldErrors } from "$lib/form-errors"
  import { enhance } from "$app/forms"
  import { closeOnSuccess } from "$lib/form-enhance"
  import PageHead from "$lib/components/PageHead.svelte"

  let { data, form } = $props()

  // Which field to put the highlight on. The action names them in
  // `errorFields`; colour alone is not enough, so `aria-invalid` goes with it.
  const err = $derived(fieldErrors(form))

  const locale = $derived(data.tenant?.default_locale ?? "en-US")
  const supportedLocales = $derived(
    data.tenant?.supported_locales ?? [data.tenant?.default_locale ?? "en-US"],
  )
  const currencies = $derived(
    data.tenant?.supported_currencies ?? [
      data.tenant?.default_currency ?? "USD",
    ],
  )

  // Each band reads in the locale of the office that pays it, so INR groups in
  // lakhs and GBP in thousands, on the same row.
  const bandLocale = (currency: string) =>
    localeForCurrency(data.locations, currency, locale)

  // Grouped ONCE, not re-filtered per title. `levelsFor` is called inside the
  // titles loop, so a filter here is a full scan of every level for every
  // title — fine at fixture size, quadratic at a real firm's.
  const levelsByTitle = $derived(
    data.jobLevels.reduce<Map<string, typeof data.jobLevels>>((m, l) => {
      const bucket = m.get(l.job_title_id)
      if (bucket) bucket.push(l)
      else m.set(l.job_title_id, [l])
      return m
    }, new Map()),
  )
  const levelsFor = (titleId: string) => levelsByTitle.get(titleId) ?? []

  let editingTitle = $state<FirmJobTitle | "new" | null>(null)
  const currentTitle = $derived(editingTitle === "new" ? null : editingTitle)

  let editingLevel = $state<{
    level: FirmJobLevel | null
    titleId: string
  } | null>(null)
</script>

<PageHead title="Job Titles" />

<div class="p-4 lg:p-6">
  <PageTitle
    title="Job Titles &amp; Levels"
    items={[
      { label: "Settings", path: "/settings/job-titles" },
      { label: "Job Titles", active: true },
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
      {data.jobTitles.length} titles · {data.jobLevels.length} levels
    </p>
    <button
      class="btn btn-primary btn-sm gap-2"
      onclick={() => (editingTitle = "new")}
    >
      <span class="iconify lucide--plus size-4"></span>
      New Job Title
    </button>
  </div>

  {#if data.jobTitles.length === 0}
    <div class="card bg-base-100 mt-4 shadow">
      <div class="card-body items-center py-16 text-center">
        <span class="iconify lucide--briefcase text-base-content/30 size-10"
        ></span>
        <p class="mt-3 font-medium">No job titles yet</p>
        <p class="text-base-content/70 max-w-md text-sm">
          Job titles carry the pay bands each market is hired against, and are
          what an employee record points at.
        </p>
      </div>
    </div>
  {:else}
    <div class="mt-4 grid gap-4">
      {#each data.jobTitles as title (title.id)}
        <div class="card bg-base-100 shadow">
          <div class="card-body gap-3">
            <div class="flex flex-wrap items-start justify-between gap-2">
              <div>
                <h2 class="text-base font-medium">
                  {localised(title.title_i18n, title.title, locale)}
                </h2>
                <p class="text-base-content/70 mt-0.5 text-sm">
                  {title.employee_count}
                  {title.employee_count === 1 ? "person" : "people"}
                  {#if title.eeoc_category}· {title.eeoc_category}{/if}
                  · {title.is_exempt ? "Exempt" : "Non-exempt"}
                </p>
              </div>
              <div class="flex gap-1">
                <button
                  class="btn btn-ghost btn-sm gap-1"
                  onclick={() =>
                    (editingLevel = { level: null, titleId: title.id })}
                >
                  <span class="iconify lucide--plus size-4"></span>
                  Level
                </button>
                <button
                  class="btn btn-ghost btn-sm btn-square"
                  aria-label={`Edit ${title.title}`}
                  onclick={() => (editingTitle = title)}
                >
                  <span class="iconify lucide--pencil size-4"></span>
                </button>
                <form method="POST" action="?/archiveTitle">
                  <input type="hidden" name="id" value={title.id} />
                  <button
                    class="btn btn-ghost btn-sm btn-square text-error"
                    aria-label={`Deactivate ${title.title}`}
                    title="Deactivate"
                  >
                    <span class="iconify lucide--archive size-4"></span>
                  </button>
                </form>
              </div>
            </div>

            {#if levelsFor(title.id).length === 0}
              <p class="text-base-content/70 text-sm">
                No levels defined. Add one to set pay bands.
              </p>
            {:else}
              <div class="overflow-x-auto">
                <table class="table table-sm">
                  <thead>
                    <tr>
                      <th>Level</th>
                      <!--
                        One column per enabled currency. Each band is what the
                        firm pays in that market, independently set — not a
                        conversion of the others (BR-FP-006).
                      -->
                      {#each currencies as c (c)}
                        <th>{c} band</th>
                      {/each}
                      <th class="w-20"></th>
                    </tr>
                  </thead>
                  <tbody>
                    {#each levelsFor(title.id) as level (level.id)}
                      <tr class="hover:bg-base-200/40">
                        <td class="font-medium">{level.level_name}</td>
                        {#each currencies as c (c)}
                          <td class="text-sm tabular-nums">
                            {#if level.salary_ranges?.[c]}
                              {money(
                                level.salary_ranges[c].min,
                                c,
                                bandLocale(c),
                              )} –
                              {money(
                                level.salary_ranges[c].max,
                                c,
                                bandLocale(c),
                              )}
                            {:else}
                              <span class="text-base-content/70">—</span>
                            {/if}
                          </td>
                        {/each}
                        <td>
                          <div class="flex gap-1">
                            <button
                              class="btn btn-ghost btn-xs btn-square"
                              aria-label={`Edit ${level.level_name}`}
                              onclick={() =>
                                (editingLevel = { level, titleId: title.id })}
                            >
                              <span class="iconify lucide--pencil size-3.5"
                              ></span>
                            </button>
                            <form method="POST" action="?/archiveLevel">
                              <input type="hidden" name="id" value={level.id} />
                              <button
                                class="btn btn-ghost btn-xs btn-square text-error"
                                aria-label={`Archive ${level.level_name}`}
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

{#if editingTitle}
  <div class="modal modal-open" role="dialog" aria-label="Job title">
    <div class="modal-box">
      <h3 class="text-lg font-medium">
        {currentTitle ? "Edit job title" : "New job title"}
      </h3>
      <form
        method="POST"
        action="?/saveTitle"
        class="mt-4 grid gap-4"
        use:enhance={closeOnSuccess(() => (editingTitle = null))}
      >
        {#if currentTitle}
          <input type="hidden" name="id" value={currentTitle.id} />
        {/if}
        {#each supportedLocales as l (l)}
          <input type="hidden" name="supported_locales" value={l} />
        {/each}

        <fieldset class="fieldset">
          <legend class="fieldset-legend">Title</legend>
          <input
            name="title"
            aria-invalid={err.aria("title")}
            class={`input w-full ${err.input("title")}`}
            value={currentTitle?.title ?? ""}
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
                    name={`title_i18n.${code}`}
                    class="input w-full"
                    value={currentTitle?.title_i18n?.[code] ?? ""}
                    placeholder={currentTitle?.title ?? ""}
                    aria-label={`Job title in ${code}`}
                  />
                </label>
              {/each}
            </div>
          </fieldset>
        {/if}

        <fieldset class="fieldset">
          <legend class="fieldset-legend">EEOC category</legend>
          <select
            name="eeoc_category"
            aria-invalid={err.aria("eeoc_category")}
            class={`select w-full ${err.select("eeoc_category")}`}
            value={currentTitle?.eeoc_category ?? ""}
          >
            <option value="">Not specified</option>
            {#each data.eeocCategories as c (c)}
              <option value={c}>{c.replaceAll("_", " ")}</option>
            {/each}
          </select>
        </fieldset>

        <label class="label cursor-pointer justify-start gap-3">
          <input
            type="checkbox"
            name="is_exempt"
            class="checkbox checkbox-sm"
            checked={currentTitle?.is_exempt ?? false}
          />
          <span class="text-sm">Exempt from overtime (FLSA)</span>
        </label>

        <div class="modal-action">
          <button
            type="button"
            class="btn btn-ghost"
            onclick={() => (editingTitle = null)}>Cancel</button
          >
          <button type="submit" class="btn btn-primary">Save</button>
        </div>
      </form>
    </div>
    <button
      class="modal-backdrop"
      aria-label="Close"
      onclick={() => (editingTitle = null)}
    ></button>
  </div>
{/if}

{#if editingLevel}
  <div class="modal modal-open" role="dialog" aria-label="Job level">
    <div class="modal-box max-w-2xl">
      <h3 class="text-lg font-medium">
        {editingLevel.level ? "Edit level" : "New level"}
      </h3>
      <form
        method="POST"
        action="?/saveLevel"
        class="mt-4 grid gap-4"
        use:enhance={closeOnSuccess(() => (editingLevel = null))}
      >
        {#if editingLevel.level}
          <input type="hidden" name="id" value={editingLevel.level.id} />
        {/if}
        <input type="hidden" name="job_title_id" value={editingLevel.titleId} />

        <div class="grid gap-4 sm:grid-cols-2">
          <fieldset class="fieldset">
            <legend class="fieldset-legend">Level name</legend>
            <input
              name="level_name"
              aria-invalid={err.aria("level_name")}
              class={`input w-full ${err.input("level_name")}`}
              value={editingLevel.level?.level_name ?? ""}
              placeholder="L3"
              required
            />
          </fieldset>
          <fieldset class="fieldset">
            <legend class="fieldset-legend">Sort order</legend>
            <input
              name="sort_order"
              aria-invalid={err.aria("sort_order")}
              type="number"
              inputmode="numeric"
              class={`input w-full ${err.input("sort_order")}`}
              value={editingLevel.level?.sort_order ?? 0}
            />
          </fieldset>
        </div>

        <fieldset class="fieldset">
          <legend class="fieldset-legend">Salary bands</legend>
          <p class="label">
            Each currency is set independently — what the firm actually pays in
            that market. Leave a pair blank if you do not hire there.
          </p>
          <div class="grid gap-3">
            {#each currencies as c (c)}
              <div class="grid grid-cols-[3rem_1fr_1fr] items-center gap-2">
                <span class="text-sm font-medium">{c}</span>
                <label class="form-control">
                  <span class="label text-base-content/70 text-xs">Minimum</span
                  >
                  <input
                    name={`range.${c}.min`}
                    inputmode="decimal"
                    class="input w-full tabular-nums"
                    value={editingLevel.level?.salary_ranges?.[c]?.min ?? ""}
                    aria-label={`Minimum salary in ${c}`}
                  />
                </label>
                <label class="form-control">
                  <span class="label text-base-content/70 text-xs">Maximum</span
                  >
                  <input
                    name={`range.${c}.max`}
                    inputmode="decimal"
                    class="input w-full tabular-nums"
                    value={editingLevel.level?.salary_ranges?.[c]?.max ?? ""}
                    aria-label={`Maximum salary in ${c}`}
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
            onclick={() => (editingLevel = null)}>Cancel</button
          >
          <button type="submit" class="btn btn-primary">Save</button>
        </div>
      </form>
    </div>
    <button
      class="modal-backdrop"
      aria-label="Close"
      onclick={() => (editingLevel = null)}
    ></button>
  </div>
{/if}
