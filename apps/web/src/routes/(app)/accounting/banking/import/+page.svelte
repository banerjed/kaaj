<script lang="ts">
  import PageTitle from "$lib/components/PageTitle.svelte"
  import PageHead from "$lib/components/PageHead.svelte"
  import StatusBadge from "$lib/components/StatusBadge.svelte"
  import { enhance } from "$app/forms"
  import { keepValues } from "$lib/form-enhance"
  import { fieldErrors } from "$lib/form-errors"
  import { calendarDate, instant, localeForCurrency, money } from "$lib/format"

  let { data, form } = $props()

  const err = $derived(fieldErrors(form))
  const tenantLocale = $derived(data.tenant?.default_locale ?? "en-US")
  const tenantZone = $derived(data.tenant?.default_timezone ?? "UTC")

  type Preview = NonNullable<NonNullable<typeof form>["preview"]>

  /**
   * The last preview stays on screen through a refused import, so the
   * person can see what to fix; a new preview replaces it.
   */
  let preview = $state<Preview | null>(null)
  // The mapping controls are the person's own copy, seeded from each new
  // preview and then edited freely — `$state`, re-seeded by the effect below.
  let delimiter = $state("comma")
  let headerSignature = $state("")
  let columns = $state<string[]>([])
  let dateFormat = $state("")
  let decimal = $state(".")
  let invertSign = $state(false)
  // Kept across previews and a finished import, so the next statement for
  // the same account needs only a new file.
  // svelte-ignore state_referenced_locally
  let accountId = $state(data.selectedAccount)
  let confirmed = $state(false)

  $effect(() => {
    const p = form?.preview
    if (!p) return
    preview = p
    accountId = p.accountId
    confirmed = false
    const m = p.mapping
    if (!m) return
    delimiter = m.delimiter
    headerSignature = m.headerSignature ?? ""
    columns = [...m.columns]
    invertSign = m.invertSign
    decimal = p.decimalChoices.length === 1 ? p.decimalChoices[0] : m.decimal
    dateFormat =
      p.dateFormatChoices.length > 1
        ? (p.dateFormatChoices.find((f) =>
            // Only pre-selects; the preview still asks until the person chooses.
            p.currency === "USD" ? f.startsWith("MM") : f.startsWith("DD"),
          ) ?? p.dateFormatChoices[0])
        : m.dateFormat
  })
  $effect(() => {
    if (form?.imported) preview = null
  })

  const locale = $derived(
    preview
      ? localeForCurrency(data.locations, preview.currency, tenantLocale)
      : tenantLocale,
  )
  const canImport = $derived(
    !!preview &&
      preview.problems.length === 0 &&
      preview.newCount > 0 &&
      (!preview.needsConfirmation || confirmed),
  )
  const delimiterLabel: Record<string, string> = {
    comma: "Comma (,)",
    semicolon: "Semicolon (;)",
    tab: "Tab",
    pipe: "Pipe (|)",
  }
  const columnLabel = (i: number) => preview?.headers?.[i] ?? `Column ${i + 1}`
  const roleLabel: Record<string, string> = {
    ignore: "Ignore",
    date: "Date",
    value_date: "Value date",
    description: "Description",
    memo: "More description",
    reference: "Reference",
    type: "Type",
    amount: "Amount (signed)",
    debit: "Money out",
    credit: "Money in",
    direction: "Debit/Credit",
    balance: "Balance",
    currency: "Currency",
  }
</script>

<PageHead title="Import bank statement" />

<div class="p-4 lg:p-6">
  <PageTitle
    title="Import bank statement"
    items={[
      { label: "Finance & Accounting", path: "/accounting/banking" },
      { label: "Banking", path: "/accounting/banking" },
      { label: "Import statement", active: true },
    ]}
  />

  <p class="text-base-content/70 mt-2 max-w-3xl text-sm">
    Upload a CSV, OFX or QFX file downloaded from your bank. Nothing is imported
    until you have checked the preview, and a statement that overlaps one
    already imported adds only the transactions that are new.
  </p>

  {#if form?.imported}
    <div role="status" class="alert alert-success mt-4">
      <span class="iconify lucide--check size-5"></span>
      <span>
        Imported {form.imported.count}
        {form.imported.count === 1 ? "transaction" : "transactions"} into {form
          .imported.accountName}{form.imported.duplicates > 0
          ? `; ${form.imported.duplicates} already imported were skipped`
          : ""}.
        <a
          class="link"
          href={`/accounting/banking?account=${form.imported.accountId}`}
          >Reconcile them</a
        >
      </span>
    </div>
  {:else if form?.message}
    <div role="alert" class="alert alert-error mt-4">
      <span class="iconify lucide--circle-alert size-5"></span>
      <span>{form.message}</span>
    </div>
  {/if}

  <form
    method="POST"
    action="?/preview"
    enctype="multipart/form-data"
    use:enhance={keepValues}
    class="card bg-base-100 mt-4 shadow-sm"
  >
    <div class="card-body gap-4">
      <div class="grid gap-4 md:grid-cols-2">
        <label class="form-control">
          <span class="label-text mb-1">Bank account</span>
          <select
            name="account"
            required
            aria-invalid={err.aria("account")}
            class={`select w-full ${err.select("account")}`}
            bind:value={accountId}
          >
            <option value="" disabled>Choose an account</option>
            {#each data.accounts as a (a.id)}
              <option value={a.id}>
                {a.account_name} · {a.bank_name} · {a.currency}
              </option>
            {/each}
          </select>
        </label>
        <label class="form-control">
          <span class="label-text mb-1">
            Statement file (CSV, OFX or QFX, up to {data.maxMegabytes} MB)
          </span>
          <input
            type="file"
            name="file"
            required
            accept=".csv,.ofx,.qfx,.txt,text/csv,application/x-ofx"
            aria-invalid={err.aria("file")}
            class={`file-input w-full ${err.has("file") ? "file-input-error" : ""}`}
          />
        </label>
      </div>

      {#if preview?.format === "csv" && preview.mapping}
        <input type="hidden" name="use_mapping" value="on" />
        <input type="hidden" name="column_count" value={preview.columnCount} />
        <input type="hidden" name="header_signature" value={headerSignature} />

        <fieldset class="border-base-200 rounded-box border p-4">
          <legend class="px-1 text-sm font-medium">How to read this file</legend
          >
          <div class="grid gap-4 md:grid-cols-4">
            <label class="form-control">
              <span class="label-text mb-1">Separator</span>
              <select
                name="delimiter"
                class="select select-sm w-full"
                bind:value={delimiter}
              >
                {#each data.delimiters as d (d)}
                  <option value={d}>{delimiterLabel[d]}</option>
                {/each}
              </select>
            </label>
            <label class="form-control">
              <span class="label-text mb-1">Date format</span>
              <select
                name="date_format"
                class="select select-sm w-full"
                bind:value={dateFormat}
              >
                {#each preview.dateFormatChoices.length > 1 ? preview.dateFormatChoices : data.dateFormats as f (f)}
                  <option value={f}>{f}</option>
                {/each}
              </select>
            </label>
            <label class="form-control">
              <span class="label-text mb-1">Decimal mark</span>
              <select
                name="decimal"
                class="select select-sm w-full"
                bind:value={decimal}
              >
                <option value=".">1,234.56</option>
                <option value=",">1.234,56</option>
              </select>
            </label>
            <label class="label cursor-pointer justify-start gap-2 self-end">
              <input
                type="checkbox"
                name="invert_sign"
                class="checkbox checkbox-sm"
                bind:checked={invertSign}
              />
              <span class="label-text">Money out is shown as positive</span>
            </label>
          </div>
          {#if !preview.headers && preview.firstRow}
            <label class="label mt-3 cursor-pointer justify-start gap-2">
              <input
                type="checkbox"
                class="checkbox checkbox-sm"
                checked={headerSignature === preview.firstRow.signature}
                onchange={(e) =>
                  (headerSignature = e.currentTarget.checked
                    ? (preview?.firstRow?.signature ?? "")
                    : "")}
              />
              <span class="label-text">
                Line 1 holds column names ({preview.firstRow.cells.join(", ")})
              </span>
            </label>
          {/if}

          <div class="mt-4 overflow-x-auto">
            <table class="table-sm table">
              <thead>
                <tr>
                  {#each columns as _, i (i)}
                    <th>
                      <select
                        name={`column_${i}`}
                        aria-label={`What ${columnLabel(i)} holds`}
                        class="select select-xs w-36"
                        bind:value={columns[i]}
                      >
                        {#each data.roles as r (r)}
                          <option value={r}>{roleLabel[r]}</option>
                        {/each}
                      </select>
                      <div
                        class="text-base-content/70 mt-1 text-xs font-normal"
                      >
                        {columnLabel(i)}
                      </div>
                    </th>
                  {/each}
                </tr>
              </thead>
              <tbody>
                {#each preview.sample as row, r (r)}
                  <tr>
                    {#each row as c, i (i)}
                      <td class="text-xs">{c}</td>
                    {/each}
                  </tr>
                {/each}
              </tbody>
            </table>
          </div>
        </fieldset>
      {/if}

      {#if preview}
        <section aria-label="Preview" class="flex flex-col gap-3">
          {#if preview.problems.length > 0}
            <div role="alert" class="alert alert-error items-start">
              <span class="iconify lucide--circle-alert size-5"></span>
              <div>
                <p class="font-medium">
                  This file can't be imported yet. Nothing has been written.
                </p>
                <ul class="mt-1 list-disc pl-5 text-sm">
                  {#each preview.problems.slice(0, 20) as p, i (i)}
                    <li>{p.line ? `Line ${p.line}: ` : ""}{p.message}</li>
                  {/each}
                </ul>
                {#if preview.problems.length > 20}
                  <p class="mt-1 text-sm">
                    …and {preview.problems.length - 20} more.
                  </p>
                {/if}
              </div>
            </div>
          {/if}
          {#each preview.warnings as w, i (i)}
            <div role="status" class="alert alert-warning">
              <span class="iconify lucide--triangle-alert size-5"></span>
              <span>{w}</span>
            </div>
          {/each}

          {#if preview.problems.length === 0}
            <div
              class="stats stats-vertical md:stats-horizontal bg-base-100 border-base-200 border"
            >
              <div class="stat">
                <div class="stat-title">Transactions</div>
                <div class="stat-value text-2xl">
                  {preview.transactionCount}
                </div>
                <div class="stat-desc">
                  {preview.newCount} new · {preview.duplicateCount} already imported
                </div>
              </div>
              <div class="stat">
                <div class="stat-title">Money in</div>
                <div class="stat-value text-2xl">
                  {money(preview.totals.moneyIn, preview.currency, locale)}
                </div>
              </div>
              <div class="stat">
                <div class="stat-title">Money out</div>
                <div class="stat-value text-2xl">
                  {money(preview.totals.moneyOut, preview.currency, locale)}
                </div>
              </div>
              <div class="stat">
                <div class="stat-title">Period</div>
                <div class="stat-value text-base">
                  {preview.period
                    ? `${calendarDate(preview.period.from, locale)} – ${calendarDate(preview.period.to, locale)}`
                    : "—"}
                </div>
                <div class="stat-desc">
                  {#if preview.balanceCheck === "passed"}
                    <StatusBadge tone="positive"
                      >Running balance checked</StatusBadge
                    >
                  {:else}
                    <StatusBadge tone="neutral"
                      >No running balance to check</StatusBadge
                    >
                  {/if}
                </div>
              </div>
            </div>

            {#if preview.possibleDuplicateLines.length > 0}
              <div role="status" class="alert alert-warning">
                <span class="iconify lucide--triangle-alert size-5"></span>
                <span>
                  {preview.possibleDuplicateLines.length} line(s) match a transaction
                  already in this account by date and amount (lines
                  {preview.possibleDuplicateLines.slice(0, 10).join(", ")}).
                  They will still be imported — check they are not the same
                  payment entered another way.
                </span>
              </div>
            {/if}

            <div class="overflow-x-auto">
              <table class="table-sm table">
                <caption class="text-base-content/70 text-left text-xs">
                  {preview.rows.length < preview.transactionCount
                    ? `The first ${preview.rows.length} of ${preview.transactionCount}`
                    : "Every transaction"} in {preview.fileName}
                </caption>
                <thead>
                  <tr>
                    <th>Line</th>
                    <th>Date</th>
                    <th>Description</th>
                    <th>Reference</th>
                    <th class="text-right">Amount</th>
                    <th class="text-right">Balance</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {#each preview.rows as t (t.line)}
                    <tr>
                      <td>{t.line}</td>
                      <td>{calendarDate(t.date, locale)}</td>
                      <td>{t.description}</td>
                      <td>{t.reference ?? ""}</td>
                      <td
                        class={`text-right tabular-nums ${t.amount.startsWith("-") ? "" : "text-success"}`}
                      >
                        {money(t.amount, preview.currency, locale)}
                      </td>
                      <td class="text-right tabular-nums">
                        {t.balance === null
                          ? ""
                          : money(t.balance, preview.currency, locale)}
                      </td>
                      <td>
                        {#if t.duplicate}
                          <StatusBadge tone="neutral"
                            >Already imported</StatusBadge
                          >
                        {/if}
                      </td>
                    </tr>
                  {/each}
                </tbody>
              </table>
            </div>

            {#if preview.needsConfirmation}
              <label class="label cursor-pointer justify-start gap-2">
                <input
                  type="checkbox"
                  name="confirmed"
                  aria-invalid={err.aria("confirmed")}
                  class="checkbox checkbox-sm"
                  bind:checked={confirmed}
                />
                <span class="label-text">
                  I've checked the preview: money coming in shows as positive
                  and money going out as negative.
                </span>
              </label>
            {/if}
          {/if}
          <input type="hidden" name="token" value={preview.token} />
        </section>
      {/if}

      <div class="card-actions justify-end">
        <a href="/accounting/banking" class="btn btn-ghost">Cancel</a>
        <button
          type="submit"
          class={`btn ${preview ? "btn-ghost" : "btn-primary"}`}
        >
          {preview ? "Preview again" : "Preview"}
        </button>
        {#if preview}
          <button
            type="submit"
            formaction="?/import"
            class="btn btn-primary"
            disabled={!canImport}
          >
            {#if preview.newCount === 0 && preview.problems.length === 0}
              Nothing new to import
            {:else}
              Import {preview.newCount}
              {preview.newCount === 1 ? "transaction" : "transactions"}
            {/if}
          </button>
        {/if}
      </div>
    </div>
  </form>

  <section class="mt-6">
    <h2 class="text-lg font-medium">Recent imports</h2>
    {#if data.recent.length === 0}
      <p class="text-base-content/70 mt-2 text-sm">
        No statements imported yet.
      </p>
    {:else}
      <div class="mt-2 overflow-x-auto">
        <table class="table-sm table">
          <thead>
            <tr>
              <th>When</th>
              <th>Account</th>
              <th>File</th>
              <th>Period</th>
              <th class="text-right">Imported</th>
              <th class="text-right">Skipped as duplicates</th>
            </tr>
          </thead>
          <tbody>
            {#each data.recent as r (r.id)}
              <tr>
                <td>
                  {instant(r.created_at, {
                    locale: tenantLocale,
                    currency: "USD",
                    timezone: tenantZone,
                    timeFormat: data.tenant?.time_format,
                  })}
                </td>
                <td>{r.account_name}</td>
                <td
                  >{r.file_name}
                  <span class="text-base-content/70 uppercase"
                    >{r.file_format}</span
                  ></td
                >
                <td>
                  {r.period_start
                    ? `${calendarDate(r.period_start, tenantLocale)} – ${calendarDate(r.period_end, tenantLocale)}`
                    : "—"}
                </td>
                <td class="text-right tabular-nums"
                  >{r.transactions_imported}</td
                >
                <td class="text-right tabular-nums">{r.duplicates_skipped}</td>
              </tr>
            {/each}
          </tbody>
        </table>
      </div>
    {/if}
  </section>
</div>
