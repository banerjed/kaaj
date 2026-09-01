<script lang="ts">
  import PageTitle from "$lib/components/PageTitle.svelte"
  import { calendarDate, money } from "$lib/format"

  let { data } = $props()

  /** An invoice is read in the market it was raised in, never converted. */
  const localeFor = (c: string) =>
    c === "GBP" ? "en-GB" : c === "INR" ? "en-IN" : "en-US"

  const statusClass = (s: string | null) =>
    s === "paid"
      ? "badge-success"
      : s === "void"
        ? "badge-error"
        : s === "partial"
          ? "badge-warning"
          : s === "sent" || s === "viewed"
            ? "badge-info"
            : "badge-ghost"
</script>

<svelte:head><title>Invoices · Kaaj</title></svelte:head>

<div class="p-4 lg:p-6">
  <PageTitle
    title="Invoices"
    items={[
      { label: "Finance & Accounting", path: "/accounting/invoices" },
      { label: "Invoices", active: true },
    ]}
  />

  <form method="GET" class="mt-4 flex flex-wrap items-end gap-3">
    <fieldset class="fieldset">
      <legend class="fieldset-legend text-xs">Status</legend>
      <select name="status" class="select" value={data.filters.status}>
        <option value="">Any</option>
        {#each data.statuses as s (s)}
          <option value={s} class="capitalize">{s}</option>
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
    <div class="card bg-base-100 mt-4 shadow">
      <div class="card-body items-center py-10 text-center">
        <span class="iconify lucide--file-text text-base-content/30 size-8"
        ></span>
        <p class="text-base-content/70 text-sm">No invoices match that.</p>
      </div>
    </div>
  {:else}
    <div class="card bg-base-100 mt-4 shadow">
      <div class="overflow-x-auto">
        <table class="table">
          <thead>
            <tr>
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
                <td class="font-medium">
                  <a class="link" href={`/accounting/invoices/${i.id}`}>
                    {i.invoice_number}
                  </a>
                  <!-- Shown only when the stored subtotal has drifted from the
                       lines behind it. A total nobody recomputes is a total
                       that can quietly stop matching its own invoice. -->
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
                    <span class="badge badge-error badge-sm ms-1">overdue</span>
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
                  <span
                    class={`badge badge-sm capitalize ${statusClass(i.status)}`}
                  >
                    {i.status}
                  </span>
                </td>
              </tr>
            {/each}
          </tbody>
        </table>
      </div>
    </div>
  {/if}
</div>
