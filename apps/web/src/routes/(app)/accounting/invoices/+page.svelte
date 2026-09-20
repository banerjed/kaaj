<script lang="ts">
  import { enhance } from "$app/forms"
  import PageTitle from "$lib/components/PageTitle.svelte"
  import { calendarDate, localeForCurrency, money } from "$lib/format"
  import StatusBadge from "$lib/components/StatusBadge.svelte"
  import { invoiceStatusTone as statusTone } from "$lib/components/status-tone"
  import PageHead from "$lib/components/PageHead.svelte"
  import EmptyState from "$lib/components/EmptyState.svelte"
  import Pagination from "$lib/components/Pagination.svelte"
  import { fieldErrors } from "$lib/form-errors"

  let { data, form } = $props()

  const err = $derived(fieldErrors(form))
  const tenantLocale = $derived(data.tenant?.default_locale ?? "en-US")
  /** An invoice is read in the market it was raised in, never converted. */
  const localeFor = (c: string) =>
    localeForCurrency(data.locations, c, tenantLocale)

  // Built from `data.filters`, not `window.location` — this renders during
  // SSR too, where `window` doesn't exist.
  function pageUrl(page: number): string {
    const params = new URLSearchParams({
      status: data.filters.status,
      overdue: data.filters.overdueOnly ? "1" : "",
    })
    for (const [k, v] of [...params]) if (v === "") params.delete(k)
    params.set("page", String(page))
    return `?${params.toString()}`
  }
</script>

<PageHead title="Invoices" />

<div class="p-4 lg:p-6">
  <PageTitle
    title="Invoices"
    items={[
      { label: "Finance & Accounting", path: "/accounting/invoices" },
      { label: "Invoices", active: true },
    ]}
  />

  {#if form?.reminded}
    <div role="status" class="alert alert-success mt-4">
      <span class="iconify lucide--check size-5"></span>
      <span>
        {#if form.reminded.sent === 0 && form.reminded.skipped.length === 0}
          Nothing to remind — no overdue invoice was selected.
        {:else}
          {#if form.reminded.sent > 0}
            Sent {form.reminded.sent} reminder{form.reminded.sent === 1
              ? ""
              : "s"}.
          {/if}
          {#if form.reminded.skipped.length > 0}
            Skipped {form.reminded.skipped
              .map(
                (s: { invoiceNumber: string; reason: string }) =>
                  `${s.invoiceNumber} (${s.reason})`,
              )
              .join(", ")}.
          {/if}
        {/if}
      </span>
    </div>
  {:else if form?.message}
    <div role="alert" class="alert alert-error mt-4">
      <span class="iconify lucide--circle-alert size-5"></span>
      <span>{form.message}</span>
    </div>
  {/if}

  {#if data.mayWrite}
    <div class="mt-4 flex justify-end">
      <a href="/accounting/invoices/new" class="btn btn-primary btn-sm">
        <span class="iconify lucide--plus size-4"></span>
        New invoice
      </a>
    </div>
  {/if}

  <form method="GET" class="mt-4 flex flex-wrap items-end gap-3">
    <fieldset class="fieldset">
      <legend class="fieldset-legend text-xs">Status</legend>
      <select name="status" class="select" value={data.filters.status}>
        <option value="">Any</option>
        {#each data.statuses as s (s)}
          <option value={s} class="capitalize">{s.replace(/_/g, " ")}</option>
        {/each}
      </select>
    </fieldset>
    <label class="label cursor-pointer gap-2">
      <input
        type="checkbox"
        name="overdue"
        value="1"
        class="checkbox checkbox-sm"
        checked={data.filters.overdueOnly}
      />
      <span class="label-text">Overdue only</span>
    </label>
    <button class="btn btn-primary">Apply</button>
    {#if data.filters.status || data.filters.overdueOnly}
      <a href="/accounting/invoices" class="btn btn-ghost">Clear</a>
    {/if}
  </form>

  {#if data.invoices.length === 0}
    <EmptyState icon="lucide--file-text" message="No invoices match that." />
  {:else}
    <form
      method="POST"
      action="?/sendReminders"
      use:enhance
      class="mt-4 space-y-4"
    >
      <div class="card bg-base-100 shadow">
        <div class="overflow-x-auto">
          <table class="table">
            <thead>
              <tr>
                {#if data.mayWrite}
                  <th></th>
                {/if}
                <th>Invoice</th>
                <th>Customer</th>
                <th>Issued</th>
                <th>Due</th>
                <th class="text-right">Total</th>
                <th class="text-right">Paid</th>
                <th class="text-right">Outstanding</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {#each data.invoices as i (i.id)}
                {@const locale = localeFor(i.currency)}
                <tr class="hover:bg-base-200/40">
                  {#if data.mayWrite}
                    <td>
                      {#if i.is_overdue}
                        <input
                          type="checkbox"
                          name={`invoice_${i.id}`}
                          class="checkbox checkbox-sm"
                        />
                      {/if}
                    </td>
                  {/if}
                  <td class="font-medium">
                    <a class="link" href={`/accounting/invoices/${i.id}`}>
                      {i.invoice_number}
                    </a>
                    <!-- Flags when the stored subtotal drifts from its lines. -->
                    {#if i.line_subtotal !== null && Number(i.line_subtotal) !== Number(i.subtotal)}
                      <span
                        class="badge badge-error badge-sm ms-1"
                        title={`Lines sum to ${i.line_subtotal}`}
                      >
                        ≠ lines
                      </span>
                    {/if}
                    <span class="text-base-content/70 block text-xs">
                      {i.line_count} line{i.line_count === 1 ? "" : "s"}
                    </span>
                  </td>
                  <td class="text-sm">{i.customer_name ?? "—"}</td>
                  <td class="text-sm tabular-nums">
                    {calendarDate(i.invoice_date, locale)}
                  </td>
                  <td class="text-sm tabular-nums">
                    {i.due_date ? calendarDate(i.due_date, locale) : "—"}
                    {#if i.is_overdue}
                      <span class="badge badge-error badge-sm ms-1"
                        >overdue</span
                      >
                    {/if}
                  </td>
                  <td class="text-right text-sm tabular-nums">
                    {money(i.total, i.currency, locale)}
                  </td>
                  <td class="text-right text-sm tabular-nums">
                    {money(i.amount_paid, i.currency, locale)}
                  </td>
                  <td class="text-right text-sm font-medium tabular-nums">
                    {money(i.amount_due, i.currency, locale)}
                  </td>
                  <td>
                    <StatusBadge tone={statusTone(i.status)}>
                      {i.status?.replace(/_/g, " ")}
                    </StatusBadge>
                  </td>
                </tr>
              {/each}
            </tbody>
          </table>
        </div>
        <Pagination
          page={data.page}
          pageSize={data.pageSize}
          total={data.total}
          hrefFor={pageUrl}
        />
      </div>

      {#if data.mayWrite}
        <div class="card bg-base-100 shadow">
          <div class="card-body">
            <h2 class="card-title text-base">Send payment reminders</h2>
            <p class="text-base-content/70 text-xs">
              Only overdue invoices can be reminded. Selection only reaches
              across this page — remind a later page separately. An invoice with
              no email on file, or already reminded today, is skipped rather
              than blocking the rest.
            </p>
            {#if err.has("invoice_ids")}
              <p class="text-error text-sm">Select at least one invoice.</p>
            {/if}
            <div class="mt-2">
              <button type="submit" class="btn btn-primary">
                Send reminders
              </button>
            </div>
          </div>
        </div>
      {/if}
    </form>
  {/if}
</div>
